"""Exact-manifest backup deletion core; no production observer is wired here.

Default CLI is validation/dry-run. Apply is only available to a separately
reviewed host wrapper using a source-bound ProtectionObserver, real hostname,
root-private receipt/quarantine parents, and exact one-use operator approval.
No services, databases, runtime material bodies, SSH or shell commands.

Each file is atomically moved without overwrite into private quarantine before
inode verification and unlink. Uncertain moves remain recoverable there; no
automatic restore, replay or claim that deleted contents can be rolled back.
This is not a defence against malicious root or root-held writable file handles.
"""
import argparse
import ctypes
import datetime as dt
import hashlib
import heapq
import json
import os
from pathlib import Path, PurePosixPath
import re
import socket
import stat
import sys

import edge_backup_manifest as manifest_module
import edge_backup_retention as retention

ROOT = '/var/backups/gccgw-edge'
QUARANTINE_PARENT = '/var/backups/gccgw-edge-retention-quarantine'
RECEIPT_PARENT = '/var/lib/gccgw-edge-retention/receipts'
HOSTS = {'jp': 'gccgw-vultr-candidate', 'sgp': 'gccgw-sgp-small-portal-20260608-002'}
POLICY = {'keepLatest': 20, 'keepDays': 30, 'mtimeToleranceSeconds': 300}
META_KEYS = ('dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs', 'blocks')
IMMUTABLE_DIR_KEYS = ('dev', 'ino', 'mode', 'nlink', 'uid', 'gid')
MAX_ENTRIES = 300000
MAX_MANIFEST_BYTES = 128 * 1024 * 1024
MAX_APPROVAL_BYTES = 8 * 1024 * 1024
MAX_APPROVED_FILES = 10000
HEX = re.compile(r'[0-9a-f]{64}\Z')
ROOT_UID = 0
ROOT_GID = 0


class ExecuteError(ValueError):
    """Static refusal code only, never include paths or command output."""


class ProtectionObserver:
    """Trusted host-wrapper adapter, never instantiated from JSON or CLI code.

    source_digest binds the separately reviewed implementation that derives
    current/failed-transaction, rollback and incident holds. read_protection
    must independently read that source and return a new complete review. It
    must not copy the input manifest's review or simply trust a JSON boolean.
    """
    source_digest = None

    def read_protection(self, scope):
        raise ExecuteError('production_protection_observer_not_wired')


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def canonical_digest(document):
    hasher = hashlib.sha256()
    value = {key: item for key, item in document.items() if key != 'digest'}
    encoder = json.JSONEncoder(sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)
    for piece in encoder.iterencode(value):
        hasher.update(piece.encode('utf8'))
    return hasher.hexdigest()


def source_digest():
    """Bind all three fixed source modules, not just this entry point."""
    hasher = hashlib.sha256()
    for name in ('edge_backup_execute.py', 'edge_backup_manifest.py', 'edge_backup_retention.py'):
        raw = Path(__file__).with_name(name).read_bytes()
        hasher.update(name.encode('ascii') + b'\0' + hashlib.sha256(raw).digest())
    return hasher.hexdigest()


def date(value):
    if not isinstance(value, str):
        raise ExecuteError('invalid_date')
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None or parsed.utcoffset() != dt.timedelta(0):
        raise ExecuteError('utc_date_required')
    return parsed


def metadata(info):
    return dict(zip(META_KEYS, (info.st_dev, info.st_ino, info.st_mode, info.st_nlink,
        info.st_uid, info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns,
        getattr(info, 'st_blocks', 0))))


def validate_metadata(value, directory=False, directory_binding=None):
    if not isinstance(value, dict) or set(value) != set(META_KEYS) or any(type(value[key]) is not int or value[key] < 0 for key in META_KEYS):
        raise ExecuteError('invalid_metadata')
    mode = value['mode']
    if directory:
        if directory_binding is not None and not directory_immutable_equal(value, directory_binding):
            raise ExecuteError('directory_binding_mismatch')
        owner_allowed = value['uid'] == ROOT_UID or (
            directory_binding is not None and mode == (stat.S_IFDIR | 0o700))
        if not stat.S_ISDIR(mode) or not owner_allowed or mode & 0o022:
            raise ExecuteError('unsafe_directory_metadata')
    elif not stat.S_ISREG(mode) or value['nlink'] != 1:
        raise ExecuteError('unsafe_file_metadata')


def exact_path(path):
    return isinstance(path, str) and path.startswith('/') and str(PurePosixPath(path)) == path and '\x00' not in path and '..' not in PurePosixPath(path).parts


def validate_review(review):
    if not isinstance(review, dict) or review.get('complete') is not True or not HEX.fullmatch(str(review.get('evidenceDigest', ''))):
        raise ExecuteError('protection_review_incomplete')
    holds = review.get('holds')
    if not isinstance(holds, list) or len(holds) > 1000 or any(not isinstance(path, str) for path in holds) or holds != sorted(set(holds)) or any(not exact_path(path) for path in holds):
        raise ExecuteError('protection_holds_invalid')


def covered_by_hold(path, holds):
    return any(path == hold or path.startswith(hold.rstrip('/') + '/') for hold in holds)


def recognized(path, info, observed):
    match = retention.STAMP.fullmatch(PurePosixPath(path).name)
    if not match:
        return None
    try:
        moment = dt.datetime(*(int(match[index]) for index in range(2, 8)),
                             microsecond=int(match[8]) * 1000, tzinfo=dt.timezone.utc)
    except ValueError:
        return None
    timestamp_ns = manifest_module.epoch_ns(moment)
    if moment > observed or abs(info['mtimeNs'] - timestamp_ns) > 300 * 1000000000:
        return None
    return match[1], moment


def validate_manifest(document, *, directory_bindings=None):
    if not isinstance(document, dict) or type(document.get('schemaVersion')) is not int or document.get('schemaVersion') != 1 or document.get('type') != 'edge-backup-retention-manifest':
        raise ExecuteError('manifest_schema_invalid')
    if document.get('digest') != canonical_digest(document):
        raise ExecuteError('manifest_digest_invalid')
    if document.get('complete') is not True or document.get('blockers') != [] or document.get('policy') != POLICY:
        raise ExecuteError('manifest_not_complete_fixed_policy')
    scope = document.get('scope', {})
    dirs = scope.get('protocolDirs')
    names = scope.get('allowedNames')
    if scope.get('root') != ROOT or scope.get('target') not in HOSTS or not isinstance(dirs, list) or dirs != sorted(set(dirs)) or not 1 <= len(dirs) <= 6 or not set(dirs).issubset(set(manifest_module.PROTOCOL_DIRS)):
        raise ExecuteError('scope_invalid')
    if names != sorted(retention.ALLOWED_NAMES):
        raise ExecuteError('basename_scope_invalid')
    validate_review(document.get('protectionReview'))
    observed = date(document.get('observedAt'))
    rows = document.get('entries')
    directories = document.get('directories')
    if not isinstance(rows, list) or len(rows) > MAX_ENTRIES or not isinstance(directories, list) or len(directories) > 7:
        raise ExecuteError('manifest_budget_exceeded')
    expected_dirs = {ROOT} | {ROOT + '/' + item for item in dirs}
    bindings = None
    if directory_bindings is not None:
        if (len(dirs) != 1 or not isinstance(directory_bindings, dict)
                or set(directory_bindings) != expected_dirs):
            raise ExecuteError('directory_bindings_invalid')
        bindings = {}
        for path, identity in directory_bindings.items():
            if (not isinstance(identity, dict) or set(identity) != set(IMMUTABLE_DIR_KEYS)
                    or any(type(identity[key]) is not int or identity[key] < 0 for key in IMMUTABLE_DIR_KEYS)):
                raise ExecuteError('directory_bindings_invalid')
            bindings[path] = dict(identity)
    actual_dirs = {}
    for row in directories:
        if not isinstance(row, dict) or row.get('path') not in expected_dirs or row['path'] in actual_dirs:
            raise ExecuteError('directory_scope_invalid')
        validate_metadata(row.get('identity'), directory=True,
                          directory_binding=None if bindings is None else bindings[row['path']])
        actual_dirs[row['path']] = dict(row['identity'])
    if set(actual_dirs) != expected_dirs:
        raise ExecuteError('directory_coverage_incomplete')
    last_path = None
    heaps = {}
    candidate_count = 0
    for row in rows:
        path = row.get('path')
        if not exact_path(path) or (last_path is not None and path <= last_path):
            raise ExecuteError('entry_order_or_path_invalid')
        last_path = path
        parent = str(PurePosixPath(path).parent)
        if parent not in expected_dirs or row.get('disposition') not in ('protected', 'candidate'):
            raise ExecuteError('entry_scope_invalid')
        validate_metadata(row.get('metadata'))
        known = recognized(path, row['metadata'], observed)
        if known and parent != ROOT:
            key = (parent, known[0])
            heap = heaps.setdefault(key, [])
            item = (known[1], path)
            if len(heap) < POLICY['keepLatest']:
                heapq.heappush(heap, item)
            elif item > heap[0]:
                heapq.heapreplace(heap, item)
        if row['disposition'] == 'candidate':
            candidate_count += 1
            if parent == ROOT or not known or known[0] not in names or known[1] >= observed - dt.timedelta(days=POLICY['keepDays']) or covered_by_hold(path, document['protectionReview']['holds']):
                raise ExecuteError('candidate_policy_invalid')
    newest = {path for heap in heaps.values() for _, path in heap}
    if any(row['disposition'] == 'candidate' and row['path'] in newest for row in rows):
        raise ExecuteError('candidate_is_latest_protected')
    return {'scope': scope, 'directories': actual_dirs, 'candidateCount': candidate_count,
            'directoryBindings': bindings}


def validate_approval(document, approval, context, current, hostname):
    if not isinstance(approval, dict) or approval.get('approved') is not True or approval.get('type') != 'edge-backup-retention-approval' or type(approval.get('schemaVersion')) is not int or approval.get('schemaVersion') != 1:
        raise ExecuteError('explicit_approval_required')
    target = context['scope']['target']
    if approval.get('manifestDigest') != document['digest'] or approval.get('sourceDigest') != source_digest() or approval.get('target') != target or approval.get('hostname') != HOSTS[target] or hostname != HOSTS[target]:
        raise ExecuteError('approval_binding_mismatch')
    start, end = date(approval.get('notBefore')), date(approval.get('expiresAt'))
    if not start <= current < end or end <= start or date(document['observedAt']) > current:
        raise ExecuteError('approval_expired_or_not_started')
    run_id = approval.get('runId', '')
    if not isinstance(run_id, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{7,63}', run_id):
        raise ExecuteError('run_id_invalid')
    if approval.get('quarantinePath') != QUARANTINE_PARENT + '/' + run_id or approval.get('receiptPath') != RECEIPT_PARENT + '/' + run_id + '.jsonl':
        raise ExecuteError('private_transaction_path_invalid')
    if not HEX.fullmatch(str(approval.get('observerSourceDigest', ''))):
        raise ExecuteError('observer_source_not_bound')
    paths = approval.get('candidatePaths')
    if not isinstance(paths, list) or not 1 <= len(paths) <= MAX_APPROVED_FILES or any(not isinstance(path, str) for path in paths) or paths != sorted(set(paths)):
        raise ExecuteError('approved_subset_invalid')
    selected = set(paths)
    rows = {row['path']: row for row in document['entries'] if row['path'] in selected and row['disposition'] == 'candidate'}
    if set(rows) != selected:
        raise ExecuteError('approved_path_not_candidate')
    if len(context['scope']['protocolDirs']) != 1:
        raise ExecuteError('one_protocol_per_execution_required')
    return rows


def private_directory(path):
    fd = retention.open_directory(path)
    info = os.fstat(fd)
    if info.st_uid != ROOT_UID or info.st_gid != ROOT_GID or stat.S_IMODE(info.st_mode) != 0o700:
        os.close(fd)
        raise ExecuteError('root_private_parent_required')
    return fd


class Receipt:
    def __init__(self, path):
        parent = private_directory(str(PurePosixPath(path).parent))
        try:
            self.fd = os.open(PurePosixPath(path).name, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
            os.fsync(parent)
        finally:
            os.close(parent)

    def append(self, event):
        raw = (json.dumps(event, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False) + '\n').encode('utf8')
        view = memoryview(raw)
        while view:
            written = os.write(self.fd, view)
            if written <= 0:
                raise ExecuteError('receipt_write_failed')
            view = view[written:]
        os.fsync(self.fd)

    def close(self):
        os.close(self.fd)


def rename_no_replace(source_fd, source, destination_fd, destination):
    libc = ctypes.CDLL(None, use_errno=True)
    rename = getattr(libc, 'renameat2', None)
    if rename is None:
        raise ExecuteError('atomic_noreplace_unavailable')
    rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    rename.restype = ctypes.c_int
    if rename(source_fd, os.fsencode(source), destination_fd, os.fsencode(destination), 1) != 0:
        raise OSError(ctypes.get_errno(), 'atomic_move_failed')


def directory_immutable_equal(left, right):
    return all(left[key] == right[key] for key in IMMUTABLE_DIR_KEYS)


def check_protection(document, scope, observer):
    review = observer.read_protection(dict(scope))
    validate_review(review)
    if review != document['protectionReview']:
        raise ExecuteError('protection_reference_changed')
    return review


def fresh_check(document, scope, expected_dirs, deleted, observer):
    review = check_protection(document, scope, observer)
    snapshot = manifest_module.snapshot_metadata(scope, mode='fingerprint')
    if snapshot.get('complete') is not True or snapshot.get('blockers') != [] or snapshot.get('scope') != scope:
        raise ExecuteError('fresh_scope_not_complete')
    actual_dirs = {row['path']: row['identity'] for row in snapshot.get('directories', [])}
    if actual_dirs != expected_dirs:
        raise ExecuteError('directory_metadata_changed')
    expected = manifest_module.entries_fingerprint(row for row in document['entries'] if row['path'] not in deleted)
    if snapshot.get('entriesFingerprint') != expected:
        raise ExecuteError('entry_set_or_metadata_changed')
    after = observer.read_protection(dict(scope))
    validate_review(after)
    if after != review:
        raise ExecuteError('protection_reference_changed_during_snapshot')


def verify_named_directory(path, expected):
    """Re-open the current namespace, not only a possibly detached old fd."""
    fd = retention.open_directory(path)
    try:
        if not directory_immutable_equal(metadata(os.fstat(fd)), expected):
            raise ExecuteError('directory_namespace_changed')
    finally:
        os.close(fd)


def check_directory_bindings(approval, bindings):
    """Only approved ROOT/child identities may differ from root ownership.

    Above ROOT, retain root custody with anchored no-follow descriptors. This
    exception never applies to receipt/quarantine paths or a UID globally.
    """
    actual = approval.get('directoryBindings')
    if canonical_digest({'bindings': actual}) != canonical_digest({'bindings': bindings}):
        raise ExecuteError('directory_binding_mismatch')
    if bindings is None:
        return
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in ('', *PurePosixPath(ROOT).parts[1:-1]):
            if part:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = child
            info = os.fstat(fd)
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != ROOT_UID or info.st_mode & 0o022:
                raise ExecuteError('unsafe_directory_metadata')
    finally:
        os.close(fd)
    for path, expected in bindings.items():
        verify_named_directory(path, expected)


def execute(document, approval=None, *, observer=None, apply=False, batch_size=1000,
            clock=utcnow, hostname=socket.gethostname):
    bindings = None
    if isinstance(approval, dict) and 'directoryBindings' in approval:
        bindings = approval['directoryBindings']
        if not isinstance(bindings, dict):
            raise ExecuteError('directory_bindings_invalid')
    context = validate_manifest(document, directory_bindings=bindings)
    if not apply:
        return {'state': 'dry_run', 'candidateCount': context['candidateCount'],
                'productionObserverWired': False, 'deletedCount': 0, 'retry': False}
    if type(batch_size) is not int or not 1 <= batch_size <= 10000:
        raise ExecuteError('batch_size_invalid')
    rows = validate_approval(document, approval, context, clock(), hostname())
    if not isinstance(observer, ProtectionObserver) or observer.source_digest != approval['observerSourceDigest']:
        raise ExecuteError('production_protection_observer_not_wired')
    def directory_gate():
        check_directory_bindings(approval, context['directoryBindings'])
    directory_gate()
    receipt = Receipt(approval['receiptPath'])  # exclusive claim BEFORE any mutation
    deleted, quarantined = set(), []
    quarantine_fd = None
    expected_dirs = dict(context['directories'])
    def fresh_scope():
        directory_gate()
        fresh_check(document, context['scope'], expected_dirs, deleted, observer)
        directory_gate()
    try:
        receipt.append({'event': 'started', 'runId': approval['runId'], 'manifestDigest': document['digest'],
                        'sourceDigest': approval['sourceDigest'], 'target': approval['target'],
                        'approvedCount': len(rows), 'retry': False, 'at': clock().isoformat()})
        fresh_scope()
        parent = private_directory(QUARANTINE_PARENT)
        try:
            root_fd = retention.open_directory(ROOT)
            try:
                if os.fstat(parent).st_dev != os.fstat(root_fd).st_dev:
                    raise ExecuteError('quarantine_cross_device')
            finally:
                os.close(root_fd)
            os.mkdir(approval['runId'], 0o700, dir_fd=parent)
            os.fsync(parent)
            quarantine_fd = private_directory(approval['quarantinePath'])
        finally:
            os.close(parent)
        quarantine_identity = metadata(os.fstat(quarantine_fd))
        paths = approval['candidatePaths']
        for batch_start in range(0, len(paths), batch_size):
            if not date(approval['notBefore']) <= clock() < date(approval['expiresAt']):
                raise ExecuteError('approval_expired_during_execution')
            fresh_scope()
            for index in range(batch_start, min(len(paths), batch_start + batch_size)):
                if clock() >= date(approval['expiresAt']):
                    raise ExecuteError('approval_expired_during_execution')
                path, slot = paths[index], f'item-{index:08d}.bak'
                directory, name = str(PurePosixPath(path).parent), PurePosixPath(path).name
                source_fd = retention.open_directory(directory)
                try:
                    if metadata(os.fstat(source_fd)) != expected_dirs[directory]:
                        raise ExecuteError('directory_metadata_changed')
                    verify_named_directory(ROOT, expected_dirs[ROOT])
                    verify_named_directory(directory, expected_dirs[directory])
                    if not directory_immutable_equal(metadata(os.fstat(quarantine_fd)), quarantine_identity):
                        raise ExecuteError('quarantine_identity_changed')
                    verify_named_directory(approval['quarantinePath'], quarantine_identity)
                    original = metadata(os.stat(name, dir_fd=source_fd, follow_symlinks=False))
                    validate_metadata(original)
                    if original != rows[path]['metadata']:
                        raise ExecuteError('candidate_metadata_changed')
                    check_protection(document, context['scope'], observer)
                    receipt.append({'event': 'move_intent', 'path': path, 'slot': slot, 'metadata': original})
                    directory_gate()
                    if not date(approval['notBefore']) <= clock() < date(approval['expiresAt']):
                        raise ExecuteError('approval_expired_during_execution')
                    rename_no_replace(source_fd, name, quarantine_fd, slot)
                    os.fsync(source_fd)
                    os.fsync(quarantine_fd)
                    quarantined.append({'path': path, 'slot': slot})
                    moved = metadata(os.stat(slot, dir_fd=quarantine_fd, follow_symlinks=False))
                    receipt.append({'event': 'quarantined', 'path': path, 'slot': slot, 'metadata': moved})
                    validate_metadata(moved)
                    # rename changes inode ctime by definition; all other fields
                    # must match the exact approved inode and bytes metadata.
                    if any(moved[key] != original[key] for key in META_KEYS if key != 'ctimeNs') or moved['ctimeNs'] < original['ctimeNs']:
                        raise ExecuteError('quarantined_metadata_mismatch')
                    after_dir = metadata(os.fstat(source_fd))
                    if not directory_immutable_equal(after_dir, expected_dirs[directory]):
                        raise ExecuteError('directory_identity_changed')
                    verify_named_directory(ROOT, expected_dirs[ROOT])
                    verify_named_directory(directory, expected_dirs[directory])
                    verify_named_directory(approval['quarantinePath'], quarantine_identity)
                    expected_dirs[directory] = after_dir
                    receipt.append({'event': 'delete_intent', 'path': path, 'slot': slot})
                    if clock() >= date(approval['expiresAt']):
                        raise ExecuteError('approval_expired_during_execution')
                    check_protection(document, context['scope'], observer)
                    directory_gate()
                    if metadata(os.stat(slot, dir_fd=quarantine_fd, follow_symlinks=False)) != moved:
                        raise ExecuteError('quarantined_metadata_changed')
                    if not date(approval['notBefore']) <= clock() < date(approval['expiresAt']):
                        raise ExecuteError('approval_expired_during_execution')
                    os.unlink(slot, dir_fd=quarantine_fd)
                    os.fsync(quarantine_fd)
                    deleted.add(path)
                    quarantined.pop()
                    receipt.append({'event': 'deleted', 'path': path, 'slot': slot})
                finally:
                    os.close(source_fd)
            fresh_scope()
            receipt.append({'event': 'batch_verified', 'deletedCount': len(deleted), 'directories': expected_dirs})
        fresh_scope()
        state = 'completed'
        receipt.append({'event': 'completed', 'deletedCount': len(deleted), 'at': clock().isoformat(), 'retry': False})
    except Exception as error:
        state = 'stopped_partial_or_unknown'
        try:
            receipt.append({'event': state, 'errorClass': type(error).__name__,
                            'errorCode': 'execution_refused' if isinstance(error, ExecuteError) else 'io_or_observer_error',
                            'deletedCount': len(deleted), 'quarantined': quarantined,
                            'retry': False, 'at': clock().isoformat()})
        except Exception:
            state = 'receipt_write_failed_result_unknown'
    finally:
        if quarantine_fd is not None:
            os.close(quarantine_fd)
        receipt.close()
    return {'state': state, 'deletedCount': len(deleted), 'quarantinedCount': len(quarantined),
            'retry': False, 'automaticRestore': False}


def bounded_json(path, limit):
    with open(path, 'rb') as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ExecuteError('input_budget_exceeded')
        raw = handle.read(limit + 1)
        if len(raw) > limit:
            raise ExecuteError('input_budget_exceeded')
        return json.loads(raw)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--approval')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args(argv)
    try:
        document = bounded_json(args.manifest, MAX_MANIFEST_BYTES)
        if args.apply:
            raise ExecuteError('production_protection_observer_not_wired')
        print(json.dumps(execute(document), sort_keys=True))
        return 0
    except Exception as error:
        print(json.dumps({'state': 'rejected', 'errorClass': type(error).__name__, 'retry': False}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
