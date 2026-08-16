# CLI Preproduction Subscription Issuance


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: cli_preproduction_subscription_issuance
  superseded_by: null
  last_verified_at: 2026-05-28
  production_authority: false
```


Date: 2026-05-28, Asia/Shanghai.

## Summary

Executed the exact-approved CLI production subscription issuance gate for a
small preproduction canary batch on the Aliyun subscription-control platform.

Result:

```text
batchId: batch_20260528_preproduction_canary_001
purpose: preproduction-canary
quantity: 3
expiresAt: 2026-06-04T00:00:00.000Z
node binding: channel-lab-b-tuic
tenants created: 3
opaque artifacts created: 3
artifact refresh validation: 3/3 HTTP 200
rendered output: TUIC marker present, no token query marker
rollback executed: no
```

Raw subscription URLs, raw artifact URLs, artifact secrets, tokens, rendered
YAML, node endpoint details, credentials, and customer data are not recorded in
this file.

## Approval

The operator approved:

```text
Approve CLI production subscription issuance on Aliyun. Create 3 controlled opaque artifacts with expiry 2026-06-04T00:00:00.000Z bound to channel-lab-b-tuic for preproduction-canary. Allow visible-once handoff material to be written only to an operator-only 0600 handoff file outside the repository. No all-user rollout, no DNS change, no Nginx change, no firewall change, no public Admin, no payment activation, no legacy query-token retirement, no raw subscription URLs or artifact secrets recorded in docs, PR, chat, logs, or terminal output, and rollback by revoking the created artifacts and disabling the created tenants.
```

## Preflight

Public boundary:

```text
https://sub.globalcirclecat.com/api/health -> 200
https://sub.globalcirclecat.com/api/admin/overview -> 404
https://sub.globalcirclecat.com/sub/clash.yaml -> 401
https://sub.globalcirclecat.com/sub/a/preproduction-nonexistent.yaml -> 404
```

Aliyun host and loopback service:

```text
host: iZrj92lvcxgfwxsyrupgfkZ
nginx_active: active
proxy_gateway_candidate_active: active
proxy_gateway_active: inactive
local_app_health: 200
local_admin_noauth: 401
local_no_token_sub: 401
nginx -t: successful
```

Allowed listeners observed:

```text
127.0.0.1:18080
0.0.0.0:80
127.0.0.1:3456
0.0.0.0:22
0.0.0.0:443
[::]:22
```

Database:

```text
path: /opt/proxy-gateway-minimal-candidate/state/subscriptions.sqlite
integrity_check: ok
tenants_total_before: 2
tenants_active_before: 1
tenants_disabled_before: 1
artifacts_total_before: 1
artifacts_active_before: 1
temp_links_total_before: 0
```

Safe node summary:

```text
node_count: 3
prod-edge-a: stable, subscription eligible
prod-edge-b: stable, subscription eligible
channel-lab-b-tuic: canary, subscription eligible
```

Repository-only dry run:

```text
command: npm run platform:resource-package -- <safe input>
status: ready_for_operator_delivery
plan: pilot
validUntil: 2026-06-04T00:00:00.000Z
seats: 3
protocolCounts: tuic=1
noRawCustomerData: true
noSubscriptionUrls: true
noProductionMutation: true
```

## Execution

Allowed mutation:

- created 3 active subscription tenants
- created 3 active opaque subscription artifacts
- wrote visible-once handoff material only to an operator-only file outside the
  repository
- created a SQLite backup before mutation
- inserted one safe audit event
- performed public artifact refresh validation for the created artifacts

Handoff and backup:

```text
handoff file: /root/.proxy-gateway-handoff/batch_20260528_preproduction_canary_001-20260528T122140Z.json
handoff mode: 0600, root:root
handoff items: 3
backup file: /opt/proxy-gateway-minimal-candidate/state/backups/subscriptions-before-batch_20260528_preproduction_canary_001-20260528T122140Z.sqlite
audit id: audit_2a6eeb88-d9ee-44ea-bd5a-af25be745d90
```

Created subscription ids:

```text
tenant_ffdaaf36-b538-4110-9e6c-65259adcb6d6
tenant_50701aff-21e2-414e-9d01-06afcd19bc55
tenant_9ee009e1-8c26-4125-9637-924138c12577
```

Created artifact ids:

```text
artifact_f85b688e-2abf-47be-a113-c53fff9e42d3
artifact_ff35ddef-6d74-401e-8c27-0e3cd3f754b6
artifact_f67d8394-125e-45bf-8f9c-9be91798e33f
```

Safe artifact prefixes:

```text
zgGSWdTxtAC9
PhmlXpQBk2AX
66iKEm754HoK
```

## Validation

Issuance script safe summary:

```text
tenantsCreated: 3
artifactsCreated: 3
refreshValidated: 3
refreshStatusCodes: 200, 200, 200
tuicMarkerValidated: true
noTokenQueryInRenderedOutput: true
rolledBack: false
```

Post-issuance database:

```text
integrity_check: ok
tenants_total_after: 5
tenants_active_after: 4
artifacts_total_after: 4
artifacts_active_after: 4
batch_tenants: 3
batch_artifacts: 3
batch_active_tenants: 3
batch_active_artifacts: 3
```

Post-issuance public boundary:

```text
public health: 200
public Admin: 404
no-token legacy subscription: 401
```

Sensitive-output audit:

```text
raw artifact hits in known Nginx/app logs: 0
raw artifact hits in proxy-gateway candidate journal since execution: 0
raw subscription URLs recorded in repository/docs/PR/chat: no
raw artifact secrets recorded in repository/docs/PR/chat: no
rendered YAML recorded: no
```

## Rollback

Rollback was not executed because validation passed.

Rollback scope if needed:

```text
revoke artifacts:
  artifact_f85b688e-2abf-47be-a113-c53fff9e42d3
  artifact_ff35ddef-6d74-401e-8c27-0e3cd3f754b6
  artifact_f67d8394-125e-45bf-8f9c-9be91798e33f

disable tenants:
  tenant_ffdaaf36-b538-4110-9e6c-65259adcb6d6
  tenant_50701aff-21e2-414e-9d01-06afcd19bc55
  tenant_9ee009e1-8c26-4125-9637-924138c12577
```

SQLite backup exists for structural rollback only if an integrity or partial
transaction issue is later discovered:

```text
/opt/proxy-gateway-minimal-candidate/state/backups/subscriptions-before-batch_20260528_preproduction_canary_001-20260528T122140Z.sqlite
```

## Not Performed

- No all-user rollout.
- No DNS change.
- No Nginx config mutation or reload.
- No firewall or provider-firewall mutation.
- No public Admin exposure.
- No payment activation.
- No legacy query-token retirement.
- No AWS mutation.
- No edge traffic activation.
- No channel-lab-b runtime mutation or cleanup.
- No raw subscription URL, artifact URL, artifact secret, token, credential,
  rendered YAML, node endpoint detail, raw log, or customer data recorded in
  repository docs, PR, chat, or terminal output.

## Next Gates

- Operator-side import/use validation for the three handoff artifacts.
- 1-hour, 24-hour, and 72-hour observation before increasing quantity above 5.
- Separate rollback/retain decision if any user import or refresh issue appears.
- Separate gate for broader opaque artifact issuance, legacy query-token
  retirement, payment activation, or all-user channel rollout.
