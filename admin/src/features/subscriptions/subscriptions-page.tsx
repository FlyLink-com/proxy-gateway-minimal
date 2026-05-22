import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Link, MoreHorizontal, RotateCcw, ShieldCheck, ShieldOff } from "lucide-react";
import { StatusBadge } from "../../components/status-badge";
import { copyText } from "../../lib/clipboard";
import type { AdminApiClient } from "./api-client";
import type { SubscriptionTenant } from "./types";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { CreateSubscriptionDialog } from "./create-subscription-dialog";
import { RenewSubscriptionDialog } from "./renew-subscription-dialog";
import { ResetTokenDialog } from "./reset-token-dialog";

type VisibleOnceResult = {
  title: string;
  url: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

function formatLastUsed(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Admin API request failed.";
}

export function SubscriptionsPage({
  search,
  apiClient
}: {
  search: string;
  apiClient: AdminApiClient;
}) {
  const [rows, setRows] = useState<SubscriptionTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [renewTarget, setRenewTarget] = useState<SubscriptionTenant | null>(null);
  const [resetTarget, setResetTarget] = useState<SubscriptionTenant | null>(null);
  const [disableTarget, setDisableTarget] = useState<SubscriptionTenant | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [lastCopied, setLastCopied] = useState(false);
  const [visibleOnce, setVisibleOnce] = useState<VisibleOnceResult | null>(null);

  const refreshRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await apiClient.listTenants());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    void refreshRows();
  }, [refreshRows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.displayName, row.status, row.nodeName, row.note, row.tokenPrefix]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [rows, search]);

  const counts = {
    total: rows.length,
    active: rows.filter((row) => row.status === "active").length,
    expiring: rows.filter((row) => row.status === "expiring").length,
    blocked: rows.filter((row) => row.status === "disabled" || row.status === "expired").length
  };

  function unavailableExistingUrl() {
    setActionError("Full subscription URLs are only visible immediately after create, reset, or temporary-link generation.");
  }

  async function createTempLink(row: SubscriptionTenant) {
    setActionError("");
    try {
      const result = await apiClient.createTempLink(row.id);
      setVisibleOnce({ title: `Temporary link for ${row.displayName}`, url: result.subscriptionUrl });
      await refreshRows();
    } catch (requestError) {
      setActionError(errorMessage(requestError));
    }
  }

  function requestStatusToggle(row: SubscriptionTenant) {
    setActionError("");
    setActionNotice("");
    setConfirmError("");
    if (row.status === "disabled") {
      void enableSubscription(row);
      return;
    }
    setDisableTarget(row);
  }

  async function enableSubscription(row: SubscriptionTenant) {
    setActionError("");
    setActionNotice("");
    try {
      await apiClient.enableTenant(row.id);
      setActionNotice(`Enabled ${row.displayName}.`);
      await refreshRows();
    } catch (requestError) {
      setActionError(errorMessage(requestError));
    }
  }

  async function confirmDisable() {
    if (!disableTarget) return;

    const target = disableTarget;
    setConfirmPending(true);
    setConfirmError("");
    try {
      await apiClient.disableTenant(target.id);
      setDisableTarget(null);
      setActionNotice(`Disabled ${target.displayName}.`);
      await refreshRows();
    } catch (requestError) {
      setConfirmError(errorMessage(requestError));
    } finally {
      setConfirmPending(false);
    }
  }

  function cancelDisable() {
    if (confirmPending) return;
    setDisableTarget(null);
    setConfirmError("");
  }

  async function copyVisibleOnce() {
    if (!visibleOnce) return;
    await copyText(visibleOnce.url);
    setLastCopied(true);
    window.setTimeout(() => setLastCopied(false), 1800);
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Subscription users</h2>
          <p className="muted">Manual subscription management for the AWS Singapore node.</p>
        </div>
        <CreateSubscriptionDialog
          onCreate={async (input) => {
            const result = await apiClient.createTenant(input);
            await refreshRows();
            return result.subscriptionUrl;
          }}
        />
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {actionError ? <div className="alert alert-error">{actionError}</div> : null}
      {actionNotice ? <div className="alert">{actionNotice}</div> : null}
      {visibleOnce ? (
        <div className="visible-once">
          <strong>{visibleOnce.title}</strong>
          <code>{visibleOnce.url}</code>
          <div className="result-actions">
            <button className="ghost-button" type="button" onClick={copyVisibleOnce}>
              {lastCopied ? "Copied" : "Copy URL"}
            </button>
            <button className="ghost-button" type="button" onClick={() => setVisibleOnce(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="metric-grid">
        <Metric label="Total" value={counts.total} />
        <Metric label="Active" value={counts.active} />
        <Metric label="Expiring" value={counts.expiring} />
        <Metric label="Disabled / expired" value={counts.blocked} />
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Node</th>
              <th>Credential</th>
              <th>Token</th>
              <th>Last used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="loading-row" colSpan={8}>Loading subscriptions...</td>
              </tr>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td className="loading-row" colSpan={8}>No subscriptions found.</td>
              </tr>
            ) : null}
            {!loading && filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.displayName}</strong>
                  <span className="table-note">{row.note}</span>
                </td>
                <td><StatusBadge status={row.status} /></td>
                <td>{formatDate(row.expiresAt)}</td>
                <td>{row.nodeName}</td>
                <td>{row.credentialMode}</td>
                <td><code>{row.tokenPrefix}</code></td>
                <td>{formatLastUsed(row.lastUsedAt)}</td>
                <td>
                  <div className="action-row">
                    <button className="icon-button" type="button" onClick={unavailableExistingUrl} title="Copy subscription URL">
                      <Copy aria-hidden="true" />
                    </button>
                    <button className="icon-button" type="button" onClick={() => void createTempLink(row)} title="Create temporary link">
                      <Link aria-hidden="true" />
                    </button>
                    <button className="icon-button" type="button" onClick={() => setRenewTarget(row)} title="Renew subscription">
                      <RotateCcw aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => requestStatusToggle(row)}
                      title={row.status === "disabled" ? "Enable subscription" : "Disable subscription"}
                    >
                      {row.status === "disabled" ? <ShieldCheck aria-hidden="true" /> : <ShieldOff aria-hidden="true" />}
                    </button>
                    <button className="icon-button" type="button" onClick={() => setResetTarget(row)} title="Reset token">
                      <MoreHorizontal aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RenewSubscriptionDialog
        tenant={renewTarget}
        onClose={() => setRenewTarget(null)}
        onRenew={async (input) => {
          await apiClient.renewTenant(input);
          await refreshRows();
        }}
      />
      <ConfirmActionDialog
        open={Boolean(disableTarget)}
        title="Disable subscription"
        tenantName={disableTarget?.displayName ?? ""}
        consequence="This user will not be able to fetch a valid subscription until the subscription is enabled again."
        confirmLabel="Disable subscription"
        tone="danger"
        pending={confirmPending}
        error={disableTarget ? confirmError : ""}
        onCancel={cancelDisable}
        onConfirm={() => void confirmDisable()}
      />
      <ResetTokenDialog
        tenant={resetTarget}
        onClose={() => {
          setResetTarget(null);
          void refreshRows();
        }}
        onReset={(id) => apiClient.resetToken(id)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
