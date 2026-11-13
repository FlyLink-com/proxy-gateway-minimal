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

test("D1 binding with an extra database_id fails closed", () => {
  withFixture((c) => {
    c["workers/control-plane/wrangler.control-plane.jsonc"] = c["workers/control-plane/wrangler.control-plane.jsonc"].replace(
      '"database_name": "flylink-control-dev",',
      '"database_name": "flylink-control-dev",\n      "database_id": "11111111-1111-4111-8111-111111111111",'
    );
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /d1_databases.*exactly match/);
  });
});

test("approved service binding with an extra entrypoint fails closed", () => {
  withFixture((c) => {
    c["workers/control-plane/wrangler.control-plane.jsonc"] = c["workers/control-plane/wrangler.control-plane.jsonc"].replace(
      '"compatibility_date": "2025-06-01",',
      '"compatibility_date": "2025-06-01",\n  "services": [{ "binding": "CRYPTO", "service": "flylink-crypto-worker", "entrypoint": "Unexpected" }],'
    );
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /services.*exactly match/);
  });
});


test("control-plane exact local ADMIN_AUTH_STATE and PORTAL_AUTH_STATE bindings plus v1 and v2 migrations are allowed", () => {
  withFixture(null, ({ code, stdout }) => {
    assert.equal(code, 0, stdout);
    assert.match(stdout, /C2_POLICY_CHECK: PASS/);
  });
});

test("control-plane rejects any additional Durable Object binding", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace(
      '{ "name": "ADMIN_AUTH_STATE", "class_name": "AdminAuthState" }',
      '{ "name": "ADMIN_AUTH_STATE", "class_name": "AdminAuthState" },\n      { "name": "UNAPPROVED_STATE", "class_name": "UnapprovedState" }'
    );
    assert.notEqual(updated, original, "fixture must add an extra Durable Object binding");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /"durable_objects" must exactly match/);
  });
});

test("control-plane rejects a renamed Durable Object binding", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace('"name": "ADMIN_AUTH_STATE"', '"name": "OTHER_STATE"');
    assert.notEqual(updated, original, "fixture must rename the Durable Object binding");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /"durable_objects" must exactly match/);
  });
});

test("control-plane rejects a different Durable Object class", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace('"class_name": "AdminAuthState"', '"class_name": "OtherClass"');
    assert.notEqual(updated, original, "fixture must change the Durable Object class");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /"durable_objects" must exactly match/);
  });
});

test("control-plane rejects extra Durable Object binding fields", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace(
      '"class_name": "AdminAuthState"',
      '"class_name": "AdminAuthState", "script_name": "other-worker"'
    );
    assert.notEqual(updated, original, "fixture must add an unapproved Durable Object field");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /"durable_objects" must exactly match/);
  });
});

test("control-plane rejects a changed Durable Object migration tag", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace('"tag": "v1-admin-auth-state"', '"tag": "v2-unapproved"');
    assert.notEqual(updated, original, "fixture must change the migration tag");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /"migrations" must exactly match/);
  });
});

test("control-plane rejects an additional Durable Object migration", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace(
      '{ "tag": "v1-admin-auth-state", "new_sqlite_classes": ["AdminAuthState"] }',
      '{ "tag": "v1-admin-auth-state", "new_sqlite_classes": ["AdminAuthState"] },\n    { "tag": "v2-extra", "new_sqlite_classes": ["ExtraClass"] }'
    );
    assert.notEqual(updated, original, "fixture must add an extra migration");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /"migrations" must exactly match/);
  });
});

test("control-plane rejects additional classes in the approved migration", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace(
      '"new_sqlite_classes": ["AdminAuthState"]',
      '"new_sqlite_classes": ["AdminAuthState", "ExtraClass"]'
    );
    assert.notEqual(updated, original, "fixture must add an extra migrated class");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /"migrations" must exactly match/);
  });
});

test("control-plane requires the approved Durable Object declaration", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace(
      /  "durable_objects": \{\n    "bindings": \[\n      \{ "name": "ADMIN_AUTH_STATE", "class_name": "AdminAuthState" \},\n      \{ "name": "PORTAL_AUTH_STATE", "class_name": "PortalAuthState" \}\n    \]\n  \},\n/,
      ""
    );
    assert.notEqual(updated, original, "fixture must remove the Durable Object declaration");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /"durable_objects" must exactly match/);
  });
});

test("control-plane requires the approved Durable Object migration", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace(
      /  "migrations": \[\n    \{ "tag": "v1-admin-auth-state", "new_sqlite_classes": \["AdminAuthState"\] \},\n    \{ "tag": "v2-portal-auth-state", "new_sqlite_classes": \["PortalAuthState"\] \}\n  \],\n/,
      ""
    );
    assert.notEqual(updated, original, "fixture must remove the migration declaration");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /"migrations" must exactly match/);
  });
});

test("TOML top-level account_id outside the allowlist fails", () => {
  withFixture((c) => {
    c["workers/crypto/wrangler.extra.toml"] = 'name = "extra-worker"\naccount_id = "22222222222222222222222222222222"\n';
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /top-level account_id is not an allowed account/);
  });
});

test("TOML top-level Primary account_id passes and nested account_id is not a deploy target", () => {
  withFixture((c) => {
    c["workers/crypto/wrangler.extra.toml"] = 'name = "extra-worker"\naccount_id = "17d66c001f9d851fa0d5a88cd311c2c0" # approved\n[vars]\naccount_id = "not-a-deploy-target"\n';
  }, ({ code, stdout }) => assert.equal(code, 0, stdout));
});

test("deleting an in-scope configuration fails", () => {
  withFixture((c) => { c["workers/crypto/wrangler.crypto.jsonc"] = null; }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /missing/);
  });
});


test("quoted TOML top-level account_id keys are subject to the allowlist", () => {
  for (const key of ['"account_id"', "'account_id'"]) {
    withFixture((c) => {
      c["workers/crypto/wrangler.extra.toml"] =
        key + ' = "22222222222222222222222222222222"\n';
    }, ({ code, stdout }) => {
      assert.equal(code, 1);
      assert.match(stdout, /top-level account_id is not an allowed account/);
    });
  }
});

test("quoted TOML Primary account_id passes and quoted nested account_id is ignored", () => {
  withFixture((c) => {
    c["workers/crypto/wrangler.extra.toml"] =
      '"account_id" = "17d66c001f9d851fa0d5a88cd311c2c0" # approved\n' +
      "[vars]\n" +
      "'account_id' = \"not-a-deploy-target\"\n";
  }, ({ code, stdout }) => assert.equal(code, 0, stdout));
});

test("JSONC trailing commas are parsed and checked", () => {
  withFixture((c) => {
    const original = c["wrangler.jsonc"];
    const updated = original.replace("  }\n}", "  },\n}");
    assert.notEqual(updated, original, "fixture must add a trailing comma");
    c["wrangler.jsonc"] = updated;
  }, ({ code, stdout }) => assert.equal(code, 0, stdout));
});

test("malformed out-of-scope Wrangler JSONC fails closed", () => {
  withFixture((c) => {
    c["wrangler.public-site.jsonc"] = '{\n  "name": "broken",\n';
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /wrangler\.public-site\.jsonc: configuration does not parse/);
  });
});


test("control-plane removing the required CONTROL_DB section fails", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace(
      /  "d1_databases": \[\s*\{\s*"binding": "CONTROL_DB",\s*"database_name": "flylink-control-dev",\s*"migrations_dir": "migrations"\s*\}\s*\]/,
      ""
    );
    assert.notEqual(updated, original, "fixture must remove the required D1 section");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /d1_databases.*required binding/);
  });
});

test("control-plane removing the required CONTROL_DB entry fails", () => {
  withFixture((c) => {
    const path = "workers/control-plane/wrangler.control-plane.jsonc";
    const original = c[path];
    const updated = original.replace(
      /"d1_databases": \[\s*\{[\s\S]*?\}\s*\]/,
      '"d1_databases": []'
    );
    assert.notEqual(updated, original, "fixture must remove the required D1 entry");
    c[path] = updated;
  }, ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /d1_databases.*required binding/);
  });
});
