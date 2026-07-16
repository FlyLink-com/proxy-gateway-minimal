import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { createPlatformLeadReviewQueue } from "../services/platform/lead-review-queue.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fakeState(leadQueue) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform: { leadQueue },
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

test("public lead intake feeds the protected platform review queue", async () => {
  const leadQueue = createPlatformLeadReviewQueue({
    nowFn: () => "2026-05-26T10:00:00.000Z",
    idFactory: () => "lead_1"
  });
  const { server, baseUrl } = await listen(createApp(fakeState(leadQueue)));
  try {
    const submitted = await fetch(`${baseUrl}/api/public/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "lead_caller_supplied",
        status: "converted",
        organization: "Acme Research",
        email: "ops@example.com",
        direction: "预约自动化诊断",
        stage: "试点预算已确定",
        message: "需要把投放线索接入 AI 复盘流程。",
        source: "caller-supplied",
        createdAt: "2099-01-01T00:00:00.000Z",
        updatedAt: "2099-01-01T00:00:00.000Z"
      })
    });
    assert.equal(submitted.status, 202);

    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/leads`);
    assert.equal(unauthenticated.status, 401);

    const listed = await fetch(`${baseUrl}/api/admin/platform/leads`, {
      headers: authHeaders()
    });
    assert.equal(listed.status, 200);
    const body = await listed.json();
    assert.deepEqual(body.items, [{
      id: "lead_1",
      type: "platform_lead_summary",
      status: "new",
      organization: "Acme Research",
      email: "ops@example.com",
      direction: "预约自动化诊断",
      stage: "试点预算已确定",
      source: "company-site",
      hasMessage: true,
      createdAt: "2026-05-26T10:00:00.000Z",
      updatedAt: "2026-05-26T10:00:00.000Z"
    }]);
    assert.equal(JSON.stringify(body).includes("投放线索"), false);
  } finally {
    server.close();
  }
});

test("public lead intake reports durable queue failures as unavailable", async () => {
  const leadQueue = {
    enqueueLead() {
      throw new Error("synthetic local database failure");
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState(leadQueue)));

  try {
    const response = await fetch(`${baseUrl}/api/public/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization: "Synthetic Research",
        email: "synthetic@example.test",
        direction: "API Sandbox",
        message: "Synthetic local fixture only."
      })
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "lead_sink_unavailable" });
  } finally {
    server.close();
  }
});

test("admin platform lead route updates review status through the queue", async () => {
  let currentNow = "2026-05-26T10:00:00.000Z";
  const leadQueue = createPlatformLeadReviewQueue({
    nowFn: () => currentNow,
    idFactory: () => "lead_1"
  });
  leadQueue.enqueueLead({
    organization: "Acme Research",
    email: "ops@example.com",
    direction: "API Sandbox",
    message: "Need API sandbox access."
  });
  currentNow = "2026-05-26T10:10:00.000Z";

  const { server, baseUrl } = await listen(createApp(fakeState(leadQueue)));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/leads/lead_1/status`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: "reviewing" })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      lead: {
        id: "lead_1",
        type: "platform_lead_summary",
        status: "reviewing",
        organization: "Acme Research",
        email: "ops@example.com",
        direction: "API Sandbox",
        stage: "",
        source: "company-site",
        hasMessage: true,
        createdAt: "2026-05-26T10:00:00.000Z",
        updatedAt: "2026-05-26T10:10:00.000Z"
      }
    });
  } finally {
    server.close();
  }
});
