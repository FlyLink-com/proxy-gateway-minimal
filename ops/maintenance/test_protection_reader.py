import unittest

import edge_backup_execute as execute
import protection_observer as observer
import protection_reader as reader


def named_bindings():
    return {
        name: {
            'named': 'hy2-' + name,
            'status': observer.BINDINGS[name]['status'],
            'not_a_source': observer.BINDINGS[name]['not_a_source'],
        }
        for name in observer.REQUIRED
    }


def verified(name, status, holds=()):
    return {
        'kind': reader.VERIFIED_KIND,
        'sourceId': 'hy2-' + name,
        'bodyDigest': 'a' * 64,
        'status': status,
        'holds': list(holds),
    }


class ProtectionReaderTests(unittest.TestCase):
    def test_default_binding_stays_retained_without_a_host_read(self):
        result = reader.read_cohort(scope={'target': 'sgp', 'protocolDirs': ['hysteria2']})
        self.assertEqual(result['disposition'], 'retained')
        self.assertFalse(result['deletionApproved'])
        self.assertFalse(result['review']['complete'])
        self.assertEqual(result['review']['holds'], [])
        self.assertEqual(result['observations']['current_or_failed_apply'], 'unresolved')
        self.assertEqual(result['observations']['known_good_rollback'], 'unresolved')
        self.assertEqual(result['observations']['incident_reconciliation'], 'unwired')

    def test_receipt_field_cannot_be_declared_empty(self):
        record = verified('current_or_failed_apply', 'empty')
        record['sourceId'] = observer.BINDINGS['current_or_failed_apply']['named']
        with self.assertRaises(observer.ObserverError) as failure:
            reader.read_cohort({'current_or_failed_apply': record})
        self.assertEqual(str(failure.exception), 'receipt_field_cannot_be_empty')

    def test_runtime_receipt_keeps_missing_fields_unresolved(self):
        failed = reader.read_runtime_receipts([{'status': 'failed', 'mutation': False}])
        self.assertEqual(failed['disposition'], 'retained')
        self.assertFalse(failed['deletionApproved'])
        self.assertFalse(failed['review']['complete'])
        self.assertEqual(failed['readHolds'], [])
        self.assertEqual(failed['observations']['current_or_failed_apply'], 'unresolved')
        self.assertEqual(failed['observations']['known_good_rollback'], 'unresolved')
        self.assertEqual(failed['observations']['incident_reconciliation'], 'unwired')
        ref = 'config.yaml.2026_06_08T12_00_00_000Z.bak'
        applied = reader.read_runtime_receipts([{
            'status': 'applied', 'mutation': True, 'backupRef': ref,
        }])
        self.assertEqual(applied['disposition'], 'retained')
        self.assertFalse(applied['review']['complete'])
        self.assertEqual(applied['review']['holds'], [])
        self.assertEqual(applied['readHolds'], ['/var/backups/gccgw-edge/hysteria2/' + ref])
        self.assertEqual(applied['observations']['current_or_failed_apply'], 'present')
        self.assertEqual(applied['observations']['known_good_rollback'], 'unresolved')
        rolled = reader.read_runtime_receipts([{'status': 'rolled_back', 'mutation': True, 'rollbackRef': ref}])
        self.assertEqual(rolled['observations']['known_good_rollback'], 'present')
        self.assertEqual(rolled['observations']['current_or_failed_apply'], 'unresolved')
        self.assertEqual(rolled['readHolds'], ['/var/backups/gccgw-edge/hysteria2/' + ref])

    def test_runtime_receipt_rejects_sensitive_or_empty_input(self):
        with self.assertRaises(observer.ObserverError) as sensitive:
            reader.read_runtime_receipts([{'status': 'failed', 'password': 'secret-value'}])
        self.assertEqual(str(sensitive.exception), 'protection_record_sensitive')
        with self.assertRaises(observer.ObserverError) as empty:
            reader.read_runtime_receipts([])
        self.assertEqual(str(empty.exception), 'protection_record_invalid')

    def test_proxy_and_missing_read_do_not_become_empty(self):
        bindings = named_bindings()
        records = {
            'current_or_failed_apply': {'kind': 'last_report', 'sourceId': 'hy2-current_or_failed_apply'},
            'known_good_rollback': None,
        }
        result = reader.read_cohort(records, bindings)
        self.assertEqual(result['disposition'], 'retained')
        self.assertFalse(result['review']['complete'])
        self.assertEqual(result['observations']['current_or_failed_apply'], 'unresolved')
        self.assertEqual(result['observations']['known_good_rollback'], 'unresolved')
        self.assertEqual(result['observations']['incident_reconciliation'], 'unwired')
        held = reader.read_cohort({
            'current_or_failed_apply': verified(
                'current_or_failed_apply', 'present', ['/var/backups/gccgw-edge/hysteria2/keep.bak']),
        }, bindings)
        self.assertEqual(held['disposition'], 'retained')
        self.assertFalse(held['review']['complete'])
        self.assertEqual(held['review']['holds'], [])
        self.assertEqual(held['readHolds'], ['/var/backups/gccgw-edge/hysteria2/keep.bak'])

    def test_named_source_can_be_read_only_with_a_matching_record(self):
        bindings = named_bindings()
        hold = '/var/backups/gccgw-edge/hysteria2/keep.bak'
        records = {name: verified(name, 'empty') for name in observer.REQUIRED}
        records['current_or_failed_apply'] = verified('current_or_failed_apply', 'present', [hold])
        result = reader.read_cohort(records, bindings)
        self.assertEqual(result['disposition'], 'sources_read')
        self.assertFalse(result['deletionApproved'])
        self.assertTrue(result['review']['complete'])
        self.assertEqual(result['review']['holds'], [hold])
        self.assertNotEqual(result['review']['evidenceDigest'], 'b' * 64)

    def test_placeholder_digest_and_other_scope_are_rejected(self):
        bindings = named_bindings()
        bad = verified('current_or_failed_apply', 'empty')
        bad['bodyDigest'] = 'b' * 64
        with self.assertRaises(observer.ObserverError) as digest_failure:
            reader.read_cohort({'current_or_failed_apply': bad}, bindings)
        self.assertEqual(str(digest_failure.exception), 'protection_source_digest_invalid')
        with self.assertRaises(observer.ObserverError) as scope_failure:
            reader.read_cohort(scope={'target': 'jp', 'protocolDirs': ['hysteria2']})
        self.assertEqual(str(scope_failure.exception), 'protection_scope_not_hy2_cohort')

    def test_production_observer_consults_the_reader_and_still_refuses(self):
        with self.assertRaises(execute.ExecuteError) as failure:
            execute.ProtectionObserver().read_protection({'target': 'sgp', 'protocolDirs': ['hysteria2']})
        self.assertEqual(str(failure.exception), 'production_protection_observer_not_wired')
        with self.assertRaises(execute.ExecuteError) as scope_failure:
            execute.ProtectionObserver().read_protection({'target': 'jp', 'protocolDirs': ['hysteria2']})
        self.assertEqual(str(scope_failure.exception), 'protection_scope_not_hy2_cohort')


if __name__ == '__main__':
    unittest.main()
