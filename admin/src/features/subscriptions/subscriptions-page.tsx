import { useMemo, useState } from "react";
import { Check, Copy, MoreHorizontal, RotateCcw, ShieldCheck, ShieldOff } from "lucide-react";
import { StatusBadge } from "../../components/status-badge";
import { copyText } from "../../lib/clipboard";
import { createMockSubscriptionStore } from "./mock-client";
import type { SubscriptionTenant } from "./types";
import { CreateSubscriptionDialog } from "./create-subscription-dialog";
import { RenewSubscriptionDialog } from "./renew-subscription-dialog";
import { ResetTokenDialog } from "./reset-token-dialog";

const store = createMockSubscriptionStore();

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

export function SubscriptionsPage({ search }: { search: string }) {
  const [rows, setRows] = useState(() => store.list());
  const [renewTarget, setRenewTarget] = useState<SubscriptionTenant | null>(null);
  const [resetTarget, setResetTarget] = useState<SubscriptionTenant | null>(null);
  const [lastCopied, setLastCopied] = useState<string | null>(null);

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

  async function copyLink(row: SubscriptionTenant) {
    const url = `https://52.221.198.76.sslip.io/sub/clash.yaml?token=${row.tokenPrefix}_hidden`;
    await copyText(url);
    setLastCopied(row.id);
    window.setTimeout(() => setLastCopied(null), 1800);
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Subscription users</h2>
          <p className="muted">Manual subscription management for the AWS Singapore node.</p>
        </div>
        <CreateSubscriptionDialog
          onCreate={(input) => {
            const result = store.create(input);
            setRows(store.list());
            return result.subscriptionUrl;
          }}
        />
      </div>

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
            {filtered.map((row) => (
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
                    <button className="icon-button" type="button" onClick={() => copyLink(row)} title="Copy subscription URL">
                      {lastCopied === row.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    </button>
                    <button className="icon-button" type="button" onClick={() => setRenewTarget(row)} title="Renew subscription">
                      <RotateCcw aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => {
                        if (row.status === "disabled") store.enable(row.id);
                        else store.disable(row.id);
                        setRows(store.list());
                      }}
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
        onRenew={(input) => {
          store.renew(input);
          setRows(store.list());
        }}
      />
      <ResetTokenDialog
        tenant={resetTarget}
        onClose={() => {
          setResetTarget(null);
          setRows(store.list());
        }}
        onReset={(id) => store.resetToken(id)}
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
