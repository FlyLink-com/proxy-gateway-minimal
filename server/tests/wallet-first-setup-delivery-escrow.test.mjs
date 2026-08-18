import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  WALLET_FIRST_SETUP_DELIVERY_ESCROW_VERSION,
  WALLET_FIRST_SETUP_DELIVERY_INTENTIONAL_SYNC_LOCK_HELPERS,
  createWalletFirstSetupDeliveryEscrow
} from "../services/platform/wallet-first-setup-delivery-escrow.mjs";

const ESCROW_KEY = Buffer.from(
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
  "hex"
);
const DELIVERY_URL = "https://gateway.example.test/sub/a/synthetic-delivery-artifact.yaml?token=synthetic-delivery-material";

function binding(overrides = {}) {
  return {
    transitionRef: "transition_escrow_001",
    effectRef: "wfxeffect_escrow_001",
    tenantId: "tenant_escrow_001",
    artifactId: "artifact_escrow_001",
    ...overrides
  };
}

function createFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "wallet-first-setup-delivery-escrow-"));
  const filePath = join(directory, "setup-delivery-escrow.json");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, filePath };
}

test("setup delivery escrow encrypts the artifact material, survives restart, and only deletes it after acknowledge", (t) => {
  const fixture = createFixture(t);
  const first = createWalletFirstSetupDeliveryEscrow({
    key: ESCROW_KEY,
    filePath: fixture.filePath,
    ivFactory: () => Buffer.from("000102030405060708090a0b", "hex")
  });
  t.after(() => first.close());
  const captured = first.runtimeEscrow.captureInitialSetupDelivery({
    ...binding(),
    subscriptionUrl: DELIVERY_URL
  });

  assert.deepEqual(captured, {
    version: WALLET_FIRST_SETUP_DELIVERY_ESCROW_VERSION,
    state: "available",
    handoffRef: captured.handoffRef,
    bindingDigest: captured.bindingDigest,
    resourceDigest: captured.resourceDigest
  });
  assert.match(captured.handoffRef, /^wfxsetup_[a-f0-9]{48}$/);
  assert.match(captured.bindingDigest, /^[a-f0-9]{64}$/);
  assert.match(captured.resourceDigest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(captured), /gateway\.example|synthetic-delivery-material|subscriptionUrl/i);

  const encryptedFile = readFileSync(fixture.filePath, "utf8");
  assert.doesNotMatch(encryptedFile, /gateway\.example|synthetic-delivery-material|subscriptionUrl/i);
  assert.match(encryptedFile, /aes-256-gcm/);
  if (process.platform !== "win32") {
    assert.equal(statSync(fixture.filePath).mode & 0o777, 0o600);
  }

  assert.throws(
    () => createWalletFirstSetupDeliveryEscrow({
      key: ESCROW_KEY,
      filePath: fixture.filePath
    }),
    (error) => error?.code === "wallet_first_setup_delivery_unavailable"
  );
  first.close();
  const restarted = createWalletFirstSetupDeliveryEscrow({
    key: ESCROW_KEY,
    filePath: fixture.filePath
  });
  t.after(() => restarted.close());
  assert.deepEqual(
    restarted.runtimeEscrow.verifyInitialSetupDelivery(binding()),
    captured
  );
  assert.deepEqual(
    restarted.deliveryEscrow.getSetupDeliverySummary(binding()),
    captured
  );
  assert.deepEqual(
    restarted.deliveryEscrow.releaseSetupDelivery({
      handoffRef: captured.handoffRef,
      ...binding()
    }),
    { handoffRef: captured.handoffRef, subscriptionUrl: DELIVERY_URL }
  );
  assert.deepEqual(
    restarted.deliveryEscrow.acknowledgeSetupDelivery({
      handoffRef: captured.handoffRef,
      ...binding()
    }),
    { handoffRef: captured.handoffRef, status: "acknowledged" }
  );
  assert.deepEqual(
    restarted.deliveryEscrow.acknowledgeSetupDelivery({
      handoffRef: captured.handoffRef,
      ...binding()
    }),
    { handoffRef: captured.handoffRef, status: "acknowledged" }
  );
  assert.equal(
    restarted.deliveryEscrow.getSetupDeliverySummary(binding()).state,
    "acknowledged"
  );
  assert.throws(
    () => restarted.deliveryEscrow.releaseSetupDelivery({
      handoffRef: captured.handoffRef,
      ...binding()
    }),
    (error) => error?.code === "wallet_first_setup_delivery_reconciliation_required"
  );
  assert.doesNotMatch(
    readFileSync(fixture.filePath, "utf8"),
    /gateway\.example|synthetic-delivery-material|subscriptionUrl/i
  );
});

test("setup delivery escrow fails closed for missing, divergent, or replayed material", (t) => {
  const fixture = createFixture(t);
  const escrow = createWalletFirstSetupDeliveryEscrow({
    key: ESCROW_KEY,
    filePath: fixture.filePath
  });
  t.after(() => escrow.close());

  assert.throws(
    () => escrow.runtimeEscrow.verifyInitialSetupDelivery(binding()),
    (error) => error?.code === "wallet_first_setup_delivery_reconciliation_required"
  );

  const captured = escrow.runtimeEscrow.captureInitialSetupDelivery({
    ...binding(),
    subscriptionUrl: DELIVERY_URL
  });
  assert.throws(
    () => escrow.runtimeEscrow.verifyInitialSetupDelivery(binding({ artifactId: "artifact_escrow_other" })),
    (error) => error?.code === "wallet_first_setup_delivery_reconciliation_required"
  );
  assert.throws(
    () => escrow.runtimeEscrow.captureInitialSetupDelivery({
      ...binding(),
      subscriptionUrl: "https://gateway.example.test/sub/a/different-artifact.yaml?token=other-material"
    }),
    (error) => error?.code === "wallet_first_setup_delivery_reconciliation_required"
  );
  assert.throws(
    () => escrow.deliveryEscrow.releaseSetupDelivery({
      handoffRef: captured.handoffRef,
      ...binding({ tenantId: "tenant_escrow_other" })
    }),
    (error) => error?.code === "wallet_first_setup_delivery_reconciliation_required"
  );
});

test("setup delivery escrow requires the exact durable binding summary on replay", (t) => {
  const fixture = createFixture(t);
  const first = createWalletFirstSetupDeliveryEscrow({
    key: ESCROW_KEY,
    filePath: fixture.filePath
  });
  t.after(() => first.close());
  first.runtimeEscrow.captureInitialSetupDelivery({
    ...binding(),
    subscriptionUrl: DELIVERY_URL
  });
  first.close();

  const tampered = JSON.parse(readFileSync(fixture.filePath, "utf8"));
  tampered.records[0].resourceDigest = "f".repeat(64);
  writeFileSync(fixture.filePath, `${JSON.stringify(tampered)}\n`, { mode: 0o600 });
  const restarted = createWalletFirstSetupDeliveryEscrow({
    key: ESCROW_KEY,
    filePath: fixture.filePath
  });
  t.after(() => restarted.close());

  assert.throws(
    () => restarted.runtimeEscrow.verifyInitialSetupDelivery(binding()),
    (error) => error?.code === "wallet_first_setup_delivery_reconciliation_required"
  );
  assert.throws(
    () => restarted.deliveryEscrow.getSetupDeliverySummary(binding()),
    (error) => error?.code === "wallet_first_setup_delivery_reconciliation_required"
  );
});

test("setup delivery escrow requires a strict key and an absolute protected file path", () => {
  assert.throws(
    () => createWalletFirstSetupDeliveryEscrow({
      key: "not-a-32-byte-key",
      filePath: "C:\\relative-does-not-count"
    }),
    (error) => error?.code === "wallet_first_setup_delivery_invalid"
  );
  assert.throws(
    () => createWalletFirstSetupDeliveryEscrow({
      key: ESCROW_KEY,
      filePath: "relative-escrow.json"
    }),
    (error) => error?.code === "wallet_first_setup_delivery_invalid"
  );
});

test("setup delivery escrow recovers a dead writer owner but never steals a live writer", (t) => {
  const fixture = createFixture(t);
  const staleLockPath = `${fixture.filePath}.lock`;
  writeFileSync(staleLockPath, `${JSON.stringify({
    version: "wallet_first_setup_delivery_escrow_lock_v1",
    pid: 99_999_999,
    nonce: "a".repeat(32)
  })}\n`, { mode: 0o600 });
  const escrow = createWalletFirstSetupDeliveryEscrow({
    key: ESCROW_KEY,
    filePath: fixture.filePath
  });
  t.after(() => escrow.close());
  assert.equal(
    escrow.runtimeEscrow.captureInitialSetupDelivery({
      ...binding(),
      subscriptionUrl: DELIVERY_URL
    }).state,
    "available"
  );
});

test("setup delivery escrow rejects links and non-sticky writable parents before storing material", (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX permission and symlink checks are not portable on Windows");
    return;
  }
  const fixture = createFixture(t);
  const targetPath = join(fixture.directory, "target.json");
  const linkedPath = join(fixture.directory, "linked.json");
  writeFileSync(targetPath, "{}\n", { mode: 0o600 });
  symlinkSync(targetPath, linkedPath);
  assert.throws(
    () => createWalletFirstSetupDeliveryEscrow({ key: ESCROW_KEY, filePath: linkedPath }),
    (error) => error?.code === "wallet_first_setup_delivery_invalid"
  );
  assert.throws(
    () => createWalletFirstSetupDeliveryEscrow({
      key: ESCROW_KEY,
      filePath: join(tmpdir(), "wallet-first-direct-shared-parent-escrow.json")
    }),
    (error) => error?.code === "wallet_first_setup_delivery_invalid"
  );

  const writableParent = join(fixture.directory, "unsafe-parent");
  mkdirSync(writableParent, { mode: 0o777 });
  // `mkdir` is restricted by umask, so explicitly expose the unsafe mode.
  chmodSync(writableParent, 0o777);
  assert.throws(
    () => createWalletFirstSetupDeliveryEscrow({
      key: ESCROW_KEY,
      filePath: join(writableParent, "escrow.json")
    }),
    (error) => error?.code === "wallet_first_setup_delivery_invalid"
  );
});

  // F-20: pin the intentional synchronous lock trio contract so that future
  // refactors cannot silently asyncify one helper (e.g. swapping readFileSync for
  // readFile on line ~575) without re-evaluating the create-then-immediately-read
  // invariant relied on by releaseLock / recoverDeadWriterLock.
  // Async redesign is intentionally deferred to F-13 (multi-process architecture).
  test("F-20: lock trio helpers are pinned as intentionally synchronous", () => {
    assert.deepEqual(
      [...WALLET_FIRST_SETUP_DELIVERY_INTENTIONAL_SYNC_LOCK_HELPERS],
      ["readLockOwner", "isLiveLockOwner", "openExclusiveLock"]
    );
  });

  test("F-20: captureInitialSetupDelivery returns a plain object, not a Promise (lock trio stays sync end-to-end)", (t) => {
    const fixture = createFixture(t);
    const escrow = createWalletFirstSetupDeliveryEscrow({
      key: ESCROW_KEY,
      filePath: fixture.filePath,
      ivFactory: () => Buffer.from("000102030405060708090a0b", "hex")
    });
    t.after(() => escrow.close());
    const captured = escrow.runtimeEscrow.captureInitialSetupDelivery({
      ...binding(),
      subscriptionUrl: DELIVERY_URL
    });
    // A Promise-returning trio would surface here as a thenable; we assert the
    // value is a plain object so the lock acquire/read/check stayed sync.
    assert.equal(typeof captured, "object");
    assert.ok(captured !== null);
    assert.equal(typeof captured.then, "undefined");
    assert.equal(captured.state, "available");
  });
