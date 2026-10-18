import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyAdminBuildDirectory } from "../../scripts/verify-admin-build.mjs";

const ADMIN_RUNTIME_MARKERS = [
  "FlinkVPN",
  "Admin Console",
  "/api/admin-auth/session",
  "/api/admin-auth/login",
  "/api/admin-auth/totp/verify",
  "/api/admin-auth/logout",
  "/api/admin/platform/user-monitor",
  "/api/admin/platform/accounts",
  "/api/admin/platform/entitlements",
  "/api/admin/platform/subscription-usage-monitor",
  "/api/admin/platform/traffic-collector-status"
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

test("active Admin shell inputs use the current FlinkVPN identity", async () => {
  const activeInputs = [
    {
      expectedIdentity: "FlinkVPN operator console for user operations and platform monitoring.",
      relativePath: "../../admin/index.html"
    },
    {
      expectedIdentity: "FlinkVPN",
      relativePath: "../../admin/src/pages/admin-setup-page.tsx"
    },
    {
      expectedIdentity: "FlinkVPN",
      relativePath: "../../admin/src/components/layout/app-sidebar.tsx"
    }
  ];

  for (const { expectedIdentity, relativePath } of activeInputs) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /GlobalCircle\s+AI/iu, relativePath);
    assert.ok(source.includes(expectedIdentity), relativePath);
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
    await writeAdminFixture(tempDir, "fetch('/api/admin-auth/session');");

    await assert.rejects(
      () => verifyAdminBuildDirectory(tempDir),
      /admin runtime marker missing/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("admin static build verifier accepts the ten-page shell contract without overview", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(
      tempDir,
      ADMIN_RUNTIME_MARKERS.map((marker) => `fetch('${marker}');`).join(" ")
    );

    const summary = await verifyAdminBuildDirectory(tempDir);
    assert.equal(summary.status, "ok");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

for (const marker of ADMIN_RUNTIME_MARKERS) {
  test(`admin static build verifier rejects missing runtime marker ${marker}`, async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
    try {
      const remaining = ADMIN_RUNTIME_MARKERS.filter((item) => item !== marker);
      await writeAdminFixture(
        tempDir,
        remaining.map((item) => `fetch('${item}');`).join(" ")
      );

      await assert.rejects(
        () => verifyAdminBuildDirectory(tempDir),
        new RegExp(`admin runtime marker missing: ${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
}

test("admin static build verifier rejects old-shell-only overview contract", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
  try {
    await writeAdminFixture(
      tempDir,
      "Admin Console /api/admin/overview /api/admin/platform/subscription-usage-monitor"
    );

    await assert.rejects(
      () => verifyAdminBuildDirectory(tempDir),
      /admin runtime marker missing/
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

const LOCAL_ONLY_PAYLOAD_MARKERS = [
  "本地候选 · 只读监控",
  "Admin 本地验收",
  "GCC-104 safe fixture preview",
  "admin-fixture-preview/v1"
];

for (const marker of LOCAL_ONLY_PAYLOAD_MARKERS) {
  test(`admin static build verifier rejects local-only payload marker ${marker}`, async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "admin-build-"));
    try {
      await writeAdminFixture(
        tempDir,
        `${ADMIN_RUNTIME_MARKERS.join(" ")} ${marker}`
      );

      await assert.rejects(
        () => verifyAdminBuildDirectory(tempDir),
        /local-only payload marker/
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
}

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
