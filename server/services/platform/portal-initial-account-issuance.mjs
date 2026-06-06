import { randomBytes } from "node:crypto";

function issuanceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw issuanceError("validation_error", `${field} is required`);
  }
  return normalized;
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw issuanceError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function defaultRef(prefix) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function defaultInitialPassword() {
  return randomBytes(24).toString("base64url");
}

function safeSummary({ account, accountCreated, credentialSummary, issuedAt }) {
  return {
    action: "portal_initial_account_issued",
    accountId: account.id,
    accountCreated,
    credentialRef: credentialSummary.credentialRef,
    status: "issued",
    mustRotate: true,
    issuedAt,
    rawPasswordReturned: false,
    hashReturned: false,
    handoffRequired: true,
    safety: {
      rawPasswordReturned: false,
      hashReturned: false,
      rawSubscriptionUrlReturned: false,
      runtimeDbMutated: false
    }
  };
}

export function createPortalInitialAccountIssuanceService({
  controlStore,
  passwordCredentialService,
  nowFn = () => new Date().toISOString(),
  accountIdFactory = () => defaultRef("acct_portal"),
  passwordFactory = defaultInitialPassword
} = {}) {
  if (!controlStore) {
    throw new Error("controlStore is required");
  }
  if (!passwordCredentialService) {
    throw new Error("passwordCredentialService is required");
  }

  function now() {
    return isoText(nowFn(), "now");
  }

  function createOrValidateAccount(input, issuedAt) {
    const accountId = requiredText(input?.accountId || accountIdFactory(), "accountId");
    const ownerRef = requiredText(input?.ownerRef, "ownerRef");
    const existing = controlStore.getAccount(accountId);
    if (existing) {
      if (existing.status !== "active") {
        throw issuanceError("validation_error", "account is not active");
      }
      if (existing.ownerRef !== ownerRef) {
        throw issuanceError("validation_error", "account ownerRef mismatch");
      }
      return { account: existing, accountCreated: false };
    }

    const displayName = optionalText(input?.displayName);
    const account = controlStore.createAccount({
      id: accountId,
      ownerRef,
      status: "active",
      createdAt: issuedAt,
      updatedAt: issuedAt,
      metadata: displayName ? { displayName } : {}
    });
    return { account, accountCreated: true };
  }

  function issuePortalInitialAccount(input = {}) {
    const issuedAt = now();
    const issuedByRef = requiredText(input.issuedByRef, "issuedByRef");
    const approvalRef = requiredText(input.approvalRef, "approvalRef");
    const initialPassword = requiredText(passwordFactory(), "initialPassword");

    return controlStore.runInTransaction(() => {
      const { account, accountCreated } = createOrValidateAccount(input, issuedAt);
      const issuedCredential = passwordCredentialService.issueInitialPasswordCredential({
        accountId: account.id,
        plainPassword: initialPassword,
        issuedByRef,
        approvalRef,
        mustRotate: true
      });

      return {
        summary: safeSummary({
          account,
          accountCreated,
          credentialSummary: issuedCredential.summary,
          issuedAt
        }),
        handoffMaterial: {
          accountId: account.id,
          initialPassword,
          mustRotate: true,
          issuedAt,
          expiresOnFirstUse: true
        }
      };
    });
  }

  return {
    issuePortalInitialAccount
  };
}
