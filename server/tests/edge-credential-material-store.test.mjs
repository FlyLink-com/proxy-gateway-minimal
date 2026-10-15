import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createEdgeCredentialMaterialStore,
  createFileBackedEdgeCredentialMaterialStore
} from "../services/edge/credential-material-store.mjs";

test("edge credential material store resolves protected material while summaries stay redacted", () => {
  const store = createEdgeCredentialMaterialStore();

  const summary = store.putCredentialMaterial({
    credentialRef: "edgecred_order_001",
    materialDigest: "digest_order_001",
    material: {
      uuid: "11111111-1111-4111-8111-111111111111",
      password: "synthetic-tuic-password"
    }
  });

  assert.deepEqual(summary, {
    credentialRef: "edgecred_order_001",
    materialDigest: "digest_order_001",
    hasMaterial: true
  });
  assert.deepEqual(store.resolveCredentialMaterial("edgecred_order_001"), {
    uuid: "11111111-1111-4111-8111-111111111111",
    password: "synthetic-tuic-password"
  });
  assert.doesNotMatch(JSON.stringify(store.listCredentialMaterialSummaries()), /synthetic-tuic-password|11111111-1111-4111-8111-111111111111/);
});

test("edge credential material store rejects unsafe refs and incomplete material", () => {
  const store = createEdgeCredentialMaterialStore();

  assert.throws(() => store.putCredentialMaterial({
    credentialRef: "bad ref with spaces",
    materialDigest: "digest_order_001",
    material: {
      uuid: "11111111-1111-4111-8111-111111111111",
      password: "synthetic-tuic-password"
    }
  }), /credentialRef is required/);

  assert.throws(() => store.putCredentialMaterial({
    credentialRef: "edgecred_order_001",
    materialDigest: "digest_order_001",
    material: {
      uuid: "11111111-1111-4111-8111-111111111111"
    }
  }), /material.password is required/);
});

test("file-backed edge credential material store persists protected material while summaries stay redacted", () => {
  const dir = mkdtempSync(join(tmpdir(), "edge-material-store-"));
  const filePath = join(dir, "protected", "edge-material.json");

  try {
    const store = createFileBackedEdgeCredentialMaterialStore({ filePath });
    const summary = store.putCredentialMaterial({
      credentialRef: "edgecred_pareq_file_001",
      materialDigest: "digest_file_001",
      material: {
        uuid: "22222222-2222-4222-8222-222222222222",
        password: "synthetic-file-password"
      }
    });

    assert.equal(existsSync(filePath), true);
    assert.deepEqual(summary, {
      credentialRef: "edgecred_pareq_file_001",
      materialDigest: "digest_file_001",
      hasMaterial: true
    });

    const reloaded = createFileBackedEdgeCredentialMaterialStore({ filePath });
    assert.deepEqual(reloaded.resolveCredentialMaterial("edgecred_pareq_file_001"), {
      uuid: "22222222-2222-4222-8222-222222222222",
      password: "synthetic-file-password"
    });
    assert.doesNotMatch(JSON.stringify(reloaded.listCredentialMaterialSummaries()), /synthetic-file-password|22222222-2222-4222-8222-222222222222/);

    const rawFile = readFileSync(filePath, "utf8");
    assert.match(rawFile, /edgecred_pareq_file_001/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("file-backed material transactions keep candidates out of the active file until commit", () => {
  const dir = mkdtempSync(join(tmpdir(), "edge-material-transaction-"));
  const filePath = join(dir, "protected", "edge-material.json");

  try {
    const store = createFileBackedEdgeCredentialMaterialStore({ filePath });
    store.putCredentialMaterial({
      credentialRef: "edgecred_transaction_001",
      materialDigest: "digest_transaction_old",
      material: {
        uuid: "33333333-3333-4333-8333-333333333333",
        password: "synthetic-old-password"
      }
    });
    const activeBefore = readFileSync(filePath, "utf8");

    const rolledBack = store.beginCredentialMaterialTransaction();
    rolledBack.putCredentialMaterial({
      credentialRef: "edgecred_transaction_001",
      materialDigest: "digest_transaction_candidate",
      material: {
        uuid: "44444444-4444-4444-8444-444444444444",
        password: "synthetic-candidate-password"
      }
    });
    assert.equal(store.getCredentialMaterialSummary("edgecred_transaction_001").materialDigest, "digest_transaction_candidate");
    assert.equal(readFileSync(filePath, "utf8"), activeBefore);
    rolledBack.rollback();
    assert.equal(store.getCredentialMaterialSummary("edgecred_transaction_001").materialDigest, "digest_transaction_old");
    assert.equal(readFileSync(filePath, "utf8"), activeBefore);

    const committed = store.beginCredentialMaterialTransaction();
    committed.putCredentialMaterial({
      credentialRef: "edgecred_transaction_001",
      materialDigest: "digest_transaction_committed",
      material: {
        uuid: "55555555-5555-4555-8555-555555555555",
        password: "synthetic-committed-password"
      }
    });
    assert.equal(readFileSync(filePath, "utf8"), activeBefore);
    committed.commit();

    const reloaded = createFileBackedEdgeCredentialMaterialStore({ filePath });
    assert.equal(reloaded.getCredentialMaterialSummary("edgecred_transaction_001").materialDigest, "digest_transaction_committed");
    assert.doesNotMatch(JSON.stringify(reloaded.listCredentialMaterialSummaries()), /synthetic-committed-password|55555555/i);

    committed.restore();
    const restored = createFileBackedEdgeCredentialMaterialStore({ filePath });
    assert.equal(restored.getCredentialMaterialSummary("edgecred_transaction_001").materialDigest, "digest_transaction_old");
    assert.equal(readFileSync(filePath, "utf8"), activeBefore);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a staged credential replacement survives restart without changing active material", () => {
  const dir = mkdtempSync(join(tmpdir(), "edge-material-stage-"));
  const filePath = join(dir, "protected", "edge-material.json");
  const oldMaterial = { uuid: "66666666-6666-4666-8666-666666666666",
    password: "synthetic-old-pack" };
  const newMaterial = { uuid: "77777777-7777-4777-8777-777777777777",
    password: "synthetic-new-pack" };
  const digest = (value) => `sha256:${createHash("sha256")
    .update(value.uuid).update("\0").update(value.password).digest("hex")}`;
  const input = { rotationRef: "packrot_staged_001",
    credentialRef: "edgecred_pack_staged_001",
    oldMaterialDigest: digest(oldMaterial),
    newMaterialDigest: digest(newMaterial), material: newMaterial };
  try {
    let store = createFileBackedEdgeCredentialMaterialStore({ filePath });
    store.putCredentialMaterial({ credentialRef: input.credentialRef,
      materialDigest: input.oldMaterialDigest, material: oldMaterial });
    const staged = store.stageCredentialMaterialRotation(input);
    assert.deepEqual(staged, { rotationRef: input.rotationRef,
      credentialRef: input.credentialRef,
      oldMaterialDigest: input.oldMaterialDigest,
      newMaterialDigest: input.newMaterialDigest });
    assert.equal(store.getCredentialMaterialSummary(input.credentialRef).materialDigest,
      input.oldMaterialDigest);
    assert.deepEqual(store.resolveCredentialMaterial(input.credentialRef), oldMaterial);
    assert.doesNotMatch(JSON.stringify(staged), /synthetic-new-pack/);
    store = createFileBackedEdgeCredentialMaterialStore({ filePath });
    assert.deepEqual(store.getStagedCredentialMaterialRotation(input.rotationRef), staged);
    assert.deepEqual(store.stageCredentialMaterialRotation(input), staged);
    assert.throws(() => store.stageCredentialMaterialRotation({ ...input,
      rotationRef: "packrot_conflicting_001" }), /pending|staged|rotation/);
    assert.equal(store.getCredentialMaterialSummary(input.credentialRef).materialDigest,
      input.oldMaterialDigest);
    const committed = store.commitCredentialMaterialRotation(staged);
    assert.equal(committed.materialDigest, input.newMaterialDigest);
    store = createFileBackedEdgeCredentialMaterialStore({ filePath });
    assert.equal(store.getStagedCredentialMaterialRotation(input.rotationRef), null);
    assert.deepEqual(store.resolveCredentialMaterial(input.credentialRef), newMaterial);
    assert.equal(store.commitCredentialMaterialRotation(staged).materialDigest,
      input.newMaterialDigest);
    assert.doesNotMatch(readFileSync(filePath, "utf8"), /synthetic-old-pack/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an older transaction cannot restore over a committed credential replacement", () => {
  const store = createEdgeCredentialMaterialStore();
  const oldMaterial = { uuid: "88888888-8888-4888-8888-888888888888",
    password: "synthetic-before" };
  const newMaterial = { uuid: "99999999-9999-4999-8999-999999999999",
    password: "synthetic-after" };
  const digest = (value) => `sha256:${createHash("sha256")
    .update(value.uuid).update("\0").update(value.password).digest("hex")}`;
  const credentialRef = "edgecred_pack_restore_guard";
  store.putCredentialMaterial({ credentialRef,
    materialDigest: digest(oldMaterial), material: oldMaterial });
  const prior = store.beginCredentialMaterialTransaction();
  prior.commit();
  const stage = store.stageCredentialMaterialRotation({
    rotationRef: "packrot_restore_guard", credentialRef,
    oldMaterialDigest: digest(oldMaterial),
    newMaterialDigest: digest(newMaterial), material: newMaterial
  });
  store.commitCredentialMaterialRotation(stage);
  assert.throws(() => prior.restore(), /changed|closed|restore/);
  assert.equal(store.getCredentialMaterialSummary(credentialRef).materialDigest,
    digest(newMaterial));
});
