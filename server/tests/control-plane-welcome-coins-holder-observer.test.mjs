import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as productionModule from "../../scripts/control-plane-welcome-coins-holder-observer-lib.mjs";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/control-plane-welcome-coins-holder-observer-lib.mjs"
);
const DB_PATH = "/private/state/subscription-control.sqlite";
const DB_PARENT_PATH = "/private/state";
const SHA256 = Object.freeze({
  logicalSha256: "1".repeat(64),
  objectIdentitySha256: "2".repeat(64),
  parentIdentitySha256: "3".repeat(64)
});
const CHILD_CHANNEL_SHA256 = "4".repeat(64);
const BANNED_PUBLIC_KEYS = /(?:pid|uid|gid|path|fd|descriptor|user|name|raw|map|event|timestamp|size)/iu;

let harnessPromise;

function sourceDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function loadHarness() {
  if (harnessPromise) return harnessPromise;
  const source = readFileSync(SOURCE_PATH, "utf8");
  const importPattern = /^import \{ inspectControlPlaneDatabaseBoundary \} from "\.\/control-plane-db-snapshot-gate-lib\.mjs";$/mu;
  assert.match(source, importPattern);
  const harnessSource = source.replace(
    importPattern,
    "const inspectControlPlaneDatabaseBoundary = () => { throw new Error('production inspector unavailable in harness'); };"
  ) + `
export {
  createWelcomeCoinsHolderObserverRuntime as __createRuntime,
  inspectWelcomeCoinsExternalHoldersCore as __inspectCore
};
`;
  harnessPromise = import(sourceDataUrl(harnessSource));
  return harnessPromise;
}

function objectMetadata({ dev, ino, kind = "file" }) {
  return Object.freeze({
    dev: BigInt(dev),
    ino: BigInt(ino),
    isDirectory: () => kind === "directory",
    isFile: () => kind === "file",
    isSymbolicLink: () => kind === "symlink"
  });
}

function procStat(pid, startTimeTicks) {
  const fields = Array.from({ length: 20 }, () => "0");
  fields[0] = "S";
  fields[19] = String(startTimeTicks);
  return `${pid} (synthetic process) ${fields.join(" ")}\n`;
}

function procStatus({ pid, uid, gid, nspid = [pid] }) {
  return [
    `Pid:\t${pid}`,
    `Tgid:\t${pid}`,
    `Uid:\t${uid}\t${uid}\t${uid}\t${uid}`,
    `Gid:\t${gid}\t${gid}\t${gid}\t${gid}`,
    `NSpid:\t${nspid.join("\t")}`,
    ""
  ].join("\n");
}

function processIdentitySha256({ pid, startTimeTicks, uid, gid }) {
  return createHash("sha256").update(JSON.stringify({
    gid,
    pid,
    startTimeTicks: String(startTimeTicks),
    uid
  })).digest("hex");
}

function enoent() {
  const error = new Error("synthetic missing path");
  error.code = "ENOENT";
  return error;
}

function syntheticState({
  sidecars = true,
  processes,
  boundaryAtRead,
  filesystemAtRead,
  listDirectory,
  readText,
  realpath,
  stat
} = {}) {
  const defaultProcesses = processes ?? [
    {
      pid: 100,
      uid: 0,
      gid: 0,
      startTimeTicks: "1000",
      fds: {},
      maps: {}
    }
  ];
  const byPid = new Map(defaultProcesses.map((process) => [String(process.pid), process]));
  const baseFilesystem = Object.freeze({
    parent: objectMetadata({ dev: 10, ino: 1, kind: "directory" }),
    main: objectMetadata({ dev: 10, ino: 2 }),
    wal: sidecars ? objectMetadata({ dev: 10, ino: 3 }) : null,
    shm: sidecars ? objectMetadata({ dev: 10, ino: 4 }) : null
  });
  let filesystemReads = 0;
  let boundaryReads = 0;

  const currentFilesystem = () => {
    filesystemReads += 1;
    return filesystemAtRead?.(filesystemReads, baseFilesystem) ?? baseFilesystem;
  };
  let filesystem = baseFilesystem;
  const filesystemForPath = (path) => {
    filesystem = currentFilesystem();
    if (path === DB_PARENT_PATH) return filesystem.parent;
    if (path === DB_PATH) return filesystem.main;
    if (path === `${DB_PATH}-wal`) {
      if (filesystem.wal === null) throw enoent();
      return filesystem.wal;
    }
    if (path === `${DB_PATH}-shm`) {
      if (filesystem.shm === null) throw enoent();
      return filesystem.shm;
    }
    return null;
  };
  const targetForProcEntry = (path) => {
    const match = /^\/proc\/([1-9][0-9]*)\/(fd|map_files)\/([^/]+)$/u.exec(path);
    if (!match) return null;
    const process = byPid.get(match[1]);
    const key = match[3];
    const target = match[2] === "fd" ? process?.fds?.[key] : process?.maps?.[key];
    if (!target) throw enoent();
    const active = filesystem;
    if (!active[target]) throw enoent();
    return active[target];
  };

  return {
    platform: "linux",
    getuid: () => 0,
    getpid: () => 100,
    inspectDatabaseBoundary() {
      boundaryReads += 1;
      return boundaryAtRead?.(boundaryReads, SHA256) ?? SHA256;
    },
    listDirectory(path) {
      if (listDirectory) {
        const replacement = listDirectory(path, { byPid });
        if (replacement !== undefined) return replacement;
      }
      if (path === "/proc") return [...byPid.keys()];
      const match = /^\/proc\/([1-9][0-9]*)\/(fd|map_files)$/u.exec(path);
      if (!match || !byPid.has(match[1])) throw enoent();
      const process = byPid.get(match[1]);
      return Object.keys(match[2] === "fd" ? process.fds : process.maps);
    },
    readText(path) {
      if (readText) {
        const replacement = readText(path, { byPid });
        if (replacement !== undefined) return replacement;
      }
      const match = /^\/proc\/([1-9][0-9]*)\/(stat|status)$/u.exec(path);
      if (!match || !byPid.has(match[1])) throw enoent();
      const process = byPid.get(match[1]);
      return match[2] === "stat"
        ? procStat(process.pid, process.startTimeTicks)
        : procStatus(process);
    },
    lstat(path) {
      const value = filesystemForPath(path);
      if (value) return value;
      throw enoent();
    },
    stat(path) {
      if (stat) {
        const replacement = stat(path, { byPid, filesystem });
        if (replacement !== undefined) return replacement;
      }
      const value = targetForProcEntry(path);
      if (value) return value;
      throw enoent();
    },
    realpath(path) {
      if (realpath) {
        const replacement = realpath(path);
        if (replacement !== undefined) return replacement;
      }
      return path;
    }
  };
}

async function runtimeFor(options) {
  const { __createRuntime } = await loadHarness();
  return __createRuntime(syntheticState(options));
}

async function inspect(options, runtimeOptions) {
  const { __inspectCore } = await loadHarness();
  return __inspectCore(options, await runtimeFor(runtimeOptions));
}

async function rejectsCondition(action, condition) {
  await assert.rejects(async () => action(), (error) => {
    assert.equal(error?.name, "WelcomeCoinsHolderObserverError");
    assert.equal(error?.condition, condition);
    assert.equal(error?.message, condition);
    assert.equal(JSON.stringify(error).includes(DB_PATH), false);
    return true;
  });
}

test("production exports only the closed read-only observer", () => {
  assert.deepEqual(Object.keys(productionModule), ["inspectWelcomeCoinsExternalHolders"]);
  const source = readFileSync(SOURCE_PATH, "utf8");
  assert.doesNotMatch(source, /\b(?:write|append|rename|unlink|rm|mkdir|chmod|chown|spawn|exec)(?:File)?Sync\b/u);
  assert.doesNotMatch(source, /node:(?:child_process|net|http|https)/u);
  assert.match(source, /inspectWelcomeCoinsExternalHoldersCore\(options, DEFAULT_RUNTIME\)/u);
});

test("initial observation returns only a zero-holder aggregate and stable database boundary", async () => {
  const result = await inspect({
    dbPath: DB_PATH,
    phase: "inactive_pre_custody"
  }, { sidecars: false });

  assert.deepEqual(result, {
    externalHolderCount: 0,
    databaseBoundary: SHA256
  });
  assert.equal(BANNED_PUBLIC_KEYS.test(JSON.stringify(result)), false);
  assert.equal(JSON.stringify(result).includes(DB_PATH), false);
});

test("an already-scanned PID that opens the database before return cannot produce a zero-holder observation", async () => {
  const process = {
    pid: 100,
    uid: 0,
    gid: 0,
    startTimeTicks: "1000",
    fds: {},
    maps: {}
  };
  let procRootReads = 0;

  await rejectsCondition(() => inspect({
    dbPath: DB_PATH,
    phase: "inactive_pre_custody"
  }, {
    processes: [process],
    listDirectory(path, { byPid }) {
      if (path !== "/proc") return undefined;
      procRootReads += 1;
      if (procRootReads === 2) {
        byPid.get("100").fds["9"] = "main";
      }
      return undefined;
    }
  }), "database_custody_failed");
});

test("proc root ignores ordinary non-PID entries while preserving stable PID custody", async () => {
  const process = {
    pid: 101,
    uid: 0,
    gid: 0,
    startTimeTicks: "1001",
    fds: {},
    maps: {}
  };
  const result = await inspect({
    dbPath: DB_PATH,
    phase: "inactive_pre_custody"
  }, {
    processes: [process],
    listDirectory(path) {
      if (path === "/proc") return ["self", "sys", "101", "thread-self", "meminfo"];
      return undefined;
    }
  });

  assert.deepEqual(result, {
    externalHolderCount: 0,
    databaseBoundary: SHA256
  });
});

test("exclusive observation deduplicates one approved child across main, WAL, SHM, fd, and mmap", async () => {
  const child = {
    pid: 4242,
    uid: 1001,
    gid: 1002,
    startTimeTicks: "987654321",
    fds: { 3: "main", 4: "wal" },
    maps: { "1000-2000": "main", "3000-4000": "shm" }
  };
  const childProcessIdentitySha256 = processIdentitySha256(child);
  const result = await inspect({
    dbPath: DB_PATH,
    phase: "exclusive_pre_commit",
    expectedDatabaseBoundary: SHA256,
    expectedCustodyChildProcessIdentitySha256: childProcessIdentitySha256,
    expectedCustodyChildChannelBindingSha256: CHILD_CHANNEL_SHA256
  }, { processes: [child] });

  assert.deepEqual(result, {
    externalHolderCount: 0,
    approvedCustodyChildHolderCount: 1,
    approvedCustodyChildProcessIdentitySha256: childProcessIdentitySha256,
    approvedCustodyChildChannelBindingSha256: CHILD_CHANNEL_SHA256,
    databaseBoundary: SHA256
  });
  assert.equal(BANNED_PUBLIC_KEYS.test(JSON.stringify(result)), false);
  assert.equal(JSON.stringify(result).includes("4242"), false);
});

test("exclusive observation accepts the approved child when the database is held through fd zero", async () => {
  const child = {
    pid: 4242,
    uid: 1001,
    gid: 1002,
    startTimeTicks: "987654321",
    fds: { 0: "main" },
    maps: {}
  };
  const childProcessIdentitySha256 = processIdentitySha256(child);
  const result = await inspect({
    dbPath: DB_PATH,
    phase: "exclusive_pre_commit",
    expectedDatabaseBoundary: SHA256,
    expectedCustodyChildProcessIdentitySha256: childProcessIdentitySha256,
    expectedCustodyChildChannelBindingSha256: CHILD_CHANNEL_SHA256
  }, { processes: [child] });
  assert.deepEqual(result, {
    externalHolderCount: 0,
    approvedCustodyChildHolderCount: 1,
    approvedCustodyChildProcessIdentitySha256: childProcessIdentitySha256,
    approvedCustodyChildChannelBindingSha256: CHILD_CHANNEL_SHA256,
    databaseBoundary: SHA256
  });
});

test("same-name fd or mmap retargeting during a scan fails closed", async () => {
  for (const descriptor of [
    { fds: { 3: "main" }, maps: {}, path: "/proc/4242/fd/3" },
    { fds: {}, maps: { "1000-2000": "main" }, path: "/proc/4242/map_files/1000-2000" }
  ]) {
    const child = {
      pid: 4242,
      uid: 1001,
      gid: 1002,
      startTimeTicks: "987654321",
      fds: descriptor.fds,
      maps: descriptor.maps
    };
    let targetReads = 0;
    await rejectsCondition(() => inspect({
      dbPath: DB_PATH,
      phase: "exclusive_pre_commit",
      expectedDatabaseBoundary: SHA256,
      expectedCustodyChildProcessIdentitySha256: processIdentitySha256(child),
      expectedCustodyChildChannelBindingSha256: CHILD_CHANNEL_SHA256
    }, {
      processes: [child],
      stat(path, { filesystem }) {
        if (path !== descriptor.path) return undefined;
        targetReads += 1;
        return targetReads === 1
          ? filesystem.main
          : objectMetadata({ dev: 99, ino: 99 });
      }
    }), "holder_observation_failed");
  }
});

test("fd-only or mmap-only unapproved holders fail closed instead of returning identifiers", async () => {
  for (const process of [
    { pid: 201, uid: 1001, gid: 1002, startTimeTicks: "2001", fds: { 7: "main" }, maps: {} },
    { pid: 202, uid: 1001, gid: 1002, startTimeTicks: "2002", fds: {}, maps: { "a000-b000": "shm" } }
  ]) {
    await rejectsCondition(
      () => inspect({ dbPath: DB_PATH, phase: "inactive_pre_custody" }, { processes: [process] }),
      "database_custody_failed"
    );
  }
});

test("exclusive observation rejects an extra holder, a wrong child, or no approved child", async () => {
  const child = {
    pid: 4242,
    uid: 1001,
    gid: 1002,
    startTimeTicks: "987654321",
    fds: { 3: "main" },
    maps: {}
  };
  const other = {
    pid: 4343,
    uid: 1001,
    gid: 1002,
    startTimeTicks: "987654322",
    fds: { 8: "wal" },
    maps: {}
  };
  const expected = processIdentitySha256(child);
  const base = {
    dbPath: DB_PATH,
    phase: "exclusive_pre_commit",
    expectedDatabaseBoundary: SHA256,
    expectedCustodyChildProcessIdentitySha256: expected,
    expectedCustodyChildChannelBindingSha256: CHILD_CHANNEL_SHA256
  };
  for (const [options, runtimeOptions] of [
    [base, { processes: [child, other] }],
    [{ ...base, expectedCustodyChildProcessIdentitySha256: "9".repeat(64) }, { processes: [child] }],
    [base, { processes: [{ ...child, fds: {} }] }]
  ]) {
    await rejectsCondition(() => inspect(options, runtimeOptions), "database_custody_failed");
  }
});

test("invalid option shapes fail before any database or proc read", async () => {
  const cases = [
    null,
    {},
    { dbPath: DB_PATH, phase: "wrong" },
    { dbPath: DB_PATH, phase: "inactive_pre_custody", unexpected: true },
    {
      dbPath: DB_PATH,
      phase: "inactive_pre_custody",
      expectedDatabaseBoundary: SHA256
    },
    {
      dbPath: DB_PATH,
      phase: "exclusive_pre_commit",
      expectedDatabaseBoundary: SHA256,
      expectedCustodyChildProcessIdentitySha256: "invalid",
      expectedCustodyChildChannelBindingSha256: CHILD_CHANNEL_SHA256
    }
  ];
  const { __createRuntime, __inspectCore } = await loadHarness();
  for (const options of cases) {
    let reads = 0;
    const guardedRuntime = __createRuntime({
      ...syntheticState(),
      inspectDatabaseBoundary() {
        reads += 1;
        return SHA256;
      }
    });
    await rejectsCondition(
      () => __inspectCore(options, guardedRuntime),
      "holder_observation_invalid"
    );
    assert.equal(reads, 0);
  }
});

test("unreadable proc state, malformed proc text, or unstable directory enumeration fails closed", async () => {
  const process = { pid: 300, uid: 1001, gid: 1002, startTimeTicks: "3000", fds: {}, maps: {} };
  const failures = [
    {
      readText(path) {
        if (path === "/proc/300/status") throw new Error("private proc denial");
      }
    },
    {
      readText(path) {
        if (path === "/proc/300/stat") return "malformed";
      }
    },
    {
      listDirectory: (() => {
        let procReads = 0;
        return (path) => {
          if (path !== "/proc") return undefined;
          procReads += 1;
          return procReads % 2 === 0 ? ["300", "301"] : ["300"];
        };
      })()
    }
  ];
  for (const overrides of failures) {
    await rejectsCondition(
      () => inspect(
        { dbPath: DB_PATH, phase: "inactive_pre_custody" },
        { processes: [process], ...overrides }
      ),
      "holder_observation_failed"
    );
  }
});

test("NSpid ambiguity and PID start-time reuse fail closed", async () => {
  const process = { pid: 310, uid: 1001, gid: 1002, startTimeTicks: "3100", fds: { 3: "main" }, maps: {} };
  await rejectsCondition(
    () => inspect({ dbPath: DB_PATH, phase: "inactive_pre_custody" }, {
      processes: [{ ...process, nspid: [99, 310] }]
    }),
    "holder_observation_failed"
  );

  let statReads = 0;
  await rejectsCondition(
    () => inspect({ dbPath: DB_PATH, phase: "inactive_pre_custody" }, {
      processes: [process],
      readText(path) {
        if (path !== "/proc/310/stat") return undefined;
        statReads += 1;
        return procStat(310, statReads === 1 ? "3100" : "3101");
      }
    }),
    "holder_observation_failed"
  );
});

test("main, parent, WAL, SHM, or logical boundary drift fails closed", async () => {
  const drifted = (base, key) => Object.freeze({
    ...base,
    [key]: key === "wal" && base.wal === null
      ? objectMetadata({ dev: 10, ino: 99 })
      : objectMetadata({
        dev: 10,
        ino: 90 + ["parent", "main", "wal", "shm"].indexOf(key),
        kind: key === "parent" ? "directory" : "file"
      })
  });
  for (const key of ["parent", "main", "wal", "shm"]) {
    await rejectsCondition(
      () => inspect({ dbPath: DB_PATH, phase: "inactive_pre_custody" }, {
        filesystemAtRead(read, base) {
          return read > 4 ? drifted(base, key) : base;
        }
      }),
      "database_boundary_invalid"
    );
  }
  await rejectsCondition(
    () => inspect({ dbPath: DB_PATH, phase: "inactive_pre_custody" }, {
      boundaryAtRead(read, boundary) {
        return read > 1 ? { ...boundary, logicalSha256: "8".repeat(64) } : boundary;
      }
    }),
    "database_boundary_invalid"
  );
  await rejectsCondition(
    () => inspect({ dbPath: DB_PATH, phase: "inactive_pre_custody" }, {
      sidecars: false,
      filesystemAtRead(read, base) {
        return read > 4
          ? { ...base, wal: objectMetadata({ dev: 10, ino: 99 }) }
          : base;
      }
    }),
    "database_boundary_invalid"
  );
});

test("a dangling WAL or SHM symlink is not classified as an absent sidecar", async () => {
  for (const suffix of ["-wal", "-shm"]) {
    await rejectsCondition(
      () => inspect({ dbPath: DB_PATH, phase: "inactive_pre_custody" }, {
        filesystemAtRead(_read, base) {
          return {
            ...base,
            [suffix === "-wal" ? "wal" : "shm"]:
              objectMetadata({ dev: 10, ino: 99, kind: "symlink" })
          };
        },
        realpath(path) {
          if (path === `${DB_PATH}${suffix}`) throw enoent();
          return undefined;
        }
      }),
      "database_boundary_invalid"
    );
  }
});

test("an expected database boundary mismatch fails before proc scanning", async () => {
  let procReads = 0;
  const runtime = await runtimeFor({
    listDirectory(path) {
      if (path === "/proc") procReads += 1;
    }
  });
  const { __inspectCore } = await loadHarness();
  await rejectsCondition(() => __inspectCore({
    dbPath: DB_PATH,
    phase: "exclusive_pre_commit",
    expectedDatabaseBoundary: { ...SHA256, objectIdentitySha256: "8".repeat(64) },
    expectedCustodyChildProcessIdentitySha256: "5".repeat(64),
    expectedCustodyChildChannelBindingSha256: CHILD_CHANNEL_SHA256
  }, runtime), "database_boundary_invalid");
  assert.equal(procReads, 0);
});

test("an unbranded runtime cannot reach the observer core", async () => {
  const { __inspectCore } = await loadHarness();
  await rejectsCondition(
    () => __inspectCore({ dbPath: DB_PATH, phase: "inactive_pre_custody" }, syntheticState()),
    "holder_observation_invalid"
  );
});

test("observer core fails closed off Linux without reading a private path", async () => {
  let databaseBoundaryReads = 0;
  const { __createRuntime, __inspectCore } = await loadHarness();
  const runtime = __createRuntime({
    ...syntheticState(),
    platform: "win32",
    inspectDatabaseBoundary() {
      databaseBoundaryReads += 1;
      return SHA256;
    }
  });
  await rejectsCondition(
    () => __inspectCore({
      dbPath: DB_PATH,
      phase: "inactive_pre_custody"
    }, runtime),
    "holder_observation_failed"
  );
  assert.equal(databaseBoundaryReads, 0);
});
