import assert from "node:assert/strict";
import test from "node:test";
import {
  createEdgeCredentialMaterialStore
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
