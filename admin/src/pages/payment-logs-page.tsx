import { useEffect, useState } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import { PAYMENT_LOG_FIXTURE, toPaymentLogRows, type PaymentLogDto, type PaymentLogStatus } from "../features/payment-logs/payment-logs-model";
import "./payment-logs-page.css";
import type { BlueprintPage } from "../app/admin-ui-projection";

export const paymentLogsBlueprint: BlueprintPage = {
  page: "paymentLogs",
  ariaLabel: "Payment Logs page header",
  kicker: "User Operations / Payment Logs",
  title: "Payment Logs",
  description: "Read-only redacted payment-attempt evidence and reconciliation state.",
  statusLabel: "Evidence owner",
  statusTone: "info",
  modules: [{
    navId: "payment-attempts",
    container: { category: "monitoring", container: "Bounded payment attempt evidence table", dataAdapter: "Protected read-only Admin payment logs DTO.", layoutPolicy: "Bounded read-only table with local safe-ref filtering.", performanceBoundary: "Rows load from the trusted Admin API only.", interactionModel: "Inspect redacted evidence; no mutation controls." },
    content: null,
    containmentStrategy: "not-applicable",
    purpose: "Inspect redacted payment attempts for reconciliation review.",
    contentFields: ["Masked attempt ref", "Status", "Charge certainty", "Source / target refs", "Reconciliation state"],
    states: ["Loading", "Empty", "Error", "Ready"],
    uiSurface: "payment-logs",
    ownership: "Owns read-only payment evidence inspection.",
    boundaries: ["No provider controls", "No credentials or customer fields", "No settlement or refund mutation"],
    nextStep: "Use safe-ref search or route reconciliation evidence for approved follow-up."
  }]
};

export function PaymentLogsPage({ apiClient, fixturePreviewEnabled = false }: { apiClient?: AdminApiClient; fixturePreviewEnabled?: boolean }) {
  const [items, setItems] = useState<PaymentLogDto[] | null>(fixturePreviewEnabled ? PAYMENT_LOG_FIXTURE : null);
  const [status, setStatus] = useState<PaymentLogStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (fixturePreviewEnabled || !apiClient) return;
    const controller = new AbortController();
    let active = true;
    setItems(null);
    setError(null);
    apiClient.listPaymentLogs(status === "all" ? { signal: controller.signal } : { status, signal: controller.signal }).then((nextItems) => { if (active) setItems(nextItems); }).catch(() => { if (active && !controller.signal.aborted) setError("Payment logs could not be loaded"); });
    return () => { active = false; controller.abort(); };
  }, [apiClient, fixturePreviewEnabled, status]);
  const rows = toPaymentLogRows(items ?? []).filter((row) => {
    const query = search.trim().toLocaleLowerCase();
    return !query || [row.attemptRef, row.orderRef, row.sourceAttemptRef, row.targetAttemptRef].some((ref) => ref.toLocaleLowerCase().includes(query));
  });
  return <main className="payment-logs-page" aria-labelledby="payment-logs-title">
    <header><p>User Operations / Payment Logs</p><h1 id="payment-logs-title">Payment Logs</h1><p>Redacted payment-attempt evidence for reconciliation review.</p></header>
    <aside className="payment-logs-boundary" role="note"><strong>READ-ONLY</strong><span> Safe summary only. No provider controls, retries, refunds, or settlement mutations are available.</span></aside>
    <div className="payment-logs-toolbar"><label htmlFor="payment-log-status">Status</label><select id="payment-log-status" value={status} onChange={(event) => setStatus(event.target.value as PaymentLogStatus | "all")}><option value="all">All statuses</option><option value="pending">Pending</option><option value="succeeded">Succeeded</option><option value="reversed">Reversed</option></select><label htmlFor="payment-log-search">Safe-ref search</label><input id="payment-log-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search masked refs" /></div>
    {error ? <p role="alert">{error}</p> : items === null ? <p role="status" aria-live="polite">Payment logs are loading</p> : rows.length === 0 ? <p role="status">No payment attempts found</p> : <table className="payment-logs-table"><caption>Read-only payment evidence</caption><thead><tr><th>Attempt</th><th>Order</th><th>Status</th><th>Charge certainty</th><th>Source / target refs</th><th>Switch reason</th><th>Reconciliation</th><th>Updated</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.attemptRef}-${row.updatedAt}`}><td>{row.attemptRef}</td><td>{row.orderRef}</td><td>{row.status}</td><td>{row.chargeCertainty}</td><td>{row.sourceAttemptRef} → {row.targetAttemptRef}</td><td>{row.switchReason ?? "—"}</td><td>{row.reconciliationState}</td><td>{row.updatedAt}</td></tr>)}</tbody></table>}
  </main>;
}
