// B2-a backfill inventory (read-only): counts the accounts the B2-b login
// switch and the B2-c registration guard must deal with, before any of them
// moves. Pure function over account rows: no database access, no writes, no
// raw email in the output (only account ids and digests, which are already
// hashes). The CLI in scripts/b2-backfill-inventory.mjs supplies the rows
// from a read-only database handle.
//
// Outputs (see the B2 design §4.1 A4):
// - total accounts + status distribution
// - accounts with / without identity bindings (today: all without)
// - groups sharing the same loginDigest (login-ambiguity candidates)
// - accounts whose loginRef differs from displayRef
// - accounts whose loginRef is not email-shaped, and accounts missing it
// - missing rate per unkeyed-digest field (the 8 digest fields of the
//   creation allowlist)
// - accounts with / without a stored displayEmailMasked (the backfill
//   baseline for the B2-a writer)

import { isMaskedEmailDisplay } from "./email-masking.mjs";

export const B2_BACKFILL_INVENTORY_DIGEST_FIELDS = [
  "contactDigest",
  "loginDigest",
  "displayDigest",
  "useCaseDigest",
  "legalAgreementSourceIpDigest",
  "legalAgreementRequestKeyDigest",
  "registrationSourceIpDigest",
  "registrationRequestKeyDigest"
];

// Same shape as EMAIL_SHAPE in email-masking.mjs (kept local so the
// inventory never imports a display helper for a classification decision).
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function isMissing(value) {
  return value === null
    || value === undefined
    || (typeof value === "string" && value.trim() === "");
}

function metadataOf(account) {
  const metadata = account?.metadata;
  return metadata && typeof metadata === "object" ? metadata : {};
}

export function buildB2BackfillInventory({ accounts = [], boundAccountIds = [] } = {}) {
  if (!Array.isArray(accounts)) {
    throw new TypeError("b2 backfill inventory requires an accounts array");
  }
  const bound = new Set(boundAccountIds);
  const statusDistribution = {};
  const loginDigestGroups = new Map();
  const loginRefDisplayRefMismatch = [];
  const nonEmailLoginRefs = [];
  const accountsMissingLoginRef = [];
  const digestMissing = {};
  for (const field of B2_BACKFILL_INVENTORY_DIGEST_FIELDS) {
    digestMissing[field] = 0;
  }
  let accountsWithBindings = 0;
  let accountsWithDisplayEmailMasked = 0;

  for (const account of accounts) {
    const metadata = metadataOf(account);
    const status = typeof account?.status === "string" && account.status !== "" ? account.status : "unknown";
    statusDistribution[status] = (statusDistribution[status] ?? 0) + 1;
    if (bound.has(account?.id)) accountsWithBindings += 1;
    if (isMaskedEmailDisplay(metadata.displayEmailMasked)) accountsWithDisplayEmailMasked += 1;

    const loginDigest = metadata.loginDigest;
    if (typeof loginDigest === "string" && loginDigest !== "") {
      if (!loginDigestGroups.has(loginDigest)) loginDigestGroups.set(loginDigest, []);
      loginDigestGroups.get(loginDigest).push(account.id);
    }

    const loginRef = typeof metadata.loginRef === "string" ? metadata.loginRef : "";
    const displayRef = typeof metadata.displayRef === "string" ? metadata.displayRef : "";
    if (loginRef !== "" && displayRef !== "" && loginRef !== displayRef) {
      loginRefDisplayRefMismatch.push(account.id);
    }
    if (loginRef === "") {
      accountsMissingLoginRef.push(account.id);
    } else if (!EMAIL_SHAPE.test(loginRef)) {
      nonEmailLoginRefs.push(account.id);
    }

    for (const field of B2_BACKFILL_INVENTORY_DIGEST_FIELDS) {
      if (isMissing(metadata[field])) digestMissing[field] += 1;
    }
  }

  const totalAccounts = accounts.length;
  const digestMissingRates = {};
  for (const field of B2_BACKFILL_INVENTORY_DIGEST_FIELDS) {
    digestMissingRates[field] = {
      missing: digestMissing[field],
      total: totalAccounts,
      missingRate: totalAccounts === 0 ? 0 : digestMissing[field] / totalAccounts
    };
  }

  return {
    totalAccounts,
    statusDistribution,
    accountsWithBindings,
    accountsWithoutBindings: totalAccounts - accountsWithBindings,
    accountsWithDisplayEmailMasked,
    accountsWithoutDisplayEmailMasked: totalAccounts - accountsWithDisplayEmailMasked,
    duplicateLoginDigestGroups: [...loginDigestGroups.entries()]
      .filter(([, accountIds]) => accountIds.length > 1)
      .map(([loginDigest, accountIds]) => ({
        loginDigest,
        accountIds: [...accountIds],
        accountCount: accountIds.length
      })),
    loginRefDisplayRefMismatch: {
      count: loginRefDisplayRefMismatch.length,
      accountIds: loginRefDisplayRefMismatch
    },
    nonEmailLoginRefs: {
      count: nonEmailLoginRefs.length,
      accountIds: nonEmailLoginRefs
    },
    accountsMissingLoginRef: {
      count: accountsMissingLoginRef.length,
      accountIds: accountsMissingLoginRef
    },
    digestMissingRates
  };
}
