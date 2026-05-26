import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { createPlatformAccountEntitlementShell } from "../services/platform/account-entitlement-shell.mjs";
import { createPlatformLeadReviewQueue } from "../services/platform/lead-review-queue.mjs";
import { createPlatformSubscriptionAccessShell } from "../services/platform/subscription-access-shell.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fakeState({ leadQueue, accountShell, accessShell }) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform: { leadQueue, accountShell, accessShell },
    services: {
      ssLocal: {
        start: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: false, starting: false })
      },
      httpProxy: {
        start: async () => ({ ok: true }),
        stop: async () => ({ ok: true }),
        status: () => ({ running: false, starting: false })
      }
    },
    isPortListening: async () => false
  };
}

function authHeaders() {
  return { Authorization: "Bearer secret" };
}

function sampleLead() {
  return {
    organization: "Acme Research",
    email: "ops@example.com",
    direction: "API Sandbox",
    stage: "pilot budget approved",
    message: "Need API sandbox access."
  };
}

function createPlatformState() {
  const leadQueue = createPlatformLeadReviewQueue({
    nowFn: () => "2026-05-26T10:00:00.000Z",
    idFactory: () => "lead_1"
  });
  const accountShell = createPlatformAccountEntitlementShell({
    nowFn: () => "2026-05-26T10:05:00.000Z",
    accountIdFactory: () => "acct_1",
    entitlementIdFactory: () => "ent_1"
  });
  const accessShell = createPlatformSubscriptionAccessShell({
    accountShell,
    nowFn: () => "2026-05-26T10:10:00.000Z",
    accessIdFactory: () => "access_1"
  });
  const lead = leadQueue.getLead(leadQueue.enqueueLead(sampleLead()).id);
  accountShell.createAccountFromLead(lead);
  accountShell.createEntitlement("acct_1", {
    plan: "pilot",
    status: "active",
    validUntil: "2026-06-26T00:00:00.000Z"
  });
  return { leadQueue, accountShell, accessShell };
}

test("admin platform access routes issue and list redacted dynamic entry summaries", async () => {
  const { leadQueue, accountShell, accessShell } = createPlatformState();
  const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell, accessShell })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/access-grants`);
    assert.equal(unauthenticated.status, 401);

    const created = await fetch(`${baseUrl}/api/admin/platform/accounts/acct_1/entitlements/ent_1/dynamic-entry`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        entryRef: "entry_ref_1",
        artifactRef: "artifact_ref_1",
        rawEntryUrl: "https://dynamic-entry.example/use?token=top-secret",
        subscriptionUrl: "https://sub.example/import?token=hidden",
        artifactSecret: "opaque_secret_value"
      })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.deepEqual(createdBody, {
      access: {
        id: "access_1",
        type: "subscription_access_grant_summary",
        accountId: "acct_1",
        entitlementId: "ent_1",
        status: "issued",
        delivery: "operator_issued",
        hasDynamicEntry: true,
        hasArtifact: true,
        visibleOnce: true,
        issuedAt: "2026-05-26T10:10:00.000Z",
        updatedAt: "2026-05-26T10:10:00.000Z"
      }
    });

    const listed = await fetch(`${baseUrl}/api/admin/platform/access-grants?accountId=acct_1`, {
      headers: authHeaders()
    });
    assert.equal(listed.status, 200);
    const serialized = JSON.stringify(await listed.json());
    assert.equal(serialized.includes("dynamic-entry.example"), false);
    assert.equal(serialized.includes("sub.example"), false);
    assert.equal(serialized.includes("top-secret"), false);
    assert.equal(serialized.includes("opaque_secret_value"), false);
    assert.equal(serialized.includes("token="), false);
    assert.equal(serialized.includes("entry_ref_1"), false);
    assert.equal(serialized.includes("artifact_ref_1"), false);
  } finally {
    server.close();
  }
});
