import test from "node:test";
import assert from "node:assert";
import { executeSubscriptionIssuance } from "../services/platform/subscription-issuance.mjs";

function createMockRuntimeCore() {
  let tenantIdCounter = 1;
  let artifactIdCounter = 1;
  const disabledTenantIds = [];
  const revokedArtifactIds = [];
  return {
    disabledTenantIds,
    revokedArtifactIds,
    createTenant: (args) => {
      const id = `tenant_${tenantIdCounter++}`;
      createMockRuntimeCore.lastCreateTenantArgs = args;
      return {
        tenant: {
          id,
          nodeId: args.nodeId,
          expiresAt: args.expiresAt,
          note: args.note,
          status: "active"
        }
      };
    },
    createSubscriptionArtifact: (tenantId) => {
      const id = `artifact_${artifactIdCounter++}`;
      return {
        artifact: {
          id,
          tenantId,
          status: "active"
        },
        subscriptionUrl: `https://example.com/sub/a/${id}_secret_hash`
      };
    },
    revokeSubscriptionArtifact: (id) => {
      revokedArtifactIds.push(id);
      return { id, status: "revoked" };
    },
    disableTenant: (id) => {
      disabledTenantIds.push(id);
      return { id, status: "disabled" };
    }
  };
}

function createMockControlStore() {
  const store = {
    accounts: {},
    entitlements: {},
    requests: {},
    links: {},
    quotas: {},
    audits: {},
    revocations: {},
    getAccount: (id) => store.accounts[id],
    createAccount: (data) => { store.accounts[data.id] = data; },
    getEntitlement: (id) => store.entitlements[id],
    createEntitlement: (data) => { store.entitlements[data.id] = data; },
    createIssuanceRequest: (data) => { store.requests[data.id] = data; },
    setIssuanceRequestStatus: (id, updates) => { Object.assign(store.requests[id], updates); },
    linkIssuedSubscription: (data) => { store.links[data.id] = data; },
    upsertQuotaCounter: (data) => { store.quotas[`${data.accountId}_${data.metric}`] = data; },
    recordRevocation: (data) => { store.revocations[data.id] = data; },
    recordAuditEvent: (data) => { store.audits[data.id] = data; }
  };
  return store;
}

test("executeSubscriptionIssuance - success writes runtime tenant/artifact and safe control rows", () => {
  const controlStore = createMockControlStore();
  const runtimeCore = createMockRuntimeCore();
  const now = new Date().toISOString();
  const approvalRef = "approval_123";

  const input = {
    nodeId: "primary_node",
    artifact: { create: true },
    expiresAt: "2026-12-31T23:59:59Z",
    control: {
      accountId: "acct_1",
      ownerRef: "owner_hash",
      entitlementId: "ent_1",
      requestId: "req_1",
      requestedByRef: "op_hash",
      purpose: "test"
    }
  };

  const { summary, handoffMaterial } = executeSubscriptionIssuance({
    controlStore,
    runtimeCore,
    input,
    approvalRef,
    now
  });

  // Verify control rows were written
  assert.ok(controlStore.accounts["acct_1"]);
  assert.ok(controlStore.entitlements["ent_1"]);
  assert.ok(controlStore.requests["req_1"]);
  assert.strictEqual(controlStore.requests["req_1"].status, "issued");
  assert.ok(controlStore.links["req_1_link_1"]);
  assert.strictEqual(controlStore.quotas["acct_1_artifact_issuance"].amount, 1);
  assert.ok(controlStore.audits["req_1_audit_issued"]);

  // Verify summary and handoff material
  assert.ok(summary.ok);
  assert.strictEqual(summary.dbMutated, true);
  assert.strictEqual(handoffMaterial.approvalRef, approvalRef);
  assert.ok(handoffMaterial.tenantId);
  assert.ok(handoffMaterial.artifactId);
  assert.ok(handoffMaterial.subscriptionUrl);
  assert.strictEqual(handoffMaterial.expiresAt, input.expiresAt);
  assert.strictEqual(handoffMaterial.validUntil, input.expiresAt);
  assert.strictEqual(createMockRuntimeCore.lastCreateTenantArgs.note, "");
});

test("executeSubscriptionIssuance - safety: summary does not contain subscriptionUrl, token, or artifact secret", () => {
  const controlStore = createMockControlStore();
  const runtimeCore = createMockRuntimeCore();

  const input = {
    nodeId: "primary_node",
    artifact: { create: true },
    control: {
      accountId: "acct_2",
      ownerRef: "owner_hash",
      entitlementId: "ent_2",
      requestId: "req_2",
      requestedByRef: "op_hash",
      purpose: "test"
    }
  };

  const { summary } = executeSubscriptionIssuance({
    controlStore,
    runtimeCore,
    input,
    approvalRef: "app_2",
    now: new Date().toISOString()
  });

  const summaryString = JSON.stringify(summary).toLowerCase();
  assert.strictEqual(summaryString.includes("http"), false);
  assert.strictEqual(summaryString.includes("secret"), false);
  assert.strictEqual(summaryString.includes("token"), false);
  assert.strictEqual(summaryString.includes("subscriptionurl"), false);
});

test("executeSubscriptionIssuance - fail-closed: rejects missing nodeId, artifact.create, or control fields", () => {
  const controlStore = createMockControlStore();
  const runtimeCore = createMockRuntimeCore();
  const now = new Date().toISOString();

  const validControl = {
    accountId: "acct_3", ownerRef: "hash", entitlementId: "ent_3",
    requestId: "req_3", requestedByRef: "hash", purpose: "test"
  };

  assert.throws(() => {
    executeSubscriptionIssuance({
      controlStore, runtimeCore, now, approvalRef: "app_3",
      input: { artifact: { create: true }, control: validControl } // missing nodeId
    });
  }, /nodeId is mandatory/);

  assert.throws(() => {
    executeSubscriptionIssuance({
      controlStore, runtimeCore, now, approvalRef: "app_3",
      input: { nodeId: "node", control: validControl } // missing artifact.create
    });
  }, /artifact.create must be true/);

  assert.throws(() => {
    executeSubscriptionIssuance({
      controlStore, runtimeCore, now, approvalRef: "app_3",
      input: { nodeId: "node", artifact: { create: true }, control: { ...validControl, accountId: "" } }
    });
  }, /control.accountId is mandatory/);
});

test("executeSubscriptionIssuance - fail-closed: rejects unsafe notes", () => {
  const controlStore = createMockControlStore();
  const runtimeCore = createMockRuntimeCore();
  const now = new Date().toISOString();

  assert.throws(() => {
    executeSubscriptionIssuance({
      controlStore,
      runtimeCore,
      now,
      approvalRef: "app_4",
      input: {
        nodeId: "node",
        artifact: { create: true },
        note: "https://example.com/sub/a/raw.yaml?token=secret",
        control: {
          accountId: "acct_4",
          ownerRef: "hash",
          entitlementId: "ent_4",
          requestId: "req_4",
          requestedByRef: "hash",
          purpose: "test"
        }
      }
    });
  }, /note must not contain sensitive material/);
});

test("executeSubscriptionIssuance - saga compensates runtime tenant and artifact when control link write fails", () => {
  const controlStore = createMockControlStore();
  const runtimeCore = createMockRuntimeCore();
  const now = "2026-05-31T00:00:00.000Z";
  const linkFailure = new Error("control link write failed");

  controlStore.linkIssuedSubscription = () => {
    throw linkFailure;
  };

  assert.throws(() => {
    executeSubscriptionIssuance({
      controlStore,
      runtimeCore,
      input: {
        nodeId: "primary_node",
        artifact: { create: true },
        expiresAt: "2026-12-31T23:59:59Z",
        control: {
          accountId: "acct_compensate",
          ownerRef: "owner_hash",
          entitlementId: "ent_compensate",
          requestId: "req_compensate",
          requestedByRef: "op_hash",
          purpose: "test"
        }
      },
      approvalRef: "approval_compensate",
      now
    });
  }, /issuance failed after runtime mutation; runtime changes were compensated/);

  assert.deepStrictEqual(runtimeCore.revokedArtifactIds, ["artifact_1"]);
  assert.deepStrictEqual(runtimeCore.disabledTenantIds, ["tenant_1"]);
  assert.strictEqual(controlStore.requests.req_compensate.status, "failed");
  assert.strictEqual(Object.keys(controlStore.links).length, 0);
  assert.strictEqual(Object.keys(controlStore.quotas).length, 0);
  assert.strictEqual(controlStore.revocations.req_compensate_compensation_revocation.reasonCode, "issuance_compensation");
  assert.strictEqual(controlStore.audits.req_compensate_audit_failed.action, "issuance_failed_compensated");
});
