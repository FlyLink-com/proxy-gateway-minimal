export type PageSubNavItem = {
  id: string;
  label: string;
  description: string;
  mode?: "preview" | "owner";
  targetId: string;
};

export function PageSubNav({
  ariaLabel,
  items
}: {
  ariaLabel: string;
  items: PageSubNavItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="page-subnav" aria-label={ariaLabel}>
      <div className="page-subnav-scroll">
        {items.map((item) => (
          <a
            aria-label={item.label}
            className={`page-subnav-link page-subnav-link-${item.mode ?? "owner"}`}
            data-mode={item.mode ?? "owner"}
            href={`#${item.targetId}`}
            key={item.id}
            title={item.description}
          >
            <span className="page-subnav-card-head">
              <span className="page-subnav-marker" aria-hidden="true" />
              <span>{item.label}</span>
            </span>
            <span className="page-subnav-mode">{modeLabel(item.mode)}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function modeLabel(mode: PageSubNavItem["mode"]) {
  return mode === "preview" ? "Preview" : "Owner";
}
