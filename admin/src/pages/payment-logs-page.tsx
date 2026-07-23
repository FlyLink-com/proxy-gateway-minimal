import { useEffect, useState } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import { PAYMENT_LOG_FIXTURE, toPaymentLogRows, type PaymentLogDto } from "../features/payment-logs/payment-logs-model";
import "./payment-logs-page.css";

export function PaymentLogsPage({ apiClient, fixturePreviewEnabled = false }: { apiClient?: AdminApiClient; fixturePreviewEnabled?: boolean }) {
  const [items, setItems] = useState<PaymentLogDto[] | null>(fixturePreviewEnabled ? PAYMENT_LOG_FIXTURE : null);
  const [status, setStatus] = useState("all");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (fixturePreviewEnabled || !apiClient) return;
    setItems(null);
    setError(null);
    apiClient.listPaymentLogs(status === "all" ? undefined : { status }).then(setItems).catch(() => setError("Payment logs could not be loaded"));
  }, [apiClient, fixturePreviewEnabled, status]);
  const rows = toPaymentLogRows(items ?? []);
  return <main className="payment-logs-page" aria-labelledby="payment-logs-title">
    <header><p>User Operations / Payment Logs</p><h1 id="payment-logs-title">Payment Logs</h1><p>Redacted payment-attempt evidence for reconciliation review.</p></header>
    <aside className="payment-logs-boundary" role="note"><strong>READ-ONLY</strong><span> Safe summary only. No provider controls, retries, refunds, or settlement mutations are available.</span></aside>
    <div className="payment-logs-toolbar"><label htmlFor="payment-log-status">Status</label><select id="payment-log-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="succeeded">Succeeded</option><option value="reversed">Reversed</option></select></div>
    {error ? <p role="alert">{error}</p> : items === null ? <p role="status" aria-live="polite">Payment logs are loading</p> : rows.length === 0 ? <p role="status">No payment attempts found</p> : <table className="payment-logs-table"><caption>Read-only payment evidence</caption><thead><tr><th>Attempt</th><th>Status</th><th>Charge certainty</th><th>Source / target evidence</th><th>Settlement readiness</th><th>Reconciliation</th><th>Updated</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.attemptRef}-${row.updatedAt}`}><td>{row.attemptRef}</td><td>{row.status}</td><td>{row.chargeCertainty}</td><td>{row.sourceAttemptRef} → {row.targetAttemptRef}</td><td>{row.settlementReadiness ?? "not available"}</td><td>{row.reconciliationState}</td><td>{row.updatedAt}</td></tr>)}</tbody></table>}
  </main>;
}
