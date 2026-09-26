"""Exact metadata manifest, not deletion authority. Stdlib; no backup bodies.

Only explicitly selected fixed protocol directories are scanned. Root files and
unselected directories are protected OUTSIDE this scope, not claimed inventoried.
Each scan uses anchored directory descriptors and two complete metadata passes.
The first pass stores only counters/fingerprints and <=7 directory identities;
the second stores one entry list, or no entries in fingerprint mode. A conservative
resident-memory estimate limits list growth; it is not an OS-enforced RSS quota.
Use one protocol per manifest on small hosts. Full manifests contain exact private
paths: export only to private local artifacts, never console/PR/ordinary logs.
"""
import argparse
import datetime as dt
import hashlib
import heapq
import json
import math
import os
import posixpath
import re
import stat
import sys
import time

PRODUCTION_ROOT = '/var/backups/gccgw-edge'
PROTOCOL_DIRS = ('xray', 'mihomo', 'hysteria', 'hysteria2', 'xray-vless-reality', 'mihomo-tuic')
ALLOWED_NAMES = ('config.json', 'config.yaml', 'config.yml')
METADATA_KEYS = ('dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs', 'blocks')
POLICY = {'keepLatest': 20, 'keepDays': 30, 'mtimeToleranceSeconds': 300}
MAX_ENTRIES = 2000000
MAX_BYTES = 512 * 1024 * 1024
MAX_MEMORY_BYTES = 384 * 1024 * 1024
MAX_SECONDS = 120
UTC = dt.timezone.utc
EPOCH = dt.datetime(1970, 1, 1, tzinfo=UTC)
STAMP = re.compile(r'(config\.json|config\.yaml|config\.yml)\.(\d{4})_(\d{2})_(\d{2})T(\d{2})_(\d{2})_(\d{2})_(\d{3})Z\.bak\Z', re.ASCII)
SHA = re.compile(r'[0-9a-f]{64}\Z', re.ASCII)
MASK = (1 << 256) - 1
LIMITATION = 'root_files_and_unselected_directories_protected_out_of_scope'
ENCODER = json.JSONEncoder(sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)


class ManifestError(ValueError):
    """Static code only: never embeds paths, contents, or user inputs."""


def canonical_bytes(value):
    """For individual rows/small contracts; use iterencode for entire manifests."""
    return ENCODER.encode(value).encode('utf8')


def manifest_digest(document):
    view = {key: value for key, value in document.items() if key != 'digest'}
    digest = hashlib.sha256()
    for piece in ENCODER.iterencode(view):
        digest.update(piece.encode('utf8'))
    return digest.hexdigest()


def epoch_ns(value):
    delta = value - EPOCH
    return ((delta.days * 86400 + delta.seconds) * 1000000 + delta.microseconds) * 1000


def _date(value):
    if not isinstance(value, dt.datetime) or value.tzinfo is None or value.utcoffset() != dt.timedelta(0):
        raise ManifestError('utc_observed_at_required')
    return value.isoformat().replace('+00:00', 'Z')


def _metadata(info):
    return dict(zip(METADATA_KEYS, (info.st_dev, info.st_ino, info.st_mode, info.st_nlink,
        info.st_uid, info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_blocks)))


metadata_from_stat = _metadata


def _row_hash(row):
    # Disposition/reasons are deliberately excluded: fresh observation must not
    # recompute policy, and executors can subtract their exact completed subset.
    return int.from_bytes(hashlib.sha256(canonical_bytes({'path': row['path'],
                                                        'metadata': row['metadata']})).digest(), 'big')


def _fingerprint(count, value):
    return {'algorithm': 'sha256-sum-mod-2^256-v1', 'count': count, 'sumHex': f'{value & MASK:064x}'}


def entries_fingerprint(rows):
    count, total = 0, 0
    for row in rows:
        count += 1
        total = (total + _row_hash(row)) & MASK
    return _fingerprint(count, total)


def _scope(scope):
    if not isinstance(scope, dict) or set(scope) != {'root', 'protocolDirs', 'allowedNames', 'target'}:
        raise ManifestError('invalid_scope')
    if scope['root'] != PRODUCTION_ROOT or scope['target'] not in ('jp', 'sgp'):
        raise ManifestError('invalid_scope_root_or_target')
    for key, allowed in (('protocolDirs', PROTOCOL_DIRS), ('allowedNames', ALLOWED_NAMES)):
        values = scope[key]
        if not isinstance(values, (list, tuple)) or not values or any(type(v) is not str or v not in allowed for v in values) or len(values) != len(set(values)):
            raise ManifestError('invalid_scope_selection')
    return {'root': scope['root'], 'target': scope['target'],
            'protocolDirs': sorted(scope['protocolDirs']), 'allowedNames': sorted(scope['allowedNames'])}


validate_scope = _scope


def validate_protection_policy(value, scope):
    """Normalize the policy; callers use None only for a known absent field."""
    historical = {'id': 'historical-three-class-v1'}
    current = {'id': 'current-dependencies-only-v1',
               'historicalCoverage': 'not_assessed', 'extraHolds': 'declared_only'}
    if value is None:
        return historical
    if not isinstance(value, dict) or any(type(item) is not str for item in value.values()):
        raise ManifestError('invalid_protection_policy')
    if value == historical:
        return historical
    if value != current:
        raise ManifestError('invalid_protection_policy')
    if not isinstance(scope, dict) or scope.get('target') != 'sgp' or scope.get('protocolDirs') != ['hysteria2']:
        raise ManifestError('protection_policy_scope_mismatch')
    return current


def _budget(max_entries, max_bytes, max_seconds, max_memory_bytes):
    for value, maximum in ((max_entries, MAX_ENTRIES), (max_bytes, MAX_BYTES), (max_memory_bytes, MAX_MEMORY_BYTES)):
        if type(value) is not int or not 1 <= value <= maximum:
            raise ManifestError('invalid_budget')
    if type(max_seconds) not in (int, float) or not math.isfinite(max_seconds) or not 0 < max_seconds <= MAX_SECONDS:
        raise ManifestError('invalid_budget')


def open_directory(path):
    if not isinstance(path, str) or not path.startswith('/') or path != posixpath.normpath(path):
        raise ManifestError('unsafe_directory')
    if not hasattr(os, 'O_DIRECTORY') or not hasattr(os, 'O_NOFOLLOW'):
        raise ManifestError('posix_descriptor_traversal_required')
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


def _scan(root_fd, scope, budget):
    """Yield directory/entry metadata only. Never opens regular file descriptors."""
    root_identity = _metadata(os.fstat(root_fd))
    yield 'directory', {'path': scope['root'], 'identity': root_identity}
    for protocol in scope['protocolDirs']:
        if time.monotonic() >= budget['deadline']:
            budget['blockers'].add('time_budget_exhausted')
            return
        fd = None
        try:
            before = _metadata(os.stat(protocol, dir_fd=root_fd, follow_symlinks=False))
            if not stat.S_ISDIR(before['mode']) or before['dev'] != root_identity['dev']:
                budget['blockers'].add('selected_directory_unsafe')
                continue
            fd = os.open(protocol, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
            opened = _metadata(os.fstat(fd))
            if opened != before:
                budget['blockers'].add('directory_changed')
                continue
            path = scope['root'] + '/' + protocol
            yield 'directory', {'path': path, 'identity': before}
            with os.scandir(fd) as children:
                for child in children:
                    if budget['count'] >= budget['max_entries']:
                        budget['blockers'].add('entry_budget_exhausted')
                        return
                    if time.monotonic() >= budget['deadline']:
                        budget['blockers'].add('time_budget_exhausted')
                        return
                    budget['count'] += 1
                    try:
                        metadata = _metadata(os.stat(child.name, dir_fd=fd, follow_symlinks=False))
                        if metadata['dev'] != before['dev']:
                            budget['blockers'].add('cross_device_entry')
                        if stat.S_ISDIR(metadata['mode']):
                            budget['blockers'].add('nested_directory')
                        elif stat.S_ISLNK(metadata['mode']):
                            budget['blockers'].add('symbolic_link')
                        elif not stat.S_ISREG(metadata['mode']):
                            budget['blockers'].add('non_regular_file')
                        elif metadata['nlink'] != 1:
                            budget['blockers'].add('hardlinked_file')
                        if any(0xD800 <= ord(c) <= 0xDFFF for c in child.name):
                            budget['blockers'].add('invalid_filename_encoding')
                        yield 'entry', {'path': path + '/' + child.name, 'metadata': metadata}
                    except OSError:
                        budget['blockers'].add('entry_metadata_unavailable')
            if before != _metadata(os.fstat(fd)):
                budget['blockers'].add('directory_changed')
        except OSError:
            budget['blockers'].add('selected_directory_unavailable')
        finally:
            if fd is not None:
                os.close(fd)
    if root_identity != _metadata(os.fstat(root_fd)):
        budget['blockers'].add('root_directory_changed')


def snapshot_metadata(scope, *, observed_at=None, mode='full', max_entries=MAX_ENTRIES,
                      max_bytes=MAX_BYTES, max_seconds=MAX_SECONDS, max_memory_bytes=MAX_MEMORY_BYTES):
    """Full two-pass metadata coverage; fingerprint mode stores no entries.

    No retention/hold policy is evaluated here. Observers must independently
    collect protection review; an old review is not fresh application evidence.
    Both modes scan identical scope and produce identical entriesFingerprint.
    """
    scope = _scope(scope)
    observed_at = dt.datetime.now(UTC) if observed_at is None else observed_at
    observed = _date(observed_at)
    _budget(max_entries, max_bytes, max_seconds, max_memory_bytes)
    if mode not in ('full', 'fingerprint'):
        raise ManifestError('invalid_snapshot_mode')
    deadline = time.monotonic() + max_seconds
    blockers, entries, directories = set(), [], []
    signatures = []
    estimated_memory, estimated_payload = 65536, 65536
    if estimated_memory > max_memory_bytes or estimated_payload > max_bytes:
        blockers.add('manifest_resource_budget_exhausted')
    root_fd = None
    try:
        root_fd = open_directory(scope['root'])
        root_before = _metadata(os.fstat(root_fd))
        for pass_number in (0, 1):
            budget = {'deadline': deadline, 'count': 0, 'max_entries': max_entries, 'blockers': blockers}
            count, total, logical_bytes = 0, 0, 0
            pass_dirs = []
            iterator = _scan(root_fd, scope, budget)
            try:
                for kind, row in iterator:
                    if kind == 'directory':
                        pass_dirs.append(row)
                        continue
                    count += 1
                    total = (total + _row_hash(row)) & MASK
                    logical_bytes += row['metadata']['size']
                    if pass_number == 1 and mode == 'full':
                        # Includes future disposition/reasons, list/dict/int and
                        # path overhead. Conservative estimate, not measured RSS.
                        estimated_memory += 1280 + len(row['path']) * 2
                        estimated_payload += len(canonical_bytes(row)) + 512
                        if estimated_memory > max_memory_bytes or estimated_payload > max_bytes:
                            blockers.add('manifest_resource_budget_exhausted')
                            break
                        entries.append(row)
            finally:
                iterator.close()
            signatures.append((count, total, logical_bytes))
            if pass_number == 0:
                directories = pass_dirs
            elif directories != pass_dirs or signatures[0] != signatures[1]:
                blockers.add('metadata_changed_between_passes')
            if time.monotonic() >= deadline:
                blockers.add('time_budget_exhausted')
                break
        if len(signatures) != 2:
            blockers.add('two_pass_coverage_incomplete')
        final_fd = open_directory(scope['root'])
        try:
            if root_before != _metadata(os.fstat(final_fd)) or root_before != _metadata(os.fstat(root_fd)):
                blockers.add('root_directory_changed')
        finally:
            os.close(final_fd)
    except OSError:
        blockers.add('root_or_metadata_unavailable')
    finally:
        if root_fd is not None:
            os.close(root_fd)
    if time.monotonic() >= deadline:
        blockers.add('time_budget_exhausted')
    entries.sort(key=lambda row: row['path'])
    count, total, logical_bytes = signatures[-1] if signatures else (0, 0, 0)
    result = {'schemaVersion': 1, 'type': 'edge-backup-metadata-snapshot', 'mode': mode,
              'scope': scope, 'observedAt': observed, 'complete': not blockers,
              'directories': directories, 'entries': entries,
              'entriesFingerprint': _fingerprint(count, total),
              'summary': {'entryCount': count, 'logicalBytes': logical_bytes},
              'blockers': sorted(blockers), 'limitations': [LIMITATION, 'metadata_stability_not_atomic_snapshot'],
              'resourceAccounting': {'estimatedResidentBytes': estimated_memory,
                  'estimatedPayloadBytes': estimated_payload, 'maxMemoryBytes': max_memory_bytes,
                  'maxPayloadBytes': max_bytes}}
    result['digest'] = manifest_digest(result)
    if time.monotonic() >= deadline:
        result['complete'] = False
        result['blockers'] = sorted(set(result['blockers']) | {'time_budget_exhausted'})
        result['digest'] = manifest_digest(result)
    return result


def _review(value, scope):
    if not isinstance(value, dict) or set(value) != {'complete', 'evidenceDigest', 'holds'}:
        raise ManifestError('explicit_protection_review_required')
    if type(value['complete']) is not bool or type(value['evidenceDigest']) is not str or not SHA.fullmatch(value['evidenceDigest']):
        raise ManifestError('invalid_protection_review')
    holds = value['holds']
    if not isinstance(holds, (list, tuple)) or len(holds) > 1000:
        raise ManifestError('invalid_reviewed_holds')
    roots = {scope['root'] + '/' + p for p in scope['protocolDirs']}
    for hold in holds:
        if type(hold) is not str or len(hold) > 1024 or hold != posixpath.normpath(hold) or '\\' in hold:
            raise ManifestError('invalid_reviewed_hold_path')
        if hold != scope['root'] and hold not in roots and posixpath.dirname(hold) not in roots:
            raise ManifestError('hold_outside_scope')
    if len(set(holds)) != len(holds):
        raise ManifestError('duplicate_hold')
    return {'complete': value['complete'], 'evidenceDigest': value['evidenceDigest'], 'holds': sorted(holds)}


def _recognize(row, allowed, now_ns):
    metadata = row['metadata']
    if not stat.S_ISREG(metadata['mode']):
        return 'non_regular_file', None
    if metadata['nlink'] != 1:
        return 'hardlinked_file', None
    match = STAMP.fullmatch(posixpath.basename(row['path']))
    if not match or match[1] not in allowed:
        return 'unknown_filename', None
    try:
        timestamp = epoch_ns(dt.datetime(*(int(match[i]) for i in range(2, 8)),
                                        microsecond=int(match[8]) * 1000, tzinfo=UTC))
    except ValueError:
        return 'invalid_filename_date', None
    if timestamp > now_ns or metadata['mtimeNs'] > now_ns:
        return 'future_timestamp', None
    if abs(timestamp - metadata['mtimeNs']) > POLICY['mtimeToleranceSeconds'] * 1000000000:
        return 'filename_mtime_mismatch', None
    return None, ((posixpath.dirname(row['path']), match[1]), (timestamp, row['path']))


def build_manifest(*, root, protocol_dirs, allowed_names, target, observed_at, protection_review,
                   protection_policy=None, max_entries=MAX_ENTRIES, max_bytes=MAX_BYTES, max_seconds=MAX_SECONDS,
                   max_memory_bytes=MAX_MEMORY_BYTES):
    """Exact private manifest; review is mandatory, including reviewed-empty holds."""
    scope = _scope({'root': root, 'protocolDirs': protocol_dirs, 'allowedNames': allowed_names, 'target': target})
    protection_policy = validate_protection_policy(protection_policy, scope)
    review = _review(protection_review, scope)  # Before any filesystem access.
    _date(observed_at)
    deadline = time.monotonic() + max_seconds
    snapshot = snapshot_metadata(scope, observed_at=observed_at, max_entries=max_entries,
        max_bytes=max_bytes, max_seconds=max_seconds, max_memory_bytes=max_memory_bytes)
    remaining = max(0.000001, deadline - time.monotonic())
    return manifest_from_snapshot(snapshot, protection_review=review,
                                  protection_policy=protection_policy, max_seconds=remaining)


def _validate_snapshot(snapshot):
    required = {'schemaVersion', 'type', 'mode', 'scope', 'observedAt', 'complete', 'directories',
                'entries', 'entriesFingerprint', 'summary', 'blockers', 'limitations', 'resourceAccounting', 'digest'}
    if not isinstance(snapshot, dict) or set(snapshot) != required or snapshot['schemaVersion'] != 1 or snapshot['type'] != 'edge-backup-metadata-snapshot' or snapshot['mode'] != 'full' or type(snapshot['complete']) is not bool:
        raise ManifestError('full_metadata_snapshot_required')
    if not SHA.fullmatch(str(snapshot['digest'])) or snapshot['digest'] != manifest_digest(snapshot):
        raise ManifestError('snapshot_digest_invalid')
    scope = _scope(snapshot['scope'])
    if scope != snapshot['scope']:
        raise ManifestError('noncanonical_snapshot_scope')
    try:
        observed = dt.datetime.fromisoformat(snapshot['observedAt'].replace('Z', '+00:00'))
        _date(observed)
    except (AttributeError, TypeError, ValueError):
        raise ManifestError('snapshot_timestamp_invalid') from None
    if not isinstance(snapshot['entries'], list) or len(snapshot['entries']) > MAX_ENTRIES or not isinstance(snapshot['directories'], list):
        raise ManifestError('snapshot_rows_invalid')
    selected = {scope['root'] + '/' + p for p in scope['protocolDirs']}
    directory_paths = []
    for row in snapshot['directories']:
        if set(row) != {'path', 'identity'} or row['path'] not in selected | {scope['root']}:
            raise ManifestError('snapshot_directory_invalid')
        _validate_metadata(row['identity'])
        if not stat.S_ISDIR(row['identity']['mode']):
            raise ManifestError('snapshot_directory_invalid')
        directory_paths.append(row['path'])
    if len(directory_paths) != len(set(directory_paths)):
        raise ManifestError('snapshot_directory_duplicate')
    directory_metadata = {row['path']: row['identity'] for row in snapshot['directories']}
    root_metadata = directory_metadata.get(scope['root'])
    if snapshot['complete'] and root_metadata is not None and any(
            info['dev'] != root_metadata['dev'] for info in directory_metadata.values()):
        raise ManifestError('cross_device_directory')
    previous = None
    for row in snapshot['entries']:
        if not isinstance(row, dict) or set(row) != {'path', 'metadata'} or type(row['path']) is not str or row['path'] != posixpath.normpath(row['path']) or posixpath.dirname(row['path']) not in selected:
            raise ManifestError('snapshot_entry_invalid')
        if previous is not None and row['path'] <= previous:
            raise ManifestError('snapshot_entries_not_sorted_unique')
        previous = row['path']
        _validate_metadata(row['metadata'])
        parent_metadata = directory_metadata.get(posixpath.dirname(row['path']))
        if snapshot['complete'] and parent_metadata is not None and row['metadata']['dev'] != parent_metadata['dev']:
            raise ManifestError('cross_device_entry')
    if not isinstance(snapshot['blockers'], list) or not isinstance(snapshot['limitations'], list):
        raise ManifestError('snapshot_coverage_invalid')
    if snapshot['complete'] and (snapshot['blockers'] or set(directory_paths) != selected | {scope['root']} or snapshot['entriesFingerprint'] != entries_fingerprint(snapshot['entries'])):
        raise ManifestError('snapshot_coverage_invalid')
    if snapshot['complete'] and (snapshot['summary'] != {'entryCount': len(snapshot['entries']), 'logicalBytes': sum(r['metadata']['size'] for r in snapshot['entries'])}):
        raise ManifestError('snapshot_summary_invalid')
    return scope, observed


def _validate_metadata(metadata):
    if not isinstance(metadata, dict) or set(metadata) != set(METADATA_KEYS) or any(type(v) is not int for v in metadata.values()):
        raise ManifestError('snapshot_metadata_invalid')
    if any(metadata[k] < 0 for k in ('dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'blocks')):
        raise ManifestError('snapshot_metadata_invalid')


def manifest_from_snapshot(snapshot, *, protection_review, protection_policy=None, max_seconds=MAX_SECONDS):
    """Pure, cross-platform policy application to a verified full snapshot.

    Mutates the supplied entry dictionaries in place to avoid a second large
    metadata list. The snapshot is consumed; do not reuse it as a raw snapshot.
    No filesystem calls are made. Its digest/coverage are checked independently.
    """
    _budget(MAX_ENTRIES, MAX_BYTES, max_seconds, MAX_MEMORY_BYTES)
    deadline = time.monotonic() + max_seconds
    scope, observed_at = _validate_snapshot(snapshot)
    protection_policy = validate_protection_policy(protection_policy, scope)
    review = _review(protection_review, scope)
    observed = _date(observed_at)
    root = scope['root']
    rows = snapshot['entries']  # Reuse one list/metadata objects, never deepcopy.
    blockers = set(snapshot['blockers'])
    if not snapshot['complete']:
        blockers.add('snapshot_incomplete')
    if not review['complete']:
        blockers.add('protection_review_incomplete')
    holds = set(review['holds'])
    seen = {d['path'] for d in snapshot['directories']} & holds
    heaps = {}
    now_ns = epoch_ns(observed_at)
    cutoff = now_ns - POLICY['keepDays'] * 86400 * 1000000000
    for row in rows:
        metadata = row['metadata']
        if stat.S_ISDIR(metadata['mode']):
            blockers.add('nested_directory')
        elif stat.S_ISLNK(metadata['mode']):
            blockers.add('symbolic_link')
        elif not stat.S_ISREG(metadata['mode']):
            blockers.add('non_regular_file')
        elif metadata['nlink'] != 1:
            blockers.add('hardlinked_file')
        if row['path'] in holds:
            seen.add(row['path'])
        reason, recognized = _recognize(row, scope['allowedNames'], now_ns)
        if recognized:
            group, rank = recognized
            heap = heaps.setdefault(group, [])
            if len(heap) < POLICY['keepLatest']:
                heapq.heappush(heap, rank)
            elif rank > heap[0]:
                heapq.heapreplace(heap, rank)
    if seen != holds:
        blockers.add('reviewed_hold_not_observed')
    for row in rows:
        reason, recognized = _recognize(row, scope['allowedNames'], now_ns)
        reasons = [reason] if reason else []
        if row['path'] in holds or posixpath.dirname(row['path']) in holds or root in holds:
            reasons.append('reviewed_hold')
        if recognized:
            group, rank = recognized
            if rank[0] >= cutoff:
                reasons.append('within_30_days')
            if rank >= heaps[group][0]:
                reasons.append('latest_20')
        row['disposition'] = 'protected' if reasons else 'candidate'
        row['reasons'] = reasons or ['older_than_30_days_and_outside_latest_20']
    if time.monotonic() >= deadline:
        blockers.add('time_budget_exhausted')
    result = {'schemaVersion': 1, 'type': 'edge-backup-retention-manifest',
              'state': 'candidate-not-approved', 'deletionApproved': False,
              'scope': scope, 'observedAt': observed, 'policy': dict(POLICY),
              'protectionPolicy': protection_policy,
              'complete': not blockers, 'protectionReview': review,
              'directories': snapshot['directories'], 'entries': rows,
              'entriesFingerprint': snapshot['entriesFingerprint'],
              'blockers': sorted(blockers), 'limitations': snapshot['limitations'],
              'resourceAccounting': snapshot['resourceAccounting']}
    _finish(result)
    result['digest'] = manifest_digest(result)
    if time.monotonic() >= deadline and result['complete']:
        result['blockers'].append('time_budget_exhausted')
        result['complete'] = False
        _finish(result)
        result['digest'] = manifest_digest(result)
    return result


def _finish(result):
    summary = {'entryCount': len(result['entries']), 'protectedCount': 0, 'candidateCount': 0,
               'protectedBytes': 0, 'candidateBytes': 0}
    for row in result['entries']:
        if not result['complete'] and row['disposition'] == 'candidate':
            row['disposition'] = 'protected'
            row['reasons'].append('manifest_incomplete')
        kind = row['disposition']
        summary[kind + 'Count'] += 1
        summary[kind + 'Bytes'] += row['metadata']['size']
    result['summary'] = summary


def main(argv=None):
    # Private file export is deliberately separate from read-only host APIs.
    parser = argparse.ArgumentParser(description='Metadata manifest planner; never deletes backups.')
    parser.add_argument('command', choices=('plan', 'export'))
    parser.add_argument('--root', required=True)
    parser.add_argument('--protocol-dir', action='append', required=True, choices=PROTOCOL_DIRS)
    parser.add_argument('--allow-name', action='append', required=True, choices=ALLOWED_NAMES)
    parser.add_argument('--target', required=True, choices=('jp', 'sgp'))
    parser.add_argument('--review-evidence-digest', required=True)
    parser.add_argument('--protection-review-complete', action='store_true', required=True)
    holds = parser.add_mutually_exclusive_group(required=True)
    holds.add_argument('--reviewed-hold', action='append')
    holds.add_argument('--no-holds-reviewed', action='store_true')
    parser.add_argument('--output')
    args = parser.parse_args(argv)
    try:
        if (args.command == 'export') != bool(args.output):
            raise ManifestError('private_export_output_required')
        result = build_manifest(root=args.root, protocol_dirs=args.protocol_dir, allowed_names=args.allow_name,
            target=args.target, observed_at=dt.datetime.now(UTC), protection_review={'complete': True,
                'evidenceDigest': args.review_evidence_digest, 'holds': args.reviewed_hold or []})
        if args.command == 'export':
            export_private(result, args.output)
        print(json.dumps({'state': result['state'], 'complete': result['complete'], 'digest': result['digest'],
                          'summary': result['summary'], 'blockers': result['blockers'], 'exported': args.command == 'export'}))
        return 0 if result['complete'] else 2
    except (ManifestError, OSError):
        print(json.dumps({'state': 'manifest-refused', 'complete': False, 'deletionApproved': False}))
        return 2


def export_private(document, path):
    """Exclusive private LOCAL artifact only; no stdout full-path manifest."""
    if not isinstance(path, str) or path != os.path.normpath(path) or not path.startswith('/') or path == PRODUCTION_ROOT or path.startswith(PRODUCTION_ROOT + '/'):
        raise ManifestError('unsafe_export_path')
    parent = open_directory(os.path.dirname(path))
    fd = None
    try:
        info = os.fstat(parent)
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise ManifestError('export_directory_not_private')
        fd = os.open(os.path.basename(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=parent)
        for piece in ENCODER.iterencode(document):
            data = piece.encode('utf8')
            while data:
                written = os.write(fd, data)
                if written <= 0:
                    raise ManifestError('export_write_failed')
                data = data[written:]
        os.fsync(fd)
        os.fsync(parent)
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


if __name__ == '__main__':
    sys.exit(main())
