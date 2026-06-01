import { useEffect, useState } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type { SubscriptionNode } from "../features/subscriptions/types";
import { errorMessage } from "../lib/errors";

export function NodesPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [nodes, setNodes] = useState<SubscriptionNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiClient
      .listNodes()
      .then((result) => {
        if (!cancelled) setNodes(result);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(errorMessage(requestError, "Failed to load nodes."));
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
          <h2>Nodes</h2>
          <p className="muted">Read-only production node view for the admin shell.</p>
        </div>
      </div>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="loading-row" colSpan={3}>Loading nodes...</td>
              </tr>
            ) : null}
            {!loading && nodes.length === 0 ? (
              <tr>
                <td className="loading-row" colSpan={3}>No nodes returned by the backend.</td>
              </tr>
            ) : null}
            {!loading && nodes.map((node) => (
              <tr key={node.id}>
                <td><code>{node.id}</code></td>
                <td>{node.name}</td>
                <td>{node.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
