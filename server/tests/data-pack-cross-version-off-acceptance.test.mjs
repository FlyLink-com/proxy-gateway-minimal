import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, symlinkSync, unlinkSync, writeFileSync
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

// Explicit local source-compatibility acceptance, not a production rollback
// binary test. The BWH mixed release is NOT this old master. Default/archived
// runners need neither Git history nor tar and must not report this as passed.
const OLD_SOURCE = "742459d11aa15d9061e7dafe4ab584a5c72dbaf1";
const ENABLED = process.env.DATA_PACK_CROSS_VERSION_ACCEPTANCE === "1";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ACCOUNT = "account_cross_version_off";
const ENTITLEMENT = "entitlement_cross_version_monthly";
const REQUEST = "request_cross_version_monthly";
const NOW = "2026-10-15T00:00:00.000Z";
const PACK_TABLES = [
  "platform_data_pack_resources", "platform_data_pack_artifact_rotations",
  "platform_data_pack_edge_credentials", "platform_data_pack_credential_resets"
];
const PACK_OBJECTS = [...PACK_TABLES,
  "platform_data_pack_resources_account_idx",
  "platform_data_pack_rotation_pending_idx",
  "platform_data_pack_edge_active_request_idx",
  "platform_data_pack_credential_reset_pending_idx"
].sort();

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 30000 });
}

async function moduleAt(root, path) {
  return import(pathToFileURL(join(root, path)).href);
}

async function reservePort() {
  const server = createServer();
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done, fail) => server.close((error) => error ? fail(error) : done()));
  return port;
}

function readDatabase(path, read) {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try { return read(database); } finally { database.close(); }
}

function inventory(path) {
  return readDatabase(path, (database) => {
    const schema = database.prepare(`select type, name, tbl_name, sql from sqlite_master
      where name not like 'sqlite_%' order by type, name`).all();
    const legacy = schema.filter((row) => !PACK_TABLES.includes(row.tbl_name));
    const rows = legacy.filter((row) => row.type === "table").map((row) => {
      const name = row.name.replaceAll('"', '""');
      return [row.name, digest(database.prepare(`select * from "${name}"`).all()
        .map((value) => JSON.stringify(value)).sort())];
    });
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(database.pragma("foreign_key_check").length, 0);
    return { schemaDigest: digest(legacy), rowsDigest: digest(rows),
      packObjects: schema.filter((row) => PACK_TABLES.includes(row.tbl_name))
        .map((row) => row.name).sort() };
  });
}

function assertEmptyPacks(path) {
  readDatabase(path, (database) => {
    for (const table of PACK_TABLES) {
      assert.equal(database.prepare(`select count(*) from ${table}`).pluck().get(), 0);
    }
  });
}

function recordUsage(control, suffix, bytes) {
  control.recordUsageSample({
    id: `sample_cross_version_${suffix}`, sourceRef: `source_cross_version_${suffix}`,
    channelRef: "synthetic-node", edgeCredentialRef: `edge_cross_version_${suffix}`,
    accountId: ACCOUNT, entitlementId: ENTITLEMENT, requestId: REQUEST,
    observedAt: NOW, intervalStartedAt: "2026-10-14T23:59:00.000Z",
    intervalEndedAt: NOW, uploadBytes: bytes, downloadBytes: 0,
    sampleDigest: `digest_cross_version_${suffix}`, createdAt: NOW
  });
}

function credit(commerce, suffix, amountUnits) {
  commerce.walletStore.creditCoins({
    accountId: ACCOUNT, coinType: "paid_coins", amountUnits,
    availability: "available", sourceType: "synthetic_seed",
    sourceRef: `credit_cross_version_${suffix}`, sourceDigest: digest(suffix),
    policyRef: null, policyVersion: null, expiresAt: null,
    operation: { actorScope: "system:cross_version", idempotencyKey: `credit_${suffix}`,
      actorType: "system", actorRef: "cross_version_fixture" }
  });
}

function assertLegacyState(handle, { upgraded = false } = {}) {
  const { controlStore, coinCommerceStore } = handle.state.platform;
  assert.equal(controlStore.resolveAccountServiceEntitlement({
    accountId: ACCOUNT, now: NOW
  })?.id, ENTITLEMENT);
  assert.equal(controlStore.getUsageRollupByEdgeCredentialRef("edge_cross_version_old").totalBytes, 17);
  if (upgraded) {
    assert.equal(controlStore.getUsageRollupByEdgeCredentialRef("edge_cross_version_new").totalBytes, 23);
  }
  const offers = coinCommerceStore.listPublishedOffers({ accountId: ACCOUNT });
  assert.equal(offers.length, 3);
  assert.ok(offers.every((offer) => offer.category === "plan"));
}

test("explicit old-source -> pack-off -> old-source same-db compatibility (not production binary)", {
  skip: ENABLED ? false : "not executed: set DATA_PACK_CROSS_VERSION_ACCEPTANCE=1 with fixed Git history and tar",
  timeout: 120000
}, async (t) => {
  const currentSource = git(["rev-parse", "HEAD"]).trim();
  assert.equal(git(["rev-parse", `${OLD_SOURCE}^{commit}`]).trim(), OLD_SOURCE);
  for (const name of ["package.json", "package-lock.json"]) {
    // CRLF conversion is the only allowed difference in the checked-out files.
    const old = git(["show", `${OLD_SOURCE}:${name}`]).replaceAll("\r\n", "\n");
    assert.equal(digest(old), digest(git(["show", `${currentSource}:${name}`])
      .replaceAll("\r\n", "\n")), `${name} differs across versions`);
    assert.equal(digest(old), digest(readFileSync(join(ROOT, name), "utf8")
      .replaceAll("\r\n", "\n")), `${name} has unverified local changes`);
  }
  t.diagnostic(`old_source=${OLD_SOURCE}; candidate_source=${currentSource}; node=${process.version}; abi=${process.versions.modules}; dependencies=identical-lock-shared-local`);
  const directory = mkdtempSync(join(tmpdir(), "data-pack-cross-version-off-"));
  const oldRoot = join(directory, "old-source");
  const runtimeRoot = join(directory, "runtime");
  const dependencyLink = join(oldRoot, "node_modules");
  let handle = null;
  try {
    mkdirSync(oldRoot);
    mkdirSync(runtimeRoot);
    const archive = join(directory, "old-source.tar");
    git(["archive", "--format=tar", `--output=${archive}`, OLD_SOURCE,
      "package.json", "package-lock.json", "server/app.mjs", "server/start.mjs",
      "server/state.mjs", "server/middleware", "server/routes", "server/services",
      "shared/third-party-country-codes.json"]);
    execFileSync("tar", ["-xf", archive, "-C", oldRoot], { timeout: 30000 });
    // Only the installed dependency tree is reused; no config/.env/production
    // data is archived. Both source versions execute in this same Node ABI.
    symlinkSync(join(ROOT, "node_modules"), dependencyLink,
      process.platform === "win32" ? "junction" : "dir");
    assert.equal(realpathSync(dependencyLink), realpathSync(join(ROOT, "node_modules")));
    const oldState = await moduleAt(oldRoot, "server/state.mjs");
    const oldRuntime = await moduleAt(oldRoot, "server/services/platform/coin-commerce-production-runtime.mjs");
    const currentRuntime = await moduleAt(ROOT, "server/services/platform/coin-commerce-production-runtime.mjs");
    const paths = {
      controlDbPath: join(runtimeRoot, "control.sqlite"),
      subscriptionDbPath: join(runtimeRoot, "subscriptions.sqlite"),
      proxyConfigPath: join(runtimeRoot, "proxy-config.json")
    };
    writeFileSync(paths.proxyConfigPath, JSON.stringify({ servers: [{
      id: "synthetic-node", name: "synthetic-node", type: "ss", host: "127.0.0.1",
      port: 8388, method: "aes-128-gcm", password: "synthetic-only"
    }] }));
    const seed = oldState.createRuntimeState({ rootDir: runtimeRoot,
      env: { CONSOLE_TOKEN: "synthetic-only" }, ...paths, autoStartHttpProxy: false });
    seed.close();
    for (const [file, applyName, collection, idName] of [
      ["coin-wallet-migrations", "applyCoinWalletMigrations", "COIN_WALLET_MIGRATIONS", "REQUIRED_COIN_WALLET_MIGRATION_ID"],
      ["coin-commerce-migrations", "applyCoinCommerceMigrations", "COIN_COMMERCE_MIGRATIONS", "REQUIRED_COIN_COMMERCE_MIGRATION_ID"]
    ]) {
      const migration = await moduleAt(oldRoot, `server/services/platform/${file}.mjs`);
      migration[applyName]({ dbPath: paths.controlDbPath,
        expectedMigrationId: migration[idName],
        expectedDdlChecksum: migration[collection][0].ddlChecksum,
        nowFn: () => new Date(NOW) });
    }
    const start = async (runtime) => {
      assert.equal(handle, null, "the previous runtime must be stopped before starting another");
      return runtime.startProductionProxyGateway({ logger: false,
        runtimeOptions: { rootDir: runtimeRoot, ...paths, autoStartHttpProxy: false,
          env: { CONSOLE_TOKEN: "synthetic-only", CONSOLE_PORT: String(await reservePort()),
            USER_PORTAL_ROUTES_ENABLED: "true", COINS_WALLET_ENABLED: "true",
            COINS_COMMERCE_ENABLED: "true", COINS_COMMERCE_DATA_PACK_RUNTIME_ENABLED: "false",
            COINS_COMMERCE_CANARY_ACCOUNT_HASHES: createHash("sha256").update(ACCOUNT).digest("hex") }
        } });
    };

    await t.test("real old entry creates timed-plan, usage and Coins data without pack schema", async () => {
      handle = await start(oldRuntime);
      assert.equal(handle.server.address().address, "127.0.0.1");
      const { controlStore: control, coinCommerceStore: commerce } = handle.state.platform;
      control.createAccount({ id: ACCOUNT, ownerRef: "owner_cross_version", status: "active",
        createdAt: NOW, updatedAt: NOW });
      control.createEntitlement({ id: ENTITLEMENT, accountId: ACCOUNT,
        plan: "offerv_plan_30d_100gb_monthly_v1", status: "active",
        validFrom: "2026-10-01T00:00:00.000Z", validUntil: "2026-10-31T00:00:00.000Z",
        trafficLimitBytes: 100 * 1024 ** 3, createdAt: NOW, updatedAt: NOW });
      control.createIssuanceRequest({ id: REQUEST, accountId: ACCOUNT, entitlementId: ENTITLEMENT,
        approvalRef: "approval_cross_version", status: "issued", quantity: 1,
        nodeId: "synthetic-node", purpose: "coin_commerce_product_fulfillment",
        requestedByRef: "fixture", createdAt: NOW, updatedAt: NOW });
      control.linkIssuedSubscription({ id: "link_cross_version", requestId: REQUEST,
        tenantRef: "tenant_cross_version", artifactRef: "artifact_cross_version", status: "active",
        createdAt: NOW, updatedAt: NOW });
      recordUsage(control, "old", 17);
      credit(commerce, "old", 200);
      assertLegacyState(handle);
      await handle.stop(); handle = null;
      assert.equal(inventory(paths.controlDbPath).packObjects.length, 0);
    });
    const before = inventory(paths.controlDbPath);
    let afterWrites;
    let walletDigest;
    await t.test("current real entry with pack false preserves data and accepts normal writes", async () => {
      handle = await start(currentRuntime);
      assert.equal(handle.state.platform.coinCommerceDataPackRuntimeEnabled, false);
      for (const name of ["coinCommerceDataPackOrderDelivery", "coinCommerceDataPackArtifactRotation",
        "coinCommerceDataPackCredentialReset", "coinCommerceDataPackRotationCoordinator"]) {
        assert.equal(handle.state.platform[name], null);
      }
      assertLegacyState(handle);
      const after = inventory(paths.controlDbPath);
      assert.equal(after.schemaDigest, before.schemaDigest);
      assert.equal(after.rowsDigest, before.rowsDigest);
      assert.deepEqual(after.packObjects, PACK_OBJECTS);
      assertEmptyPacks(paths.controlDbPath);
      recordUsage(handle.state.platform.controlStore, "new", 23);
      credit(handle.state.platform.coinCommerceStore, "new", 50);
      assertLegacyState(handle, { upgraded: true });
      readDatabase(paths.controlDbPath, (database) => assert.equal(database.prepare(
        "select sum(available_units) from platform_coin_lots"
      ).pluck().get(), 250));
      walletDigest = digest(handle.state.platform.coinCommerceStore.walletStore
        .getWalletProjection({ accountId: ACCOUNT }, NOW));
      await handle.stop(); handle = null;
      afterWrites = inventory(paths.controlDbPath);
      assert.notEqual(afterWrites.rowsDigest, before.rowsDigest);
    });
    await t.test("real old entry reopens same upgraded database without deleting schema or new writes", async () => {
      assert.ok(afterWrites, "upgrade/write phase must have completed");
      handle = await start(oldRuntime);
      assertLegacyState(handle, { upgraded: true });
      assert.equal(digest(handle.state.platform.coinCommerceStore.walletStore
        .getWalletProjection({ accountId: ACCOUNT }, NOW)), walletDigest);
      assert.deepEqual(inventory(paths.controlDbPath), afterWrites);
      assertEmptyPacks(paths.controlDbPath);
      await handle.stop(); handle = null;
    });
    await t.test("old material -> new normal put/transaction -> old read keeps all material digests", async () => {
      const oldMaterial = await moduleAt(oldRoot, "server/services/edge/credential-material-store.mjs");
      const newMaterial = await moduleAt(ROOT, "server/services/edge/credential-material-store.mjs");
      const filePath = join(runtimeRoot, "synthetic-material.json");
      const records = ["old", "new_put", "new_transaction"].map((suffix) => {
        const material = { uuid: `synthetic-uuid-${suffix}`, password: `synthetic-password-${suffix}` };
        return { credentialRef: `material_${suffix}`, materialDigest: digest(material), material };
      });
      oldMaterial.createFileBackedEdgeCredentialMaterialStore({ filePath })
        .putCredentialMaterial(records[0]);
      const current = newMaterial.createFileBackedEdgeCredentialMaterialStore({ filePath });
      current.putCredentialMaterial(records[1]);
      const transaction = current.beginCredentialMaterialTransaction();
      transaction.putCredentialMaterial(records[2]);
      transaction.commit();
      const persisted = JSON.parse(readFileSync(filePath, "utf8"));
      assert.equal(persisted.version, 1);
      assert.equal(persisted.pending.length, 0);
      const reopened = oldMaterial.createFileBackedEdgeCredentialMaterialStore({ filePath });
      assert.equal(reopened.listCredentialMaterialSummaries().length, 3);
      for (const record of records) {
        assert.equal(reopened.getCredentialMaterialSummary(record.credentialRef).materialDigest,
          record.materialDigest);
        assert.equal(digest(reopened.resolveCredentialMaterial(record.credentialRef)), record.materialDigest);
      }
    });
  } finally {
    if (handle) await handle.stop();
    // Detach the dependency junction before removing only our mkdtemp tree.
    if (existsSync(dependencyLink)) unlinkSync(dependencyLink);
    const relativeTemp = relative(realpathSync(tmpdir()), realpathSync(directory));
    assert.ok(relativeTemp && !isAbsolute(relativeTemp) && !relativeTemp.startsWith(`..${sep}`)
      && relativeTemp !== ".." && dirname(directory) === resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    assert.equal(existsSync(directory), false);
  }
});
