import { createHash } from "node:crypto";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function text(value) {
  return String(value ?? "").trim();
}

function safeRef(value, fallback = "") {
  const normalized = text(value);
  return SAFE_REF_PATTERN.test(normalized) ? normalized : fallback;
}

function nowIsoFrom(nowFn) {
  const value = typeof nowFn === "function" ? nowFn() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function runtimeAdapterName(server = {}) {
  return text(server.runtimeAdapter || server.edgeRuntimeAdapter || server.dataPlaneRuntimeAdapter);
}

function channelRefForServer(server = {}) {
  return safeRef(server.name || server.id);
}

function nodeRefForServer(server = {}) {
  return safeRef(server.physicalNodeRef || server.nodeRef || channelRefForServer(server));
}

function remoteServerMap(servers = []) {
  const map = new Map();
  for (const server of servers) {
    const channelRef = channelRefForServer(server);
    if (!channelRef || runtimeAdapterName(server) !== "remote-data-plane-handoff") {
      continue;
    }
    map.set(channelRef, {
      channelRef,
      nodeRef: nodeRefForServer(server)
    });
  }
  return map;
}

function orderChannelRefs(order = {}) {
  const refs = [];
  const seen = new Set();
  const push = (value) => {
    const ref = safeRef(value);
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  };
  if (Array.isArray(order.edgeCredentials)) {
    for (const credential of order.edgeCredentials) {
      push(credential?.edgeChannelRef || credential?.channelRef);
    }
  }
  push(order.edgeChannelRef || order.channelRef);
  return refs;
}

export function createDataPlaneDesiredStateNotifier({
  controlStore,
  servers = [],
  nowFn = () => new Date(),
  idFactory
} = {}) {
  const remoteChannels = remoteServerMap(servers);

  function recordNotification({ reason, channelRef, nodeRef, desiredState, createdAt }) {
    const id = safeRef(
      typeof idFactory === "function"
        ? idFactory({ reason, channelRef, nodeRef, desiredStateRef: desiredState.desiredStateRef })
        : "",
      `edge_state_notify_${sha256(`${reason}:${nodeRef}:${channelRef}:${desiredState.desiredStateRef}`).slice(0, 16)}`
    );
    return controlStore.recordEdgeDesiredStateNotification({
      id,
      nodeRef,
      channelRef,
      desiredStateRef: desiredState.desiredStateRef,
      generation: desiredState.generation,
      reason,
      status: "pending",
      createdAt,
      updatedAt: createdAt
    });
  }

  return {
    notifyOrderLifecycle({ reason, order } = {}) {
      if (
        !controlStore
        || typeof controlStore.getLatestEdgeDesiredStateForChannel !== "function"
        || typeof controlStore.recordEdgeDesiredStateNotification !== "function"
      ) {
        return {
          ok: true,
          redacted: true,
          notifications: [],
          nextAction: "desired_state_notification_store_unavailable"
        };
      }

      const safeReason = safeRef(reason, "order_lifecycle");
      const createdAt = nowIsoFrom(nowFn);
      const notifications = [];
      for (const channelRef of orderChannelRefs(order)) {
        const remote = remoteChannels.get(channelRef);
        if (!remote?.nodeRef) {
          continue;
        }
        const desiredState = controlStore.getLatestEdgeDesiredStateForChannel(channelRef, {
          nodeRef: remote.nodeRef,
          channelRefs: [channelRef]
        });
        if (!desiredState?.desiredStateRef || !desiredState?.generation) {
          continue;
        }
        notifications.push(recordNotification({
          reason: safeReason,
          channelRef,
          nodeRef: remote.nodeRef,
          desiredState,
          createdAt
        }));
      }

      return {
        ok: true,
        redacted: true,
        notificationCount: notifications.length,
        notifications: notifications.map((notification) => ({
          id: notification.id,
          nodeRef: notification.nodeRef,
          channelRef: notification.channelRef,
          desiredStateRef: notification.desiredStateRef,
          generation: notification.generation,
          status: notification.status
        })),
        nextAction: notifications.length > 0
          ? "remote_data_plane_desired_state_notification_pending"
          : "no_remote_data_plane_notification_required"
      };
    }
  };
}
