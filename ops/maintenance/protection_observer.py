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
    """observations maps each required class to empty, present, unwired, or unknown.

    present carries holds. unwired and unknown cannot become an empty-hold approval.
    """
    if set(observations) != set(REQUIRED):
        raise ObserverError('protection_classes_incomplete')
    holds = []
    for name in REQUIRED:
        item = observations[name]
        status = item.get('status')
        if status in ('unwired', 'unknown'):
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
