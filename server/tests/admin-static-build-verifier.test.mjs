import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyAdminBuildDirectory } from "../../scripts/verify-admin-build.mjs";

const ADMIN_RUNTIME_MARKERS = [
  "Admin Console",
  "/api/admin/overview",
  "/api/admin/platform/subscription-usage-monitor"
];

async function writeAdminFixture(directory, javascript) {
  await writeFile(
    path.join(directory, "index.html"),
    "<div id=\"root\"></div><script src=\"/assets/admin.js\"></script>"
  );
  await writeFile(path.join(directory, "admin.js"), javascript);
  await writeFile(path.join(directory, "admin.css"), ".admin-layout{}");
}

test("admin static build verifier accepts an Admin API shell", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(
      tempDir,
      ADMIN_RUNTIME_MARKERS.map((marker) => `fetch('${marker}');`).join(" ")
    );

    const summary = await verifyAdminBuildDirectory(tempDir);

    assert.equal(summary.status, "ok");
    assert.equal(summary.safety.hasAdminApiContract, true);
    assert.equal(summary.safety.noLegacyIdentity, true);
    assert.equal(summary.safety.noPrivateKeyMaterial, true);
    assert.equal(summary.safety.noSourceMaps, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("active Admin shell inputs use the current GCC WebOS identity", async () => {
  const activeInputs = [
    "../../admin/index.html",
    "../../admin/src/pages/admin-setup-page.tsx",
    "../../admin/src/components/layout/app-sidebar.tsx"
  ];

  for (const relativePath of activeInputs) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /GlobalCircle\s+AI/iu, relativePath);
    assert.match(source, /GCC WebOS/u, relativePath);
  }
});

test("admin static build verifier rejects the legacy product identity", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(
      tempDir,
      `${ADMIN_RUNTIME_MARKERS.join(" ")} GlobalCircle AI`
    );

    await assert.rejects(
      () => verifyAdminBuildDirectory(tempDir),
      /legacy identity marker/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("admin static build verifier rejects missing Admin API contracts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(tempDir, "fetch('/api/admin/overview');");

    await assert.rejects(
      () => verifyAdminBuildDirectory(tempDir),
      /admin runtime marker missing/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("admin static build verifier rejects private-key material", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(
      tempDir,
      `${ADMIN_RUNTIME_MARKERS.join(" ")} -----BEGIN PRIVATE KEY-----`
    );

    await assert.rejects(
      () => verifyAdminBuildDirectory(tempDir),
      /private key marker/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("admin static build verifier rejects private-key container files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(tempDir, ADMIN_RUNTIME_MARKERS.join(" "));
    await writeFile(path.join(tempDir, "unexpected.pem"), "not-a-public-artifact");

    await assert.rejects(
      () => verifyAdminBuildDirectory(tempDir),
      /private key container/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("admin static build verifier scans every file for private-key markers", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(tempDir, ADMIN_RUNTIME_MARKERS.join(" "));
    await writeFile(
      path.join(tempDir, "unexpected.bin"),
      "-----BEGIN ENCRYPTED PRIVATE KEY-----"
    );

    await assert.rejects(
      () => verifyAdminBuildDirectory(tempDir),
      /private key marker/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("admin static build verifier rejects source maps", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(tempDir, ADMIN_RUNTIME_MARKERS.join(" "));
    await writeFile(path.join(tempDir, "admin.js.map"), "{}");

    await assert.rejects(
      () => verifyAdminBuildDirectory(tempDir),
      /source map/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("admin static build verifier rejects uppercase source-map files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(tempDir, ADMIN_RUNTIME_MARKERS.join(" "));
    await writeFile(path.join(tempDir, "admin.js.MAP"), "{}");

    await assert.rejects(
      () => verifyAdminBuildDirectory(tempDir),
      /source map/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("admin static build verifier rejects inline source maps", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(
      tempDir,
      `${ADMIN_RUNTIME_MARKERS.join(" ")}\n//# sourceMappingURL=data:application/json;base64,e30=`
    );

    await assert.rejects(
      () => verifyAdminBuildDirectory(tempDir),
      /source map directive/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
