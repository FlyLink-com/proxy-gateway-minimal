import assert from "node:assert/strict";
import test from "node:test";
import { createOrderEdgeCredentialIssuer } from "../services/edge/order-credential-issuer.mjs";

function materialStore() {
  const entries = new Map();
  return {
    putCredentialMaterial(input) {
      entries.set(input.credentialRef, input);
      return {
        credentialRef: input.credentialRef,
        materialDigest: input.materialDigest
      };
    },
    getCredentialMaterialSummary(credentialRef) {
      return entries.get(credentialRef) ?? null;
    },
    resolveCredentialMaterial(credentialRef) {
      return entries.get(credentialRef)?.material ?? null;
    }
  };
}

test("order credential issuer honors per-order channelRefs when provided", () => {
  const issuer = createOrderEdgeCredentialIssuer({
    channelRef: "channel-primary",
    channelRefs: ["channel-primary"],
    materialStore: materialStore(),
    uuidFactory: ({ channelRef }) => `00000000-0000-4000-8000-${channelRef.endsWith("a") ? "00000000000a" : "00000000000b"}`,
    passwordFactory: ({ channelRef }) => `password-for-${channelRef}`
  });

  const credentials = issuer.ensureCredentialsForOrder({
    id: "pareq_dynamic_channels_1",
    channelRefs: ["channel-a", "channel-b"]
  });

  assert.deepEqual(credentials.map((credential) => credential.edgeChannelRef), [
    "channel-a",
    "channel-b"
  ]);
  assert.deepEqual(credentials.map((credential) => credential.edgeCredentialRef), [
    "edgecred_pareq_dynamic_channels_1_channel-a",
    "edgecred_pareq_dynamic_channels_1_channel-b"
  ]);
});

test("order credential issuer can force-rotate protected material for the same ref", () => {
  let sequence = 0;
  const store = materialStore();
  const issuer = createOrderEdgeCredentialIssuer({
    channelRef: "channel-primary",
    materialStore: store,
    uuidFactory: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    passwordFactory: () => `password-${sequence}`
  });

  const [first] = issuer.ensureCredentialsForOrder({
    id: "pareq_rotate_1",
    channelRefs: ["channel-primary"]
  });
  const [unchanged] = issuer.ensureCredentialsForOrder({
    id: "pareq_rotate_1",
    channelRefs: ["channel-primary"]
  });
  const [rotated] = issuer.ensureCredentialsForOrder({
    id: "pareq_rotate_1",
    channelRefs: ["channel-primary"],
    forceRotateCredential: true
  });

  assert.equal(first.edgeCredentialRef, unchanged.edgeCredentialRef);
  assert.equal(first.edgeCredentialRef, rotated.edgeCredentialRef);
  assert.equal(first.edgeMaterialDigest, unchanged.edgeMaterialDigest);
  assert.notEqual(first.edgeMaterialDigest, rotated.edgeMaterialDigest);
  assert.deepEqual(store.resolveCredentialMaterial("edgecred_pareq_rotate_1"), rotated.edgeCredentialMaterial);
});
