import { AdminOperationsShell } from "./admin-operations-shell";

export function AdminProductionBaselinePreview() {
  return (
    <AdminOperationsShell
      preview={{
        title: "GlobalCircle AI - Operator Console",
        navLabel: "本地对比导航",
        banner: (
          <aside className="admin-fixture-preview-banner admin-baseline-preview-note" aria-label="Admin production baseline preview status">
            <strong>本地候选 · 只读监控</strong>
            <span>Admin 本地验收</span>
            <p>默认未连接实时数据；开始后仅查询已接入的安全摘要。</p>
          </aside>
        )
      }}
    />
  );
}
