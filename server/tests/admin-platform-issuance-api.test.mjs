import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { createRuntimeState } from "../state.mjs";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listen } from "./helpers/listen.mjs";


function createTestApp(fixtureDir) {
  mkdirSync(join(fixtureDir, "config"), { recursive: true });
  writeFileSync(join(fixtureDir, "config", "proxy-servers.json"), JSON.stringify({
    servers: [{ name: "prod-edge-c", host: "1.2.3.4", port: 443, type: "ss", cipher: "aes-256-gcm", password: "test" }], 
    pingHosts: [], 
    nginx: { host: "127.0.0.1", ports: [] }
  }));
  const state = createRuntimeState({
    rootDir: fixtureDir,
    env: {
      CONSOLE_PORT: "3456",
      ADMIN_ALLOWED_CIDRS: "127.0.0.1/32"
    },
    controlDbPath: join(fixtureDir, "control.sqlite"),
    subscriptionDbPath: join(fixtureDir, "subscriptions.sqlite")
  });
  const app = createApp(state);
  return { app, state };
}

function authHeaders(state) {
  return { 
    Authorization: `Bearer ${state.consoleToken}`,
    "Content-Type": "application/json"
  };
}

const validIssuanceInput = {
  nodeId: "prod-edge-c",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  displayName: "Test User",
  artifact: { create: true },
  control: {
    accountId: "acc_123",
    ownerRef: "owner_123",
    entitlementId: "ent_123",
    requestId: "req_123",
    requestedByRef: "operator_1",
    purpose: "testing"
  }
};

test("admin platform issuance preview validates input and returns safe plan without mutating DB", async () => {
  const fixtureDir = join(process.cwd(), "test-fixtures", "admin-platform-issuance-api-preview");
  rmSync(fixtureDir, { recursive: true, force: true });
  mkdirSync(fixtureDir, { recursive: true });
  
  const { app, state } = createTestApp(fixtureDir);
  const { server, baseUrl } = await listen(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/admin/platform/subscription-issuance/preview`, {
      method: "POST",
      headers: authHeaders(state),
      body: JSON.stringify(validIssuanceInput)
    });
    
    assert.equal(res.status, 200);
    const body = await res.json();
    const { preview } = body;
    assert.equal(preview.action, "issuance_preview");
    assert.equal(preview.safety.dbMutated, false);
    assert.equal(preview.safety.controlDbMutated, false);
    assert.equal(preview.requestId, "req_123");
    
    // DB should not have been mutated
    const account = state.platform.controlStore.getAccount("acc_123");
    assert.ok(!account);
  } finally {
    server.close();
    state.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("admin platform issuance request persists planned request without creating runtime tenant", async () => {
  const fixtureDir = join(process.cwd(), "test-fixtures", "admin-platform-issuance-api-request");
  rmSync(fixtureDir, { recursive: true, force: true });
  mkdirSync(fixtureDir, { recursive: true });
  
  const { app, state } = createTestApp(fixtureDir);
  const { server, baseUrl } = await listen(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/admin/platform/subscription-issuance/request`, {
      method: "POST",
      headers: authHeaders(state),
      body: JSON.stringify(validIssuanceInput)
    });
    
    assert.equal(res.status, 201);
    const body = await res.json();
    const { request: reqData } = body;
    assert.equal(reqData.action, "issuance_planned");
    assert.equal(reqData.safety.dbMutated, false);
    assert.equal(reqData.safety.controlDbMutated, true);
    assert.equal(reqData.requestId, "req_123");
    assert.equal(reqData.fulfillmentCommand.includes("--fulfill-request req_123"), true);
    
    // Verify DB mutations
    const account = state.platform.controlStore.getAccount("acc_123");
    assert.equal(account.id, "acc_123");
    
    const requestRow = state.platform.controlStore.getIssuanceRequest("req_123");
    assert.equal(requestRow.status, "planned");
  } finally {
    server.close();
    state.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("admin platform issuance preview rejects invalid input", async () => {
  const fixtureDir = join(process.cwd(), "test-fixtures", "admin-platform-issuance-api-invalid");
  rmSync(fixtureDir, { recursive: true, force: true });
  mkdirSync(fixtureDir, { recursive: true });
  
  const { app, state } = createTestApp(fixtureDir);
  const { server, baseUrl } = await listen(app);
  
  try {
    const res = await fetch(`${baseUrl}/api/admin/platform/subscription-issuance/preview`, {
      method: "POST",
      headers: authHeaders(state),
      body: JSON.stringify({ nodeId: "" })
    });
    
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "validation_error");
  } finally {
    server.close();
    state.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
