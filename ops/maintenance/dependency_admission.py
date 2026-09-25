"""Reviewed cleanup-admission rules. These do not read the host or delete backups.

The decisions match the Record 14–25 diagnostics. Host-specific paths stay with
the caller. This module only decides whether a supplied fact is admissible.
"""
import posixpath

CANDIDATE_ENTRY_SUFFIXES = ('server/index.mjs', 'server/start.mjs', 'candidate-start.mjs')


class AdmissionError(ValueError):
    """Static admission code. The message is the code and nothing else."""


def candidate_script_allowed(script, release, current):
    prefixes = ('', release + '/', current + '/')
    return script in tuple(prefix + suffix for prefix in prefixes for suffix in CANDIDATE_ENTRY_SUFFIXES)


def path_ancestor(path, index):
    """Index 0 is `/`. The leaf filename is not an ancestor."""
    if not isinstance(path, str) or not path.startswith('/') or posixpath.normpath(path) != path:
        raise AdmissionError('path_unknown')
    current = '/'
    ancestors = ['/']
    for part in path.strip('/').split('/')[:-1]:
        current = posixpath.join(current, part)
        ancestors.append(current)
    if type(index) is not int or not 0 <= index < len(ancestors):
        return None
    return ancestors[index]


def backup_dir_relation(value, directory):
    if value == directory:
        return 'matches_current'
    if isinstance(value, str) and value.startswith(directory + '/'):
        return 'inside_current'
    if not isinstance(value, str):
        raise AdmissionError('path_unknown')
    ancestor = value[:-1] if value != '/' and value.endswith('/') else value
    if ancestor != directory and directory.startswith(ancestor.rstrip('/') + '/'):
        return 'parent_of_current'
    return 'elsewhere'


def merge_env_projections(by_role, directory):
    """Keep the current backup directory when sgp and runtime agree and agent is outside."""
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
            raise AdmissionError('env_precedence_unknown')
    return merged


def namespace_allows_object_check(root_same, namespace_readable):
    if not root_same or not namespace_readable:
        raise AdmissionError('related_namespace_unknown')


def object_reference(target, inode, candidate_paths, candidate_inodes):
    if inode in candidate_inodes:
        return 1
    if target in candidate_paths:
        raise AdmissionError('alias_unclear')
    return 0


class CertificateAncestorPolicy:
    """Only index 2 of the certificate and private-key paths can add one shared UID."""

    def __init__(self, owners):
        self.owners = dict(owners)
        self.certificate_owner_ancestors = set()

    def bind(self, certificate_path, private_key_path):
        found = set()
        for path in (certificate_path, private_key_path):
            ancestor = path_ancestor(path, 2)
            if ancestor is not None:
                found.add(ancestor)
        self.certificate_owner_ancestors = found

    def allowed_owners(self, ancestor, input_role):
        shared = self.owners.get('hy2')
        if (input_role == 'hy2_runtime_reference' and ancestor in self.certificate_owner_ancestors
                and shared not in (None, 0) and shared == self.owners.get('candidate')):
            return {0, shared}, 'hy2_certificate_ancestor'
        return {0}, 'other_root'
