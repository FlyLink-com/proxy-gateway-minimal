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

    def test_unknown_apply_blocks_before_an_unwired_ledger(self):
        review = observer.derive_review({
            'current_or_failed_apply': item('unknown'),
            'known_good_rollback': item('unwired'),
            'incident_reconciliation': item('unwired'),
        })
        self.assertFalse(review['complete'])
        self.assertEqual(review['reason'], 'current_or_failed_apply_unknown')

    def test_present_hold_is_kept_once(self):
        review = observer.derive_review({
            'current_or_failed_apply': item('present', ['/var/backups/gccgw-edge/hysteria2/keep.bak']),
            'known_good_rollback': item('empty'),
            'incident_reconciliation': item('empty'),
        })
        self.assertEqual(review['holds'], ['/var/backups/gccgw-edge/hysteria2/keep.bak'])


if __name__ == '__main__':
    unittest.main()
