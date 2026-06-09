import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createDataPlaneHandoffQueue } from "../services/edge/data-plane-handoff-queue.mjs";
import { listen } from "./helpers/listen.mjs";

async function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "gccgw-data-plane-handoff-queue-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function writeHandoff(dir, payload) {
  const filePath = join(dir, `${payload.handoffRef}.json`);
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  return filePath;
}

function fakeState(platform = {}) {
  return {
    rootDir: process.cwd(),
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    platform,
    subscriptions: {},
    services: {
      ssLocal: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) },
      httpProxy: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) }
    },
    isPortListening: async () => false
  };
}

function authHeaders() {
  return { Authorization: "Bearer secret", "Content-Type": "application/json" };
}

test("data-plane handoff queue lists pending handoffs without raw credential material", async () => {
  await withTempDir((dir) => {
    writeHandoff(dir, {
      type: "gccgw_remote_data_plane_credential_handoff",
      handoffRef: "handoff_channel-sgp-a-hy2_20260609",
      channelRef: "channel-sgp-a-hy2",
      physicalNodeRef: "vultr-sgp-a",
      runtime: "hysteria2",
      activationSurface: "explicit-restart",
      actions: [
        {
          action: "add",
          credentialRef: "edgecred_pareq_safe_channel-sgp-a-hy2",
          orderRef: "pareq_safe",
          userRef: "portal_user_safe",
          materialFingerprint: "sha256:abcdef1234567890"
        }
      ],
      nextAction: "apply_on_data_plane_node",
      mutation: false,
      redacted: true,
      generatedAt: "2026-06-09T00:00:00.000Z"
    });

    const queue = createDataPlaneHandoffQueue({ handoffDir: dir });
    const pending = queue.listPending();
    assert.equal(pending.length, 1);
    assert.deepEqual(pending[0], {
      handoffRef: "handoff_channel-sgp-a-hy2_20260609",
      channelRef: "channel-sgp-a-hy2",
      physicalNodeRef: "vultr-sgp-a",
      runtime: "hysteria2",
      activationSurface: "explicit-restart",
      actionCount: 1,
      addCount: 1,
      revokeCount: 0,
      rotateCount: 0,
      unchangedCount: 0,
      status: "pending",
      nextAction: "apply_on_data_plane_node",
      generatedAt: "2026-06-09T00:00:00.000Z"
    });
    assert.doesNotMatch(JSON.stringify(pending), /edgecred_|password|token|subscriptionUrl|rawConfig|material/i);
  });
});

test("data-plane handoff queue archives only explicitly selected safe handoffs", async () => {
  await withTempDir((dir) => {
    const archiveDir = join(dir, "archive");
    mkdirSync(archiveDir);
    writeHandoff(dir, {
      type: "gccgw_remote_data_plane_credential_handoff",
      handoffRef: "handoff_channel-sgp-a-tuic_20260609",
      channelRef: "channel-sgp-a-tuic",
      physicalNodeRef: "vultr-sgp-a",
      runtime: "mihomo-tuic",
      activationSurface: "explicit-restart",
      actions: [
        {
          action: "revoke",
          credentialRef: "edgecred_pareq_safe_channel-sgp-a-tuic",
          orderRef: "pareq_safe",
          userRef: "portal_user_safe"
        }
      ],
      mutation: false,
      redacted: true,
      generatedAt: "2026-06-09T00:00:00.000Z"
    });

    const queue = createDataPlaneHandoffQueue({
      handoffDir: dir,
      archiveDir,
      now: () => new Date("2026-06-09T01:00:00.000Z")
    });
    const result = queue.archiveApplied({
      handoffRef: "handoff_channel-sgp-a-tuic_20260609",
      appliedByRef: "operator_reviewed_gate"
    });

    assert.equal(result.ok, true);
    assert.equal(result.handoffRef, "handoff_channel-sgp-a-tuic_20260609");
    assert.equal(result.status, "archived");
    assert.equal(result.mutation, false);
    assert.equal(queue.listPending().length, 0);
    const archived = readFileSync(join(archiveDir, "handoff_channel-sgp-a-tuic_20260609.json"), "utf8");
    assert.match(archived, /"archivedAt": "2026-06-09T01:00:00.000Z"/);
    assert.doesNotMatch(JSON.stringify(result), /edgecred_|password|token|subscriptionUrl|rawConfig|material/i);
  });
});

test("admin data-plane handoff queue API exposes pending summaries and archives reviewed handoffs", async () => {
  await withTempDir(async (dir) => {
    const archiveDir = join(dir, "archive");
    writeHandoff(dir, {
      type: "gccgw_remote_data_plane_credential_handoff",
      handoffRef: "handoff_channel-sgp-a-hy2_route",
      channelRef: "channel-sgp-a-hy2",
      physicalNodeRef: "vultr-sgp-a",
      runtime: "hysteria2",
      activationSurface: "explicit-restart",
      actions: [
        {
          action: "add",
          credentialRef: "edgecred_pareq_route_channel-sgp-a-hy2",
          orderRef: "pareq_route",
          userRef: "portal_user_route"
        }
      ],
      mutation: false,
      redacted: true,
      generatedAt: "2026-06-09T00:00:00.000Z"
    });
    const queue = createDataPlaneHandoffQueue({
      handoffDir: dir,
      archiveDir,
      now: () => new Date("2026-06-09T02:00:00.000Z")
    });
    const { server, baseUrl } = await listen(createApp(fakeState({ dataPlaneHandoffQueue: queue })));
    try {
      const listResponse = await fetch(`${baseUrl}/api/admin/platform/data-plane-handoff-queue`, {
        headers: authHeaders()
      });
      assert.equal(listResponse.status, 200);
      const listBody = await listResponse.json();
      assert.equal(listBody.queue.type, "data_plane_handoff_queue");
      assert.equal(listBody.queue.pending.length, 1);
      assert.equal(listBody.queue.pending[0].channelRef, "channel-sgp-a-hy2");
      assert.equal(listBody.queue.safety.rawCredentialReturned, false);
      assert.doesNotMatch(JSON.stringify(listBody), /edgecred_|password|token|subscriptionUrl|rawConfig/i);

      const archiveResponse = await fetch(
        `${baseUrl}/api/admin/platform/data-plane-handoff-queue/handoff_channel-sgp-a-hy2_route/archive`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ appliedByRef: "operator_reviewed_gate" })
        }
      );
      assert.equal(archiveResponse.status, 202);
      const archiveBody = await archiveResponse.json();
      assert.equal(archiveBody.archive.ok, true);
      assert.equal(archiveBody.archive.status, "archived");
      assert.doesNotMatch(JSON.stringify(archiveBody), /edgecred_|password|token|subscriptionUrl|rawConfig/i);
    } finally {
      server.close();
    }
  });
});
