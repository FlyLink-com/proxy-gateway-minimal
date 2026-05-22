import { useMemo, useState, type FormEvent } from "react";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";
import { createAdminApiClient, type AdminApiClient } from "./features/subscriptions/api-client";
import {
  loadAdminSession,
  saveAdminSession,
  type AdminSession
} from "./features/subscriptions/admin-session";
import { SubscriptionsPage } from "./features/subscriptions/subscriptions-page";
import { ApiPlaygroundPage } from "./pages/api-playground-page";
import { DiagnosticsPage } from "./pages/diagnostics-page";
import { NodesPage } from "./pages/nodes-page";
import { OverviewPage } from "./pages/overview-page";
import { SettingsPage } from "./pages/settings-page";

export function App() {
  const [activePage, setActivePage] = useState<AdminPage>("subscriptions");
  const [search, setSearch] = useState("");
  const [adminSession, setAdminSession] = useState(() => loadAdminSession());
  const apiClient = useMemo(
    () => createAdminApiClient(adminSession),
    [adminSession.baseUrl, adminSession.consoleToken]
  );

  return (
    <AdminLayout
      activePage={activePage}
      search={search}
      onSearchChange={setSearch}
      onNavigate={setActivePage}
    >
      <ConnectionPanel session={adminSession} onSave={setAdminSession} />
      {renderPage(activePage, search, apiClient, adminSession)}
    </AdminLayout>
  );
}

function renderPage(
  activePage: AdminPage,
  search: string,
  apiClient: AdminApiClient,
  adminSession: AdminSession
) {
  switch (activePage) {
    case "overview":
      return <OverviewPage apiClient={apiClient} />;
    case "subscriptions":
      return <SubscriptionsPage search={search} apiClient={apiClient} />;
    case "nodes":
      return <NodesPage apiClient={apiClient} />;
    case "diagnostics":
      return <DiagnosticsPage />;
    case "api-playground":
      return <ApiPlaygroundPage />;
    case "settings":
      return <SettingsPage session={adminSession} />;
  }
}

function ConnectionPanel({
  session,
  onSave
}: {
  session: AdminSession;
  onSave: (session: AdminSession) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(session.baseUrl);
  const [consoleToken, setConsoleToken] = useState(session.consoleToken);
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { baseUrl: baseUrl.trim(), consoleToken: consoleToken.trim() };
    saveAdminSession(next);
    onSave(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <form className="connection-panel" onSubmit={submit}>
      <div>
        <strong>Admin API connection</strong>
        <p className="muted">Use the same-origin proxy or an SSH tunnel. Public Nginx blocks admin APIs.</p>
      </div>
      <div className="connection-grid">
        <label>
          <span>API base URL</span>
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="Same origin"
          />
        </label>
        <label>
          <span>Console token</span>
          <input
            value={consoleToken}
            onChange={(event) => setConsoleToken(event.target.value)}
            type="password"
            autoComplete="off"
          />
        </label>
        <button className="primary-button" type="submit">
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </form>
  );
}
