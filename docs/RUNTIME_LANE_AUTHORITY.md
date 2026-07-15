# Runtime Lane Authority Boundary

Last updated: 2026-06-15, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: runtime_lane_authority
  superseded_by: null
  last_verified_at: 2026-07-15
  production_authority: false
```

> Status:
> - Type: Active runtime-lane authority index
> - Risk: C
> - Execution authority: Does not authorize production, AWS, Vultr, Aliyun,
>   DNS, Nginx, systemd, firewall, SQLite, node, tenant, artifact, payment,
>   deploy, rollback, secret, token, subscription URL, credential, runtime
>   config, or customer-data actions
> - Production impact: None
> - Source of truth for: Which runtime lanes are current authority, staging
>   evidence, historical reference, or archive-only material

## Purpose

Use this file before importing old runtime notes, comparing historical node
records, drafting a node/runbook approval packet, or deciding whether a channel
or host belongs to the current production model.

This file prevents three common mistakes:

1. Treating historical Aliyun or AWS records as current production authority.
2. Treating canary protocol records as current channel configuration.
3. Treating generated runtime material, old release packages, or stopped-node
   records as reusable source without a fresh Risk A gate.

This file is an authority boundary, not live inventory. Runtime facts that can
drift still require live read-only verification before any Risk A action.

## Current Authority

| Lane | Current role | Authority boundary | Required before mutation |
| --- | --- | --- | --- |
| Vultr Japan control plane | Current subscription control plane. Owns accounts, orders, subscription artifacts, credential refs, desired-state notifications, render gating, and usage ledger state. | It is the current control-plane lane, but `master` and deployed runtime can still drift. | Live read-only inventory, protected backups, exact approval, validation, and rollback plan. |
| Vultr Japan data plane | Current production data-plane capacity for VLESS Reality, Hysteria2, and TUIC channels. | Provides runtime capacity only. It does not own accounts, orders, packages, or customer truth. | Runtime/service/listener inventory, config-test where applicable, and receipt/render validation if channel output changes. |
| Vultr Singapore data plane | Current optional production data-plane capacity for VLESS Reality, Hysteria2, and TUIC channels through the Japan control plane. | Stays out of rendered subscriptions unless matching applied receipts prove current desired-state was applied. It is not an independent user panel or control DB. | Fresh agent/receipt/readiness proof for the scoped order or channel generation being rendered. |
| GitHub `master` | Integrated source baseline after reviewed PR merge. | Not automatically the live server state and not proof that production was upgraded. | Separate release artifact, Risk A promotion gate, and runtime validation. |

## Staging Evidence

| Lane | Use rule |
| --- | --- |
| AWS staging | Validates synthetic control/data-plane, node-image, first-boot packet, and helper flows. It is staging evidence only, not production activation, not a production control-plane, and not a provider-image promotion by itself. |
| Local checkout / local Admin bridge | Development, validation, operator handoff, and protected local access tooling only. It is not production state. |
| GitHub Actions / Cloudflare Workers build | CI and static-site build evidence. They do not authorize production deploy, DNS change, runtime mutation, or control-plane promotion. |

## Historical Or Superseded Runtime Lanes

These lanes remain useful for archaeology and rollback review, but they are not
current production authority:

| Historical lane | Current reading posture |
| --- | --- |
| Aliyun subscription-distribution / control-center records | Historical evidence and compatibility archaeology only. Do not use Aliyun as the current control plane or auto-issuance target without a fresh Risk A gate and live verification. |
| AWS Singapore `prod-edge-a` / `prod-edge-b` records | Historical replacement and retirement evidence. Stopped or terminated-node records do not provide current capacity or rollback authority. |
| `channel-lab-a` Hysteria2 canary records | Historical protocol canary evidence only. Do not reuse as current Hy2 production config. |
| `channel-lab-b` TUIC canary records | Historical TUIC canary evidence only. Do not reuse as current TUIC production config or subscription output. |
| Single-node TUIC/Japan upgrade notes before the current multi-channel model | Background for debugging only. Current rendering must follow order-owned credential refs, desired-state, and applied receipt gates. |
| Retired stable TCP / Shadowsocks records | Historical fallback evidence only. Do not restore as a default production channel without a new design and Risk A activation gate. |
| Generated artifacts and release packages under `.codex-artifacts/` or exported runtime folders | Build/deploy evidence only. Do not copy raw runtime material into Git or treat generated output as source. |

## Decision Rules

When documents disagree, use this order:

1. Live read-only inventory for drift-prone production facts.
2. `docs/PROJECT_CONTEXT.md` for current handoff and active blockers.
3. `docs/VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md` for current Vultr direction.
4. This file for runtime-lane authority classification.
5. `docs/README.md` indexes for historical execution records.
6. Historical records only after confirming they are being used for archaeology,
   not current authority.

Do not use a historical lane to:

- set `USER_PORTAL_AUTO_ISSUANCE_*` values;
- change channel refs, bundle refs, node refs, or physical node refs;
- change client-facing host/SNI/port fields;
- write protected env files or runtime config;
- unlock subscription rendering;
- claim a node is active, healthy, or receipt-ready;
- justify DNS, Nginx, firewall, provider, systemd, or service mutation.

## Reactivation Gate

Any historical or superseded lane can only become current again through a fresh
Risk A package that names:

- target lane and target host/node ref;
- current source release and expected deployed release;
- read-only inventory result;
- protected material key/digest refs only;
- exact channel refs and bundle refs;
- backup scope and rollback action;
- validation commands and endpoint/service checks;
- explicit forbidden actions and sensitive-output boundary.

Short approvals such as `ok`, `继续`, `开始`, or `同意` are not sufficient.

## Validation

For edits to this authority index:

```powershell
git diff --check origin/master...HEAD
npm run project-state:check
```

Do not run production probes, SSH commands, provider APIs, Nginx tests, service
restarts, database migrations, or subscription fetches for this C-tier document
unless a separate Risk A gate explicitly authorizes them.
