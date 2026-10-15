import { spawnSync } from 'node:child_process';

// Kernel-xattr inspection in the already admitted, private WSL namespace.
// Ancestors are inspected once; only the exact extracted tree is traversed.
const INSPECT_XATTRS = `import os, stat, sys
try:
 root, scope = sys.argv[1:]
 if scope not in ('single', 'recursive'): raise ValueError()
 pending = [root]
 count = 0
 while pending:
  path = pending.pop()
  count += 1
  if count > 100000: raise ValueError()
  metadata = os.lstat(path)
  attributes = os.listxattr(path, follow_symlinks=False)
  if any(key in attributes for key in ('system.posix_acl_access', 'system.posix_acl_default', 'security.capability')): raise ValueError()
  if scope == 'recursive' and stat.S_ISDIR(metadata.st_mode):
   with os.scandir(path) as children:
    for child in children:
     pending.append(child.path)
     if count + len(pending) > 100000: raise ValueError()
 print('verified')
except Exception:
 sys.exit(1)
`;

export function createDataPackDependencyAclChecker(runDir, { spawn = spawnSync } = {}) {
  if (typeof runDir !== 'string' || !/^\/tmp\/gccgw-data-pack-wsl\.[A-Za-z0-9]{8}$/.test(runDir)
    || typeof spawn !== 'function') {
    throw Object.assign(new Error('wsl_acceptance_input_invalid'), { code: 'wsl_acceptance_input_invalid' });
  }
  const ancestors = new Set([runDir, '/tmp', '/']);
  const treeRoot = `${runDir}/dependencies/node_modules`;
  return path => {
    const scope = ancestors.has(path) ? 'single' : path === treeRoot ? 'recursive' : null;
    if (scope === null) return false;
    try {
      const result = spawn('/usr/bin/python3', ['-I', '-S', '-c', INSPECT_XATTRS, path, scope], {
        env: {}, shell: false, timeout: 10000, maxBuffer: 1024,
        encoding: 'utf8', windowsHide: true
      });
      return !result.error && !result.signal && result.status === 0
        && result.stdout === 'verified\n' && result.stderr === '';
    } catch { return false; }
  };
}
