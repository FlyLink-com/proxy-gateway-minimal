# Wallet-First Setup Delivery Boundary

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: wallet_first_setup_delivery_boundary
  superseded_by: null
  last_verified_at: 2026-08-14
  production_authority: false
```

## Status and Scope

This is a Risk C, source-only boundary for the wallet-first setup-delivery
path. The PR may contain an endpoint, encrypted escrow component, and additive
schema/migration source, but none of those establish a deployed configuration,
an applied schema, or a production activation.

Wallet-first remains default-off. The presence of source, a build artifact, a
Portal page, or this document is not evidence of deployment or activation.

This document and its PR do not deploy, configure a production escrow key or
path, apply a schema, activate wallet-first, settle payment, or issue a
resource.

## Explicit Session POST Boundary

A setup-delivery request may begin only through an explicit, authenticated
Portal-session `POST`. The request is account-scoped and must not accept
protected material. Its successful, uncacheable response may contain the
delivery material together with the opaque handoff reference needed for the
immediately following explicit acknowledgement.

It must not be initiated implicitly by a `GET`, page render, registration side
effect, payment callback, background retry, or Admin UI navigation. A `GET`
must never return setup-delivery material. The `POST` must use a no-store
response. The Portal may retain returned material in short-lived component
memory, clearing it on acknowledgement, close, view change, or error; it must
not persist material in browser storage or copy it automatically. A user's
explicit copy action may place material in the operating-system clipboard. That
is a user operation, and the application cannot guarantee that the clipboard is
cleared. The `POST` does not itself activate wallet-first, settle payment, or
issue a resource.

The endpoint and UI contract must retain these session-only, no-cache, and
short-lived-memory boundaries.

## Material Custody Boundary

Protected setup material must never be written to the control DB, repository,
documentation, Portal/Admin persistent browser storage, logs, or a `GET`
response. The only delivery exception is the successful explicit authenticated
session `POST` response above, with no-store semantics and short-lived
component-memory handling. An explicit user copy may also place material in the
operating-system clipboard; it must not be automatic and cannot be guaranteed
cleared by the application. This includes raw configuration, credentials, keys,
provider material, subscription material, customer-private values, and
encrypted copies of those values in every prohibited location.

The control DB may hold only safe, opaque request or lifecycle state that cannot
reconstruct delivery material. Documentation must not carry material, dumps, or
encrypted payloads of protected material.

## Deferred Escrow and Schema Boundary

This PR may add encrypted escrow and handoff-schema source, but it does not
configure an operational escrow key or file path, or apply the schema. Any
operational escrow must keep protected material outside the control DB and
define independent custody, access, key lifecycle, backup, recovery, and
redacted validation controls.

Any production escrow key/path configuration, schema apply/migration, material
binding, runtime configuration delivery, or activation is future Risk A work.
It requires a fresh read-only inventory, exact approved scope, backup and
rollback plan, dry run or clean validation, explicit operator approval, and
redacted post-change readback. A source-only validation cannot substitute for
that gate.

## Activation Boundary

Before any future activation, the separate Risk A gate must also reconcile this
boundary with `docs/FUTURE_ACCOUNT_WALLET_FIRST_MODEL.md`, the current Portal
artifact/API identity, the Wallet and Commerce prerequisites, and the exact
schema gates. It must preserve the default-off state until the approved change
is ready to promote.

No production deployment or activation is authorized by this document.

## Non-goals

- deployment;
- operational escrow key or file-path configuration;
- applying the handoff schema or migration;
- activating wallet-first or related runtime flags; or
- payment settlement or resource issuance.
