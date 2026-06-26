import { useMemo } from "react";
import { type AdminPage } from "../app/navigation";
import {
  createAdminSearchResults,
  normalizeAdminSearchQuery
} from "../app/admin-search-index";
import { overviewBlueprint } from "./dashboard-page";
import { accountsResourcesBlueprint } from "./portal-requests-page";
import { usageChannelsBlueprint } from "./subscription-usage-monitor-page";

export function AdminSearchResultsPage({
  searchQuery,
  onNavigate
}: {
  searchQuery: string;
  onNavigate: (page: AdminPage) => void;
}) {
  const normalizedQuery = normalizeAdminSearchQuery(searchQuery);
  const blueprints = useMemo(() => [
    overviewBlueprint(),
    accountsResourcesBlueprint,
    usageChannelsBlueprint
  ], []);
  const results = useMemo(() => createAdminSearchResults({
    blueprints,
    query: searchQuery
  }), [blueprints, searchQuery]);

  function openSearchResult({
    navId,
    page,
    targetId
  }: {
    navId?: string;
    page?: AdminPage;
    targetId?: string;
  }) {
    if (!page) {
      return;
    }

    onNavigate(page);

    if (!targetId) {
      return;
    }

    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("admin-open-module", {
        detail: {
          navId,
          page,
          targetId
        }
      }));
      window.setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({
          block: "start",
          behavior: "smooth"
        });
      }, 0);
    }, 0);
  }

  const capabilityLabels = {
    available: "Available",
    "read-only": "Read only",
    planned: "Planned"
  };

  return (
    <div
      className="page-stack admin-search-page"
      data-query-state={normalizedQuery ? "active" : "idle"}
      data-ui-role="system-search"
    >
      <header className="admin-blueprint-page-hero" aria-label="Admin system search header">
        <p>System Search</p>
        <h1>Search Results</h1>
        <p>Search across active pages, modules, ownership boundaries, and planned console routes.</p>
      </header>

      <section className="admin-search-summary" aria-label="Admin system search results" role="status">
        <strong>{results.length} safe results</strong>
        <span>for "{searchQuery.trim()}" across Admin Console system search</span>
      </section>

      {results.length > 0 ? (
        <div className="admin-search-result-list" aria-label="System search result list">
          {results.map((result) => (
            <article
              className="admin-search-result-card"
              data-capability-state={result.capabilityState}
              data-result-type={result.type}
              key={result.id}
            >
              <div className="admin-search-result-main">
                <div className="admin-search-result-meta">
                  <span>{result.group}</span>
                  <span>{result.eyebrow}</span>
                  <span>{result.objectType}</span>
                  <span>{result.statusLabel}</span>
                  <span>{capabilityLabels[result.capabilityState]}</span>
                </div>
                <h2>{result.title}</h2>
                <p>{result.description}</p>
                <div className="admin-search-result-tags" aria-label={`${result.title} search ownership`}>
                  <span>{result.owner}</span>
                  <span>Route: {result.routeTarget}</span>
                  <span>Matched: {result.matchedField}</span>
                  {result.navId ? <span>{result.navId}</span> : null}
                </div>
              </div>
              {result.page ? (
                <button
                  className="admin-search-result-action"
                  onClick={() => openSearchResult(result)}
                  type="button"
                >
                  Open
                </button>
              ) : (
                <span className="admin-search-result-action admin-search-result-action-disabled">
                  Planned
                </span>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="admin-blueprint-empty-workbench" role="status">
          <h2>No system results.</h2>
          <p>Try an account, order, channel, usage, risk, case, or settings term.</p>
        </section>
      )}
    </div>
  );
}
