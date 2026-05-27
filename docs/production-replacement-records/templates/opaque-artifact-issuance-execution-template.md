# Opaque Artifact Issuance Execution Record

Date: YYYY-MM-DD
Timezone: Asia/Shanghai

## Status

```text
Type: Risk A execution record
Gate: broader opaque artifact issuance
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
Approve broader opaque artifact issuance. Allow approved-tenant artifact issuance, visible-once handoff metadata, and private/public refresh validation on the Aliyun subscription boundary. No legacy query-token route removal, no DNS change, no public Admin, no edge traffic, no AWS mutation, no historical state copy, and no raw subscription URLs or artifact secrets recorded.
```

Recorded operator approval:

```text
pending
```

Do not execute this template until the recorded approval exactly matches the
required phrase.

## Scope

Approved tenant/device scope:

```text
pending
```

Out of scope:

```text
legacy query-token route removal
legacy token rotation or drain
DNS change
public Admin exposure
edge traffic activation
AWS mutation
historical state copy
raw subscription URL or artifact-secret recording
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
public_3456:
public_18080:
```

Access model summary:

```text
enabled_tenant_count:
disabled_tenant_count:
active_artifact_count_before:
revoked_or_rotated_artifact_count_before:
legacy_route_status:
temporary_link_count_summary:
```

Logging posture:

```text
nginx_artifact_path_redaction:
app_log_raw_artifact_check:
execution_record_sensitive_output_check:
```

## Actions Performed

```text
artifact_issue_count:
visible_once_handoff_path:
artifact_summary_recorded:
```

Do not include raw artifact URLs, raw artifact secrets, raw subscription URLs,
raw tokens, customer emails, customer organization names, or SQLite row dumps.

## Validation

```text
artifact_list_summary_safe:
authorized_artifact_refresh:
public_admin_after:
legacy_no_token_after:
legacy_query_token_route_after:
log_sensitive_output_check:
```

## Rollback / Cleanup

```text
created_artifact_revocation_or_rotation_path:
rollback_performed:
cleanup_notes:
```

## Not Performed

```text
No legacy query-token route removal.
No legacy token rotation or drain.
No DNS change.
No public Admin exposure.
No edge traffic activation.
No AWS mutation.
No historical state copy.
No raw subscription URLs or artifact secrets recorded.
```

## Sensitive Output Audit

```text
raw_artifact_url_recorded: no / yes
raw_artifact_secret_recorded: no / yes
raw_subscription_url_recorded: no / yes
raw_token_recorded: no / yes
customer_data_recorded: no / yes
cloud_secret_recorded: no / yes
```

## Result

```text
pending
```
