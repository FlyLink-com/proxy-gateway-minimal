import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { createPlatformAccountEntitlementShell } from "../services/platform/account-entitlement-shell.mjs";
import { createPlatformLeadReviewQueue } from "../services/platform/lead-review-queue.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fakeState({ leadQueue, accountShell, controlStore }) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform: { leadQueue, accountShell, controlStore },
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

function createControlStoreFixture() {
  const database = new Database(":memory:");
  return {
    database,
    store: createSqliteSubscriptionControlStore({ database })
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

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
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
        quota: { trafficGb: 100, seats: 3 }
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
        quota: { trafficGb: 100, seats: 3 },
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

test("admin platform routes reject invalid in-memory entitlement validity intervals", async (t) => {
  const leadQueue = createPlatformLeadReviewQueue({
    nowFn: () => "2026-05-26T10:00:00.000Z",
    idFactory: () => "lead_1"
  });
  const accountShell = createPlatformAccountEntitlementShell({
    nowFn: () => "2026-05-26T10:05:00.000Z",
    accountIdFactory: () => "acct_1",
    entitlementIdFactory: () => "ent_invalid"
  });
  const lead = leadQueue.getLead(leadQueue.enqueueLead(sampleLead()).id);
  accountShell.createAccountFromLead(lead);

  const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell })));
  try {
    for (const [name, validFrom, validUntil] of [
      ["equal", "2026-06-26T00:00:00.000Z", "2026-06-26T00:00:00.000Z"],
      ["reversed", "2026-06-27T00:00:00.000Z", "2026-06-26T00:00:00.000Z"]
    ]) {
      await t.test(name, async () => {
        const response = await fetch(
          `${baseUrl}/api/admin/platform/accounts/acct_1/entitlements`,
          {
            method: "POST",
            headers: {
              ...authHeaders(),
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              plan: "pilot",
              status: "active",
              validFrom,
              validUntil
            })
          }
        );
        assert.equal(response.status, 400);
        assert.deepEqual(accountShell.listEntitlements({ accountId: "acct_1" }), []);
      });
    }
  } finally {
    server.close();
  }
});

test("admin platform routes list portal registration accounts from control store", async () => {
  const leadQueue = createPlatformLeadReviewQueue();
  const accountShell = createPlatformAccountEntitlementShell();
  const { database, store: controlStore } = createControlStoreFixture();
  const now = "2026-07-08T10:00:00.000Z";
  const validUntil = "2027-07-08T10:00:00.000Z";

  try {
    controlStore.createAccount({
      id: "acct_registration_1",
      ownerRef: "acct_registration_1",
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        registrationSource: "self_service_portal",
        loginRef: "local-user@example.test",
        displayRef: "local-user@example.test",
        registrationSourceIpDigest: "digest_should_not_be_listed",
        intentPlan: "trial"
      }
    });
    controlStore.createEntitlement({
      id: "ent_registration_trial_1",
      accountId: "acct_registration_1",
      plan: "trial",
      status: "active",
      validFrom: now,
      validUntil,
      maxArtifacts: 1,
      maxDevices: 1,
      trafficLimitBytes: 10 * 1024 ** 3,
      createdAt: now,
      updatedAt: now
    });

    const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell, controlStore })));
    try {
      const accounts = await fetch(`${baseUrl}/api/admin/platform/accounts`, {
        headers: authHeaders()
      });
      assert.equal(accounts.status, 200);
      const accountsBody = await accounts.json();
      assert.equal(accountsBody.items.length, 1);
      assert.deepEqual(accountsBody.items[0], {
        id: "acct_registration_1",
        type: "platform_account_summary",
        leadId: null,
        status: "active",
        organization: null,
        email: "local-user@example.test",
        displayName: "local-user@example.test",
        entitlementCount: 1,
        usableEntitlementCount: 1,
        createdAt: now,
        updatedAt: now
      });
      assert.equal(JSON.stringify(accountsBody).includes("digest_should_not_be_listed"), false);

      const entitlements = await fetch(`${baseUrl}/api/admin/platform/entitlements?accountId=acct_registration_1`, {
        headers: authHeaders()
      });
      assert.equal(entitlements.status, 200);
      const entitlementsBody = await entitlements.json();
      assert.deepEqual(entitlementsBody.items, [{
        id: "ent_registration_trial_1",
        type: "platform_entitlement_summary",
        accountId: "acct_registration_1",
        status: "active",
        plan: "trial",
        usable: true,
        validUntil,
        quota: {
          artifacts: 1,
          devices: 1,
          trafficGb: 10,
          trafficLimitBytes: 10 * 1024 ** 3
        },
        trafficLimitBytes: 10 * 1024 ** 3,
        maxArtifacts: 1,
        maxDevices: 1,
        createdAt: now,
        updatedAt: now
      }]);
    } finally {
      server.close();
    }
  } finally {
    database.close();
  }
});

test("admin platform routes create control-store account entitlements", async () => {
  const leadQueue = createPlatformLeadReviewQueue();
  const accountShell = createPlatformAccountEntitlementShell();
  const { database, store: controlStore } = createControlStoreFixture();
  const now = "2026-07-08T10:00:00.000Z";
  const validUntil = "2027-07-08T10:00:00.000Z";

  try {
    controlStore.createAccount({
      id: "acct_registration_2",
      ownerRef: "acct_registration_2",
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        registrationSource: "self_service_portal",
        loginRef: "control-user@example.test",
        displayRef: "control-user@example.test"
      }
    });

    const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell, controlStore })));
    try {
      const created = await fetch(`${baseUrl}/api/admin/platform/accounts/acct_registration_2/entitlements`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          plan: "yearly",
          status: "active",
          validUntil,
          quota: { trafficGb: 200, seats: 3 }
        })
      });
      assert.equal(created.status, 201);
      const createdBody = await created.json();
      assert.match(createdBody.entitlement.id, /^ent_admin_/);
      assert.deepEqual({
        ...createdBody.entitlement,
        id: "ent_admin_test"
      }, {
        id: "ent_admin_test",
        type: "platform_entitlement_summary",
        accountId: "acct_registration_2",
        status: "active",
        plan: "yearly",
        usable: true,
        validUntil,
        quota: {
          devices: 3,
          artifacts: 1,
          trafficGb: 200,
          trafficLimitBytes: 200 * 1024 ** 3
        },
        trafficLimitBytes: 200 * 1024 ** 3,
        maxArtifacts: 1,
        maxDevices: 3,
        createdAt: createdBody.entitlement.createdAt,
        updatedAt: createdBody.entitlement.updatedAt
      });

      const stored = controlStore.getEntitlement(createdBody.entitlement.id);
      assert.equal(stored.accountId, "acct_registration_2");
      assert.equal(stored.plan, "yearly");
      assert.equal(stored.trafficLimitBytes, 200 * 1024 ** 3);

      const listed = await fetch(`${baseUrl}/api/admin/platform/entitlements?accountId=acct_registration_2`, {
        headers: authHeaders()
      });
      assert.equal(listed.status, 200);
      const listedBody = await listed.json();
      assert.deepEqual(listedBody.items.map((item) => item.id), [createdBody.entitlement.id]);
    } finally {
      server.close();
    }
  } finally {
    database.close();
  }
});

test("admin platform routes apply the fixed five GiB trial allowance", async () => {
  const leadQueue = createPlatformLeadReviewQueue();
  const accountShell = createPlatformAccountEntitlementShell();
  const { database, store: controlStore } = createControlStoreFixture();
  const now = "2026-07-08T10:00:00.000Z";

  try {
    controlStore.createAccount({
      id: "acct_trial_limit",
      ownerRef: "acct_trial_limit",
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {}
    });

    const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell, controlStore })));
    try {
      const created = await fetch(`${baseUrl}/api/admin/platform/accounts/acct_trial_limit/entitlements`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          plan: "trial",
          status: "active",
          durationDays: 7,
          quota: { trafficGb: 0 }
        })
      });

      assert.equal(created.status, 201);
      const body = await created.json();
      assert.equal(body.entitlement.plan, "trial");
      assert.equal(body.entitlement.trafficLimitBytes, 5 * 1024 ** 3);
      assert.equal(body.entitlement.quota.trafficGb, 5);
      assert.equal(
        controlStore.getEntitlement(body.entitlement.id).trafficLimitBytes,
        5 * 1024 ** 3
      );
    } finally {
      server.close();
    }
  } finally {
    database.close();
  }
});

test("admin platform account search resolves legacy digest-only portal accounts without listing digests", async () => {
  const leadQueue = createPlatformLeadReviewQueue();
  const accountShell = createPlatformAccountEntitlementShell();
  const { database, store: controlStore } = createControlStoreFixture();
  const now = "2026-07-08T10:00:00.000Z";
  const legacyEmail = "legacy-user@example.test";
  const legacyEmailDigest = sha256Hex(legacyEmail);

  try {
    controlStore.createAccount({
      id: "acct_digest_only_1",
      ownerRef: "acct_digest_only_1",
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        registrationSource: "self_service_portal",
        contactDigest: legacyEmailDigest,
        loginDigest: legacyEmailDigest,
        displayDigest: "digest_should_not_be_listed"
      }
    });
    controlStore.createEntitlement({
      id: "ent_digest_only_trial_1",
      accountId: "acct_digest_only_1",
      plan: "trial",
      status: "active",
      validFrom: now,
      validUntil: "2026-07-15T10:00:00.000Z",
      maxArtifacts: 1,
      maxDevices: 1,
      trafficLimitBytes: 10 * 1024 ** 3,
      createdAt: now,
      updatedAt: now
    });

    const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell, controlStore })));
    try {
      const listed = await fetch(`${baseUrl}/api/admin/platform/accounts`, {
        headers: authHeaders()
      });
      assert.equal(listed.status, 200);
      const listedBody = await listed.json();
      assert.equal(listedBody.items.length, 1);
      assert.equal(listedBody.items[0].email, null);
      assert.equal(listedBody.items[0].displayName, "acct_digest_only_1");
      assert.equal(JSON.stringify(listedBody).includes(legacyEmail), false);
      assert.equal(JSON.stringify(listedBody).includes(legacyEmailDigest), false);
      assert.equal(JSON.stringify(listedBody).includes("digest_should_not_be_listed"), false);

      const searched = await fetch(`${baseUrl}/api/admin/platform/accounts?search=LEGACY-USER%40EXAMPLE.TEST`, {
        headers: authHeaders()
      });
      assert.equal(searched.status, 200);
      const searchedBody = await searched.json();
      assert.deepEqual(searchedBody.items.map((item) => item.id), ["acct_digest_only_1"]);
      assert.equal(searchedBody.items[0].email, legacyEmail);
      assert.equal(searchedBody.items[0].displayName, legacyEmail);
      assert.equal(JSON.stringify(searchedBody).includes(legacyEmailDigest), false);
      assert.equal(JSON.stringify(searchedBody).includes("digest_should_not_be_listed"), false);
    } finally {
      server.close();
    }
  } finally {
    database.close();
  }
});

test("admin platform account search rejects overlong email-shaped digest lookups", async () => {
  const leadQueue = createPlatformLeadReviewQueue();
  const accountShell = createPlatformAccountEntitlementShell();
  const { database, store: controlStore } = createControlStoreFixture();
  const now = "2026-07-15T00:00:00.000Z";
  const overlongEmail = `${"a".repeat(300)}@example.test`;

  try {
    controlStore.createAccount({
      id: "acct_overlong_digest_1",
      ownerRef: "acct_overlong_digest_1",
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        loginDigest: sha256Hex(overlongEmail),
        contactDigest: sha256Hex(overlongEmail)
      }
    });

    const { server, baseUrl } = await listen(createApp(fakeState({ leadQueue, accountShell, controlStore })));
    try {
      const response = await fetch(
        `${baseUrl}/api/admin/platform/accounts?search=${encodeURIComponent(overlongEmail)}`,
        { headers: authHeaders() }
      );

      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).items, []);
    } finally {
      server.close();
    }
  } finally {
    database.close();
  }
});
