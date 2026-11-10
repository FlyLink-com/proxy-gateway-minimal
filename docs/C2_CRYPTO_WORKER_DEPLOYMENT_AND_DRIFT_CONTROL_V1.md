# C2 Crypto Worker — Deployment Principal & Configuration Drift Control v1

Last updated: 2026-11-10.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: c2_crypto_worker_deployment_and_drift_control
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```

Status: DESIGN (source layer only). Risk: B. Production impact: none.
This document creates no Cloudflare resource, issues no token and deploys
nothing. First Worker creation, token issuance and any deploy remain
separate gated steps (see §7).

Companion control: `tools/c2-worker-config-policy/` (allowlist policy +
checker + tests). ADR context: `docs/D1_T2_C2_KEY_CUSTODY_AND_ROTATION_ADR_V1.md` §21.

## 1. Why this exists

The Crypto Worker (`flylink-crypto-worker`) is the C2 cryptographic
boundary: it holds the three HMAC key families and the caller token as
runtime secret bindings and exposes exactly one internal path
(`/internal/v1/digests`) reachable only through a private Service Binding.

Cloudflare's per-Worker Editor permission can deploy code for that Worker
**and can change that Worker's resource bindings**. A scoped API token
therefore cannot, by itself, guarantee the deployed configuration stays
inside the approved surface. Isolation needs two independent legs:

1. **Least-privilege deployment principal** (§2–§4) — limits blast radius.
2. **Source configuration allowlist** (§5) — the deployable configuration
   is default-deny in source, so a binding change must pass code review
   as an explicit policy amendment, not slip in with a code change.
3. **Post-deploy readback** (§6) — detective control that compares the
   live Worker configuration against the approved manifest after every
   deploy.

## 2. Deployment principal model

- The Crypto Worker is deployed **only in the Primary Cloudflare account**
  (the account that also hosts the control-plane Worker). The Domain A
  custody account deploys no Worker and issues no tokens; its R2 bucket
  must never be bound by any Worker (enforced in source, §5).
- Deployment credential: an **account-owned API token scoped to the single
  Worker as Editor** ("Individual Worker Editor" for
  `flylink-crypto-worker` only).
  - No other Worker, no R2 / D1 / KV / Durable Objects / Secrets Store
    permissions, no account-settings permissions, no membership access.
  - **Never** Yi's global User token / OAuth login (broader than the task,
    and its use would be indistinguishable in audit logs).
  - The token is used from a named operator environment only; it is never
    committed, never placed in a repository secret shared with other
    workflows, and never reused as a runtime credential.
- The deploy token is **not** `CRYPTO_CONTROL_PLANE_CALLER_TOKEN`. The
  caller token authenticates the control-plane Worker to the Crypto
  Worker at runtime (Service Binding path); the deploy token acts at the
  Cloudflare control plane. Reuse in either direction is forbidden.

## 3. First creation sequence (separate human-admin step)

A per-Worker Editor token cannot be scoped to a Worker that does not yet
exist, and creating the first Worker requires product-level admin. The
bootstrap is therefore a distinct, owner-operated step:

1. Owner (human admin, Primary account) creates the **empty**
   `flylink-crypto-worker` (no bindings, no routes, workers.dev off).
2. Owner creates the per-Worker Editor API token scoped to it.
3. From then on, all deploys use the Editor token only; the admin
   principal is not used for routine deploys.
4. Read back and record: Worker exists in the Primary account only, no
   bindings, no routes, `workers_dev = false`. Any deviation stops the
   sequence.

The same pattern applies to `flylink-control-plane` if/when it is first
deployed (its own separate Editor token; tokens are per-Worker, never
shared between the two Workers).

## 4. Release flow for every deploy

1. Change lands on a protected branch as an exact-head reviewed PR.
   Any change to `tools/c2-worker-config-policy/policy.json` is itself a
   security-relevant diff and must be reviewed as such.
2. The drift checker (§5) passes in CI / local validation on the exact
   head being deployed.
3. A human approves the release of that exact head (merge approval is
   not deploy approval).
4. Deploy is executed with the per-Worker Editor token, from the named
   operator environment, deploying the reviewed head — never a working
   tree with unreviewed local modifications.
5. Post-deploy readback (§6) is performed and recorded before the deploy
   is called complete.

## 5. Source configuration allowlist (anti-drift)

Policy file: `tools/c2-worker-config-policy/policy.json`.
Checker: `tools/c2-worker-config-policy/check.mjs` (dependency-free Node;
exit 0 = conforming, exit 1 = findings listed).

Model: **default-deny**. For each in-scope JSONC Wrangler configuration,
only the listed top-level keys may appear and pinned values must match
exactly. Every binding entry must be an exact object match to one unused
allowlisted entry: additional keys are rejected, including D1 identifiers
such as `database_id` / `preview_database_id` and Service Binding fields
such as `entrypoint`. Duplicate entries cannot consume the same
allowance. Any new binding type, route, or surface fails closed until the
policy is amended by a reviewed change.

In scope today:

- `workers/crypto/wrangler.crypto.jsonc` — no bindings of any kind, no
  routes, `workers_dev: false`, `preview_urls: false`, no `account_id`.
- `workers/control-plane/wrangler.control-plane.jsonc` — exactly one D1
  binding (`CONTROL_DB` → `flylink-control-dev`) and, as a dormant
  permission for the future integration step, at most one Service Binding
  (`CRYPTO` → `flylink-crypto-worker`). Using that permission still
  requires the integration gate; the allowlist defines the maximum
  permissible surface, not an approval to use it.

Global guards (all Wrangler configs in the repository):

- The Domain A account id must never appear (no deploy target or binding
  may reference the custody account).
- The Domain A bucket name (`flylink-c2-custody-a`) must never appear (no
  Worker may bind it, from any config).
- If any `account_id` appears in a JSON/JSONC Wrangler config or as a
  top-level key in a TOML Wrangler config, it must be the Primary account
  id. TOML top-level account IDs are checked explicitly; keys nested under
  TOML tables (for example `[vars]`) are not deploy-target account IDs.

Known boundary: Wrangler configuration does not declare provisioned
Worker secrets. The four runtime secret binding **names** —
`IDEMPOTENCY_HMAC_KEYRING_JSON`, `PROVIDER_EVENT_HMAC_KEYRING_JSON`,
`PII_HMAC_KEYRING_JSON`, `CRYPTO_CONTROL_PLANE_CALLER_TOKEN` (plus
`CRYPTO_CONTROL_PLANE_CALLER_TOKEN_PREVIOUS` only during a rotation
overlap) — are governed by the post-deploy readback (§6), not by the
source checker.

## 6. Post-deploy readback (detective control)

After every deploy of either Worker, an operator (read-only credentials
are sufficient) records:

- Worker name, account id, deployed script etag/version id, timestamp,
  deploying principal.
- The full live binding list (type + name + target) and route /
  workers.dev state, diffed against the approved manifest:
  - Crypto Worker: bindings = the four secret names of §5 only; routes =
    none; workers.dev = off.
  - Control-plane Worker: bindings = `CONTROL_DB` (D1) and, once the
    integration gate passes, `CRYPTO` (Service Binding); nothing else.
- Cloudflare audit log entries for the deploy window, confirming the
  acting principal was the per-Worker Editor token.

Any extra binding, route, or unexpected principal is a stop condition:
the deploy is treated as failed, the Worker is rolled back or disabled,
and the event is recorded before any retry.

## 7. Rotation, revocation, residual risk

- Editor tokens: rotate on operator change, on suspicion of exposure,
  and at least at every custody-domain review. Revocation is immediate
  and account-side; deleting a local copy is not revocation.
- Residual risk, stated plainly: a per-Worker Editor **can** deploy
  arbitrary code for that Worker and **can** alter its bindings; a
  malicious or compromised deploy principal could therefore exfiltrate
  the Worker's own runtime secrets at deploy time. The token scope
  limits this to one Worker; it does not eliminate it. The compensating
  controls are procedural: protected branch + exact-head review, human
  release approval, single named operator environment, post-deploy
  readback, and audit-log review. No deploy automation with standing
  credentials is introduced by this design.

## 8. Gates still required (not granted by this document)

- First creation of the empty Workers (owner admin step, §3).
- Issuance of each per-Worker Editor token.
- The control-plane ↔ Crypto Worker Service Binding integration step.
- Any deploy, and any production use of either Worker.
- Any amendment that widens the allowlist (new binding type/target,
  routes, workers.dev) — reviewed as a security change in its own right.
