"""Derive backup holds from explicit observations. Never echo a manifest boolean."""
import hashlib
import json

REQUIRED = ('current_or_failed_apply', 'known_good_rollback', 'incident_reconciliation')


class ObserverError(ValueError):
    """Static code only."""


def evidence_digest(document):
    raw = json.dumps(document, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')
    return hashlib.sha256(raw).hexdigest()


def derive_review(observations):
    """observations maps each required class to empty, present, unwired, unknown, or unresolved.

    present carries holds. unwired, unknown, and unresolved cannot become an empty-hold approval.
    An explicit empty is valid only after that class's own source was read. The Singapore Hy2
    cohort has no such source; use cohort_retention() for that binding.
    """
    if set(observations) != set(REQUIRED):
        raise ObserverError('protection_classes_incomplete')
    holds = []
    for name in REQUIRED:
        item = observations[name]
        status = item.get('status')
        if status in ('unwired', 'unknown', 'unresolved'):
            digest = evidence_digest({'observations': _public(observations), 'complete': False})
            return {'complete': False, 'holds': [], 'evidenceDigest': digest,
                    'reason': name + '_' + status}
        if status == 'empty':
            if item.get('holds'):
                raise ObserverError('empty_observation_has_holds')
            continue
        if status != 'present':
            raise ObserverError('protection_observation_invalid')
        holds.extend(item.get('holds') or ())
    unique = sorted(set(holds))
    if len(unique) != len(holds):
        raise ObserverError('duplicate_hold')
    digest = evidence_digest({'holds': unique, 'observations': _public(observations), 'complete': True})
    if digest == 'b' * 64:
        raise ObserverError('placeholder_evidence_rejected')
    return {'complete': True, 'holds': unique, 'evidenceDigest': digest, 'reason': 'explicit_review'}


def _public(observations):
    return {name: observations[name]['status'] for name in REQUIRED}


COHORT = 'singapore-hysteria2-backup'

# named stays None until a reviewed change identifies the object. The absent status is the
# binding. not_a_source values are proxies that must not be recorded as an empty hold list.
BINDINGS = {
    'current_or_failed_apply': {
        'named': None,
        'status': 'unresolved',
        'not_a_source': ('omitted_backup_ref', 'last_report', 'open_file_absence'),
    },
    'known_good_rollback': {
        'named': None,
        'status': 'unresolved',
        'not_a_source': ('missing_approved_reference',),
    },
    'incident_reconciliation': {
        'named': None,
        'status': 'unwired',
        'not_a_source': ('missing_ledger',),
    },
}


def bound_observations():
    """Return the named Hy2 binding. No class is empty or present while its source is unnamed."""
    if set(BINDINGS) != set(REQUIRED):
        raise ObserverError('protection_classes_incomplete')
    observations = {}
    for name in REQUIRED:
        binding = BINDINGS[name]
        if binding['named'] is not None:
            raise ObserverError('named_source_requires_a_reader')
        status = binding['status']
        if status not in ('unwired', 'unknown', 'unresolved'):
            raise ObserverError('absent_source_cannot_be_empty')
        observations[name] = {'status': status, 'holds': []}
    return observations


def proxy_observation(name, proxy):
    """Keep a non-source proxy at the absent-source status. Never turn it into empty."""
    if name not in BINDINGS:
        raise ObserverError('protection_classes_incomplete')
    binding = BINDINGS[name]
    if proxy not in binding['not_a_source']:
        raise ObserverError('protection_proxy_unknown')
    if binding['named'] is not None:
        raise ObserverError('named_source_requires_a_reader')
    return {'status': binding['status'], 'holds': [], 'proxyRejected': proxy}


def cohort_retention(observations=None):
    """Retain the whole Hy2 cohort while any required source is still unnamed."""
    if observations is None:
        observations = bound_observations()
    if set(observations) != set(REQUIRED):
        raise ObserverError('protection_classes_incomplete')
    for name in REQUIRED:
        status = observations[name].get('status')
        if BINDINGS[name]['named'] is None and status in ('empty', 'present'):
            raise ObserverError('absent_source_cannot_be_empty')
    review = derive_review(observations)
    if review['complete'] or review['holds']:
        raise ObserverError('absent_sources_cannot_complete')
    return {
        'cohort': COHORT,
        'disposition': 'retained',
        'observations': _public(observations),
        'review': review,
    }
