import { ArrowRight, ShieldCheck } from "lucide-react";
import { type ReactNode } from "react";
import { AdminLocaleProvider, useAdminLocale } from "../app/admin-locale";

export function AdminSetupPage({
  onOpenSite,
  protectedAuthPanel
}: {
  onOpenSite: () => void;
  protectedAuthPanel?: ReactNode;
}) {
  return (
    <AdminLocaleProvider>
      <AdminSetupPageShell
        onOpenSite={onOpenSite}
        protectedAuthPanel={protectedAuthPanel}
      />
    </AdminLocaleProvider>
  );
}

function AdminSetupPageShell({
  onOpenSite,
  protectedAuthPanel
}: {
  onOpenSite: () => void;
  protectedAuthPanel?: ReactNode;
}) {
  const { copy } = useAdminLocale();
  const loginCopy = copy.login;

  return (
    <main className="admin-setup-shell">
      <section className="admin-setup-card admin-login-surface" aria-labelledby="admin-setup-heading">
        <header className="admin-login-header">
          <div className="admin-setup-brand">
            <div className="admin-login-brand-mark" aria-hidden="true">
              <ShieldCheck />
            </div>
            <div>
              <strong>GlobalCircle AI</strong>
              <span>{loginCopy.brandSubtitle}</span>
            </div>
          </div>

          <div className="admin-setup-actions">
            <button className="ghost-button" type="button" onClick={onOpenSite}>
              {loginCopy.previewSite}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="admin-setup-heading">
          <h1 id="admin-setup-heading">{loginCopy.title}</h1>
        </div>

        {protectedAuthPanel ? (
          <div className="admin-setup-panel" aria-label={loginCopy.panelAriaLabel}>
            {protectedAuthPanel}
          </div>
        ) : null}
      </section>
    </main>
  );
}
