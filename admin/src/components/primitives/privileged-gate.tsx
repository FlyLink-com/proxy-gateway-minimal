import { ChevronUp, ShieldCheck } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type PrivilegedGateState = "hidden" | "gated" | "fresh-mfa-required" | "unavailable";
export type PrivilegedGateCapability = "readonly" | "super-admin";

export type PrivilegedGateProps = {
  ariaLabel?: string;
  capability?: PrivilegedGateCapability;
  className?: string;
  description: string;
  detail?: ReactNode;
  icon?: ReactNode;
  state?: PrivilegedGateState;
  title: string;
};

export function PrivilegedGate({
  ariaLabel = "Production action guard",
  capability = "readonly",
  className,
  description,
  detail,
  icon,
  state = "gated",
  title
}: PrivilegedGateProps) {
  if (state === "hidden") {
    return null;
  }

  return (
    <details
      className={cn("sidebar-safety-footer", className)}
      data-capability={capability}
      data-figma-component="PrivilegedGate"
      data-gate-state={state}
      data-ui-surface="privileged-gate"
    >
      <summary className="sidebar-safety-summary" aria-label={ariaLabel}>
        {icon ?? <ShieldCheck aria-hidden="true" />}
        <strong>{title}</strong>
        <span>{description}</span>
        <ChevronUp aria-hidden="true" />
      </summary>
      {detail ? (
        <div className="sidebar-safety-detail">
          {detail}
        </div>
      ) : null}
    </details>
  );
}
