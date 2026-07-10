import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(TEST_DIRECTORY, "../../scripts/generate-runtime-identity.mjs");
const SCHEMA_PATH = resolve(
  TEST_DIRECTORY,
  "../../schemas/runtime-config-identity-v1.schema.json"
);
const FIXTURE_DIRECTORY = resolve(
  TEST_DIRECTORY,
  "fixtures/runtime-config-identity/japan"
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadRuntimeIdentityModule() {
  return import("../../scripts/generate-runtime-identity.mjs");
}

test("creates a deterministic minimal runtime-config identity", async () => {
  const { createRuntimeConfigIdentity } = await loadRuntimeIdentityModule();
  const xrayBytes = readFileSync(resolve(FIXTURE_DIRECTORY, "xray-config.sample"));
  const mihomoBytes = readFileSync(resolve(FIXTURE_DIRECTORY, "mihomo-config.sample"));
  const input = {
    releaseUnit: "japan-runtime-config",
    observedAt: "2026-07-10T10:00:00Z",
    components: [
      { name: "xray-config", bytes: xrayBytes },
      { name: "mihomo-config", bytes: mihomoBytes }
    ]
  };

  const manifest = createRuntimeConfigIdentity(input);
  const reorderedManifest = createRuntimeConfigIdentity({
    ...input,
    components: [...input.components].reverse()
  });

  assert.deepEqual(manifest, {
    schemaVersion: "1",
    releaseUnit: "japan-runtime-config",
    observedAt: "2026-07-10T10:00:00.000Z",
    components: [
      { name: "mihomo-config", sha256: sha256(mihomoBytes) },
      { name: "xray-config", sha256: sha256(xrayBytes) }
    ]
  });
  assert.deepEqual(reorderedManifest, manifest);

  const serialized = JSON.stringify(manifest);
  assert.equal(serialized.includes(FIXTURE_DIRECTORY), false);
  assert.equal(serialized.includes("synthetic runtime fixture"), false);
});

test("accepts only the two runtime-config release units", async () => {
  const {
    RUNTIME_IDENTITY_RELEASE_UNITS,
    createRuntimeConfigIdentity
  } = await loadRuntimeIdentityModule();
  const baseInput = {
    observedAt: "2026-07-10T10:00:00Z",
    components: [{ name: "xray-config", bytes: Buffer.from("synthetic") }]
  };

  assert.deepEqual([...RUNTIME_IDENTITY_RELEASE_UNITS], [
    "japan-runtime-config",
    "sgp-runtime-config"
  ]);
  assert.equal(
    createRuntimeConfigIdentity({
      ...baseInput,
      releaseUnit: "sgp-runtime-config"
    }).releaseUnit,
    "sgp-runtime-config"
  );
  assert.throws(
    () => createRuntimeConfigIdentity({
      ...baseInput,
      releaseUnit: "control-plane-app"
    }),
    /runtime_identity_release_unit_invalid/
  );
});

test("requires an explicit valid observation timestamp", async () => {
  const { createRuntimeConfigIdentity } = await loadRuntimeIdentityModule();
  const baseInput = {
    releaseUnit: "japan-runtime-config",
    components: [{ name: "xray-config", bytes: Buffer.from("synthetic") }]
  };

  assert.throws(
    () => createRuntimeConfigIdentity(baseInput),
    /runtime_identity_observed_at_invalid/
  );
  assert.throws(
    () => createRuntimeConfigIdentity({ ...baseInput, observedAt: "not-a-timestamp" }),
    /runtime_identity_observed_at_invalid/
  );
});

test("requires a non-empty component list", async () => {
  const { createRuntimeConfigIdentity } = await loadRuntimeIdentityModule();
  const baseInput = {
    releaseUnit: "japan-runtime-config",
    observedAt: "2026-07-10T10:00:00Z"
  };

  for (const components of [undefined, null, {}, []]) {
    assert.throws(
      () => createRuntimeConfigIdentity({ ...baseInput, components }),
      /runtime_identity_components_invalid/
    );
  }
});

test("accepts only portable logical component names", async () => {
  const { createRuntimeConfigIdentity } = await loadRuntimeIdentityModule();
  const baseInput = {
    releaseUnit: "japan-runtime-config",
    observedAt: "2026-07-10T10:00:00Z"
  };
  const invalidNames = [
    "",
    "XrayConfig",
    "xray_config",
    "xray config",
    "../xray-config",
    "xray--config",
    "a".repeat(81)
  ];

  for (const name of invalidNames) {
    assert.throws(
      () => createRuntimeConfigIdentity({
        ...baseInput,
        components: [{ name, bytes: Buffer.from("synthetic") }]
      }),
      /runtime_identity_component_name_invalid/
    );
  }
});

test("rejects duplicate logical component names", async () => {
  const { createRuntimeConfigIdentity } = await loadRuntimeIdentityModule();

  assert.throws(
    () => createRuntimeConfigIdentity({
      releaseUnit: "japan-runtime-config",
      observedAt: "2026-07-10T10:00:00Z",
      components: [
        { name: "xray-config", bytes: Buffer.from("first") },
        { name: "xray-config", bytes: Buffer.from("second") }
      ]
    }),
    /runtime_identity_component_duplicate/
  );
});

test("hashes only explicit component bytes", async () => {
  const { createRuntimeConfigIdentity } = await loadRuntimeIdentityModule();
  const baseInput = {
    releaseUnit: "japan-runtime-config",
    observedAt: "2026-07-10T10:00:00Z"
  };

  for (const bytes of [undefined, null, "synthetic", {}]) {
    assert.throws(
      () => createRuntimeConfigIdentity({
        ...baseInput,
        components: [{ name: "xray-config", bytes }]
      }),
      /runtime_identity_component_bytes_invalid/
    );
  }

  assert.doesNotThrow(() => createRuntimeConfigIdentity({
    ...baseInput,
    components: [{ name: "xray-config", bytes: new Uint8Array() }]
  }));
});

test("CLI writes a path-free identity from local component files", async (t) => {
  const {
    createRuntimeConfigIdentity,
    runRuntimeIdentityCli
  } = await loadRuntimeIdentityModule();
  const directory = mkdtempSync(join(tmpdir(), "gccgw-runtime-identity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const xrayPath = resolve(FIXTURE_DIRECTORY, "xray-config.sample");
  const mihomoPath = resolve(FIXTURE_DIRECTORY, "mihomo-config.sample");
  const outputPath = join(directory, "runtime-identity.json");
  let stdout = "";
  let stderr = "";

  const exitCode = runRuntimeIdentityCli({
    argv: [
      "--release-unit", "japan-runtime-config",
      "--observed-at", "2026-07-10T10:00:00Z",
      "--component", `xray-config=${xrayPath}`,
      "--component", `mihomo-config=${mihomoPath}`,
      "--output", outputPath
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.deepEqual(
    JSON.parse(readFileSync(outputPath, "utf8")),
    createRuntimeConfigIdentity({
      releaseUnit: "japan-runtime-config",
      observedAt: "2026-07-10T10:00:00Z",
      components: [
        { name: "xray-config", bytes: readFileSync(xrayPath) },
        { name: "mihomo-config", bytes: readFileSync(mihomoPath) }
      ]
    })
  );
  assert.deepEqual(JSON.parse(stdout), {
    type: "runtime_identity_generation",
    ok: true,
    releaseUnit: "japan-runtime-config",
    componentCount: 2,
    outputFile: basename(outputPath)
  });
  assert.equal(stdout.includes(directory), false);
  assert.equal(stdout.includes(FIXTURE_DIRECTORY), false);
  assert.equal(stdout.includes("synthetic runtime fixture"), false);
});

test("CLI never overwrites an input component", async (t) => {
  const { runRuntimeIdentityCli } = await loadRuntimeIdentityModule();
  const directory = mkdtempSync(join(tmpdir(), "gccgw-runtime-identity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const componentPath = join(directory, "xray-config.sample");
  const componentBytes = Buffer.from("synthetic component bytes");
  writeFileSync(componentPath, componentBytes);
  let stdout = "";
  let stderr = "";

  const exitCode = runRuntimeIdentityCli({
    argv: [
      "--release-unit", "japan-runtime-config",
      "--observed-at", "2026-07-10T10:00:00Z",
      "--component", `xray-config=${componentPath}`,
      "--output", componentPath
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.deepEqual(readFileSync(componentPath), componentBytes);
  assert.deepEqual(JSON.parse(stderr), {
    type: "runtime_identity_generation",
    ok: false,
    error: "runtime_identity_generation_failed"
  });
  assert.equal(stderr.includes(directory), false);
  assert.equal(stderr.includes("synthetic component bytes"), false);
});

test("script executes the runtime identity CLI directly", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gccgw-runtime-identity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const xrayPath = resolve(FIXTURE_DIRECTORY, "xray-config.sample");
  const outputPath = join(directory, "runtime-identity.json");

  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    "--release-unit", "japan-runtime-config",
    "--observed-at", "2026-07-10T10:00:00Z",
    "--component", `xray-config=${xrayPath}`,
    "--output", outputPath
  ], {
    cwd: resolve(TEST_DIRECTORY, "../.."),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(readFileSync(outputPath, "utf8")).components.length, 1);
  assert.equal(JSON.parse(result.stdout).ok, true);
  assert.equal(result.stdout.includes(directory), false);
  assert.equal(result.stdout.includes(FIXTURE_DIRECTORY), false);
});

test("schema freezes the minimal runtime-config identity output", () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const componentSchema = schema.properties.components.items;

  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "schemaVersion",
    "releaseUnit",
    "observedAt",
    "components"
  ]);
  assert.deepEqual(schema.properties.schemaVersion, { const: "1" });
  assert.deepEqual(schema.properties.releaseUnit.enum, [
    "japan-runtime-config",
    "sgp-runtime-config"
  ]);
  assert.equal(schema.properties.components.minItems, 1);
  assert.equal(componentSchema.additionalProperties, false);
  assert.deepEqual(componentSchema.required, ["name", "sha256"]);
  assert.deepEqual(Object.keys(componentSchema.properties), ["name", "sha256"]);

  const outputPropertyNames = Object.keys(schema.properties)
    .concat(Object.keys(componentSchema.properties));
  assert.deepEqual(outputPropertyNames, [
    "schemaVersion",
    "releaseUnit",
    "observedAt",
    "components",
    "name",
    "sha256"
  ]);
});
