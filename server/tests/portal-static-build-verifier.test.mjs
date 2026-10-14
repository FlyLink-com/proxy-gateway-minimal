import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyPortalBuildDirectory } from "../../scripts/verify-portal-build.mjs";

const PORTAL_RUNTIME_MARKERS = [
  "/portal/register",
  "/api/portal/human-challenges",
  "/api/portal/password/session",
  "/api/portal/registration",
  "/api/portal/registration/email-verification",
  "/api/portal/coins/recharge/offers",
  "/api/portal/coins/recharge/orders"
];

async function writePortalFixture(directory, {
  javascript = "",
  stylesheet = "",
  runtimeMarkers = PORTAL_RUNTIME_MARKERS,
  javascriptCommerceMarkers = [
    "portal-commerce-layout",
    "portal-wallet-nav-balance",
    "portal-v2-global-search-form",
    "portal-v2-settings-preference-grid",
    "portal-recharge-dialog"
  ],
  stylesheetCommerceMarkers = [
    "portal-commerce-layout",
    "portal-v2-global-search-form",
    "portal-v2-settings-preference-grid",
    "portal-recharge-dialog"
  ],
  rechargeConfig = {},
  runtimeRechargeConfig = rechargeConfig,
  runtimeRechargeDigest
} = {}) {
  const canonicalRechargeConfig = JSON.stringify(rechargeConfig);
  const canonicalRuntimeRechargeConfig = JSON.stringify(runtimeRechargeConfig);
  const runtimeRechargeConfigSha256 = createHash("sha256")
    .update(canonicalRuntimeRechargeConfig)
    .digest("hex");
  const runtimeRechargeBinding = [
    "portal-recharge-config-v1",
    runtimeRechargeConfigSha256,
    Buffer.from(canonicalRuntimeRechargeConfig, "utf8").toString("base64")
  ].join(".");
  await writeFile(
    path.join(directory, "index.html"),
    "<div id=\"root\"></div><script src=\"/assets/portal.js\"></script>"
  );
  await writeFile(
    path.join(directory, "portal.js"),
    [
      ...runtimeMarkers,
      ...javascriptCommerceMarkers,
      runtimeRechargeDigest ?? runtimeRechargeConfigSha256,
      runtimeRechargeBinding,
      javascript
    ].join(" ")
  );
  await writeFile(
    path.join(directory, "portal.css"),
    [
      ...stylesheetCommerceMarkers.map((marker) => `.${marker}{}`),
      stylesheet
    ].join("\n")
  );
  await writeFile(
    path.join(directory, "portal-recharge-config.json"),
    `${JSON.stringify({
      schemaVersion: "1",
      sha256: createHash("sha256").update(canonicalRechargeConfig).digest("hex"),
      trustedActionOriginsByAdapter: rechargeConfig
    }, null, 2)}\n`
  );
}

test("portal static build verifier rejects bundles that expose Admin shell markers", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, {
      javascript: "Portal Requests AdminLayout Open user portal"
    });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /admin shell marker/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier accepts the Portal commerce shell with protected Recharge UI", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir);

    const summary = await verifyPortalBuildDirectory(tempDir);

    assert.equal(summary.status, "ok");
    assert.equal(summary.safety.noLegacyIdentity, true);
    assert.equal(summary.safety.hasCommerceLayoutContract, true);
    assert.equal(summary.safety.hasProtectedRechargeContract, true);
    assert.equal(summary.safety.hasRechargeConfigIdentity, true);
    assert.deepEqual(summary.rechargeConfigIdentity.configuredAdapters, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("active Portal metadata uses the current FlinkVPN identity", async () => {
  const source = await readFile(
    new URL("../../admin/portal/index.html", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /GlobalCircle\s+AI/iu);
  assert.ok(source.includes(
    "FlinkVPN (飞连VPN) customer portal for subscription orders, support, and account security."
  ));
});

test("portal static build verifier rejects the legacy product identity", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, { javascript: "GlobalCircle AI" });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /legacy identity marker/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects a Recharge identity not bound to runtime JavaScript", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    const rechargeConfig = {
      xsd_v1: ["https://cashier.example.invalid"]
    };
    const rechargeConfigSha256 = createHash("sha256")
      .update(JSON.stringify(rechargeConfig))
      .digest("hex");
    await writePortalFixture(tempDir, {
      rechargeConfig,
      runtimeRechargeConfig: {},
      runtimeRechargeDigest: rechargeConfigSha256
    });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /portal recharge config runtime binding missing/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects a tampered Recharge config identity", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, {
      rechargeConfig: {
        xsd_v1: ["https://cashier.example.invalid"]
      }
    });
    const configPath = path.join(tempDir, "portal-recharge-config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.sha256 = "0".repeat(64);
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /portal recharge config identity invalid/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects legacy Recharge UI in JavaScript", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, {
      javascript: "portal-recharge-denominations"
    });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /forbidden commerce marker found: portal-recharge-denominations/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects Recharge UI in CSS", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, {
      stylesheet: ".portal-recharge-entry{}"
    });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /forbidden commerce marker found: portal-recharge-entry/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects bundles without commerce layout markers", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, {
      javascriptCommerceMarkers: [],
      stylesheetCommerceMarkers: []
    });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /portal commerce layout marker missing/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects commerce markers missing from CSS", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, {
      stylesheetCommerceMarkers: []
    });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      (error) => {
        assert.match(error.message, /portal commerce layout marker missing/);
        assert.match(error.message, /CSS/);
        return true;
      }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects a missing Wallet navigation integration from JavaScript", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, {
      javascriptCommerceMarkers: [
        "portal-commerce-layout",
        "portal-v2-global-search-form",
        "portal-v2-settings-preference-grid",
        "portal-recharge-dialog"
      ]
    });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      (error) => {
        assert.match(
          error.message,
          /portal commerce layout marker missing: portal-wallet-nav-balance/
        );
        assert.match(error.message, /HTML\/JavaScript/);
        return true;
      }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects bundles without backend human challenge wiring", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, {
      runtimeMarkers: PORTAL_RUNTIME_MARKERS.filter(
        (marker) => marker !== "/api/portal/human-challenges"
      )
    });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /portal runtime marker missing/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Portal artifact workflow binds an explicit public Recharge config input", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/release-artifact.yml", import.meta.url),
    "utf8"
  );

  assert.match(
    workflow,
    /portal_recharge_trusted_action_origins_json:[\s\S]*?description: Public HTTPS origins JSON for Portal Recharge redirects\./u
  );
  assert.match(
    workflow,
    /Build Portal static[\s\S]*?VITE_PORTAL_RECHARGE_TRUSTED_ACTION_ORIGINS_JSON: \$\{\{ inputs\.portal_recharge_trusted_action_origins_json \|\| '' \}\}/u
  );
});
