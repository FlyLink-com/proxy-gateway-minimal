import { replayChannelSubscriptionActivationFlowFixture } from "./channel-subscription-activation-flow-fixture.mjs";

const SUGGESTED_RECORD_SUFFIX = "channel-subscription-output-activation.md";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function yyyyMmDd(value) {
  const textValue = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) {
    return textValue;
  }
  const match = textValue.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (match) {
    return match[1];
  }
  return new Date().toISOString().slice(0, 10);
}

function bulletList(items) {
  const safeItems = list(items);
  if (safeItems.length === 0) {
    return "- none";
  }
  return safeItems.map((item) => `- ${text(item)}`).join("\n");
}

function checklist(items) {
  return items.map((item) => `- [ ] ${item}`).join("\n");
}

function candidateCounts(flow) {
  const counts = flow.activationFlow?.outputs?.activationHandoff?.handoff?.counts ?? {};
  return {
    baseline: Number(counts.baselinePool ?? 0),
    canary: Number(counts.canaryPool ?? 0),
    private: Number(counts.privatePool ?? 0),
    blocked: Number(counts.blockedPool ?? 0)
  };
}

function buildMarkdown({ replay, recordDate }) {
  const counts = candidateCounts(replay);
  return `# Channel Subscription Output Activation Execution Record

Date: ${recordDate}, Asia/Shanghai.

Risk: A / subscription-output activation execution record.

Execution authority: not granted by this template.

Source fixture generated at: ${text(replay.fixtureGeneratedAt)}
Source flow generated at: ${text(replay.sourceGeneratedAt)}
Replay generated at: ${text(replay.generatedAt)}

## Scope

This template is prepared from a repository-local activation-flow fixture. It
does not authorize execution. A separate exact operator approval and fresh
read-only inventory are required before any subscription-output activation.

Flow status: ${text(replay.flowStatus)}
Readiness: ${text(replay.flowStatus)}
Required next action: ${text(replay.requiredNextAction)}
Approval request ready: ${replay.gate.approvalRequestReady ? "yes" : "no"}
Execution authority: ${text(replay.gate.executionAuthority)}

## Source Counts

- Baseline pool: ${counts.baseline}
- Canary pool: ${counts.canary}
- Private pool: ${counts.private}
- Blocked pool: ${counts.blocked}

## Blockers

${bulletList(replay.blockers)}

## Approval Evidence

Approval evidence: TODO record operator approval reference; do not paste exact text.

## Preflight Evidence

${checklist([
    "TODO refresh activation-flow fixture from current safe evidence",
    "TODO confirm baseline and canary pools still match the intended output",
    "TODO confirm subscription gateway public boundary is unchanged",
    "TODO confirm rollback plan and previous subscription output state are recorded"
  ])}

## Activation Evidence

${checklist([
    "TODO record the exact execution command or manual action reference",
    "TODO record changed subscription-output scope",
    "TODO record that YAML was generated only by the approved activation path",
    "TODO record that no unapproved tenant, artifact, DNS, or runtime state changed"
  ])}

## Validation Evidence

${checklist([
    "TODO record controlled import refresh result",
    "TODO record baseline node output result",
    "TODO record canary node output result",
    "TODO record no-token and invalid-token behavior if subscription refresh path is touched",
    "TODO record observation window result"
  ])}

## Rollback Evidence

${checklist([
    "TODO record previous subscription-output config",
    "TODO record revert command or manual rollback steps",
    "TODO record runtime cleanup or retain decision",
    "TODO record post-rollback validation"
  ])}

## Not Performed

- No DNS, Nginx, firewall, systemd, cloud, SQLite, artifact, or user-traffic mutation is performed by this template.
- No approval phrase text is stored in this template.
- No raw host, port, URL, credential, token, subscription URL, YAML, raw log, SQLite row, or customer data is stored in this template.
- No production activation is authorized by this template.
`;
}

export function buildChannelSubscriptionActivationRecordTemplate(
  fixture,
  { generatedAt = new Date().toISOString(), recordDate = yyyyMmDd(generatedAt) } = {}
) {
  const replay = replayChannelSubscriptionActivationFlowFixture(fixture, { generatedAt });
  const safeRecordDate = yyyyMmDd(recordDate);

  return {
    ok: true,
    mode: "channel-subscription-activation-record-template",
    generatedAt,
    source: {
      fixtureSchemaVersion: text(replay.schemaVersion),
      fixtureGeneratedAt: text(replay.fixtureGeneratedAt),
      sourceGeneratedAt: text(replay.sourceGeneratedAt),
      flowStatus: text(replay.flowStatus),
      requiredNextAction: text(replay.requiredNextAction)
    },
    readiness: {
      approvalRequestReady: replay.gate.approvalRequestReady === true,
      executionAuthority: text(replay.gate.executionAuthority),
      blockers: list(replay.blockers)
    },
    record: {
      title: "Channel Subscription Output Activation Execution Record",
      suggestedPath: `docs/production-replacement-records/${safeRecordDate}-${SUGGESTED_RECORD_SUFFIX}`,
      markdown: buildMarkdown({ replay, recordDate: safeRecordDate })
    },
    safety: {
      advisoryOnly: true,
      summaryOnly: true,
      templateOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noApprovalSubmission: true,
      noTrafficMovement: true,
      noSubscriptionOutputMutation: true,
      yamlNotGenerated: true,
      requiresSeparateRiskAApproval: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml"]
    }
  };
}
