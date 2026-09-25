import unittest

import protection_observer as observer


def item(status, holds=()):
    return {'status': status, 'holds': list(holds)}


class ProtectionObserverTests(unittest.TestCase):
    def test_unwired_sources_do_not_become_an_empty_approval(self):
        review = observer.derive_review({
            'current_or_failed_apply': item('empty'),
            'known_good_rollback': item('unwired'),
            'incident_reconciliation': item('unwired'),
        })
        self.assertFalse(review['complete'])
        self.assertEqual(review['holds'], [])
        self.assertEqual(review['reason'], 'known_good_rollback_unwired')
        self.assertNotEqual(review['evidenceDigest'], 'b' * 64)
        self.assertEqual(len(review['evidenceDigest']), 64)

    def test_explicit_empty_observations_can_complete_without_a_placeholder(self):
        review = observer.derive_review({name: item('empty') for name in observer.REQUIRED})
        self.assertTrue(review['complete'])
        self.assertEqual(review['holds'], [])
        self.assertEqual(review['reason'], 'explicit_review')
        self.assertNotEqual(review['evidenceDigest'], 'b' * 64)

    def test_unresolved_rollback_is_not_an_empty_hold_approval(self):
        review = observer.derive_review({
            'current_or_failed_apply': item('empty'),
            'known_good_rollback': item('unresolved'),
            'incident_reconciliation': item('unwired'),
        })
        self.assertFalse(review['complete'])
        self.assertEqual(review['holds'], [])
        self.assertEqual(review['reason'], 'known_good_rollback_unresolved')

    def test_unknown_apply_blocks_before_an_unwired_ledger(self):
        review = observer.derive_review({
            'current_or_failed_apply': item('unknown'),
            'known_good_rollback': item('unwired'),
            'incident_reconciliation': item('unwired'),
        })
        self.assertFalse(review['complete'])
        self.assertEqual(review['reason'], 'current_or_failed_apply_unknown')

    def test_unnamed_hy2_sources_retain_the_cohort(self):
        retained = observer.cohort_retention()
        self.assertEqual(retained['cohort'], 'singapore-hysteria2-backup')
        self.assertEqual(retained['disposition'], 'retained')
        self.assertEqual(retained['observations'], {
            'current_or_failed_apply': 'unresolved',
            'known_good_rollback': 'unresolved',
            'incident_reconciliation': 'unwired',
        })
        self.assertFalse(retained['review']['complete'])
        self.assertEqual(retained['review']['holds'], [])
        self.assertEqual(retained['review']['reason'], 'current_or_failed_apply_unresolved')

    def test_backup_ref_last_report_and_open_files_stay_unresolved(self):
        for proxy in ('omitted_backup_ref', 'last_report', 'open_file_absence'):
            observation = observer.proxy_observation('current_or_failed_apply', proxy)
            self.assertEqual(observation['status'], 'unresolved')
            self.assertEqual(observation['holds'], [])
            self.assertEqual(observation['proxyRejected'], proxy)
        self.assertEqual(
            observer.proxy_observation('known_good_rollback', 'missing_approved_reference')['status'],
            'unresolved')
        self.assertEqual(
            observer.proxy_observation('incident_reconciliation', 'missing_ledger')['status'],
            'unwired')

    def test_unnamed_source_cannot_be_marked_empty(self):
        observations = observer.bound_observations()
        observations['current_or_failed_apply'] = item('empty')
        with self.assertRaises(observer.ObserverError) as failure:
            observer.cohort_retention(observations)
        self.assertEqual(str(failure.exception), 'absent_source_cannot_be_empty')

    def test_present_hold_is_kept_once(self):
        review = observer.derive_review({
            'current_or_failed_apply': item('present', ['/var/backups/gccgw-edge/hysteria2/keep.bak']),
            'known_good_rollback': item('empty'),
            'incident_reconciliation': item('empty'),
        })
        self.assertEqual(review['holds'], ['/var/backups/gccgw-edge/hysteria2/keep.bak'])


if __name__ == '__main__':
    unittest.main()
