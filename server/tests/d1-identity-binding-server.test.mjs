// B2-2 (scope S): server-side identity-binding store + resolver.
// Proves the D1-side acceptance criteria on the server: the binding store
// holds no email or digest; resolution is an exact (issuer, subject)
// lookup; unbound / ambiguous / mismatched / inactive all fail closed;
// binding creation is idempotent; the resolver never scans email and never
// falls back to the legacy login resolver. The legacy registration and
// password-login paths are untouched by this batch.
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import { IdentityBindingRepository } from "../services/platform/d1-identity-binding-repository.mjs";
import { resolveAccountByVerifiedActorContext } from "../services/platform/d1-identity-binding-resolver.mjs";

const NOW = 1794000000000;
const NOW_ISO = new Date(NOW).toISOString();

function withStore(fn) {
  const database = new Database(":memory:");
  let store;
  try {
    store = createSqliteSubscriptionControlStore({ database });
    return fn({ database, store });
  } finally {
    store?.close?.();
    database.close();
  }
}

function makeAccount(store, id, status = "active") {
  // Deliberately no metadata at all: no loginRef, no email anywhere. The
  // resolver must find this account purely through its binding.
  return store.createAccount({
    id, ownerRef: id, status, createdAt: NOW_ISO, updatedAt: NOW_ISO
  });
}

function record({ accountRef = "acct-b2-2-1", issuerRef = "portal", subjectRef = "auth0|portal-synth-1", now = NOW } = {}) {
  return {
    accountRef,
    issuerRef,
    subjectRef,
    status: "active",
    createdAtMs: now - 1000,
    updatedAtMs: now - 1000,
    revokedAtMs: null
  };
}

function actor({ issuerRef = "portal", subjectRef = "auth0|portal-synth-1", accountRef = "acct-b2-2-1", factors = ["password"] } = {}) {
  return {
    accountRef,
    audience: "flylink-control-plane",
    authTimeMs: NOW - 1000,
    expiresAtMs: NOW + 60000,
    factors,
    issuedAtMs: NOW - 1000,
    issuerRef,
    sessionRef: "sess-b2-2-0001",
    subjectRef
  };
}

function resolveVia({ store, repository, context, allowedIssuers = ["portal"] }) {
  return resolveAccountByVerifiedActorContext({
    controlStore: store,
    bindingRepository: repository,
    actorContext: context,
    allowedIssuers,
    nowMs: NOW
  });
}

test("binding table stores only opaque references: exact columns, no email/digest, unique indexes present", () => {
  withStore(({ database, store }) => {
    const columns = database.prepare("pragma table_info(platform_identity_bindings)").all()
      .map((column) => column.name).sort();
    assert.deepEqual(columns, [
      "account_id", "created_at_ms", "id", "issuer_ref",
      "revoked_at_ms", "status", "subject_ref", "updated_at_ms"
    ]);
    const indexes = database.prepare(
      "select name from sqlite_master where type = 'index' and tbl_name = 'platform_identity_bindings'"
    ).all().map((row) => row.name).sort();
    assert.deepEqual(indexes, [
      "platform_identity_bindings_active_account_idx",
      "platform_identity_bindings_active_subject_idx",
      "platform_identity_bindings_subject_idx",
      // SQLite autoindex for the text primary key.
      "sqlite_autoindex_platform_identity_bindings_1"
    ]);

    makeAccount(store, "acct-b2-2-1");
    const repository = store.identityBindingRepository();
    assert.ok(repository instanceof IdentityBindingRepository);
    const created = repository.createActive(record());
    assert.equal(created.outcome, "created");
    assert.match(created.id, /^idb_[A-Za-z0-9_-]{32}$/);
    const row = database.prepare("SELECT * FROM platform_identity_bindings").get();
    assert.deepEqual(Object.keys(row).sort(), columns);
    assert.equal(JSON.stringify(row).includes("@"), false);
    assert.equal(JSON.stringify(row).includes("email"), false);
  });
});

test("binding creation is idempotent and collisions fail closed; revocation permits a later controlled rebind", () => {
  withStore(({ store }) => {
    makeAccount(store, "acct-b2-2-1");
    makeAccount(store, "acct-b2-2-2");
    const repository = store.identityBindingRepository();
    const first = repository.createActive(record());
    assert.equal(first.outcome, "created");

    assert.deepEqual(repository.createActive(record()), {
      outcome: "already_bound",
      accountRef: "acct-b2-2-1"
    });
    assert.deepEqual(repository.createActive(record({ accountRef: "acct-b2-2-2" })), {
      outcome: "subject_bound_to_other_account"
    });
    assert.deepEqual(repository.createActive(record({ subjectRef: "auth0|portal-synth-2" })), {
      outcome: "account_already_bound"
    });

    assert.equal(repository.revoke({ id: first.id, revokedAtMs: NOW }), true);
    assert.deepEqual(repository.resolve({ issuerRef: "portal", subjectRef: "auth0|portal-synth-1" }), {
      outcome: "not_found"
    });
    const rebound = repository.createActive(record());
    assert.equal(rebound.outcome, "created");
    assert.notEqual(rebound.id, first.id);
  });
});

test("resolve is an exact (issuer, subject) lookup; unknown and mismatched bindings fail closed", () => {
  withStore(({ store }) => {
    makeAccount(store, "acct-b2-2-1");
    const repository = store.identityBindingRepository();
    const created = repository.createActive(record());
    assert.deepEqual(repository.resolve({ issuerRef: "portal", subjectRef: "auth0|portal-synth-1" }), {
      outcome: "resolved",
      accountRef: "acct-b2-2-1",
      bindingId: created.id
    });
    assert.deepEqual(repository.resolve({ issuerRef: "portal", subjectRef: "auth0|unknown-subject" }), {
      outcome: "not_found"
    });
    assert.deepEqual(repository.resolve({ issuerRef: "admin", subjectRef: "auth0|portal-synth-1" }), {
      outcome: "not_found"
    });
    assert.deepEqual(repository.resolve({
      issuerRef: "portal",
      subjectRef: "auth0|portal-synth-1",
      expectedAccountRef: "acct-b2-2-1"
    }), {
      outcome: "resolved",
      accountRef: "acct-b2-2-1",
      bindingId: created.id
    });
    assert.deepEqual(repository.resolve({
      issuerRef: "portal",
      subjectRef: "auth0|portal-synth-1",
      expectedAccountRef: "acct-b2-2-2"
    }), {
      outcome: "account_mismatch"
    });
    assert.throws(() => repository.resolve({ issuerRef: "unknown", subjectRef: "auth0|portal-synth-1" }),
      /identity_binding_issuer_invalid/);
  });
});

test("the partial unique indexes are the final race guard: raw duplicate inserts fail on the constraint", () => {
  withStore(({ database, store }) => {
    makeAccount(store, "acct-b2-2-1");
    makeAccount(store, "acct-b2-2-2");
    const repository = store.identityBindingRepository();
    repository.createActive(record());
    assert.throws(() => database.prepare(
      `INSERT INTO platform_identity_bindings
         (id, account_id, issuer_ref, subject_ref, status, created_at_ms, updated_at_ms, revoked_at_ms)
       VALUES ('idb_duplicate_subject', 'acct-b2-2-2', 'portal', 'auth0|portal-synth-1',
               'active', ?, ?, NULL)`
    ).run(NOW - 1000, NOW - 1000), (error) => error.code === "SQLITE_CONSTRAINT_UNIQUE");
    assert.throws(() => database.prepare(
      `INSERT INTO platform_identity_bindings
         (id, account_id, issuer_ref, subject_ref, status, created_at_ms, updated_at_ms, revoked_at_ms)
       VALUES ('idb_duplicate_account', 'acct-b2-2-1', 'portal', 'auth0|portal-synth-2',
               'active', ?, ?, NULL)`
    ).run(NOW - 1000, NOW - 1000), (error) => error.code === "SQLITE_CONSTRAINT_UNIQUE");
  });
});

test("creating a binding for a missing account fails closed without a raw SQLite error", () => {
  withStore(({ store }) => {
    const repository = store.identityBindingRepository();
    assert.throws(() => repository.createActive(record({ accountRef: "acct-missing" })),
      /identity_binding_write_failed/);
  });
});

test("revoke validation: bad id, missing row, and a revoked-at before creation all fail closed", () => {
  withStore(({ store }) => {
    makeAccount(store, "acct-b2-2-1");
    const repository = store.identityBindingRepository();
    const created = repository.createActive(record());
    assert.throws(() => repository.revoke({ id: "bad", revokedAtMs: NOW }),
      /identity_binding_revoke_invalid/);
    assert.equal(repository.revoke({ id: "idb_does_not_exist_000000000000", revokedAtMs: NOW }), false);
    assert.throws(() => repository.revoke({ id: created.id, revokedAtMs: NOW - 2000 }),
      /identity_binding_timestamp_invalid/);
    assert.equal(repository.revoke({ id: created.id, revokedAtMs: NOW }), true);
    assert.equal(repository.revoke({ id: created.id, revokedAtMs: NOW }), false);
  });
});

test("resolver returns the account for a verified context with no email anywhere in the account", () => {
  withStore(({ store }) => {
    const account = makeAccount(store, "acct-b2-2-1");
    const repository = store.identityBindingRepository();
    const created = repository.createActive(record());
    const resolved = resolveVia({ store, repository, context: actor() });
    assert.equal(resolved.account.id, account.id);
    assert.equal(resolved.bindingId, created.id);
  });
});

test("resolver fails closed on an unbound subject and on an inactive account", () => {
  withStore(({ store }) => {
    makeAccount(store, "acct-b2-2-1");
    const repository = store.identityBindingRepository();
    assert.throws(() => resolveVia({ store, repository, context: actor() }),
      /identity_binding_not_found/);

    repository.createActive(record());
    makeAccount(store, "acct-b2-2-2", "suspended");
    repository.createActive(record({ accountRef: "acct-b2-2-2", subjectRef: "auth0|portal-synth-2" }));
    assert.throws(() => resolveVia({
      store,
      repository,
      context: actor({ subjectRef: "auth0|portal-synth-2", accountRef: "acct-b2-2-2" })
    }), /identity_binding_account_unavailable/);
  });
});

test("resolver maps ambiguous and mismatched binding outcomes to fail-closed errors", () => {
  withStore(({ store }) => {
    const ambiguousRepo = { resolve: () => ({ outcome: "ambiguous" }) };
    assert.throws(() => resolveAccountByVerifiedActorContext({
      controlStore: store,
      bindingRepository: ambiguousRepo,
      actorContext: actor(),
      allowedIssuers: ["portal"],
      nowMs: NOW
    }), /identity_binding_ambiguous/);
    const mismatchRepo = { resolve: () => ({ outcome: "account_mismatch" }) };
    assert.throws(() => resolveAccountByVerifiedActorContext({
      controlStore: store,
      bindingRepository: mismatchRepo,
      actorContext: actor(),
      allowedIssuers: ["portal"],
      nowMs: NOW
    }), /identity_binding_account_mismatch/);
  });
});

test("resolver rejects unverified contexts: wrong audience, expired context, unlisted issuer", () => {
  withStore(({ store }) => {
    makeAccount(store, "acct-b2-2-1");
    const repository = store.identityBindingRepository();
    repository.createActive(record());
    assert.throws(() => resolveVia({
      store, repository, context: { ...actor(), audience: "someone-else" }
    }), /identity_actor_audience_invalid/);
    assert.throws(() => resolveVia({
      store, repository, context: { ...actor(), expiresAtMs: NOW - 1000 }
    }), /identity_actor_context_time_invalid/);
    assert.throws(() => resolveVia({
      store, repository, context: actor(), allowedIssuers: ["admin"]
    }), /identity_issuer_not_allowed/);
    assert.throws(() => resolveAccountByVerifiedActorContext({
      controlStore: store,
      bindingRepository: repository,
      actorContext: actor(),
      allowedIssuers: [],
      nowMs: NOW
    }), /identity_issuer_allowlist_invalid/);
  });
});

test("resolver never calls the legacy email login resolver", () => {
  withStore(({ database, store }) => {
    makeAccount(store, "acct-b2-2-1");
    const repository = store.identityBindingRepository();
    const created = repository.createActive(record());
    // A store double with getAccount only: no resolvePortalLoginAccount
    // exists to call. If the resolver ever reached for it, this throws.
    const minimalStore = {
      getAccount: (id) => store.getAccount(id)
    };
    assert.equal(typeof minimalStore.resolvePortalLoginAccount, "undefined");
    assert.equal(database.prepare(
      "select count(*) as n from platform_accounts where id = 'acct-b2-2-1'"
    ).get().n, 1);
    const resolved = resolveAccountByVerifiedActorContext({
      controlStore: minimalStore,
      bindingRepository: repository,
      actorContext: actor(),
      allowedIssuers: ["portal"],
      nowMs: NOW
    });
    assert.equal(resolved.account.id, "acct-b2-2-1");
    assert.equal(resolved.bindingId, created.id);
  });
});

test("resolver input validation fails closed without a store or repository", () => {
  withStore(({ store }) => {
    const repository = store.identityBindingRepository();
    assert.throws(() => resolveAccountByVerifiedActorContext({
      controlStore: null,
      bindingRepository: repository,
      actorContext: actor(),
      allowedIssuers: ["portal"],
      nowMs: NOW
    }), /identity_binding_resolver_store_invalid/);
    assert.throws(() => resolveAccountByVerifiedActorContext({
      controlStore: store,
      bindingRepository: null,
      actorContext: actor(),
      allowedIssuers: ["portal"],
      nowMs: NOW
    }), /identity_binding_resolver_repository_invalid/);
  });
});
