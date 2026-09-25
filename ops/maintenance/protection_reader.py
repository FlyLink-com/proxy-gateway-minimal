"""Read Hy2 protection records. Do not turn a missing source into an empty hold list.

This module does not open a host, a socket, or a backup file, and it does not delete.
Runtime receipts are the real record for backupRef and rollbackRef. The reviewed
receipt schema has no incident-hold field. A missing field stays unresolved or
unwired. One receipt is not an empty historical inventory.
"""
import re
from pathlib import PurePosixPath

import protection_observer as observer

COHORT_DIR = '/var/backups/gccgw-edge/hysteria2'
SAFE_REF = re.compile(r'[A-Za-z0-9._:-]{1,128}\Z')
RECEIPT_STATUSES = {'applied', 'unchanged', 'failed', 'pending', 'rolled_back', 'drift_detected'}
SENSITIVE_KEYS = {
    'apikey', 'apitoken', 'auth', 'authtoken', 'customeremail', 'email', 'endpoint', 'host',
    'material', 'password', 'privatekey', 'rawconfig', 'secret', 'sqliterow', 'subscriptionurl',
    'token', 'url', 'uuid',
}

VERIFIED_KIND = 'verified_source'


def read_cohort(records=None, bindings=None, scope=None):
    """Return the cohort result for fetched records. The default binding stays retained."""
    if scope is not None and not _hy2_scope(scope):
        raise observer.ObserverError('protection_scope_not_hy2_cohort')
    chosen = observer.BINDINGS if bindings is None else bindings
    if set(chosen) != set(observer.REQUIRED):
        raise observer.ObserverError('protection_classes_incomplete')
    if records is None:
        records = {}
    if not isinstance(records, dict) or not set(records) <= set(observer.REQUIRED):
        raise observer.ObserverError('protection_record_unknown')
    observations = {}
    verified = True
    for name in observer.REQUIRED:
        binding = chosen[name]
        record = records.get(name)
        if binding.get('named') is None:
            if record is not None:
                raise observer.ObserverError('unnamed_source_cannot_be_read')
            observations[name] = {'status': binding['status'], 'holds': []}
            verified = False
            continue
        observations[name] = _read_named(binding, record)
        if observations[name]['status'] in ('unwired', 'unknown', 'unresolved'):
            verified = False
    plain = {name: {'status': observations[name]['status'], 'holds': list(observations[name].get('holds') or ())}
             for name in observer.REQUIRED}
    if not verified:
        review = observer.derive_review(plain)
        if review['complete'] or review['holds']:
            raise observer.ObserverError('absent_sources_cannot_complete')
        return _result('retained', observations, review)
    review = observer.derive_review(plain)
    if review['complete'] is not True:
        raise observer.ObserverError('verified_sources_incomplete')
    return _result('sources_read', observations, review)


def _read_named(binding, record):
    if record is None:
        return {'status': binding['status'], 'holds': []}
    if not isinstance(record, dict):
        raise observer.ObserverError('protection_record_invalid')
    kind = record.get('kind')
    if kind in binding['not_a_source']:
        return {'status': binding['status'], 'holds': [], 'proxyRejected': kind}
    if kind != VERIFIED_KIND or record.get('sourceId') != binding['named']:
        raise observer.ObserverError('protection_source_mismatch')
    digest = record.get('bodyDigest')
    if (not isinstance(digest, str) or len(digest) != 64 or any(char not in '0123456789abcdef' for char in digest)
            or digest == 'b' * 64):
        raise observer.ObserverError('protection_source_digest_invalid')
    status = record.get('status')
    holds = record.get('holds', [])
    if not isinstance(holds, list) or any(not _exact_path(path) for path in holds):
        raise observer.ObserverError('protection_record_invalid')
    if status == 'empty':
        if binding.get('empty_allowed') is False:
            raise observer.ObserverError('receipt_field_cannot_be_empty')
        if holds:
            raise observer.ObserverError('empty_observation_has_holds')
        return {'status': 'empty', 'holds': []}
    if status != 'present' or not holds:
        raise observer.ObserverError('protection_record_invalid')
    return {'status': 'present', 'holds': list(holds)}


def read_runtime_receipts(receipts):
    """Map hysteria2 runtime receipts onto the three classes. Never emit an empty class."""
    if not isinstance(receipts, list) or not receipts:
        raise observer.ObserverError('protection_record_invalid')
    backup_holds = []
    rollback_holds = []
    projection = []
    for receipt in receipts:
        public = _public_receipt(receipt)
        projection.append(public)
        if public['backupRef'] is not None:
            backup_holds.append(_hold(public['backupRef']))
        if public['rollbackRef'] is not None:
            rollback_holds.append(_hold(public['rollbackRef']))
    digest = observer.evidence_digest({'receipts': projection})
    records = {}
    if backup_holds:
        records['current_or_failed_apply'] = _field_record(observer.BINDINGS['current_or_failed_apply']['named'], backup_holds, digest)
    if rollback_holds:
        records['known_good_rollback'] = _field_record(observer.BINDINGS['known_good_rollback']['named'], rollback_holds, digest)
    return read_cohort(records, scope={'target': 'sgp', 'protocolDirs': ['hysteria2']})


def _public_receipt(receipt):
    if not isinstance(receipt, dict) or _sensitive(receipt):
        raise observer.ObserverError('protection_record_sensitive' if isinstance(receipt, dict) else 'protection_record_invalid')
    status = receipt.get('status')
    if status not in RECEIPT_STATUSES:
        raise observer.ObserverError('protection_record_invalid')
    return {
        'status': status,
        'backupRef': _ref(receipt.get('backupRef')),
        'rollbackRef': _ref(receipt.get('rollbackRef')),
    }


def _ref(value):
    if value is None or value == '':
        return None
    if not isinstance(value, str) or SAFE_REF.fullmatch(value) is None or '/' in value or value in ('.', '..'):
        raise observer.ObserverError('protection_record_invalid')
    return value


def _hold(ref):
    path = COHORT_DIR + '/' + ref
    if not _exact_path(path):
        raise observer.ObserverError('protection_record_invalid')
    return path


def _field_record(source_id, holds, digest):
    unique = sorted(set(holds))
    if len(unique) != len(holds):
        holds = unique
    return {
        'kind': VERIFIED_KIND,
        'sourceId': source_id,
        'bodyDigest': digest,
        'status': 'present',
        'holds': holds,
    }


def _sensitive(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if _normalized(key) in SENSITIVE_KEYS or _sensitive(item):
                return True
    elif isinstance(value, list):
        return any(_sensitive(item) for item in value)
    return False


def _normalized(value):
    return ''.join(char for char in str(value).lower() if char.isalnum())


def _hy2_scope(scope):
    return isinstance(scope, dict) and scope.get('target') == 'sgp' and scope.get('protocolDirs') == ['hysteria2']


def _exact_path(path):
    if not isinstance(path, str) or not path.startswith('/') or '\x00' in path:
        return False
    pure = PurePosixPath(path)
    return str(pure) == path and '..' not in pure.parts


def _result(disposition, observations, review):
    public = {}
    read_holds = []
    for name in observer.REQUIRED:
        public[name] = observations[name]['status']
        read_holds.extend(observations[name].get('holds') or ())
    unique_holds = sorted(set(read_holds))
    if len(unique_holds) != len(read_holds):
        raise observer.ObserverError('duplicate_hold')
    return {
        'cohort': observer.COHORT,
        'disposition': disposition,
        'deletionApproved': False,
        'observations': public,
        'readHolds': unique_holds,
        'review': review,
    }
