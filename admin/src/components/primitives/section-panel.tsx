import type { ReactNode } from "react";

export function SectionPanel({
  title,
  description,
  action,
  ariaLabel = title,
  children,
  className = "",
  icon,
  status
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  status?: ReactNode;
}) {
  const classes = ["dashboard-panel", className].filter(Boolean).join(" ");
  const rightSlot = status || action || icon;

  return (
    <section className={classes} aria-label={ariaLabel}>
      <div className="dashboard-panel-heading">
        <div>
          <h3>{title}</h3>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        {rightSlot ? (
          <div className="dashboard-panel-actions">
            {status}
            {action}
            {!status && !action && icon ? <span className="dashboard-panel-icon">{icon}</span> : null}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
