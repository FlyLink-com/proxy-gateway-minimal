import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
  assessChannelExtendedMeasurement,
  buildAccessModelInventorySummary,
  buildCleanEdgeReadinessSummary,
  buildChannelCandidateReport,
  buildChannelDecisionPack,
  buildChannelLabTargetDecision,
  buildChannelRuntimeExecutionHandoff,
  buildChannelRuntimeEvidenceBridge,
  buildChannelRuntimeGateWorkbench,
  buildChannelRuntimeGatePacket,
  buildChannelRuntimeInventorySummary,
  buildChannelRuntimeRegistry,
  buildChannelSubscriptionActivationFlow,
  CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION,
  createChannelSubscriptionActivationFlowFixture,
  normalizeChannelSubscriptionActivationFlowFixture,
  replayChannelSubscriptionActivationFlowFixture,
  buildChannelSubscriptionActivationHandoff,
  buildChannelSubscriptionActivationReadiness,
  buildChannelSubscriptionOutputDraft,
  buildChannelSystemDecisionFlow,
  buildChannelExtendedMeasurementReport,
  buildChannelMeasurementBundleReport,
  createApp,
  createRuntimeState,
  createChannelBenchmarkFixtureFromPlan,
  generateClashSubscription,
  normalizeChannelBenchmarkFixture,
  runChannelBenchmarkPlan,
  scoreChannelBenchmarkSummary,
  summarizeChannelBenchmarkResults,
  startProxyGateway
} from "../../index.mjs";

function fakeState() {
  let closeCount = 0;
  return {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 0, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    autoStartHttpProxy: false,
    services: {
      ssLocal: { stop: async () => ({ ok: true }) },
      httpProxy: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    close: () => {
      closeCount += 1;
    },
    get closeCount() {
      return closeCount;
    },
    isPortListening: async () => false
  };
}

test("package root exports stable module APIs", () => {
  assert.equal(typeof createApp, "function");
  assert.equal(typeof createRuntimeState, "function");
  assert.equal(typeof assessChannelExtendedMeasurement, "function");
  assert.equal(typeof buildAccessModelInventorySummary, "function");
  assert.equal(typeof buildCleanEdgeReadinessSummary, "function");
  assert.equal(typeof buildChannelCandidateReport, "function");
  assert.equal(typeof buildChannelDecisionPack, "function");
  assert.equal(typeof buildChannelLabTargetDecision, "function");
  assert.equal(typeof buildChannelRuntimeExecutionHandoff, "function");
  assert.equal(typeof buildChannelRuntimeEvidenceBridge, "function");
  assert.equal(typeof buildChannelRuntimeGateWorkbench, "function");
  assert.equal(typeof buildChannelRuntimeGatePacket, "function");
  assert.equal(typeof buildChannelRuntimeInventorySummary, "function");
  assert.equal(typeof buildChannelRuntimeRegistry, "function");
  assert.equal(typeof buildChannelSubscriptionActivationFlow, "function");
  assert.equal(typeof CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION, "string");
  assert.equal(typeof createChannelSubscriptionActivationFlowFixture, "function");
  assert.equal(typeof normalizeChannelSubscriptionActivationFlowFixture, "function");
  assert.equal(typeof replayChannelSubscriptionActivationFlowFixture, "function");
  assert.equal(typeof buildChannelSubscriptionActivationHandoff, "function");
  assert.equal(typeof buildChannelSubscriptionActivationReadiness, "function");
  assert.equal(typeof buildChannelSubscriptionOutputDraft, "function");
  assert.equal(typeof buildChannelSystemDecisionFlow, "function");
  assert.equal(typeof buildChannelExtendedMeasurementReport, "function");
  assert.equal(typeof buildChannelMeasurementBundleReport, "function");
  assert.equal(typeof createChannelBenchmarkFixtureFromPlan, "function");
  assert.equal(typeof generateClashSubscription, "function");
  assert.equal(typeof CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION, "string");
  assert.equal(typeof normalizeChannelBenchmarkFixture, "function");
  assert.equal(typeof runChannelBenchmarkPlan, "function");
  assert.equal(typeof scoreChannelBenchmarkSummary, "function");
  assert.equal(typeof summarizeChannelBenchmarkResults, "function");
  assert.equal(typeof startProxyGateway, "function");
});

test("startProxyGateway starts and stops an embedded app", async () => {
  const state = fakeState();
  const handle = await startProxyGateway({
    state,
    logger: false
  });

  try {
    const address = handle.server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    await handle.stop();
  }

  assert.equal(state.closeCount, 1);
});

test("startProxyGateway startup logs do not expose the console token", async () => {
  const state = fakeState();
  const logs = [];
  const handle = await startProxyGateway({
    state,
    logger: { log: (...parts) => logs.push(parts.join(" ")) }
  });

  try {
    const output = logs.join("\n");
    assert.doesNotMatch(output, /secret/);
    assert.doesNotMatch(output, /Console Token:/);
    assert.match(output, /Console Token Source:/);
  } finally {
    await handle.stop();
  }
});

test("startProxyGateway closes runtime state when startup fails", async () => {
  const state = fakeState();
  state.autoStartHttpProxy = true;
  state.services.httpProxy.start = async () => {
    throw new Error("http proxy failed");
  };

  await assert.rejects(
    startProxyGateway({
      state,
      logger: false
    }),
    /http proxy failed/
  );

  assert.equal(state.closeCount, 1);
});
