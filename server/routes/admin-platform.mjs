import { createHash } from "node:crypto";
import { Router } from "express";
import { buildChannelLabTargetDecision } from "../services/channel-lab-target-decision.mjs";
import { buildChannelRuntimeExecutionHandoff } from "../services/channel-runtime-execution-handoff.mjs";
import { buildChannelRuntimeEvidenceBridge } from "../services/channel-runtime-evidence-bridge.mjs";
import { buildChannelRuntimeGateWorkbench } from "../services/channel-runtime-gate-workbench.mjs";
import { buildChannelSubscriptionActivationFlow } from "../services/channel-subscription-activation-flow.mjs";
import { buildChannelSubscriptionActivationHandoff } from "../services/channel-subscription-activation-handoff.mjs";
import { buildChannelSubscriptionActivationPackage } from "../services/channel-subscription-activation-package.mjs";
import { buildChannelSubscriptionActivationReadiness } from "../services/channel-subscription-activation-readiness.mjs";
import { buildChannelSubscriptionActivationRecordTemplate } from "../services/channel-subscription-activation-record-template.mjs";
import { buildChannelSubscriptionOutputDraft } from "../services/channel-subscription-output-draft.mjs";
import { buildChannelSystemDecisionFlow } from "../services/channel-system-decision-flow.mjs";
import { buildCleanEdgeReadinessSummary } from "../services/clean-edge-readiness-summary.mjs";
import { createCleanStartControlPlanePackage } from "../services/platform/clean-start-control-plane.mjs";
import { createPlatformControlSummary } from "../services/platform/control-plane-contract.mjs";
import { buildProvisioningFormPackage } from "../services/platform/provisioning-form.mjs";
import { createPartnerAttributionAdminReport } from "../services/platform/partner-attribution-admin-report.mjs";
import { createOperationsFoundationSummary } from "../services/platform/operations-foundation-summary.mjs";
import { trafficLimitBytesForPlan } from "../services/platform/subscription-package-policy.mjs";
import { previewSubscriptionIssuance, planSubscriptionIssuance } from "../services/platform/subscription-issuance.mjs";
import { buildSubscriptionUsageMonitor } from "../services/platform/subscription-usage-monitor.mjs";
import {
  createUnavailableTrafficCollectorAdminProjection,
  sanitizeTrafficCollectorAdminProjection
} from "../services/platform/traffic-collector-admin-projection.mjs";

function sendError(res, error) {
  if (error.code === "validation_error") {
    res.status(400).json({ error: "validation_error", message: error.message });
    return;
  }

  if (error.code === "not_found") {
    res.status(404).json({ error: "not_found", message: error.message });
    return;
  }

  res.status(500).json({ error: "internal_error" });
}

const BYTES_PER_GB = 1024 ** 3;
const PUBLIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_STORE_ENTITLEMENT_STATUSES = new Set(["active", "expired", "revoked", "suspended"]);

function optionalAdminText(value) {
  if (Array.isArray(value)) {
    return optionalAdminText(value[0]);
  }
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeAdminSearch(value) {
  return optionalAdminText(value).toLowerCase();
}

function normalizeAdminEmailSearch(value) {
  const normalized = normalizeAdminSearch(value);
  return normalized && PUBLIC_EMAIL_PATTERN.test(normalized) ? normalized : "";
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function searchContext(value) {
  const text = normalizeAdminSearch(value);
  const email = normalizeAdminEmailSearch(text);
  return {
    email,
    emailDigest: email ? sha256Hex(email) : "",
    text
  };
}

function metadataDigestMatchesEmailSearch(metadata, context) {
  if (!context?.emailDigest) {
    return false;
  }
  return optionalAdminText(metadata.loginDigest) === context.emailDigest
    || optionalAdminText(metadata.contactDigest) === context.emailDigest;
}

function summaryMatchesSearch(summary, context) {
  if (!context.text) {
    return true;
  }
  return [
    summary.id,
    summary.email,
    summary.displayName,
    summary.organization,
    summary.status
  ].some((value) => optionalAdminText(value).toLowerCase().includes(context.text));
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function adminPlatformError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isoTimestamp(value, field, fallback) {
  const raw = value ?? fallback;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw adminPlatformError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function positiveInteger(value, field, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1) {
    throw adminPlatformError("validation_error", `${field} must be an integer >= 1`);
  }
  return number;
}

function nonNegativeInteger(value, field, fallback = 0) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 0) {
    throw adminPlatformError("validation_error", `${field} must be an integer >= 0`);
  }
  return number;
}

function numericTrafficLimitBytes(payload = {}) {
  const quota = payload.quota && typeof payload.quota === "object" ? payload.quota : {};
  const explicitBytes = finiteNumber(payload.trafficLimitBytes ?? quota.trafficLimitBytes);
  if (explicitBytes !== null) {
    return trafficLimitBytesForPlan(
      payload.plan,
      nonNegativeInteger(explicitBytes, "trafficLimitBytes")
    );
  }

  const trafficGb = finiteNumber(quota.trafficGb ?? payload.trafficGb);
  if (trafficGb === null) {
    return trafficLimitBytesForPlan(payload.plan, 0);
  }
  if (trafficGb < 0) {
    throw adminPlatformError("validation_error", "quota.trafficGb must be >= 0");
  }
  return trafficLimitBytesForPlan(
    payload.plan,
    Math.round(trafficGb * BYTES_PER_GB)
  );
}

function controlStoreEntitlementStatus(value) {
  const normalized = optionalAdminText(value) || "active";
  if (normalized === "disabled") {
    return "revoked";
  }
  if (!CONTROL_STORE_ENTITLEMENT_STATUSES.has(normalized)) {
    throw adminPlatformError("validation_error", "status is invalid");
  }
  return normalized;
}

function controlStoreEntitlementValidUntil(payload = {}, now) {
  const explicit = optionalAdminText(payload.validUntil ?? payload.expiresAt);
  if (explicit) {
    return isoTimestamp(explicit, "validUntil");
  }

  const days = finiteNumber(payload.durationDays ?? payload.availableDays ?? payload.days);
  if (days === null) {
    throw adminPlatformError("validation_error", "validUntil or durationDays is required");
  }
  if (!Number.isFinite(days) || days < 1) {
    throw adminPlatformError("validation_error", "durationDays must be >= 1");
  }
  return new Date(now.getTime() + Math.ceil(days) * 24 * 60 * 60 * 1000).toISOString();
}

function controlStoreEntitlementId(controlStore, accountId, now) {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 17);
  const accountDigest = sha256Hex(accountId).slice(0, 12);
  for (let sequence = 1; sequence <= 1000; sequence += 1) {
    const id = `ent_admin_${stamp}_${accountDigest}_${sequence}`;
    if (typeof controlStore?.getEntitlement !== "function" || !controlStore.getEntitlement(id)) {
      return id;
    }
  }
  throw adminPlatformError("validation_error", "entitlement id allocation failed");
}

function createControlStoreEntitlementSummary(controlStore, accountId, payload = {}, now) {
  if (typeof controlStore?.getAccount !== "function" || typeof controlStore?.createEntitlement !== "function") {
    return null;
  }

  const account = controlStore.getAccount(accountId);
  if (!account) {
    return null;
  }

  const quota = payload.quota && typeof payload.quota === "object" ? payload.quota : {};
  const createdAt = now.toISOString();
  const entitlement = controlStore.createEntitlement({
    id: controlStoreEntitlementId(controlStore, account.id, now),
    accountId: account.id,
    plan: optionalAdminText(payload.plan) || "monthly",
    status: controlStoreEntitlementStatus(payload.status),
    validFrom: isoTimestamp(payload.validFrom, "validFrom", now),
    validUntil: controlStoreEntitlementValidUntil(payload, now),
    maxArtifacts: positiveInteger(payload.maxArtifacts ?? quota.artifacts, "maxArtifacts", 1),
    maxDevices: positiveInteger(payload.maxDevices ?? quota.devices ?? quota.seats, "maxDevices", 1),
    trafficLimitBytes: numericTrafficLimitBytes(payload),
    createdAt,
    updatedAt: createdAt
  });

  return summaryForControlStoreEntitlement(entitlement, now);
}

function controlStoreQuotaForEntitlement(entitlement) {
  const quota = {};
  const maxArtifacts = finiteNumber(entitlement.maxArtifacts);
  const maxDevices = finiteNumber(entitlement.maxDevices);
  const trafficLimitBytes = finiteNumber(entitlement.trafficLimitBytes);

  if (maxArtifacts !== null) {
    quota.artifacts = maxArtifacts;
  }
  if (maxDevices !== null) {
    quota.devices = maxDevices;
  }
  if (trafficLimitBytes !== null) {
    quota.trafficLimitBytes = trafficLimitBytes;
    if (trafficLimitBytes > 0) {
      quota.trafficGb = trafficLimitBytes / BYTES_PER_GB;
    }
  }

  return quota;
}

function summaryForControlStoreEntitlement(entitlement, now) {
  const quota = controlStoreQuotaForEntitlement(entitlement);
  const summary = createPlatformControlSummary({
    entitlement: {
      ...entitlement,
      quota
    },
    now
  }).entitlement;

  return {
    id: summary.id,
    type: "platform_entitlement_summary",
    accountId: entitlement.accountId,
    status: summary.status,
    plan: summary.plan,
    usable: summary.usable,
    validUntil: summary.validUntil,
    quota,
    trafficLimitBytes: entitlement.trafficLimitBytes,
    maxArtifacts: entitlement.maxArtifacts,
    maxDevices: entitlement.maxDevices,
    createdAt: entitlement.createdAt,
    updatedAt: entitlement.updatedAt
  };
}

function controlStoreEntitlementSummariesForAccount(controlStore, accountId, now) {
  if (typeof controlStore?.getAccountControlSummary !== "function") {
    return [];
  }

  return controlStore
    .getAccountControlSummary(accountId)
    .entitlements
    .map((entitlement) => summaryForControlStoreEntitlement(entitlement, now));
}

function summaryForControlStoreAccount(controlStore, account, now, { search } = {}) {
  const metadata = account.metadata && typeof account.metadata === "object" ? account.metadata : {};
  const entitlements = controlStoreEntitlementSummariesForAccount(controlStore, account.id, now);
  const matchedLoginRef = metadataDigestMatchesEmailSearch(metadata, search) ? search.email : "";
  const loginRef = optionalAdminText(metadata.loginRef) || matchedLoginRef;
  const displayRef = optionalAdminText(metadata.displayRef);
  const displayName = displayRef
    || optionalAdminText(metadata.displayName)
    || loginRef
    || optionalAdminText(account.ownerRef)
    || account.id;

  return {
    id: account.id,
    type: "platform_account_summary",
    leadId: optionalAdminText(metadata.leadId) || null,
    status: account.status,
    organization: optionalAdminText(metadata.organization) || null,
    email: loginRef || null,
    displayName,
    entitlementCount: entitlements.length,
    usableEntitlementCount: entitlements.filter((entitlement) => entitlement.usable).length,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

function compareAdminSummaryItems(a, b) {
  return String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
    || String(a.id || "").localeCompare(String(b.id || ""));
}

function mergeAdminSummaryItems(shellItems, controlStoreItems) {
  const byId = new Map();
  for (const item of shellItems) {
    byId.set(item.id, item);
  }
  for (const item of controlStoreItems) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort(compareAdminSummaryItems);
}

function listControlStoreAccountSummaries(controlStore, { search, status, now }) {
  if (typeof controlStore?.listAccounts !== "function") {
    return [];
  }

  return controlStore
    .listAccounts(status ? { status } : {})
    .map((account) => summaryForControlStoreAccount(controlStore, account, now, { search }));
}

function listAdminAccountSummaries({ accountShell, controlStore, search, status, now }) {
  const context = searchContext(search);
  const shellItems = typeof accountShell?.listAccounts === "function"
    ? accountShell.listAccounts(status ? { status } : {})
    : [];
  const controlStoreItems = listControlStoreAccountSummaries(controlStore, { search: context, status, now });
  return mergeAdminSummaryItems(shellItems, controlStoreItems)
    .filter((summary) => summaryMatchesSearch(summary, context));
}

function listControlStoreEntitlementSummaries(controlStore, { accountId, now }) {
  if (typeof controlStore?.listAccounts !== "function") {
    return [];
  }

  if (accountId) {
    const account = typeof controlStore.getAccount === "function" ? controlStore.getAccount(accountId) : null;
    return account ? controlStoreEntitlementSummariesForAccount(controlStore, account.id, now) : [];
  }

  return controlStore
    .listAccounts()
    .flatMap((account) => controlStoreEntitlementSummariesForAccount(controlStore, account.id, now));
}

function listAdminEntitlementSummaries({ accountShell, controlStore, accountId, now }) {
  const shellItems = typeof accountShell?.listEntitlements === "function"
    ? accountShell.listEntitlements(accountId ? { accountId } : {})
    : [];
  const controlStoreItems = listControlStoreEntitlementSummaries(controlStore, { accountId, now });
  return mergeAdminSummaryItems(shellItems, controlStoreItems);
}

function channelSystemValidationError() {
  const error = new Error("channel system decision flow input is invalid");
  error.code = "validation_error";
  return error;
}

function channelRuntimeEvidenceBridgeValidationError() {
  const error = new Error("channel runtime evidence bridge input is invalid");
  error.code = "validation_error";
  return error;
}

function channelRuntimeGateWorkbenchValidationError() {
  const error = new Error("channel runtime gate workbench input is invalid");
  error.code = "validation_error";
  return error;
}

function channelRuntimeExecutionHandoffValidationError() {
  const error = new Error("channel runtime execution handoff input is invalid");
  error.code = "validation_error";
  return error;
}

function channelSubscriptionOutputDraftValidationError() {
  const error = new Error("channel subscription output draft input is invalid");
  error.code = "validation_error";
  return error;
}

function channelSubscriptionActivationReadinessValidationError() {
  const error = new Error("channel subscription activation readiness input is invalid");
  error.code = "validation_error";
  return error;
}

function channelSubscriptionActivationHandoffValidationError() {
  const error = new Error("channel subscription activation handoff input is invalid");
  error.code = "validation_error";
  return error;
}

function channelSubscriptionActivationFlowValidationError() {
  const error = new Error("channel subscription activation flow input is invalid");
  error.code = "validation_error";
  return error;
}

function channelSubscriptionActivationRecordTemplateValidationError() {
  const error = new Error("channel subscription activation record template input is invalid");
  error.code = "validation_error";
  return error;
}

function channelSubscriptionActivationPackageValidationError() {
  const error = new Error("channel subscription activation package input is invalid");
  error.code = "validation_error";
  return error;
}

function channelLabTargetDecisionValidationError() {
  const error = new Error("channel lab target decision input is invalid");
  error.code = "validation_error";
  return error;
}

function cleanEdgeReadinessSummaryValidationError() {
  const error = new Error("clean edge readiness summary input is invalid");
  error.code = "validation_error";
  return error;
}

export function adminPlatformRoutes(state) {
  const router = Router();
  const leadQueue = state.platform?.leadQueue;
  const accountShell = state.platform?.accountShell;
  const accessShell = state.platform?.accessShell;
  const controlStore = state.platform?.controlStore;
  const portalAccessRequests = state.platform?.portalAccessRequests;
  const edgeUsageAccounting = state.platform?.edgeUsageAccounting;
  const trafficCollectorStatusStore = state.platform?.trafficCollectorStatusStore;
  const dataPlaneHandoffQueue = state.platform?.dataPlaneHandoffQueue;
  const partnerAttributionStore = state.platform?.partnerAttributionStore;
  const partnerAttributionEventLedger = state.platform?.partnerAttributionEventLedger;
  const partnerSettlementCandidateEngine = state.platform?.partnerSettlementCandidateEngine;

  function buildCleanStartPackage() {
    return createCleanStartControlPlanePackage({
      accountShell,
      accessShell,
      proxyConfig: state.proxyConfig,
      now: new Date()
    });
  }

  router.get("/api/admin/platform/clean-start", (req, res) => {
    try {
      res.json({ cleanStart: buildCleanStartPackage() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/channel-system-decision-flow", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelSystem: buildChannelSystemDecisionFlow({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeInventoryInput: input.runtimeInventoryInput
        })
      });
    } catch {
      sendError(res, channelSystemValidationError());
    }
  });

  router.post("/api/admin/platform/channel-runtime-evidence-bridge", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelRuntimeEvidence: buildChannelRuntimeEvidenceBridge({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeEvidenceInput: input.runtimeEvidenceInput
        })
      });
    } catch {
      sendError(res, channelRuntimeEvidenceBridgeValidationError());
    }
  });

  router.post("/api/admin/platform/channel-runtime-gate-workbench", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelRuntimeGateWorkbench: buildChannelRuntimeGateWorkbench({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeEvidenceInput: input.runtimeEvidenceInput
        })
      });
    } catch {
      sendError(res, channelRuntimeGateWorkbenchValidationError());
    }
  });

  router.post("/api/admin/platform/channel-runtime-execution-handoff", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelRuntimeExecutionHandoff: buildChannelRuntimeExecutionHandoff({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeEvidenceInput: input.runtimeEvidenceInput
        })
      });
    } catch {
      sendError(res, channelRuntimeExecutionHandoffValidationError());
    }
  });

  router.post("/api/admin/platform/channel-subscription-output-draft", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelSubscriptionOutputDraft: buildChannelSubscriptionOutputDraft({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeEvidenceInput: input.runtimeEvidenceInput
        })
      });
    } catch {
      sendError(res, channelSubscriptionOutputDraftValidationError());
    }
  });

  router.post("/api/admin/platform/channel-subscription-activation-readiness", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelSubscriptionActivationReadiness: buildChannelSubscriptionActivationReadiness({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeEvidenceInput: input.runtimeEvidenceInput
        })
      });
    } catch {
      sendError(res, channelSubscriptionActivationReadinessValidationError());
    }
  });

  router.post("/api/admin/platform/channel-subscription-activation-handoff", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelSubscriptionActivationHandoff: buildChannelSubscriptionActivationHandoff({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeEvidenceInput: input.runtimeEvidenceInput
        })
      });
    } catch {
      sendError(res, channelSubscriptionActivationHandoffValidationError());
    }
  });

  router.post("/api/admin/platform/channel-subscription-activation-flow", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelSubscriptionActivationFlow: buildChannelSubscriptionActivationFlow({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeEvidenceInput: input.runtimeEvidenceInput
        })
      });
    } catch {
      sendError(res, channelSubscriptionActivationFlowValidationError());
    }
  });

  router.post("/api/admin/platform/channel-subscription-activation-record-template", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelSubscriptionActivationRecordTemplate: buildChannelSubscriptionActivationRecordTemplate(
          input.activationFlowFixture ?? input
        )
      });
    } catch {
      sendError(res, channelSubscriptionActivationRecordTemplateValidationError());
    }
  });

  router.post("/api/admin/platform/channel-subscription-activation-package", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelSubscriptionActivationPackage: buildChannelSubscriptionActivationPackage({
          fixture: input.activationFlowFixture ?? input,
          proxyConfig: state.proxyConfig
        })
      });
    } catch {
      sendError(res, channelSubscriptionActivationPackageValidationError());
    }
  });

  router.post("/api/admin/platform/channel-lab-target-decision", (req, res) => {
    try {
      res.json({
        channelLabTargetDecision: buildChannelLabTargetDecision(req.body ?? {})
      });
    } catch {
      sendError(res, channelLabTargetDecisionValidationError());
    }
  });

  router.post("/api/admin/platform/clean-edge-readiness-summary", (req, res) => {
    try {
      res.json({
        cleanEdgeReadiness: buildCleanEdgeReadinessSummary(req.body ?? {})
      });
    } catch {
      sendError(res, cleanEdgeReadinessSummaryValidationError());
    }
  });

  router.post("/api/admin/platform/provisioning-form/preview", (req, res) => {
    try {
      res.json({
        provisioningForm: buildProvisioningFormPackage(req.body ?? {})
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/subscription-issuance/preview", (req, res) => {
    try {
      res.json({
        preview: previewSubscriptionIssuance({ input: req.body ?? {} })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/subscription-issuance/request", (req, res) => {
    try {
      if (!controlStore) {
        throw new Error("controlStore is not configured");
      }
      const approvalRef = String(req.body?.approvalRef || req.body?.control?.approvalRef || "").trim();
      res.status(201).json({
        request: planSubscriptionIssuance({
          controlStore,
          input: req.body ?? {},
          approvalRef,
          now: new Date().toISOString()
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/subscription-usage-monitor", (req, res) => {
    try {
      res.json({
        monitor: buildSubscriptionUsageMonitor({
          controlStore,
          subscriptionCore: state.subscriptions?.core || state.subscriptions?.service,
          filters: {
            accountId: req.query.accountId,
            plan: req.query.plan,
            nodeId: req.query.nodeId,
            status: req.query.status,
            warning: req.query.warning,
            from: req.query.from,
            to: req.query.to,
            bucket: req.query.bucket
          },
          usageCollectorConfigured: Boolean(edgeUsageAccounting?.collectAndRecord),
          now: new Date()
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/traffic-collector-status", (_req, res) => {
    let collectorStatus = createUnavailableTrafficCollectorAdminProjection("not_configured");
    if (trafficCollectorStatusStore && typeof trafficCollectorStatusStore.read === "function") {
      try {
        collectorStatus = sanitizeTrafficCollectorAdminProjection(trafficCollectorStatusStore.read());
      } catch {
        collectorStatus = createUnavailableTrafficCollectorAdminProjection("invalid_observation");
      }
    }
    res.json({ collectorStatus });
  });

  router.get("/api/admin/platform/partner-attribution-report", (_req, res) => {
    try {
      res.json({
        report: createPartnerAttributionAdminReport({
          attributionStore: partnerAttributionStore,
          eventLedger: partnerAttributionEventLedger,
          settlementEngine: partnerSettlementCandidateEngine,
          now: new Date()
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/subscription-usage-monitor/collect", async (req, res) => {
    try {
      if (!edgeUsageAccounting || typeof edgeUsageAccounting.collectAndRecord !== "function") {
        const error = new Error("usage accounting collector is not configured");
        error.code = "validation_error";
        throw error;
      }
      const body = req.body ?? {};
      res.status(202).json({
        usageAccounting: await edgeUsageAccounting.collectAndRecord({
          since: body.since,
          sinceByChannelRef: body.sinceByChannelRef
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/data-plane-handoff-queue", (req, res) => {
    try {
      if (!dataPlaneHandoffQueue || typeof dataPlaneHandoffQueue.listPending !== "function") {
        const error = new Error("data-plane handoff queue is not configured");
        error.code = "validation_error";
        throw error;
      }
      res.json({
        queue: {
          type: "data_plane_handoff_queue",
          pending: dataPlaneHandoffQueue.listPending(),
          safety: {
            summaryOnly: true,
            rawCredentialReturned: false,
            rawRuntimePayloadReturned: false,
            mutationAllowed: false
          }
        }
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/data-plane-handoff-queue/:handoffRef/archive", (req, res) => {
    try {
      if (!dataPlaneHandoffQueue || typeof dataPlaneHandoffQueue.archiveApplied !== "function") {
        const error = new Error("data-plane handoff queue is not configured");
        error.code = "validation_error";
        throw error;
      }
      const archive = dataPlaneHandoffQueue.archiveApplied({
        handoffRef: req.params.handoffRef,
        appliedByRef: req.body?.appliedByRef
      });
      res.status(archive.ok ? 202 : 400).json({ archive });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/leads", (req, res) => {
    try {
      res.json({ items: leadQueue.listLeads({ status: req.query.status }) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/operations-summary", (_req, res) => {
    try {
      res.json({
        summary: createOperationsFoundationSummary({ leadQueue, controlStore })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/leads/:id/status", (req, res) => {
    try {
      res.json({ lead: leadQueue.updateLeadStatus(req.params.id, req.body ?? {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/leads/:id/account", (req, res) => {
    try {
      const lead = leadQueue.getLead(req.params.id);
      const account = accountShell.createAccountFromLead(lead, req.body ?? {});
      const updatedLead = leadQueue.updateLeadStatus(req.params.id, { status: "converted" });
      res.status(201).json({ account, lead: updatedLead });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/accounts", (req, res) => {
    try {
      res.json({
        items: listAdminAccountSummaries({
          accountShell,
          controlStore,
          search: optionalAdminText(req.query.search || req.query.q),
          status: optionalAdminText(req.query.status),
          now: new Date()
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/accounts/:id/entitlements", (req, res) => {
    try {
      const controlStoreEntitlement = createControlStoreEntitlementSummary(
        controlStore,
        optionalAdminText(req.params.id),
        req.body ?? {},
        new Date()
      );
      if (controlStoreEntitlement) {
        res.status(201).json({ entitlement: controlStoreEntitlement });
        return;
      }

      const entitlement = accountShell.createEntitlement(req.params.id, req.body ?? {});
      res.status(201).json({ entitlement });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/accounts/:id/entitlements", (req, res) => {
    try {
      res.json({
        items: listAdminEntitlementSummaries({
          accountShell,
          controlStore,
          accountId: optionalAdminText(req.params.id),
          now: new Date()
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/entitlements", (req, res) => {
    try {
      res.json({
        items: listAdminEntitlementSummaries({
          accountShell,
          controlStore,
          accountId: optionalAdminText(req.query.accountId),
          now: new Date()
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/accounts/:accountId/entitlements/:entitlementId/dynamic-entry", (req, res) => {
    try {
      const access = accessShell.issueDynamicEntry(req.params.accountId, req.params.entitlementId, req.body ?? {});
      res.status(201).json({ access });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/access-grants", (req, res) => {
    try {
      res.json({
        items: accessShell.listAccessGrants({
          accountId: req.query.accountId,
          entitlementId: req.query.entitlementId
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/portal-access-requests", (req, res) => {
    try {
      if (!portalAccessRequests) {
        throw new Error("portalAccessRequests is not configured");
      }
      res.json({
        items: portalAccessRequests.listRequests({
          status: req.query.status,
          portalUserRef: req.query.portalUserRef
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/portal-access-requests/:requestRef/reject", (req, res) => {
    try {
      if (!portalAccessRequests) {
        throw new Error("portalAccessRequests is not configured");
      }
      res.json({
        request: portalAccessRequests.rejectRequest(req.params.requestRef, req.body ?? {})
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/portal-access-requests/:requestRef/approve-preview", (req, res) => {
    try {
      if (!portalAccessRequests) {
        throw new Error("portalAccessRequests is not configured");
      }
      res.json({
        preview: portalAccessRequests.previewApproval(req.params.requestRef, req.body ?? {})
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/portal-access-requests/:requestRef/traffic-limit", (req, res) => {
    try {
      if (!portalAccessRequests) {
        throw new Error("portalAccessRequests is not configured");
      }
      res.json({
        quotaUpdate: portalAccessRequests.updateTrafficLimit(req.params.requestRef, req.body ?? {})
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/portal-access-requests/:requestRef/mark-delivered", (req, res) => {
    try {
      if (!portalAccessRequests) {
        throw new Error("portalAccessRequests is not configured");
      }
      res.json({
        request: portalAccessRequests.markDelivered(req.params.requestRef, req.body ?? {})
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
