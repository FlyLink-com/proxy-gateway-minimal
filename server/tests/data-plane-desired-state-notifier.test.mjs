import assert from "node:assert/strict";
import test from "node:test";

import {
  createDataPlaneDesiredStateNotifier
} from "../services/edge/data-plane-desired-state-notifier.mjs";

function notifierFixture({ lifecycleRevisionSafe = true } = {}) {
  const notifications = new Map();
  const writes = [];
  const controlStore = {
    getLatestEdgeDesiredStateForChannel(channelRef, { nodeRef } = {}) {
      return {
        desiredStateRef: `desired_state_${channelRef}_exact`,
        nodeRef,
        generation: `gen_${channelRef}_exact`,
        channelRefs: [channelRef],
        lifecycleRevisionSafe,
        redacted: true
      };
    },
    getEdgeDesiredStateNotification(id) {
      return notifications.get(id) ?? null;
    },
    recordEdgeDesiredStateNotification(input) {
      writes.push(input);
      notifications.set(input.id, { ...input });
      return notifications.get(input.id);
    }
  };
  const notifier = createDataPlaneDesiredStateNotifier({
    controlStore,
    servers: [{
      id: "channel-quota-remote",
      name: "channel-quota-remote",
      nodeRef: "node-quota-remote",
      runtimeAdapter: "remote-data-plane-handoff"
    }],
    nowFn: () => "2026-03-01T00:00:00.000Z"
  });
  const input = {
    reason: "traffic_supply_resumed",
    order: {
      edgeChannelRef: "channel-quota-remote"
    }
  };
  return { input, notifications, notifier, writes };
}

test("desired-state notifier preserves an exact applied deterministic notification", () => {
  const fixture = notifierFixture();
  const first = fixture.notifier.notifyOrderLifecycle(fixture.input);
  const notificationId = first.notifications[0].id;
  fixture.notifications.set(notificationId, {
    ...fixture.notifications.get(notificationId),
    status: "applied",
    updatedAt: "2026-03-01T00:01:00.000Z"
  });

  const repeated = fixture.notifier.notifyOrderLifecycle(fixture.input);

  assert.equal(first.notifications[0].status, "pending");
  assert.equal(repeated.notifications[0].status, "applied");
  assert.equal(fixture.writes.length, 1);
  assert.equal(
    fixture.notifications.get(notificationId).updatedAt,
    "2026-03-01T00:01:00.000Z"
  );
});

test("desired-state notifier does not reuse applied state without lifecycle revision safety", () => {
  const fixture = notifierFixture({ lifecycleRevisionSafe: false });
  const first = fixture.notifier.notifyOrderLifecycle(fixture.input);
  const notificationId = first.notifications[0].id;
  fixture.notifications.set(notificationId, {
    ...fixture.notifications.get(notificationId),
    status: "applied",
    updatedAt: "2026-03-01T00:01:00.000Z"
  });

  const repeated = fixture.notifier.notifyOrderLifecycle(fixture.input);

  assert.equal(repeated.notifications[0].status, "pending");
  assert.equal(fixture.writes.length, 2);
});

test("desired-state notifier does not preserve an applied row with identity drift", () => {
  const fixture = notifierFixture();
  const first = fixture.notifier.notifyOrderLifecycle(fixture.input);
  const notificationId = first.notifications[0].id;
  fixture.notifications.set(notificationId, {
    ...fixture.notifications.get(notificationId),
    desiredStateRef: "desired_state_stale",
    status: "applied"
  });

  const repeated = fixture.notifier.notifyOrderLifecycle(fixture.input);

  assert.equal(repeated.notifications[0].status, "pending");
  assert.equal(fixture.writes.length, 2);
});
