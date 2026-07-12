import {
  buildCredentialReconciliationApplyPlan,
  buildCredentialReconciliationPlan
} from "./credential-reconciliation-gateway.mjs";
import { buildEdgeCredentialDesiredState } from "./credential-desired-state-builder.mjs";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function edgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function safeRef(value, fallback = "") {
  const normalized = text(value);
  return SAFE_REF_PATTERN.test(normalized) ? normalized : fallback;
}

function defaultStateRef(channelRef, nowIso) {
  return `desired_state_${channelRef}_${nowIso.replace(/[^A-Za-z0-9]+/g, "_")}`;
}

function defaultReceiptRef(nowIso) {
  return `edge_receipt_${nowIso.replace(/[^A-Za-z0-9]+/g, "_")}`;
}

function countActions(summary = {}) {
  return {
    add: summary.addCount ?? 0,
    revoke: summary.revokeCount ?? 0,
    rotate: summary.rotateCount ?? 0,
    unchanged: summary.unchangedCount ?? 0
  };
}

function listenerReady(listener = {}) {
  return (
    listener.udp443 === true
    || listener.tcp === true
    || listener.present === true
    || listener.listenerPresent === true
  );
}

function receiptFromReport({
  report,
  channelRef,
  desiredStateRef,
  receiptId,
  createdAt
}) {
  const runtimeReceipt = report.runtimeReceipt ?? {};
  return {
    id: receiptId,
    channelRef,
    desiredStateRef,
    status: runtimeReceipt.status || "failed",
    actionCounts: countActions(report.summary),
    configTestOk: runtimeReceipt.configTest?.ok === true,
    serviceActive: runtimeReceipt.service?.active === true,
    listenerUdp443: listenerReady(runtimeReceipt.listener),
    listenerTcp: runtimeReceipt.listener?.tcp === true,
    ...(runtimeReceipt.handoffRef ? { handoffRef: runtimeReceipt.handoffRef } : {}),
    backupRef: runtimeReceipt.backupRef,
    rollbackRef: runtimeReceipt.rollbackRef,
    appliedAt: runtimeReceipt.appliedAt,
    createdAt
  };
}

export function createOrderCredentialLifecycleService({
  channelRef,
  runtime = "mihomo-tuic",
  nowFn = () => new Date(),
  listOrders,
  listCurrentCredentials = () => [],
  executeProductionMutation = false,
  runtimeAdapter = null,
  receiptStore = null,
  desiredStateRefFactory,
  receiptIdFactory
} = {}) {
  const safeChannelRef = safeRef(channelRef);
  if (!safeChannelRef) {
    throw edgeError("validation_error", "channelRef is required");
  }
  if (typeof listOrders !== "function") {
    throw edgeError("validation_error", "listOrders is required");
  }

  return {
    reconcileOrderLifecycle() {
      const nowValue = nowFn();
      const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
      if (Number.isNaN(now.getTime())) {
        throw edgeError("validation_error", "now must be a valid date");
      }
      const nowIso = now.toISOString();
      const desiredStateRef = safeRef(
        typeof desiredStateRefFactory === "function"
          ? desiredStateRefFactory({ channelRef: safeChannelRef, now: nowIso })
          : "",
        defaultStateRef(safeChannelRef, nowIso)
      );
      const desiredState = buildEdgeCredentialDesiredState({
        channelRef: safeChannelRef,
        desiredStateRef,
        runtime,
        now: nowIso,
        orders: listOrders(),
        currentCredentials: listCurrentCredentials()
      });

      if (executeProductionMutation !== true) {
        return buildCredentialReconciliationPlan({
          desiredState,
          inputPath: "runtime:order-lifecycle"
        });
      }

      const report = buildCredentialReconciliationApplyPlan({
        desiredState,
        inputPath: "runtime:order-lifecycle",
        executeProductionMutation: true,
        runtimeAdapter
      });

      if (receiptStore && typeof receiptStore.recordEdgeApplyReceipt === "function" && report.runtimeReceipt) {
        const receiptId = safeRef(
          typeof receiptIdFactory === "function"
            ? receiptIdFactory({ channelRef: safeChannelRef, desiredStateRef, now: nowIso })
            : "",
          defaultReceiptRef(nowIso)
        );
        receiptStore.recordEdgeApplyReceipt(receiptFromReport({
          report,
          channelRef: safeChannelRef,
          desiredStateRef,
          receiptId,
          createdAt: nowIso
        }));
      }

      return report;
    }
  };
}

export function createOrderCredentialLifecycleFanoutService({
  services = []
} = {}) {
  const normalizedServices = services
    .map((entry) => ({
      channelRef: safeRef(entry?.channelRef),
      service: entry?.service
    }))
    .filter((entry) => entry.channelRef && entry.service && typeof entry.service.reconcileOrderLifecycle === "function");
  if (normalizedServices.length === 0) {
    throw edgeError("validation_error", "at least one lifecycle service is required");
  }

  return {
    reconcileOrderLifecycle(input = {}) {
      const reports = normalizedServices.map(({ channelRef, service }) => ({
        channelRef,
        report: service.reconcileOrderLifecycle(input)
      }));
      const ok = reports.every(({ report }) => report?.ok !== false);
      return {
        type: "gccgw_edge_credential_lifecycle_fanout_report",
        ok,
        mode: "fanout",
        channelRefs: reports.map(({ channelRef }) => channelRef),
        reports: reports.map(({ channelRef, report }) => ({
          channelRef,
          ok: report?.ok !== false,
          type: report?.type,
          runtime: report?.runtime,
          summary: report?.summary,
          blockers: Array.isArray(report?.blockers) ? report.blockers : [],
          warnings: Array.isArray(report?.warnings) ? report.warnings : [],
          runtimeStatus: report?.runtimeReceipt?.status,
          mutation: report?.mutation === true,
          nextAction: report?.nextAction
        })),
        mutation: reports.some(({ report }) => report?.mutation === true),
        productionAuthority: false,
        redacted: true,
        nextAction: ok ? "lifecycle_fanout_applied" : "stop_before_runtime_mutation"
      };
    }
  };
}
