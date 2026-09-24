"""Read-only, metadata-only edge configuration backup retention *proposal*.

No unlink, rename, file-body read, database access, service or remote commands.
The three host adapters use basename + '.' + ISO UTC with punctuation replaced
by '_' + '.bak' (Xray: defaultBackupRef; Hysteria2: defaultBackupRef; Mihomo:
defaultBackupRef). Their backupDir is operator wiring, not a discovered protocol.

Only the root layer and explicitly reviewed direct protocol directories are
scanned. An unselected/nested directory makes coverage incomplete. Two streaming
passes retain at most N metadata keys per selected directory/basename; a metadata
fingerprint and directory stability checks reject drift. These are not an atomic
snapshot or an application-reference check. Even a complete result is never a
deletion manifest or approval. Age alone does not establish cleanup eligibility.
"""
import argparse
import datetime as dt
import hashlib
import heapq
import json
import math
import os
import re
import stat
import sys
import time

PRODUCTION_ROOT = '/var/backups/gccgw-edge'
ALLOWED_NAMES = frozenset(('config.json', 'config.yaml', 'config.yml'))
UTC = dt.timezone.utc
EPOCH = dt.datetime(1970, 1, 1, tzinfo=UTC)
STAMP = re.compile(r'(config\.json|config\.yaml|config\.yml)\.(\d{4})_(\d{2})_(\d{2})T(\d{2})_(\d{2})_(\d{2})_(\d{3})Z\.bak\Z', re.ASCII)
COMPONENT = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\Z', re.ASCII)
MTIME_TOLERANCE_SECONDS = 300


class PlanError(ValueError):
    """Static, non-sensitive input refusal code."""


def _micros(value):
    delta = value - EPOCH
    return (delta.days * 86400 + delta.seconds) * 1000000 + delta.microseconds


def _opaque(value):
    return hashlib.sha256(value.encode('utf-8', 'surrogateescape')).hexdigest()


def _component(value):
    return isinstance(value, str) and COMPONENT.fullmatch(value) and '..' not in value


def _stat_key(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_uid,
            info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns,
            getattr(info, 'st_blocks', 0))


def open_directory(path):
    """Anchor each component without following any ancestor symlink."""
    if not path.startswith('/') or any(p in ('.', '..') for p in path.split('/')):
        raise PlanError('unsafe_directory')
    if not hasattr(os, 'O_DIRECTORY') or not hasattr(os, 'O_NOFOLLOW'):
        raise PlanError('posix_fd_traversal_required')
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open('/', flags)
    try:
        for part in path.split('/'):
            if part:
                child = os.open(part, flags, dir_fd=fd)
                os.close(fd)
                fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def _scan(root_fd, selected, budget):
    """Stream (relative components, lstat) without opening regular files."""
    selected_seen = set()
    device = os.fstat(root_fd).st_dev

    def visit(parent_fd, parts):
        before = _stat_key(os.fstat(parent_fd))
        # A fresh directory description avoids sharing a readdir offset between
        # passes. Opening '.' relative to the anchored fd cannot follow a link.
        scan_fd = os.open('.', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
        try:
            with os.scandir(scan_fd) as entries:
                for child in entries:
                    if budget['entries'] >= budget['max_entries'] or time.monotonic() >= budget['deadline']:
                        budget['limitations'].add('scan_budget_exhausted')
                        return
                    budget['entries'] += 1
                    try:
                        info = os.stat(child.name, dir_fd=parent_fd, follow_symlinks=False)
                        rel = parts + (child.name,)
                        yield rel, info
                        wanted = not parts and child.name in selected
                        if wanted:
                            selected_seen.add(child.name)
                        if stat.S_ISDIR(info.st_mode):
                            if not wanted:
                                budget['limitations'].add('unselected_or_nested_directory')
                                continue
                            if info.st_dev != device:
                                budget['limitations'].add('cross_device_directory')
                                continue
                            fd = os.open(child.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
                            try:
                                if (info.st_dev, info.st_ino) != (os.fstat(fd).st_dev, os.fstat(fd).st_ino):
                                    budget['limitations'].add('directory_changed')
                                else:
                                    yield from visit(fd, rel)
                            finally:
                                os.close(fd)
                        elif wanted:
                            budget['limitations'].add('selected_directory_unavailable')
                    except OSError:
                        budget['limitations'].add('entry_metadata_unavailable')
        finally:
            os.close(scan_fd)
            if before != _stat_key(os.fstat(parent_fd)):
                budget['limitations'].add('directory_changed')

    try:
        yield from visit(root_fd, ())
    except OSError:
        budget['limitations'].add('directory_metadata_unavailable')
    if selected_seen != set(selected):
        budget['limitations'].add('selected_directory_unavailable')


def _classify(rel, info, allowed, now_us):
    if stat.S_ISDIR(info.st_mode):
        return None, None
    if not stat.S_ISREG(info.st_mode):
        return 'non_regular_file', None
    if info.st_nlink != 1:
        return 'hardlinked_file', None
    match = STAMP.fullmatch(rel[-1])
    if not match or match[1] not in allowed:
        return 'unknown_filename', None
    try:
        date = dt.datetime(*(int(match[i]) for i in range(2, 8)),
                           microsecond=int(match[8]) * 1000, tzinfo=UTC)
    except ValueError:
        return 'invalid_filename_date', None
    value = _micros(date)
    mtime = info.st_mtime_ns // 1000
    if value > now_us or mtime > now_us:
        return 'future_timestamp', None
    if abs(value - mtime) > MTIME_TOLERANCE_SECONDS * 1000000:
        return 'filename_mtime_mismatch', None
    return 'recognized', (('/'.join(rel[:-1]), match[1]), (value, _opaque('/'.join(rel))))


def _bucket():
    return {'count': 0, 'logicalBytes': 0, 'allocatedBytes': 0}


def _add(bucket, info):
    bucket['count'] += 1
    bucket['logicalBytes'] += info.st_size
    bucket['allocatedBytes'] += getattr(info, 'st_blocks', 0) * 512


def _inputs(root, allowed_names, keep_latest, keep_days, now, reviewed_holds, protocol_dirs,
            max_entries, max_seconds, sample_limit):
    if not isinstance(root, str) or root != os.path.normpath(root) or not root.startswith('/'):
        raise PlanError('unsafe_root')
    if not isinstance(protocol_dirs, (tuple, list)) or len(protocol_dirs) > 32 or any(not _component(p) for p in protocol_dirs) or len(set(protocol_dirs)) != len(protocol_dirs):
        raise PlanError('invalid_reviewed_protocol_directories')
    if root != PRODUCTION_ROOT and root not in {PRODUCTION_ROOT + '/' + p for p in protocol_dirs}:
        raise PlanError('root_outside_reviewed_scope')
    if not isinstance(allowed_names, (tuple, list)) or not allowed_names or not set(allowed_names) <= ALLOWED_NAMES:
        raise PlanError('invalid_explicit_basename_allowlist')
    if type(keep_latest) is not int or not 1 <= keep_latest <= 1000 or type(keep_days) is not int or not 1 <= keep_days <= 36500:
        raise PlanError('invalid_retention_policy')
    if not isinstance(now, dt.datetime) or now.tzinfo is None or now.utcoffset() != dt.timedelta(0):
        raise PlanError('explicit_utc_time_required')
    if not isinstance(reviewed_holds, (tuple, list)) or len(reviewed_holds) > 1000:
        raise PlanError('explicit_reviewed_holds_required')
    for hold in reviewed_holds:
        if not isinstance(hold, str) or not hold or len(hold) > 512 or (hold != '.' and (hold.startswith('/') or '\\' in hold or any(p in ('', '.', '..') for p in hold.split('/')))):
            raise PlanError('invalid_reviewed_hold')
    if type(max_entries) is not int or not 1 <= max_entries <= 10000000 or type(max_seconds) not in (int, float) or not math.isfinite(max_seconds) or not 0 < max_seconds <= 600:
        raise PlanError('invalid_scan_budget')
    if type(sample_limit) is not int or not 0 <= sample_limit <= 100:
        raise PlanError('invalid_sample_limit')


def plan_retention(root, *, allowed_names, keep_latest, keep_days, now, reviewed_holds,
                   protocol_dirs=(), max_entries=2000000, max_seconds=120, sample_limit=10):
    """Propose only. reviewed_holds=() is the explicit empty-hold declaration.

    Hold paths are root-relative exact files/directories ('.' holds the whole
    scope), never read as files. The caller must obtain the list through operator
    review. The API cannot infer application references from backup age/metadata.
    max_entries is per pass; max_seconds covers both passes together.
    """
    _inputs(root, allowed_names, keep_latest, keep_days, now, reviewed_holds, protocol_dirs,
            max_entries, max_seconds, sample_limit)
    deadline = time.monotonic() + max_seconds
    now_us = _micros(now)
    cutoff = now_us - keep_days * 86400 * 1000000
    selected = tuple(protocol_dirs) if root == PRODUCTION_ROOT else ()
    holds = set(reviewed_holds)
    holds_seen = {'.'} if '.' in holds else set()
    limits = set()
    heaps = {}
    first_fingerprint = 0
    second_fingerprint = 0
    mask = (1 << 256) - 1
    summary = {'observedEntries': 0, 'regularFiles': 0, 'regularLogicalBytes': 0,
               'protected': _bucket(), 'excluded': _bucket(), 'candidateNotApproved': None,
               'excludedReasons': {}}
    samples = []
    candidate = _bucket()
    protected = _bucket()
    root_fd = None
    try:
        root_fd = open_directory(root)
        root_identity = _stat_key(os.fstat(root_fd))
        first = {'entries': 0, 'max_entries': max_entries, 'deadline': deadline, 'limitations': limits}
        for rel, info in _scan(root_fd, selected, first):
            path = '/'.join(rel)
            if path in holds:
                holds_seen.add(path)
            row_hash = int(_opaque(json.dumps([rel, _stat_key(info)], separators=(',', ':'))), 16)
            first_fingerprint = (first_fingerprint + row_hash) & mask
            summary['observedEntries'] += 1
            if stat.S_ISREG(info.st_mode):
                summary['regularFiles'] += 1
                summary['regularLogicalBytes'] += info.st_size
            reason, value = _classify(rel, info, allowed_names, now_us)
            if reason == 'recognized':
                group, rank = value
                heap = heaps.setdefault(group, [])
                if len(heap) < keep_latest:
                    heapq.heappush(heap, rank)
                elif rank > heap[0]:
                    heapq.heapreplace(heap, rank)
            elif reason:
                _add(summary['excluded'], info)
                summary['excludedReasons'][reason] = summary['excludedReasons'].get(reason, 0) + 1
        if holds_seen != holds:
            limits.add('reviewed_hold_not_observed')
        if not limits:
            second = {'entries': 0, 'max_entries': max_entries, 'deadline': deadline, 'limitations': limits}
            for rel, info in _scan(root_fd, selected, second):
                second_fingerprint = (second_fingerprint + int(_opaque(json.dumps([rel, _stat_key(info)], separators=(',', ':'))), 16)) & mask
                reason, value = _classify(rel, info, allowed_names, now_us)
                if reason != 'recognized':
                    continue
                group, rank = value
                held = '.' in holds or any('/'.join(rel[:i]) in holds for i in range(1, len(rel) + 1))
                newest = group in heaps and rank >= heaps[group][0]
                if held or rank[0] >= cutoff or newest:
                    _add(protected, info)
                else:
                    _add(candidate, info)
                    if len(samples) < sample_limit:
                        samples.append({'pathId': rank[1], 'groupId': _opaque('/'.join(group)),
                                        'basename': group[1], 'sizeBytes': info.st_size,
                                        'reason': 'older_than_window_and_outside_latest_n'})
            if first_fingerprint != second_fingerprint or first['entries'] != second['entries']:
                limits.add('metadata_changed_between_passes')
        if root_identity != _stat_key(os.fstat(root_fd)):
            limits.add('root_directory_changed')
        final_fd = open_directory(root)
        try:
            if root_identity != _stat_key(os.fstat(final_fd)):
                limits.add('root_directory_changed')
        finally:
            os.close(final_fd)
    except OSError:
        limits.add('root_or_metadata_unavailable')
    finally:
        if root_fd is not None:
            os.close(root_fd)
    # The final metadata syscall can itself cross the budget. Do not turn an
    # over-budget final entry/readback into a complete, apparently usable plan.
    if time.monotonic() >= deadline:
        limits.add('scan_budget_exhausted')
    complete = not limits
    summary['protected'] = protected if complete else None
    summary['candidateNotApproved'] = candidate if complete else None
    return {'schemaVersion': 1, 'state': 'candidate-not-approved', 'complete': complete,
            'deletionApproved': False, 'filesWritten': False, 'fileBodiesRead': False,
            'rootId': _opaque(root), 'nowUtc': now.isoformat(),
            'policy': {'keepLatestPerDirectoryAndBasename': keep_latest, 'keepDays': keep_days,
                       'protectExactAgeBoundary': True, 'mtimeToleranceSeconds': MTIME_TOLERANCE_SECONDS,
                       'allowedBasenames': sorted(set(allowed_names)), 'reviewedHoldCount': len(holds),
                       'reviewedProtocolDirectoryCount': len(protocol_dirs)},
            'budget': {'maxEntriesPerPass': max_entries, 'maxSecondsBothPasses': max_seconds},
            'retentionIndexEntries': sum(len(h) for h in heaps.values()),
            'summary': summary, 'candidateSamples': samples if complete else [],
            'samplePurpose': 'hashed_preview_only_not_paths_or_an_unlink_manifest',
            'limitations': sorted(limits),
            'requiredBeforeAnyDeletion': ['operator_reference_and_recovery_hold_review',
                'application_source_and_runtime_reference_review', 'fresh_complete_metadata_inventory',
                'separate_exact_production_approval_and_deletion_implementation'],
            'snapshotGuarantee': 'metadata_stability_checked_not_atomic'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True)
    parser.add_argument('--allow-name', action='append', required=True, choices=sorted(ALLOWED_NAMES))
    parser.add_argument('--protocol-dir', action='append', default=[])
    parser.add_argument('--keep-latest', type=int, required=True)
    parser.add_argument('--keep-days', type=int, required=True)
    review = parser.add_mutually_exclusive_group(required=True)
    review.add_argument('--reviewed-hold', action='append')
    review.add_argument('--no-holds-reviewed', action='store_true')
    parser.add_argument('--max-entries', type=int, default=2000000)
    parser.add_argument('--max-seconds', type=float, default=120)
    parser.add_argument('--sample-limit', type=int, default=10)
    args = parser.parse_args(argv)
    try:
        result = plan_retention(args.root, allowed_names=args.allow_name, keep_latest=args.keep_latest,
            keep_days=args.keep_days, now=dt.datetime.now(UTC), reviewed_holds=args.reviewed_hold or (),
            protocol_dirs=args.protocol_dir, max_entries=args.max_entries,
            max_seconds=args.max_seconds, sample_limit=args.sample_limit)
    except (PlanError, OSError):
        print(json.dumps({'state': 'plan-refused', 'complete': False, 'deletionApproved': False,
                          'error': 'invalid_input_or_unavailable_safe_traversal'}))
        return 2
    print(json.dumps(result, separators=(',', ':')))
    return 0 if result['complete'] else 2


if __name__ == '__main__':
    sys.exit(main())
