#!/usr/bin/env node
// Executed only from the exact exported source in the private WSL run directory.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acceptanceReceipt, PACKAGE_FILES, validateDataPackNamespace,
  validateDataPackWslGate } from './lib/data-pack-wsl-acceptance-guard.mjs';
import { verifyDataPackSourceTree } from './lib/data-pack-wsl-source-tree.mjs';

const NODE_SHA = '9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578';
const HY_SHA = '66dbdb0608f25f3057b433afe975a9fc1af2ca8e512479e294988b3ef363d6c1';
function stop() { const error = new Error('wsl_acceptance_input_invalid'); error.code = error.message; throw error; }
function privateFile(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid()
    || (info.mode & 0o077) !== 0 || info.size > 256 * 1024 * 1024) stop();
  return file;
}
const hashFile = file => createHash('sha256').update(readFileSync(file)).digest('hex');
function admit(runDir, gatePath, expectedCommit, approvedGateSha256) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.version !== 'v22.23.1'
    || !/^\/tmp\/gccgw-data-pack-wsl\.[A-Za-z0-9]{8}$/.test(runDir)
    || realpathSync(runDir) !== runDir) stop();
  const info = lstatSync(runDir);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()
    || (info.mode & 0o077) !== 0) stop();
  const gateBytes = readFileSync(privateFile(gatePath));
  if (!/^[a-f0-9]{64}$/.test(approvedGateSha256 || '')
    || createHash('sha256').update(gateBytes).digest('hex') !== approvedGateSha256) stop();
  const gate = validateDataPackWslGate(JSON.parse(gateBytes),
    { expectedCommit });
  if (gate.nodeSha256 !== NODE_SHA || gate.hysteriaSha256 !== HY_SHA) stop();
  const prep = JSON.parse(readFileSync(privateFile(join(runDir, 'receipt.json')), 'utf8'));
  if (prep.state !== 'prepared_not_executed' || prep.source_commit !== expectedCommit
    || prep.node_artifact_sha256 !== NODE_SHA || prep.hysteria_artifact_sha256 !== HY_SHA
    || hashFile(privateFile(join(runDir, 'node-v22.23.1-linux-x64.tar.xz'))) !== NODE_SHA
    || hashFile(privateFile(join(runDir, 'hysteria-linux-amd64'))) !== HY_SHA) stop();
  for (const file of PACKAGE_FILES) {
    const sourcePath = join(runDir, 'source', file);
    if (realpathSync(sourcePath) !== sourcePath || !lstatSync(sourcePath).isFile()
      || hashFile(sourcePath) !== gate.files[file]) stop();
  }
  if (hashFile(privateFile(join(runDir, 'source.tar'))) !== gate.sourceArchiveSha256) stop();
  verifyDataPackSourceTree({ sourceRoot: join(runDir, 'source'),
    manifestBytes: readFileSync(privateFile(join(runDir, 'source-tree.json'))),
    manifestSha256: gate.sourceTreeSha256, expectedCommit });
  if (hashFile(privateFile(join(runDir, 'node-modules.tar'))) !== gate.dependencySha256
    || hashFile(privateFile(join(runDir, 'dependency-artifact.json'))) !== gate.dependencyManifestSha256) stop();
  const dependency = JSON.parse(readFileSync(join(runDir, 'dependency-artifact.json'), 'utf8'));
  if (dependency.sourceCommit !== gate.sourceCommit || dependency.state !== 'verified') stop();
  return gate;
}
function namespaceReadback(runDir) {
  const runInfo = lstatSync(runDir);
  if (process.env.GCCGW_PARENT_RUN_ID !== `${runInfo.dev}:${runInfo.ino}`) stop();
  const parent = JSON.parse(process.env.GCCGW_PARENT_NS || 'null');
  const current = Object.fromEntries(['user', 'mnt', 'net', 'pid']
    .map(name => [name, readlinkSync(`/proc/self/ns/${name}`)]));
  const interfaces = readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)
    .filter(line => line.includes(':')).map(line => line.split(':')[0].trim()).sort();
  const routeCount = family => {
    const result = spawnSync('ip', [...family, '-j', 'route', 'show', 'default'],
      { shell: false, encoding: 'utf8', timeout: 2000, maxBuffer: 16384,
        env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' } });
    if (result.status !== 0) stop();
    const routes = JSON.parse(result.stdout);
    if (!Array.isArray(routes)) stop();
    return routes.length;
  };
  const mounts = readFileSync('/proc/self/mountinfo', 'utf8');
  const masked = ['/mnt', '/home', '/root', '/tmp'].every(path => mounts.split('\n')
    .some(line => line.split(' ')[4] === path && line.includes(' - tmpfs ')));
  validateDataPackNamespace({ parent, current, interfaces,
    defaultRoutes: routeCount([]) + routeCount(['-6']), hostMountsAccessible: !masked });
  return true;
}
function noAclOrCapabilities(path) {
  // WSL need not install getfacl/libcap tooling. Read the same kernel xattrs
  // directly; unsupported inspection or traversal error is a blocking result.
  if (!path.startsWith('/tmp/gccgw-data-pack-wsl.')) return false;
  const script = `import os, sys\ncount=0\ntry:\n for directory, dirs, files in os.walk(sys.argv[1], followlinks=False):\n  for path in [directory]+[os.path.join(directory,name) for name in files+dirs]:\n   count+=1\n   if count>100000: raise ValueError()\n   attributes=os.listxattr(path,follow_symlinks=False)\n   if any(key in attributes for key in ['system.posix_acl_access','system.posix_acl_default','security.capability']): raise ValueError()\n print('verified')\nexcept Exception:\n sys.exit(1)\n`;
  const result = spawnSync('/usr/bin/python3', ['-I', '-S', '-c', script, path], {
    env: {}, shell: false, timeout: 10000, maxBuffer: 1024, encoding: 'utf8'
  });
  return result.status === 0 && result.stdout.trim() === 'verified';
}

if (process.argv[2] === '--self-check' && process.argv.length === 3) {
  process.stdout.write('entry_self_check=passed; physical_execution=not_started\n');
} else {
  const [mode, runDir, gatePath, expectedCommit, approvedGateSha256] = process.argv.slice(2);
  let gate, transport, result = null, namespaceVerified = false, cleanupVerified = false;
  let outcome = 'failed';
  try {
    if (!['--admit', '--execute'].includes(mode) || process.argv.length !== 7) stop();
    gate = admit(runDir, gatePath, expectedCommit, approvedGateSha256);
    if (mode === '--admit') {
      process.stdout.write('admission=passed; physical_execution=not_started\n');
    } else {
      namespaceVerified = namespaceReadback(runDir);
      // Consume the exact Linux CI artifact inside the masked, private network
      // namespace. No npm lifecycle code or native addon runs on the WSL host.
      const { prepareDependencyArtifactTree } = await import('./control-plane-dependency-artifact-lib.mjs');
      const prepared = prepareDependencyArtifactTree({
        manifestBytes: readFileSync(join(runDir, 'dependency-artifact.json')),
        archivePath: join(runDir, 'node-modules.tar'),
        packageJsonBytes: readFileSync(join(runDir, 'source/package.json')),
        packageLockBytes: readFileSync(join(runDir, 'source/package-lock.json')),
        expectedSourceCommit: gate.sourceCommit,
        expectedManifestSha256: gate.dependencyManifestSha256,
        expectedArchiveSha256: gate.dependencySha256,
        destinationRoot: join(runDir, 'dependencies'),
        runtime: { nodePath: process.execPath,
          npmPath: join(runDir, 'node/bin/npm'), npmVersion: '10.9.8',
          checkAclCapabilities: noAclOrCapabilities }
      });
      renameSync(prepared.extracted.nodeModulesRoot, join(runDir, 'source/node_modules'));
      prepared.extracted.cleanup();
      const { createDataPackHysteriaTransport } = await import('./lib/data-pack-hysteria-transport.mjs');
      const { runDataPackPhysicalScenario } = await import('./lib/data-pack-physical-scenario.mjs');
      transport = createDataPackHysteriaTransport({ runDir,
        binaryPath: join(runDir, 'hysteria-linux-amd64'),
        certificatePath: join(runDir, 'loopback.crt'), privateKeyPath: join(runDir, 'loopback.key'),
        parentNetworkNamespace: JSON.parse(process.env.GCCGW_PARENT_NS).net });
      await transport.start();
      result = await runDataPackPhysicalScenario({ runDir, transport });
      if (result.ok !== true || result.acceptanceScope?.actualProtocolProcess !== true) stop();
      outcome = 'passed';
    }
  } catch {
    process.exitCode = 1;
    process.stderr.write('data-pack WSL acceptance stopped; no raw error output\n');
  } finally {
    if (mode === '--execute' && gate) {
      try {
        const cleanup = transport ? await transport.close() : null;
        cleanupVerified = cleanup?.processesStopped === true && cleanup?.listenersClear === true;
      } catch { cleanupVerified = false; }
      if (!cleanupVerified) { outcome = 'failed'; process.exitCode = 1; }
      writeFileSync(join(runDir, 'physical-receipt.json'), JSON.stringify(acceptanceReceipt({
        gate, outcome, namespaceVerified, physicalResult: result,
        cleanupVerified, errorCategory: outcome === 'passed' ? null : 'acceptance_stopped'
      }), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
  }
}
