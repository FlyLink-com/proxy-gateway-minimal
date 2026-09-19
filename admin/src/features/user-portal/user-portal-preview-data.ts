import type {
  PortalHumanVerificationChallenge,
  PortalInitialAccount
} from "./user-portal-types";

export function createLocalHumanVerificationChallenge(): PortalHumanVerificationChallenge {
  const left = 2 + Math.floor(Math.random() * 8);
  const right = 2 + Math.floor(Math.random() * 8);
  return {
    challengeId: `local-math-v1:${left}+${right}`,
    prompt: `${left} + ${right} = ?`,
    answer: String(left + right),
    safety: {
      noAdminApi: true,
      noPublicAdmin: true
    }
  };
}

export function createLocalPreviewInitialAccounts(count = 5): PortalInitialAccount[] {
  const knownRefs = [
    "user_safe_ref",
    "portal_user_001",
    "portal_user_002",
    "portal_user_003",
    "portal_user_004"
  ];
  return knownRefs.slice(0, Math.max(1, Math.min(count, knownRefs.length))).map((userRef, index) => ({
    userRef,
    displayName: index === 0 ? "user_safe_ref" : `Portal User ${String(index).padStart(3, "0")}`,
    issuedAt: "2026-06-03T00:00:00.000Z",
    requireSecuritySetup: true
  }));
}

export function previewPasswordForInitialAccount(account: PortalInitialAccount, index: number, fallbackPassword: string) {
  const explicitPassword = account.previewPassword?.trim();
  if (explicitPassword) return explicitPassword;
  if (index === 0) return fallbackPassword;
  return `${fallbackPassword}-${String(index).padStart(3, "0")}`;
}
