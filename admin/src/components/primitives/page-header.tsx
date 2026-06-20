import type { ReactNode } from "react";

export function PageHeader({
  ariaLabel,
  description,
  kicker,
  meta,
  status,
  title
}: {
  ariaLabel: string;
  description: string;
  kicker?: string;
  meta?: ReactNode;
  status?: ReactNode;
  title: string;
}) {
  return (
    <div className="dashboard-hero" aria-label={ariaLabel}>
      <div>
        {kicker ? <p className="dashboard-kicker">{kicker}</p> : null}
        <div className="dashboard-title-row">
          <h2>{title}</h2>
          {meta}
        </div>
        <p className="muted">{description}</p>
      </div>
      {status}
    </div>
  );
}
