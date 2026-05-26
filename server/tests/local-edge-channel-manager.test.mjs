import assert from "node:assert/strict";
import test from "node:test";
import { createChannelManager, normalizeChannelCandidate } from "../../agent/channel-manager.mjs";

function fakeSocket(label) {
  return {
    label,
    destroyed: false,
    destroy() {
      this.destroyed = true;
    }
  };
}

test("channel manager fails over across injected candidates without leaking targets", async () => {
  const attempts = [];
  const manager = createChannelManager({
    candidates: [
      {
        id: "ss-baseline",
        channel: {
          async openTcp(target) {
            attempts.push(["ss-baseline", target]);
            throw new Error(`cannot reach ${target.host}`);
          }
        }
      },
      {
        id: "vless-xudp",
        channel: {
          async openTcp(target) {
            attempts.push(["vless-xudp", target]);
            return fakeSocket("candidate");
          }
        }
      }
    ]
  });

  const socket = await manager.openTcp({ host: "secret-target.example", port: 443, addressType: "domain" });
  const diagnostics = manager.diagnosticsSnapshot();
  const serialized = JSON.stringify(diagnostics);

  assert.equal(socket.label, "candidate");
  assert.deepEqual(
    attempts.map(([id]) => id),
    ["ss-baseline", "vless-xudp"]
  );
  assert.deepEqual(diagnostics, {
    ok: true,
    activeCandidateId: "vless-xudp",
    candidateIds: ["ss-baseline", "vless-xudp"],
    counters: {
      connectOk: 1,
      connectFailure: 1
    },
    lastFailure: null
  });
  assert.doesNotMatch(serialized, /secret-target|cannot reach|example/i);
});

test("channel manager fails closed when all candidates fail", async () => {
  const manager = createChannelManager({
    candidates: [
      {
        id: "ss-baseline",
        channel: {
          async openTcp(target) {
            throw new Error(`raw failure ${target.host}`);
          }
        }
      },
      {
        id: "quic-research",
        channel: {
          async openTcp(target) {
            throw new Error(`raw failure ${target.host}`);
          }
        }
      }
    ]
  });

  await assert.rejects(
    () => manager.openTcp({ host: "secret-target.example", port: 443, addressType: "domain" }),
    /channel manager connect failed/
  );

  const diagnostics = manager.diagnosticsSnapshot();
  const serialized = JSON.stringify(diagnostics);
  assert.deepEqual(diagnostics, {
    ok: true,
    activeCandidateId: null,
    candidateIds: ["ss-baseline", "quic-research"],
    counters: {
      connectOk: 0,
      connectFailure: 2
    },
    lastFailure: { class: "channel_failure" }
  });
  assert.doesNotMatch(serialized, /secret-target|raw failure|example/i);
});

test("channel candidate normalization rejects unsafe ids and missing channels", () => {
  const channel = { openTcp: async () => fakeSocket("ok") };

  assert.deepEqual(normalizeChannelCandidate({ id: "tech-edge-a", channel }), {
    id: "tech-edge-a",
    channel
  });
  assert.throws(
    () => normalizeChannelCandidate({ id: "secret.example", channel }),
    /channel candidate id must be a non-secret identifier/
  );
  assert.throws(
    () => normalizeChannelCandidate({ id: "candidate" }),
    /channel candidate openTcp is required/
  );
});
