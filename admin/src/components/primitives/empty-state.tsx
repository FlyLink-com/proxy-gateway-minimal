import type { ReactNode } from "react";
import { StateFeedback, type StateFeedbackChrome } from "./state-feedback";

export type EmptyStateChrome = StateFeedbackChrome;

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
  return (
    <StateFeedback
      checklist={checklist}
      chrome={chrome}
      className={className}
      description={description}
      descriptionClassName={descriptionClassName}
      role={role}
      title={title}
      tone={role === "alert" ? "error" : "empty"}
    />
  );
}
