export const CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION =
  "channel-subscription-activation-flow-fixture/v1";

const FIXTURE_KEYS = new Set([
  "schemaVersion",
  "generatedAt",
  "sourceGeneratedAt",
  "activationFlow",
  "safety"
]);

const UNSAFE_KEY_PATTERN = /host|port|url|token|secret|credential|password|rawlog|rawlogs|rawerror|rawerrors|approvalphrase/i;
const UNSAFE_VALUE_PATTERN = /[a-z][a-z0-9+.-]*:\/\/|token=|secret\.example|secret-token|approvalPhrase/i;

const OMITTED_FIELDS = [
  "hosts",
  "ports",
  "urls",
  "credentials",
  "rawLogs",
  "tokens",
  "subscriptionUrls",
  "yaml"
];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function unsafeFixtureError() {
  return new Error("channel subscription activation flow fixture contains unsafe runtime details");
}

function assertFixtureKeys(payload) {
  for (const key of Object.keys(payload)) {
    if (!FIXTURE_KEYS.has(key)) {
      throw new Error("activation flow fixture contains unsupported metadata");
    }
  }
}

function assertNoUnsafeRuntimeDetails(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoUnsafeRuntimeDetails(item);
    }
    return;
  }

  if (!isObject(value)) {
    if (typeof value === "string" && UNSAFE_VALUE_PATTERN.test(value)) {
      throw unsafeFixtureError();
    }
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (UNSAFE_KEY_PATTERN.test(key)) {
      throw unsafeFixtureError();
    }
    assertNoUnsafeRuntimeDetails(nestedValue);
  }
}

function assertActivationFlow(value) {
  if (!isObject(value) || value.ok !== true || value.mode !== "channel-subscription-activation-flow") {
    throw new Error("channel subscription activation flow fixture requires an activation flow packet");
  }
  assertNoUnsafeRuntimeDetails(value);
}

function fixtureSafety(overrides = {}) {
  return {
    advisoryOnly: true,
    summaryOnly: true,
    fixtureOnly: true,
    replayOnly: false,
    noRuntimeMutation: true,
    noProductionMutation: true,
    noApprovalSubmission: true,
    noTrafficMovement: true,
    noSubscriptionOutputMutation: true,
    yamlNotGenerated: true,
    requiresSeparateRiskAApproval: true,
    omittedFields: OMITTED_FIELDS,
    ...overrides
  };
}

export function createChannelSubscriptionActivationFlowFixture(
  activationFlow,
  { generatedAt = new Date().toISOString() } = {}
) {
  assertActivationFlow(activationFlow);

  const safeActivationFlow = cloneJson(activationFlow);
  return {
    schemaVersion: CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION,
    generatedAt,
    sourceGeneratedAt: text(safeActivationFlow.generatedAt),
    activationFlow: safeActivationFlow,
    safety: fixtureSafety()
  };
}

export function normalizeChannelSubscriptionActivationFlowFixture(payload) {
  if (!isObject(payload)) {
    throw new Error("channel subscription activation flow fixture must be an object");
  }

  assertFixtureKeys(payload);

  const schemaVersion = text(payload.schemaVersion || CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION);
  if (schemaVersion !== CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION) {
    throw new Error("unsupported channel subscription activation flow fixture schema");
  }

  assertActivationFlow(payload.activationFlow);

  return {
    schemaVersion,
    generatedAt: text(payload.generatedAt),
    sourceGeneratedAt: text(payload.sourceGeneratedAt || payload.activationFlow.generatedAt),
    activationFlow: cloneJson(payload.activationFlow),
    safety: fixtureSafety()
  };
}

export function replayChannelSubscriptionActivationFlowFixture(
  fixture,
  { generatedAt = new Date().toISOString() } = {}
) {
  const normalized = normalizeChannelSubscriptionActivationFlowFixture(fixture);
  const flow = normalized.activationFlow;
  const gate = flow.gate ?? {};

  return {
    ok: true,
    mode: "channel-subscription-activation-flow-fixture-replay",
    generatedAt,
    schemaVersion: normalized.schemaVersion,
    fixtureGeneratedAt: normalized.generatedAt,
    sourceGeneratedAt: normalized.sourceGeneratedAt,
    flowStatus: text(flow.flowStatus),
    requiredNextAction: text(flow.requiredNextAction),
    blockers: Array.isArray(flow.blockers) ? flow.blockers : [],
    stages: cloneJson(flow.stages ?? {}),
    gate: {
      risk: text(gate.risk),
      gate: text(gate.gate),
      approvalRequestReady: gate.approvalRequestReady === true,
      exactApprovalRequired: gate.exactApprovalRequired === true,
      executionAuthority: text(gate.executionAuthority),
      approvalTextIncluded: gate.approvalTextIncluded === true,
      approvalSubmissionRoute: null,
      subscriptionOutputExecutionRoute: null,
      executesGate: false,
      runbook: text(gate.runbook)
    },
    activationFlow: flow,
    safety: fixtureSafety({
      fixtureOnly: false,
      replayOnly: true
    })
  };
}

export function extractChannelSubscriptionActivationFlowPayload(payload) {
  if (!isObject(payload)) {
    throw new Error("channel subscription activation flow payload must be an object");
  }
  return payload.channelSubscriptionActivationFlow ?? payload.activationFlow ?? payload;
}
