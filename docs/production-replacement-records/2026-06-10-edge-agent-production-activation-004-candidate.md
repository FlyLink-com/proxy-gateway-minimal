# Edge Agent Production Activation 004 Candidate

Date: 2026-06-10, America/Los_Angeles.

## Status

- Type: repo-only production activation candidate record.
- Risk: A, approval preparation only.
- Production mutation: none.
- Service restart: none.
- Secrets included: no.
- Live order creation: none.

This record supersedes the `002` activation candidate for the next
Japan/SGP edge-agent pull / apply / receipt production gate. It does not
authorize deployment. It only records the reviewed local artifact and the
validation evidence needed for a later exact approval.

## Why 004 Exists

The activation readiness recheck found that SGP's Gate 0 runtime used the
`002` release, but the installed package does not contain
`agent/production-edge-agent.mjs`. That means `002` can remain historical Gate 0
bootstrap context, but it cannot be used to activate the production
pull/apply/receipt loop.

The production runner also needed a safer token input path. The runner now
supports `EDGE_DATA_PLANE_AGENT_TOKEN_FILE`, allowing the SGP service to read
the node bearer token from a protected file such as
`/etc/gccgw-edge-agent/token` without placing the raw value in environment or
operator output.

## Reviewed Candidate

- Release id: `edge-agent-production-activation-20260610-004-worktree`.
- Artifact:
  `D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-production-activation-20260610-004-worktree\proxy-gateway-edge-agent-production-activation-20260610-004-worktree.zip`.
- SHA-256:
  `3EE6EBE1D3D3F76BFB7016B916DBCD1F6A8E3D9381828589E9939A0BCED7011B`.
- Zip size: `1938466` bytes.
- Manifest path count: `765`.
- Production boundary result:
  - blockers: `0`;
  - review-required: `0`.
- Required runner file present:
  `agent/production-edge-agent.mjs`.
- Protected token-file support present:
  `EDGE_DATA_PLANE_AGENT_TOKEN_FILE`.
- Protected runtime config excluded:
  `config/proxy-servers.json`.
- Self-referential approval records excluded from the deployment zip:
  this candidate record and
  `2026-06-10-edge-agent-production-activation-approval-packet.md`.

## Validation

Commands run locally:

```powershell
node --test server\tests\production-edge-agent-runner.test.mjs server\tests\edge-agent-dry-run.test.mjs server\tests\data-plane-agent-routes.test.mjs
npm test
```

Results:

- Edge-agent targeted tests: `18` passed, `0` failed.
- Full server test suite: `754` passed, `0` failed.

## Remaining Gate

The next production gate still needs exact operator approval before any
mutation. That gate must:

- back up Japan protected env / proxy config / control DB / subscription DB and
  SGP approved runtime configs / agent metadata;
- upload and verify the `004` artifact;
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
