import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

function fakeState(sink) {
  return {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    publicLeads: { sink },
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

test("public lead intake accepts validated company-site submissions without auth", async () => {
  const received = [];
  const { server, baseUrl } = await listen(createApp(fakeState(async (lead) => received.push(lead))));
  try {
    const response = await fetch(`${baseUrl}/api/public/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization: "Acme Research",
        email: "OPS@EXAMPLE.COM",
        direction: "预约自动化诊断",
        stage: "试点预算已确定",
        message: "需要把投放线索接入 AI 复盘流程。"
      })
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { ok: true, status: "accepted" });
    assert.equal(received.length, 1);
    assert.equal(received[0].organization, "Acme Research");
    assert.equal(received[0].email, "ops@example.com");
    assert.equal(received[0].source, "company-site");
  } finally {
    server.close();
  }
});

test("public lead intake rejects invalid email and does not echo submission fields", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState(async () => {})));
  try {
    const response = await fetch(`${baseUrl}/api/public/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization: "Acme Research",
        email: "not-an-email",
        direction: "API 沙盒",
        message: "需要 API 试用。"
      })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "validation_error" });
  } finally {
    server.close();
  }
});
