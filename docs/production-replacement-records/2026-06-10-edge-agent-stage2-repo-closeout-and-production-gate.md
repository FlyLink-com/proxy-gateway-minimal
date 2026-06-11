# Edge Agent Stage 2 Repo Closeout And Production Gate

Date: 2026-06-10, America/Los_Angeles.

## Status

- Type: repo-only closeout plus future production approval packet.
- Repo risk: B.
- Production activation risk: A.
- Production execution: not approved by this document.
- Secrets included: no.

## Completed Repo-Only Scope

The repository now contains a private pull / apply / receipt skeleton for
remote data-plane nodes:

- node-scoped desired-state protocol and redaction checks;
- private data-plane agent routes gated by `EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED`;
- data-plane agent service facade with bearer-token hash verification;
- DB-safe receipt status mapping for `unchanged`, `stale`, and `rejected`;
- node-side dry-run agent with injected runtime adapters;
- render proof behavior that keeps remote channels fail-closed without matching
  fresh applied receipts.

This stage did not deploy an agent, expose `/api/internal/*`, mutate Nginx,
DNS, provider firewall, systemd, Xray, Hysteria2, TUIC, Mihomo, runtime config,
accounts, orders, payments, subscription URLs, tokens, passwords, private keys,
raw logs, raw env, raw config, or SQLite rows.

## Repository Validation

Focused validation:

```powershell
node --test server\tests\data-plane-agent-protocol.test.mjs server\tests\data-plane-agent-service.test.mjs server\tests\data-plane-agent-routes.test.mjs
node --test server\tests\edge-agent-dry-run.test.mjs
node --test server\tests\channel-subscription-render-proof.test.mjs
```

Full closeout validation must be recorded before promotion:

```powershell
git diff --check
git diff --check origin/master...HEAD
npm test
npm run admin:test
npm run admin:build
npm run project-state:check
```

## Future Production Gate

Any production activation must be a separate exact-approved Risk A operation.

Required read-only inventory:

- Japan control-plane current release, service state, route boundary, protected
  env key presence, control DB backup readiness, and `/api/internal/*` public
  exposure check.
- Singapore data-plane SSH reachability from Japan, service state, protected
  runtime path ownership, Xray / Hysteria2 / TUIC listener state, and rollback
  backup readiness.
- Subscription render proof showing remote channels withheld until matching
  applied receipts exist.

Required deployment approval must name:

- exact release and artifact hash;
- target host and service list;
- agent install path;
- protected token material source by location only, not value;
- route exposure boundary;
- allowed service restarts;
- validation commands;
- rollback release and protected runtime backup path.

Forbidden without separate approval:

- DNS, Nginx, provider firewall, public Admin, payment, account/password
  generation, live order creation, subscription URL/token/password/private-key
  output, SQLite row dump, raw env/log/config output, and customer data export.

## Rollback Shape

Rollback must restore:

- previous control-plane release symlink;
- protected env backup;
- control/subscription DB backups if schema or state changed;
- previous data-plane runtime configs;
- previous agent service state;
- previous Nginx boundary if it was changed by the exact-approved gate.

Rollback validation:

- health 200;
- portal and subscription public endpoints intact;
- public Admin blocked;
- no-session portal APIs reject;
- `/api/internal/*` remains non-public;
- remote channels fail closed when receipt or lease state is absent.
