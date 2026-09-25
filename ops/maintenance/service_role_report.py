"""Explain service-role checks without changing their pass/fail rules.

Rows contain only fixed codes. Command text, environment values, paths, and
account names never enter a row. Rules the current guard does not apply to a
role are not_evaluated, not match.
"""
import posixpath

import dependency_admission


RESULTS = ('match', 'mismatch', 'unavailable', 'not_evaluated')
NOT_APPLICABLE = 'rule_not_applicable'
NOT_THIS_PASS = 'read_not_in_this_pass'


def _row(role, field, rule_id, result, reason, observed_at):
    if result not in RESULTS:
        raise ValueError('result_invalid')
    return {
        'unitRole': role,
        'unitField': field,
        'ruleId': rule_id,
        'result': result,
        'reasonCode': reason,
        'evidenceRef': role + '/' + rule_id,
        'observedAt': observed_at,
    }


def _rest(role, rules, start, observed_at, reason):
    return [_row(role, 'unrecognized', rule_id, 'not_evaluated', reason, observed_at)
            for rule_id in rules[start:]]


def rule_ids(policy, role):
    common = [
        'identity_id', 'identity_load_state', 'identity_daemon_reload',
        *[f'hook_{field}' for field in policy.UNSUPPORTED_UNIT_FIELDS],
        'backup_reference', 'exec_parse', 'exec_argv0', 'exec_ignore_errors',
        'env_pass_unset', 'env_path_override', 'env_files_shape',
        'state_active', 'state_sub', 'exec_program', 'exec_arguments',
        'workdir_binding', 'dynamic_user', 'user_resolve', 'main_pid',
        'unit_file_metadata', 'process_references', 'env_file_body',
    ]
    if role not in policy.UNIT_ROLES.values():
        raise ValueError('role_invalid')
    return common


def _binding(policy, role, executable, argv):
    if role == 'hy2':
        program = executable in ('/usr/local/bin/hysteria', '/usr/bin/hysteria')
        arguments = argv[1:] in (
            ['server', '--config', policy.CONFIG],
            ['server', '-c', policy.CONFIG],
            ['server', '--config=' + policy.CONFIG],
        )
        return program, arguments
    if role == 'edge':
        return executable == policy.EDGE + '/bin/edge-agent-loop.sh', len(argv) == 1
    prefixes = ('', policy.RELEASE + '/', '/opt/proxy-gateway-minimal-candidate/current/')
    suffixes = dependency_admission.CANDIDATE_ENTRY_SUFFIXES
    allowed = tuple(prefix + suffix for prefix in prefixes for suffix in suffixes)
    return executable == '/usr/bin/node', len(argv) == 2 and argv[1] in allowed


def evaluate_unit(policy, unit, raw, observed_at, resolve_user=None):
    """Evaluate one systemctl-show payload. raw is bytes; no other host read."""
    role = policy.UNIT_ROLES[unit]
    rules = rule_ids(policy, role)
    rows = []

    def add(field, rule_id, result, reason):
        rows.append(_row(role, field, rule_id, result, reason, observed_at))

    try:
        fields = policy.parse_unit_properties(raw, unit_role=role)
    except policy.GuardError as error:
        add('unrecognized', 'identity_id', 'unavailable', str(error) if str(error).isidentifier() else 'unit_unknown')
        rows.extend(_rest(role, rules, 1, observed_at, 'prior_rule_unavailable'))
        return rows

    expected_identity = (('identity_id', 'Id', unit),
                         ('identity_load_state', 'LoadState', 'loaded'),
                         ('identity_daemon_reload', 'NeedDaemonReload', 'no'))
    for rule_id, field, expected in expected_identity:
        if fields[field] == expected:
            add(field, rule_id, 'match', 'identity_match')
        elif rule_id == 'identity_load_state' and fields[field] == 'not-found':
            add(field, rule_id, 'mismatch', 'service_not_found')
        else:
            add(field, rule_id, 'mismatch', 'identity_mismatch')

    for field in policy.UNSUPPORTED_UNIT_FIELDS:
        if fields[field]:
            add(field, 'hook_' + field, 'mismatch', 'nonempty_unsupported')
        else:
            add(field, 'hook_' + field, 'match', 'hook_empty')

    if policy.DIRECTORY in fields['ExecStart']:
        add('ExecStart', 'backup_reference', 'mismatch', 'current_reference')
    else:
        add('ExecStart', 'backup_reference', 'match', 'backup_not_referenced')

    try:
        identity = policy.exec_identity(fields['ExecStart'])
    except policy.GuardError:
        add('ExecStart', 'exec_parse', 'unavailable', 'unit_exec_unknown')
        parsed = False
        identity = None
    else:
        add('ExecStart', 'exec_parse', 'match', 'exec_parsed')
        parsed = True

    if not parsed:
        for rule_id in ('exec_argv0', 'exec_ignore_errors', 'exec_program', 'exec_arguments'):
            add('ExecStart', rule_id, 'not_evaluated', 'prior_rule_unavailable')
    else:
        executable, argv = identity['path'], identity['argv']
        argv0 = argv[0] in (executable, posixpath.basename(executable))
        add('ExecStart', 'exec_argv0', 'match' if argv0 else 'mismatch',
            'argv0_match' if argv0 else 'execstart_argv0')
        ignored = identity['ignoreErrors'] is not False
        add('ExecStart', 'exec_ignore_errors', 'mismatch' if ignored else 'match',
            'execstart_ignore_errors' if ignored else 'ignore_errors_off')
        program, arguments = _binding(policy, role, executable, argv)
        add('ExecStart', 'exec_program', 'match' if program else 'mismatch',
            'program_match' if program else 'execstart_executable')
        argument_reason = 'arguments_match' if arguments else (
            'execstart_argc' if role != 'hy2' and len(argv) != (1 if role == 'edge' else 2) else 'script_binding_mismatch')
        if role == 'hy2' and not arguments:
            argument_reason = 'exec_arguments_mismatch'
        add('ExecStart', 'exec_arguments', 'match' if arguments else 'mismatch', argument_reason)

    env_clear = not fields['PassEnvironment'] and not fields['UnsetEnvironment']
    add('Environment', 'env_pass_unset', 'match' if env_clear else 'mismatch',
        'env_inheritance_clear' if env_clear else 'unit_environment_unknown')
    words = policy.shlex.split(fields['Environment'])
    override = any(word.split('=', 1)[0] in policy.PATH_KEYS for word in words)
    add('Environment', 'env_path_override', 'mismatch' if override else 'match',
        'unit_environment_override' if override else 'env_path_clear')
    add('EnvironmentFiles', 'env_files_shape', 'match',
        'env_files_empty' if not fields['EnvironmentFiles'] else 'env_files_accepted')

    if role in ('hy2', 'edge'):
        active = fields['ActiveState'] == 'active'
        running = fields['SubState'] == 'running'
        add('ActiveState', 'state_active', 'match' if active else 'mismatch',
            'state_match' if active else 'state_mismatch')
        add('SubState', 'state_sub', 'match' if running else 'mismatch',
            'state_match' if running else 'state_mismatch')
    else:
        add('ActiveState', 'state_active', 'not_evaluated', NOT_APPLICABLE)
        add('SubState', 'state_sub', 'not_evaluated', NOT_APPLICABLE)

    if role == 'candidate':
        allowed_directories = (policy.RELEASE, '/opt/proxy-gateway-minimal-candidate/current')
        directory_ok = fields['WorkingDirectory'] in allowed_directories
        add('WorkingDirectory', 'workdir_binding', 'match' if directory_ok else 'mismatch',
            'workdir_match' if directory_ok else 'working_directory')
    else:
        add('WorkingDirectory', 'workdir_binding', 'not_evaluated', NOT_APPLICABLE)

    if role == 'hy2':
        dynamic = fields['DynamicUser'] == 'no'
        add('DynamicUser', 'dynamic_user', 'match' if dynamic else 'mismatch',
            'dynamic_user_match' if dynamic else 'dynamic_user_mismatch')
        resolver = resolve_user or policy.service_uid
        try:
            resolver(fields['User'], unit_role=role)
        except policy.GuardError:
            add('User', 'user_resolve', 'mismatch', 'unknown_service_identity')
        else:
            add('User', 'user_resolve', 'match', 'user_resolved')
    else:
        add('DynamicUser', 'dynamic_user', 'not_evaluated', NOT_APPLICABLE)
        add('User', 'user_resolve', 'not_evaluated', NOT_APPLICABLE)

    pid_ok = fields['MainPID'].isascii() and fields['MainPID'].isdigit()
    add('MainPID', 'main_pid', 'match' if pid_ok else 'mismatch',
        'main_pid_match' if pid_ok else 'main_pid_invalid')
    for rule_id, field in (
        ('unit_file_metadata', 'FragmentPath'),
        ('process_references', 'ControlGroup'),
        ('env_file_body', 'EnvironmentFiles'),
    ):
        add(field, rule_id, 'not_evaluated', NOT_THIS_PASS)
    return rows


def blocks_admission(rows):
    """True when the current guard would refuse. not_evaluated is not a pass."""
    return any(row['result'] != 'match' for row in rows
               if row['reasonCode'] != NOT_APPLICABLE and row['reasonCode'] != NOT_THIS_PASS)
