"""Explicit one-off SGP Hy2 current-dependency disposition, not an installer.

prepare defaults to a pure full-list proposal. observe=True is a separately
authorized host READ. run defaults to dry-run; apply=True needs exact approval.
Historical rollback/incident responsibility is NOT assessed under this policy.
No database, backup body, SSH, service control, renewal or recurring task here.
"""
import copy
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import socket

import current_dependency_guard as guard_module
import edge_backup_execute as core
import edge_backup_manifest as manifests

POLICY = {'id': 'current-dependencies-only-v1', 'historicalCoverage': 'not_assessed',
          'extraHolds': 'declared_only'}
SCOPE = {'root': core.ROOT, 'target': 'sgp', 'protocolDirs': ['hysteria2'],
         'allowedNames': sorted(manifests.ALLOWED_NAMES)}


def require(condition, code):
    if not condition:
        raise core.ExecuteError(code)


def observer_source_digest():
    """Bind adapter AND the concrete read-only Linux implementation."""
    hasher = hashlib.sha256()
    for name in ('current_dependency_cleanup.py', 'current_dependency_guard.py'):
        hasher.update(name.encode('ascii') + b'\0' + hashlib.sha256(Path(__file__).with_name(name).read_bytes()).digest())
    return hasher.hexdigest()


def declared_holds(value, scope, entries, directories):
    review = manifests._review({'complete': False, 'evidenceDigest': '0' * 64, 'holds': value}, scope)
    observed = {r['path'] for r in entries} | {r['path'] for r in directories}
    require(set(review['holds']) <= observed, 'declared_hold_not_observed')
    return review['holds']


def propose(snapshot, holds):
    """Retention-only eligibility, never manufacture a complete protection review."""
    scope, observed_at = manifests._validate_snapshot(snapshot)
    require(scope == SCOPE, 'current_only_scope_invalid')
    require(snapshot['complete'] is True and snapshot['blockers'] == [], 'complete_snapshot_required')
    require(len(snapshot['entries']) <= core.MAX_ENTRIES, 'manifest_budget_exceeded')
    holds = declared_holds(holds, scope, snapshot['entries'], snapshot['directories'])
    now_ns = manifests.epoch_ns(observed_at)
    cutoff = now_ns - manifests.POLICY['keepDays'] * 86400 * 1000000000
    classified, groups = [], {}
    for row in snapshot['entries']:
        core.validate_metadata(row['metadata'])
        reason, known = manifests._recognize(row, scope['allowedNames'], now_ns)
        classified.append((row, reason, known))
        if known:
            group, rank = known
            groups.setdefault(group, []).append(rank)
    newest = {group: set(sorted(ranks)[-20:]) for group, ranks in groups.items()}
    proposed, protected = [], []
    for row, reason, known in classified:
        reasons = [reason] if reason else []
        if core.covered_by_hold(row['path'], holds):
            reasons.append('declared_hold')
        if known:
            group, rank = known
            if rank[0] >= cutoff:
                reasons.append('within_30_days')
            if rank in newest[group]:
                reasons.append('latest_20')
        item = {**copy.deepcopy(row), 'reasons': reasons or ['retention_eligible_current_dependencies_unchecked']}
        (protected if reasons else proposed).append(item)
    require(len(proposed) <= core.MAX_APPROVED_FILES, 'one_record_candidate_budget_exceeded')
    result = {'schemaVersion': 1, 'type': 'current-dependency-cleanup-proposal',
              'state': 'proposal_current_dependencies_not_checked',
              'protectionPolicy': dict(POLICY), 'snapshotDigest': snapshot['digest'],
              'scope': scope, 'observedAt': snapshot['observedAt'],
              'declaredHolds': holds, 'currentDependencyReviewComplete': False,
              'deletionApproved': False, 'deletedCount': 0,
              'proposedEntries': proposed, 'protectedEntries': protected,
              'summary': {'entryCount': len(snapshot['entries']), 'proposedCount': len(proposed),
                          'protectedCount': len(protected),
                          'proposedLogicalBytes': sum(r['metadata']['size'] for r in proposed),
                          'proposedAllocatedBytes': sum(r['metadata']['blocks'] * 512 for r in proposed)}}
    result['digest'] = manifests.manifest_digest(result)
    return result


class CurrentOnlyObserver(core.ProtectionObserver):
    policy_id = POLICY['id']

    def __init__(self, candidate_entries, holds):
        self.guard = guard_module.CurrentDependencyGuard(copy.deepcopy(candidate_entries))
        self.holds = tuple(holds)
        self.initialized = False
        self.source_digest = observer_source_digest()
        self.guard_evidence = None
        self.refusal = None

    def read_protection(self, scope):
        require(scope == SCOPE, 'current_only_scope_invalid')
        try:
            actual = (self.guard.read_protection(scope) if self.initialized else self.guard.initialize(scope))
        except guard_module.GuardError as error:
            self.refusal = safe_guard_error(error)
            raise
        core.validate_review(actual)
        require(actual['holds'] == [], 'unexpected_guard_hold_contract')
        self.initialized = True
        self.guard_evidence = actual['evidenceDigest']
        # complete describes ONLY this policy's current dependency check.
        # Declared holds are retained, never interpreted as historical emptiness.
        evidence = core.canonical_digest({'protectionPolicy': POLICY,
            'currentDependencyEvidence': actual['evidenceDigest'], 'declaredHolds': list(self.holds)})
        return {'complete': True, 'evidenceDigest': evidence, 'holds': list(self.holds)}

    def final(self):
        require(self.initialized, 'current_dependency_not_initialized')
        try:
            value = self.guard.validate_final(copy.deepcopy(SCOPE))
        except guard_module.GuardError as error:
            self.refusal = safe_guard_error(error)
            raise
        require(value.get('initializationPassed') is True and value.get('evidenceDigest') == self.guard_evidence,
                'final_current_dependency_check_failed')
        return safe_guard_summary(self.guard)


def safe_guard_summary(guard):
    value = guard.public_summary()
    result = {'coverage': 'current_dependencies_only', 'historicalCoverage': 'not_assessed'}
    for key in ('candidateCount', 'candidateReferenceCount', 'observations'):
        if type(value.get(key)) is int and value[key] >= 0:
            result[key] = value[key]
    for key in ('inFlightApply', 'initializationPassed'):
        if type(value.get(key)) is bool:
            result[key] = value[key]
    units = []
    for row in value.get('units', []):
        if row.get('name') not in guard_module.UNITS:
            continue
        item = {'name': row['name']}
        for field in ('activeState', 'subState'):
            if row.get(field) in ('active', 'inactive', 'failed', 'activating', 'running', 'dead', 'auto-restart', 'exited'):
                item[field] = row[field]
        units.append(item)
    result['units'] = units
    return result


def safe_guard_error(error):
    result = {'errorClass': 'GuardError', 'errorCode': 'dependency_check_refused'}
    if re.fullmatch(r'[a-z0-9_]{1,80}', str(error)):
        result['errorCode'] = str(error)
    context = error.public_diagnostic()
    for key, values in (('inputRole', guard_module.INPUT_ROLES),
                        ('refusalPredicate', guard_module.REFUSAL_PREDICATES),
                        ('ancestorRole', guard_module.ANCESTOR_ROLES),
                        ('unitRole', frozenset(guard_module.UNIT_ROLES.values())),
                        ('unitField', guard_module.UNIT_FIELDS)):
        if isinstance(context.get(key), str) and context[key] in values:
            result[key] = context[key]
    if type(context.get('ancestorIndex')) is int and 0 <= context['ancestorIndex'] <= 16:
        result['ancestorIndex'] = context['ancestorIndex']
    return result


def prepare(snapshot, *, declared_holds, observe=False):
    require(type(observe) is bool, 'explicit_observe_boolean_required')
    proposal = propose(snapshot, declared_holds)
    if not observe:
        return proposal
    if not proposal['proposedEntries']:
        proposal['state'] = 'no_candidates_no_execution'
        proposal['digest'] = manifests.manifest_digest(proposal)
        return proposal
    observer = CurrentOnlyObserver(proposal['proposedEntries'], proposal['declaredHolds'])
    review = observer.read_protection(copy.deepcopy(SCOPE))
    document = manifests.manifest_from_snapshot(copy.deepcopy(snapshot), protection_review=review,
                                                protection_policy=dict(POLICY))
    require(document['complete'] is True and document['blockers'] == [], 'observed_manifest_incomplete')
    actual = [r['path'] for r in document['entries'] if r['disposition'] == 'candidate']
    require(actual == [r['path'] for r in proposal['proposedEntries']], 'observed_candidate_set_changed')
    return document


def space():
    fd = manifests.open_directory(core.ROOT)
    try:
        value = os.fstatvfs(fd)
        return {'availableBytes': value.f_bavail * value.f_frsize,
                'freeBytes': value.f_bfree * value.f_frsize, 'freeInodes': value.f_ffree}
    finally:
        os.close(fd)


def verify_protected(rows, directories):
    for row in directories:
        core.verify_named_directory(row['path'], row['identity'])
    fd = manifests.open_directory(core.ROOT + '/hysteria2')
    try:
        for row in rows:
            require(str(PurePosixPath(row['path']).parent) == core.ROOT + '/hysteria2', 'protected_scope_invalid')
            value = core.metadata(os.stat(PurePosixPath(row['path']).name, dir_fd=fd, follow_symlinks=False))
            require(value == row['metadata'], 'protected_metadata_changed')
        return len(rows)
    finally:
        os.close(fd)


def run(document, approval=None, *, apply=False, batch_size=100, clock=core.utcnow, hostname=socket.gethostname):
    """No dynamic plugin or JSON-provided observer; exact known implementation only."""
    require(type(apply) is bool, 'explicit_apply_boolean_required')
    require(document.get('protectionPolicy') == POLICY, 'current_only_policy_required')
    if not apply:
        return core.execute(document, approval, apply=False)
    require(isinstance(approval, dict) and approval.get('exclusiveMaintenanceConfirmed') is True,
            'exclusive_maintenance_confirmation_required')
    require(approval.get('observerSourceDigest') == observer_source_digest(), 'current_observer_source_mismatch')
    require(approval.get('attemptReceiptPath') == core.RECEIPT_PARENT + '/' + str(approval.get('runId')) + '-wrapper.jsonl',
            'private_attempt_path_invalid')
    require(type(batch_size) is int and 1 <= batch_size <= 1000 and
            type(approval.get('batchSize')) is int and approval['batchSize'] == batch_size,
            'wrapper_batch_size_invalid')
    context = core.validate_manifest(document, directory_bindings=approval.get('directoryBindings'))
    core.validate_approval(document, approval, context, clock(), hostname())
    candidates = [r for r in document['entries'] if r['disposition'] == 'candidate']
    protected = [r for r in document['entries'] if r['disposition'] == 'protected']
    require(approval['candidatePaths'] == [r['path'] for r in candidates], 'full_current_candidate_list_required')
    declared_holds(document['protectionReview']['holds'], context['scope'], document['entries'], document['directories'])
    receipt = core.Receipt(approval['attemptReceiptPath'])
    output = {'state': 'stopped_before_core_dispatch', 'deletedCount': 0, 'confirmedDeletedCount': 0,
              'quarantinedCount': 0, 'protectionPolicy': dict(POLICY), 'retry': False,
              'meteringValidation': 'not_performed', 'protectedCountVerified': None}
    dispatched, returned, observer = False, False, None
    try:
        receipt.append({'event': 'current_only_attempt_consumed', 'approvalDigest': core.canonical_digest(approval),
                        'manifestDigest': document['digest'], 'protectionPolicy': POLICY,
                        'observerSourceDigest': approval['observerSourceDigest'], 'retry': False})
        observer = CurrentOnlyObserver(candidates, document['protectionReview']['holds'])
        output['spaceBefore'] = space()
        require(verify_protected(protected, document['directories']) == len(protected), 'protected_count_mismatch')
        dispatched = True
        result = core.execute(document, approval, observer=observer, apply=True, batch_size=batch_size,
                              clock=clock, hostname=hostname)
        require(isinstance(result, dict) and result.get('state') in
                ('completed', 'stopped_partial_or_unknown', 'receipt_write_failed_result_unknown'), 'invalid_core_result')
        require(result.get('protectionPolicy') == POLICY and result.get('retry') is False and
                all(type(result.get(k)) is int and 0 <= result[k] <= len(candidates)
                    for k in ('deletedCount', 'quarantinedCount')), 'invalid_core_counts_or_policy')
        require(result['state'] != 'completed' or (result['deletedCount'] == len(candidates) and
                result['quarantinedCount'] == 0), 'invalid_core_completion')
        returned = True
        output.update(state='core_' + result['state'], confirmedDeletedCount=result['deletedCount'],
                      confirmedQuarantinedCount=0 if result['state'] == 'completed' else None,
                      pendingQuarantineRecordCount=result['quarantinedCount'])
        output.update(deletedCount=result['deletedCount'] if result['state'] == 'completed' else None,
                      quarantinedCount=0 if result['state'] == 'completed' else None)
        output['spaceAfter'] = space()
        require(verify_protected(protected, document['directories']) == len(protected), 'protected_count_mismatch')
        output['protectedCountVerified'] = len(protected)
        output['currentDependencyAfter'] = observer.final()
        if result['state'] == 'completed':
            output['state'] = 'completed_protected_verified'
    except Exception as error:
        if dispatched and not returned:
            output.update(state='core_dispatch_result_unknown', deletedCount=None, quarantinedCount=None,
                          confirmedDeletedCount=None)
        elif output['state'] == 'core_completed':
            output['state'] = 'postcheck_failed_after_core'
        output['errorClass'] = type(error).__name__ if isinstance(error, (core.ExecuteError, guard_module.GuardError)) else 'verification_error'
        # Never export arbitrary error strings, config paths, command output or credentials.
    finally:
        if observer is not None and observer.refusal is not None:
            output['currentDependencyRefusal'] = observer.refusal
        try:
            receipt.append({'event': 'current_only_terminal', **output, 'at': clock().isoformat()})
        except Exception:
            output['state'] = 'wrapper_receipt_failed_result_unknown'
        try:
            receipt.close()
        except Exception:
            output['state'] = 'wrapper_receipt_failed_result_unknown'
    return output
