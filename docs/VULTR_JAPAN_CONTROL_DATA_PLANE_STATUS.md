# Vultr Japan Control / Data-Plane Status

Last updated: 2026-07-09, UTC.

> Status:
> - Type: Active docs/status baseline
> - Risk: C for this document; A for any Vultr, DNS, Nginx, systemd, firewall,
>   SQLite, secret, tenant, artifact, node-output, traffic, cutover, or rollback
>   mutation
> - Execution authority: Does not authorize provisioning, deployment, DNS change,
>   Nginx reload, systemd restart, firewall mutation, secret movement, SQLite
>   migration, subscription issuance, traffic activation, or production cutover
> - Production impact: None

## Current Direction

The current control/data-plane direction is:

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

Current production client-facing domains for this lane are under
`gccwebos.com`. For JP QUIC-based protocols, the rendered client host/SNI and
the runtime certificate SAN must stay aligned; a subscription render proof alone
is not enough if the runtime service still presents an older certificate.

Aliyun control-center, clean-start, promotion, Aegis, and gate records are
historical evidence only. Do not treat Aliyun as the current control center,
active default, compatibility route, or provider ownership model for new
planning.

The current protected Admin API no longer exposes Aliyun gate packet/evidence
routes or replacement provider-gate aliases for the retired Aliyun lane.

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
