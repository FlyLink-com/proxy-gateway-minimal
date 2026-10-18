// One-shot residential relay quota. Locked: no renewals, no unused-byte rollover,
// no refunds. Credential disables when the period ends or the quota is hit.
function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function ms(value, code) {
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(t)) throw fail(code);
  return t;
}

const DAY_MS = 86_400_000;

export function residentialPeriod({ anchorAt, now, durationDays }) {
  if (!Number.isSafeInteger(durationDays) || durationDays <= 0) throw fail("residential_quota_duration_invalid");
  const anchor = ms(anchorAt, "residential_quota_anchor_invalid");
  const at = ms(now, "residential_quota_time_invalid");
  if (at < anchor) throw fail("residential_quota_time_invalid");
  const endAt = new Date(anchor + durationDays * DAY_MS).toISOString();
  return { index: 0, startAt: new Date(anchor).toISOString(), endAt, ended: at >= Date.parse(endAt) };
}

function counter(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw fail("residential_quota_counter_invalid");
  return value;
}

// state: { usedBytes, lastCounter, runtimeGeneration } (null for first sample)
// sample: { at, counterBytes, runtimeGeneration }
export function accumulateResidentialUsage({ state, sample }) {
  const value = counter(sample?.counterBytes);
  if (!state) return { usedBytes: 0, lastCounter: value, runtimeGeneration: sample.runtimeGeneration };
  const sameRuntime = sample.runtimeGeneration === state.runtimeGeneration;
  if (sameRuntime && value < state.lastCounter) throw fail("residential_quota_counter_regressed");
  const delta = sameRuntime ? value - state.lastCounter : value;
  return { usedBytes: state.usedBytes + delta, lastCounter: value, runtimeGeneration: sample.runtimeGeneration };
}

export function evaluateResidentialQuota({ anchorAt, now, quotaBytes, durationDays, state }) {
  if (!Number.isSafeInteger(quotaBytes) || quotaBytes <= 0) throw fail("residential_quota_invalid");
  const period = residentialPeriod({ anchorAt, now, durationDays });
  if (period.ended) {
    return { period, usedBytes: state?.usedBytes ?? 0, remainingBytes: 0, enabled: false, reason: "period_ended" };
  }
  const used = state?.usedBytes ?? 0;
  if (!Number.isSafeInteger(used) || used < 0) throw fail("residential_quota_counter_invalid");
  const remainingBytes = Math.max(0, quotaBytes - used);
  const reason = remainingBytes === 0 ? "quota_exhausted" : null;
  return { period, usedBytes: used, remainingBytes, enabled: reason === null, reason };
}

export function parseRelayStats(payload) {
  const list = Array.isArray(payload?.stat) ? payload.stat : null;
  if (!list) throw fail("residential_stats_invalid");
  const users = new Map(), outbounds = new Map();
  for (const item of list) {
    const parts = String(item?.name ?? "").split(">>>");
    if (parts.length !== 4 || parts[2] !== "traffic" || !["uplink", "downlink"].includes(parts[3])) continue;
    const target = parts[0] === "user" ? users : parts[0] === "outbound" ? outbounds : null;
    if (!target) continue;
    const value = Number(item.value ?? 0);
    if (!Number.isSafeInteger(value) || value < 0) throw fail("residential_stats_invalid");
    const row = target.get(parts[1]) || { uplink: 0, downlink: 0 };
    row[parts[3]] += value;
    target.set(parts[1], row);
  }
  return { users, outbounds };
}

export function reconcileResidentialOutbounds({ outbounds, upstreamBytesByTag, toleranceBasisPoints = 500 }) {
  const rows = [];
  for (const [tag, upstream] of Object.entries(upstreamBytesByTag)) {
    const ours = outbounds.get(tag);
    const local = ours ? ours.uplink + ours.downlink : 0;
    const diff = Math.abs(local - upstream);
    const allowed = Math.ceil(Math.max(local, upstream) * toleranceBasisPoints / 10_000);
    rows.push({ tag, localBytes: local, upstreamBytes: upstream, diffBytes: diff, withinTolerance: diff <= allowed });
  }
  for (const tag of outbounds.keys()) if (tag.startsWith("resi-us-") && !(tag in upstreamBytesByTag)) {
    const o = outbounds.get(tag);
    rows.push({ tag, localBytes: o.uplink + o.downlink, upstreamBytes: null, diffBytes: null, withinTolerance: false });
  }
  return rows;
}
