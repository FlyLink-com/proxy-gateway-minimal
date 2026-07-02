export type PageSubNavItem = {
  id: string;
  label: string;
  description: string;
  mode?: "preview" | "owner";
  targetId: string;
};

export function PageSubNav({
  activeId,
  ariaLabel,
  items,
  modeLabels,
  onSelect
}: {
  activeId?: string;
  ariaLabel: string;
  items: PageSubNavItem[];
  modeLabels?: Record<"owner" | "preview", string>;
  onSelect?: (item: PageSubNavItem) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="page-subnav" aria-label={ariaLabel}>
      <div className="page-subnav-scroll">
        {items.map((item) => (
          <button
            aria-current={item.id === activeId ? "page" : undefined}
            aria-label={item.label}
            className={`page-subnav-link page-subnav-link-${item.mode ?? "owner"}`}
            data-mode={item.mode ?? "owner"}
            data-state={item.id === activeId ? "active" : "idle"}
            key={item.id}
            onClick={() => onSelect?.(item)}
            title={item.description}
            type="button"
          >
            <span className="page-subnav-card-head">
              <span className="page-subnav-marker" aria-hidden="true" />
              <span>{item.label}</span>
            </span>
            <span className="page-subnav-mode">{modeLabel(item.mode, modeLabels)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function modeLabel(mode: PageSubNavItem["mode"], modeLabels?: Record<"owner" | "preview", string>) {
  if (modeLabels) {
    return modeLabels[mode ?? "owner"];
  }
  return mode === "preview" ? "Preview" : "Owner";
}
