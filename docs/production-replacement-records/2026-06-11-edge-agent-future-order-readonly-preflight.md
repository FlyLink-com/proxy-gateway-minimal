# Edge-Agent Future-Order Read-Only Preflight

Date: 2026-06-11, Asia/Shanghai.

Risk tier: A production read-only preflight.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, runtime
credential material, or customer data.

## Approval

The operator approved the future-order desired-state read-only preflight after
the approval packet was prepared in:

`docs/production-replacement-records/2026-06-11-edge-agent-future-order-readonly-preflight-approval-packet.md`

The approved scope was read-only inventory only. The gate explicitly forbade
artifact upload, release switch, schema migration, protected environment write,
service restart, runtime config mutation, desired-state apply, live order
creation, and sensitive output.

## Local Source Candidate

- Branch: `codex/edge-agent-source-absorption`
- Candidate commit: `9ad0862`

The source candidate contains the repo-level future-order desired-state
notification/outbox code. It was not uploaded or deployed during this gate.

## Japan Control-Plane Inventory

Redacted read-only findings:

- current deployed release:
  `edge-agent-production-activation-20260610-005-worktree`;
- `proxy-gateway-candidate.service`: active;
- `tcp/3456`: loopback-only;
- local `/api/health`: HTTP 200;
- public portal root: HTTP 200;
- public subscription health: HTTP 200;
- public Admin route: HTTP 404;
- public internal data-plane agent route: HTTP 404;
- no-session portal order API: HTTP 401;
- unauthenticated internal data-plane agent route on loopback: HTTP 401;
- required protected environment key names for edge-agent, handoff, and channel
  refs are present by key presence check.

Control DB schema posture:

- `platform_edge_desired_state_notifications`: missing;
- `platform_edge_apply_receipts`: present;
- `platform_edge_agent_leases`: present;
- `platform_edge_desired_states`: present;
- `platform_portal_edge_credentials`: present.

Redacted aggregate receipt status counts were observed by status only. No
SQLite rows or credential values were printed.

## Singapore Data-Plane Inventory

Redacted read-only findings:

- Japan-to-SGP SSH: ok;
- `gccgw-edge-agent.service`: active/running;
- `xray-vless-reality.service`: active/running;
- `hysteria2.service`: active/running;
- `mihomo-tuic.service`: active/running;
- TCP 8443 listener: present;
- UDP 10443 listener: present;
- UDP 443 listener: present;
- traffic stats listener: loopback-only;
- public traffic stats exposure: not reachable;
- SGP local health: HTTP 200;
- SGP local traffic stats endpoint requires authentication.

An initial broad UDP listener check was inconclusive, so it was immediately
followed by a narrower port-count check. The narrower check confirmed the
expected SGP TCP/UDP listeners are present.

## Result

Read-only preflight passed for runtime boundary posture, but production is not
ready for a no-op future-order smoke yet.

The blocker is explicit and expected:

- the current Japan production release is still the `005` runtime;
- the new future-order notification table is not present in the production
  control DB;
- therefore the current production runtime has not yet received the source
  candidate that records pending desired-state notifications for future orders.

## Next Gate

The next gate must be a separate Risk A runtime upgrade and migration approval.
It must name:

- exact release and artifact SHA256 for the source candidate;
- current production release discovered by this preflight:
  `edge-agent-production-activation-20260610-005-worktree`;
- backup scope for Japan current symlink, protected environment, proxy config,
  control DB, and subscription DB;
- expected schema migration for
  `platform_edge_desired_state_notifications`;
- allowed service restart scope;
- no-live-order deployment validation;
- a separately approved live-order smoke only after deployment validation.

No production mutation was performed in this preflight.
