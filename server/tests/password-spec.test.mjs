import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AUTH0_BCRYPT_MAX_PASSWORD_BYTES,
  classifyAuth0FirstLoginPassword,
  evaluateSyntheticAuth0FirstLoginPassword,
  parsePortalScryptPasswordHash
} from "../services/platform/portal-identity-import-rehearsal.mjs";
import { createPortalInitialAccountIssuanceService } from "../services/platform/portal-initial-account-issuance.mjs";
import { createPortalPasswordCredentialService } from "../services/platform/portal-password-credentials.mjs";
import { createPortalRegistrationService } from "../services/platform/portal-registration.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

// B2-5 · G-12 R1 unified password specification tests.
// Locks the spec in b2-5-password-spec-DRAFT-2026-11-14.md against the
// production credential layer. All passwords below are synthetic.

const NOW = "2026-06-03T00:00:00.000Z";
const FIXED_SALT = Buffer.from("0123456789abcdef", "utf8");
const OTHER_SALT = Buffer.from("fedcba9876543210", "utf8");

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-password-spec-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedAccount(store, id) {
  store.createAccount({
    id,
    ownerRef: "owner_safe_ref",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });
}

function createCredentialService(store, options = {}) {
  let credentialIndex = 0;
  const prefix = options.prefix || "pwd_spec";
  return createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => NOW,
    saltFactory: options.saltFactory || (() => FIXED_SALT),
    credentialRefFactory: () => `${prefix}_${++credentialIndex}`,
    ...options.overrides
  });
}

function buildScryptHash(plainPassword, salt) {
  const derived = scryptSync(plainPassword, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return [
    "scrypt",
    "v=1",
    "N=32768",
    "r=8",
    "p=1",
    salt.toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

function issuePassword(store, service, accountId, plainPassword, extra = {}) {
  return service.issueInitialPasswordCredential({
    accountId,
    plainPassword,
    issuedByRef: "operator_safe_ref",
    approvalRef: "approval_safe_ref",
    ...extra
  });
}

function createRegistrationService(store) {
  let credentialIndex = 0;
  const accountIds = ["acct_reg_min", "acct_reg_max"];
  let accountIndex = 0;
  const passwordCredentialService = createPortalPasswordCredentialService({
    controlStore: store,
    nowFn: () => NOW,
    saltFactory: () => FIXED_SALT,
    credentialRefFactory: () => `pwd_reg_${++credentialIndex}`
  });
  return createPortalRegistrationService({
    controlStore: store,
    nowFn: () => new Date(NOW),
    accountIdFactory: () => accountIds[accountIndex++],
    userPortalAuth: {
      createPasswordSetupSession: () => ({ session: { sessionId: "setup_stub" } })
    },
    passwordCredentialService,
    portalAccessRequests: { submitRequest: () => ({}) }
  });
}

function registrationInput(email, password) {
  return {
    email,
    password,
    legalAgreement: {
      termsAccepted: true,
      privacyAccepted: true,
      termsVersion: "2026-07-02",
      privacyVersion: "2026-07-02"
    }
  };
}

test("password spec: issued scrypt envelope has the fixed seven-segment header and 64-byte derived value", () => {
  withStore((store) => {
    seedAccount(store, "acct_spec_envelope");
    const service = createCredentialService(store);
    const password = ["Spec-", "Check-", "2026!"].join("");
    issuePassword(store, service, "acct_spec_envelope", password);

    const stored = store.getActivePortalPasswordCredential("acct_spec_envelope");
    const parts = stored.passwordHash.split("$");
    assert.equal(parts.length, 7);
    assert.deepEqual(parts.slice(0, 5), ["scrypt", "v=1", "N=32768", "r=8", "p=1"]);
    assert.equal(Buffer.from(parts[5], "base64url").length, 16);
    assert.equal(Buffer.from(parts[6], "base64url").length, 64);
    // Independent cross-check: the stored hash equals a direct scryptSync
    // computation with the same fixed salt and parameters.
    assert.equal(stored.passwordHash, buildScryptHash(password, FIXED_SALT));

    const verified = service.verifyPasswordCredential({
      accountId: "acct_spec_envelope",
      plainPassword: password
    });
    assert.equal(verified.summary.action, "portal_password_verified");
  });
});

test("password spec: two issuances with different salts produce different hashes", () => {
  withStore((store) => {
    seedAccount(store, "acct_spec_salt_a");
    seedAccount(store, "acct_spec_salt_b");
    const password = "Same-Password-2026!";
    const serviceA = createCredentialService(store, {
      prefix: "pwd_spec_a",
      saltFactory: () => FIXED_SALT
    });
    const serviceB = createCredentialService(store, {
      prefix: "pwd_spec_b",
      saltFactory: () => OTHER_SALT
    });
    issuePassword(store, serviceA, "acct_spec_salt_a", password);
    issuePassword(store, serviceB, "acct_spec_salt_b", password);
    const hashA = store.getActivePortalPasswordCredential("acct_spec_salt_a").passwordHash;
    const hashB = store.getActivePortalPasswordCredential("acct_spec_salt_b").passwordHash;
    assert.notEqual(hashA, hashB);
    assert.equal(hashA, buildScryptHash(password, FIXED_SALT));
    assert.equal(hashB, buildScryptHash(password, OTHER_SALT));
  });
});

test("password spec: verification fails closed for altered parameters, wrong scheme, short segments and malformed hashes", () => {
  withStore((store) => {
    const valid = buildScryptHash(["Spec-", "Check-", "2026!"].join(""), FIXED_SALT);
    const variants = {
      altered_n: valid.replace("N=32768", "N=16384"),
      wrong_scheme: valid.replace(/^scrypt/, "bcrypt"),
      six_segments: valid.split("$").slice(0, 6).join("$"),
      single_segment: "not-a-hash",
      version_2: valid.replace("v=1", "v=2")
    };
    // Note: an empty stored hash is unrepresentable through the store API
    // (createPortalPasswordCredential rejects empty passwordHash at write
    // time), so the empty case cannot reach verification; the single-segment
    // variant covers the malformed-shape class instead.
    for (const [name, hash] of Object.entries(variants)) {
      const accountId = `acct_spec_failclosed_${name}`;
      seedAccount(store, accountId);
      store.createPortalPasswordCredential({
        id: `pwd_failclosed_${name}`,
        accountId,
        passwordHash: hash,
        status: "active",
        failureCount: 0,
        mustRotate: false,
        createdAt: NOW,
        updatedAt: NOW
      });
      const service = createCredentialService(store);
      assert.throws(
        () => service.verifyPasswordCredential({
          accountId,
          plainPassword: ["Spec-", "Check-", "2026!"].join("")
        }),
        (error) => error.code === "invalid_login",
        `variant ${name} must fail with invalid_login`
      );
    }

    // Control: the unaltered envelope verifies.
    seedAccount(store, "acct_spec_failclosed_control");
    const service = createCredentialService(store);
    issuePassword(store, service, "acct_spec_failclosed_control", ["Spec-", "Check-", "2026!"].join(""));
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_failclosed_control",
        plainPassword: ["Spec-", "Check-", "2026!"].join("")
      }).summary.action,
      "portal_password_verified"
    );
  });
});

test("password spec: trim-only normalization strips edge ECMAScript whitespace and preserves interior, case and code points", () => {
  withStore((store) => {
    const service = createCredentialService(store);

    // Shared-vector mirror: leading/trailing FEFF/NBSP/TAB/ideographic
    // space/paragraph separator are removed; interior FEFF and tabs stay.
    seedAccount(store, "acct_spec_trim_1");
    const raw = "\uFEFF\u00A0\tMiXeD\uFEFF  Case\tSensitive 1! \u00A0\u3000\u2029";
    const effective = "MiXeD\uFEFF  Case\tSensitive 1!";
    issuePassword(store, service, "acct_spec_trim_1", raw);
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_trim_1",
        plainPassword: effective
      }).summary.action,
      "portal_password_verified"
    );
    // Case is preserved: the lowercased effective value must not verify.
    assert.throws(
      () => service.verifyPasswordCredential({
        accountId: "acct_spec_trim_1",
        plainPassword: "mixed\uFEFF  case\tsensitive 1!"
      }),
      (error) => error.code === "invalid_login"
    );
    // Interior whitespace is preserved: collapsing the double space fails.
    assert.throws(
      () => service.verifyPasswordCredential({
        accountId: "acct_spec_trim_1",
        plainPassword: "MiXeD\uFEFF Case\tSensitive 1!"
      }),
      (error) => error.code === "invalid_login"
    );

    // No Unicode normalization: NFC and NFD forms stay distinct.
    seedAccount(store, "acct_spec_trim_2");
    issuePassword(store, service, "acct_spec_trim_2", "Caf\u00E9-2026!");
    assert.throws(
      () => service.verifyPasswordCredential({
        accountId: "acct_spec_trim_2",
        plainPassword: "Cafe\u0301-2026!"
      }),
      (error) => error.code === "invalid_login"
    );
  });
});

test("password spec: non-ECMAScript control characters are not trimmed", () => {
  withStore((store) => {
    const service = createCredentialService(store);
    seedAccount(store, "acct_spec_trim_3");
    const password = "\u001CSecret-2026!\u001F";
    issuePassword(store, service, "acct_spec_trim_3", password);
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_trim_3",
        plainPassword: password
      }).summary.action,
      "portal_password_verified"
    );
    // The controls are part of the password: without them it must fail.
    assert.throws(
      () => service.verifyPasswordCredential({
        accountId: "acct_spec_trim_3",
        plainPassword: "Secret-2026!"
      }),
      (error) => error.code === "invalid_login"
    );
  });
});

test("password spec: empty and whitespace-only passwords are rejected", () => {
  withStore((store) => {
    const service = createCredentialService(store);
    seedAccount(store, "acct_spec_empty");
    for (const bad of ["", "   ", "\u00A0\t "]) {
      assert.throws(
        () => issuePassword(store, service, "acct_spec_empty", bad),
        (error) => error.code === "validation_error"
      );
    }
  });
});

test("password spec: registration enforces 8-160 characters and accepts both boundaries", () => {
  withStore((store) => {
    const registration = createRegistrationService(store);

    for (const bad of ["a".repeat(7), "a".repeat(161)]) {
      assert.throws(
        () => registration.submitRegistration(
          registrationInput(`spec-len-${bad.length}@example.test`, bad)
        ),
        (error) => error.code === "validation_error"
      );
    }

    const min = registration.submitRegistration(
      registrationInput("spec-len-8@example.test", "a".repeat(8))
    );
    assert.equal(min.registration.action, "portal_registration_created");
    assert.equal(min.registration.safety.rawPasswordReturned, false);
    assert.ok(!JSON.stringify(min).includes("a".repeat(8)));

    const max = registration.submitRegistration(
      registrationInput("spec-len-160@example.test", "a".repeat(160))
    );
    assert.equal(max.registration.action, "portal_registration_created");

    // The 8-character registration can log in through the credential layer.
    const credentialService = createCredentialService(store);
    assert.equal(store.listAccounts().length, 2);
    assert.equal(
      credentialService.verifyPasswordCredential({
        accountId: "acct_reg_min",
        plainPassword: "a".repeat(8)
      }).summary.action,
      "portal_password_verified"
    );
    assert.equal(
      credentialService.verifyPasswordCredential({
        accountId: "acct_reg_max",
        plainPassword: "a".repeat(160)
      }).summary.action,
      "portal_password_verified"
    );
  });
});

test("password spec: login verification has no length cap", () => {
  withStore((store) => {
    const service = createCredentialService(store);
    seedAccount(store, "acct_spec_long");
    const password = "L".repeat(200);
    issuePassword(store, service, "acct_spec_long", password);
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_long",
        plainPassword: password
      }).summary.action,
      "portal_password_verified"
    );
  });
});

test("password spec: over-72-byte passwords verify locally but classify as targeted reset for Auth0 first login", () => {
  assert.equal(AUTH0_BCRYPT_MAX_PASSWORD_BYTES, 72);
  withStore((store) => {
    const service = createCredentialService(store);
    seedAccount(store, "acct_spec_72");
    const over = "a".repeat(100);
    issuePassword(store, service, "acct_spec_72", over);
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_72",
        plainPassword: over
      }).summary.action,
      "portal_password_verified"
    );

    // Same password, rehearsal classification: never truncate, no re-hash.
    assert.deepEqual(classifyAuth0FirstLoginPassword(over), {
      outcome: "targeted_reset_required",
      utf8Bytes: 100
    });
    assert.deepEqual(evaluateSyntheticAuth0FirstLoginPassword(over), {
      outcome: "reject",
      reason: "bcrypt_72_byte_limit",
      utf8Bytes: 100,
      overflowPolicy: "show_error",
      nextAction: "targeted_reset_required",
      rehashAllowed: false
    });

    // Boundary: exactly 72 bytes is allowed for re-hash.
    const atLimit = "a".repeat(72);
    assert.deepEqual(classifyAuth0FirstLoginPassword(atLimit), {
      outcome: "allow",
      utf8Bytes: 72
    });
    assert.equal(
      evaluateSyntheticAuth0FirstLoginPassword(atLimit).rehashAllowed,
      true
    );
  });
});

test("password spec: mustRotate carries no login semantics", () => {
  withStore((store) => {
    const service = createCredentialService(store);
    seedAccount(store, "acct_spec_rotate_default");
    seedAccount(store, "acct_spec_rotate_false");

    // Default: mustRotate is true when omitted.
    const issuedDefault = issuePassword(
      store, service, "acct_spec_rotate_default", "Rotate-Default-2026!"
    );
    assert.equal(issuedDefault.summary.mustRotate, true);
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_rotate_default",
        plainPassword: "Rotate-Default-2026!"
      }).summary.action,
      "portal_password_verified"
    );

    // Direct-issuance simulation of the registration value (mustRotate
    // false): this does NOT walk the registration path. The real
    // registration/issuance paths are asserted in the dedicated test below.
    const issuedFalse = issuePassword(
      store, service, "acct_spec_rotate_false", "Rotate-False-2026!",
      { mustRotate: false }
    );
    assert.equal(issuedFalse.summary.mustRotate, false);
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_rotate_false",
        plainPassword: "Rotate-False-2026!"
      }).summary.action,
      "portal_password_verified"
    );
  });
});

test("password spec: production lockout defaults are five failures and 900 seconds", () => {
  withStore((store) => {
    seedAccount(store, "acct_spec_lockout");
    // No maxFailures/lockSeconds overrides: production defaults apply.
    const service = createCredentialService(store);
    const password = "Lockout-Check-2026!";
    issuePassword(store, service, "acct_spec_lockout", password);
    const credentialId = store.getActivePortalPasswordCredential("acct_spec_lockout").id;

    for (let attempt = 1; attempt <= 4; attempt++) {
      assert.throws(
        () => service.verifyPasswordCredential({
          accountId: "acct_spec_lockout",
          plainPassword: "Wrong-Password-2026!"
        }),
        (error) => error.code === "invalid_login"
      );
      const row = store.getActivePortalPasswordCredential("acct_spec_lockout");
      assert.equal(row.failureCount, attempt);
      assert.equal(row.status, "active");
    }

    assert.throws(
      () => service.verifyPasswordCredential({
        accountId: "acct_spec_lockout",
        plainPassword: "Wrong-Password-2026!"
      }),
      (error) => error.code === "invalid_login"
    );
    const locked = store.getPortalPasswordCredential(credentialId);
    assert.equal(locked.status, "locked");
    assert.equal(locked.failureCount, 5);
    assert.equal(locked.lockedUntil, "2026-06-03T00:15:00.000Z");

    // The correct password still fails while locked.
    assert.throws(
      () => service.verifyPasswordCredential({
        accountId: "acct_spec_lockout",
        plainPassword: password
      }),
      (error) => error.code === "invalid_login"
    );
  });
});

test("password spec: credential summaries never return the hash or the plain password", () => {
  withStore((store) => {
    const service = createCredentialService(store);
    seedAccount(store, "acct_spec_summary");
    const password = "Summary-Check-2026!";
    const issued = issuePassword(store, service, "acct_spec_summary", password);
    assert.equal(issued.summary.action, "portal_password_issued");
    assert.equal(issued.summary.hashReturned, false);
    assert.equal(issued.summary.rawPasswordReturned, false);
    assert.equal(issued.summary.safety.hashReturned, false);
    assert.equal(issued.summary.safety.rawPasswordReturned, false);
    assert.ok(!("passwordHash" in issued.summary));
    assert.ok(!JSON.stringify(issued).includes(password));

    const storedHash = store.getActivePortalPasswordCredential("acct_spec_summary").passwordHash;
    const verified = service.verifyPasswordCredential({
      accountId: "acct_spec_summary",
      plainPassword: password
    });
    assert.equal(verified.summary.action, "portal_password_verified");
    assert.equal(verified.summary.hashReturned, false);
    assert.equal(verified.summary.rawPasswordReturned, false);
    assert.ok(!JSON.stringify(verified).includes(password));
    assert.ok(!JSON.stringify(verified).includes(storedHash));
  });
});

test("password spec: salts shorter than 16 bytes are rejected at issuance", () => {
  withStore((store) => {
    const service = createCredentialService(store, {
      saltFactory: () => Buffer.from("short", "utf8")
    });
    seedAccount(store, "acct_spec_salt_floor");
    assert.throws(
      () => issuePassword(store, service, "acct_spec_salt_floor", "Salt-Floor-2026!"),
      (error) => error.code === "validation_error"
    );
  });
});

function createIssuanceService(store, accountId, initialPassword, credentialRef) {
  return createPortalInitialAccountIssuanceService({
    controlStore: store,
    passwordCredentialService: createPortalPasswordCredentialService({
      controlStore: store,
      nowFn: () => NOW,
      saltFactory: () => FIXED_SALT,
      credentialRefFactory: () => credentialRef
    }),
    nowFn: () => NOW,
    accountIdFactory: () => accountId,
    passwordFactory: () => initialPassword
  });
}

test("password spec: a lock expires after 900 seconds and a correct password restores the credential to active", () => {
  withStore((store) => {
    seedAccount(store, "acct_spec_lock_expiry");
    let clock = NOW;
    const service = createCredentialService(store, {
      overrides: { nowFn: () => clock }
    });
    const password = ["Lock-", "Expiry-", "2026!"].join("");
    issuePassword(store, service, "acct_spec_lock_expiry", password);
    const credentialId = store.getActivePortalPasswordCredential("acct_spec_lock_expiry").id;

    for (let attempt = 1; attempt <= 5; attempt++) {
      assert.throws(
        () => service.verifyPasswordCredential({
          accountId: "acct_spec_lock_expiry",
          plainPassword: ["Wrong-", "Password-", "2026!"].join("")
        }),
        (error) => error.code === "invalid_login"
      );
    }
    const locked = store.getPortalPasswordCredential(credentialId);
    assert.equal(locked.status, "locked");
    assert.equal(locked.failureCount, 5);
    assert.equal(locked.lockedUntil, "2026-06-03T00:15:00.000Z");
    // The active-only lookup still hides the locked row.
    assert.equal(store.getActivePortalPasswordCredential("acct_spec_lock_expiry"), null);

    // One second before expiry the correct password still fails, and the
    // attempt does not extend the lock (no new failure is recorded).
    clock = "2026-06-03T00:14:59.000Z";
    assert.throws(
      () => service.verifyPasswordCredential({
        accountId: "acct_spec_lock_expiry",
        plainPassword: password
      }),
      (error) => error.code === "invalid_login"
    );
    assert.equal(store.getPortalPasswordCredential(credentialId).failureCount, 5);
    assert.equal(store.getPortalPasswordCredential(credentialId).lockedUntil, "2026-06-03T00:15:00.000Z");

    // Boundary: at lockedUntil itself the lock has expired (locked while
    // lockedUntil > now). A correct password succeeds and the row is
    // restored to active with the failure count cleared.
    clock = "2026-06-03T00:15:00.000Z";
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_lock_expiry",
        plainPassword: password
      }).summary.action,
      "portal_password_verified"
    );
    const restored = store.getPortalPasswordCredential(credentialId);
    assert.equal(restored.status, "active");
    assert.equal(restored.failureCount, 0);
    assert.equal(restored.lockedUntil, null);
    assert.equal(restored.lastVerifiedAt, "2026-06-03T00:15:00.000Z");

    // Lock again, then let it expire: a wrong password after expiry counts
    // as another consecutive failure and re-locks for a fresh 900 seconds.
    for (let attempt = 1; attempt <= 5; attempt++) {
      assert.throws(
        () => service.verifyPasswordCredential({
          accountId: "acct_spec_lock_expiry",
          plainPassword: ["Wrong-", "Password-", "2026!"].join("")
        }),
        (error) => error.code === "invalid_login"
      );
    }
    assert.equal(store.getPortalPasswordCredential(credentialId).lockedUntil, "2026-06-03T00:30:00.000Z");
    clock = "2026-06-03T00:30:01.000Z";
    assert.throws(
      () => service.verifyPasswordCredential({
        accountId: "acct_spec_lock_expiry",
        plainPassword: ["Wrong-", "Password-", "2026!"].join("")
      }),
      (error) => error.code === "invalid_login"
    );
    const relocked = store.getPortalPasswordCredential(credentialId);
    assert.equal(relocked.status, "locked");
    assert.equal(relocked.failureCount, 6);
    assert.equal(relocked.lockedUntil, "2026-06-03T00:45:01.000Z");

    // After the fresh window, the correct password works again.
    clock = "2026-06-03T00:45:02.000Z";
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_lock_expiry",
        plainPassword: password
      }).summary.action,
      "portal_password_verified"
    );
    assert.equal(store.getPortalPasswordCredential(credentialId).status, "active");
    assert.equal(store.getPortalPasswordCredential(credentialId).failureCount, 0);
  });
});

test("password spec: failures then a success clears the failure count", () => {
  withStore((store) => {
    seedAccount(store, "acct_spec_clear_count");
    const service = createCredentialService(store);
    const password = ["Clear-", "Count-", "2026!"].join("");
    issuePassword(store, service, "acct_spec_clear_count", password);
    for (let attempt = 1; attempt <= 3; attempt++) {
      assert.throws(
        () => service.verifyPasswordCredential({
          accountId: "acct_spec_clear_count",
          plainPassword: ["Wrong-", "Password-", "2026!"].join("")
        }),
        (error) => error.code === "invalid_login"
      );
    }
    assert.equal(store.getActivePortalPasswordCredential("acct_spec_clear_count").failureCount, 3);
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_clear_count",
        plainPassword: password
      }).summary.action,
      "portal_password_verified"
    );
    const row = store.getActivePortalPasswordCredential("acct_spec_clear_count");
    assert.equal(row.failureCount, 0);
    assert.equal(row.status, "active");
    assert.equal(row.lockedUntil, null);
    assert.equal(row.lastVerifiedAt, NOW);
  });
});

test("password spec: admin re-issuance after a lock restores login with the new password", () => {
  withStore((store) => {
    seedAccount(store, "acct_spec_reissue");
    const service = createCredentialService(store);
    const oldPassword = ["Old-", "Locked-", "2026!"].join("");
    issuePassword(store, service, "acct_spec_reissue", oldPassword);
    const oldCredentialId = store.getActivePortalPasswordCredential("acct_spec_reissue").id;
    for (let attempt = 1; attempt <= 5; attempt++) {
      assert.throws(
        () => service.verifyPasswordCredential({
          accountId: "acct_spec_reissue",
          plainPassword: ["Wrong-", "Password-", "2026!"].join("")
        }),
        (error) => error.code === "invalid_login"
      );
    }
    assert.equal(store.getPortalPasswordCredential(oldCredentialId).status, "locked");

    const issuance = createIssuanceService(
      store, "acct_spec_reissue", ["Reissued-", "Admin-", "2026!"].join(""), "pwd_reissue_1"
    );
    const result = issuance.issuePortalInitialAccount({
      accountId: "acct_spec_reissue",
      ownerRef: "owner_safe_ref",
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_safe_ref"
    });
    assert.equal(result.summary.accountCreated, false);
    assert.equal(result.summary.mustRotate, true);

    // The locked row is superseded, not left live: the table now marks it
    // revoked and only the new credential verifies.
    assert.equal(store.getPortalPasswordCredential(oldCredentialId).status, "revoked");
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_reissue",
        plainPassword: ["Reissued-", "Admin-", "2026!"].join("")
      }).summary.action,
      "portal_password_verified"
    );
    assert.throws(
      () => service.verifyPasswordCredential({
        accountId: "acct_spec_reissue",
        plainPassword: oldPassword
      }),
      (error) => error.code === "invalid_login"
    );
  });
});

test("password spec: registration stores mustRotate false and admin issuance stores mustRotate true", () => {
  withStore((store) => {
    // Registration path (user-chosen password): mustRotate is false.
    const registration = createRegistrationService(store);
    const registered = registration.submitRegistration(
      registrationInput("f2-reg@example.test", ["Reg-", "MustRotate-", "2026!"].join(""))
    );
    assert.equal(registered.registration.action, "portal_registration_created");
    const registeredRow = store.getActivePortalPasswordCredential("acct_reg_min");
    assert.equal(registeredRow.mustRotate, false);
    const credentialService = createCredentialService(store);
    assert.equal(
      credentialService.verifyPasswordCredential({
        accountId: "acct_reg_min",
        plainPassword: ["Reg-", "MustRotate-", "2026!"].join("")
      }).summary.action,
      "portal_password_verified"
    );

    // Admin initial-issuance path (generated temporary password handed to
    // the user): mustRotate is true, and the handoff says so explicitly.
    const issuance = createIssuanceService(
      store, "acct_f2_issued", ["Issued-", "Admin-", "2026!"].join(""), "pwd_f2_issued_1"
    );
    const issued = issuance.issuePortalInitialAccount({
      ownerRef: "owner_safe_ref",
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_safe_ref"
    });
    assert.equal(issued.summary.accountCreated, true);
    assert.equal(issued.summary.mustRotate, true);
    assert.equal(issued.handoffMaterial.mustRotate, true);
    assert.equal(issued.handoffMaterial.expiresOnFirstUse, true);
    assert.equal(
      store.getActivePortalPasswordCredential("acct_f2_issued").mustRotate,
      true
    );
  });
});

test("password spec: registration measures length after trim and registers over-72-byte passwords for local login", () => {
  withStore((store) => {
    const registration = createRegistrationService(store);

    // Trimmed length 6 is rejected; trimmed length 8 is accepted.
    assert.throws(
      () => registration.submitRegistration(
        registrationInput("trim-len-6@example.test", "  aaaaaa  ")
      ),
      (error) => error.code === "validation_error"
    );
    const accepted = registration.submitRegistration(
      registrationInput("trim-len-8@example.test", "  aaaaaaaa  ")
    );
    assert.equal(accepted.registration.action, "portal_registration_created");

    // 100 characters register fine locally but classify as targeted reset
    // for Auth0 first login (same对照 as the credential-layer test).
    const over = registration.submitRegistration(
      registrationInput("reg-72-over@example.test", "a".repeat(100))
    );
    assert.equal(over.registration.action, "portal_registration_created");
    assert.deepEqual(classifyAuth0FirstLoginPassword("a".repeat(100)), {
      outcome: "targeted_reset_required",
      utf8Bytes: 100
    });
  });
});

test("password spec: trim covers the remaining ECMAScript whitespace and keeps non-whitespace controls", () => {
  withStore((store) => {
    const service = createCredentialService(store);

    // Every remaining trimmable edge character (review §1): issue padded,
    // verify bare.
    const trimmable = ["\u000B", "\u000C", "\u2000", "\u2003", "\u200A", "\u202F", "\u205F", "\u2028"];
    trimmable.forEach((ch, index) => {
      const accountId = `acct_spec_trim_edge_${index}`;
      seedAccount(store, accountId);
      issuePassword(store, service, accountId, `${ch}${["Trim-", "Edge-", "2026!"].join("")}${ch}`);
      assert.equal(
        service.verifyPasswordCredential({
          accountId,
          plainPassword: ["Trim-", "Edge-", "2026!"].join("")
        }).summary.action,
        "portal_password_verified",
        `U+${ch.codePointAt(0).toString(16)} must be trimmed`
      );
    });

    // Not ECMAScript whitespace: kept as part of the password.
    const kept = ["\u0085", "\u180E", "\u200B"];
    kept.forEach((ch, index) => {
      const accountId = `acct_spec_trim_kept_${index}`;
      seedAccount(store, accountId);
      const password = `${ch}${["Secret-", "2026!"].join("")}${ch}`;
      issuePassword(store, service, accountId, password);
      assert.equal(
        service.verifyPasswordCredential({
          accountId,
          plainPassword: password
        }).summary.action,
        "portal_password_verified",
        `U+${ch.codePointAt(0).toString(16)} must not be trimmed`
      );
      assert.throws(
        () => service.verifyPasswordCredential({
          accountId,
          plainPassword: ["Secret-", "2026!"].join("")
        }),
        (error) => error.code === "invalid_login"
      );
    });

    // Reverse direction: issue bare, verify padded.
    seedAccount(store, "acct_spec_trim_reverse");
    issuePassword(store, service, "acct_spec_trim_reverse", ["Reverse-", "Trim-", "2026!"].join(""));
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_trim_reverse",
        plainPassword: "\u00A0 " + ["Reverse-", "Trim-", "2026!"].join("") + " \t"
      }).summary.action,
      "portal_password_verified"
    );
  });
});

test("password spec: parser fails closed for more malformed envelopes and tolerates padded base64url as documented", () => {
  withStore((store) => {
    const password = ["Spec-", "Check-", "2026!"].join("");
    const valid = buildScryptHash(password, FIXED_SALT);
    const parts = valid.split("$");
    const shortDerived = Buffer.alloc(32).toString("base64url");
    const variants = {
      altered_r: valid.replace("r=8", "r=9"),
      altered_p: valid.replace("p=1", "p=2"),
      eight_segments: `${valid}$e30`,
      empty_salt: [...parts.slice(0, 5), "", parts[6]].join("$"),
      empty_hash: [...parts.slice(0, 5), parts[5], ""].join("$"),
      short_derived_32_bytes: [...parts.slice(0, 5), parts[5], shortDerived].join("$"),
      illegal_salt_chars: [...parts.slice(0, 5), "!!!", parts[6]].join("$")
    };
    for (const [name, hash] of Object.entries(variants)) {
      const accountId = `acct_spec_parser_${name}`;
      seedAccount(store, accountId);
      store.createPortalPasswordCredential({
        id: `pwd_parser_${name}`,
        accountId,
        passwordHash: hash,
        status: "active",
        failureCount: 0,
        mustRotate: false,
        createdAt: NOW,
        updatedAt: NOW
      });
      const service = createCredentialService(store);
      assert.throws(
        () => service.verifyPasswordCredential({ accountId, plainPassword: password }),
        (error) => error.code === "invalid_login",
        `variant ${name} must fail with invalid_login`
      );
    }

    // Documented leniency (spec §7): production decoding accepts '='
    // padding, so a padded envelope still verifies here — while the strict
    // rehearsal parser rejects the same envelope at the import gate.
    for (const [name, hash] of Object.entries({
      padded_salt: [...parts.slice(0, 5), `${parts[5]}==`, parts[6]].join("$"),
      padded_hash: [...parts.slice(0, 5), parts[5], `${parts[6]}=`].join("$")
    })) {
      const accountId = `acct_spec_parser_${name}`;
      seedAccount(store, accountId);
      store.createPortalPasswordCredential({
        id: `pwd_parser_${name}`,
        accountId,
        passwordHash: hash,
        status: "active",
        failureCount: 0,
        mustRotate: false,
        createdAt: NOW,
        updatedAt: NOW
      });
      const service = createCredentialService(store);
      assert.equal(
        service.verifyPasswordCredential({ accountId, plainPassword: password }).summary.action,
        "portal_password_verified",
        `variant ${name} verifies under production leniency`
      );
      assert.throws(
        () => parsePortalScryptPasswordHash(hash),
        (error) => error.code === "legacy_scrypt_hash_invalid",
        `variant ${name} must be rejected by the rehearsal parser`
      );
    }
  });
});

test("password spec: empty password login is validation_error and numeric passwords coerce via String()", () => {
  withStore((store) => {
    seedAccount(store, "acct_spec_empty_login");
    const service = createCredentialService(store);
    // Missing input is validation_error, not invalid_login (spec R1-08):
    // the caller already knows it sent nothing, so nothing leaks.
    for (const bad of ["", "   "]) {
      assert.throws(
        () => service.verifyPasswordCredential({
          accountId: "acct_spec_empty_login",
          plainPassword: bad
        }),
        (error) => error.code === "validation_error"
      );
    }

    // Current behavior (shared requiredText contract): a non-string
    // password is coerced with String(), so 12345 and "12345" are the
    // same password on this path. Nailed here so any change is deliberate.
    seedAccount(store, "acct_spec_numeric");
    issuePassword(store, service, "acct_spec_numeric", 12345);
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_numeric",
        plainPassword: 12345
      }).summary.action,
      "portal_password_verified"
    );
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_numeric",
        plainPassword: "12345"
      }).summary.action,
      "portal_password_verified"
    );
  });
});

test("password spec: salts above 16 bytes verify locally but oversized salts are rejected at the rehearsal import gate", () => {
  withStore((store) => {
    for (const [name, size] of [["salt_17", 17], ["salt_32", 32], ["salt_65", 65]]) {
      const accountId = `acct_spec_${name}`;
      seedAccount(store, accountId);
      const service = createCredentialService(store, {
        prefix: `pwd_${name}`,
        saltFactory: () => Buffer.alloc(size, 7)
      });
      const password = ["Salt-", "Size-", "2026!"].join("");
      issuePassword(store, service, accountId, password);
      assert.equal(
        service.verifyPasswordCredential({ accountId, plainPassword: password }).summary.action,
        "portal_password_verified",
        `${size}-byte salt must verify locally`
      );
      const stored = store.getActivePortalPasswordCredential(accountId);
      assert.equal(Buffer.from(stored.passwordHash.split("$")[5], "base64url").length, size);
    }
    // 65-byte salt: local login works, but the rehearsal parser (16–64
    // bytes) refuses the envelope, so it could never be imported.
    const oversized = store.getActivePortalPasswordCredential("acct_spec_salt_65").passwordHash;
    assert.throws(
      () => parsePortalScryptPasswordHash(oversized),
      (error) => error.code === "legacy_scrypt_hash_invalid"
    );
    // 32-byte salt is inside the rehearsal window and parses fine.
    const withinWindow = store.getActivePortalPasswordCredential("acct_spec_salt_32").passwordHash;
    assert.equal(parsePortalScryptPasswordHash(withinWindow).salt.length, 32);
  });
});

test("password spec: re-issuance revokes the previous credential row", () => {
  withStore((store) => {
    seedAccount(store, "acct_spec_revoke_old");
    const service = createCredentialService(store);
    issuePassword(store, service, "acct_spec_revoke_old", ["First-", "Password-", "2026!"].join(""));
    const firstId = store.getActivePortalPasswordCredential("acct_spec_revoke_old").id;
    issuePassword(store, service, "acct_spec_revoke_old", ["Second-", "Password-", "2026!"].join(""));
    const secondId = store.getActivePortalPasswordCredential("acct_spec_revoke_old").id;
    assert.notEqual(firstId, secondId);

    const oldRow = store.getPortalPasswordCredential(firstId);
    assert.equal(oldRow.status, "revoked");
    assert.equal(oldRow.revokedAt, NOW);
    assert.equal(
      service.verifyPasswordCredential({
        accountId: "acct_spec_revoke_old",
        plainPassword: ["Second-", "Password-", "2026!"].join("")
      }).summary.action,
      "portal_password_verified"
    );
    assert.throws(
      () => service.verifyPasswordCredential({
        accountId: "acct_spec_revoke_old",
        plainPassword: ["First-", "Password-", "2026!"].join("")
      }),
      (error) => error.code === "invalid_login"
    );
  });
});
