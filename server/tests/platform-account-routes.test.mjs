import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { createPlatformAccountEntitlementShell } from "../services/platform/account-entitlement-shell.mjs";
import { createPlatformLeadReviewQueue } from "../services/platform/lead-review-queue.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fakeState({ leadQueue, accountShell }) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform: { leadQueue, accountShell },
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

test("admin platform routes convert reviewed leads into account shells", async () => {
  const leadQueue = createPlatformLeadReviewQueue({
    nowFn: () => "2026-05-26T10:00:00.000Z",
    idFactory: () => "lead_1"
  });
  const accountShell = createPlatformAccountEntitlementShell({
    nowFn: () => "2026-05-26T10:05:00.000Z",
    accountIdFactory: () => "acct_1"
  });
  leadQueue.enqueueLead(sampleLead());

  const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/accounts`);
    assert.equal(unauthenticated.status, 401);

    const created = await fetch(`${baseUrl}/api/admin/platform/leads/lead_1/account`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ displayName: "Acme Ops" })
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), {
      account: {
        id: "acct_1",
        type: "platform_account_summary",
        leadId: "lead_1",
        status: "pending_review",
        organization: "Acme Research",
        email: "ops@example.com",
        displayName: "Acme Ops",
        entitlementCount: 0,
        usableEntitlementCount: 0,
        createdAt: "2026-05-26T10:05:00.000Z",
        updatedAt: "2026-05-26T10:05:00.000Z"
      },
      lead: {
        id: "lead_1",
        type: "platform_lead_summary",
        status: "converted",
        organization: "Acme Research",
        email: "ops@example.com",
        direction: "API Sandbox",
        stage: "pilot budget approved",
        source: "company-site",
        hasMessage: true,
        createdAt: "2026-05-26T10:00:00.000Z",
        updatedAt: "2026-05-26T10:00:00.000Z"
      }
    });

    const listed = await fetch(`${baseUrl}/api/admin/platform/accounts`, {
      headers: authHeaders()
    });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(JSON.stringify(listedBody).includes("sandbox access"), false);
    assert.equal(listedBody.items.length, 1);
    assert.equal(listedBody.items[0].id, "acct_1");
  } finally {
    server.close();
  }
});

test("admin platform routes create and list account entitlements", async () => {
  const leadQueue = createPlatformLeadReviewQueue({
    nowFn: () => "2026-05-26T10:00:00.000Z",
    idFactory: () => "lead_1"
  });
  const accountShell = createPlatformAccountEntitlementShell({
    nowFn: () => "2026-05-26T10:05:00.000Z",
    accountIdFactory: () => "acct_1",
    entitlementIdFactory: () => "ent_1"
  });
  const lead = leadQueue.getLead(leadQueue.enqueueLead(sampleLead()).id);
  accountShell.createAccountFromLead(lead);

  const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell })));
  try {
    const created = await fetch(`${baseUrl}/api/admin/platform/accounts/acct_1/entitlements`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        plan: "pilot",
        status: "active",
        validUntil: "2026-06-26T00:00:00.000Z",
        quota: { trafficGb: 100 }
      })
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), {
      entitlement: {
        id: "ent_1",
        type: "platform_entitlement_summary",
        accountId: "acct_1",
        status: "active",
        plan: "pilot",
        usable: true,
        validUntil: "2026-06-26T00:00:00.000Z",
        quota: { trafficGb: 100 },
        createdAt: "2026-05-26T10:05:00.000Z",
        updatedAt: "2026-05-26T10:05:00.000Z"
      }
    });

    const listed = await fetch(`${baseUrl}/api/admin/platform/entitlements?accountId=acct_1`, {
      headers: authHeaders()
    });
    assert.equal(listed.status, 200);
    const body = await listed.json();
    assert.deepEqual(body.items.map((item) => item.id), ["ent_1"]);
  } finally {
    server.close();
  }
});

test("admin platform routes manage account lifecycle without physical delete", async () => {
  const leadQueue = createPlatformLeadReviewQueue({
    nowFn: () => "2026-05-26T10:00:00.000Z",
    idFactory: () => "lead_1"
  });
  const accountShell = createPlatformAccountEntitlementShell({
    nowFn: () => "2026-05-26T10:05:00.000Z",
    accountIdFactory: () => "acct_user_management_1"
  });

  const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell })));
  try {
    const created = await fetch(`${baseUrl}/api/admin/platform/accounts`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        approvalRef: "approval_user_create_1",
        displayName: "User Alpha",
        email: "alpha@example.com",
        operatorRef: "operator_safe_1",
        organization: "Alpha Account",
        status: "active"
      })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.account.id, "acct_user_management_1");
    assert.equal(createdBody.account.status, "active");
    assert.equal(createdBody.mutation.action, "account_created");
    assert.equal(createdBody.mutation.auditRequired, true);

    const edited = await fetch(`${baseUrl}/api/admin/platform/accounts/acct_user_management_1`, {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        approvalRef: "approval_user_edit_1",
        displayName: "User Beta",
        operatorRef: "operator_safe_1",
        reason: "safe profile correction",
        status: "suspended"
      })
    });
    assert.equal(edited.status, 200);
    const editedBody = await edited.json();
    assert.equal(editedBody.account.displayName, "User Beta");
    assert.equal(editedBody.account.status, "suspended");
    assert.equal(editedBody.mutation.action, "account_updated");

    const disabled = await fetch(`${baseUrl}/api/admin/platform/accounts/acct_user_management_1/disable`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        approvalRef: "approval_user_disable_1",
        operatorRef: "operator_safe_1",
        reason: "operator reviewed abuse report"
      })
    });
    assert.equal(disabled.status, 200);
    const disabledBody = await disabled.json();
    assert.equal(disabledBody.account.status, "disabled");
    assert.equal(disabledBody.mutation.action, "account_disabled");

    const deletePreview = await fetch(`${baseUrl}/api/admin/platform/accounts/acct_user_management_1/delete-dry-run`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        approvalRef: "approval_user_delete_preview_1",
        operatorRef: "operator_safe_1",
        reason: "operator requested retention review"
      })
    });
    assert.equal(deletePreview.status, 200);
    assert.deepEqual(await deletePreview.json(), {
      deletion: {
        accountId: "acct_user_management_1",
        accountStatus: "disabled",
        activeEntitlementCount: 0,
        entitlementCount: 0,
        hardDeleteAvailable: false,
        nextAction: "retain_auditable_account_or_disable_only",
        state: "blocked",
        safety: {
          accountDeleted: false,
          entitlementsDeleted: false,
          runtimeMutation: false
        }
      }
    });

    const hardDelete = await fetch(`${baseUrl}/api/admin/platform/accounts/acct_user_management_1`, {
      method: "DELETE",
      headers: authHeaders()
    });
    assert.equal(hardDelete.status, 409);
    assert.deepEqual(await hardDelete.json(), {
      error: "lifecycle_blocked",
      message: "physical account delete is disabled"
    });

    const listed = await fetch(`${baseUrl}/api/admin/platform/accounts`, {
      headers: authHeaders()
    });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.deepEqual(listedBody.items.map((item) => [item.id, item.status]), [
      ["acct_user_management_1", "disabled"]
    ]);
  } finally {
    server.close();
  }
});

test("admin platform account mutations require operator and approval refs", async () => {
  const leadQueue = createPlatformLeadReviewQueue({
    nowFn: () => "2026-05-26T10:00:00.000Z",
    idFactory: () => "lead_1"
  });
  const accountShell = createPlatformAccountEntitlementShell({
    nowFn: () => "2026-05-26T10:05:00.000Z",
    accountIdFactory: () => "acct_user_management_1"
  });

  const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell })));
  try {
    const created = await fetch(`${baseUrl}/api/admin/platform/accounts`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        displayName: "User Alpha",
        email: "alpha@example.com",
        organization: "Alpha Account",
        status: "active"
      })
    });
    assert.equal(created.status, 400);
    assert.deepEqual(await created.json(), {
      error: "validation_error",
      message: "operatorRef is required"
    });

    const listed = await fetch(`${baseUrl}/api/admin/platform/accounts`, {
      headers: authHeaders()
    });
    assert.equal(listed.status, 200);
    assert.deepEqual(await listed.json(), { items: [] });
  } finally {
    server.close();
  }
});
