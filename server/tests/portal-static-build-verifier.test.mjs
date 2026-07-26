import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyPortalBuildDirectory } from "../../scripts/verify-portal-build.mjs";

test("portal static build verifier rejects bundles that expose Admin shell markers", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writeFile(path.join(tempDir, "index.html"), "<div id=\"root\"></div><script src=\"/assets/index.js\"></script>");
    await writeFile(path.join(tempDir, "index.js"), "console.log('Portal Requests AdminLayout Open user portal');");
    await writeFile(path.join(tempDir, "index.css"), ".portal-auth-shell{}");

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /admin shell marker/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier accepts a portal-only shell", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writeFile(path.join(tempDir, "index.html"), "<div id=\"root\"></div><script src=\"/assets/portal.js\"></script>");
    await writeFile(
      path.join(tempDir, "portal.js"),
      "fetch('/api/portal/human-challenges'); fetch('/api/portal/password/session'); fetch('/api/portal/registration'); fetch('/api/portal/registration/email-verification'); console.log('/portal/register 账号登录 订阅管理 客服支持 个人中心 portal-commerce-layout portal-coins-wallet-entry portal-recharge-dialog');"
    );
    await writeFile(path.join(tempDir, "portal.css"), ".portal-auth-shell{} .portal-commerce-layout{} .portal-coins-wallet-entry{} .portal-recharge-dialog{}");

    const summary = await verifyPortalBuildDirectory(tempDir);

    assert.equal(summary.status, "ok");
    assert.equal(summary.safety.noAdminShellMarkers, true);
    assert.equal(summary.safety.noSecretMaterial, true);
    assert.equal(summary.safety.hasPortalHumanChallengeContract, true);
    assert.equal(summary.safety.hasPortalRegistrationContract, true);
    assert.equal(summary.safety.hasCommerceLayoutContract, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects bundles without commerce layout markers", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writeFile(path.join(tempDir, "index.html"), "<div id=\"root\"></div><script src=\"/assets/portal.js\"></script>");
    await writeFile(
      path.join(tempDir, "portal.js"),
      "fetch('/api/portal/human-challenges'); fetch('/api/portal/password/session'); fetch('/api/portal/registration'); fetch('/api/portal/registration/email-verification'); console.log('/portal/register 账号登录');"
    );
    await writeFile(path.join(tempDir, "portal.css"), ".portal-auth-shell{}");

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /portal commerce layout marker missing/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects a missing recharge dialog from HTML and JavaScript", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writeFile(path.join(tempDir, "index.html"), "<div id=\"root\"></div><script src=\"/assets/portal.js\"></script>");
    await writeFile(
      path.join(tempDir, "portal.js"),
      "fetch('/api/portal/human-challenges'); fetch('/api/portal/password/session'); fetch('/api/portal/registration'); fetch('/api/portal/registration/email-verification'); console.log('/portal/register portal-commerce-layout portal-coins-wallet-entry');"
    );
    await writeFile(path.join(tempDir, "portal.css"), ".portal-auth-shell{} .portal-commerce-layout{} .portal-coins-wallet-entry{} .portal-recharge-dialog{}");

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /portal commerce layout marker missing: portal-recharge-dialog/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("portal static build verifier rejects commerce markers missing from CSS", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writeFile(path.join(tempDir, "index.html"), "<div id=\"root\"></div><script src=\"/assets/portal.js\"></script>");
    await writeFile(
      path.join(tempDir, "portal.js"),
      "fetch('/api/portal/human-challenges'); fetch('/api/portal/password/session'); fetch('/api/portal/registration'); fetch('/api/portal/registration/email-verification'); console.log('/portal/register portal-commerce-layout portal-coins-wallet-entry');"
    );
    await writeFile(path.join(tempDir, "portal.css"), ".portal-auth-shell{}");

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

test("portal static build verifier rejects a missing wallet entry from HTML and JavaScript", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "portal-build-"));
  try {
    await writeFile(path.join(tempDir, "index.html"), "<div id=\"root\"></div><script src=\"/assets/portal.js\"></script>");
    await writeFile(
      path.join(tempDir, "portal.js"),
      "fetch('/api/portal/human-challenges'); fetch('/api/portal/password/session'); fetch('/api/portal/registration'); fetch('/api/portal/registration/email-verification'); console.log('/portal/register portal-commerce-layout');"
    );
    await writeFile(path.join(tempDir, "portal.css"), ".portal-auth-shell{} .portal-commerce-layout{} .portal-coins-wallet-entry{}");

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      (error) => {
        assert.match(error.message, /portal commerce layout marker missing: portal-coins-wallet-entry/);
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
    await writeFile(path.join(tempDir, "index.html"), "<div id=\"root\"></div><script src=\"/assets/portal.js\"></script>");
    await writeFile(path.join(tempDir, "portal.js"), "fetch('/api/portal/password/session'); fetch('/api/portal/registration'); fetch('/api/portal/registration/email-verification'); console.log('/portal/register 账号登录');");
    await writeFile(path.join(tempDir, "portal.css"), ".portal-auth-shell{}");

    await assert.rejects(
      () => verifyPortalBuildDirectory(tempDir),
      /portal runtime marker missing/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
