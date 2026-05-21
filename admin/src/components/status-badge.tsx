import type { SubscriptionStatus } from "../features/subscriptions/types";
import { cn } from "../lib/utils";

const labels: Record<SubscriptionStatus, string> = {
  active: "Active",
  expiring: "Expiring",
  expired: "Expired",
  disabled: "Disabled"
};

export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return <span className={cn("status-badge", `status-${status}`)}>{labels[status]}</span>;
}
