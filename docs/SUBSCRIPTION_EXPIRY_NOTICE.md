# Subscription flags and expiry notice

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: subscription_expiry_notice_source_and_promotion
  superseded_by: null
  last_verified_at: 2026-10-09
  production_authority: false
```

Risk: A access-response envelope / B source implementation. One PR. Release unit:
`subscription-rendering` hosted by `control-plane-app`. Identity impact: false;
no principal, material, map, collector or schema change. This document does not
grant merge/deployment authority.

## Recorded deployment update — 2026-10-09

The [PR #761 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/761#issuecomment-6075402400)
records this change as deployed on BWH at 2026-10-09T06:06:18Z–06:08:55Z,
terminal `applied_validated`. The four-file overlay is merged source
`40c7cc2390923a8c5904f349962ea1a85cdab6b6`, composed with unchanged #752
business source and #760 rendering source; this was not a whole-master update.
The receipt records six flagged display aliases and a controlled backend
restart. Authenticated user refresh, GUI/device acceptance and runtime traffic
cutoff remain unproven. This docs update performed no new runtime readback or
deployment; future execution still requires its own exact gate.

## Intent and allowed behavior

Use explicit `subscriptionDisplayName` strings for country flags; do not infer
country from an IP, hostname or legacy internal node name. BWH labels are
`🇺🇸 US-专线优化-vless`, `🇺🇸 US-专线优化-tuic`, `🇺🇸 US-专线优化-hy2`.
SGP, if included in the later exact catalog approval, uses an explicit `🇸🇬`
prefix while preserving the rest of its existing label. Set final values rather
than repeatedly prepending flags. Internal names, endpoints and credentials stay
unchanged. No new runtime flag field or geolocation dependency is introduced.

After token/artifact authentication and revocation checks, an expired tenant
still receives a denied core result (`ok:false`,403). That single condition also
has the typed internal `denialReason: subscription_expired`. Disabled tenants,
unknown/rotated/revoked links, expired temporary links, unavailable material/nodes
and internal errors do not get that classification. Error-message matching is
not an authorization decision. No expiry path resolves live credential material,
updates last-used, extends expiry, or activates service.

Only subscription YAML HTTP routes translate the classified denial to HTTP200
containing a constant notice, so a compatible client can replace its old nodes
on refresh. The notice contains two named **reject** outbound entries:

- 当前订阅已过期，请访问用户面板进行充值
- https://portal.gccwebos.com

No real endpoints, UUIDs/passwords, tenant identifiers, usage amounts, token or
artifact URLs are included. `Profile-Web-Page-Url` points to that fixed Portal;
`X-Subscription-Status: expired` and no-cache/no-store headers are applied. No
fabricated zero `Subscription-Userinfo` is emitted. A bare URL in a node name is
not guaranteed clickable; supported clients use the website header, otherwise
users open the panel directly.

Inline and profile routes return rule-mode YAML, without remote providers or
health checks. Only the exact public Portal and Sub hostnames have DIRECT rules
for renewal/refresh; remaining rule-mode traffic is REJECT. Provider YAML returns
only the two reject entries and cannot overwrite consumer-owned rules or other
subscriptions. No empty provider/DIRECT fallback or fake loopback proxy is used.

This targets Mihomo/Clash.Meta-compatible clients with named `type: reject`.
The upstream parser explicitly supports it; native candidate parsing is required
before promotion. This does not promise compatibility with all legacy Clash
clients. See [Mihomo parser](https://github.com/MetaCubeX/mihomo/blob/Meta/adapter/parser.go)
and [built-in rejection semantics](https://wiki.metacubex.one/config/proxies/built-in/).

## Limits and non-goals

The client must refresh manually or on its configured schedule. The server
cannot push-rewrite a downloaded file, force rule mode, or prevent a user from
selecting their own DIRECT policy. Existing server-side expiry enforcement stays
authoritative; this feature does not implement or prove runtime traffic cutoff.
Renewal must actually extend the subscription entitlement; topping up Coins
alone need not do so. After valid renewal, a refreshed live URL returns the usual
subscription. Revoked/rotated URLs remain invalid, including after renewal.

No third-party template/node credentials are stored, imported or redistributed.
No unpaid access, auto-purchase, credential issuance/reset, billing/usage changes,
SGP service recovery, client update-frequency override, or database migration.

## Validation and stepwise promotion runbook

1. Source: expiry boundary (one millisecond before and exact time), all four YAML
   routes, renewal, typed-denial handling, disabled/unknown/revoked/rotated/temp
   denial, no-store/fixed URL/no credential leakage, no last-used mutation;
   explicit flags through three renderers and real synthetic per-order identity.
2. Run focused tests, `npm test`, diff check and an independent review bound to
   the final head. Existing unrelated failures require exact baseline evidence;
   never report a partially failed suite as green.
3. Isolated native parsing of expiry inline/provider and all flagged formats,
   no production data or real network traffic. Client refresh/stateful acceptance
   remains separate from a successful `-t` parse.
4. Before production: bind merged source/artifact and fresh actual BWH base,
   exact catalog aliases and route/core/resolver composition. Do not replace all
   business source with master or activate unrelated #753/#755 work. Preserve the
   current independent collector and all existing env/config dependencies.
5. Prepare a new catalog/code-pointer backup and demonstrate exact allowed diffs.
   Obtain explicit operator approval for the precise composition and one backend
   restart. Apply/verify separately, not a black-box multi-step execution package.
6. Verify health/auth denial, runtime source/catalog bindings, protocol PIDs and
   natural collector state; then verify active/expired/renewed synthetic client
   refresh behavior without exporting a customer's subscription. Do not expire
   a real customer account for testing. Record actual Deploy Note, plus pending
   device acceptance rather than claiming it from unit tests.
7. Failure rollback restores only this update's catalog and code pointer; never
   restore old databases, reset usage, backcharge or restart protocol/collector
   services. Keep all explicitly referenced old release dependencies protected.
