import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HARNESS = fileURLToPath(new URL(
  "../../scripts/control-plane-a3-remediation-clean-linux-integration.py",
  import.meta.url
));
const PHYSICALLY_VERIFIED_SHA256 = "a5e997793c766e3ac8f93b71b4b0a9faa4df56a8643feee80d15459d6a63ac02";

function harnessBytes() {
  return readFileSync(HARNESS);
}

function harnessSource() {
  return harnessBytes().toString("utf8");
}

test("tracked harness is byte-identical to the physically verified v4 source", () => {
  const bytes = harnessBytes();
  assert.equal(bytes.includes(0x0d), false, "tracked Python must remain LF-only");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), PHYSICALLY_VERIFIED_SHA256);
});

test("Debian control custody is explicit and command failures retain their stage", () => {
  const source = harnessSource();
  assert.match(
    source,
    /COLLECTOR_SHA256 = "0e7edee8a3871177bab379b2958d4f02852e4469580e498ae022c23c618a685b"/
  );
  assert.match(
    source,
    /control\.mkdir\(parents=True, mode=0o755\)\n {4}os\.chmod\(control, 0o755, follow_symlinks=False\)/
  );
  assert.match(source, /condition="deb_custody_integration_failed"/);
  assert.match(source, /command\(invocation, condition="systemd_show_integration_failed"\)/);
});

test("tracked harness remains aggregate-only and has no transport or production mutation", () => {
  const source = harnessSource();
  assert.doesNotMatch(source, /\b(?:ssh|scp|rsync|curl|wget|ncat|socat)\b/i);
  assert.doesNotMatch(source, /\bapt(?:-get)?\s+(?:install|remove|purge|upgrade|dist-upgrade)\b/i);
  assert.doesNotMatch(source, /systemctl["',\s]+(?:start|stop|restart|reload|enable|disable|mask|unmask|daemon-reload)\b/i);
  assert.doesNotMatch(source, /\/opt\/proxy-gateway-minimal-candidate|\/var\/lib\/proxy-gateway-minimal/);
  assert.match(source, /\{"schemaVersion": SCHEMA_VERSION, "type": REPORT_TYPE, "state": "blocked", "condition": value\}/);
  assert.match(source, /FORBIDDEN_OUTPUT_KEYS = \{[^}]*"host"[^}]*"token"[^}]*"uri"[^}]*\}/s);
});

test("Linux umask 077 cannot reduce the DEBIAN directory below 0755", {
  skip: process.platform !== "linux" || !existsSync("/usr/bin/python3")
}, () => {
  const probe = [
    "import importlib.util",
    "import json",
    "import os",
    "import pathlib",
    "import stat",
    "import sys",
    "import tempfile",
    "",
    "source = pathlib.Path(sys.argv[1])",
    "spec = importlib.util.spec_from_file_location('a3_clean_linux_harness', source)",
    "if spec is None or spec.loader is None:",
    "    raise SystemExit(2)",
    "module = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "module.os.chown = lambda *args, **kwargs: None",
    "",
    "def fake_command(argv, **kwargs):",
    "    pathlib.Path(argv[-1]).write_bytes(b'fixture')",
    "    return b''",
    "",
    "module.command = fake_command",
    "previous = os.umask(0o077)",
    "try:",
    "    with tempfile.TemporaryDirectory() as temporary:",
    "        root = pathlib.Path(temporary)",
    "        package_root = root / 'package'",
    "        destination = root / 'fixture.deb'",
    "        module.build_minimal_deb(package_root, destination, 'amd64')",
    "        mode = stat.S_IMODE((package_root / 'DEBIAN').stat().st_mode)",
    "finally:",
    "    os.umask(previous)",
    "",
    "error = json.loads(module.safe_error('fixture_failed'))",
    "print(json.dumps({",
    "    'controlMode': format(mode, '04o'),",
    "    'errorKeys': sorted(error),",
    "    'errorCondition': error['condition'],",
    "}, sort_keys=True, separators=(',', ':')))",
    ""
  ].join("\n");
  const result = spawnSync("/usr/bin/python3", ["-B", "-I", "-S", "-c", probe, HARNESS], {
    cwd: "/",
    encoding: "utf8",
    env: {
      PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
      LANG: "C",
      LC_ALL: "C"
    },
    timeout: 30_000,
    windowsHide: true
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    controlMode: "0755",
    errorCondition: "fixture_failed",
    errorKeys: ["condition", "schemaVersion", "state", "type"]
  });
});
