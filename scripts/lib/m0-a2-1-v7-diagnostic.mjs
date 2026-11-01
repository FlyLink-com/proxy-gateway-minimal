import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// M0-A2-1 v7: read-only systemd, deployed-archive, status-writer and exact-invocation diagnostic.
// It never invokes a collector, reads the full-metering SQLite DB/checkpoint/journal directory,
// changes systemd state, writes files, or returns raw environment / ExecStart / journal content.

const BASE = '/opt/proxy-gateway-minimal-candidate';
// systemd paths are Linux paths; keep POSIX separators even when local tests run on Windows Node.
const CURRENT_LINK = path.posix.join(BASE, 'current');
const ARCHIVE_ROOT = '/opt/gccwebos-runtime/collector-plan-e834185cca07';
const CONFIG_PATH = `${BASE}/full-metering-bwh-local-20261012/config.json`;
const EXPECTED_FAILURE_START = '2026-10-20 02:15:07 UTC';
const APP_UNIT = 'proxy-gateway-candidate.service';
const FULL_SERVICE = 'gccgw-full-metering-collect.service';
const FULL_TIMER = 'gccgw-full-metering-collect.timer';
const STOP_SERVICE = 'gccgw-full-metering-collect-stop.service';
const STATUS_SERVICE = 'gccgw-traffic-usage-collect.service';
const STATUS_TIMER = 'gccgw-traffic-usage-collect.timer';
const RELEASE_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const SAFE_ABSOLUTE_PATH = /^\/[A-Za-z0-9_./-]+$/;
const SAFE_ERROR_CODE = /^(full_metering_|baseline_|counter_|observation_|unknown_counter_|source_|observed_counter_|closed_connection_|connection_)[a-z0-9_]{1,88}$/;
const MAX_JOURNAL_BYTES = 1024 * 1024;
const MAX_RUNTIME_MS = 45000;
const MAX_STATUS_BYTES = 256 * 1024;
const MAX_PROCESS_ENV_BYTES = 1024 * 1024;
const MAX_STATUS_PATH_BYTES = 4096;
const MULTI_VALUE_PROPERTIES = new Set(['EnvironmentFiles']);
const JP_CHANNELS = [
  'channel-vultr-a-vless-reality-tcp',
  'channel-vultr-a-hy2',
  'channel-vultr-a-tuic'
];
const APP_PINS = new Map([
  ['server/services/platform/traffic-collector-admin-projection.mjs', 'be3b0dc3b12915ab76257cf75213fdb364fe925338baafdbfa506576eaef177a'],
  ['server/services/platform/traffic-collector-state.mjs', '79c12807afa326517865f0e3193de8d0f66be5181f0a14f6daad54f707d82af7'],
  ['server/services/platform/traffic-collector-status-producers.mjs', 'db8b2b7a3bdc343bcebaf3eb93ca71128f86057e17501759555c0bd5f7126d0a'],
  ['server/services/platform/unresolved-binding-provenance.mjs', '579f60e9635fee399317c6c5eb0c8f430f150872081fb4e255df79cb8b390bc5']
]);

// Exact 49-file closure copied from the existing full-metering proof manifest at master.
import { FILES } from './m0-a2-1-v7-archive-pins.mjs';

const fail = (code, details = {}) => { throw Object.assign(new Error('gate_stopped'), { safeCode: code, safeDetails: details }); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function assertTimeBudget(startedAt) {
  if (Date.now() - startedAt > MAX_RUNTIME_MS) fail('time_limit');
}

export function readBoundedFile(fd, maxBytes, errorCode = 'bounded_file_too_large') {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !/^[a-z0-9_]+$/.test(errorCode)) {
    fail('bounded_read_arguments_invalid');
  }
  const chunks = [];
  let total = 0;
  while (true) {
    // Read at most the remaining allowance plus one byte, so growth after lstat/fstat
    // cannot turn this into an unbounded read.
    const readLimit = Math.min(16 * 1024, maxBytes - total + 1);
    const chunk = Buffer.allocUnsafe(readLimit);
    const bytesRead = fs.readSync(fd, chunk, 0, readLimit, null);
    if (bytesRead === 0) break;
    if (total + bytesRead > maxBytes) fail(errorCode);
    total += bytesRead;
    chunks.push(chunk.subarray(0, bytesRead));
  }
  return Buffer.concat(chunks, total);
}

let stage = 'bootstrap';

export function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === '--self-test') return { mode: 'self-test' };
  if (argv.length === 1 && argv[0] === '--expected-release') return { error: 'expected_release_required' };
  if (argv.length === 2 && argv[0] === '--expected-release') {
    const expectedRelease = argv[1];
    if (!RELEASE_LABEL_PATTERN.test(expectedRelease) || expectedRelease === '.' || expectedRelease === '..') return { error: 'expected_release_invalid' };
    return { mode: 'run', expectedRelease };
  }
  return { error: argv.length === 0 ? 'expected_release_required' : 'unexpected_argument' };
}

export function parseSystemdOutput(stdout, properties, requiredProperties = ['LoadState', 'ActiveState', 'SubState']) {
  const lines = stdout.split(/\r?\n/);
  while (lines.length && lines.at(-1) === '') lines.pop();
  if (!lines.length) fail('systemd_empty_output');
  const row = Object.create(null);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], at = line.indexOf('=');
    if (at <= 0) fail('systemd_malformed_line', { line: index + 1 });
    const key = line.slice(0, at), value = line.slice(at + 1);
    if (!/^[A-Za-z][A-Za-z0-9]+$/.test(key)) fail('systemd_invalid_property_name', { line: index + 1 });
    if (!properties.includes(key)) fail('systemd_unexpected_property', { property: key, line: index + 1 });
    if (Object.hasOwn(row, key)) {
      if (!MULTI_VALUE_PROPERTIES.has(key)) fail('systemd_duplicate_property', { property: key, line: index + 1 });
      row[key].push(value);
    } else row[key] = MULTI_VALUE_PROPERTIES.has(key) ? [value] : value;
  }
  for (const key of requiredProperties) if (!Object.hasOwn(row, key)) fail('systemd_required_property_missing', { property: key });
  return row;
}

const APP_PROPERTIES = [
  'LoadState','ActiveState','SubState','MainPID','WorkingDirectory','EnvironmentFiles',
  'PassEnvironment','UnsetEnvironment','User','Group','DynamicUser','NRestarts','FragmentPath','DropInPaths'
];
const SERVICE_PROPERTIES = [
  'LoadState','ActiveState','SubState','Result','MainPID','ControlPID','NRestarts','ExecMainCode','ExecMainStatus',
  'ExecMainStartTimestamp','ExecMainExitTimestamp','InvocationID','WorkingDirectory','ExecStart','OnFailure',
  'FragmentPath','DropInPaths'
];
const STATUS_SERVICE_PROPERTIES = [
  ...SERVICE_PROPERTIES,'EnvironmentFiles','PassEnvironment','UnsetEnvironment','User','Group','DynamicUser'
];
const TIMER_PROPERTIES = [
  'LoadState','ActiveState','SubState','Unit','LastTriggerUSec','NextElapseUSecRealtime','Persistent','Triggers','Job',
  'FragmentPath','DropInPaths'
];
const STOP_PROPERTIES = [
  'LoadState','ActiveState','SubState','Result','MainPID','ControlPID','ExecMainStatus','ExecMainStartTimestamp',
  'ExecMainExitTimestamp','InvocationID','WorkingDirectory','ExecStart','FragmentPath','DropInPaths'
];

function systemdShow(unit, properties, requiredProperties = ['LoadState', 'ActiveState', 'SubState']) {
  const args = ['show', unit, '--no-pager', ...properties.map(property => `--property=${property}`)];
  const result = spawnSync('/usr/bin/systemctl', args, {
    encoding: 'utf8', timeout: 2500, maxBuffer: 65536, shell: false,
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
    stdio: ['ignore','pipe','pipe']
  });
  if (result.error || result.status !== 0 || result.stderr !== '') fail('systemd_read_failed');
  return parseSystemdOutput(result.stdout, properties, requiredProperties);
}

function sameSnapshot(before, after, unitName) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = Object.hasOwn(before, key), b = Object.hasOwn(after, key);
    if (a !== b || (a && JSON.stringify(before[key]) !== JSON.stringify(after[key]))) fail('systemd_changed_during_read', { unit: unitName, property: key });
  }
}

function appWorkingDirectoryMatchesRelease(workingDirectory, appRoot, realpathSync) {
  if (workingDirectory === appRoot) return true;
  if (workingDirectory !== CURRENT_LINK) return false;
  try { return realpathSync(workingDirectory) === appRoot; } catch { return false; }
}

function resolveAppRelease(appBefore, expectedRelease) {
  if (appBefore.LoadState !== 'loaded' || appBefore.ActiveState !== 'active' || appBefore.SubState !== 'running' || !/^[1-9][0-9]*$/.test(appBefore.MainPID || '')) fail('app_not_stable');
  const baseInfo = fs.lstatSync(BASE, { bigint: true });
  if (!baseInfo.isDirectory() || baseInfo.isSymbolicLink() || baseInfo.uid !== 0n || (baseInfo.mode & 0o022n) !== 0n || fs.realpathSync(BASE) !== BASE) fail('app_base_directory_unsafe');
  const appBase = BASE, releasesRoot = path.join(appBase, 'releases');
  const currentInfo = fs.lstatSync(CURRENT_LINK, { bigint: true });
  if (!currentInfo.isSymbolicLink() || currentInfo.uid !== 0n || currentInfo.nlink !== 1n) fail('app_current_pointer_invalid');
  const currentPointerTarget = fs.readlinkSync(CURRENT_LINK);
  const currentInfoAfterRead = fs.lstatSync(CURRENT_LINK, { bigint: true });
  if (JSON.stringify(signature(currentInfo)) !== JSON.stringify(signature(currentInfoAfterRead))
    || fs.readlinkSync(CURRENT_LINK) !== currentPointerTarget) fail('app_current_pointer_changed');
  const releasesInfo = fs.lstatSync(releasesRoot, { bigint: true });
  if (!releasesInfo.isDirectory() || releasesInfo.isSymbolicLink() || releasesInfo.uid !== 0n || (releasesInfo.mode & 0o022n) !== 0n || fs.realpathSync(releasesRoot) !== releasesRoot) fail('app_releases_root_unsafe');
  const appRoot = fs.realpathSync(CURRENT_LINK);
  const currentInfoAfterResolve = fs.lstatSync(CURRENT_LINK, { bigint: true });
  if (JSON.stringify(signature(currentInfo)) !== JSON.stringify(signature(currentInfoAfterResolve))
    || fs.readlinkSync(CURRENT_LINK) !== currentPointerTarget
    || fs.realpathSync(CURRENT_LINK) !== appRoot) fail('app_current_pointer_changed');
  const appRootInfo = fs.lstatSync(appRoot, { bigint: true });
  if (!appRootInfo.isDirectory() || appRootInfo.isSymbolicLink() || appRootInfo.uid !== 0n || (appRootInfo.mode & 0o022n) !== 0n || !path.isAbsolute(appRoot) || path.dirname(appRoot) !== releasesRoot || !RELEASE_LABEL_PATTERN.test(path.basename(appRoot))) fail('app_release_directory_unexpected');
  if (path.basename(appRoot) !== expectedRelease) fail('app_release_label_mismatch');
  if (!appWorkingDirectoryMatchesRelease(appBefore.WorkingDirectory, appRoot, fs.realpathSync)) fail('app_working_directory_unbound');
  let processRoot;
  try { processRoot = fs.realpathSync(`/proc/${appBefore.MainPID}/cwd`); } catch { fail('app_process_cwd_unreadable'); }
  if (processRoot !== appRoot) fail('app_process_cwd_unbound');
  return {
    appRoot,
    releaseLabel: path.basename(appRoot),
    pid: appBefore.MainPID,
    currentPointer: { target: currentPointerTarget, signature: signature(currentInfo) }
  };
}

export function sameAppReleaseBinding(before, after) {
  return before?.appRoot === after?.appRoot
    && before?.releaseLabel === after?.releaseLabel
    && before?.pid === after?.pid
    && JSON.stringify(before?.currentPointer) === JSON.stringify(after?.currentPointer);
}

function assertPinnedAppSource(appRoot) {
  for (const [relative, expected] of APP_PINS) {
    const file = path.join(appRoot, relative), before = fs.lstatSync(file, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.uid !== 0n || before.nlink !== 1n || before.size > 1024n * 1024n || (before.mode & 0o022n) !== 0n || fs.realpathSync(file) !== file) fail('app_source_file_unsafe');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const opened = fs.fstatSync(fd, { bigint: true });
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.mtimeNs !== before.mtimeNs || opened.ctimeNs !== before.ctimeNs) fail('app_source_file_changed');
      const bytes = readBoundedFile(fd, 1024 * 1024, 'app_source_file_too_large');
      const after = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(file, { bigint: true });
      if (BigInt(bytes.length) !== before.size || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs || named.dev !== before.dev || named.ino !== before.ino || named.mtimeNs !== before.mtimeNs || named.ctimeNs !== before.ctimeNs) fail('app_source_file_changed');
      if (sha(bytes) !== expected) fail('app_source_hash_mismatch');
    } finally { fs.closeSync(fd); }
  }
}

const signature = stat => ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].map(key => String(stat[key]));
function secureMeta(file, { directory = false, privateFile = false, uid = 0 } = {}) {
  const stat = fs.lstatSync(file, { bigint: true });
  if (fs.realpathSync(file) !== file || stat.isSymbolicLink() || stat.uid !== BigInt(uid)) fail('archive_file_unsafe');
  if (directory) {
    if (!stat.isDirectory() || (stat.mode & 0o022n) !== 0n) fail('archive_directory_unsafe');
  } else if (!stat.isFile() || stat.nlink !== 1n || (stat.mode & BigInt(privateFile ? 0o077 : 0o022)) !== 0n) fail('archive_file_unsafe');
  return stat;
}
function readPinnedFile(file, expectedHash, expectedSize) {
  const before = secureMeta(file);
  if (before.size !== BigInt(expectedSize)) fail('archive_file_size_mismatch');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (JSON.stringify(signature(opened)) !== JSON.stringify(signature(before))) fail('archive_file_changed');
    const bytes = readBoundedFile(fd, expectedSize, 'archive_file_size_mismatch');
    const after = fs.fstatSync(fd, { bigint: true });
    const named = secureMeta(file);
    if (bytes.length !== expectedSize || JSON.stringify(signature(after)) !== JSON.stringify(signature(before)) || JSON.stringify(signature(named)) !== JSON.stringify(signature(before))) fail('archive_file_changed');
    if (sha(bytes) !== expectedHash) fail('archive_file_hash_mismatch');
    return signature(before);
  } finally { fs.closeSync(fd); }
}
export function validateArchiveManifest(files = FILES) {
  if (files.length !== 49 || new Set(files.map(([file]) => file)).size !== 49) fail('archive_manifest_invalid');
  for (const [file, hash, size] of files) {
    if (!/^[A-Za-z0-9_./-]+$/.test(file) || file.startsWith('/') || file.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(hash) || !Number.isSafeInteger(size) || size < 1) fail('archive_manifest_invalid');
  }
  return true;
}
function verifyArchive() {
  validateArchiveManifest();
  const directories = new Set([ARCHIVE_ROOT]);
  for (const [relative] of FILES) {
    let current = ARCHIVE_ROOT;
    for (const part of relative.split('/').slice(0, -1)) { current += `/${part}`; directories.add(current); }
  }
  for (const directory of directories) secureMeta(directory, { directory: true });
  const expectedFiles = new Set(FILES.map(([relative]) => `${ARCHIVE_ROOT}/${relative}`));
  for (const directory of directories) {
    for (const name of fs.readdirSync(directory)) {
      const child = `${directory}/${name}`;
      if (!directories.has(child) && !expectedFiles.has(child)) fail('archive_extra_file');
    }
  }
  return FILES.map(([relative, hash, size]) => readPinnedFile(`${ARCHIVE_ROOT}/${relative}`, hash, size));
}

function selectedEnvironmentAssignment(environment, key) {
  const pattern = new RegExp(`(?:^|\\s)${key}=(\"(?:[^\"\\\\]|\\\\.)*\"|'[^']*'|[^\\s]+)`, 'g');
  const matches = [...String(environment || '').matchAll(pattern)];
  if (matches.length !== 1) return null;
  const raw = matches[0][1];
  if (raw.startsWith('\"') && raw.endsWith('\"')) { try { return JSON.parse(raw); } catch { return null; } }
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
  return raw;
}
function isSafeAbsolutePath(value) {
  return typeof value === 'string' && value.length <= MAX_STATUS_PATH_BYTES
    && SAFE_ABSOLUTE_PATH.test(value)
    && value.startsWith('/')
    && value.slice(1).split('/').every(part => part && part !== '.' && part !== '..');
}
function hasConfiguredEnvironmentFiles(value) {
  return !Array.isArray(value) || value.some(entry => typeof entry !== 'string' || entry.trim() !== '');
}
function environmentOptionContains(value, key) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean)
    .some(entry => entry === key || entry.startsWith(`${key}=`));
}
export function isRootServiceIdentity(row) {
  return Boolean(row)
    && ['User','Group','DynamicUser'].every(key => Object.hasOwn(row, key))
    && ['', 'root'].includes(String(row.User ?? '').trim())
    && ['', 'root'].includes(String(row.Group ?? '').trim())
    && ['', 'no'].includes(String(row.DynamicUser ?? '').trim());
}
export function canReadTargetEnvironment(row) {
  const key = 'EDGE_USAGE_COLLECTOR_STATUS_PATH';
  const required = ['EnvironmentFiles','PassEnvironment','UnsetEnvironment','User','Group','DynamicUser'];
  if (!row || !required.every(name => Object.hasOwn(row, name))) return false;
  if (!Array.isArray(row.EnvironmentFiles) || hasConfiguredEnvironmentFiles(row.EnvironmentFiles)) return false;
  if (!isRootServiceIdentity(row)) return false;
  return ['PassEnvironment','UnsetEnvironment'].every(name => !environmentOptionContains(row[name], key));
}
export function canReadStatusBindingEnvironment(app, statusWriter) {
  return canReadTargetEnvironment(app)
    && canReadTargetEnvironment(statusWriter)
    && JSON.stringify(app.EnvironmentFiles) === JSON.stringify(statusWriter.EnvironmentFiles)
    && ['PassEnvironment','UnsetEnvironment'].every(name =>
      String(app[name] ?? '') === String(statusWriter[name] ?? '')
    );
}
function readTargetEnvironmentValue(unit) {
  // Only request Environment after the metadata gate passes. systemd returns the full
  // property transiently; this function retains only the one allowlisted assignment.
  const row = systemdShow(unit, ['Environment'], ['Environment']);
  return selectedEnvironmentAssignment(row.Environment, 'EDGE_USAGE_COLLECTOR_STATUS_PATH');
}
function createEnvironmentValueScanner(key, maxBytes = MAX_PROCESS_ENV_BYTES) {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || !Number.isSafeInteger(maxBytes) || maxBytes < 1) fail('environment_scan_arguments_invalid');
  const prefix = Buffer.from(`${key}=`);
  let totalBytes = 0, prefixIndex = 0, prefixMatches = true, target = false, targetTooLarge = false;
  let targetBytes = [];
  const values = [];
  function finishEntry() {
    if (target) values.push(targetTooLarge ? null : Buffer.from(targetBytes).toString('utf8'));
    prefixIndex = 0; prefixMatches = true; target = false; targetTooLarge = false; targetBytes = [];
  }
  return {
    push(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += bytes.length;
      if (totalBytes > maxBytes) fail('process_environment_too_large');
      for (const byte of bytes) {
        if (byte === 0) { finishEntry(); continue; }
        if (target) {
          if (targetBytes.length < MAX_STATUS_PATH_BYTES) targetBytes.push(byte);
          else targetTooLarge = true;
        } else if (prefixMatches) {
          if (byte !== prefix[prefixIndex]) prefixMatches = false;
          else {
            prefixIndex += 1;
            if (prefixIndex === prefix.length) target = true;
          }
        }
      }
    },
    finish() {
      finishEntry();
      return values.length === 1 && typeof values[0] === 'string' ? values[0] : null;
    }
  };
}
export function extractSingleEnvironmentValueFromChunks(chunks, key, maxBytes = MAX_PROCESS_ENV_BYTES) {
  const scanner = createEnvironmentValueScanner(key, maxBytes);
  for (const chunk of chunks) scanner.push(chunk);
  return scanner.finish();
}
function processStatusPath(pid) {
  const fd = fs.openSync(`/proc/${pid}/environ`, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const scanner = createEnvironmentValueScanner('EDGE_USAGE_COLLECTOR_STATUS_PATH');
  const chunk = Buffer.alloc(16 * 1024);
  try {
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) scanner.push(chunk.subarray(0, bytesRead));
    const value = scanner.finish();
    return isSafeAbsolutePath(value) ? value : null;
  } finally { fs.closeSync(fd); }
}
export function resolveStatusBinding(app, statusWriter, processValue, appEnvironmentValue = undefined, writerEnvironmentValue = undefined) {
  const key = 'EDGE_USAGE_COLLECTOR_STATUS_PATH';
  const required = ['EnvironmentFiles','PassEnvironment','UnsetEnvironment','User','Group','DynamicUser'];
  if (!required.every(name => Object.hasOwn(app, name)) || !required.every(name => Object.hasOwn(statusWriter, name))) return false;
  if (appEnvironmentValue === undefined && !Object.hasOwn(app, 'Environment')) return false;
  if (writerEnvironmentValue === undefined && !Object.hasOwn(statusWriter, 'Environment')) return false;
  if (!canReadStatusBindingEnvironment(app, statusWriter)) return false;
  const appValue = appEnvironmentValue === undefined
    ? selectedEnvironmentAssignment(app.Environment, key)
    : appEnvironmentValue;
  const writerValue = writerEnvironmentValue === undefined
    ? selectedEnvironmentAssignment(statusWriter.Environment, key)
    : writerEnvironmentValue;
  return Boolean(appValue && writerValue && appValue === writerValue && processValue === appValue && isSafeAbsolutePath(appValue));
}

export function isSafeStatusFileMetadata(stat, expectedUid = 0n, expectedGid = 0n) {
  return Boolean(stat && typeof stat.isFile === 'function' && stat.isFile()
    && typeof stat.isSymbolicLink === 'function' && !stat.isSymbolicLink()
    && stat.uid === BigInt(expectedUid) && stat.gid === BigInt(expectedGid)
    && stat.nlink === 1n && (stat.mode & 0o077n) === 0n
    && stat.size <= BigInt(MAX_STATUS_BYTES));
}
export function isSafeStatusDirectoryMetadata(stat, expectedUid = 0n, expectedGid = 0n) {
  return Boolean(stat && typeof stat.isDirectory === 'function' && stat.isDirectory()
    && typeof stat.isSymbolicLink === 'function' && !stat.isSymbolicLink()
    && stat.uid === BigInt(expectedUid) && stat.gid === BigInt(expectedGid)
    && (stat.mode & 0o022n) === 0n);
}
function statusDirectorySnapshot(statusPath) {
  try {
    const rows = [];
    let directory = path.dirname(statusPath);
    while (true) {
      const stat = fs.lstatSync(directory, { bigint: true });
      if (!isSafeStatusDirectoryMetadata(stat) || fs.realpathSync(directory) !== directory) return null;
      rows.push([directory, signature(stat)]);
      if (directory === '/') break;
      const parent = path.dirname(directory);
      if (parent === directory) return null;
      directory = parent;
    }
    return rows;
  } catch { return null; }
}
function readStatusProjection(statusPath) {
  let before;
  try { before = fs.lstatSync(statusPath, { bigint: true }); }
  catch (error) { return { availability: error?.code === 'ENOENT' ? 'not_observed' : 'invalid_observation' }; }
  let realPath;
  try { realPath = fs.realpathSync(statusPath); } catch { return { availability: 'invalid_observation' }; }
  const directoriesBefore = statusDirectorySnapshot(statusPath);
  if (!isSafeStatusFileMetadata(before) || realPath !== statusPath || !directoriesBefore) return { availability: 'invalid_observation' };
  const fd = fs.openSync(statusPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let bytes;
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!isSafeStatusFileMetadata(opened) || JSON.stringify(signature(opened)) !== JSON.stringify(signature(before))) fail('status_file_changed');
    bytes = readBoundedFile(fd, MAX_STATUS_BYTES, 'status_file_too_large');
    const after = fs.fstatSync(fd, { bigint: true });
    let named, directoriesAfter, namedRealPath;
    try {
      named = fs.lstatSync(statusPath, { bigint: true });
      directoriesAfter = statusDirectorySnapshot(statusPath);
      namedRealPath = fs.realpathSync(statusPath);
    } catch { fail('status_file_changed'); }
    if (!isSafeStatusFileMetadata(after) || JSON.stringify(signature(after)) !== JSON.stringify(signature(before))
      || !isSafeStatusFileMetadata(named) || JSON.stringify(signature(named)) !== JSON.stringify(signature(before))
      || !directoriesAfter || JSON.stringify(directoriesBefore) !== JSON.stringify(directoriesAfter)
      || namedRealPath !== statusPath) fail('status_file_changed');
  } finally { fs.closeSync(fd); }
  try { return { availability: 'raw', parsed: JSON.parse(bytes.toString('utf8')) }; }
  catch { return { availability: 'invalid_observation' }; }
}

export function inspectFullMeteringExecStart(execStart, workingDirectory) {
  if (workingDirectory !== ARCHIVE_ROOT || typeof execStart !== 'string' || !execStart.includes('path=/usr/bin/node ;') || !execStart.includes('argv[]=/usr/bin/node ') || execStart.split('path=').length !== 2 || execStart.split('argv[]=').length !== 2) return { matched: false, configDigestPresent: false };
  const expected = `${ARCHIVE_ROOT}/scripts/traffic-full-metering-collect.mjs --collect --config ${CONFIG_PATH} --config-sha256 `;
  const at = execStart.indexOf(expected);
  if (at < 0) return { matched: false, configDigestPresent: false };
  const digest = /^([a-f0-9]{64})\s*;/.exec(execStart.slice(at + expected.length));
  return { matched: Boolean(digest), configDigestPresent: Boolean(digest) };
}
export function inspectStatusWriterExecStart(execStart, workingDirectory, appRoot, realpathSync = fs.realpathSync) {
  if (typeof execStart !== 'string' || !execStart.includes('path=/usr/bin/node ;') || !execStart.includes('argv[]=/usr/bin/node ') || execStart.split('path=').length !== 2 || execStart.split('argv[]=').length !== 2 || !appWorkingDirectoryMatchesRelease(workingDirectory, appRoot, realpathSync)) return false;
  const canonicalPrefix = `argv[]=/usr/bin/node ${appRoot}/scripts/traffic-usage-collect-once.mjs --collect`;
  const currentPrefix = `argv[]=/usr/bin/node ${CURRENT_LINK}/scripts/traffic-usage-collect-once.mjs --collect`;
  if (execStart.includes(canonicalPrefix) && /^\s*;/.test(execStart.slice(execStart.indexOf(canonicalPrefix) + canonicalPrefix.length))) return true;
  try { return realpathSync(CURRENT_LINK) === appRoot && execStart.includes(currentPrefix) && /^\s*;/.test(execStart.slice(execStart.indexOf(currentPrefix) + currentPrefix.length)); }
  catch { return false; }
}

export function inspectOnFailure(value) {
  if (typeof value !== 'string') return { status: 'unknown', extraCount: null };
  const units = value.trim() ? value.trim().split(/\s+/) : [];
  if (units.some(unit => !/^[A-Za-z0-9_.@:-]+$/.test(unit))) return { status: 'unknown', extraCount: null };
  const matches = units.filter(unit => unit === STOP_SERVICE).length;
  if (matches > 1) return { status: 'unknown', extraCount: null };
  if (matches === 0) return { status: 'not_linked', extraCount: units.length };
  return { status: units.length === 1 ? 'linked_only' : 'linked_with_extras', extraCount: units.length - 1 };
}

export function inspectStopUnitExecStart(execStart) {
  if (typeof execStart !== 'string' || execStart.split('path=').length !== 2 || execStart.split('argv[]=').length !== 2) return false;
  const match = /^\{\s*path=([^;]+);\s*argv\[\]=([^;]+);[\s\S]*\}$/.exec(execStart.trim());
  if (!match || match[1].trim() !== '/usr/bin/systemctl') return false;
  const argv = match[2].trim().split(/\s+/);
  return argv.length === 3 && argv[0] === '/usr/bin/systemctl' && argv[1] === 'stop' && argv[2] === FULL_TIMER;
}

export function isExpectedFailureInvocation(startTimestamp, invocationId, execMainStatus, result) {
  const timestampMatches = startTimestamp === 'Tue 2026-10-20 02:15:07 UTC'
    || startTimestamp === 'Tue Oct 20 02:15:07 UTC'
    || startTimestamp === EXPECTED_FAILURE_START;
  return timestampMatches && execMainStatus === '2' && result === 'exit-code' && /^[a-f0-9]{32}$/.test(invocationId || '') && !/^0+$/.test(invocationId);
}
export function extractFailureErrorCode(journalJsonLines, invocationId, unit = FULL_SERVICE) {
  const codes = new Set();
  for (const line of String(journalJsonLines || '').split(/\r?\n/)) {
    if (!line || line.length > 32768) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row?._SYSTEMD_INVOCATION_ID !== invocationId || row?._SYSTEMD_UNIT !== unit || typeof row.MESSAGE !== 'string' || row.MESSAGE.length > 4096) continue;
    let message;
    try { message = JSON.parse(row.MESSAGE); } catch { continue; }
    if (message?.type !== 'full_metering_collection' || message.ok !== false || message.status !== 'blocked' || typeof message.errorCode !== 'string') continue;
    if (SAFE_ERROR_CODE.test(message.errorCode)) codes.add(message.errorCode);
  }
  return codes.size === 1 ? [...codes][0] : 'unknown';
}
function readFailureErrorCode(invocationId) {
  const args = ['--no-pager','--output=json','--lines=64',`_SYSTEMD_INVOCATION_ID=${invocationId}`,`_SYSTEMD_UNIT=${FULL_SERVICE}`];
  const result = spawnSync('/usr/bin/journalctl', args, {
    encoding: 'utf8', timeout: 5000, maxBuffer: MAX_JOURNAL_BYTES, shell: false,
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
    stdio: ['ignore','pipe','pipe']
  });
  if (result.error || result.status !== 0 || result.stderr !== '' || Buffer.byteLength(result.stdout || '', 'utf8') > MAX_JOURNAL_BYTES) return 'unknown';
  return extractFailureErrorCode(result.stdout, invocationId);
}

function parseUtcSystemdTimestamp(value) {
  const match = /^(?:[A-Za-z]{3} )?(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/.exec(value || '');
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}
export function correlateOnFailureStop(collectorExit, stopStart) {
  const end = parseUtcSystemdTimestamp(collectorExit), start = parseUtcSystemdTimestamp(stopStart);
  if (end === null || start === null) return 'unknown';
  const delta = start - end;
  return delta >= 0 && delta <= 30000 ? 'matched' : 'not_matched';
}
function unitState(row) {
  return `load=${row.LoadState ?? 'unknown'} active=${row.ActiveState ?? 'unknown'} sub=${row.SubState ?? 'unknown'} result=${row.Result ?? 'unknown'}`;
}
function printProjection(projection) {
  console.log(`status_projection=${projection.availability}`);
  console.log(`omitted_collector_count=${Number.isSafeInteger(projection.omittedCollectorCount) && projection.omittedCollectorCount >= 0 ? projection.omittedCollectorCount : 'unknown'}`);
  console.log(`omitted_producer_count=${Number.isSafeInteger(projection.omittedProducerCount) && projection.omittedProducerCount >= 0 ? projection.omittedProducerCount : 'unknown'}`);
  if (projection.availability !== 'available') return;
  console.log(`status_observed_at=${projection.observedAt}`);
  console.log(`status_run_ok=${projection.run.runOk}`);
  console.log(`status_raw_report_ok=${projection.run.rawReportOk}`);
  console.log(`status_recording_ok=${projection.accounting.recordingOk}`);
  console.log(`status_observation_count=${projection.accounting.observationCount}`);
  console.log(`status_recorded_count=${projection.accounting.recordedCount}`);
  console.log(`status_inserted_count=${projection.accounting.insertedCount}`);
  console.log(`status_unresolved_count=${projection.accounting.unresolvedCount}`);
  for (const channel of JP_CHANNELS) {
    const entries = projection.collectors.filter(item => item.channelRef === channel);
    console.log(`channel=${channel} status_entries=${entries.length}`);
    for (const entry of entries) {
      const sourceRef = typeof entry.sourceRef === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(entry.sourceRef) ? entry.sourceRef : 'unknown';
      console.log(`channel_state=${channel} source_ref=${sourceRef} health=${entry.health} condition=${entry.condition} last_success=${entry.lastCollectorSuccessAt ?? 'unknown'} observations=${entry.observationCount} unresolved=${entry.unresolvedCount} reason_codes=${entry.reasonCodes.join(',') || 'none'}`);
    }
  }
  console.log('producer_projection=partial');
  for (const producer of projection.producers || []) {
    console.log(`producer=${producer.producerRef} availability=${producer.availability} channel=${producer.channelRef || 'unknown'} health=${producer.producerHealth ?? 'unknown'} condition=${producer.producerCondition ?? 'unknown'} last_success=${producer.lastSuccessAt ?? 'unknown'} reason_codes=${producer.reasonCodes?.join(',') || 'none'}`);
    if (producer.map) console.log(`producer_map status=${producer.map.status} current=${producer.map.currentMapCount} expected=${producer.map.expectedMapCount} add=${producer.map.addCount} remove=${producer.map.removeCount} changed=${producer.map.changedCount} missing_material=${producer.map.missingMaterialCount}`);
    if (producer.sidecar) console.log(`producer_sidecar timer_active=${producer.sidecar.timerActive} timer_enabled=${producer.sidecar.timerEnabled} last_run=${producer.sidecar.lastRunResult} observations=${producer.sidecar.observationCount} unresolved=${producer.sidecar.unresolvedCount}`);
  }
}

export function runSelfTests() {
  const valid = parseArguments(['--expected-release','control-plane-fixture']);
  if (valid.mode !== 'run' || valid.expectedRelease !== 'control-plane-fixture') throw new Error('fixture_arguments_failed');
  for (const [args, code] of [[[], 'expected_release_required'], [['--expected-release'], 'expected_release_required'], [['--expected-release','../bad'], 'expected_release_invalid'], [['--x'], 'unexpected_argument']]) {
    if (parseArguments(args).error !== code) throw new Error('fixture_argument_rejection_failed');
  }
  const props = ['LoadState','ActiveState','SubState','EnvironmentFiles'];
  const parsed = parseSystemdOutput('LoadState=loaded\nActiveState=active\nSubState=running\nEnvironmentFiles=/etc/a.env\nEnvironmentFiles=/etc/b.env\n', props);
  if (parsed.EnvironmentFiles.length !== 2) throw new Error('fixture_multivalue_failed');
  for (const [output, code] of [
    ['LoadState=loaded\nLoadState=loaded\nActiveState=active\nSubState=running\n','systemd_duplicate_property'],
    ['LoadState=loaded\nActiveState=active\nSubState=running\nUnexpected=x\n','systemd_unexpected_property'],
    ['LoadState=loaded\nmalformed\n','systemd_malformed_line'],
    ['', 'systemd_empty_output']
  ]) { let caught; try { parseSystemdOutput(output, props); } catch (error) { caught = error; } if (caught?.safeCode !== code) throw new Error('fixture_systemd_parser_failed'); }
  const full = inspectFullMeteringExecStart(`{ path=/usr/bin/node ; argv[]=/usr/bin/node ${ARCHIVE_ROOT}/scripts/traffic-full-metering-collect.mjs --collect --config ${CONFIG_PATH} --config-sha256 ${'a'.repeat(64)} ; }`, ARCHIVE_ROOT);
  if (!full.matched || !full.configDigestPresent) throw new Error('fixture_full_metering_exec_binding_failed');
  if (inspectFullMeteringExecStart('unsafe', ARCHIVE_ROOT).matched) throw new Error('fixture_full_metering_exec_rejection_failed');
  if (!inspectStatusWriterExecStart(`{ path=/usr/bin/node ; argv[]=/usr/bin/node ${BASE}/releases/fixture/scripts/traffic-usage-collect-once.mjs --collect ; }`, `${BASE}/releases/fixture`, `${BASE}/releases/fixture`)) throw new Error('fixture_status_writer_exec_binding_failed');
  const currentAlias = value => value === CURRENT_LINK ? `${BASE}/releases/fixture` : value;
  if (!inspectStatusWriterExecStart(`{ path=/usr/bin/node ; argv[]=/usr/bin/node ${CURRENT_LINK}/scripts/traffic-usage-collect-once.mjs --collect ; }`, CURRENT_LINK, `${BASE}/releases/fixture`, currentAlias)) throw new Error('fixture_status_writer_current_alias_failed');
  const app = { EnvironmentFiles: [], Environment: 'EDGE_USAGE_COLLECTOR_STATUS_PATH=/var/lib/traffic/status.json', PassEnvironment: '', UnsetEnvironment: '', User: '', Group: '', DynamicUser: 'no' };
  const writer = { ...app };
  if (!resolveStatusBinding(app, writer, '/var/lib/traffic/status.json')) throw new Error('fixture_status_binding_failed');
  if (resolveStatusBinding(app, { ...writer, EnvironmentFiles: ['/etc/other.env'] }, '/var/lib/traffic/status.json')) throw new Error('fixture_status_binding_drift_accepted');
  if (resolveStatusBinding({ ...app, EnvironmentFiles: ['/etc/a.env'] }, writer, '/var/lib/traffic/status.json')) throw new Error('fixture_environment_file_override_accepted');
  if (!isExpectedNodeVersion('22.16.0') || isExpectedNodeVersion('22.16.1')) throw new Error('fixture_node_version_pin_failed');
  if (inspectOnFailure(`${STOP_SERVICE} extra.service`).status !== 'linked_with_extras') throw new Error('fixture_onfailure_extra_handler_hidden');
  const invocation = 'a'.repeat(32);
  const message = JSON.stringify({ type: 'full_metering_collection', ok: false, status: 'blocked', errorCode: 'full_metering_binding_changed' });
  const journal = JSON.stringify({ _SYSTEMD_INVOCATION_ID: invocation, _SYSTEMD_UNIT: FULL_SERVICE, MESSAGE: message });
  if (extractFailureErrorCode(journal, invocation) !== 'full_metering_binding_changed') throw new Error('fixture_journal_code_failed');
  if (extractFailureErrorCode(journal, 'b'.repeat(32)) !== 'unknown') throw new Error('fixture_journal_invocation_binding_failed');
  if (extractFailureErrorCode(JSON.stringify({ _SYSTEMD_INVOCATION_ID: invocation, _SYSTEMD_UNIT: FULL_SERVICE, MESSAGE: JSON.stringify({ type: 'other', errorCode: 'secret' }) }), invocation) !== 'unknown') throw new Error('fixture_journal_allowlist_failed');
  if (!isExpectedFailureInvocation('Tue 2026-10-20 02:15:07 UTC', invocation, '2', 'exit-code')) throw new Error('fixture_expected_invocation_failed');
  if (isExpectedFailureInvocation('Tue 2026-10-21 02:15:07 UTC', invocation, '2', 'exit-code')) throw new Error('fixture_wrong_date_accepted');
  if (isExpectedFailureInvocation('Tue 2026-10-20 02:15:07 UTC', invocation, '0', 'success')) throw new Error('fixture_nonfailure_invocation_accepted');
  if (correlateOnFailureStop('Tue 2026-10-20 02:15:08 UTC','Tue 2026-10-20 02:15:09 UTC') !== 'matched') throw new Error('fixture_stop_correlation_failed');
  if (correlateOnFailureStop('unknown','unknown') !== 'unknown') throw new Error('fixture_stop_correlation_unknown_failed');
  validateArchiveManifest();
  console.log('m0_a2_1_v7_self_test=passed');
}

export function isExpectedNodeVersion(version) {
  return version === '22.16.0';
}

export async function runM0A2V7(expectedRelease) {
  const startedAt = Date.now();
  let statusPath = null;
  try {
    if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 0 || !isExpectedNodeVersion(process.versions.node) || process.env.NODE_OPTIONS || process.env.NODE_PATH) fail('runtime_invalid');
    const observedAt = new Date().toISOString();
    const appBefore = systemdShow(APP_UNIT, APP_PROPERTIES);
    const fullBefore = systemdShow(FULL_SERVICE, SERVICE_PROPERTIES);
    const fullTimerBefore = systemdShow(FULL_TIMER, TIMER_PROPERTIES);
    const stopBefore = systemdShow(STOP_SERVICE, STOP_PROPERTIES);
    const statusBefore = systemdShow(STATUS_SERVICE, STATUS_SERVICE_PROPERTIES);
    const statusTimerBefore = systemdShow(STATUS_TIMER, TIMER_PROPERTIES);
    assertTimeBudget(startedAt);

    stage = 'app_release_binding';
    const appReleaseBefore = resolveAppRelease(appBefore, expectedRelease);
    const { appRoot, releaseLabel, pid } = appReleaseBefore;
    assertTimeBudget(startedAt);
    stage = 'app_source_pins';
    assertPinnedAppSource(appRoot);
    assertTimeBudget(startedAt);

    stage = 'full_metering_exec_binding';
    const fullExec = inspectFullMeteringExecStart(fullBefore.ExecStart, fullBefore.WorkingDirectory);
    const archiveBefore = fullExec.matched ? verifyArchive() : null;
    assertTimeBudget(startedAt);
    const onFailure = Object.hasOwn(fullBefore, 'OnFailure')
      ? inspectOnFailure(fullBefore.OnFailure)
      : { status: 'unknown', extraCount: null };
    const stopTargetsTimer = Object.hasOwn(stopBefore, 'ExecStart')
      ? (inspectStopUnitExecStart(stopBefore.ExecStart) ? 'yes' : 'no')
      : 'unknown';
    const stopCorrelation = correlateOnFailureStop(fullBefore.ExecMainExitTimestamp, stopBefore.ExecMainStartTimestamp);

    stage = 'status_writer_binding';
    const statusExecMatched = Object.hasOwn(statusBefore, 'ExecStart') && Object.hasOwn(statusBefore, 'WorkingDirectory')
      ? inspectStatusWriterExecStart(statusBefore.ExecStart, statusBefore.WorkingDirectory, appRoot, fs.realpathSync)
      : null;
    const environmentReadEligibleBefore = statusExecMatched === true
      && statusBefore.LoadState === 'loaded'
      && canReadStatusBindingEnvironment(appBefore, statusBefore);
    const appEnvironmentBefore = environmentReadEligibleBefore ? readTargetEnvironmentValue(APP_UNIT) : null;
    const statusEnvironmentBefore = environmentReadEligibleBefore ? readTargetEnvironmentValue(STATUS_SERVICE) : null;
    if (statusExecMatched && statusBefore.LoadState === 'loaded' && environmentReadEligibleBefore) {
      statusPath = processStatusPath(pid);
    }
    const statusPathBound = Boolean(statusExecMatched === true && environmentReadEligibleBefore && statusPath
      && resolveStatusBinding(
        appBefore,
        statusBefore,
        statusPath,
        appEnvironmentBefore,
        statusEnvironmentBefore
      ));
    let projection = { availability: statusPathBound ? 'not_observed' : 'unbound' };
    if (statusPathBound) {
      stage = 'status_projection_read';
      const raw = readStatusProjection(statusPath);
      if (raw.availability === 'raw') {
        const moduleUrl = pathToFileURL(path.join(appRoot, 'server/services/platform/traffic-collector-admin-projection.mjs')).href;
        const { sanitizeTrafficCollectorAdminProjection } = await import(moduleUrl);
        projection = sanitizeTrafficCollectorAdminProjection(raw.parsed);
      } else projection = { availability: raw.availability };
    }
    assertTimeBudget(startedAt);

    stage = 'failure_invocation_binding';
    const invocationId = fullBefore.InvocationID;
    const exactInvocation = isExpectedFailureInvocation(fullBefore.ExecMainStartTimestamp, invocationId, fullBefore.ExecMainStatus, fullBefore.Result);
    const errorCode = exactInvocation ? readFailureErrorCode(invocationId) : 'unknown';
    assertTimeBudget(startedAt);

    stage = 'stability_recheck';
    const appAfter = systemdShow(APP_UNIT, APP_PROPERTIES);
    const fullAfter = systemdShow(FULL_SERVICE, SERVICE_PROPERTIES);
    const fullTimerAfter = systemdShow(FULL_TIMER, TIMER_PROPERTIES);
    const stopAfter = systemdShow(STOP_SERVICE, STOP_PROPERTIES);
    const statusAfter = systemdShow(STATUS_SERVICE, STATUS_SERVICE_PROPERTIES);
    const statusTimerAfter = systemdShow(STATUS_TIMER, TIMER_PROPERTIES);
    assertTimeBudget(startedAt);
    for (const [unit, before, after] of [
      [APP_UNIT,appBefore,appAfter],[FULL_SERVICE,fullBefore,fullAfter],[FULL_TIMER,fullTimerBefore,fullTimerAfter],
      [STOP_SERVICE,stopBefore,stopAfter],[STATUS_SERVICE,statusBefore,statusAfter],[STATUS_TIMER,statusTimerBefore,statusTimerAfter]
    ]) sameSnapshot(before, after, unit);
    const environmentReadEligibleAfter = statusExecMatched === true
      && statusAfter.LoadState === 'loaded'
      && canReadStatusBindingEnvironment(appAfter, statusAfter);
    if (environmentReadEligibleBefore !== environmentReadEligibleAfter) fail('environment_read_gate_changed');
    if (environmentReadEligibleBefore) {
      const appEnvironmentAfter = readTargetEnvironmentValue(APP_UNIT);
      const statusEnvironmentAfter = readTargetEnvironmentValue(STATUS_SERVICE);
      if (appEnvironmentBefore !== appEnvironmentAfter || statusEnvironmentBefore !== statusEnvironmentAfter) {
        fail('environment_changed_during_read');
      }
    }
    const appReleaseAfter = resolveAppRelease(appAfter, expectedRelease);
    if (!sameAppReleaseBinding(appReleaseBefore, appReleaseAfter)) fail('app_release_changed_during_read');
    assertPinnedAppSource(appReleaseAfter.appRoot);
    if (fullExec.matched) {
      const archiveAfter = verifyArchive();
      if (JSON.stringify(archiveBefore) !== JSON.stringify(archiveAfter)) fail('archive_changed_during_read');
    }
    assertTimeBudget(startedAt);

    console.log(`observed_at_utc=${observedAt}`);
    console.log(`app_release_label=${releaseLabel}`);
    console.log('app_release_path_binding=matched');
    console.log('app_release_identity=label_only');
    console.log('app_source_pins=matched');
    const pidPresent = value => value === '0' ? 'no' : (/^[1-9][0-9]*$/.test(value || '') ? 'yes' : 'unknown');
    console.log(`full_metering_service ${unitState(fullBefore)} exec_main_code=${fullBefore.ExecMainCode ?? 'unknown'} exec_main_status=${fullBefore.ExecMainStatus ?? 'unknown'} started_at=${fullBefore.ExecMainStartTimestamp ?? 'unknown'} exited_at=${fullBefore.ExecMainExitTimestamp ?? 'unknown'} main_pid_present=${pidPresent(fullBefore.MainPID)} control_pid_present=${pidPresent(fullBefore.ControlPID)} restarts=${fullBefore.NRestarts ?? 'unknown'}`);
    const fullExecStatus = !Object.hasOwn(fullBefore, 'ExecStart') || !Object.hasOwn(fullBefore, 'WorkingDirectory') ? 'unknown' : (fullExec.matched ? 'matched' : 'unmatched');
    console.log(`full_metering_exec_binding=${fullExecStatus} config_digest_present=${fullExecStatus === 'unknown' ? 'unknown' : (fullExec.configDigestPresent ? 'yes' : 'no')}`);
    console.log(`collector_archive_files=${fullExec.matched ? FILES.length : 'unknown'} collector_archive_content=${fullExec.matched ? '49_file_closure_matched' : 'not_bound'}`);
    const fragmentPresent = row => !Object.hasOwn(row, 'FragmentPath') ? 'unknown' : (typeof row.FragmentPath === 'string' && path.isAbsolute(row.FragmentPath) ? 'yes' : 'no');
    const dropInCount = row => !Object.hasOwn(row, 'DropInPaths') ? 'unknown' : (typeof row.DropInPaths === 'string' && row.DropInPaths.trim() ? row.DropInPaths.trim().split(/\s+/).length : 0);
    const unitLink = (row, expected) => !Object.hasOwn(row, 'Unit') ? 'unknown' : (row.Unit === expected ? 'yes' : 'no');
    console.log(`full_metering_unit_metadata fragment_present=${fragmentPresent(fullBefore)} drop_in_count=${dropInCount(fullBefore)}`);
    console.log(`full_metering_onfailure=${onFailure.status} extra_count=${onFailure.extraCount ?? 'unknown'}`);
    console.log(`stop_unit_metadata fragment_present=${fragmentPresent(stopBefore)} drop_in_count=${dropInCount(stopBefore)}`);
    console.log(`full_metering_timer_metadata fragment_present=${fragmentPresent(fullTimerBefore)} drop_in_count=${dropInCount(fullTimerBefore)}`);
    console.log(`stop_unit ${unitState(stopBefore)} targets_full_timer=${stopTargetsTimer} temporal_correlation=${stopCorrelation}`);
    console.log(`full_metering_timer ${unitState(fullTimerBefore)} unit_link_matches=${unitLink(fullTimerBefore, FULL_SERVICE)} last_trigger=${fullTimerBefore.LastTriggerUSec ?? 'unknown'} next_elapse=${fullTimerBefore.NextElapseUSecRealtime ?? 'unknown'} persistent=${fullTimerBefore.Persistent ?? 'unknown'}`);
    console.log(`failure_invocation=${exactInvocation ? 'matched' : 'not_current_invocation'} failure_error_code=${errorCode}`);
    console.log(`status_writer_exec_binding=${statusExecMatched === null ? 'unknown' : (statusExecMatched ? 'matched' : 'unmatched')}`);
    console.log(`status_writer_unit_metadata fragment_present=${fragmentPresent(statusBefore)} drop_in_count=${dropInCount(statusBefore)}`);
    console.log(`status_writer_timer_metadata fragment_present=${fragmentPresent(statusTimerBefore)} drop_in_count=${dropInCount(statusTimerBefore)}`);
    console.log(`status_writer_service ${unitState(statusBefore)} started_at=${statusBefore.ExecMainStartTimestamp ?? 'unknown'} exited_at=${statusBefore.ExecMainExitTimestamp ?? 'unknown'} restarts=${statusBefore.NRestarts ?? 'unknown'}`);
    console.log(`status_writer_timer ${unitState(statusTimerBefore)} unit_link_matches=${unitLink(statusTimerBefore, STATUS_SERVICE)} last_trigger=${statusTimerBefore.LastTriggerUSec ?? 'unknown'} next_elapse=${statusTimerBefore.NextElapseUSecRealtime ?? 'unknown'} persistent=${statusTimerBefore.Persistent ?? 'unknown'}`);
    console.log(`status_binding=${statusPathBound ? 'matched' : 'unknown'}`);
    console.log(`status_environment_read=${environmentReadEligibleBefore ? 'after_exec_and_metadata_gates_target_assignment_only' : 'skipped_exec_or_metadata_gate'}`);
    printProjection(projection);
    console.log(`systemd_journal_read=${exactInvocation ? 'targeted_invocation_attempted' : 'skipped_invocation_not_current'}`);
    console.log('raw_journal_output_returned=no');
    console.log('full_metering_journal_directory_read=no');
    console.log('database_read=no');
    console.log('checkpoint_read=no');
    console.log('config_read=no');
    console.log('collector_invoked=no');
    console.log('service_or_timer_mutation=no');
    console.log('result=completed');
  } catch (error) {
    const code = /^[a-z0-9_]+$/.test(error?.safeCode || '') ? error.safeCode : 'unexpected_failure';
    const property = typeof error?.safeDetails?.property === 'string' && /^[A-Za-z][A-Za-z0-9]+$/.test(error.safeDetails.property) ? ` property=${error.safeDetails.property}` : '';
    const unit = typeof error?.safeDetails?.unit === 'string' && /^[A-Za-z0-9_.@-]+$/.test(error.safeDetails.unit) ? ` unit=${error.safeDetails.unit}` : '';
    console.log(`result=blocked stage=${stage} code=${code}${property}${unit}`);
    process.exitCode = 2;
  }
}
