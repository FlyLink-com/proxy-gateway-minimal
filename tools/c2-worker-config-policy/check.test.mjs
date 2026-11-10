// Self-tests for the C2 Worker configuration drift check.
// Run from the repository root: node --test tools/c2-worker-config-policy/check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const checker = join(here, "check.mjs");
const policyFile = join(here, "policy.json");

const REAL_FILES = [
  "workers/crypto/wrangler.crypto.jsonc",
  "workers/control-plane/wrangler.control-plane.jsonc",
  "wrangler.jsonc",
  "wrangler.public-site.jsonc",
];

function fixture(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "c2-policy-"));
  const contents = {};
  for (const relPath of REAL_FILES) {
    contents[relPath] = readFileSync(join(repoRoot, relPath), "utf8");
  }
  if (mutate) mutate(contents);
  for (const [relPath, text] of Object.entries(contents)) {
    if (text === null) continue;
    const dest = join(dir, relPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, text);
  }
  return dir;
}

function run(dir) {
  try {
    const stdout = execFileSync(process.execPath, [checker, "--root", dir, "--policy", policyFile], { encoding: "utf8" });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status ?? 1, stdout: String(e.stdout ?? "") };
  }
}

function withFixture(mutate, fn) {
  const dir = fixture(mutate);
  try { fn(run(dir)); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("baseline repository configurations conform", () => {
  withFixture(null, ({ code, stdout }) => {
    assert.equal(code, 0, stdout);
    assert.match(stdout, /C2_POLICY_CHECK: PASS/);
  });
});

test("crypto worker gaining an R2 binding fails", () => {
  withFixture((c) => {
    c["workers/crypto/wrangler.crypto.jsonc"] = c["workers/crypto/wrangler.crypto.jsonc"].replace(
      '"preview_urls": false',
      '"preview_urls": false,\n  "r2_buckets": [{ "binding": "X", "bucket_name": "some-bucket" }]'
    );
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /r2_buckets/);
  });
});

test("crypto worker workers_dev flip fails", () => {
  withFixture((c) => {
    c["workers/crypto/wrangler.crypto.jsonc"] = c["workers/crypto/wrangler.crypto.jsonc"].replace(
      '"workers_dev": false', '"workers_dev": true'
    );
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /workers_dev/);
  });
});

test("crypto worker gaining any account_id fails", () => {
  withFixture((c) => {
    c["workers/crypto/wrangler.crypto.jsonc"] = c["workers/crypto/wrangler.crypto.jsonc"].replace(
      '"name": "flylink-crypto-worker"',
      '"name": "flylink-crypto-worker",\n  "account_id": "17d66c001f9d851fa0d5a88cd311c2c0"'
    );
  }, ({ code }) => assert.equal(code, 1));
});

test("control-plane gaining the approved CRYPTO service binding passes (dormant permission)", () => {
  withFixture((c) => {
    c["workers/control-plane/wrangler.control-plane.jsonc"] = c["workers/control-plane/wrangler.control-plane.jsonc"].replace(
      '"compatibility_date": "2025-06-01",',
      '"compatibility_date": "2025-06-01",\n  "services": [{ "binding": "CRYPTO", "service": "flylink-crypto-worker" }],'
    );
  }, ({ code, stdout }) => assert.equal(code, 0, stdout));
});

test("control-plane gaining a rogue service binding fails", () => {
  withFixture((c) => {
    c["workers/control-plane/wrangler.control-plane.jsonc"] = c["workers/control-plane/wrangler.control-plane.jsonc"].replace(
      '"compatibility_date": "2025-06-01",',
      '"compatibility_date": "2025-06-01",\n  "services": [{ "binding": "OTHER", "service": "some-other-worker" }],'
    );
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /services/);
  });
});

test("control-plane binding the Domain A bucket fails", () => {
  withFixture((c) => {
    c["workers/control-plane/wrangler.control-plane.jsonc"] = c["workers/control-plane/wrangler.control-plane.jsonc"].replace(
      '"compatibility_date": "2025-06-01",',
      '"compatibility_date": "2025-06-01",\n  "r2_buckets": [{ "binding": "A", "bucket_name": "flylink-c2-custody-a" }],'
    );
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /flylink-c2-custody-a|r2_buckets/);
  });
});

test("control-plane gaining a second D1 database fails", () => {
  withFixture((c) => {
    c["workers/control-plane/wrangler.control-plane.jsonc"] = c["workers/control-plane/wrangler.control-plane.jsonc"].replace(
      '"migrations_dir": "migrations"',
      '"migrations_dir": "migrations"\n    },\n    {\n      "binding": "EXTRA_DB",\n      "database_name": "flylink-runtime-dev",\n      "migrations_dir": "migrations"'
    );
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /d1_databases/);
  });
});

test("Domain A account id appearing in any config fails; Primary account id passes", () => {
  withFixture((c) => {
    c["wrangler.jsonc"] = c["wrangler.jsonc"].replace(
      '"name": "proxy-gateway-minimal"',
      '"name": "proxy-gateway-minimal",\n  "account_id": "00f7acc72af9e3a2d9557d2bf67bc8ce"'
    );
  }, ({ code }) => assert.equal(code, 1));
  withFixture((c) => {
    c["wrangler.jsonc"] = c["wrangler.jsonc"].replace(
      '"name": "proxy-gateway-minimal"',
      '"name": "proxy-gateway-minimal",\n  "account_id": "17d66c001f9d851fa0d5a88cd311c2c0"'
    );
  }, ({ code, stdout }) => assert.equal(code, 0, stdout));
});

test("deleting an in-scope configuration fails", () => {
  withFixture((c) => { c["workers/crypto/wrangler.crypto.jsonc"] = null; }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /missing/);
  });
});
