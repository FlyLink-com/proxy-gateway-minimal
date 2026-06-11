function text(value) {
  return String(value ?? "").trim();
}

function token(value) {
  return text(value).toLowerCase().replace(/[\s_]+/g, "-");
}

function nowIsoFrom(nowFn) {
  const value = typeof nowFn === "function" ? nowFn() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function isFreshIso(value, nowIso) {
  const target = Date.parse(text(value));
  const now = Date.parse(nowIso);
  return !Number.isNaN(target) && !Number.isNaN(now) && target > now;
}

export function isRemoteDataPlaneChannel(server = {}) {
  const adapter = token(
    server.runtimeAdapter ||
    server.edgeRuntimeAdapter ||
    server.dataPlaneRuntimeAdapter ||
    server.runtime?.adapter
  );
  const mode = token(server.dataPlaneMode || server.runtimeMode || server.activationSurface);
  return adapter.includes("remote-data-plane") ||
    adapter.includes("data-plane-handoff") ||
    mode === "remote-data-plane";
}

function receiptMatchesDesired(receipt, desired) {
  if (!receipt || !desired) {
    return false;
  }
  if (receipt.status !== "applied") {
    return false;
  }
  if (receipt.desiredStateRef !== desired.desiredStateRef) {
    return false;
  }
  if (desired.generation && receipt.generation && receipt.generation !== desired.generation) {
    return false;
  }
  return receipt.configTestOk === true &&
    receipt.serviceActive === true &&
    (receipt.listenerPresent === true || receipt.listenerUdp443 === true) &&
    Number(receipt.credentialCount || 0) > 0;
}

export function createRemoteRenderGate({
  controlStore,
  nowFn = () => new Date()
} = {}) {
  return function remoteRenderGate({ servers = [], now } = {}) {
    const nowIso = now || nowIsoFrom(nowFn);
    const allowed = [];
    const blockers = [];

    for (const server of Array.isArray(servers) ? servers : []) {
      const channelRef = text(server?.name || server?.id);
      if (!channelRef || !isRemoteDataPlaneChannel(server)) {
        allowed.push(server);
        continue;
      }

      const desired = controlStore?.getLatestEdgeDesiredStateForChannel?.(channelRef);
      const receipt = controlStore?.getLatestEdgeApplyReceiptForChannel?.(channelRef);
      const lease = controlStore?.getActiveEdgeAgentLease?.({ channelRef, now: nowIso });
      if (!desired) {
        blockers.push({ channelRef, reasonCode: "missing_desired_state", redacted: true });
        continue;
      }
      if (!isFreshIso(desired.validUntil, nowIso)) {
        blockers.push({ channelRef, reasonCode: "stale_desired_state", redacted: true });
        continue;
      }
      if (!receiptMatchesDesired(receipt, desired)) {
        blockers.push({ channelRef, reasonCode: "missing_applied_receipt", redacted: true });
        continue;
      }
      if (!lease || !isFreshIso(lease.expiresAt, nowIso)) {
        blockers.push({ channelRef, reasonCode: "missing_fresh_lease", redacted: true });
        continue;
      }
      allowed.push(server);
    }

    return {
      servers: allowed,
      blockers,
      redacted: true
    };
  };
}
