# Legacy Query-Token Retirement Execution Record

Date: YYYY-MM-DD
Timezone: Asia/Shanghai

## Status

```text
Type: Risk A execution record
Gate: legacy query-token retirement
Approval: pending / received
Production impact: pending evidence
```

## Agent / Task Routing

```text
Lead agent:
Primary unit: Subscription Access Control
Secondary units: Production Operations, Aliyun Control Platform
Supporting agents:
Follow-up agent suitability:
Recommended next owner:
```

## Exact Approval

Required phrase:

```text
Approve legacy query-token retirement. Allow approved legacy token drain/rotation after opaque artifact validation. No /sub/clash.yaml route removal, no DNS change, no public Admin, no edge traffic, no AWS mutation, no tenant disablement outside approved scope, and no raw tokens or subscription URLs recorded.
```

Recorded operator approval:

```text
pending
```

Do not execute this template until the recorded approval exactly matches the
required phrase.

## Preconditions

```text
opaque_artifact_issuance_record:
approved_artifact_refresh_observed:
lost_device_or_reissue_support_path:
rollback_path:
operator_waivers:
```

## Scope

Approved tenant/token scope:

```text
pending
```

Out of scope:

```text
/sub/clash.yaml route removal
tenant disablement outside approved scope
DNS change
Nginx change
public Admin exposure
edge traffic activation
AWS mutation
historical state copy
raw token or subscription URL recording
```

## Read-Only Preflight

Repository:

```text
branch:
commit:
open_prs:
project_state_check:
```

Aliyun runtime:

```text
proxy_gateway_service:
nginx:
ufw_summary:
sqlite_integrity:
```

Public boundary:

```text
health:
public_admin:
legacy_no_token:
artifact_refresh:
```

Access model summary:

```text
approved_tenant_count:
approved_active_artifact_count:
legacy_route_status_before:
legacy_token_count_summary_before:
temporary_link_count_summary_before:
```

## Actions Performed

```text
legacy_tokens_rotated_or_drained_count:
temporary_links_expired_count:
tenants_disabled_count:
```

Do not include raw tokens, raw subscription URLs, raw artifact URLs, customer
emails, customer organization names, or SQLite row dumps.

## Validation

```text
artifact_refresh_after:
legacy_old_token_behavior:
legacy_route_presence_after:
public_admin_after:
health_after:
log_sensitive_output_check:
```

## Rollback / Cleanup

```text
rollback_needed:
artifact_reissue_or_rotation_path:
legacy_compatibility_recovery_path:
cleanup_notes:
```

## Not Performed

```text
No /sub/clash.yaml route removal.
No DNS change.
No Nginx change.
No public Admin exposure.
No edge traffic activation.
No AWS mutation.
No historical state copy.
No tenant disablement outside approved scope.
No raw tokens or subscription URLs recorded.
```

## Sensitive Output Audit

```text
raw_token_recorded: no / yes
raw_subscription_url_recorded: no / yes
raw_artifact_url_recorded: no / yes
customer_data_recorded: no / yes
cloud_secret_recorded: no / yes
```

## Result

```text
pending
```
