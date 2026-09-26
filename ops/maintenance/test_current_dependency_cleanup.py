"""Synthetic source integration only; no network or production reads."""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import unittest
from unittest import mock

import current_dependency_cleanup as cleanup
import edge_backup_execute as core
import edge_backup_manifest as manifests
import test_edge_backup_manifest as manifest_tests
import test_edge_backup_execute as executor_tests

NOW = manifest_tests.NOW


def snapshot(count=23):
    value = manifest_tests.ContractTests().snapshot(count)
    value['scope']['protocolDirs'] = ['hysteria2']
    value['scope']['allowedNames'] = sorted(manifests.ALLOWED_NAMES)
    for row in value['directories']:
        row['path'] = row['path'].replace('/xray', '/hysteria2')
    for row in value['entries']:
        row['path'] = row['path'].replace('/xray/', '/hysteria2/')
    value['entriesFingerprint'] = manifests.entries_fingerprint(value['entries'])
    value['digest'] = manifests.manifest_digest(value)
    return value


class Guard:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def initialize(self, scope):
        self.calls.append('initial')
        return {'complete': True, 'evidenceDigest': 'c' * 64, 'holds': []}

    def read_protection(self, scope):
        self.calls.append('refresh')
        return {'complete': True, 'evidenceDigest': 'c' * 64, 'holds': []}

    def validate_final(self, scope):
        self.calls.append('final')
        return {'initializationPassed': True, 'evidenceDigest': 'c' * 64}

    def public_summary(self):
        return {'candidateCount': len(self.rows), 'candidateReferenceCount': 0,
                'inFlightApply': False, 'initializationPassed': True, 'units': [],
                'state': 'initialized', 'observations': len(self.calls)}


class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.patch = mock.patch.object(cleanup.guard_module, 'CurrentDependencyGuard', side_effect=Guard)
        self.factory = self.patch.start()
        self.addCleanup(self.patch.stop)

    def prepared(self, holds=None):
        return cleanup.prepare(snapshot(), declared_holds=[] if holds is None else holds, observe=True)

    def approval(self, document):
        return {'schemaVersion': 1, 'type': 'edge-backup-retention-approval', 'approved': True,
                'manifestDigest': document['digest'], 'sourceDigest': core.source_digest(),
                'observerSourceDigest': cleanup.observer_source_digest(),
                'protectionPolicy': copy.deepcopy(cleanup.POLICY),
                'irreversibleDisposalAccepted': True, 'retry': False,
                'exclusiveMaintenanceConfirmed': True,
                'batchSize': 100,
                'target': 'sgp', 'hostname': core.HOSTS['sgp'],
                'notBefore': (NOW - dt.timedelta(minutes=1)).isoformat(),
                'expiresAt': (NOW + dt.timedelta(minutes=10)).isoformat(),
                'runId': 'synthetic-cleanup-001',
                'receiptPath': core.RECEIPT_PARENT + '/synthetic-cleanup-001.jsonl',
                'attemptReceiptPath': core.RECEIPT_PARENT + '/synthetic-cleanup-001-wrapper.jsonl',
                'quarantinePath': core.QUARANTINE_PARENT + '/synthetic-cleanup-001',
                'candidatePaths': [r['path'] for r in document['entries'] if r['disposition'] == 'candidate'],
                'directoryBindings': {r['path']: {k: r['identity'][k] for k in core.IMMUTABLE_DIR_KEYS}
                                      for r in document['directories']}}

    def test_default_is_plan_only_full_lists_without_claiming_dependencies(self):
        raw = snapshot()
        original = copy.deepcopy(raw)
        result = cleanup.prepare(raw, declared_holds=[])
        self.factory.assert_not_called()
        self.assertEqual(result['state'], 'proposal_current_dependencies_not_checked')
        self.assertFalse(result['currentDependencyReviewComplete'])
        self.assertEqual(result['protectionPolicy'], cleanup.POLICY)
        self.assertEqual((len(result['proposedEntries']), len(result['protectedEntries'])), (3, 20))
        self.assertEqual(raw, original)
        self.assertFalse(result['deletionApproved'])

    def test_declared_holds_protect_exact_file_and_missing_hold_refuses(self):
        raw = snapshot()
        held = raw['entries'][0]['path']
        plan = cleanup.prepare(raw, declared_holds=[held])
        self.assertEqual(len(plan['proposedEntries']), 2)
        self.assertIn(held, [r['path'] for r in plan['protectedEntries']])
        with self.assertRaisesRegex(core.ExecuteError, 'declared_hold_not_observed'):
            cleanup.prepare(raw, declared_holds=[held + '-missing'])

    def test_partial_scope_unsafe_metadata_or_changed_digest_never_observed(self):
        for change in ('partial', 'scope', 'link', 'digest'):
            raw = snapshot()
            if change == 'partial':
                raw['complete'] = False
            elif change == 'scope':
                raw['scope']['target'] = 'jp'
            elif change == 'link':
                raw['entries'][0]['metadata']['nlink'] = 2
                raw['entriesFingerprint'] = manifests.entries_fingerprint(raw['entries'])
            if change != 'digest':
                raw['digest'] = manifests.manifest_digest(raw)
            else:
                raw['digest'] = '0' * 64
            with self.subTest(change=change), self.assertRaises((core.ExecuteError, manifests.ManifestError)):
                cleanup.prepare(raw, declared_holds=[], observe=True)
        self.factory.assert_not_called()

    def test_real_guard_boundary_generates_policy_bound_review_not_historical_empty(self):
        document = self.prepared([snapshot()['entries'][0]['path']])
        self.assertEqual(document['protectionPolicy'], cleanup.POLICY)
        self.assertTrue(document['protectionReview']['complete'])
        self.assertEqual(document['protectionReview']['holds'], [snapshot()['entries'][0]['path']])
        self.assertNotEqual(document['protectionReview']['evidenceDigest'], 'c' * 64)
        self.assertEqual(document['summary']['candidateCount'], 2)
        core.validate_manifest(document)

    def test_observer_refreshes_guard_and_refuses_drift_through_existing_core(self):
        document = self.prepared()
        observer = cleanup.CurrentOnlyObserver([r for r in document['entries'] if r['disposition'] == 'candidate'], [])
        core.check_protection(document, document['scope'], observer)
        core.check_protection(document, document['scope'], observer)
        self.assertEqual(observer.guard.calls, ['initial', 'refresh'])
        with mock.patch.object(observer.guard, 'read_protection', return_value={
                'complete': True, 'evidenceDigest': 'd' * 64, 'holds': []}):
            with self.assertRaisesRegex(core.ExecuteError, 'protection_reference_changed'):
                core.check_protection(document, document['scope'], observer)

    def test_no_candidates_does_not_probe_or_create_an_approved_manifest(self):
        result = cleanup.prepare(snapshot(20), declared_holds=[], observe=True)
        self.assertEqual(result['state'], 'no_candidates_no_execution')
        self.factory.assert_not_called()

    def test_dry_run_does_not_observe_or_write(self):
        document = self.prepared()
        self.factory.reset_mock()
        with mock.patch.object(core, 'Receipt') as receipt:
            result = cleanup.run(document, self.approval(document))
        self.factory.assert_not_called()
        receipt.assert_not_called()
        self.assertEqual(result['state'], 'dry_run')

    def test_precise_approval_scope_and_coordination_before_attempt(self):
        document = self.prepared()
        for key, value in (('exclusiveMaintenanceConfirmed', False), ('attemptReceiptPath', '/tmp/arbitrary'),
                           ('batchSize', 999),
                           ('observerSourceDigest', '0' * 64), ('candidatePaths', self.approval(document)['candidatePaths'][:1])):
            approval = self.approval(document)
            approval[key] = value
            with self.subTest(key=key), mock.patch.object(core, 'Receipt') as receipt:
                with self.assertRaises(core.ExecuteError):
                    cleanup.run(document, approval, apply=True, clock=lambda: NOW, hostname=lambda: core.HOSTS['sgp'])
                receipt.assert_not_called()

    def test_attempt_consumed_before_guard_core_and_result_has_no_natural_metering_claim(self):
        document = self.prepared()
        events = []
        receipt = mock.Mock()
        receipt.append.side_effect = lambda event: events.append(event)
        def execute(doc, approval, **kwargs):
            self.assertEqual(events[0]['event'], 'current_only_attempt_consumed')
            core.check_protection(doc, doc['scope'], kwargs['observer'])
            return {'state': 'completed', 'deletedCount': 3, 'quarantinedCount': 0,
                    'protectionPolicy': copy.deepcopy(cleanup.POLICY), 'retry': False}
        with mock.patch.object(core, 'Receipt', return_value=receipt), mock.patch.object(core, 'execute', side_effect=execute), \
                mock.patch.object(cleanup, 'space', return_value={'freeBytes': 123, 'freeInodes': 456}), \
                mock.patch.object(cleanup, 'verify_protected', return_value=20):
            result = cleanup.run(document, self.approval(document), apply=True,
                                 clock=lambda: NOW, hostname=lambda: core.HOSTS['sgp'])
        self.assertEqual(result['state'], 'completed_protected_verified')
        self.assertEqual(result['protectedCountVerified'], 20)
        self.assertEqual(result['meteringValidation'], 'not_performed')
        self.assertEqual(events[-1]['protectionPolicy'], cleanup.POLICY)
        receipt.close.assert_called_once()

    def test_unknown_core_result_never_claims_zero_or_retries(self):
        document = self.prepared()
        with mock.patch.object(core, 'Receipt'), mock.patch.object(core, 'execute', side_effect=OSError('private')), \
                mock.patch.object(cleanup, 'space', return_value={}), \
                mock.patch.object(cleanup, 'verify_protected', return_value=20):
            result = cleanup.run(document, self.approval(document), apply=True,
                                 clock=lambda: NOW, hostname=lambda: core.HOSTS['sgp'])
        self.assertEqual(result['state'], 'core_dispatch_result_unknown')
        self.assertIsNone(result['deletedCount'])
        self.assertFalse(result['retry'])
        self.assertNotIn('private', str(result))

    def test_postcheck_failure_preserves_confirmed_deletions(self):
        document = self.prepared()
        def execute(doc, approval, **kwargs):
            core.check_protection(doc, doc['scope'], kwargs['observer'])
            return {'state': 'completed', 'deletedCount': 3, 'quarantinedCount': 0,
                    'protectionPolicy': copy.deepcopy(cleanup.POLICY), 'retry': False}
        with mock.patch.object(core, 'Receipt'), mock.patch.object(core, 'execute', side_effect=execute), \
                mock.patch.object(cleanup, 'space', return_value={}), \
                mock.patch.object(cleanup, 'verify_protected', side_effect=[20, OSError('private')]):
            result = cleanup.run(document, self.approval(document), apply=True,
                                 clock=lambda: NOW, hostname=lambda: core.HOSTS['sgp'])
        self.assertEqual(result['state'], 'postcheck_failed_after_core')
        self.assertEqual(result['confirmedDeletedCount'], 3)
        self.assertFalse(result['retry'])

    def test_partial_core_quarantine_counter_is_not_confirmed_recoverable_files(self):
        document = self.prepared()
        def execute(doc, approval, **kwargs):
            core.check_protection(doc, doc['scope'], kwargs['observer'])
            return {'state': 'stopped_partial_or_unknown', 'deletedCount': 0, 'quarantinedCount': 1,
                    'protectionPolicy': copy.deepcopy(cleanup.POLICY), 'retry': False}
        with mock.patch.object(core, 'Receipt'), mock.patch.object(core, 'execute', side_effect=execute), \
                mock.patch.object(cleanup, 'space', return_value={}), \
                mock.patch.object(cleanup, 'verify_protected', return_value=20):
            result = cleanup.run(document, self.approval(document), apply=True,
                                 clock=lambda: NOW, hostname=lambda: core.HOSTS['sgp'])
        self.assertIsNone(result['confirmedQuarantinedCount'])
        self.assertEqual(result['pendingQuarantineRecordCount'], 1)


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'O_NOFOLLOW') and os.getuid() == 0,
                     'Linux root-owned disposable directory binding integration')
class LinuxCleanupTests(unittest.TestCase):
    def setUp(self):
        self.fixture = executor_tests.ExecutorTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        scope = copy.deepcopy(self.fixture.document['scope'])
        patch = mock.patch.object(cleanup, 'SCOPE', scope)
        patch.start()
        self.addCleanup(patch.stop)
        patch = mock.patch.object(cleanup.guard_module, 'CurrentDependencyGuard', side_effect=Guard)
        patch.start()
        self.addCleanup(patch.stop)
        raw = manifests.snapshot_metadata(scope, observed_at=NOW)
        self.document = cleanup.prepare(raw, declared_holds=[], observe=True)
        self.approval = CleanupTests().approval(self.document)

    def apply(self):
        return cleanup.run(self.document, self.approval, apply=True,
                           clock=lambda: NOW, hostname=lambda: core.HOSTS['sgp'])

    def test_exact_disposable_files_removed_protected_kept_receipts_and_replay_refused(self):
        result = self.apply()
        self.assertEqual(result['state'], 'completed_protected_verified')
        self.assertEqual(result['deletedCount'], 3)
        self.assertEqual(result['protectedCountVerified'], 20)
        self.assertEqual(len(list(self.fixture.protocol.iterdir())), 20)
        events = [json.loads(line) for line in Path(self.approval['attemptReceiptPath']).read_text().splitlines()]
        self.assertEqual(events[0]['event'], 'current_only_attempt_consumed')
        self.assertEqual(events[-1]['state'], 'completed_protected_verified')
        with self.assertRaises(FileExistsError):
            self.apply()

    def test_guard_unknown_consumes_attempt_without_deleting_any_file(self):
        with mock.patch.object(Guard, 'initialize', side_effect=cleanup.guard_module.GuardError(
                'dependency_probe_incomplete', unit_role='candidate', unit_field='ExecStart',
                input_role='systemd_units', predicate='unknown_service_identity')):
            result = self.apply()
        self.assertEqual(result['state'], 'core_stopped_partial_or_unknown')
        self.assertIsNone(result['deletedCount'])
        self.assertEqual(result['confirmedDeletedCount'], 0)
        self.assertEqual(len(list(self.fixture.protocol.iterdir())), 23)
        self.assertTrue(Path(self.approval['attemptReceiptPath']).exists())
        self.assertEqual(result['currentDependencyRefusal']['errorCode'], 'dependency_probe_incomplete')
        self.assertEqual(result['currentDependencyRefusal']['unitRole'], 'candidate')
        self.assertEqual(result['currentDependencyRefusal']['unitField'], 'ExecStart')
        with self.assertRaises(FileExistsError):
            self.apply()

    def test_unlink_then_fsync_failure_never_claims_a_recoverable_quarantined_file(self):
        real_unlink, real_fsync = core.os.unlink, core.os.fsync
        fail_next = [False]
        def unlink(path, **kwargs):
            result = real_unlink(path, **kwargs)
            if str(path).startswith('item-'):
                fail_next[0] = True
            return result
        def fsync(fd):
            if fail_next[0]:
                fail_next[0] = False
                raise OSError('synthetic_fsync_after_unlink')
            return real_fsync(fd)
        with mock.patch.object(core.os, 'unlink', side_effect=unlink), \
                mock.patch.object(core.os, 'fsync', side_effect=fsync):
            result = self.apply()
        self.assertEqual(result['state'], 'core_stopped_partial_or_unknown')
        self.assertEqual(len(list(self.fixture.protocol.iterdir())), 22)
        self.assertEqual(list(Path(self.approval['quarantinePath']).iterdir()), [])
        self.assertIsNone(result['deletedCount'])
        self.assertIsNone(result['confirmedQuarantinedCount'])
        self.assertEqual(result['pendingQuarantineRecordCount'], 1)
        self.assertEqual(result['protectedCountVerified'], 20)


if __name__ == '__main__':
    unittest.main()
