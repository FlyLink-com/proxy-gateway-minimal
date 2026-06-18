import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

export type EmptyStateChrome = "workstream" | "case" | "none";

export function EmptyState({
  checklist,
  chrome = "workstream",
  className = "",
  title,
  description,
  descriptionClassName,
  role
}: {
  title: string;
  description: ReactNode;
  checklist?: string[];
  chrome?: EmptyStateChrome;
  className?: string;
  descriptionClassName?: string;
  role?: "alert" | "status";
}) {
  const classes = [
    chrome === "workstream" ? "workstream-empty-state" : "",
    chrome === "case" ? "case-state case-empty-state" : "",
    className
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} role={role}>
      <strong>{title}</strong>
      <p className={descriptionClassName}>{description}</p>
      {checklist?.length ? (
        <div className="workstream-empty-checks">
          {checklist.map((item) => (
            <span key={item}>
              <CheckCircle2 aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
