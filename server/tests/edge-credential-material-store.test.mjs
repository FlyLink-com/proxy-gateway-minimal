import assert from "node:assert/strict";
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
