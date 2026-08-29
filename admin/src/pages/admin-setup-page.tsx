import { ShieldCheck } from "lucide-react";
import { type ReactNode } from "react";

export function AdminSetupPage({
  connectionPanel,
  onOpenPortal,
  onOpenSite
}: {
  connectionPanel: ReactNode;
  onOpenPortal: () => void;
  onOpenSite: () => void;
}) {
  return (
    <main className="admin-setup-shell">
      <section className="admin-setup-card" aria-labelledby="admin-setup-heading">
        <div className="admin-setup-brand">
          <div className="brand-mark">GC</div>
          <div>
            <strong>GCC WebOS</strong>
            <span>Operator Console</span>
          </div>
        </div>

        <div className="admin-setup-heading">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h1 id="admin-setup-heading">Connect Admin API</h1>
            <p>Save a console token before opening Overview, User Operations, or Platform Monitoring.</p>
          </div>
        </div>

        <div className="admin-setup-actions">
          <button className="ghost-button" type="button" onClick={onOpenSite}>
            Preview site
          </button>
          <button className="ghost-button" type="button" onClick={onOpenPortal}>
            Open user portal
          </button>
        </div>

        <div className="admin-setup-panel">
          {connectionPanel}
        </div>
      </section>
    </main>
  );
}
