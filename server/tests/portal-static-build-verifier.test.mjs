import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyPortalBuildDirectory } from "../../scripts/verify-portal-build.mjs";

const PORTAL_RUNTIME_MARKERS = [
  "/portal/register",
  "/api/portal/human-challenges",
  "/api/portal/password/session",
  "/api/portal/registration",
  "/api/portal/registration/email-verification"
];

async function writePortalFixture(directory, {
  javascript = "",
  stylesheet = "",
  runtimeMarkers = PORTAL_RUNTIME_MARKERS,
  javascriptCommerceMarkers = [
    "portal-commerce-layout",
    "portal-coins-wallet-entry"
  ],
  stylesheetCommerceMarkers = [
    "portal-commerce-layout",
    "portal-coins-wallet-entry"
  ]
} = {}) {
  await writeFile(
    path.join(directory, "index.html"),
    "<div id=\"root\"></div><script src=\"/assets/portal.js\"></script>"
  );
  await writeFile(
    path.join(directory, "portal.js"),
    [
      ...runtimeMarkers,
      ...javascriptCommerceMarkers,
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

test("portal static build verifier accepts the Portal commerce shell without Recharge UI", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir);

    const summary = await verifyPortalBuildDirectory(tempDir);

    assert.equal(summary.status, "ok");
    assert.equal(summary.safety.hasCommerceLayoutContract, true);
    assert.equal(summary.safety.noRechargeUi, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects Recharge UI in JavaScript", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, {
      javascript: "portal-recharge-dialog"
    });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /forbidden commerce marker found: portal-recharge-dialog/
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

test("portal static build verifier rejects a missing wallet entry from JavaScript", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writePortalFixture(tempDir, {
      javascriptCommerceMarkers: ["portal-commerce-layout"]
    });

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      (error) => {
        assert.match(
          error.message,
          /portal commerce layout marker missing: portal-coins-wallet-entry/
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
