import { CheckCircle2 } from "lucide-react";
import type { ElementType, ReactNode } from "react";

export type StateFeedbackChrome = "workstream" | "case" | "table" | "none";
export type StateFeedbackTone = "empty" | "error" | "loading" | "stale";

export function StateFeedback({
  ariaLabel,
  as: Component = "div",
  checklist,
  chrome = "workstream",
  className = "",
  description,
  descriptionClassName,
  role,
  title,
  tone = "empty"
}: {
  as?: ElementType;
  title: ReactNode;
  ariaLabel?: string;
  description?: ReactNode;
  checklist?: string[];
  chrome?: StateFeedbackChrome;
  className?: string;
  descriptionClassName?: string;
  role?: "alert" | "status";
  tone?: StateFeedbackTone;
}) {
  const feedbackRole = role ?? (tone === "error" ? "alert" : "status");
  const classes = [
    "state-feedback",
    `state-feedback-${tone}`,
    chrome === "workstream" ? "workstream-empty-state" : "",
    chrome === "case" ? "case-state case-empty-state" : "",
    chrome === "table" ? "new-console-state-cell" : "",
    className
  ].filter(Boolean).join(" ");

  return (
    <Component
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
      className={classes}
      data-chrome={chrome}
      data-state-feedback={tone}
      data-ui-surface="state-feedback"
      role={feedbackRole}
    >
      <strong>{title}</strong>
      {description ? <p className={descriptionClassName}>{description}</p> : null}
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
    </Component>
  );
}
