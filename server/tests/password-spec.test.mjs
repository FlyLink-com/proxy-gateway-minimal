import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AUTH0_BCRYPT_MAX_PASSWORD_BYTES,
  classifyAuth0FirstLoginPassword,
  evaluateSyntheticAuth0FirstLoginPassword
} from "../services/platform/portal-identity-import-rehearsal.mjs";
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

    // Registration path value: mustRotate false. Login ignores it either way.
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
