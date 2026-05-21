export function OverviewPage() {
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Service overview</h2>
          <p className="muted">Current production subscription service summary.</p>
        </div>
      </div>
      <div className="metric-grid">
        <div className="metric-card">
          <span>Production node</span>
          <strong>1</strong>
        </div>
        <div className="metric-card">
          <span>Admin mode</span>
          <strong>Mock</strong>
        </div>
        <div className="metric-card">
          <span>Client support</span>
          <strong>Karing</strong>
        </div>
        <div className="metric-card">
          <span>Region</span>
          <strong>SG</strong>
        </div>
      </div>
    </div>
  );
}
