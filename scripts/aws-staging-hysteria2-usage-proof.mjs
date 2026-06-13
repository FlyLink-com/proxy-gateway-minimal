#!/usr/bin/env node
import "dotenv/config";
import { createHysteria2UsageCollector } from "../server/services/edge/hysteria2-usage-collector.mjs";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../server/services/platform/traffic-accounting.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function boolEnv(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function proofError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isLoopbackHostname(hostname) {
  const normalized = text(hostname).toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1";
}

function normalizeTrafficUrl(value) {
  const raw = text(value) || "http://127.0.0.1:9999/traffic";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw proofError("validation_error", "traffic stats URL must be a valid URL");
  }
  if (url.protocol !== "http:" || !isLoopbackHostname(url.hostname)) {
    throw proofError("validation_error", "traffic stats URL must be loopback HTTP");
  }
  url.searchParams.set("clear", "1");
  return url;
}

function blockerCodes(result) {
  return Array.isArray(result?.blockers)
    ? result.blockers.map((blocker) => text(blocker.code)).filter(Boolean)
    : [];
}

function redactedFailure(error) {
  return {
    ok: false,
    trafficStatsLoopbackOnly: false,
    readClearMode: true,
    collectorStatus: error?.code || "usage_proof_failed",
    accountingMode: "delta",
    observationCount: 0,
    mappedObservationCount: 0,
    usageLedgerRecorded: false,
    quotaDecision: null,
    blockers: [error?.code || "usage_proof_failed"],
    sensitiveOutputSuppressed: true
  };
}

async function fetchHy2TrafficStats({ url, secret }) {
  const headers = {};
  if (text(secret)) {
    headers.Authorization = text(secret);
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw proofError("runtime_fetch_failed", "traffic stats API request failed");
  }
  return await response.json();
}

export async function main(env = process.env) {
  const channelRef = text(env.HY2_USAGE_PROOF_CHANNEL_REF) || "channel-aws-staging-hy2";
  const recordUsage = boolEnv(env.HY2_USAGE_PROOF_RECORD);
  const controlDbPath = text(env.HY2_USAGE_PROOF_CONTROL_DB_PATH);
  const trafficUrl = normalizeTrafficUrl(env.HY2_USAGE_PROOF_TRAFFIC_URL);
  const collector = createHysteria2UsageCollector({
    channelRef,
    trafficReader: async () => fetchHy2TrafficStats({
      url: trafficUrl,
      secret: env.HY2_USAGE_PROOF_TRAFFIC_SECRET
    })
  });
  const collected = await collector.collect({
    since: text(env.HY2_USAGE_PROOF_SINCE) || undefined
  });
  const observations = Array.isArray(collected.observations) ? collected.observations : [];
  let mappedObservationCount = 0;
  let usageLedgerRecorded = false;
  let quotaDecision = null;
  let store;

  try {
    if (recordUsage && observations.length > 0) {
      if (!controlDbPath) {
        throw proofError("validation_error", "control DB path is required when recording usage");
      }
      store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
      const accounting = createTrafficAccountingService({ controlStore: store });
      for (const observation of observations) {
        const recorded = accounting.recordUsageObservation(observation);
        if (recorded.ok) {
          mappedObservationCount += 1;
          usageLedgerRecorded = usageLedgerRecorded || Boolean(recorded.sampleInserted);
          quotaDecision = recorded.status;
        }
      }
    }
  } finally {
    store?.close();
  }

  return {
    ok: collected.ok === true,
    trafficStatsLoopbackOnly: true,
    readClearMode: true,
    collectorStatus: collected.status,
    accountingMode: collected.accountingMode || "delta",
    observationCount: observations.length,
    mappedObservationCount,
    usageLedgerRecorded,
    quotaDecision,
    blockers: blockerCodes(collected),
    sensitiveOutputSuppressed: true
  };
}

try {
  const summary = await main();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify(redactedFailure(error), null, 2)}\n`);
  process.exitCode = 1;
}
