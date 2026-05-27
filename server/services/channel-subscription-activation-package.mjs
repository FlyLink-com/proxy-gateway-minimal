import { buildChannelSubscriptionActivationRecordTemplate } from "./channel-subscription-activation-record-template.mjs";
import { buildChannelSubscriptionRenderProof } from "./channel-subscription-render-proof.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(items) {
  return [...new Set(list(items).map(text).filter(Boolean))];
}

function safetyFlags() {
  return {
    advisoryOnly: true,
    summaryOnly: true,
    packageOnly: true,
    renderProofRequired: true,
    noRuntimeMutation: true,
    noProductionMutation: true,
    noApprovalSubmission: true,
    noTrafficMovement: true,
    noSubscriptionOutputMutation: true,
    yamlReturned: false,
    yamlNotReturned: true,
    recordMarkdownReturned: false,
    requiresSeparateRiskAApproval: true,
    omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls", "yaml", "recordMarkdown"]
  };
}

function buildRecordTemplateSummary(template) {
  return {
    mode: text(template.mode),
    title: text(template.record?.title),
    suggestedPath: text(template.record?.suggestedPath),
    markdownReturned: false,
    approvalRequestReady: template.readiness?.approvalRequestReady === true,
    executionAuthority: text(template.readiness?.executionAuthority),
    blockers: list(template.readiness?.blockers).map(text)
  };
}

function buildRenderProofSummary(proof) {
  return {
    status: text(proof.status),
    internalYamlRenderCompleted: proof.renderProof?.internalYamlRenderCompleted === true,
    yamlReturned: false,
    renderedProxyCount: Number(proof.renderProof?.renderedProxyCount ?? 0),
    generatedYamlBytes: proof.renderProof?.generatedYamlBytes,
    protocolCounts: proof.renderProof?.protocolCounts ?? {},
    baseline: list(proof.renderProof?.baseline),
    canary: list(proof.renderProof?.canary)
  };
}

function buildPackageStatus({ renderProofReady, recordTemplateReady }) {
  return renderProofReady && recordTemplateReady
    ? "ready_for_risk_a_subscription_output_activation_request"
    : "blocked_before_risk_a_subscription_output_activation_request";
}

export function buildChannelSubscriptionActivationPackage({
  fixture,
  proxyConfig,
  generatedAt = new Date().toISOString()
}) {
  let renderProof;
  let recordTemplate;

  try {
    renderProof = buildChannelSubscriptionRenderProof({ fixture, proxyConfig, generatedAt });
    recordTemplate = buildChannelSubscriptionActivationRecordTemplate(fixture, { generatedAt });
  } catch {
    throw new Error("channel subscription activation package failed to build safe activation evidence");
  }

  const renderProofReady = renderProof.status === "render_proof_ready_for_subscription_output_activation_request"
    && renderProof.renderProof?.internalYamlRenderCompleted === true
    && renderProof.renderProof?.yamlReturned === false;
  const recordTemplateReady = recordTemplate.readiness?.approvalRequestReady === true;
  const approvalRequestReady = renderProofReady && recordTemplateReady;
  const renderBlockers = list(renderProof.blockers);
  const recordBlockers = list(recordTemplate.readiness?.blockers);
  const blockers = unique([
    ...renderBlockers,
    ...recordBlockers,
    ...(!renderProofReady && renderBlockers.length === 0 ? ["render_proof_not_ready"] : []),
    ...(!recordTemplateReady && recordBlockers.length === 0 ? ["record_template_not_ready"] : [])
  ]);

  return {
    ok: true,
    mode: "channel-subscription-activation-package",
    generatedAt,
    status: buildPackageStatus({ renderProofReady, recordTemplateReady }),
    blockers,
    package: {
      renderProofReady,
      recordTemplateReady,
      approvalRequestReady,
      executionAuthority: approvalRequestReady ? text(renderProof.gate?.executionAuthority) : "not_granted",
      requiredNextAction: approvalRequestReady
        ? "request_risk_a_subscription_output_activation_approval"
        : "fix_channel_subscription_activation_package_before_approval_request"
    },
    renderProof: buildRenderProofSummary(renderProof),
    recordTemplate: buildRecordTemplateSummary(recordTemplate),
    gate: {
      risk: text(renderProof.gate?.risk),
      gate: text(renderProof.gate?.gate),
      approvalRequestReady,
      exactApprovalRequired: true,
      executionAuthority: approvalRequestReady ? text(renderProof.gate?.executionAuthority) : "not_granted",
      approvalSubmissionRoute: null,
      subscriptionOutputExecutionRoute: null,
      executesGate: false
    },
    source: {
      fixtureGeneratedAt: text(renderProof.source?.fixtureGeneratedAt || recordTemplate.source?.fixtureGeneratedAt),
      sourceGeneratedAt: text(renderProof.source?.sourceGeneratedAt || recordTemplate.source?.sourceGeneratedAt),
      fixtureSchemaVersion: text(renderProof.source?.schemaVersion || recordTemplate.source?.fixtureSchemaVersion)
    },
    safety: safetyFlags()
  };
}
