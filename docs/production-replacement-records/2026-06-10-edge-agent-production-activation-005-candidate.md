# Edge Agent Production Activation 005 Candidate

Date: 2026-06-10, America/Los_Angeles.

## Status

- Type: repo-only production activation candidate record.
- Risk: A, approval preparation only.
- Production mutation: none.
- Service restart: none.
- Secrets included: no.
- Live order creation: none.

This record supersedes the `004` activation candidate for the next
Japan/SGP edge-agent pull / apply / receipt production gate. It does not
authorize deployment. It only records the reviewed local artifact and
validation evidence needed for a later exact approval.

## Why 005 Exists

The first production activation preflight for `004` stopped before production
mutation because the production runner's dry-run path returned
`adapter_invalid` for real host runtime adapters. The runner could validate
empty desired-state dry-runs and injected apply tests, but it could not prove
that a real Hysteria2/Xray/TUIC host adapter was wired well enough to accept a
node-scoped desired state before controlled apply.

`005` adds a non-mutating dry-run fallback for host runtime adapters that
expose `applyCredentialReconciliation`: dry-run now checks protected credential
material availability and adapter presence, posts a redacted `dry_run_checked`
receipt, and still avoids config writes, config-test commands, and service
restart. Real runtime config-test and restart remain apply-stage operations.

## Reviewed Candidate

- Release id: `edge-agent-production-activation-20260610-005-worktree`.
- Artifact:
  `D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-production-activation-20260610-005-worktree\proxy-gateway-edge-agent-production-activation-20260610-005-worktree.zip`.
- SHA-256:
  `BB17E8E218E63A403041F5B5059BCBDE1DCDF199C7B5B82329E1CB4908343D5E`.
- Zip size: `1939342` bytes.
- Manifest path count: `765`.
- Production boundary result:
  - blockers: `0`;
  - review-required: `0`.
- Required runner file present:
  `agent/production-edge-agent.mjs`.
- Protected token-file support present:
  `EDGE_DATA_PLANE_AGENT_TOKEN_FILE`.
- Host adapter dry-run support present:
  `dry_run_checked` receipt for real host runtime adapters.
- Protected runtime config excluded:
  `config/proxy-servers.json`.

## Validation

Commands run locally:

```powershell
node --test server\tests\production-edge-agent-runner.test.mjs
node --test server\tests\data-plane-agent-protocol.test.mjs server\tests\data-plane-agent-service.test.mjs server\tests\data-plane-agent-routes.test.mjs server\tests\edge-agent-dry-run.test.mjs server\tests\production-edge-agent-runner.test.mjs
```

Results:

- Production runner targeted tests: `7` passed, `0` failed.
- Edge-agent/data-plane targeted tests: `33` passed, `0` failed.
- Synthetic production-runner host-adapter dry-run returns:
  `ok=true`, `dryRun=true`, `failures=[]`.
- Artifact boundary check: `765` paths, `0` blockers, `0`
  review-required.

## Remaining Gate

The next production gate still needs exact operator approval before any
mutation. That gate must:

- back up Japan protected env / proxy config / control DB / subscription DB and
  SGP approved runtime configs / agent metadata;
- upload and verify the `005` artifact;
- switch Japan and SGP edge-agent runtime only to the reviewed release;
- configure private SGP-to-Japan agent transport;
- wire SGP protected token-file, material-file, channel refs, and explicit
  apply gate;
- run dry-run first;
- run controlled apply only after dry-run succeeds;
- config-test SGP Xray, Hysteria2, and TUIC before restart;
- restart only the approved Japan proxy and SGP edge-agent/data-plane services;
- record redacted dry-run and applied receipts;
- keep public `/api/internal/*` blocked.

Do not execute this gate with placeholder material, placeholder rollback
fields, raw token output, raw runtime config output, or live order creation.
