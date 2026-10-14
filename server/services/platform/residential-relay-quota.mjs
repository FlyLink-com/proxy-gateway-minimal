// Monthly (30-day) recurring quota for the residential relay pack.
// Unlike #753 lifetime packs, usage resets at each period boundary measured
// from the order's activation anchor. Used bytes are never restored inside a
// period (credential reset/refresh keeps the period usage).
import { RESIDENTIAL_RELAY_PERIOD_DAYS } from "./residential-relay-pack-product.mjs";

const DAY_MS = 86_400_000;
const PERIOD_MS = RESIDENTIAL_RELAY_PERIOD_DAYS * DAY_MS;

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

export function residentialPeriod({ anchorAt, now }) {
  const anchor = ms(anchorAt, "residential_quota_anchor_invalid"), at = ms(now, "residential_quota_time_invalid");
  if (at < anchor) throw fail("residential_quota_time_invalid");
  const index = Math.floor((at - anchor) / PERIOD_MS);
  return { index, startAt: new Date(anchor + index * PERIOD_MS).toISOString(), endAt: new Date(anchor + (index + 1) * PERIOD_MS).toISOString() };
}

function counter(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw fail("residential_quota_counter_invalid");
  return value;
}

// state: { periodIndex, usedBytes, lastCounter, runtimeGeneration } (null for first sample)
// sample: { at, counterBytes (up+down cumulative from relay), runtimeGeneration }
// A runtime generation change (relay restart) means the cumulative counter
// restarted at 0, so the full new value is the delta.
// Bytes in a sample spanning a period boundary are attributed to the sample's
// period (sampling interval is minutes; documented approximation).
export function accumulateResidentialUsage({ state, sample, anchorAt }) {
  const value = counter(sample?.counterBytes);
  const period = residentialPeriod({ anchorAt, now: sample.at });
  if (!state) return { periodIndex: period.index, usedBytes: 0, lastCounter: value, runtimeGeneration: sample.runtimeGeneration };
  if (period.index < state.periodIndex) throw fail("residential_quota_time_regressed");
  const sameRuntime = sample.runtimeGeneration === state.runtimeGeneration;
  if (sameRuntime && value < state.lastCounter) throw fail("residential_quota_counter_regressed");
  const delta = sameRuntime ? value - state.lastCounter : value;
  const carried = period.index === state.periodIndex ? state.usedBytes : 0;
  return { periodIndex: period.index, usedBytes: carried + delta, lastCounter: value, runtimeGeneration: sample.runtimeGeneration };
}

// paidThroughAt: end of the last paid period. Renewal policy is a TODO for
// Ethan; until decided, an unpaid period simply disables the credential.
export function evaluateResidentialQuota({ anchorAt, now, quotaBytes, state, paidThroughAt }) {
  if (!Number.isSafeInteger(quotaBytes) || quotaBytes <= 0) throw fail("residential_quota_invalid");
  const period = residentialPeriod({ anchorAt, now });
  const used = state && state.periodIndex === period.index ? state.usedBytes : 0;
  const paid = ms(paidThroughAt, "residential_quota_paid_through_invalid") > ms(now, "residential_quota_time_invalid");
  const remainingBytes = Math.max(0, quotaBytes - used);
  const reason = !paid ? "period_unpaid" : remainingBytes === 0 ? "quota_exhausted" : null;
  return { period, usedBytes: used, remainingBytes, enabled: reason === null, reason };
}

// Parse `xray api statsquery` JSON or sing-box v2ray_api equivalent.
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

// Compare our per-tag outbound counters with the upstream residential panel.
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
