# Account Resource Delivery Lifecycle

Last updated: 2026-07-09.

> Status:
> - Type: Active architecture boundary
> - Risk: C for this document, B for repository code changes, A for production
>   runtime activation or legacy-token retirement
> - Execution authority: Does not authorize production deployment, runtime
>   mutation, DNS, Nginx, firewall, schema migration, credential rotation, token
>   retirement, subscription URL output, or customer-data access
> - Production impact: None by itself

## Purpose

The user-facing subscription product is an account resource, not a raw rendered
YAML file and not a query-token URL. Rendered subscription output is only the
current delivery result for an already-issued account resource.

This document defines the current model for replacing the old link-centric
model with an account resource delivery lifecycle.

## Model

The control plane owns this chain:

```text
Account
  -> Entitlement
  -> Access Request / Order
  -> Delivery Generation
  -> Rendered Subscription
```

The account, entitlement, and order are the commercial and lifecycle authority.
The delivery generation is the current technical handoff for that order. The
rendered subscription is derived output that can change whenever the current
delivery generation changes.

## Reissue Semantics

Customer portal "refresh" means reissue the current delivery generation.

It must not mean "make the customer import a different subscription URL for
normal account refresh." A reissue keeps the account/order/entitlement and the
active opaque artifact URL stable while replacing the delivery material:

- keep the already-imported opaque artifact URL refreshable;
- render the same artifact URL against the current delivery generation;
- rotate protected runtime material for the same order-owned
  `edgeCredentialRef`;
- keep usage accounting anchored to the same account/order/resource;
- notify edge lifecycle / desired-state paths so runtime apply receipts can
  prove the new generation is active;
- expose only safe lifecycle metadata to Portal/Admin readers.

Artifact rotation remains available for leakage, abuse, device rebind, or
operator-controlled revocation. It is no longer the default customer portal
refresh behavior.

The current safe read model exposes this as:

```text
delivery.model = account_resource_delivery_generation
delivery.state = current | pending_delivery | disabled | expired | not_issued
delivery.artifactPresent = true | false
delivery.runtimeMaterialPresent = true | false
delivery.lastEventType = safe event type
delivery.lastReissuedAt = ISO timestamp when applicable
```

It must never expose artifact secrets, subscription URLs, rendered YAML,
runtime credential material, raw configs, raw logs, SQLite rows, customer
private data, or provider credentials.

## Deprecated Legacy Model

The old model treated these as interchangeable:

- tenant primary query token;
- `/sub/clash.yaml?token=...`;
- opaque artifact URL;
- rendered YAML;
- runtime credential material.

That model is deprecated for new user-facing delivery. It causes ambiguous
states such as "new link issued but old imported profile still connects".

Legacy query-token access remains a compatibility path only. Any production
change to reject, drain, rotate, or remove `/sub/clash.yaml?token=...` remains
Risk A and must follow `docs/LEGACY_QUERY_TOKEN_RETIREMENT_GATE.md`.

## Boundary

This lifecycle does not change the traffic accounting model. Usage remains
account/order/resource-owned and is collected by `edgeCredentialRef`. Reissuing
delivery material must not reset usage, extend package duration, create a new
order, disable the account, or delete history.

Stopping traffic supply because of quota exhaustion is a separate lifecycle
decision on the resource supply, not an account disable action.

## Validation

Repository validation for this model should include:

```powershell
node --test server/tests/platform-portal-access-requests.test.mjs server/tests/edge-order-credential-issuer.test.mjs server/tests/admin-subscriptions.test.mjs --test-name-pattern "delivery|refresh|stable subscription URL|force-rotate"
npm test
git diff --check
```
