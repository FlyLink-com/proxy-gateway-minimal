const STORED_STATUSES = new Set(["active", "disabled"]);

export function normalizeStoredStatus(status) {
  if (STORED_STATUSES.has(status)) {
    return status;
  }
  throw new Error(`Invalid stored status: ${status}`);
}

export function computeSubscriptionStatus({
  storedStatus,
  expiresAt,
  now = new Date(),
  expiringDays = 7
}) {
  const normalized = normalizeStoredStatus(storedStatus);
  if (normalized === "disabled") {
    return "disabled";
  }

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    throw new Error(`Invalid expiry date: ${expiresAt}`);
  }

  if (expiry.getTime() <= now.getTime()) {
    return "expired";
  }

  const warningAt = new Date(now.getTime() + expiringDays * 24 * 60 * 60 * 1000);
  return expiry.getTime() <= warningAt.getTime() ? "expiring" : "active";
}
