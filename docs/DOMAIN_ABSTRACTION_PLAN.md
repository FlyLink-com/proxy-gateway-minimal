# DNS / Domain Abstraction Plan

Last updated: 2026-05-24, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: dns_domain_abstraction_plan
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```


> Status:
> - Type: Active planning document
> - Risk: A
> - Execution authority: Does not authorize DNS, Nginx, HTTPS, production config, green creation, or cutover by itself
> - Production impact: None unless separately approved
> - Source of truth for: DNS/domain abstraction planning

Last updated: 2026-05-24, Asia/Shanghai.

This document plans the DNS/domain abstraction path recommended by
`docs/PRODUCTION_CUTOVER_STRATEGY.md`. It is a planning document only. It does
not authorize DNS mutation, AWS mutation, Nginx changes, HTTPS certificate
issuance, production config changes, production secret copying, green creation,
or traffic cutover.

## Context

Current production remains a single blue node:

```text
Node name: aws-singapore-blue
Instance ID: i-004ab1c6c71d06bca
Public IP: 47.129.247.102
Security group: sg-04a165ec77f430ee8
Runtime path: /opt/proxy-gateway-minimal
```

Known cutover blockers:

- `47.129.247.102` is not confirmed as an Elastic IP.
- The tracked `PUBLIC_SUBSCRIPTION_BASE_URL` example remains IP-pinned.
- The tracked `config/proxy-servers.json` host, `pingHosts`, and `nginx.host`
  remain IP-pinned.
- `docs/archive/DOMAIN_HTTPS.md` exists as a historical paused AWS Singapore
  HTTPS runbook, but current domain execution is governed by this plan and
  `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`.
- Green candidate creation and production cutover are not approved.

## Recommendation

Use DNS/domain abstraction as the preferred medium-term cutover path, but do
not execute it until a separate Risk A implementation runbook is approved.

Recommended public names:

```text
Subscription base URL host: sub.globalcirclecat.com
Shadowsocks node host: ss-sg.globalcirclecat.com
```

Rationale:

- `sub.globalcirclecat.com` already appears in the paused domain HTTPS runbook
  and should remain dedicated to subscription delivery through Nginx.
- `ss-sg.globalcirclecat.com` separates Shadowsocks node traffic from the HTTP
  subscription gateway and leaves room for future region-specific nodes.
- Separating the two names allows subscription HTTPS/Nginx work and Shadowsocks
  DNS cutover to be validated independently.

Do not repoint `globalcirclecat.com` or `www.globalcirclecat.com` as part of
this plan.

## Target DNS Model

Initial DNS records, if the implementation plan is later approved:

| Host | Type | Initial target | Purpose |
| --- | --- | --- | --- |
| `sub.globalcirclecat.com` | A | blue public IP | Public subscription and health gateway |
| `ss-sg.globalcirclecat.com` | A | blue public IP | Shadowsocks node host in generated YAML |

TTL policy:

- Lower TTL to `300` before any planned cutover window.
- Keep TTL low during validation, migration, and rollback windows.
- Raise TTL only after the operator confirms stable client behavior.

Rollback policy:

- DNS rollback must point both names back to the last known healthy blue target
  unless a later approved runbook chooses a different rollback target.
- Blue must remain serving during the DNS migration and green validation
  windows.

## HTTP And HTTPS Strategy

Stage HTTP before HTTPS:

1. Create DNS records to blue only after approval.
2. Verify HTTP health and subscription routing with the domain Host header.
3. Keep public Nginx boundary unchanged:
   - `/api/health` allowed;
   - `/sub/clash.yaml` allowed with token validation;
   - `/api/admin/*` returns `404`;
   - `/` and static UI paths return `404`.
4. Issue HTTPS for `sub.globalcirclecat.com` only after DNS and HTTP routing
   are verified.
5. Do not issue HTTPS for `ss-sg.globalcirclecat.com`; it is a DNS name for
   Shadowsocks node traffic, not an HTTP subscription endpoint.

HTTPS and redirect behavior must be decided in the implementation runbook:

- whether HTTP remains available temporarily for existing clients;
- whether Certbot manages Nginx edits directly or a reviewed Nginx template is
  applied first;
- how to verify renewal and rollback without exposing the Admin UI.

## Nginx Plan

Future Nginx changes must preserve these boundaries:

- Public Nginx remains the gateway for subscription HTTP/HTTPS.
- The Admin UI and `/api/admin/*` remain private.
- Access logs must not include query strings or subscription tokens.
- Nginx must continue proxying only the public health and subscription routes to
  `127.0.0.1:3456`.

The implementation plan must define:

- exact server names;
- HTTP-only validation configuration;
- HTTPS certificate issuance path;
- redirect policy;
- `nginx -t` and reload sequence;
- rollback to the previous Nginx site.

## Runtime Config Migration

The runtime migration has two independent pieces.

### Subscription Base URL

Target:

```text
PUBLIC_SUBSCRIPTION_BASE_URL=https://sub.globalcirclecat.com
```

Rules:

- Do not update production `.env` until DNS, HTTP, and HTTPS validation have
  passed under an approved Risk A runbook.
- Do not rotate tenant tokens just to change the host.
- New or reset visible-once subscription links should use the domain only after
  the base URL change is approved and deployed.
- Existing IP-based links may continue to work only while the old blue public IP
  continues serving; client migration must account for this.

### Shadowsocks Node Host

Target tracked node host:

```text
config/proxy-servers.json servers[].host: ss-sg.globalcirclecat.com
config/proxy-servers.json pingHosts[]: ss-sg.globalcirclecat.com
config/proxy-servers.json nginx.host: sub.globalcirclecat.com
```

Rules:

- Do not mutate production `config/proxy-servers.json` until the Shadowsocks DNS
  name resolves to the intended healthy node.
- Generated Clash/Mihomo YAML should use the DNS node host after the approved
  config migration.
- Do not copy production `SS_PASSWORD` into planning docs or PRs.
- Validate generated YAML without recording full subscription URLs or tokens.

## Existing IP-Pinned Client Migration

Current clients may be pinned in two places:

- subscription fetch URL host;
- Shadowsocks node host from cached or refreshed YAML.

Migration approach:

1. Keep blue serving on `47.129.247.102` during migration.
2. Introduce `ss-sg.globalcirclecat.com` while it still points to blue.
3. Update node host in generated YAML only after DNS validation.
4. Introduce `sub.globalcirclecat.com` for newly issued subscription links only
   after HTTP/HTTPS validation.
5. Provide an operator-managed client migration window for users who still hold
   IP-based subscription links.
6. Do not retire the IP-based blue path until the operator confirms client
   migration or accepts the residual client impact.

Suggested minimum windows:

- TTL lowering before cutover: at least 24 hours.
- Blue/domain parallel serving: at least 7 days, unless an incident runbook
  explicitly chooses a shorter window.

## Blue / Green Parallel Window

Before green creation:

- DNS/domain strategy must be approved.
- Rollback target must be blue.
- Fresh blue SQLite backup requirement must be accepted.

After green creation, but before cutover:

- Blue continues serving current clients.
- Green is validated independently.
- DNS can be prepared only under approved Risk A commands.
- No traffic is cut over until the cutover approval phrase is given.

During cutover:

- DNS changes should move `sub.globalcirclecat.com` and
  `ss-sg.globalcirclecat.com` according to the approved runbook.
- Blue remains available until rollback window closes.
- Admin API privacy and public Nginx boundary must be rechecked.

## Validation Checklist

The implementation runbook must include these checks before any cutover:

- DNS lookup for `sub.globalcirclecat.com`.
- DNS lookup for `ss-sg.globalcirclecat.com`.
- Public `http://sub.globalcirclecat.com/api/health`.
- Public `https://sub.globalcirclecat.com/api/health` after HTTPS issuance.
- Public `/api/admin/*` returns `404`.
- Public `/sub/clash.yaml` without token returns `401`.
- Valid subscription fetch succeeds without recording raw URLs or tokens.
- Generated YAML uses the intended Shadowsocks DNS node host.
- Shadowsocks client connectivity through the DNS node host.
- Nginx config test and reload result.
- systemd service state.
- SQLite backup and `pragma integrity_check` before any production restore or
  cutover.

## Rollback Plan

Rollback must be possible at every stage:

| Stage | Rollback |
| --- | --- |
| DNS created but runtime unchanged | Remove or repoint DNS records to blue |
| HTTP domain works but HTTPS fails | Keep IP-based production path and revert Nginx HTTPS edits |
| HTTPS works but base URL unchanged | Leave runtime unchanged; fix or remove HTTPS route |
| Base URL changed | Restore previous `.env`, restart console service, verify old path |
| Node host changed | Restore previous node config, restart console service if needed, verify generated YAML |
| DNS cutover to green fails | Repoint DNS to blue while TTL is low |

Rollback records must not include raw tokens, subscription URLs, production
`.env` contents, or customer data.

## Approval Gates

### Planning Approval

This document is planning only. Approval of this PR does not approve execution.

### DNS / HTTPS Implementation Approval

Required before any DNS, Nginx, HTTPS, or runtime config mutation:

```text
Approve DNS/domain abstraction implementation for aws-singapore-blue.
```

### Green Creation Approval

Required before creating a production replacement candidate:

```text
Create a green production replacement candidate for aws-singapore-blue.
```

### Cutover Approval

Required before moving production traffic:

```text
Cut over production traffic from blue to green.
```

Each approval is separate. Earlier approval does not imply later approval.

## Non-Goals

This plan does not implement or authorize:

- DNS record creation, update, or deletion.
- AWS resource creation or mutation.
- Nginx changes.
- HTTPS certificate issuance.
- Production `.env` changes.
- Production `config/proxy-servers.json` changes.
- Production service restart or reload.
- Production secret copying.
- SQLite copying or restore.
- Green candidate creation.
- Traffic cutover.
- Automatic failover.
