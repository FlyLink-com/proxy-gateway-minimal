import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  classifySecurityInspectionResult,
  classifyValidationEnvironmentVariables,
  inspectValidationEnvironment,
  isExecutableOnPath,
  nonLeafAclFindingCoveredByModeCustody,
  runValidationEnvironmentPreflightCli
} from "../../scripts/validation-environment-preflight.mjs";
import {
  buildSourceValidationTestEnvironment,
  listSourceValidationTestFiles,
  runSourceValidationTests,
  sanitizeSourceValidationChildEnvironment,
  SOURCE_VALIDATION_EMPTY_ENV_RELATIVE_PATH,
  SOURCE_VALIDATION_PROXY_CONFIG_RELATIVE_PATH
} from "../../scripts/source-validation-test-runner.mjs";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SOURCE_NODE_RANGE = ">=20.10.0 <21 || 22.x || 23.x || 24.x || 25.x || 26.x";

function readyRuntime(overrides = {}) {
  return {
    platform: "linux",
    arch: "x64",
    nodeVersion: "22.23.1",
    nodeModulesAbi: "127",
    npmVersion: "10.9.8",
    npmTrusted: true,
    glibcVersion: "2.39",
    sourceNodeRange: SOURCE_NODE_RANGE,
    identity: {
      uid: 1000,
      gid: 1000,
      euid: 1000,
      egid: 1000
    },
    environmentSignals: {
      injectionKeys: [],
      modulePathKeys: [],
      ambientNetworkKeys: [],
      advisoryKeys: []
    },
    workspaceChain: [
      { kind: "directory", mode: 0o755, uid: 0 },
      { kind: "directory", mode: 0o700, uid: 1000 }
    ],
    tools: {
      gcc: true,
      readelf: true,
      python3: true,
      tar: true,
      getfacl: true,
      getcap: true,
      env: true,
      timeout: true,
      bash: true,
      sleep: true,
      git: true,
      cp: true,
      cmp: true,
      cut: true,
      find: true,
      install: true,
      mkdir: true,
      mv: true,
      rm: true,
      sha256sum: true,
      npm: true,
      node: true
    },
    workspaceExtendedCustody: true,
    workspaceExtendedCustodyReason: "none",
    workspaceExtendedCustodyAncestorIndex: null,
    capabilities: {
      effective: { kill: false, setgid: false, setuid: false, setpcap: false },
      bounding: { kill: false, setgid: false, setuid: false, setpcap: false }
    },
    pidNamespaceDepth: 1,
    nobodyIdentity: { uid: 65534, gid: 65534 },
    sourceFixturePresent: true,
    protectedConfigPresent: false,
    ...overrides
  };
}

test("source profile follows engines without requiring one Node patch or privileged host state", () => {
  const report = inspectValidationEnvironment({
    profile: "source",
    runtime: readyRuntime({
      nodeVersion: "24.9.0",
      nodeModulesAbi: "137",
      identity: { uid: 0, gid: 0, euid: 0, egid: 0 },
      workspaceChain: [{ kind: "directory", mode: 0o777, uid: 0 }]
    })
  });

  assert.equal(report.ok, true);
  assert.equal(report.state, "ready");
  assert.equal(report.profile, "source");
  assert.equal(report.productionAuthority, false);
  assert.equal(report.mutation, false);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.checks.nodeRuntime.ok, true);
  assert.equal(report.checks.nodeRuntime.policy, "package_engines");
  assert.equal(report.checks.processIdentity.required, false);
  assert.equal(report.checks.workspaceCustody.required, false);
  assert.equal(report.checks.protectedConfig.required, false);

  const lowerBoundary = inspectValidationEnvironment({
    profile: "source",
    runtime: readyRuntime({
      platform: "win32",
      nodeVersion: "20.10.0",
      nodeModulesAbi: "115"
    })
  });
  assert.equal(lowerBoundary.ok, true);
  assert.equal(lowerBoundary.checks.nodeRuntime.version, "20.10.0");

  const semanticallyEquivalentRange = inspectValidationEnvironment({
    profile: "source",
    runtime: readyRuntime({
      nodeVersion: "25.2.0",
      sourceNodeRange: "26.x || 25.x || 24.x || 23.x || 22.x || >=20.10.0 <21"
    })
  });
  assert.equal(semanticallyEquivalentRange.ok, true);

  for (const nodeVersion of ["20.9.9", "21.9.0", "27.0.0"]) {
    const unsupported = inspectValidationEnvironment({
      profile: "source",
      runtime: readyRuntime({ nodeVersion })
    });
    assert.equal(unsupported.ok, false, nodeVersion);
    assert.deepEqual(unsupported.blockers.map(({ code }) => code), ["node_runtime_mismatch"]);
  }
  const malformedRange = inspectValidationEnvironment({
    profile: "source",
    runtime: readyRuntime({ sourceNodeRange: "22.x ||" })
  });
  assert.equal(malformedRange.ok, false);
});

test("source tool discovery respects platform PATH casing and Windows executable suffixes without launching tools", (t) => {
  const root = mkdtempSync(join(tmpdir(), "validation-tool-path-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const posixGit = join(root, "git");
  const windowsGit = join(root, "git.EXE");
  writeFileSync(posixGit, "fixture\n", { mode: 0o755 });
  writeFileSync(windowsGit, "fixture\n", { mode: 0o755 });
  chmodSync(posixGit, 0o755);
  chmodSync(windowsGit, 0o755);

  assert.equal(isExecutableOnPath("git", {
    environment: { PATH: root },
    platform: "linux"
  }), true);
  assert.equal(isExecutableOnPath("git", {
    environment: { Path: root, PathExt: ".EXE;.CMD" },
    platform: "win32"
  }), true);
  assert.equal(isExecutableOnPath("../git", {
    environment: { PATH: root },
    platform: "linux"
  }), false);
});

test("Windows source environment replaces ambient command settings and admits only a discovered Git directory", (t) => {
  const root = mkdtempSync(join(tmpdir(), "validation-windows-environment-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const systemRoot = join(root, "Windows");
  const system32 = join(systemRoot, "System32");
  const powerShell = join(system32, "WindowsPowerShell", "v1.0");
  const nodeDirectory = join(root, "Node");
  const gitDirectory = join(root, "Git", "cmd");
  const poisonDirectory = join(root, "poison");
  for (const directory of [system32, powerShell, nodeDirectory, gitDirectory, poisonDirectory]) {
    mkdirSync(directory, { recursive: true });
  }
  for (const executable of [
    join(system32, "cmd.exe"),
    join(system32, "tar.exe"),
    join(powerShell, "powershell.exe"),
    join(nodeDirectory, "node.exe"),
    join(gitDirectory, "git.exe"),
    join(poisonDirectory, "tar.exe")
  ]) {
    writeFileSync(executable, "fixture\n", { mode: 0o755 });
    chmodSync(executable, 0o755);
  }

  const environment = sanitizeSourceValidationChildEnvironment({
    SYSTEMROOT: systemRoot,
    WINDIR: join(root, "attacker-windows"),
    COMSPEC: join(root, "attacker-cmd.exe"),
    PATHEXT: ".EVIL",
    PATH: `${poisonDirectory};${gitDirectory}`
  }, {
    platform: "win32",
    execPath: join(nodeDirectory, "node.exe")
  });

  assert.equal(environment.SYSTEMROOT, systemRoot);
  assert.equal(environment.WINDIR, systemRoot);
  assert.equal(environment.COMSPEC, join(system32, "cmd.exe"));
  assert.equal(environment.PATHEXT, ".COM;.EXE;.BAT;.CMD");
  assert.equal(environment.PATH.split(";").includes(poisonDirectory), false);
  assert.equal(environment.PATH.split(";").includes(gitDirectory), true);
  assert.ok(environment.PATH.indexOf(system32) < environment.PATH.indexOf(gitDirectory));
});

test("source profile blocks unsupported Node and inherited process/proxy injection without leaking values", () => {
  const secretProxy = "http://secret-user:secret-password@example.test:8080";
  const signals = classifyValidationEnvironmentVariables({
    HTTPS_PROXY: secretProxy,
    NODE_OPTIONS: "--require=/private/secret-hook.cjs",
    NODE_USE_ENV_PROXY: "1"
  }, { platform: "linux" });
  const report = inspectValidationEnvironment({
    profile: "source",
    runtime: readyRuntime({
      nodeVersion: "21.7.3",
      nodeModulesAbi: "120",
      environmentSignals: signals
    })
  });

  assert.equal(report.ok, false);
  assert.equal(report.state, "blocked");
  assert.deepEqual(report.blockers.map(({ code }) => code), [
    "node_runtime_mismatch",
    "node_environment_polluted"
  ]);
  assert.deepEqual(report.checks.nodeEnvironment.detectedKeys, [
    "HTTPS_PROXY",
    "NODE_OPTIONS",
    "NODE_USE_ENV_PROXY"
  ]);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(secretProxy), false);
  assert.equal(serialized.includes("secret-hook"), false);

  const safeValues = classifyValidationEnvironmentVariables({
    NODE_OPTIONS: "--max-old-space-size=4096 --max_semi_space_size=128 --stack_trace_limit=50",
    NODE_USE_ENV_PROXY: "0",
    NODE_TLS_REJECT_UNAUTHORIZED: "1",
    Node_Path: "/corporate/modules",
    NODE_EXTRA_CA_CERTS: "/corporate/ca.pem"
  }, { platform: "linux" });
  const warningOnly = inspectValidationEnvironment({
    profile: "source",
    runtime: readyRuntime({ environmentSignals: safeValues })
  });
  assert.equal(warningOnly.ok, true);
  assert.deepEqual(warningOnly.checks.nodeEnvironment.detectedKeys, ["NODE_EXTRA_CA_CERTS", "NODE_OPTIONS"]);
  assert.deepEqual(warningOnly.checks.nodeEnvironment.warningKeys, ["NODE_EXTRA_CA_CERTS", "NODE_OPTIONS"]);

  const posixCaseSensitive = classifyValidationEnvironmentVariables({
    Node_Options: "--require=/private/ignored-on-posix.cjs",
    Node_Path: "/ignored/on/posix"
  }, { platform: "linux" });
  assert.deepEqual(posixCaseSensitive.injectionKeys, []);
  assert.deepEqual(posixCaseSensitive.modulePathKeys, []);

  const posixProxyAlias = classifyValidationEnvironmentVariables({
    https_proxy: secretProxy
  }, { platform: "linux" });
  assert.deepEqual(posixProxyAlias.ambientNetworkKeys, ["HTTPS_PROXY"]);

  const windowsCaseInsensitive = classifyValidationEnvironmentVariables({
    Node_Options: "--require=C:\\private\\hook.cjs"
  }, { platform: "win32" });
  assert.deepEqual(windowsCaseInsensitive.injectionKeys, ["NODE_OPTIONS"]);

  const loaderInjection = classifyValidationEnvironmentVariables({
    LD_AUDIT: "/private/audit.so",
    DYLD_FRAMEWORK_PATH: "/private/frameworks"
  }, { platform: "linux" });
  assert.deepEqual(loaderInjection.injectionKeys, ["LD_AUDIT"]);
  const macLoaderInjection = classifyValidationEnvironmentVariables({
    LD_AUDIT: "/private/audit.so",
    DYLD_FRAMEWORK_PATH: "/private/frameworks"
  }, { platform: "darwin" });
  assert.deepEqual(macLoaderInjection.injectionKeys, ["DYLD_FRAMEWORK_PATH"]);
});

test("dependency-artifact profile binds exact runtime, ABI, non-root identity, tools, and secure ancestors", () => {
  const ready = inspectValidationEnvironment({
    profile: "dependency-artifact",
    runtime: readyRuntime()
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.checks.nodeRuntime.policy, "exact_dependency_runtime");
  assert.equal(ready.checks.processIdentity.identity, "non_root");
  assert.equal(ready.checks.workspaceCustody.aclCapabilitiesReason, "none");
  assert.equal(ready.checks.workspaceCustody.aclCapabilitiesAncestorIndex, null);

  const blocked = inspectValidationEnvironment({
    profile: "dependency-artifact",
    runtime: readyRuntime({
      nodeVersion: "22.24.0",
      identity: { uid: 0, gid: 0, euid: 0, egid: 0 },
      workspaceChain: [
        { kind: "directory", mode: 0o777, uid: 0 },
        { kind: "directory", mode: 0o700, uid: 0 }
      ],
      tools: {
        ...readyRuntime().tools,
        getfacl: false
      }
    })
  });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.blockers.map(({ code }) => code), [
    "node_runtime_mismatch",
    "service_identity_invalid",
    "workspace_custody_invalid",
    "required_tool_missing"
  ]);
  assert.deepEqual(blocked.checks.requiredTools.missing, ["getfacl"]);

  const wrongOwner = inspectValidationEnvironment({
    profile: "dependency-artifact",
    runtime: readyRuntime({
      workspaceChain: [
        { kind: "directory", mode: 0o755, uid: 0 },
        { kind: "directory", mode: 0o700, uid: 2000 }
      ]
    })
  });
  assert.equal(wrongOwner.ok, false);
  assert.deepEqual(wrongOwner.blockers.map(({ code }) => code), ["workspace_custody_invalid"]);

  const unsafeExtendedCustody = inspectValidationEnvironment({
    profile: "dependency-artifact",
    runtime: readyRuntime({
      workspaceExtendedCustody: false,
      workspaceExtendedCustodyReason: "getfacl_finding",
      workspaceExtendedCustodyAncestorIndex: 3
    })
  });
  assert.equal(unsafeExtendedCustody.ok, false);
  assert.deepEqual(unsafeExtendedCustody.blockers.map(({ code }) => code), ["workspace_custody_invalid"]);
  assert.equal(unsafeExtendedCustody.checks.workspaceCustody.aclCapabilitiesReason, "getfacl_finding");
  assert.equal(unsafeExtendedCustody.checks.workspaceCustody.aclCapabilitiesAncestorIndex, 3);

  const invalidExtendedCustody = inspectValidationEnvironment({
    profile: "dependency-artifact",
    runtime: readyRuntime({
      workspaceExtendedCustody: false,
      workspaceExtendedCustodyReason: "getfacl_finding",
      workspaceExtendedCustodyAncestorIndex: 999
    })
  });
  assert.equal(invalidExtendedCustody.ok, false);
  assert.equal(
    invalidExtendedCustody.checks.workspaceCustody.aclCapabilitiesReason,
    "inspection_invalid"
  );
  assert.equal(invalidExtendedCustody.checks.workspaceCustody.aclCapabilitiesAncestorIndex, null);

  const coveredAncestorAcl = inspectValidationEnvironment({
    profile: "dependency-artifact",
    runtime: readyRuntime({
      workspaceExtendedCustodyReason: "non_leaf_getfacl_finding",
      workspaceExtendedCustodyAncestorIndex: 4
    })
  });
  assert.equal(coveredAncestorAcl.ok, true);
  assert.equal(
    coveredAncestorAcl.checks.workspaceCustody.aclCapabilitiesReason,
    "non_leaf_getfacl_finding"
  );
  assert.equal(coveredAncestorAcl.checks.workspaceCustody.aclCapabilitiesAncestorIndex, 4);

  const coveredAclWithUnsafeMode = inspectValidationEnvironment({
    profile: "dependency-artifact",
    runtime: readyRuntime({
      workspaceChain: [
        { kind: "directory", mode: 0o755, uid: 0 },
        { kind: "directory", mode: 0o722, uid: 1000 }
      ],
      workspaceExtendedCustodyReason: "non_leaf_getfacl_finding",
      workspaceExtendedCustodyAncestorIndex: 4
    })
  });
  assert.equal(coveredAclWithUnsafeMode.ok, false);
  assert.equal(coveredAclWithUnsafeMode.checks.workspaceCustody.modeOwner, false);
  assert.equal(coveredAclWithUnsafeMode.checks.workspaceCustody.aclCapabilities, false);
  assert.equal(
    coveredAclWithUnsafeMode.checks.workspaceCustody.aclCapabilitiesReason,
    "inspection_invalid"
  );

  const untrustedNpm = inspectValidationEnvironment({
    profile: "dependency-artifact",
    runtime: readyRuntime({ npmTrusted: false })
  });
  assert.equal(untrustedNpm.ok, false);
  assert.deepEqual(untrustedNpm.blockers.map(({ code }) => code), ["node_runtime_mismatch"]);
});

test("extended custody reports bounded reason codes without exposing findings", () => {
  const empty = { status: 0, stdout: "\n", stderr: "" };
  assert.equal(classifySecurityInspectionResult(empty, "getfacl"), "none");
  assert.equal(classifySecurityInspectionResult(empty, "getcap"), "none");

  assert.equal(
    classifySecurityInspectionResult({
      status: 0,
      stdout: "# flags: -s-\n",
      stderr: ""
    }, "getfacl"),
    "getfacl_special_flags"
  );

  for (const result of [
    { status: 0, stdout: "user:1001:r-x\n", stderr: "" },
    { status: 0, stdout: "mask::r-x\n", stderr: "" },
    { status: 0, stdout: "default:user::rwx\n", stderr: "" },
    { status: 0, stdout: "# flags: -s-\nuser::rwx\n", stderr: "" }
  ]) {
    assert.equal(classifySecurityInspectionResult(result, "getfacl"), "getfacl_finding");
  }

  const outputLimit = new Error("private output limit detail");
  outputLimit.code = "ENOBUFS";
  assert.equal(
    classifySecurityInspectionResult({ status: null, stdout: "", stderr: "", error: outputLimit }, "getfacl"),
    "getfacl_output_limit"
  );
  assert.equal(classifySecurityInspectionResult(null, "getfacl"), "getfacl_spawn_error");
  assert.equal(
    classifySecurityInspectionResult({
      status: null,
      stdout: "",
      stderr: "",
      error: new Error("private spawn detail")
    }, "getfacl"),
    "getfacl_spawn_error"
  );
  assert.equal(
    classifySecurityInspectionResult({ status: null, stdout: "", stderr: "" }, "getfacl"),
    "getfacl_status_error"
  );
  assert.equal(
    classifySecurityInspectionResult({ status: 1, stdout: "", stderr: "" }, "getfacl"),
    "getfacl_status_error"
  );
  assert.equal(
    classifySecurityInspectionResult({ status: 0, stdout: "", stderr: "private failure" }, "getfacl"),
    "getfacl_stderr"
  );

  for (const result of [
    { status: 0, stdout: "/workspace =\n", stderr: "" },
    { status: 0, stdout: "cap_setuid=ep\n", stderr: "" }
  ]) {
    assert.equal(classifySecurityInspectionResult(result, "getcap"), "getcap_finding");
  }
  assert.equal(
    classifySecurityInspectionResult({ status: 0, stdout: "", stderr: "private failure" }, "getcap"),
    "getcap_stderr"
  );
  assert.equal(
    classifySecurityInspectionResult({ status: 127, stdout: "", stderr: "" }, "getcap"),
    "getcap_status_error"
  );
  assert.throws(
    () => classifySecurityInspectionResult(empty, "unknown"),
    /security_inspection_kind_invalid/u
  );

  assert.equal(nonLeafAclFindingCoveredByModeCustody({
    reason: "getfacl_finding",
    ancestorIndex: 4,
    modeOwnerSecure: true
  }), true);
  for (const candidate of [
    { reason: "getfacl_finding", ancestorIndex: 0, modeOwnerSecure: true },
    { reason: "getfacl_finding", ancestorIndex: 4, modeOwnerSecure: false },
    { reason: "getfacl_special_flags", ancestorIndex: 4, modeOwnerSecure: true },
    { reason: "getcap_finding", ancestorIndex: 4, modeOwnerSecure: true },
    { reason: "getfacl_finding", ancestorIndex: 32, modeOwnerSecure: true }
  ]) {
    assert.equal(nonLeafAclFindingCoveredByModeCustody(candidate), false);
  }

  const source = readFileSync(
    resolve(REPOSITORY_ROOT, "scripts/validation-environment-preflight.mjs"),
    "utf8"
  );
  assert.match(
    source,
    /spawnSync\(TOOL_PATHS\.getfacl, \[\s*"--skip-base",\s*"--numeric",\s*"--no-effective"/u
  );
});

test("privileged-synthetic profile requires root, Node 22, native toolchain, nobody, and effective plus bounding capabilities", () => {
  const privilegedRuntime = readyRuntime({
    nodeVersion: "22.99.0",
    nodeModulesAbi: "127",
    identity: { uid: 0, gid: 0, euid: 0, egid: 0 },
    capabilities: {
      effective: { kill: true, setgid: true, setuid: true, setpcap: true },
      bounding: { kill: true, setgid: true, setuid: true, setpcap: true }
    }
  });
  const ready = inspectValidationEnvironment({
    profile: "privileged-synthetic",
    runtime: privilegedRuntime
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.checks.nodeRuntime.policy, "node_22_line");
  assert.equal(ready.checks.processIdentity.identity, "root");

  const blocked = inspectValidationEnvironment({
    profile: "privileged-synthetic",
    runtime: readyRuntime({
      identity: { uid: 0, gid: 0, euid: 0, egid: 0 },
      capabilities: {
        effective: { kill: false, setgid: false, setuid: false, setpcap: false },
        bounding: { kill: false, setgid: false, setuid: false, setpcap: false }
      },
      pidNamespaceDepth: 2,
      nobodyIdentity: null
    })
  });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.blockers.map(({ code }) => code), [
    "privileged_capability_invalid",
    "pid_namespace_invalid",
    "service_identity_invalid"
  ]);
  assert.deepEqual(blocked.checks.privilegedCapabilities.missing, ["kill", "setgid", "setuid", "setpcap"]);
  assert.equal(blocked.checks.pidNamespace.topology, "nested");
});

test("preflight CLI never infers a profile and emits one bounded JSON line on each channel", () => {
  let stdout = "";
  let stderr = "";
  const missingCode = runValidationEnvironmentPreflightCli({
    argv: [],
    runtime: readyRuntime(),
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } }
  });
  assert.equal(missingCode, 2);
  assert.equal(stdout, "");
  assert.deepEqual(JSON.parse(stderr), {
    schemaVersion: "1",
    type: "validation_environment_preflight",
    state: "blocked",
    condition: "validation_profile_invalid",
    productionAuthority: false,
    mutation: false
  });

  stdout = "";
  stderr = "";
  const readyCode = runValidationEnvironmentPreflightCli({
    argv: ["--profile", "source"],
    runtime: readyRuntime(),
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } }
  });
  assert.equal(readyCode, 0);
  assert.equal(JSON.parse(stdout).state, "ready");
  assert.equal(stderr, "");

  stdout = "";
  const blockedCode = runValidationEnvironmentPreflightCli({
    argv: ["--profile", "dependency-artifact"],
    runtime: readyRuntime({ identity: { uid: 0, gid: 0, euid: 0, egid: 0 } }),
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } }
  });
  assert.equal(blockedCode, 1);
  assert.equal(stdout, "");
  assert.equal(JSON.parse(stderr).state, "blocked");
  assert.equal(stderr.endsWith("\n"), true);
  assert.equal(stderr.trim().split(/\r?\n/u).length, 1);
});

test("source test environment removes host injection and binds the tracked synthetic fixture", () => {
  const original = {
    PATH: "/host/poison-bin",
    KEEP_FOR_TEST: "kept",
    Node_Use_Env_Proxy: "1",
    Node_Options: "--require=/private/secret.cjs",
    NODE_PATH: "/private/modules",
    HTTPS_PROXY: "http://secret@example.test",
    http_proxy: "http://secret@example.test",
    SUBSCRIPTION_PROXY_CONFIG_PATH: "/private/proxy-servers.json",
    SUBSCRIPTION_CONTROL_DB_PATH: "/private/production.sqlite",
    EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION: "1",
    PROVIDER_TOKEN: "production-token",
    WELCOME_COINS_PRIVILEGED_SYNTHETIC_GATE: "1",
    DOTENV_CONFIG_PATH: "/private/production.env",
    vultr_tuic_host: "production.example.test"
  };
  const environment = buildSourceValidationTestEnvironment(original, {
    repositoryRoot: "/reviewed/source",
    temporaryDirectory: "/isolated/temp"
  });

  assert.equal(original.Node_Use_Env_Proxy, "1", "input must not be mutated");
  for (const key of [
    "KEEP_FOR_TEST",
    "Node_Use_Env_Proxy",
    "Node_Options",
    "NODE_PATH",
    "HTTPS_PROXY",
    "http_proxy",
    "SUBSCRIPTION_CONTROL_DB_PATH",
    "EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION",
    "PROVIDER_TOKEN",
    "WELCOME_COINS_PRIVILEGED_SYNTHETIC_GATE",
    "vultr_tuic_host"
  ]) {
    assert.equal(key in environment, false, key);
  }
  assert.equal(environment.PATH.includes("/host/poison-bin"), false);
  if (process.platform !== "win32") {
    const pathEntries = environment.PATH.split(":");
    assert.ok(pathEntries.indexOf("/usr/bin") < pathEntries.indexOf("/usr/local/bin"));
  }
  assert.equal(environment.NODE_ENV, "test");
  assert.equal(environment.LANG, "C");
  assert.equal(environment.LC_ALL, "C");
  assert.equal(environment.TZ, "UTC");
  assert.equal(environment.TEMP, "/isolated/temp");
  assert.equal(environment.TMP, "/isolated/temp");
  assert.equal(environment.TMPDIR, "/isolated/temp");
  assert.equal(environment.PYTHONDONTWRITEBYTECODE, "1");
  assert.equal(environment.PYTHONNOUSERSITE, "1");
  assert.equal(environment.PYTHONHASHSEED, "0");
  assert.equal(environment.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(environment.GIT_TERMINAL_PROMPT, "0");
  assert.equal(
    environment.SUBSCRIPTION_PROXY_CONFIG_PATH,
    `/reviewed/source/${SOURCE_VALIDATION_PROXY_CONFIG_RELATIVE_PATH}`
  );
  assert.equal(
    environment.DOTENV_CONFIG_PATH,
    `/reviewed/source/${SOURCE_VALIDATION_EMPTY_ENV_RELATIVE_PATH}`
  );
  assert.equal(environment.GIT_CONFIG_GLOBAL, environment.DOTENV_CONFIG_PATH);
  assert.equal(environment.SGP_TUIC_HOST, "sgp.example.test");
  assert.equal(environment.SGP_TUIC_SNI, "sgp.example.test");
  assert.equal(environment.SGP_VLESS_REALITY_HOST, "sgp.example.test");
  assert.equal(environment.SGP_HY2_HOST, "sgp.example.test");
  assert.equal(environment.SGP_HY2_SNI, "sgp.example.test");
});

test("source test runner uses a bounded relative inventory, isolated temp, and nonzero status passthrough", () => {
  const files = listSourceValidationTestFiles({ repositoryRoot: REPOSITORY_ROOT });
  assert.ok(files.length > 0);
  assert.equal(files.every((file) => !isAbsolute(file)), true);
  const commandCharacters = [process.execPath, "--test", "--test-concurrency=4", ...files]
    .reduce((total, value) => total + value.length + 1, 0);
  assert.ok(commandCharacters < 28_000, commandCharacters);

  let invocation;
  let stderr = "";
  const status = runSourceValidationTests({
    argv: [],
    repositoryRoot: REPOSITORY_ROOT,
    environment: {
      PATH: "/host/poison-bin",
      PROVIDER_TOKEN: "production-token",
      SUBSCRIPTION_CONTROL_DB_PATH: "/private/production.sqlite"
    },
    spawn(command, args, options) {
      invocation = { command, args, options };
      return { status: 9 };
    },
    stderr: { write(value) { stderr += value; } }
  });

  assert.equal(status, 9);
  assert.equal(stderr, "");
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args.slice(0, 2), ["--test", "--test-concurrency=4"]);
  assert.deepEqual(invocation.args.slice(2), files);
  assert.equal(invocation.options.cwd, REPOSITORY_ROOT);
  assert.equal(invocation.options.env.PROVIDER_TOKEN, undefined);
  assert.equal(invocation.options.env.SUBSCRIPTION_CONTROL_DB_PATH, undefined);
  assert.equal(invocation.options.env.PATH.includes("/host/poison-bin"), false);
  assert.equal(isAbsolute(invocation.options.env.TMPDIR), true);
  assert.equal(existsSync(invocation.options.env.TMPDIR), false, "runner temp is cleaned");
});

test("preflight and source-test runner modules are import-only and do not execute on import", () => {
  const modules = [
    resolve(REPOSITORY_ROOT, "scripts/validation-environment-preflight.mjs"),
    resolve(REPOSITORY_ROOT, "scripts/source-validation-test-runner.mjs")
  ];
  const probe = `${modules.map((path) => `await import(${JSON.stringify(pathToFileURL(path).href)});`).join("\n")}\nprocess.stdout.write("imported\\n");`;
  const env = buildSourceValidationTestEnvironment(process.env, {
    repositoryRoot: REPOSITORY_ROOT
  });
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "imported\n");
  assert.equal(result.stderr, "");
});

test("package and workflow contracts invoke each explicit profile without weakening existing gates", () => {
  const packageJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["validation:environment:source"],
    "node scripts/validation-environment-preflight.mjs --profile source"
  );
  assert.equal(
    packageJson.scripts["validation:environment:dependency-artifact"],
    "node scripts/validation-environment-preflight.mjs --profile dependency-artifact"
  );
  assert.equal(
    packageJson.scripts["validation:environment:privileged-synthetic"],
    "node scripts/validation-environment-preflight.mjs --profile privileged-synthetic"
  );
  assert.equal(
    packageJson.scripts["test:server"],
    "node scripts/source-validation-test-runner.mjs"
  );

  const ci = readFileSync(resolve(REPOSITORY_ROOT, ".github/workflows/ci.yml"), "utf8");
  const sourcePreflight = ci.indexOf("npm run validation:environment:source");
  const rootInstall = ci.indexOf("run: npm ci", sourcePreflight);
  assert.ok(sourcePreflight >= 0 && rootInstall > sourcePreflight);
  assert.doesNotMatch(ci.slice(sourcePreflight, rootInstall), /continue-on-error|\|\|\s*true/u);

  const privilegedStepStart = ci.indexOf("- name: Run privileged Welcome Coins custody synthetic gate");
  const privilegedStepEnd = ci.indexOf("- name: Determine validation lane", privilegedStepStart);
  const privilegedStep = ci.slice(privilegedStepStart, privilegedStepEnd);
  const privilegedIsolation = privilegedStep.indexOf("/usr/bin/sudo -n /usr/bin/env -i");
  const privilegedTimeout = privilegedStep.indexOf("10s \\", privilegedIsolation);
  const privilegedPreflight = privilegedStep.indexOf("--profile privileged-synthetic", privilegedTimeout);
  const privilegedTest = privilegedStep.indexOf("server/tests/control-plane-welcome-coins-native-synthetic-runner.test.mjs");
  assert.ok(privilegedStepStart >= 0 && privilegedStepEnd > privilegedStepStart);
  assert.ok(privilegedIsolation >= 0 && privilegedTimeout > privilegedIsolation);
  assert.ok(privilegedPreflight >= 0 && privilegedTest > privilegedPreflight);
  assert.match(privilegedStep.slice(privilegedIsolation, privilegedPreflight), /PATH=\/usr\/bin:\/bin/u);
  assert.match(privilegedStep.slice(privilegedIsolation, privilegedPreflight), /"\$node_binary" scripts\/validation-environment-preflight\.mjs/u);
  assert.doesNotMatch(privilegedStep.slice(privilegedIsolation, privilegedTest), /continue-on-error|\|\|\s*true/u);

  const dependencyWorkflow = readFileSync(
    resolve(REPOSITORY_ROOT, ".github/workflows/control-plane-dependency-artifact.yml"),
    "utf8"
  );
  const exactNode = dependencyWorkflow.indexOf("node-version: 22.23.1");
  const dependencyPreflight = dependencyWorkflow.indexOf("npm run validation:environment:dependency-artifact");
  const dependencyInstall = dependencyWorkflow.indexOf("npm ci --omit=dev", dependencyPreflight);
  assert.ok(exactNode >= 0 && dependencyPreflight > exactNode && dependencyInstall > dependencyPreflight);
  assert.doesNotMatch(
    dependencyWorkflow.slice(dependencyPreflight, dependencyInstall),
    /continue-on-error|\|\|\s*true/u
  );

  const productionDryRun = readFileSync(
    resolve(REPOSITORY_ROOT, ".github/workflows/production-deploy-dry-run.yml"),
    "utf8"
  );
  const dryRunSetup = productionDryRun.indexOf("node-version: 22");
  const dryRunPreflight = productionDryRun.indexOf("npm run validation:environment:source", dryRunSetup);
  const dryRunInstall = productionDryRun.indexOf("run: npm ci", dryRunPreflight);
  assert.ok(dryRunSetup >= 0 && dryRunPreflight > dryRunSetup && dryRunInstall > dryRunPreflight);
  assert.doesNotMatch(
    productionDryRun.slice(dryRunPreflight, dryRunInstall),
    /continue-on-error|\|\|\s*true/u
  );

  function workflowJob(workflow, jobName, nextJobName) {
    const start = workflow.indexOf(`  ${jobName}:`);
    const end = nextJobName ? workflow.indexOf(`  ${nextJobName}:`, start + 1) : workflow.length;
    assert.ok(start >= 0 && end > start, `missing ${jobName} job`);
    return workflow.slice(start, end);
  }

  function assertSourcePreflightBefore(job, firstWorkMarker, description) {
    const setup = job.indexOf("node-version: 22");
    const preflight = job.indexOf("npm run validation:environment:source", setup);
    const firstWork = job.indexOf(firstWorkMarker, setup);
    assert.ok(setup >= 0, `${description} must select Node 22`);
    assert.ok(preflight > setup, `${description} must preflight its own runner`);
    assert.ok(firstWork > preflight, `${description} must preflight before ${firstWorkMarker}`);
    assert.equal(
      (job.match(/npm run validation:environment:source/gu) ?? []).length,
      1,
      `${description} must run one source preflight`
    );
    assert.doesNotMatch(
      job.slice(preflight, firstWork),
      /continue-on-error|\|\|\s*true/u,
      `${description} preflight must fail closed`
    );
  }

  const releaseArtifact = readFileSync(
    resolve(REPOSITORY_ROOT, ".github/workflows/release-artifact.yml"),
    "utf8"
  );
  for (const [jobName, nextJobName, firstWorkMarker] of [
    ["classify", "package", "node scripts/ci-change-classifier.mjs"],
    ["package", "portal-static", "- name: Resolve release label"],
    ["portal-static", "admin-static", "- name: Install Portal dependencies"],
    ["admin-static", null, "- name: Install Admin dependencies"]
  ]) {
    assertSourcePreflightBefore(
      workflowJob(releaseArtifact, jobName, nextJobName),
      firstWorkMarker,
      `Release Artifact ${jobName}`
    );
  }

  const cloudflare = readFileSync(
    resolve(REPOSITORY_ROOT, ".github/workflows/deploy-cloudflare-site.yml"),
    "utf8"
  );
  assertSourcePreflightBefore(
    workflowJob(cloudflare, "validate", "deploy"),
    "- name: Install root dependencies",
    "Cloudflare validate"
  );
  assertSourcePreflightBefore(
    workflowJob(cloudflare, "deploy", null),
    "- name: Install root dependencies",
    "Cloudflare deploy"
  );
});
