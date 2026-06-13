# Edge-Agent SGP Template Key Alignment

Date: 2026-06-11

Risk: B repo-only fix following an A-tier production diagnostic

Scope:

- Local repository templates and tests only.
- No production mutation, no service restart, no DNS/Nginx/firewall/systemd
  change, no live order creation.
- No environment values, subscription URLs, tokens, private keys, credentials,
  raw logs, raw configs, or SQLite rows were output or recorded.

## Context

The previous redacted startup diagnostic found
`edge-agent-future-order-runtime-20260611-001` failed before startup because its
Singapore channel placeholders did not resolve in the active Japan protected
service environment.

A follow-up read-only check confirmed the active Japan service already has SGP
protected material, but under the approved existing names used by the deployed
`edge-agent-production-activation-20260610-005-worktree` release:

- `SGP_VLESS_STATIC_UUID`;
- `SGP_XRAY_VLESS_REALITY_PUBLIC_KEY`;
- `SGP_XRAY_VLESS_REALITY_SHORT_ID`;
- `SGP_HY2_STATIC_PASSWORD`;
- `SGP_TUIC_STATIC_UUID`;
- `SGP_TUIC_STATIC_PASSWORD`.

It also confirmed the current deployed proxy config uses literal public
host/SNI values for the SGP channels and those existing protected key names.

## Change

The repository default and Vultr multichannel proxy templates now align with
the current approved protected key names instead of requiring a second,
incompatible SGP material namespace:

- `config/proxy-servers.json`;
- `config/proxy-servers.vultr-multichannel.template.json`.

The related test fixtures were changed to load the templates using only the
existing SGP protected key names, so future candidate packages fail locally if
they drift back to the incompatible placeholder names.

## Validation

Completed validation:

```text
node --test server\tests\config.test.mjs server\tests\vultr-tuic-template.test.mjs
node --test server\tests\config.test.mjs server\tests\vultr-tuic-template.test.mjs server\tests\platform-issue-subscription-cli.test.mjs server\tests\user-portal-routes.test.mjs server\tests\state.test.mjs
npm test
npm run project-state:check
git diff --check
```

All validation commands passed. `git diff --check` only reported the existing
Windows LF-to-CRLF working-copy notices.

Candidate package prepared from this repo state:

```text
release=edge-agent-future-order-runtime-20260611-002-worktree
artifact=D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-future-order-runtime-20260611-002-worktree\proxy-gateway-edge-agent-future-order-runtime-20260611-002-worktree.zip
archive_sha256=08E4EF8438CABF641E29CEE1B1121A890B04C8514E263F5D58784AF203A32920
```

Local package boundary checks found no packaged `.env`, database, log,
worktree, dependency, local runtime, or handoff residue. The production artifact
boundary checker returned no blockers and only the expected review requirement
for `config/proxy-servers.json`.

## Production Status

Production is not changed by this record.

Japan remains on `edge-agent-production-activation-20260610-005-worktree` until
a separately approved Risk A production upgrade gate promotes a newly packaged
candidate.

The real production control DB is still not migrated for
`platform_edge_desired_state_notifications`.

## Next Gate

Before another production symlink switch, use the `002` candidate package above
and validate that:

- candidate placeholder missing count is zero against the existing Japan
  protected environment;
- candidate temp-start succeeds with temporary DB paths and an alternate
  loopback port;
- public Admin and public internal agent routes remain blocked;
- no live order creation occurs;
- no raw env/log/config/SQLite/credential output is produced.
