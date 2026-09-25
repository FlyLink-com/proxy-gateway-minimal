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

    def test_unnamed_binding_rejects_a_supplied_record(self):
        records = {'current_or_failed_apply': verified('current_or_failed_apply', 'empty')}
        with self.assertRaises(observer.ObserverError) as failure:
            reader.read_cohort(records)
        self.assertEqual(str(failure.exception), 'unnamed_source_cannot_be_read')

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
