"""Read-only, fixed-host current-dependency guard. Not an execution authority.

No CLI, SSH, writes, backup-body reads or service mutations. The host wrapper
must separately authorize the fixed source/config/unit/proc reads below. The
three env files are inspected ONLY for allowlisted non-secret Hy2 path fields;
their contents and paths extracted from configuration never leave this module.
Unsupported schema, unresolved inputs or changing relevant state STOP, rather
than converting an empty process-FD result into 'no dependency'. Historical
owner/incident research is deliberately not part of this revised policy.

The proof covers the named deployed producer, its runtime, candidate entry and
present process references. It cannot prove arbitrary future root commands or
unrecorded external maintenance will not start; execution requires exclusive
operator maintenance coordination and the exact-path executor's own checks.

Initial and final full probes inspect all visible /proc file/map references.
Inter-file checks reread structural/input metadata and named service-cgroup
process references, not whole-system historical state. They run zero systemctl
commands and read no source/config/env bodies. A natural producer apply beginning
mid-batch still stops the run: no no-op inference is invented for an active child.
Full probes have six bounded systemctl-show calls; every probe has an 8-second
cooperative deadline. This is not a worst-case total batch duration guarantee.
"""
import hashlib
import json
import os
import posixpath
import re
import shlex
import socket
import stat
import subprocess
import time
from pathlib import Path

HOSTNAME = 'gccgw-sgp-small-portal-20260608-002'
ROOT = '/var/backups/gccgw-edge'
DIRECTORY = ROOT + '/hysteria2'
RELEASE = '/opt/proxy-gateway-minimal-candidate/releases/sgp-source-runtime-sync-20260613-001'
EDGE = '/opt/proxy-gateway-minimal-edge-agent'
CANDIDATE_BASE = '/opt/proxy-gateway-minimal-candidate'
CONFIG = '/etc/hysteria/config.yaml'
SOURCE_PINS = {
    RELEASE + '/server/services/edge/hysteria2-runtime-adapter.mjs': '9083d6362ca5a60317fd761c6aaa4336a3d0a7a9d8c6086adaff698375b3ca9c',
    RELEASE + '/agent/production-edge-agent.mjs': '97235a3507fbdac4f818f76719baf7e523a33a4bb5a69f40b1009cd9d646a8d1',
    EDGE + '/bin/edge-agent-loop.sh': 'a34ebd8c939ab4026b66df2d834abd4e0712d19893f302ae067e77f93d8d41f8',
    EDGE + '/bin/edge-agent-once.sh': '2d64968a104611b50bdf33d565e09e72ba50428ca064531b44d57f749d709e78',
    RELEASE + '/server/index.mjs': '28a0a60be4b2a2d0c05c138067aa8b865bb524c9acc381d91366a88ba75f6562',
    RELEASE + '/server/start.mjs': '0ed02448d50066ab2d78b121fb60f07da4681aff70443bf48f2118e7c888a06d',
}
ENV_FILES = ('/opt/proxy-gateway-minimal-candidate/protected/sgp.env',
             '/etc/gccgw-edge-agent/agent.env', '/etc/gccgw-edge-agent/runtime-apply.env')
PATH_KEYS = frozenset(('EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH', 'EDGE_HYSTERIA2_CANDIDATE_CONFIG_PATH',
                      'EDGE_HYSTERIA2_BACKUP_DIR', 'EDGE_HYSTERIA2_CERTIFICATE_PATH',
                      'EDGE_HYSTERIA2_PRIVATE_KEY_PATH'))
UNITS = ('hysteria2.service', 'gccgw-edge-agent.service', 'proxy-gateway-candidate.service')
CANDIDATE_ENTRY_SUFFIXES = ('server/index.mjs', 'server/start.mjs', 'candidate-start.mjs')
PROPS = ('Id', 'LoadState', 'ActiveState', 'SubState', 'MainPID', 'ExecStart', 'WorkingDirectory',
         'ControlGroup', 'FragmentPath', 'DropInPaths', 'NeedDaemonReload', 'Environment',
         'EnvironmentFiles', 'PassEnvironment', 'UnsetEnvironment', 'ExecStartPre', 'ExecStartPost',
         'ExecReload', 'ExecStop', 'ExecStopPost', 'ExecCondition', 'RootDirectory', 'RootImage',
         'BindPaths', 'BindReadOnlyPaths', 'User', 'DynamicUser')
UNSUPPORTED_UNIT_FIELDS = ('ExecStartPre', 'ExecStartPost', 'ExecReload', 'ExecStop', 'ExecStopPost',
                           'ExecCondition', 'RootDirectory', 'RootImage', 'BindPaths', 'BindReadOnlyPaths')
# Official systemd v249/v255 systemctl-show.c custom printers emit one line per
# EnvironmentFiles/Exec* array entry; empty arrays emit NO line, including --all.
# v255 org.freedesktop.systemd1.xml declares all six hooks. Other nullable
# properties use generic printers and MUST remain present as e.g. User=.
# See v255 systemctl-show.c:1168-1184,1257-1309; v249:1072-1088.
OMITTED_EMPTY_ARRAYS = frozenset(('EnvironmentFiles', 'ExecStartPre', 'ExecStartPost',
                                'ExecReload', 'ExecStop', 'ExecStopPost', 'ExecCondition'))
UNIT_ROLES = dict(zip(UNITS, ('hy2', 'edge', 'candidate')))
UNIT_FIELDS = frozenset(PROPS) | {'unrecognized'}
MAX_BYTES = 262144
MAX_PROCESSES = 4096
MAX_FDS = 65536
PROBE_SECONDS = 8.0
INPUT_ROLES = frozenset(('unspecified', 'candidate_source', 'edge_wrapper', 'sgp_environment',
    'edge_environment', 'hy2_config', 'hy2_runtime_reference', 'candidate_pointer', 'edge_pointer',
    'unit_definition', 'systemd_units', 'related_process', 'input_recheck', 'hy2_adapter_source',
    'edge_agent_source', 'candidate_index_source', 'candidate_start_source', 'edge_loop_wrapper',
    'edge_once_wrapper', 'agent_environment', 'runtime_environment'))
REFUSAL_PREDICATES = frozenset(('unspecified', 'not_directory', 'owner_not_allowed',
    'group_or_world_writable', 'symlink_not_allowed', 'unreadable', 'namespace_changed',
    'source_digest_changed', 'not_regular', 'file_changed', 'unknown_service_identity',
    'missing_field', 'duplicate_field', 'malformed_property', 'invalid_field',
    'nonempty_unsupported', 'unexpected_field'))
ANCESTOR_ROLES = frozenset(('not_applicable', 'system', 'candidate_app', 'candidate_release',
    'candidate_protected', 'edge_app', 'hy2_config', 'edge_environment', 'other_root',
    'hy2_certificate_ancestor'))


class GuardError(ValueError):
    """Static error category only. Never interpolate raw inputs or OS errors."""

    def __init__(self, code, *, input_role='unspecified', predicate='unspecified',
                 ancestor_role='not_applicable', ancestor_index=None, unit_role=None, unit_field=None):
        super().__init__(code)
        self.refusalContext = {
            'inputRole': input_role if input_role in INPUT_ROLES else 'unspecified',
            'refusalPredicate': predicate if predicate in REFUSAL_PREDICATES else 'unspecified',
            'ancestorRole': ancestor_role if ancestor_role in ANCESTOR_ROLES else 'not_applicable'}
        if type(ancestor_index) is int and 0 <= ancestor_index <= 16:
            self.refusalContext['ancestorIndex'] = ancestor_index
        if isinstance(unit_role, str) and isinstance(unit_field, str) \
                and unit_role in UNIT_ROLES.values() and unit_field in UNIT_FIELDS:
            self.refusalContext.update(unitRole=unit_role, unitField=unit_field)

    def public_diagnostic(self):
        return dict(self.refusalContext)


def require(condition, code):
    if not condition:
        raise GuardError(code)


def unit_require(condition, role, field, *, predicate='invalid_field', code='unit_unknown'):
    if not condition:
        raise GuardError(code, input_role='systemd_units', predicate=predicate,
                         unit_role=role, unit_field=field)


def unit_environment_paths(raw, *, unit_role):
    """Read each custom-printed array row, never silently discard unknown text."""
    paths = []
    for line in raw.splitlines():
        match = re.fullmatch(r'(/[^\s;()]+) \(ignore_errors=(yes|no)\)', line)
        unit_require(match is not None, unit_role, 'EnvironmentFiles', code='unit_environment_unknown')
        path = match[1]
        unit_require(path in ENV_FILES and path not in paths, unit_role, 'EnvironmentFiles',
                     code='unit_environment_unknown')
        paths.append(path)
    return paths


def parse_unit_properties(raw, *, unit_role):
    """Parse bounded systemctl output; this alone does not verify a unit role."""
    unit_require(isinstance(raw, bytes) and len(raw) <= MAX_BYTES, unit_role, 'unrecognized',
                 predicate='malformed_property')
    try:
        text = raw.decode('utf8')
    except UnicodeDecodeError:
        raise GuardError('unit_unknown', input_role='systemd_units', predicate='malformed_property',
                         unit_role=unit_role, unit_field='unrecognized') from None
    unit_require(not any(ord(c) < 32 and c not in '\n\t' for c in text), unit_role, 'unrecognized',
                 predicate='malformed_property')
    fields = {}
    for line in text.splitlines():
        match = re.fullmatch(r'([A-Za-z][A-Za-z0-9]*)=(.*)', line)
        unit_require(match is not None, unit_role, 'unrecognized', predicate='malformed_property')
        key, value = match.groups()
        unit_require(key in PROPS, unit_role, 'unrecognized', predicate='unexpected_field')
        if key in fields:
            unit_require(key == 'EnvironmentFiles' and bool(value) and bool(fields[key]), unit_role, key,
                         predicate='duplicate_field')
            fields[key] += '\n' + value
        else:
            fields[key] = value
    for key in PROPS:
        if key not in fields:
            unit_require(key in OMITTED_EMPTY_ARRAYS, unit_role, key, predicate='missing_field')
            fields[key] = ''
    unit_environment_paths(fields['EnvironmentFiles'], unit_role=unit_role)
    return fields


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def exec_identity(raw):
    """Discard systemd's volatile execution result, never static command data."""
    require(isinstance(raw, str) and raw.count('{') == 1 and raw.count('}') == 1
            and raw.strip().startswith('{') and raw.strip().endswith('}'), 'unit_exec_unknown')
    parts = raw.strip()[1:-1].strip().split(' ; ')
    values = {}
    allowed = {'path', 'argv[]', 'ignore_errors', 'start_time', 'stop_time', 'pid', 'code', 'status'}
    for part in parts:
        match = re.fullmatch(r'([a-z_]+|argv\[\])=(.*)', part.strip())
        require(match is not None and match[1] in allowed and match[1] not in values, 'unit_exec_unknown')
        values[match[1]] = match[2]
    require({'path', 'argv[]', 'ignore_errors'} <= values.keys()
            and values['ignore_errors'] in ('yes', 'no'), 'unit_exec_unknown')
    try:
        argv = shlex.split(values['argv[]'])
    except ValueError:
        raise GuardError('unit_exec_unknown') from None
    require(argv and len(argv) <= 16, 'unit_exec_unknown')
    return {'path': absolute_path(values['path']), 'argv': argv, 'ignoreErrors': values['ignore_errors'] == 'yes'}


def absolute_path(value):
    require(isinstance(value, str) and value.startswith('/') and '\x00' not in value
            and posixpath.normpath(value) == value and not any(c.isspace() for c in value), 'path_unknown')
    return value


def scalar(value):
    if value.startswith('"'):
        try:
            parsed = json.loads(value)
        except (ValueError, TypeError):
            raise GuardError('config_schema') from None
        require(isinstance(parsed, str), 'config_schema')
        return parsed
    require(re.fullmatch(r'[A-Za-z0-9_.:/+-]+', value) is not None, 'config_schema')
    return value


def config_path_projection(raw):
    """Accept only the deployed adapter's known YAML subset, not generic YAML.

    No includes, aliases, custom tags, ACL/resolver/masquerade extension, embedded
    JSON mappings or unrecognized key is silently ignored. Auth values never
    become paths, receipts or hash inputs. This intentionally may refuse a live
    handwritten config until that precise schema has been reviewed.
    """
    require(isinstance(raw, bytes) and len(raw) <= MAX_BYTES, 'config_schema')
    try:
        lines = raw.decode('utf-8').splitlines()
    except UnicodeError:
        raise GuardError('config_schema') from None
    leaves = {
        'listen', 'tls.cert', 'tls.key', 'auth.type', 'trafficStats.listen', 'trafficStats.secret',
        'bandwidth.up', 'bandwidth.down', 'ignoreClientBandwidth', 'congestion.type',
        'congestion.bbrProfile', 'udpIdleTimeout', 'sniff.enable', 'sniff.rewriteDomain',
        'sniff.tcpPorts', 'sniff.udpPorts', 'quic.initStreamReceiveWindow',
        'quic.maxStreamReceiveWindow', 'quic.initConnReceiveWindow', 'quic.maxConnReceiveWindow',
        'quic.maxIdleTimeout', 'quic.maxIncomingStreams', 'quic.disablePathMTUDiscovery'}
    sections = {'tls', 'auth', 'auth.userpass', 'trafficStats', 'bandwidth', 'congestion', 'quic', 'sniff'}
    seen, stack, paths = set(), [], {}
    i = 0
    while i < len(lines):
        line = lines[i]
        i += 1
        if not line.strip() or line.startswith('#'):
            continue
        if line == 'outbounds:':
            require('outbounds' not in seen and i + 4 <= len(lines), 'config_schema')
            seen.add('outbounds')
            require(lines[i:i+3] == ['  - name: direct', '    type: direct', '    direct:']
                    and re.fullmatch(r'      mode: [1-9][0-9]*', lines[i+3]), 'config_schema')
            i += 4
            stack = []
            continue
        match = re.fullmatch(r'( *)([A-Za-z0-9_.-]+):(?: (.*))?', line)
        require(match is not None and len(match[1]) % 2 == 0, 'config_schema')
        depth, key, value = len(match[1]) // 2, match[2], match[3]
        require(depth <= len(stack), 'config_schema')
        stack = stack[:depth]
        name = '.'.join(stack + [key])
        require(name not in seen, 'config_schema')
        seen.add(name)
        if name == 'auth.userpass' and value == '{}':
            continue
        if value is None:
            require(name in sections, 'config_schema')
            stack.append(key)
            continue
        require(name in leaves or (depth == 2 and stack == ['auth', 'userpass']), 'config_schema')
        result = scalar(value)
        if name in ('tls.cert', 'tls.key'):
            paths[name] = absolute_path(result)
        if name == 'auth.type':
            require(result == 'userpass', 'config_schema')
    require({'listen', 'tls', 'tls.cert', 'tls.key', 'auth', 'auth.type', 'auth.userpass'} <= seen,
            'config_schema')
    return sorted(set(paths.values()))


def env_path_projection(raw):
    """Read only named non-secret path assignments; values never returned outward."""
    require(len(raw) <= MAX_BYTES, 'env_projection_unknown')
    result = {}
    try:
        lines = raw.decode('utf8').splitlines()
        for line in lines:
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            match = re.match(r'^\s*(?:export\s+)?([A-Z0-9_]+)\s*=(.*)$', line)
            require(match is not None, 'env_projection_unknown')
            if match[1] not in PATH_KEYS:
                continue
            require(match[1] not in result, 'env_projection_unknown')
            words = shlex.split(match[2], comments=True, posix=True)
            require(len(words) == 1 and not any(c in words[0] for c in '$`\\'), 'env_projection_unknown')
            result[match[1]] = absolute_path(words[0])
    except (UnicodeError, ValueError):
        raise GuardError('env_projection_unknown') from None
    return result


def related_namespace_allows_object_check(root_same, namespace_readable):
    """A different mount namespace does not block inode comparison.

    The process root must still be the host root, and its mount namespace must
    be readable. Inequality with the probe is not itself a dependency refusal.
    """
    if not root_same or not namespace_readable:
        raise GuardError('related_namespace_unknown')


def object_reference(target, inode, candidate_paths, candidate_inodes):
    """Count an open file only when its object is a candidate.

    A candidate path whose object is different is an unclear alias, not zero
    and not a confirmed reference.
    """
    if inode in candidate_inodes:
        return 1
    if target in candidate_paths:
        raise GuardError('alias_unclear')
    return 0


def backup_dir_relation(value, directory):
    """Relation of one absolute path to the current backup directory. No I/O."""
    if value == directory:
        return 'matches_current'
    if value.startswith(directory + '/'):
        return 'inside_current'
    ancestor = value[:-1] if value != '/' and value.endswith('/') else value
    if ancestor != directory and directory.startswith(ancestor.rstrip('/') + '/'):
        return 'parent_of_current'
    return 'elsewhere'


def merge_env_projections(by_role, directory):
    """Merge sgp, runtime, then agent. One outside agent backup dir is not a reference.

    sgp and runtime must both name the current backup directory before an agent
    value outside that directory can be ignored. Every other disagreement,
    including an agent path inside or above the current directory, still refuses.
    """
    merged = {}
    for role in ('sgp', 'runtime', 'agent'):
        for key, value in by_role.get(role, {}).items():
            if key not in merged or merged[key] == value:
                merged[key] = value
                continue
            if (key == 'EDGE_HYSTERIA2_BACKUP_DIR' and role == 'agent'
                    and by_role.get('sgp', {}).get(key) == directory
                    and by_role.get('runtime', {}).get(key) == directory
                    and backup_dir_relation(value, directory) == 'elsewhere'):
                continue
            raise GuardError('env_precedence_unknown')
    return merged


def stat_metadata(value):
    return {'dev': value.st_dev, 'ino': value.st_ino, 'mode': value.st_mode, 'uid': value.st_uid,
            'gid': value.st_gid, 'nlink': value.st_nlink, 'size': value.st_size,
            'mtimeNs': value.st_mtime_ns, 'ctimeNs': value.st_ctime_ns}


def metadata(path, follow=True):
    return stat_metadata(os.stat(path, follow_symlinks=follow))


def under(path, root):
    return path == root or path.startswith(root + '/')


def diagnostic_role(path, fallback):
    return {
        RELEASE + '/server/services/edge/hysteria2-runtime-adapter.mjs': 'hy2_adapter_source',
        RELEASE + '/agent/production-edge-agent.mjs': 'edge_agent_source',
        RELEASE + '/server/index.mjs': 'candidate_index_source',
        RELEASE + '/server/start.mjs': 'candidate_start_source',
        EDGE + '/bin/edge-agent-loop.sh': 'edge_loop_wrapper',
        EDGE + '/bin/edge-agent-once.sh': 'edge_once_wrapper',
        ENV_FILES[1]: 'agent_environment', ENV_FILES[2]: 'runtime_environment',
    }.get(path, fallback)


class OwnershipPolicy:
    """Current fixed service identities, applied only to bound input roles."""

    @classmethod
    def from_units(cls, units):
        owners = {}
        for role, unit in zip(('hy2', 'edge', 'candidate'), UNITS):
            value = units.get(unit, {})
            for field, expected in (('Id', unit), ('LoadState', 'loaded'), ('DynamicUser', 'no')):
                unit_require(value.get(field) == expected, role, field, code='unit_role_unknown',
                             predicate='unknown_service_identity')
            owners[role] = service_uid(value.get('User'), unit_role=role)
        return cls(owners)

    def __init__(self, owners):
        self.owners = dict(owners)
        self.runtime_paths = set()
        self.unit_paths = set()
        self.certificate_owner_ancestors = set()

    def bind_references(self, runtime_paths=(), unit_paths=()):
        self.runtime_paths.update(absolute_path(p) for p in runtime_paths)
        self.unit_paths.update(absolute_path(p) for p in unit_paths)

    def bind_certificate_owner_ancestors(self, certificate_path, private_key_path):
        """Allow other_root ancestors of only the certificate and private-key paths."""
        found = set()
        for path in (certificate_path, private_key_path):
            absolute_path(path)
            current = '/'
            found.add(current)
            for part in path.strip('/').split('/')[:-1]:
                current = posixpath.join(current, part)
                found.add(current)
        self.certificate_owner_ancestors = found

    def validate_path(self, path, input_role):
        valid = {
            'candidate_source': path in SOURCE_PINS and under(path, RELEASE),
            'edge_wrapper': path in SOURCE_PINS and under(path, EDGE),
            'sgp_environment': path == ENV_FILES[0],
            'edge_environment': path in ENV_FILES[1:],
            'hy2_config': path == CONFIG,
            'hy2_runtime_reference': path in self.runtime_paths,
            'candidate_pointer': path == CANDIDATE_BASE + '/current',
            'edge_pointer': path == EDGE + '/current',
            'unit_definition': path in self.unit_paths,
        }.get(input_role, False)
        if not valid:
            raise GuardError('path_unknown', input_role=input_role, predicate='namespace_changed')

    def file_uids(self, path, input_role):
        self.validate_path(path, input_role)
        roles = {
            'candidate_source': ('candidate',), 'edge_wrapper': ('edge',),
            'sgp_environment': ('candidate', 'edge'), 'edge_environment': ('edge',),
            'hy2_config': ('hy2', 'edge'), 'candidate_pointer': ('candidate',),
            'edge_pointer': ('edge',), 'unit_definition': (),
        }.get(input_role)
        if input_role == 'hy2_runtime_reference':
            roles = ('hy2', 'edge') if under(path, '/etc/hysteria') else ()
        return {0} | {self.owners[r] for r in roles}

    def ancestor_rule(self, path, input_role):
        # /, /opt, /etc and all other system ancestors stay root-only. Nothing
        # here creates a generic "this UID is trusted everywhere" allowance.
        if path in ('/', '/opt', '/etc', '/var', '/var/backups'):
            return {0}, 'system'
        if input_role == 'unit_definition':
            return {0}, 'other_root'
        if under(path, RELEASE):
            return {0, self.owners['candidate']}, 'candidate_release'
        if under(path, CANDIDATE_BASE + '/protected'):
            roles = ('candidate', 'edge') if input_role == 'sgp_environment' else ('candidate',)
            return {0} | {self.owners[r] for r in roles}, 'candidate_protected'
        if under(path, CANDIDATE_BASE):
            return {0, self.owners['candidate']}, 'candidate_app'
        if under(path, EDGE):
            return {0, self.owners['edge']}, 'edge_app'
        if under(path, '/etc/hysteria'):
            return {0, self.owners['hy2'], self.owners['edge']}, 'hy2_config'
        if under(path, '/etc/gccgw-edge-agent'):
            return {0, self.owners['edge']}, 'edge_environment'
        shared = self.owners.get('hy2')
        if (input_role == 'hy2_runtime_reference' and path in self.certificate_owner_ancestors
                and shared not in (None, 0) and shared == self.owners.get('candidate')):
            return {0, shared}, 'hy2_certificate_ancestor'
        return {0}, 'other_root'


def path_ancestor(path, index):
    """Ancestor at the same index used by safe_ancestors. The leaf is excluded."""
    absolute_path(path)
    current = '/'
    ancestors = ['/']
    for part in path.strip('/').split('/')[:-1]:
        current = posixpath.join(current, part)
        ancestors.append(current)
    if type(index) is not int or not 0 <= index < len(ancestors):
        return None
    return ancestors[index]


def safe_ancestors(path, *, policy=None, input_role='unspecified'):
    absolute_path(path)
    if policy:
        policy.validate_path(path, input_role)
    current = '/'
    ancestors = ['/']
    for part in path.strip('/').split('/')[:-1]:
        current = posixpath.join(current, part)
        ancestors.append(current)
    require(len(ancestors) <= 17, 'path_unknown')
    result = {}
    for index, current in enumerate(ancestors):
        allowed, role = policy.ancestor_rule(current, input_role) if policy else ({0}, 'system' if current in ('/', '/etc', '/opt', '/var') else 'other_root')
        context = {'input_role': diagnostic_role(path, input_role), 'ancestor_role': role, 'ancestor_index': index}
        try:
            value = metadata(current, False)
        except OSError:
            raise GuardError('read_ancestor_unknown', predicate='unreadable', **context) from None
        predicate = ('symlink_not_allowed' if stat.S_ISLNK(value['mode']) else
                     'not_directory' if not stat.S_ISDIR(value['mode']) else
                     'owner_not_allowed' if value['uid'] not in allowed else
                     'group_or_world_writable' if value['mode'] & 0o022 else None)
        if predicate:
            raise GuardError('read_ancestor_unknown', predicate=predicate, **context)
        result[current] = value
    return result


def service_uid(user, *, unit_role=None):
    """Resolve the currently loaded service User; never use a historic UID."""
    unit_require(isinstance(user, str), unit_role, 'User', code='unit_role_unknown',
                 predicate='unknown_service_identity')
    if not user:
        return 0
    if re.fullmatch(r'0|[1-9][0-9]{0,9}', user):
        value = int(user)
    else:
        unit_require(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,63}', user) is not None,
                     unit_role, 'User', code='unit_role_unknown', predicate='unknown_service_identity')
        try:
            import pwd
            value = pwd.getpwnam(user).pw_uid
        except (KeyError, ImportError, OSError):
            raise GuardError('unit_role_unknown', input_role='systemd_units',
                             predicate='unknown_service_identity', unit_role=unit_role, unit_field='User') from None
    unit_require(type(value) is int and 0 <= value < 2**32 - 1, unit_role, 'User',
                 code='unit_role_unknown', predicate='unknown_service_identity')
    return value


def bounded_read(path, allowed_uids=(0,), *, policy=None, input_role='unspecified'):
    safe_ancestors(path, policy=policy, input_role=input_role)
    if policy:
        allowed_uids = policy.file_uids(path, input_role)
    before = metadata(path, False)
    predicate = ('symlink_not_allowed' if stat.S_ISLNK(before['mode']) else
                 'not_regular' if not stat.S_ISREG(before['mode']) else
                 'owner_not_allowed' if before['uid'] not in allowed_uids else
                 'group_or_world_writable' if before['mode'] & 0o022 else None)
    if predicate:
        raise GuardError('read_file_permissions', input_role=diagnostic_role(path, input_role), predicate=predicate)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    opened = stat_metadata(os.fstat(fd))
    if opened != before:
        os.close(fd)
        raise GuardError('read_file_changed')
    with os.fdopen(fd, 'rb') as handle:
        raw = handle.read(MAX_BYTES + 1)
        require(stat_metadata(os.fstat(handle.fileno())) == opened, 'read_file_changed')
    require(len(raw) <= MAX_BYTES and metadata(path, False) == before, 'read_file_changed')
    return raw, before


def reference_file(path, candidate_inodes, candidate_paths, allow_absent=False, *, policy=None, input_role='unspecified'):
    """Resolve only already extracted current paths; never read their bodies."""
    resolved = os.path.realpath(path)
    if policy:
        safe_ancestors(path, policy=policy, input_role=input_role)
    try:
        value = metadata(path)
    except FileNotFoundError:
        require(allow_absent and not os.path.lexists(path), 'path_absence_unknown')
        safe_ancestors(path, policy=policy, input_role=input_role)
        return 0, {'absent': True, 'parent': metadata(posixpath.dirname(path), False)}
    require(stat.S_ISREG(value['mode']), 'path_type_unknown')
    # Metadata-only referenced leaves retain the 05 behavior. In particular TLS
    # files may legitimately be service-owned outside /etc/hysteria: no new
    # ownership/body-read permission gate is introduced for those leaf files.
    referenced = path in candidate_paths or resolved in candidate_paths or (value['dev'], value['ino']) in candidate_inodes
    return int(referenced), {'resolvedDigest': digest(resolved), 'metadata': value, 'link': metadata(path, False)}


class LinuxProbe:
    """Fixed reads only; import/constructor performs no host access."""

    def __init__(self):
        self._deadline = None
        self._baseline = None
        self._input_context = {}

    def _check_inputs(self, inputs):
        for path, info in inputs.items():
            self.budget()
            try:
                if isinstance(info, dict) and info.get('absent') is True:
                    require(not os.path.lexists(path) and metadata(posixpath.dirname(path), False) == info['parent'],
                            'input_changed')
                elif isinstance(info, dict) and 'directory' in info:
                    actual = metadata(path, False)
                    require({key: actual[key] for key in info['directory']} == info['directory'], 'input_changed')
                elif isinstance(info, dict) and 'metadata' in info:
                    require(metadata(path) == info['metadata'] and metadata(path, False) == info['link']
                            and digest(os.path.realpath(path)) == info['resolvedDigest'], 'input_changed')
                else:
                    require(metadata(path, False) == info, 'input_changed')
            except (GuardError, OSError):
                raise GuardError('input_changed', predicate='namespace_changed',
                                 **self._input_context.get(path, {'input_role': 'input_recheck'})) from None

    def _cgroup_members(self, unit, required=False):
        path = '/sys/fs/cgroup/system.slice/' + unit + '/cgroup.procs'
        try:
            members = Path(path).read_text().split()
        except FileNotFoundError:
            require(not required, 'process_cgroup_unknown')
            return []
        require(len(members) <= 32 and all(p.isdigit() for p in members), 'process_cgroup_unknown')
        return members

    def _fresh(self, candidates):
        require(self._baseline is not None, 'probe_not_initialized')
        baseline = self._baseline
        current_policy = OwnershipPolicy.from_units(baseline['units'])
        if current_policy.owners != baseline['policy'].owners:
            role = next((role for role in UNIT_ROLES.values()
                         if current_policy.owners.get(role) != baseline['policy'].owners.get(role)), 'candidate')
            unit_require(False, role, 'User', code='unit_role_unknown', predicate='unknown_service_identity')
        self._check_inputs(baseline['inputs'])
        refs, identity = self.process_references(
            {(r['metadata']['dev'], r['metadata']['ino']) for r in candidates},
            {r['path'] for r in candidates}, baseline['units'], full_scan=False)
        require(identity == baseline['related'], 'related_process_changed')
        self._check_inputs(baseline['inputs'])
        result = dict(baseline['result'])
        result['candidateReferenceCount'] = refs
        return result

    def budget(self):
        require(self._deadline is not None and time.monotonic() < self._deadline, 'dependency_probe_deadline')

    def units(self):
        result = {}
        for unit in UNITS:
            self.budget()
            reply = subprocess.run(['/usr/bin/systemctl', 'show', unit, '--no-pager',
                                    '--property=' + ','.join(PROPS)], stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, timeout=min(1.0, self._deadline - time.monotonic()), check=False)
            self.budget()
            require(reply.returncode == 0 and len(reply.stdout) <= MAX_BYTES, 'unit_read_failed')
            role = UNIT_ROLES[unit]
            fields = parse_unit_properties(reply.stdout, unit_role=role)
            for field, expected in (('Id', unit), ('LoadState', 'loaded'), ('NeedDaemonReload', 'no')):
                unit_require(fields[field] == expected, role, field)
            for field in UNSUPPORTED_UNIT_FIELDS:
                unit_require(not fields[field], role, field, predicate='nonempty_unsupported',
                             code='unit_hook_or_namespace_unknown')
            require(DIRECTORY not in fields['ExecStart'], 'current_reference')
            try:
                command_identity = exec_identity(fields['ExecStart'])
            except GuardError:
                raise GuardError('unit_exec_unknown', input_role='systemd_units', predicate='invalid_field',
                                 unit_role=role, unit_field='ExecStart') from None
            executable, argv = command_identity['path'], command_identity['argv']
            unit_require(argv[0] in (executable, posixpath.basename(executable))
                         and command_identity['ignoreErrors'] is False, role, 'ExecStart', code='unit_role_unknown')
            # Never assume a unit-level override, manager inheritance, or extra
            # EnvironmentFile matches the three predeclared file inputs.
            require(not fields['PassEnvironment'] and not fields['UnsetEnvironment'], 'unit_environment_unknown')
            words = shlex.split(fields['Environment'])
            require(not any(w.split('=', 1)[0] in PATH_KEYS for w in words), 'unit_environment_override')
            if unit == 'hysteria2.service':
                unit_require(fields['ActiveState'] == 'active', role, 'ActiveState', code='unit_role_unknown')
                unit_require(fields['SubState'] == 'running', role, 'SubState', code='unit_role_unknown')
                unit_require(executable in ('/usr/local/bin/hysteria', '/usr/bin/hysteria')
                             and argv[1:] in (['server', '--config', CONFIG], ['server', '-c', CONFIG],
                                             ['server', '--config=' + CONFIG]), role, 'ExecStart', code='unit_role_unknown')
                unit_require(fields['DynamicUser'] == 'no', role, 'DynamicUser', code='unit_role_unknown')
                fields['_configAllowedUid'] = service_uid(fields['User'], unit_role=role)
            elif unit == 'gccgw-edge-agent.service':
                unit_require(fields['ActiveState'] == 'active', role, 'ActiveState', code='unit_role_unknown')
                unit_require(fields['SubState'] == 'running', role, 'SubState', code='unit_role_unknown')
                unit_require(executable == EDGE + '/bin/edge-agent-loop.sh' and len(argv) == 1,
                             role, 'ExecStart', code='unit_role_unknown')
            else:
                unit_require(fields['WorkingDirectory'] in (RELEASE, '/opt/proxy-gateway-minimal-candidate/current'),
                             role, 'WorkingDirectory', code='unit_role_unknown')
                unit_require(executable == '/usr/bin/node' and len(argv) == 2
                             and argv[1] in tuple(prefix + suffix for prefix in ('', RELEASE + '/',
                                 '/opt/proxy-gateway-minimal-candidate/current/')
                                 for suffix in CANDIDATE_ENTRY_SUFFIXES),
                             role, 'ExecStart', code='unit_role_unknown')
                # A recognized entry name is not reviewed source. Resolve only
                # the fixed accepted spellings to the release pin checked by
                # collect(); candidate-start stays unknown until independently
                # reviewed bytes and their consumer behavior have been bound.
                entry_source = next((RELEASE + '/' + suffix for suffix in CANDIDATE_ENTRY_SUFFIXES
                    if argv[1] in (suffix, RELEASE + '/' + suffix,
                                   CANDIDATE_BASE + '/current/' + suffix)), None)
                unit_require(entry_source in SOURCE_PINS, role, 'ExecStart',
                             code='candidate_entry_source_unknown')
            unit_require(fields['MainPID'].isascii() and fields['MainPID'].isdigit(), role, 'MainPID')
            files = [fields['FragmentPath']] + shlex.split(fields['DropInPaths'])
            fields['_fileMetadata'] = [metadata(absolute_path(p), False) for p in files]
            fields['ExecStart'] = command_identity
            result[unit] = fields
        return result

    def process_references(self, candidate_inodes, candidate_paths, units, full_scan=True):
        edge_members = self._cgroup_members('gccgw-edge-agent.service', required=True)
        candidate_members = self._cgroup_members('proxy-gateway-candidate.service')
        if full_scan:
            pids = sorted(p for p in os.listdir('/proc') if p.isdigit())
        else:
            pids = sorted(set(edge_members + candidate_members + [units[u]['MainPID'] for u in UNITS[:2]]))
        require(len(pids) <= MAX_PROCESSES, 'process_coverage_limit')
        refs, count = 0, 0
        related = {int(units[u]['MainPID']) for u in UNITS[:2]}
        require(0 not in related, 'related_process_missing')
        identity = {}
        for pid in pids:
            self.budget()
            base = '/proc/' + pid
            try:
                rawstat = Path(base + '/stat').read_text()
                fields = rawstat[rawstat.rfind(')')+2:].split()
                if int(pid) in related:
                    identity[pid] = {'start': fields[19], 'exe': metadata(base + '/exe'),
                                     'exePathDigest': digest(os.readlink(base + '/exe'))}
                    hostroot, processroot = os.stat('/'), os.stat(base + '/root')
                    try:
                        os.readlink(base + '/ns/mnt')
                        os.readlink('/proc/self/ns/mnt')
                        namespace_readable = True
                    except OSError:
                        namespace_readable = False
                    related_namespace_allows_object_check(
                        (hostroot.st_dev, hostroot.st_ino) == (processroot.st_dev, processroot.st_ino),
                        namespace_readable)
                    unit_name = next(u for u in UNITS[:2] if units[u]['MainPID'] == pid)
                    group = units[unit_name]['ControlGroup']
                    require(group == '/system.slice/' + unit_name and
                            Path(base + '/cgroup').read_text().strip() == '0::' + group,
                            'related_cgroup_unknown')
                links = [base + '/cwd', base + '/exe']
                links += [base + '/fd/' + fd for fd in os.listdir(base + '/fd')]
                links += [base + '/map_files/' + item for item in os.listdir(base + '/map_files')]
                count += len(links)
                require(count <= MAX_FDS, 'process_coverage_limit')
                for link in links:
                    self.budget()
                    try:
                        target = os.readlink(link).removesuffix(' (deleted)')
                        value = os.stat(link)
                        refs += object_reference(target, (value.st_dev, value.st_ino),
                                                 candidate_paths, candidate_inodes)
                    except FileNotFoundError:
                        # A live fd closing mid-scan is benign; related process
                        # existence/start identity is independently bracketed.
                        continue
            except FileNotFoundError:
                require(int(pid) not in related, 'related_process_changed')
        require(set(identity) == {str(p) for p in related}, 'related_process_missing')
        # Idle producer only. No live once/production-agent child is accepted;
        # sleeping loop child may change without implying backup dependency.
        cg = units['gccgw-edge-agent.service']['ControlGroup']
        require(cg.startswith('/system.slice/') and '..' not in cg, 'process_cgroup_unknown')
        members = self._cgroup_members('gccgw-edge-agent.service', required=True)
        require(set(members) == set(edge_members), 'process_membership_changed')
        for pid in members:
            self.budget()
            args = Path('/proc/' + pid + '/cmdline').read_bytes()
            require(len(args) <= 16384, 'process_args_unknown')
            words = args.rstrip(b'\x00').split(b'\x00')
            known_loop = any(w == (EDGE + '/bin/edge-agent-loop.sh').encode() for w in words)
            sleeping = len(words) == 2 and words[0] in (b'sleep', b'/usr/bin/sleep', b'/bin/sleep') and words[1].isdigit()
            require(known_loop or sleeping, 'inflight_apply_unknown')
        for pid, evidence in identity.items():
            raw = Path('/proc/' + pid + '/stat').read_text()
            require(raw[raw.rfind(')')+2:].split()[19] == evidence['start']
                    and metadata('/proc/' + pid + '/exe') == evidence['exe']
                    and digest(os.readlink('/proc/' + pid + '/exe')) == evidence['exePathDigest'],
                    'related_process_changed')
        return refs, identity

    def collect(self, candidates, initial=False):
        try:
            self._deadline = time.monotonic() + PROBE_SECONDS
            require(os.name == 'posix' and os.geteuid() == 0 and socket.gethostname() == HOSTNAME, 'target_identity')
            if not initial:
                return self._fresh(candidates)
            inodes = {(r['metadata']['dev'], r['metadata']['ino']) for r in candidates}
            candidate_paths = {r['path'] for r in candidates}
            sources, inputs, refs = {}, {}, 0
            units = self.units()
            policy = OwnershipPolicy.from_units(units)
            input_roles = {}
            self._input_context = {}
            for path, expected in SOURCE_PINS.items():
                self.budget()
                role = 'edge_wrapper' if under(path, EDGE) else 'candidate_source'
                input_roles[path] = role
                raw, info = bounded_read(path, policy=policy, input_role=role)
                sources[path] = hashlib.sha256(raw).hexdigest()
                if sources[path] != expected:
                    raise GuardError('source_identity', input_role=diagnostic_role(path, role), predicate='source_digest_changed')
                inputs[path] = info
            for path in (EDGE + '/current', '/opt/proxy-gateway-minimal-candidate/current'):
                require(os.path.realpath(path) == RELEASE, 'source_link_changed')
                inputs[path] = metadata(path, False)
                input_roles[path] = 'edge_pointer' if under(path, EDGE) else 'candidate_pointer'
            # Existing wrapper/systemd precedence is not guessed: repeated path
            # fields must agree across the fixed files or the guard stops.
            by_role = {}
            for path, label, role in (
                    (ENV_FILES[0], 'sgp', 'sgp_environment'),
                    (ENV_FILES[1], 'agent', 'edge_environment'),
                    (ENV_FILES[2], 'runtime', 'edge_environment')):
                self.budget()
                input_roles[path] = role
                raw, info = bounded_read(path, policy=policy, input_role=role)
                inputs[path] = info
                by_role[label] = env_path_projection(raw)
            projection = merge_env_projections(by_role, DIRECTORY)
            require(PATH_KEYS <= projection.keys() and projection['EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH'] == CONFIG,
                    'producer_paths_unknown')
            raw, config_meta = bounded_read(CONFIG, policy=policy, input_role='hy2_config')
            paths = config_path_projection(raw)
            inputs[CONFIG] = config_meta
            input_roles[CONFIG] = 'hy2_config'
            require(set(paths) == {projection['EDGE_HYSTERIA2_CERTIFICATE_PATH'], projection['EDGE_HYSTERIA2_PRIVATE_KEY_PATH']},
                    'producer_runtime_paths_differ')
            paths += [projection[k] for k in PATH_KEYS if k != 'EDGE_HYSTERIA2_BACKUP_DIR']
            unit_paths = [path for unit in UNITS
                          for path in [units[unit]['FragmentPath']] + shlex.split(units[unit]['DropInPaths'])]
            policy.bind_references(runtime_paths=paths, unit_paths=unit_paths)
            policy.bind_certificate_owner_ancestors(
                projection['EDGE_HYSTERIA2_CERTIFICATE_PATH'],
                projection['EDGE_HYSTERIA2_PRIVATE_KEY_PATH'])
            for path in sorted(set(paths)):
                self.budget()
                # Candidate config may exist from a completed apply. Never read
                # its body: its path/inode is guarded, not treated as deletable.
                found, info = reference_file(path, inodes, candidate_paths,
                    allow_absent=path == projection['EDGE_HYSTERIA2_CANDIDATE_CONFIG_PATH'],
                    policy=policy, input_role='hy2_runtime_reference')
                refs += found
                inputs[path] = info
                input_roles[path] = 'hy2_runtime_reference'
            for unit in UNITS:
                for path in [units[unit]['FragmentPath']] + shlex.split(units[unit]['DropInPaths']):
                    found, info = reference_file(path, inodes, candidate_paths, policy=policy, input_role='unit_definition')
                    refs += found
                    inputs[path] = info
                    input_roles[path] = 'unit_definition'
            count, identity = self.process_references(inodes, candidate_paths, units)
            refs += count
            units_after = self.units()
            stable_units = {}
            for unit in UNITS:
                before, after = dict(units[unit]), dict(units_after[unit])
                if unit == UNITS[2]:
                    for field in ('ActiveState', 'SubState', 'MainPID', 'ControlGroup'):
                        before.pop(field, None)
                        after.pop(field, None)
                require(before == after, 'unit_changed')
                stable_units[unit] = before
            # Pin every ancestor identity/permission too. Runtime leaf aliases
            # are separately bound by realpath+inode above, never by path alone.
            for path in list(inputs):
                role = input_roles[path]
                self._input_context[path] = {'input_role': diagnostic_role(path, role)}
                ancestors = safe_ancestors(path, policy=policy, input_role=role)
                for index, (parent, info) in enumerate(ancestors.items()):
                    if parent not in inputs:
                        # Parent mtime legitimately changes when an unrelated
                        # file is created. Bind structural fields, not its mtime.
                        inputs[parent] = {'directory': {k: info[k] for k in ('dev', 'ino', 'mode', 'uid', 'gid')}}
                        self._input_context[parent] = {'input_role': diagnostic_role(path, role), 'ancestor_index': index,
                            'ancestor_role': policy.ancestor_rule(parent, role)[1]}
            self._check_inputs(inputs)
            self.budget()
            result = {'hostname': HOSTNAME, 'sourceDigests': sources, 'sourceStable': True,
                    'configSchemaSupported': True, 'configPathsCovered': True, 'unitRolesVerified': True,
                    'processCoverageComplete': True, 'inFlightApply': False, 'candidateReferenceCount': refs,
                    'pathProjectionDigest': digest(projection),
                    'stableDigest': digest({'inputs': inputs, 'units': stable_units, 'related': identity})}
            self._baseline = {'inputs': inputs, 'units': units, 'related': identity, 'result': result, 'policy': policy}
            return result
        except GuardError:
            raise
        except (OSError, ValueError, UnicodeError, subprocess.SubprocessError, IndexError):
            raise GuardError('dependency_probe_incomplete') from None


class CurrentDependencyGuard:
    def __init__(self, candidate_entries, probe=None):
        require(isinstance(candidate_entries, list) and 0 < len(candidate_entries) <= 10000, 'candidate_scope')
        self.candidates = []
        seen = set()
        for row in candidate_entries:
            path, info = row.get('path'), row.get('metadata', {})
            require(isinstance(path, str) and posixpath.dirname(path) == DIRECTORY
                    and path not in seen and stat.S_ISREG(info.get('mode', 0)) and info.get('nlink') == 1
                    and all(type(info.get(k)) is int and info[k] >= 0 for k in ('dev', 'ino')), 'candidate_scope')
            seen.add(path)
            self.candidates.append({'path': path, 'metadata': dict(info)})
        self.probe = probe if probe is not None else LinuxProbe()
        self._evidence = None
        self._scope = None
        self._observations = 0
        self._phase = 'not_initialized'
        self.source_digest = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()

    def _read(self, scope, initial):
        require(isinstance(scope, dict) and scope.get('root') == ROOT and scope.get('target') == 'sgp'
                and scope.get('protocolDirs') == ['hysteria2'], 'scope')
        require(self._scope is None or scope == self._scope, 'scope_changed')
        value = self.probe.collect(self.candidates, initial=initial)
        self._observations += 1
        require(value.get('hostname') == HOSTNAME, 'target_identity')
        require(value.get('sourceDigests') == SOURCE_PINS, 'source_identity')
        for field in ('sourceStable', 'configSchemaSupported', 'configPathsCovered', 'unitRolesVerified', 'processCoverageComplete'):
            require(value.get(field) is True, 'dependency_coverage_incomplete')
        require(value.get('inFlightApply') is False, 'inflight_apply_unknown')
        require(type(value.get('candidateReferenceCount')) is int and value['candidateReferenceCount'] == 0,
                'current_reference_or_unknown')
        require(all(isinstance(value.get(k), str) and re.fullmatch('[0-9a-f]{64}', value[k])
                    for k in ('stableDigest', 'pathProjectionDigest')), 'dependency_evidence_unknown')
        return digest({'policy': 'current-dependencies-only-v1', 'scope': scope,
                       'candidateIdentities': self.candidates, 'proof': value})

    def initialize(self, scope):
        require(self._evidence is None, 'already_initialized')
        evidence = self._read(scope, True)
        self._evidence, self._scope = evidence, dict(scope)
        self._phase = 'initial'
        return {'complete': True, 'evidenceDigest': evidence, 'holds': []}

    def read_protection(self, scope):
        require(self._evidence is not None, 'not_initialized')
        require(self._read(scope, False) == self._evidence, 'dependency_changed')
        self._phase = 'fast'
        return {'complete': True, 'evidenceDigest': self._evidence, 'holds': []}

    def validate_final(self, scope):
        """Full source/config/unit/all-process read, only at the wrapper boundary."""
        require(self._evidence is not None, 'not_initialized')
        require(self._read(scope, True) == self._evidence, 'dependency_changed')
        self._phase = 'final'
        return self.public_summary()

    def public_summary(self):
        baseline = getattr(self.probe, '_baseline', None)
        units = []
        if baseline and self._phase in ('initial', 'final'):
            units = [{'name': name, 'activeState': baseline['units'][name]['ActiveState'],
                      'subState': baseline['units'][name]['SubState']} for name in UNITS]
        return {'state': 'initialized' if self._evidence else 'not_initialized',
                'initializationPassed': self._evidence is not None,
                'observations': self._observations, 'candidateCount': len(self.candidates),
                'evidenceDigest': self._evidence,
                'candidateReferenceCount': 0 if self._evidence else None,
                'inFlightApply': False if self._evidence else None,
                'observationPhase': self._phase, 'units': units,
                'coverage': 'fixed_current_producer_runtime_units_and_present_proc_references',
                'historicalResponsibilityReviewRequired': False,
                'productionExecuted': False, 'mutationCommands': []}
