import copy
import contextlib
import hashlib
import os
import mmap
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock

import current_dependency_guard as g


CONFIG = b'''# managed-by: gccgw-edge-credential-reconciliation
listen: ":10443"
tls:
  cert: "/etc/hysteria/server.crt"
  key: "/etc/hysteria/server.key"
auth:
  type: userpass
  userpass:
    synthetic-user: "synthetic-password"
trafficStats:
  listen: "127.0.0.1:9999"
  secret: "synthetic-stat-secret"
'''
SCOPE = {'root': g.ROOT, 'target': 'sgp', 'protocolDirs': ['hysteria2'],
         'allowedNames': ['config.json', 'config.yaml']}
CANDIDATE = {'path': g.DIRECTORY + '/config.yaml.20260601T000000000Z.bak',
             'metadata': {'dev': 1, 'ino': 100, 'mode': 33152, 'nlink': 1}}


class Probe:
    def __init__(self):
        self.calls = 0
        self.modes = []
        self.value = {'hostname': g.HOSTNAME, 'sourceDigests': dict(g.SOURCE_PINS),
                      'sourceStable': True, 'configSchemaSupported': True,
                      'configPathsCovered': True, 'unitRolesVerified': True,
                      'processCoverageComplete': True, 'inFlightApply': False,
                      'candidateReferenceCount': 0, 'pathProjectionDigest': '1' * 64,
                      'stableDigest': '2' * 64}

    def collect(self, candidates, initial=False):
        self.calls += 1
        self.modes.append(initial)
        return copy.deepcopy(self.value)


class UnitPropertyParserTests(unittest.TestCase):
    OMITTED_ARRAYS = ('EnvironmentFiles', 'ExecStartPre', 'ExecStartPost', 'ExecReload',
                      'ExecStop', 'ExecStopPost', 'ExecCondition')

    def fields(self):
        fields = dict.fromkeys(g.PROPS, '')
        fields.update(Id=g.UNITS[0], LoadState='loaded', NeedDaemonReload='no', MainPID='123')
        return fields

    def output(self, fields):
        return '\n'.join(k + '=' + v for k, v in fields.items()).encode()

    def test_only_verified_empty_compound_properties_are_normalized(self):
        fields = self.fields()
        for key in self.OMITTED_ARRAYS:
            fields.pop(key)
        result = g.parse_unit_properties(self.output(fields), unit_role='hy2')
        self.assertEqual(result, self.fields())

    def test_every_other_missing_property_is_refused_with_exact_field(self):
        for key in set(g.PROPS) - set(self.OMITTED_ARRAYS):
            with self.subTest(key=key):
                fields = self.fields()
                fields.pop(key)
                with self.assertRaises(g.GuardError) as failure:
                    g.parse_unit_properties(self.output(fields), unit_role='edge')
                self.assertEqual(str(failure.exception), 'unit_unknown')
                context = failure.exception.public_diagnostic()
                self.assertEqual(context['unitRole'], 'edge')
                self.assertEqual(context['unitField'], key)
                self.assertEqual(context['refusalPredicate'], 'missing_field')

    def test_scalar_duplicate_malformed_unknown_utf8_and_control_bytes_refused(self):
        raw = self.output(self.fields())
        for suffix, predicate, field in (
                (b'\nId=second', 'duplicate_field', 'Id'),
                (b'\nMainPID=1', 'duplicate_field', 'MainPID'),
                (b'\nbroken', 'malformed_property', 'unrecognized'),
                (b'\nUnexpected=value', 'unexpected_field', 'unrecognized'),
                (b'\n\xff=secret', 'malformed_property', 'unrecognized'),
                (b'\n\x00=value', 'malformed_property', 'unrecognized')):
            with self.subTest(suffix=suffix):
                with self.assertRaises(g.GuardError) as failure:
                    g.parse_unit_properties(raw + suffix, unit_role='candidate')
                context = failure.exception.public_diagnostic()
                self.assertEqual(context['unitField'], field)
                self.assertEqual(context['refusalPredicate'], predicate)
                self.assertNotIn('secret', repr(context))

    def test_environment_file_repeated_rows_aggregate_without_last_value_loss(self):
        fields = self.fields()
        fields.pop('EnvironmentFiles')
        rows = [path + ' (ignore_errors=no)' for path in g.ENV_FILES]
        raw = self.output(fields) + b'\n' + '\n'.join('EnvironmentFiles=' + row for row in rows).encode()
        result = g.parse_unit_properties(raw, unit_role='edge')
        self.assertEqual(result['EnvironmentFiles'], '\n'.join(rows))
        self.assertEqual(g.unit_environment_paths(result['EnvironmentFiles'], unit_role='edge'), list(g.ENV_FILES))

    def test_every_environment_row_is_strictly_checked(self):
        good = g.ENV_FILES[1] + ' (ignore_errors=no)'
        for bad in ('/unknown/path (ignore_errors=no)', g.ENV_FILES[2],
                    g.ENV_FILES[2] + ' (ignore_errors=maybe)', good,
                    g.ENV_FILES[2] + ' (ignore_errors=no) extra'):
            with self.subTest(bad=bad):
                with self.assertRaises(g.GuardError) as failure:
                    g.unit_environment_paths(good + '\n' + bad, unit_role='edge')
                self.assertEqual(failure.exception.public_diagnostic()['unitField'], 'EnvironmentFiles')
                self.assertNotIn(bad, repr(failure.exception.public_diagnostic()))

    def test_unit_diagnostic_pair_is_whitelisted_and_atomic(self):
        error = g.GuardError('unit_unknown', input_role='systemd_units', predicate='missing_field',
                             unit_role='hy2', unit_field='ExecStart')
        self.assertEqual(error.public_diagnostic()['unitRole'], 'hy2')
        self.assertEqual(error.public_diagnostic()['unitField'], 'ExecStart')
        for role, field in (('raw-service-name', 'ExecStart'), ('hy2', 'raw-value'),
                            ('hy2', None), ('hy2', ['raw-value']), ({}, 'ExecStart')):
            context = g.GuardError('unit_unknown', unit_role=role, unit_field=field).public_diagnostic()
            self.assertNotIn('unitRole', context)
            self.assertNotIn('unitField', context)

    @unittest.skipUnless(os.name == 'posix' and os.path.exists('/run/systemd/system'), 'Linux systemd only')
    def test_native_systemctl_show_empty_array_output(self):
        # Actual local systemd read, not a production-unit or role validation.
        for extra in ([], ['--all']):
            reply = g.subprocess.run(['/usr/bin/systemctl', 'show', 'systemd-journald.service',
                '--no-pager', '--property=' + ','.join(g.PROPS)] + extra,
                stdout=g.subprocess.PIPE, stderr=g.subprocess.PIPE, timeout=3, check=False)
            self.assertEqual(reply.returncode, 0)
            result = g.parse_unit_properties(reply.stdout, unit_role='hy2')
            self.assertEqual(result['Id'], 'systemd-journald.service')
            self.assertEqual(result['LoadState'], 'loaded')
            self.assertTrue(result['MainPID'].isdigit())
            missing = set(g.PROPS) - {line.split('=', 1)[0] for line in reply.stdout.decode().splitlines()}
            self.assertTrue(missing <= set(self.OMITTED_ARRAYS))
            self.assertIn('EnvironmentFiles', missing)
            self.assertEqual(result['EnvironmentFiles'], '')
            incomplete = b'\n'.join(line for line in reply.stdout.splitlines() if not line.startswith(b'MainPID='))
            with self.assertRaises(g.GuardError) as failure:
                g.parse_unit_properties(incomplete, unit_role='hy2')
            self.assertEqual(failure.exception.public_diagnostic()['unitField'], 'MainPID')
            self.assertEqual(failure.exception.public_diagnostic()['refusalPredicate'], 'missing_field')
            with self.assertRaises(g.GuardError) as duplicate:
                g.parse_unit_properties(reply.stdout.rstrip(b'\n') + b'\nId=second', unit_role='hy2')
            self.assertEqual(duplicate.exception.public_diagnostic()['refusalPredicate'], 'duplicate_field')


class UnitRoleDiagnosticTests(unittest.TestCase):
    def unit_fields(self):
        result = {}
        for role, unit in zip(('hy2', 'edge', 'candidate'), g.UNITS):
            fields = dict.fromkeys(g.PROPS, '')
            fields.update(Id=unit, LoadState='loaded', NeedDaemonReload='no', MainPID='100',
                          DynamicUser='no', User='0', ActiveState='active', SubState='running',
                          FragmentPath='/etc/systemd/system/' + unit)
            if role == 'hy2':
                path, argv = '/usr/local/bin/hysteria', '/usr/local/bin/hysteria server --config ' + g.CONFIG
            elif role == 'edge':
                path = argv = g.EDGE + '/bin/edge-agent-loop.sh'
            else:
                path, argv = '/usr/bin/node', '/usr/bin/node server/index.mjs'
                fields['WorkingDirectory'] = g.RELEASE
            fields['ExecStart'] = '{ path=' + path + ' ; argv[]=' + argv + ' ; ignore_errors=no }'
            result[unit] = fields
        return result

    def assert_context(self, error, role, field):
        self.assertEqual(str(error), 'unit_role_unknown')
        context = error.public_diagnostic()
        self.assertEqual(context['inputRole'], 'systemd_units')
        self.assertEqual(context['unitRole'], role)
        self.assertEqual(context['unitField'], field)
        self.assertNotEqual(context['refusalPredicate'], 'unspecified')

    def test_loaded_units_each_role_failure_identifies_actual_field(self):
        cases = []
        for role in ('hy2', 'edge'):
            cases += [(role, 'ActiveState', 'failed'), (role, 'SubState', 'exited')]
        cases += [('hy2', 'DynamicUser', 'yes'), ('hy2', 'User', 'invalid user'),
                  ('candidate', 'WorkingDirectory', '/unexpected')]
        for role in ('hy2', 'edge', 'candidate'):
            original = self.unit_fields()[g.UNITS[('hy2', 'edge', 'candidate').index(role)]]['ExecStart']
            cases += [(role, 'ExecStart', original.replace('ignore_errors=no', 'ignore_errors=yes')),
                      (role, 'ExecStart', original.replace('argv[]=', 'argv[]=/unexpected ')),
                      (role, 'ExecStart', original.replace('path=', 'path=/unexpected'))]
        cases += [('hy2', 'ExecStart', '{ path=/usr/bin/hysteria ; argv[]=/usr/bin/hysteria wrong ; ignore_errors=no }'),
                  ('edge', 'ExecStart', '{ path=' + g.EDGE + '/bin/edge-agent-loop.sh ; argv[]=' + g.EDGE + '/bin/edge-agent-loop.sh extra ; ignore_errors=no }'),
                  ('candidate', 'ExecStart', '{ path=/usr/bin/node ; argv[]=/usr/bin/node server/wrong.mjs ; ignore_errors=no }')]
        for role, field, value in cases:
            with self.subTest(role=role, field=field, value=value):
                rows = self.unit_fields()
                rows[g.UNITS[('hy2', 'edge', 'candidate').index(role)]][field] = value
                def reply(command, **kwargs):
                    return types.SimpleNamespace(returncode=0, stdout='\n'.join(k + '=' + v for k, v in rows[command[2]].items()).encode())
                probe = g.LinuxProbe()
                probe._deadline = g.time.monotonic() + 8
                with mock.patch.object(g.subprocess, 'run', side_effect=reply), mock.patch.object(g, 'metadata', return_value={'ino': 1}):
                    with self.assertRaises(g.GuardError) as failure:
                        probe.units()
                self.assert_context(failure.exception, role, field)

    def test_pinned_candidate_entries_are_exact_and_other_mjs_entries_stay_refused(self):
        accepted = (
            'server/index.mjs',
            'server/start.mjs',
            g.RELEASE + '/server/index.mjs',
            g.RELEASE + '/server/start.mjs',
            g.CANDIDATE_BASE + '/current/server/index.mjs',
            g.CANDIDATE_BASE + '/current/server/start.mjs',
        )
        refused = (
            'server/candidate-start.mjs',
            'runtime/candidate-start.mjs',
            'other.mjs',
            'candidate-start.js',
        )
        for script in accepted:
            with self.subTest(script=script, accepted=True):
                rows = self.unit_fields()
                rows[g.UNITS[2]]['ExecStart'] = (
                    '{ path=/usr/bin/node ; argv[]=/usr/bin/node ' + script + ' ; ignore_errors=no }')
                def reply(command, **kwargs):
                    return types.SimpleNamespace(returncode=0, stdout='\n'.join(
                        key + '=' + value for key, value in rows[command[2]].items()).encode())
                probe = g.LinuxProbe()
                probe._deadline = g.time.monotonic() + 8
                with mock.patch.object(g.subprocess, 'run', side_effect=reply), mock.patch.object(g, 'metadata', return_value={'ino': 1}):
                    self.assertIn(g.UNITS[2], probe.units())
        for script in refused:
            with self.subTest(script=script, accepted=False):
                rows = self.unit_fields()
                rows[g.UNITS[2]]['ExecStart'] = (
                    '{ path=/usr/bin/node ; argv[]=/usr/bin/node ' + script + ' ; ignore_errors=no }')
                def reply(command, **kwargs):
                    return types.SimpleNamespace(returncode=0, stdout='\n'.join(
                        key + '=' + value for key, value in rows[command[2]].items()).encode())
                probe = g.LinuxProbe()
                probe._deadline = g.time.monotonic() + 8
                with mock.patch.object(g.subprocess, 'run', side_effect=reply), mock.patch.object(g, 'metadata', return_value={'ino': 1}):
                    with self.assertRaises(g.GuardError) as failure:
                        probe.units()
                self.assert_context(failure.exception, 'candidate', 'ExecStart')

    def test_unpinned_candidate_start_entry_is_unknown_for_each_allowed_spelling(self):
        self.assertNotIn(g.RELEASE + '/candidate-start.mjs', g.SOURCE_PINS)
        for prefix in ('', g.RELEASE + '/', g.CANDIDATE_BASE + '/current/'):
            script = prefix + 'candidate-start.mjs'
            with self.subTest(script=script):
                rows = self.unit_fields()
                rows[g.UNITS[2]]['ExecStart'] = (
                    '{ path=/usr/bin/node ; argv[]=/usr/bin/node ' + script + ' ; ignore_errors=no }')
                def reply(command, **kwargs):
                    return types.SimpleNamespace(returncode=0, stdout='\n'.join(
                        key + '=' + value for key, value in rows[command[2]].items()).encode())
                probe = g.LinuxProbe()
                probe._deadline = g.time.monotonic() + 8
                with mock.patch.object(g.subprocess, 'run', side_effect=reply), mock.patch.object(g, 'metadata', return_value={'ino': 1}):
                    with self.assertRaisesRegex(g.GuardError, 'candidate_entry_source_unknown') as failure:
                        probe.units()
                context = failure.exception.public_diagnostic()
                self.assertEqual(context['unitRole'], 'candidate')
                self.assertEqual(context['unitField'], 'ExecStart')
                self.assertNotIn(script, repr(context))

    def test_known_candidate_entry_requires_its_own_source_pin(self):
        for suffix in ('server/index.mjs', 'server/start.mjs'):
            pins = dict(g.SOURCE_PINS)
            pins.pop(g.RELEASE + '/' + suffix)
            for prefix in ('', g.RELEASE + '/', g.CANDIDATE_BASE + '/current/'):
                with self.subTest(suffix=suffix, prefix=prefix):
                    rows = self.unit_fields()
                    rows[g.UNITS[2]]['ExecStart'] = (
                        '{ path=/usr/bin/node ; argv[]=/usr/bin/node ' + prefix + suffix + ' ; ignore_errors=no }')
                    def reply(command, **kwargs):
                        return types.SimpleNamespace(returncode=0, stdout='\n'.join(
                            key + '=' + value for key, value in rows[command[2]].items()).encode())
                    probe = g.LinuxProbe()
                    probe._deadline = g.time.monotonic() + 8
                    with mock.patch.object(g, 'SOURCE_PINS', pins), mock.patch.object(g.subprocess, 'run', side_effect=reply), mock.patch.object(g, 'metadata', return_value={'ino': 1}):
                        with self.assertRaisesRegex(g.GuardError, 'candidate_entry_source_unknown'):
                            probe.units()

    def test_ownership_policy_identity_failures_are_attributed(self):
        for role, unit in zip(('hy2', 'edge', 'candidate'), g.UNITS):
            for field, value in (('Id', 'wrong.service'), ('LoadState', 'not-found'),
                                 ('DynamicUser', 'yes'), ('User', 'invalid user')):
                with self.subTest(role=role, field=field):
                    rows = self.unit_fields()
                    rows[unit][field] = value
                    with self.assertRaises(g.GuardError) as failure:
                        g.OwnershipPolicy.from_units(rows)
                    self.assert_context(failure.exception, role, field)

    def test_service_uid_production_role_preserved_for_every_rejection(self):
        pwd = types.SimpleNamespace(getpwnam=mock.Mock())
        for role in ('hy2', 'edge', 'candidate'):
            for value in (None, 'invalid user', '4294967295'):
                with self.subTest(role=role, value=value):
                    with self.assertRaises(g.GuardError) as failure:
                        g.service_uid(value, unit_role=role)
                    self.assert_context(failure.exception, role, 'User')
            for result in (KeyError('unknown'), OSError('unavailable'), types.SimpleNamespace(pw_uid=-1)):
                pwd.getpwnam.reset_mock(side_effect=True)
                if isinstance(result, BaseException):
                    pwd.getpwnam.side_effect = result
                else:
                    pwd.getpwnam.return_value = result
                with mock.patch.dict('sys.modules', pwd=pwd):
                    with self.assertRaises(g.GuardError) as failure:
                        g.service_uid('synthetic-user', unit_role=role)
                self.assert_context(failure.exception, role, 'User')

    def test_fresh_resolved_uid_drift_identifies_role_and_user(self):
        for role, unit in zip(('hy2', 'edge', 'candidate'), g.UNITS):
            with self.subTest(role=role):
                rows = self.unit_fields()
                previous = g.OwnershipPolicy.from_units(rows)
                rows[unit]['User'] = '9999'
                probe = g.LinuxProbe()
                probe._baseline = {'units': rows, 'policy': previous}
                with self.assertRaises(g.GuardError) as failure:
                    probe._fresh([CANDIDATE])
                self.assert_context(failure.exception, role, 'User')


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.probe = Probe()
        self.guard = g.CurrentDependencyGuard([CANDIDATE], self.probe)

    def test_initialize_and_each_observe_are_fresh(self):
        initial = self.guard.initialize(SCOPE)
        self.assertTrue(initial['complete'])
        self.assertEqual(self.guard.read_protection(SCOPE), initial)
        self.assertEqual(self.probe.calls, 2)
        self.guard.validate_final(SCOPE)
        self.assertEqual(self.probe.modes, [True, False, True])

    def test_read_before_initialize_refused(self):
        with self.assertRaisesRegex(g.GuardError, 'not_initialized'):
            self.guard.read_protection(SCOPE)

    def test_no_unconditional_complete_for_incomplete_probes(self):
        for key in ('sourceStable', 'configSchemaSupported', 'configPathsCovered',
                    'unitRolesVerified', 'processCoverageComplete'):
            with self.subTest(key=key):
                self.probe.value[key] = False
                with self.assertRaises(g.GuardError):
                    self.guard.initialize(SCOPE)
                self.probe.value[key] = True

    def test_reference_or_inflight_unknown_refused(self):
        for key, value in (('candidateReferenceCount', 1), ('inFlightApply', True),
                           ('inFlightApply', None), ('candidateReferenceCount', None)):
            with self.subTest(key=key, value=value):
                p = Probe()
                p.value[key] = value
                with self.assertRaises(g.GuardError):
                    g.CurrentDependencyGuard([CANDIDATE], p).initialize(SCOPE)

    def test_drift_fail_closed(self):
        self.guard.initialize(SCOPE)
        self.probe.value['stableDigest'] = '3' * 64
        with self.assertRaisesRegex(g.GuardError, 'dependency_changed'):
            self.guard.read_protection(SCOPE)

    def test_source_drift(self):
        self.probe.value['sourceDigests'][next(iter(g.SOURCE_PINS))] = 'f' * 64
        with self.assertRaisesRegex(g.GuardError, 'source_identity'):
            self.guard.initialize(SCOPE)

    def test_scope_and_target(self):
        for edit in ({'target': 'jp'}, {'protocolDirs': ['hysteria']}, {'root': '/tmp'}):
            with self.assertRaisesRegex(g.GuardError, 'scope'):
                self.guard.initialize(dict(SCOPE, **edit))

    def test_candidate_outside_directory_or_hardlink(self):
        for edit in ({'path': '/tmp/config.bak'}, {'metadata': dict(CANDIDATE['metadata'], nlink=2)}):
            with self.assertRaises(g.GuardError):
                g.CurrentDependencyGuard([dict(CANDIDATE, **edit)], Probe())

    def test_parser_returns_paths_not_secrets(self):
        result = g.config_path_projection(CONFIG)
        self.assertEqual(result, ['/etc/hysteria/server.crt', '/etc/hysteria/server.key'])
        self.assertNotIn('synthetic-password', repr(result))

    def test_unknown_yaml_and_indirect_paths_are_not_ignored(self):
        for addition in (b'acl:\n  file: /tmp/rules\n', b'resolver:\n  type: system\n',
                         b'include: /tmp/config\n', b'tls: &alias\n', b'  extra: x\n'):
            with self.subTest(addition=addition):
                with self.assertRaisesRegex(g.GuardError, 'config_schema'):
                    g.config_path_projection(CONFIG + addition)

    def test_absolute_only_config_paths(self):
        with self.assertRaises(g.GuardError):
            g.config_path_projection(CONFIG.replace(b'/etc/hysteria/server.crt', b'./relative.crt'))

    def test_parser_supports_empty_auth_and_direct_outbound(self):
        raw = CONFIG.replace(b'  userpass:\n    synthetic-user: "synthetic-password"', b'  userpass: {}')
        raw += b'outbounds:\n  - name: direct\n    type: direct\n    direct:\n      mode: 4\n'
        self.assertEqual(len(g.config_path_projection(raw)), 2)

    def test_summary_has_no_candidate_path_or_raw_values(self):
        self.guard.initialize(SCOPE)
        self.assertNotIn(CANDIDATE['path'], repr(self.guard.public_summary()))
        self.assertFalse(self.guard.public_summary()['productionExecuted'])

    def test_permission_failure_never_becomes_success(self):
        with mock.patch.object(self.probe, 'collect', side_effect=g.GuardError('dependency_probe_incomplete')):
            with self.assertRaisesRegex(g.GuardError, 'dependency_probe_incomplete'):
                self.guard.initialize(SCOPE)
        self.assertFalse(self.guard.public_summary()['initializationPassed'])

    def test_env_projection_only_returns_allowed_paths(self):
        raw = b'SECRET_TOKEN=do-not-export\nEDGE_HYSTERIA2_ACTIVE_CONFIG_PATH=/etc/hysteria/config.yaml\n'
        self.assertEqual(g.env_path_projection(raw), {'EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH': g.CONFIG})

    def test_env_shell_source_expansion_and_duplicate_refused(self):
        for raw in (b'. /tmp/override\n', b'EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH=$BASE/config\n',
                    b'EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH=/etc/a\nEDGE_HYSTERIA2_ACTIVE_CONFIG_PATH=/etc/b\n'):
            with self.assertRaises(g.GuardError):
                g.env_path_projection(raw)

    def test_duplicate_config_keys_rejected(self):
        with self.assertRaises(g.GuardError):
            g.config_path_projection(CONFIG + b'listen: ":9999"\n')

    def test_initialization_is_not_reusable(self):
        self.guard.initialize(SCOPE)
        with self.assertRaisesRegex(g.GuardError, 'already_initialized'):
            self.guard.initialize(SCOPE)

    def test_config_projection_change_stops_fresh_check(self):
        self.guard.initialize(SCOPE)
        self.probe.value['pathProjectionDigest'] = '4' * 64
        with self.assertRaisesRegex(g.GuardError, 'dependency_changed'):
            self.guard.read_protection(SCOPE)

    def test_new_reference_after_initialization_stops(self):
        self.guard.initialize(SCOPE)
        self.probe.value['candidateReferenceCount'] = 1
        with self.assertRaisesRegex(g.GuardError, 'current_reference'):
            self.guard.read_protection(SCOPE)

    def test_deadline_refuses_before_any_command(self):
        probe = g.LinuxProbe()
        probe._deadline = 0
        with mock.patch.object(g.subprocess, 'run') as command:
            with self.assertRaisesRegex(g.GuardError, 'deadline'):
                probe.units()
            command.assert_not_called()

    def test_unit_hook_unknown_not_treated_as_covered(self):
        for field in g.UNSUPPORTED_UNIT_FIELDS:
            with self.subTest(field=field):
                probe = g.LinuxProbe()
                probe._deadline = g.time.monotonic() + 8
                fields = dict.fromkeys(g.PROPS, '')
                fields.update(Id=g.UNITS[0], LoadState='loaded', NeedDaemonReload='no')
                fields[field] = '/unknown/hook'
                reply = type('Reply', (), {'returncode': 0, 'stdout': '\n'.join(k + '=' + v for k, v in fields.items()).encode()})()
                with mock.patch.object(g.subprocess, 'run', return_value=reply) as command:
                    with self.assertRaisesRegex(g.GuardError, 'hook_or_namespace') as failure:
                        probe.units()
                    self.assertEqual(command.call_count, 1)
                    self.assertLessEqual(command.call_args.kwargs['timeout'], 1.0)
                    self.assertEqual(failure.exception.public_diagnostic()['unitField'], field)
                    self.assertEqual(failure.exception.public_diagnostic()['refusalPredicate'], 'nonempty_unsupported')

    def test_unit_invalid_required_values_identify_field(self):
        base = dict.fromkeys(g.PROPS, '')
        base.update(Id=g.UNITS[0], LoadState='loaded', NeedDaemonReload='no')
        for field, bad in (('Id', 'not-matching.service'), ('LoadState', 'not-found'), ('NeedDaemonReload', 'yes')):
            with self.subTest(field=field):
                fields = dict(base, **{field: bad})
                reply = types.SimpleNamespace(returncode=0, stdout='\n'.join(k + '=' + v for k, v in fields.items()).encode())
                probe = g.LinuxProbe()
                probe._deadline = g.time.monotonic() + 8
                with mock.patch.object(g.subprocess, 'run', return_value=reply):
                    with self.assertRaisesRegex(g.GuardError, 'unit_unknown') as failure:
                        probe.units()
                self.assertEqual(failure.exception.public_diagnostic()['unitField'], field)
                self.assertEqual(failure.exception.public_diagnostic()['refusalPredicate'], 'invalid_field')

    def test_loaded_path_environment_override_refused(self):
        probe = g.LinuxProbe()
        probe._deadline = g.time.monotonic() + 8
        fields = dict.fromkeys(g.PROPS, '')
        fields.update(Id=g.UNITS[0], LoadState='loaded', NeedDaemonReload='no',
                      Environment='EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH=/unexpected/config',
                      ExecStart='{ path=/usr/local/bin/hysteria ; argv[]=/usr/local/bin/hysteria server --config ' + g.CONFIG + ' ; ignore_errors=no }')
        reply = type('Reply', (), {'returncode': 0, 'stdout': '\n'.join(k + '=' + v for k, v in fields.items()).encode()})()
        with mock.patch.object(g.subprocess, 'run', return_value=reply):
            with self.assertRaisesRegex(g.GuardError, 'unit_environment_override'):
                probe.units()

    def test_unit_read_is_exactly_three_bounded_readonly_commands(self):
        probe = g.LinuxProbe()
        probe._deadline = g.time.monotonic() + 8
        def reply(command, **kwargs):
            unit = command[2]
            fields = dict.fromkeys(g.PROPS, '')
            # Native systemctl omits empty compound arrays, even with --all.
            for field in UnitPropertyParserTests.OMITTED_ARRAYS:
                fields.pop(field)
            fields.update(Id=unit, LoadState='loaded', NeedDaemonReload='no', MainPID='100', DynamicUser='no',
                          ActiveState='active', SubState='running', FragmentPath='/etc/systemd/system/' + unit)
            if unit == g.UNITS[0]:
                fields['ExecStart'] = '{ path=/usr/local/bin/hysteria ; argv[]=/usr/local/bin/hysteria server --config ' + g.CONFIG + ' ; ignore_errors=no }'
            elif unit == g.UNITS[1]:
                fields['ExecStart'] = '{ path=' + g.EDGE + '/bin/edge-agent-loop.sh ; argv[]=' + g.EDGE + '/bin/edge-agent-loop.sh ; ignore_errors=no }'
            else:
                fields['WorkingDirectory'] = g.RELEASE
                fields['ExecStart'] = '{ path=/usr/bin/node ; argv[]=/usr/bin/node server/index.mjs ; ignore_errors=no }'
            return type('Reply', (), {'returncode': 0, 'stdout': '\n'.join(k + '=' + v for k, v in fields.items()).encode()})()
        with mock.patch.object(g.subprocess, 'run', side_effect=reply) as command, mock.patch.object(g, 'metadata', return_value={'ino': 1}):
            self.assertEqual(set(probe.units()), set(g.UNITS))
            self.assertEqual(command.call_count, 3)
            self.assertTrue(all(call.args[0][:2] == ['/usr/bin/systemctl', 'show'] for call in command.call_args_list))

    def test_candidate_exec_runtime_result_ignored_static_change_detected(self):
        static = 'path=/usr/bin/node ; argv[]=/usr/bin/node server/index.mjs ; ignore_errors=no'
        first = '{ ' + static + ' ; start_time=[old] ; stop_time=[old] ; pid=10 ; code=exited ; status=1 }'
        second = '{ ' + static + ' ; start_time=[new] ; stop_time=[new] ; pid=42 ; code=exited ; status=2 }'
        self.assertEqual(g.exec_identity(first), g.exec_identity(second))
        self.assertNotEqual(g.exec_identity(first), g.exec_identity(second.replace('server/index.mjs', 'server/changed.mjs')))

    def test_multiple_or_unrecognized_exec_records_rejected(self):
        one = '{ path=/usr/bin/node ; argv[]=/usr/bin/node server/index.mjs ; ignore_errors=no }'
        for raw in (one + ' ' + one, one.replace('ignore_errors=no', 'unknown=yes'), ''):
            with self.assertRaisesRegex(g.GuardError, 'unit_exec_unknown'):
                g.exec_identity(raw)

    def test_service_uid_resolves_current_user_not_historical_uid(self):
        fake = types.SimpleNamespace(getpwnam=lambda name: types.SimpleNamespace(pw_uid=1234))
        with mock.patch.dict('sys.modules', {'pwd': fake}):
            self.assertEqual(g.service_uid('synthetic-hy2'), 1234)
            self.assertEqual(g.service_uid(''), 0)
            self.assertEqual(g.service_uid('9876'), 9876)

    def test_unknown_service_account_stops(self):
        fake = types.SimpleNamespace(getpwnam=mock.Mock(side_effect=KeyError('unresolved')))
        with mock.patch.dict('sys.modules', {'pwd': fake}):
            with self.assertRaisesRegex(g.GuardError, 'unit_role_unknown'):
                g.service_uid('synthetic-missing')


class OwnerPolicyTests(unittest.TestCase):
    def setUp(self):
        self.units = {name: {'Id': name, 'LoadState': 'loaded', 'DynamicUser': 'no', 'User': str(uid)}
                      for name, uid in zip(g.UNITS, (3001, 3002, 3003))}

    def test_service_owned_fixed_source_ancestor_allowed(self):
        policy = g.OwnershipPolicy.from_units(self.units)
        path = g.RELEASE + '/server/index.mjs'
        def current(path, follow=False):
            return {'mode': 0o40700, 'uid': 3003 if path.startswith(g.CANDIDATE_BASE) else 0}
        with mock.patch.object(g, 'metadata', side_effect=current):
            g.safe_ancestors(path, policy=policy, input_role='candidate_source')

    def test_system_owner_never_relaxed(self):
        policy = g.OwnershipPolicy.from_units(self.units)
        with mock.patch.object(g, 'metadata', return_value={'mode': 0o40700, 'uid': 3003}):
            with self.assertRaises(g.GuardError) as failure:
                g.safe_ancestors(g.RELEASE + '/server/index.mjs', policy=policy, input_role='candidate_source')
        self.assertEqual(failure.exception.public_diagnostic(), {'inputRole': 'candidate_index_source',
                         'refusalPredicate': 'owner_not_allowed', 'ancestorRole': 'system', 'ancestorIndex': 0})

    def test_wrong_role_owner_and_group_write_stop_with_safe_context(self):
        policy = g.OwnershipPolicy.from_units(self.units)
        path = g.EDGE + '/bin/edge-agent-loop.sh'
        for wrong_uid, mode, predicate in ((3003, 0o40700, 'owner_not_allowed'),
                                           (3002, 0o40770, 'group_or_world_writable')):
            def current(item, follow=False):
                return {'mode': mode if item == g.EDGE else 0o40755, 'uid': wrong_uid if item == g.EDGE else 0}
            with mock.patch.object(g, 'metadata', side_effect=current):
                with self.assertRaises(g.GuardError) as failure:
                    g.safe_ancestors(path, policy=policy, input_role='edge_wrapper')
                context = failure.exception.public_diagnostic()
                self.assertEqual(context['refusalPredicate'], predicate)
                self.assertEqual(context['ancestorRole'], 'edge_app')
                self.assertNotIn(path, repr(context))

    def test_hy2_owner_is_consumer_or_edge_producer_not_candidate(self):
        policy = g.OwnershipPolicy.from_units(self.units)
        self.assertEqual(policy.file_uids(g.CONFIG, 'hy2_config'), {0, 3001, 3002})
        self.assertNotIn(3003, policy.file_uids(g.CONFIG, 'hy2_config'))

    def test_unknown_dynamic_service_identity_is_rejected(self):
        self.units[g.UNITS[1]]['DynamicUser'] = 'yes'
        with self.assertRaises(g.GuardError):
            g.OwnershipPolicy.from_units(self.units)

    def test_owner_policy_does_not_allow_arbitrary_path(self):
        policy = g.OwnershipPolicy.from_units(self.units)
        with self.assertRaises(g.GuardError):
            policy.file_uids('/etc/unrelated/config', 'candidate_source')

    def test_environment_owner_rules_are_role_bound(self):
        policy = g.OwnershipPolicy.from_units(self.units)
        self.assertEqual(policy.file_uids(g.ENV_FILES[0], 'sgp_environment'), {0, 3002, 3003})
        self.assertEqual(policy.file_uids(g.ENV_FILES[1], 'edge_environment'), {0, 3002})

    def test_safe_error_context_never_accepts_arbitrary_text(self):
        failure = g.GuardError('read_ancestor_unknown', input_role='/private/raw', predicate='token-value',
                               ancestor_role='/etc/private', ancestor_index=999)
        context = failure.public_diagnostic()
        self.assertEqual(context, {'inputRole': 'unspecified', 'refusalPredicate': 'unspecified',
                                   'ancestorRole': 'not_applicable'})

    def test_symlink_predicate_is_distinct(self):
        with mock.patch.object(g, 'metadata', return_value={'mode': 0o120777, 'uid': 0}):
            with self.assertRaises(g.GuardError) as failure:
                g.safe_ancestors('/etc/synthetic/config')
        self.assertEqual(failure.exception.public_diagnostic()['refusalPredicate'], 'symlink_not_allowed')


@unittest.skipUnless(os.name == 'posix' and getattr(os, 'geteuid', lambda: -1)() == 0,
                     'requires isolated Linux root-owned filesystem fixture')
class NativeFilesystemTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='gccgw-guard-synthetic-', dir='/root')
        self.directory = Path(self.tmp.name)
        self.file = self.directory / 'synthetic.config'
        self.file.write_bytes(CONFIG)
        self.file.chmod(0o600)

    def tearDown(self):
        self.tmp.cleanup()

    def test_fd_read_and_schema_real_file(self):
        raw, info = g.bounded_read(str(self.file))
        self.assertEqual(raw, CONFIG)
        self.assertEqual(info, g.metadata(str(self.file)))
        self.assertEqual(len(g.config_path_projection(raw)), 2)

    def test_symlink_body_not_read(self):
        link = self.directory / 'symlink'
        link.symlink_to(self.file)
        with self.assertRaises(g.GuardError):
            g.bounded_read(str(link))

    def test_world_writable_file_refused(self):
        self.file.chmod(0o666)
        with self.assertRaisesRegex(g.GuardError, 'permissions'):
            g.bounded_read(str(self.file))

    def test_inode_reference_via_hardlink(self):
        alias = self.directory / 'active-config'
        os.link(self.file, alias)
        data = g.metadata(str(self.file))
        found, _ = g.reference_file(str(alias), {(data['dev'], data['ino'])}, {str(self.file)})
        self.assertEqual(found, 1)

    def test_indirect_tls_symlink_reference(self):
        alias = self.directory / 'certificate-path'
        alias.symlink_to(self.file)
        data = g.metadata(str(self.file))
        found, _ = g.reference_file(str(alias), {(data['dev'], data['ino'])}, {str(self.file)})
        self.assertEqual(found, 1)

    def test_candidate_absent_is_explicit_not_unknown(self):
        missing = str(self.directory / 'candidate-config')
        found, value = g.reference_file(missing, set(), set(), allow_absent=True)
        self.assertEqual(found, 0)
        self.assertTrue(value['absent'])
        with self.assertRaises(g.GuardError):
            g.reference_file(missing, set(), set(), allow_absent=False)

    def test_real_open_fd_reference(self):
        data = g.metadata(str(self.file))
        with self.file.open('rb') as handle:
            found, _ = g.reference_file('/proc/self/fd/' + str(handle.fileno()), {(data['dev'], data['ino'])}, set())
            self.assertEqual(found, 1)

    def test_real_mmap_reference_or_permission_refusal(self):
        data = g.metadata(str(self.file))
        with self.file.open('rb') as handle, mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ):
            matches = [p for p in Path('/proc/self/map_files').iterdir() if os.readlink(p) == str(self.file)]
            self.assertTrue(matches)
            try:
                found, _ = g.reference_file(str(matches[0]), {(data['dev'], data['ino'])}, set())
                self.assertEqual(found, 1)
            except PermissionError:
                # Restricted map_files access is not interpreted as zero refs.
                # LinuxProbe wraps this OSError into dependency_probe_incomplete.
                with self.assertRaises(PermissionError):
                    g.reference_file(str(matches[0]), {(data['dev'], data['ino'])}, set())

    def fast_probe(self):
        probe = g.LinuxProbe()
        probe._deadline = g.time.monotonic() + 8
        units = {unit: {'Id': unit, 'LoadState': 'loaded', 'User': '', 'DynamicUser': 'no'} for unit in g.UNITS}
        probe._baseline = {'inputs': {str(self.file): g.metadata(str(self.file), False)},
                           'units': units, 'policy': g.OwnershipPolicy.from_units(units),
                           'related': {'100': {'start': 'synthetic'}},
                           'result': {'candidateReferenceCount': 0, 'stableDigest': '2' * 64}}
        return probe

    def test_fast_metadata_path_reads_no_body_or_systemctl(self):
        probe = self.fast_probe()
        with mock.patch.object(probe, 'process_references', return_value=(0, probe._baseline['related'])) as refs, \
                mock.patch.object(g, 'bounded_read') as raw, mock.patch.object(probe, 'units') as units, \
                mock.patch.object(g.subprocess, 'run') as command:
            self.assertEqual(probe._fresh([CANDIDATE])['candidateReferenceCount'], 0)
            self.assertFalse(refs.call_args.kwargs['full_scan'])
            raw.assert_not_called()
            units.assert_not_called()
            command.assert_not_called()

    def test_fast_detects_actual_source_mutation(self):
        probe = self.fast_probe()
        self.file.write_bytes(b'changed synthetic fixture')
        with self.assertRaisesRegex(g.GuardError, 'input_changed'):
            probe._fresh([CANDIDATE])

    def test_fast_detects_new_reference_and_changed_pid_proof(self):
        probe = self.fast_probe()
        with mock.patch.object(probe, 'process_references', return_value=(1, probe._baseline['related'])):
            self.assertEqual(probe._fresh([CANDIDATE])['candidateReferenceCount'], 1)
        with mock.patch.object(probe, 'process_references', return_value=(0, {'100': {'start': 'changed'}})):
            with self.assertRaisesRegex(g.GuardError, 'related_process_changed'):
                probe._fresh([CANDIDATE])

    def test_fast_deadline_stops_before_proc(self):
        probe = self.fast_probe()
        probe._deadline = 0
        with mock.patch.object(probe, 'process_references') as refs:
            with self.assertRaisesRegex(g.GuardError, 'deadline'):
                probe._fresh([CANDIDATE])
            refs.assert_not_called()

    def test_configuration_owner_must_match_current_service_uid(self):
        os.chown(self.file, 1234, 0)
        with self.assertRaisesRegex(g.GuardError, 'permissions'):
            g.bounded_read(str(self.file))
        self.assertEqual(g.bounded_read(str(self.file), allowed_uids=(0, 1234))[0], CONFIG)
        with self.assertRaisesRegex(g.GuardError, 'permissions'):
            g.bounded_read(str(self.file), allowed_uids=(0, 5678))
        self.file.chmod(0o622)
        with self.assertRaisesRegex(g.GuardError, 'permissions'):
            g.bounded_read(str(self.file), allowed_uids=(0, 1234))

    def test_full_fast_final_role_owned_real_filesystem_inputs(self):
        """Production input roles, real private files; systemd/proc synthetic."""
        fs = self.directory / 'host-fixture'
        fs.mkdir(mode=0o700)
        def mapped(path):
            return str(fs / str(path).lstrip('/'))
        def write(path, content, uid=0):
            target = Path(mapped(path))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            target.chmod(0o600)
            os.chown(target, uid, 0)
        pins = {}
        for index, path in enumerate(g.SOURCE_PINS):
            data = ('synthetic source %s' % index).encode()
            write(path, data, 3002 if path.startswith(g.EDGE + '/') else 3003)
            pins[path] = hashlib.sha256(data).hexdigest()
        projection = {'EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH': g.CONFIG,
                      'EDGE_HYSTERIA2_CANDIDATE_CONFIG_PATH': '/etc/hysteria/pending.yaml',
                      'EDGE_HYSTERIA2_BACKUP_DIR': g.DIRECTORY,
                      'EDGE_HYSTERIA2_CERTIFICATE_PATH': '/etc/hysteria/server.crt',
                      'EDGE_HYSTERIA2_PRIVATE_KEY_PATH': '/etc/hysteria/server.key'}
        env = '\n'.join(k + '=' + v for k, v in projection.items()).encode()
        for index, path in enumerate(g.ENV_FILES):
            write(path, env, 3003 if index == 0 else 3002)
        write(g.CONFIG, CONFIG, 3001)
        write('/etc/hysteria/server.crt', b'synthetic certificate metadata fixture', 3001)
        write('/etc/hysteria/server.key', b'synthetic non-secret key marker', 3001)
        units = {}
        for name, uid in zip(g.UNITS, (3001, 3002, 3003)):
            fragment = '/etc/systemd/system/' + name
            write(fragment, b'synthetic unit fixture')
            units[name] = {'Id': name, 'LoadState': 'loaded', 'DynamicUser': 'no', 'User': str(uid),
                           'FragmentPath': fragment, 'DropInPaths': '', 'MainPID': '100',
                           'ActiveState': 'active', 'SubState': 'running', 'ControlGroup': '/system.slice/' + name}
        for path in (g.EDGE + '/current', g.CANDIDATE_BASE + '/current'):
            Path(mapped(path)).symlink_to(os.path.relpath(mapped(g.RELEASE), str(Path(mapped(path)).parent)))
        for logical, uid in ((g.CANDIDATE_BASE, 3003), (g.EDGE, 3002),
                             ('/etc/hysteria', 3001), ('/etc/gccgw-edge-agent', 3002)):
            base = Path(mapped(logical))
            for path in [base] + [p for p in base.rglob('*') if p.is_dir() and not p.is_symlink()]:
                path.chmod(0o700)
                os.chown(path, uid, 0)
        # Unit/system ancestors were not included in service-owned subtrees.
        original_metadata, original_open = g.metadata, os.open
        original_realpath, original_lexists = os.path.realpath, os.path.lexists
        probe = g.LinuxProbe()
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(g, 'SOURCE_PINS', pins))
            stack.enter_context(mock.patch.object(g.socket, 'gethostname', return_value=g.HOSTNAME))
            stack.enter_context(mock.patch.object(g, 'metadata', side_effect=lambda p, follow=True: original_metadata(mapped(p), follow)))
            stack.enter_context(mock.patch.object(g.os, 'open', side_effect=lambda p, flags, *a, **kw: original_open(mapped(p), flags, *a, **kw)))
            stack.enter_context(mock.patch.object(g.os.path, 'realpath', side_effect=lambda p: '/' + os.path.relpath(original_realpath(mapped(p)), fs)))
            stack.enter_context(mock.patch.object(g.os.path, 'lexists', side_effect=lambda p: original_lexists(mapped(p))))
            unit_reads = stack.enter_context(mock.patch.object(probe, 'units', side_effect=lambda: copy.deepcopy(units)))
            stack.enter_context(mock.patch.object(probe, 'process_references', return_value=(0, {'100': {'start': 'synthetic'}})))
            body_reads = stack.enter_context(mock.patch.object(g, 'bounded_read', wraps=g.bounded_read))
            initial = probe.collect([CANDIDATE], initial=True)
            initial_calls = body_reads.call_count
            self.assertTrue(initial['configPathsCovered'])
            self.assertEqual(unit_reads.call_count, 2)
            self.assertEqual(probe.collect([CANDIDATE]), initial)
            self.assertEqual(body_reads.call_count, initial_calls)
            self.assertEqual(unit_reads.call_count, 2)
            self.assertEqual(probe.collect([CANDIDATE], initial=True), initial)
            self.assertEqual(body_reads.call_count, initial_calls * 2)
            self.assertEqual(unit_reads.call_count, 4)
            os.chown(mapped(g.RELEASE), 9999, 0)
            with self.assertRaises(g.GuardError) as refusal:
                probe.collect([CANDIDATE])
            self.assertEqual(refusal.exception.public_diagnostic()['refusalPredicate'], 'namespace_changed')
            self.assertEqual(refusal.exception.public_diagnostic()['ancestorRole'], 'candidate_release')

    def test_metadata_only_tls_leaf_keeps_existing_owner_behavior(self):
        os.chown(self.file, 4567, 0)
        # This exact synthetic runtime path is outside /etc/hysteria. Only
        # metadata is examined; its owner is not a new content-read allowance.
        units = {name: {'Id': name, 'LoadState': 'loaded', 'DynamicUser': 'no', 'User': str(uid)}
                 for name, uid in zip(g.UNITS, (3001, 3002, 3003))}
        policy = g.OwnershipPolicy.from_units(units)
        policy.bind_references(runtime_paths=[str(self.file)])
        found, info = g.reference_file(str(self.file), set(), set(), policy=policy, input_role='hy2_runtime_reference')
        self.assertEqual(found, 0)
        self.assertEqual(info['metadata']['uid'], 4567)
        with self.assertRaises(g.GuardError):
            g.bounded_read(str(self.file))


class NamespaceObjectTests(unittest.TestCase):
    def test_mount_namespace_difference_does_not_block_an_inode_check(self):
        g.related_namespace_allows_object_check(True, True)
        with self.assertRaises(g.GuardError) as failure:
            g.related_namespace_allows_object_check(False, True)
        self.assertEqual(str(failure.exception), 'related_namespace_unknown')
        with self.assertRaises(g.GuardError):
            g.related_namespace_allows_object_check(True, False)

    def test_only_the_open_object_counts_as_a_candidate_reference(self):
        paths, inodes = {'/var/backups/gccgw-edge/hysteria2/a.bak'}, {(7, 11)}
        self.assertEqual(g.object_reference('/var/backups/gccgw-edge/hysteria2/a.bak', (7, 11), paths, inodes), 1)
        self.assertEqual(g.object_reference('/tmp/unrelated', (1, 2), paths, inodes), 0)
        with self.assertRaises(g.GuardError) as failure:
            g.object_reference('/var/backups/gccgw-edge/hysteria2/a.bak', (9, 9), paths, inodes)
        self.assertEqual(str(failure.exception), 'alias_unclear')


class CertificateAncestorTests(unittest.TestCase):
    def policy(self, hy2, candidate, edge=901):
        value = g.OwnershipPolicy({'hy2': hy2, 'edge': edge, 'candidate': candidate})
        certificate = '/var/lib/hy2-certs/live/fullchain.pem'
        private_key = '/var/lib/hy2-certs/live/privkey.pem'
        value.bind_certificate_owner_ancestors(certificate, private_key)
        return value, '/var/lib'

    def test_only_the_shared_service_owner_is_added_at_index_two(self):
        policy, ancestor = self.policy(900, 900)
        allowed, role = policy.ancestor_rule(ancestor, 'hy2_runtime_reference')
        self.assertEqual((allowed, role), ({0, 900}, 'hy2_certificate_ancestor'))
        self.assertEqual(policy.ancestor_rule('/var/lib/hy2-certs', 'hy2_runtime_reference')[1], 'hy2_certificate_ancestor')
        self.assertEqual(policy.ancestor_rule('/var/lib/hy2-certs/live', 'hy2_runtime_reference'), ({0, 900}, 'hy2_certificate_ancestor'))
        self.assertNotIn(901, allowed)
        self.assertEqual(policy.ancestor_rule('/var/lib/other', 'hy2_runtime_reference'), ({0}, 'other_root'))
        self.assertEqual(policy.ancestor_rule('/var', 'hy2_runtime_reference')[1], 'system')
        separate, _ = self.policy(900, 902)
        self.assertEqual(separate.ancestor_rule(ancestor, 'hy2_runtime_reference'), ({0}, 'other_root'))


class EnvPrecedenceTests(unittest.TestCase):
    def projections(self, agent):
        current = g.DIRECTORY
        return {
            'sgp': {'EDGE_HYSTERIA2_BACKUP_DIR': current, 'EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH': g.CONFIG},
            'runtime': {'EDGE_HYSTERIA2_BACKUP_DIR': current, 'EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH': g.CONFIG},
            'agent': {'EDGE_HYSTERIA2_BACKUP_DIR': agent, 'EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH': g.CONFIG},
        }

    def test_agent_directory_outside_current_keeps_the_current_directory(self):
        merged = g.merge_env_projections(self.projections('/tmp/other-backup'), g.DIRECTORY)
        self.assertEqual(merged['EDGE_HYSTERIA2_BACKUP_DIR'], g.DIRECTORY)

    def test_agent_directory_inside_or_above_current_still_refuses(self):
        for agent in (g.DIRECTORY + '/child', '/var/backups/gccgw-edge', '/'):
            with self.subTest(agent=agent):
                with self.assertRaises(g.GuardError) as failure:
                    g.merge_env_projections(self.projections(agent), g.DIRECTORY)
                self.assertEqual(str(failure.exception), 'env_precedence_unknown')

    def test_other_key_disagreement_and_unconfirmed_runtime_still_refuse(self):
        mismatched = self.projections('/tmp/other-backup')
        mismatched['agent']['EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH'] = '/etc/other.yaml'
        with self.assertRaises(g.GuardError):
            g.merge_env_projections(mismatched, g.DIRECTORY)
        missing_runtime = self.projections('/tmp/other-backup')
        missing_runtime['runtime'] = {}
        with self.assertRaises(g.GuardError):
            g.merge_env_projections(missing_runtime, g.DIRECTORY)


if __name__ == '__main__':
    unittest.main()
