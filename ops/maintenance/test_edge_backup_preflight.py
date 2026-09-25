import datetime as dt
import stat
import unittest

import edge_backup_execute as execute
import edge_backup_preflight as preflight

NOW = dt.datetime(2026, 9, 24, 12, tzinfo=dt.timezone.utc)


def row(result='match', reason='program_match'):
    return {
        'unitRole': 'candidate', 'unitField': 'ExecStart', 'ruleId': 'exec_program',
        'result': result, 'reasonCode': reason,
        'evidenceRef': 'candidate/exec_program', 'observedAt': NOW.isoformat(),
    }


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.paths = [execute.ROOT, execute.ROOT + '/hysteria2']
        self.document = {
            'schemaVersion': 1, 'type': 'edge-backup-retention-manifest',
            'complete': True, 'blockers': [], 'policy': dict(execute.POLICY),
            'scope': {'root': execute.ROOT, 'target': 'sgp', 'protocolDirs': ['hysteria2'],
                      'allowedNames': sorted(execute.retention.ALLOWED_NAMES)},
            'observedAt': NOW.isoformat(), 'entries': [],
            'protectionReview': {'complete': True, 'evidenceDigest': 'b' * 64, 'holds': []},
            'directories': [],
        }
        for index, path in enumerate(self.paths):
            info = dict.fromkeys(execute.META_KEYS, 0)
            info.update(dev=10, ino=index + 1, mode=stat.S_IFDIR | 0o700, nlink=2, uid=996, gid=987)
            self.document['directories'].append({'path': path, 'identity': info})
        self.document['digest'] = execute.canonical_digest(self.document)
        self.bindings = {item['path']: {key: item['identity'][key] for key in execute.IMMUTABLE_DIR_KEYS}
                         for item in self.document['directories']}

    def test_dry_run_is_not_this_preflight(self):
        dry = execute.execute(self.document, {'directoryBindings': self.bindings})
        self.assertEqual(dry['state'], 'dry_run')
        self.assertFalse(dry['productionObserverWired'])
        self.assertNotIn('serviceReport', dry)

    def test_mismatch_refuses_without_deletion_count(self):
        refused = row('mismatch', 'script_binding_mismatch')
        result = preflight.preflight(self.document, [row(), refused], directory_bindings=self.bindings)
        self.assertEqual(result['state'], 'preflight_refused')
        self.assertEqual((result['deletedCount'], result['movedCount']), (0, 0))
        self.assertEqual(result['candidateCount'], execute.validate_manifest(
            self.document, directory_bindings=self.bindings)['candidateCount'])

    def test_not_evaluated_is_incomplete_and_inapplicable_is_not_a_failure(self):
        pending = row('not_evaluated', 'read_not_in_this_pass')
        self.assertEqual(preflight.preflight(
            self.document, [row(), pending], directory_bindings=self.bindings)['state'],
            'preflight_incomplete')
        skipped = row('not_evaluated', 'rule_not_applicable')
        self.assertEqual(preflight.preflight(
            self.document, [row(), skipped], directory_bindings=self.bindings)['state'],
            'preflight_matched')

    def test_invalid_report_never_becomes_ready(self):
        with self.assertRaisesRegex(execute.ExecuteError, 'service_report_invalid'):
            preflight.preflight(self.document, [{'result': 'surprise'}], directory_bindings=self.bindings)


class ReportTests(unittest.TestCase):
    def policy(self):
        import json
        import service_role_report as report_module

        error_type = type('GuardError', (ValueError,), {})

        class Adapter:
            UNIT_ROLES = {
                'hysteria2.service': 'hy2',
                'gccgw-edge-agent.service': 'edge',
                'proxy-gateway-candidate.service': 'candidate',
            }
            UNSUPPORTED_UNIT_FIELDS = ('ExecStartPre',)
            DIRECTORY = '/var/backups/gccgw-edge/hysteria2'
            CONFIG = '/etc/hysteria/config.yaml'
            EDGE = '/opt/edge'
            RELEASE = '/opt/release'
            PATH_KEYS = frozenset({'EDGE_HYSTERIA2_BACKUP_DIR'})
            GuardError = error_type

            class shlex:
                @staticmethod
                def split(value):
                    return value.split()

            def parse_unit_properties(self, raw, unit_role):
                if raw == b'bad':
                    raise error_type('unit_unknown')
                return json.loads(raw.decode())

            def exec_identity(self, raw):
                if raw == 'bad-exec':
                    raise error_type('unit_exec_unknown')
                return json.loads(raw)

            def service_uid(self, user, unit_role=None):
                if user == '0':
                    return 0
                raise error_type('unknown_service_identity')

        Adapter.report = report_module
        return Adapter()

    def fields(self, **overrides):
        import json
        base = {
            'Id': 'proxy-gateway-candidate.service', 'LoadState': 'loaded', 'NeedDaemonReload': 'no',
            'ExecStartPre': '', 'ExecStart': json.dumps({
                'path': '/usr/bin/node', 'argv': ['/usr/bin/node', 'server/index.mjs'], 'ignoreErrors': False,
            }),
            'PassEnvironment': '', 'UnsetEnvironment': '', 'Environment': '', 'EnvironmentFiles': '',
            'ActiveState': 'active', 'SubState': 'running', 'WorkingDirectory': '/opt/release',
            'DynamicUser': 'no', 'User': '0', 'MainPID': '10',
        }
        base.update(overrides)
        return json.dumps(base).encode()

    def codes(self, unit, raw):
        import service_role_report as report
        rows = report.evaluate_unit(self.policy(), unit, raw, '2026-09-24T13:40:00+00:00')
        return {row['ruleId']: (row['result'], row['reasonCode']) for row in rows}

    def test_candidate_script_mismatch_does_not_echo_the_command(self):
        import json
        import service_role_report as report
        raw = self.fields(ExecStart=json.dumps({
            'path': '/usr/bin/node', 'argv': ['/usr/bin/node', 'server/other-entry.mjs'], 'ignoreErrors': False,
        }))
        rows = report.evaluate_unit(self.policy(), 'proxy-gateway-candidate.service', raw, '2026-09-24T13:40:00+00:00')
        encoded = json.dumps(rows)
        self.assertNotIn('other-entry', encoded)
        self.assertEqual(self.codes('proxy-gateway-candidate.service', raw)['exec_arguments'],
                         ('mismatch', 'script_binding_mismatch'))
        self.assertEqual(self.codes('proxy-gateway-candidate.service', raw)['state_active'],
                         ('not_evaluated', 'rule_not_applicable'))
        self.assertTrue(report.blocks_admission(rows))

    def test_unreadable_unit_does_not_mark_later_rules_matched(self):
        codes = self.codes('hysteria2.service', b'bad')
        self.assertEqual(codes['identity_id'], ('unavailable', 'unit_unknown'))
        self.assertTrue(all(result == 'not_evaluated' for rule, (result, _) in codes.items() if rule != 'identity_id'))

    def test_candidate_start_binding_is_exact(self):
        import service_role_report as report

        class Policy:
            RELEASE = '/opt/release'

        accepted = (
            'candidate-start.mjs',
            '/opt/release/candidate-start.mjs',
            '/opt/proxy-gateway-minimal-candidate/current/candidate-start.mjs',
        )
        refused = ('server/candidate-start.mjs', 'runtime/candidate-start.mjs', 'other.mjs')
        for script in accepted:
            program, arguments = report._binding(Policy(), 'candidate', '/usr/bin/node', ['/usr/bin/node', script])
            self.assertEqual((program, arguments), (True, True))
        for script in refused:
            program, arguments = report._binding(Policy(), 'candidate', '/usr/bin/node', ['/usr/bin/node', script])
            self.assertEqual((program, arguments), (True, False))

    def test_missing_service_is_distinguished(self):
        raw = self.fields(Id='hysteria2.service', LoadState='not-found')
        self.assertEqual(self.codes('hysteria2.service', raw)['identity_load_state'],
                         ('mismatch', 'service_not_found'))


if __name__ == '__main__':
    unittest.main()
