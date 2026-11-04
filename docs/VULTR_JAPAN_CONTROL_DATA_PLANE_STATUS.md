# Vultr Japan Control / Data-Plane Status

Last updated: 2026-11-01, UTC.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: vultr_japan_control_data_plane_status
  superseded_by: null
  last_verified_at: 2026-11-01
  production_authority: false
```


> Status:
> - Type: Active docs/status baseline
> - Risk: C for this document; A for any Vultr, DNS, Nginx, systemd, firewall,
>   SQLite, secret, tenant, artifact, node-output, traffic, cutover, or rollback
>   mutation
> - Execution authority: Does not authorize provisioning, deployment, DNS change,
>   Nginx reload, systemd restart, firewall mutation, secret movement, SQLite
>   migration, subscription issuance, traffic activation, or production cutover
> - Production impact: None

## Approved Target Direction (2026-11-01)

The project owner has fixed the target architecture: **BWH is the single
subscription/control plane; the new Vultr Japan child node and Vultr Singapore
are data-plane capacity.** This supersedes the earlier July 24 direction below
as the target architecture. Do not reopen this topology choice as a question.

BWH owns account/order state, subscription artifacts and rendering, credential
lifecycle, desired-state, protected material references, applied receipts, and
the usage ledger. JP and SGP nodes own protocol runtime capacity and node-local
runtime/usage evidence only; neither owns customer truth or public Admin.

This is an architecture and documentation update, not a fresh live host,
release, health, identity, or metering verification. The live BWH release
identity is bound by the as-run manifest (SHA-256) under the 2026-11-01 ruling,
with source-commit identity not claimed; the remaining operational
preconditions remain separate M0 evidence items.

## Historical Direction Snapshot (2026-07-24)

At the 2026-07-24 evidence cutoff, the then-documented control/data-plane
direction was:

```text
Vultr Japan:
  subscription control plane
  operator-controlled subscription authority
  private Admin / operator workflows

Vultr Japan + Vultr Singapore:
  documented data-plane capacity lane
  measured node registration and subscription-output channels
  no new traffic activation or runtime mutation without a separate A-tier gate
```

The historical client-facing domain records for that lane are under
`gccwebos.com`. For JP QUIC-based protocols, the rendered client host/SNI and
the runtime certificate SAN must stay aligned; a subscription render proof alone
is not enough if the runtime service still presents an older certificate.

Aliyun control-center, clean-start, promotion, Aegis, and gate records are
historical evidence only. Do not treat Aliyun as the current control center,
active default, compatibility route, or provider ownership model for new
planning.

The current protected Admin API no longer exposes Aliyun gate packet/evidence
routes or replacement provider-gate aliases for the retired Aliyun lane.

## 2026-07-24 Read-Only Traffic Accounting Readiness

This snapshot records a fresh, aggregate-only inventory. It does not change
runtime state or authorize an execution:

- `proxy-gateway-candidate.service`, `gccgw-traffic-usage-collect.timer`,
  `xray-vless-reality.service`, and `mihomo-tuic.service` were active and
  enabled.
- `gccgw-traffic-usage-collect.service` was a static, timer-triggered one-shot
  unit with its last recorded result `success`; its inactive waiting state is
  not evidence that collection is disabled.
- `master@cf33de7` contains the manual Japan additive-repair workflow and its
  merged-PR verifier. PR #533 itself had no formal GitHub Review, so it cannot
  be nominated as that verifier's `approval_pr`; a comment is not a substitute
  for final-head `APPROVED` evidence.

The next source gate is one purpose-bound PR merged at the exact workflow
commit after an independent final-head GitHub approval and a passed `Validate`
check. That PR is reusable source authorization only. It does not authorize a
workflow dispatch, protected-material access, map apply, quota change, or a
production-success claim. Those steps remain a separately reviewed Risk A
execution gate with fresh pre-apply snapshots, a backup, one bounded manual
run, and aggregate post-apply validation.

## Relationship To Execution Records

This file is an orientation and risk-boundary document. It does not replace:

- `docs/SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md` for the architecture.
- `docs/production-replacement-records/2026-06-09-vultr-sgp-multichannel-runtime-closeout.md`
  and later records for completed production gates.
- `docs/production-replacement-records/2026-07-06-jp-tuic-hy2-cert-domain-alignment.md`
  for the JP TUIC/Hysteria2 runtime certificate-domain drift fix.
- Live host, DNS, service, endpoint, SQLite, backup, and runtime verification
  before any new Risk A operation.

## Non-Goals

This docs/status update does not perform or authorize:

- Vultr server creation, deletion, reboot, firewall change, or provider mutation.
- DNS, Nginx, systemd, HTTPS, or public boundary mutation.
- SQLite migration, tenant/artifact mutation, subscription issuance, or token
  rotation.
- Public Admin exposure, payment activation, user traffic, edge traffic, or
  production cutover.
- Restoration of retired Aliyun gate APIs without a new explicit repo task and
  current ownership decision.

## Required Next Evidence Before Any A-Tier Work

Before any new Vultr runtime mutation, create a fresh read-only inventory
record that states:

```text
Risk: A / read-only
Mutation: none
Control-plane host identity: verified
Data-plane candidate identities: verified
DNS and public boundary: verified
Service, SQLite, backup, and endpoint posture: verified as applicable
QUIC runtime certificate SAN: aligned with rendered host/SNI where applicable
Secrets/customer data: not printed or copied into Git
Rollback or exit owner: named
```
