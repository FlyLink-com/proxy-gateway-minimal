import unittest

import dependency_admission as admission

CURRENT = '/var/backups/gccgw-edge/hysteria2'
RELEASE = '/opt/proxy-gateway-minimal-candidate/releases/example'
LIVE = '/opt/proxy-gateway-minimal-candidate/current'


class CandidateScriptTests(unittest.TestCase):
    def test_only_the_three_known_entry_suffixes_pass(self):
        self.assertTrue(admission.candidate_script_allowed('candidate-start.mjs', RELEASE, LIVE))
        self.assertTrue(admission.candidate_script_allowed(RELEASE + '/server/index.mjs', RELEASE, LIVE))
        self.assertFalse(admission.candidate_script_allowed('server/candidate-start.mjs', RELEASE, LIVE))
        self.assertFalse(admission.candidate_script_allowed('other.mjs', RELEASE, LIVE))


class EnvPrecedenceTests(unittest.TestCase):
    def projections(self, agent):
        return {
            'sgp': {'EDGE_HYSTERIA2_BACKUP_DIR': CURRENT},
            'runtime': {'EDGE_HYSTERIA2_BACKUP_DIR': CURRENT},
            'agent': {'EDGE_HYSTERIA2_BACKUP_DIR': agent},
        }

    def test_outside_agent_directory_keeps_the_current_directory(self):
        merged = admission.merge_env_projections(self.projections('/tmp/other-backup'), CURRENT)
        self.assertEqual(merged['EDGE_HYSTERIA2_BACKUP_DIR'], CURRENT)

    def test_inside_parent_and_other_keys_still_refuse(self):
        for agent in (CURRENT + '/child', '/var/backups/gccgw-edge'):
            with self.assertRaises(admission.AdmissionError):
                admission.merge_env_projections(self.projections(agent), CURRENT)
        mismatched = self.projections('/tmp/other-backup')
        mismatched['agent']['EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH'] = '/etc/other.yaml'
        mismatched['sgp']['EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH'] = '/etc/hysteria/config.yaml'
        with self.assertRaises(admission.AdmissionError):
            admission.merge_env_projections(mismatched, CURRENT)


class NamespaceObjectTests(unittest.TestCase):
    def test_mount_difference_still_allows_an_inode_comparison(self):
        admission.namespace_allows_object_check(True, True)
        with self.assertRaises(admission.AdmissionError):
            admission.namespace_allows_object_check(False, True)
        paths, inodes = {'/backup/a'}, {(7, 11)}
        self.assertEqual(admission.object_reference('/backup/a', (7, 11), paths, inodes), 1)
        with self.assertRaises(admission.AdmissionError) as failure:
            admission.object_reference('/backup/a', (9, 9), paths, inodes)
        self.assertEqual(str(failure.exception), 'alias_unclear')


class CertificateAncestorTests(unittest.TestCase):
    def test_only_index_two_of_cert_and_key_accepts_the_shared_owner(self):
        policy = admission.CertificateAncestorPolicy({'hy2': 900, 'edge': 901, 'candidate': 900})
        policy.bind('/var/lib/hy2-certs/live/fullchain.pem', '/var/lib/hy2-certs/live/privkey.pem')
        allowed, role = policy.allowed_owners('/var/lib', 'hy2_runtime_reference')
        self.assertEqual((allowed, role), ({0, 900}, 'hy2_certificate_ancestor'))
        deeper, deeper_role = policy.allowed_owners('/var/lib/hy2-certs', 'hy2_runtime_reference')
        self.assertEqual((deeper, deeper_role), ({0, 900}, 'hy2_certificate_ancestor'))
        live, live_role = policy.allowed_owners('/var/lib/hy2-certs/live', 'hy2_runtime_reference')
        self.assertEqual((live, live_role), ({0, 900}, 'hy2_certificate_ancestor'))
        self.assertNotIn(901, allowed)
        self.assertEqual(policy.allowed_owners('/var/lib/other', 'hy2_runtime_reference'), ({0}, 'other_root'))
        separate = admission.CertificateAncestorPolicy({'hy2': 900, 'edge': 901, 'candidate': 902})
        separate.bind('/var/lib/hy2-certs/live/fullchain.pem', '/var/lib/hy2-certs/live/privkey.pem')
        self.assertEqual(separate.allowed_owners('/var/lib', 'hy2_runtime_reference'), ({0}, 'other_root'))


if __name__ == '__main__':
    unittest.main()
