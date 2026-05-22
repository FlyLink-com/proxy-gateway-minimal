import { useState, type FormEvent } from "react";
import {
  checkAdminConnectionHealth,
  type ConnectionHealthResult
} from "./connection-health";
import {
  saveAdminSession,
  type AdminSession
} from "./admin-session";

type ConnectionPanelProps = {
  session: AdminSession;
  onSave: (session: AdminSession) => void;
  checkConnection?: typeof checkAdminConnectionHealth;
};

function healthClassName(result: ConnectionHealthResult) {
  return result.status === "connected"
    ? "connection-health connection-health-ok"
    : "connection-health connection-health-warning";
}

export function ConnectionPanel({
  session,
  onSave,
  checkConnection = checkAdminConnectionHealth
}: ConnectionPanelProps) {
  const [baseUrl, setBaseUrl] = useState(session.baseUrl);
  const [consoleToken, setConsoleToken] = useState(session.consoleToken);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealthResult | null>(null);

  function updateBaseUrl(value: string) {
    setBaseUrl(value);
    setConnectionHealth(null);
  }

  function updateConsoleToken(value: string) {
    setConsoleToken(value);
    setConnectionHealth(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { baseUrl: baseUrl.trim(), consoleToken: consoleToken.trim() };
    saveAdminSession(next);
    onSave(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  async function checkConnectionStatus() {
    setSaved(false);
    setChecking(true);
    try {
      const result = await checkConnection({
        baseUrl,
        consoleToken
      });
      setConnectionHealth(result);
    } finally {
      setChecking(false);
    }
  }

  return (
    <form className="connection-panel" onSubmit={submit}>
      <div>
        <strong>Admin API connection</strong>
        <p className="muted">Use the same-origin proxy or an SSH tunnel. Public Nginx blocks admin APIs.</p>
      </div>
      <div className="connection-stack">
        <div className="connection-grid">
          <label>
            <span>API base URL</span>
            <input
              value={baseUrl}
              onChange={(event) => updateBaseUrl(event.target.value)}
              placeholder="Same origin"
            />
          </label>
          <label>
            <span>Console token</span>
            <input
              value={consoleToken}
              onChange={(event) => updateConsoleToken(event.target.value)}
              type="password"
              autoComplete="off"
            />
          </label>
          <div className="connection-actions">
            <button className="primary-button" type="submit">
              {saved ? "Saved" : "Save"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={checkConnectionStatus}
              disabled={checking}
            >
              {checking ? "Checking" : "Check connection"}
            </button>
          </div>
        </div>
        {connectionHealth ? (
          <div className={healthClassName(connectionHealth)} role="status">
            <strong>{connectionHealth.title}</strong>
            <span>{connectionHealth.message}</span>
          </div>
        ) : null}
      </div>
    </form>
  );
}
