import type { AdminSession } from "../features/subscriptions/admin-session";

export function SettingsPage({ session }: { session: AdminSession }) {
  return (
    <div className="placeholder-panel">
      <h2>Settings</h2>
      <p className="muted">
        Admin API configuration is managed in the connection panel above. Public Nginx intentionally returns 404 for the admin UI and /api/admin/*.
      </p>
      <p className="muted">Current API base URL: {session.baseUrl}</p>
    </div>
  );
}
