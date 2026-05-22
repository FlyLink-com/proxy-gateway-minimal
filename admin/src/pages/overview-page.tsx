import { useEffect, useState } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type { SubscriptionOverview } from "../features/subscriptions/types";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to load overview.";
}

export function OverviewPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiClient
      .overview()
      .then((result) => {
        if (!cancelled) setOverview(result);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Service overview</h2>
          <p className="muted">Current production subscription service summary.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {loading ? <div className="alert">Loading overview...</div> : null}

      <div className="metric-grid">
        <Metric label="Total" value={overview?.total ?? 0} />
        <Metric label="Active" value={overview?.active ?? 0} />
        <Metric label="Expiring" value={overview?.expiring ?? 0} />
        <Metric label="Disabled / expired" value={(overview?.disabled ?? 0) + (overview?.expired ?? 0)} />
      </div>
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
