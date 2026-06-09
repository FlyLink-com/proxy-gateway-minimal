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
            <strong>GlobalCircle AI</strong>
            <span>运营管理控制台</span>
          </div>
        </div>

        <div className="admin-setup-heading">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h1 id="admin-setup-heading">连接管理员 API</h1>
            <p>保存控制台令牌后才能进入运营总览、订单管理和用量监护。</p>
          </div>
        </div>

        <div className="admin-setup-actions">
          <button className="ghost-button" type="button" onClick={onOpenSite}>
            预览网站
          </button>
          <button className="ghost-button" type="button" onClick={onOpenPortal}>
            打开用户面板
          </button>
        </div>

        <div className="admin-setup-panel">
          {connectionPanel}
        </div>
      </section>
    </main>
  );
}
