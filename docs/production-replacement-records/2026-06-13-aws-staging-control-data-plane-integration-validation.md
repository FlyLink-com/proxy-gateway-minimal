# AWS Staging Control/Data-Plane Integration Validation


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aws_staging_control_data_plane_integration_validation
  superseded_by: null
  last_verified_at: 2026-06-13
  production_authority: false
```


Date: 2026-06-13, Asia/Shanghai.

## Status

- Type: execution record
- Risk of executed gate: A
- Risk of this closeout: C, repo-only documentation/status update
- Target: AWS staging host only
- Production impact: none

This record closes the AWS staging control/data-plane integration validation
slice. It does not activate production, promote AWS as production authority,
change DNS, change Nginx, change provider security groups, touch Vultr or
Aliyun, create customer or production orders, expose public Admin, output
subscription material, or enable user traffic.

## Approved Candidate

```text
release: aws-control-data-plane-integration-validation-20260613-001
artifact: D:\Projects\proxy-gateway-minimal\.codex-artifacts\aws-control-data-plane-integration-validation-20260613-001\proxy-gateway-aws-control-data-plane-integration-validation-20260613-001.zip
archive_sha256: 9A7AF1F204F9D6F7EB08725DA565DEE3C70BD290ACBB96059F471033F6088519
region: ap-northeast-1
instance_id: i-08aa4775a099c9a18
```

## Executed Scope

- Ran read-only AWS staging inventory first.
- Backed up the current staging symlink, protected staging environment,
  service metadata, and SQLite files when present.
- Uploaded the approved artifact and verified the remote SHA-256.
- Unpacked the release under the staging candidate release directory.
- Ran `npm ci`.
- Switched the AWS staging `current` symlink to the approved release.
- Restarted `proxy-gateway-candidate.service` only.
- Ran synthetic control/data-plane validation with safe synthetic input only.
- Ran synthetic node-image readiness and first-boot packet CLI validation.
- Ran targeted edge-agent, state integration, usage/lifecycle, node registry,
  and node-image tests on the AWS staging host.

## Validation

The gate validated:

- Artifact hash matched locally and remotely.
- `npm ci` completed on the AWS staging host.
- `proxy-gateway-candidate.service` was active after restart.
- Public health returned `200`.
- Public Admin remained blocked.
- Public internal agent routes remained blocked.
- No-session portal APIs rejected unauthenticated requests.
- Admin/control listener `3456` remained loopback-only.
- `npm run project-state:check` passed on the AWS staging release.
- Data-plane agent protocol/service/routes and production edge-agent tests
  passed: `38/38`.
- Runtime state integration tests passed: `28/28`.
- Usage monitor, quota lifecycle, node registry, node-image readiness, and
  first-boot packet tests passed: `22/22`.
- Safe node-image readiness CLI and first-boot packet CLI accepted synthetic
  safe input while preserving approval separation.
- Control/data-plane schema checks confirmed the edge desired-state,
  receipt, usage sample, and usage rollup tables were present in the staging
  control store.
- No live order was created.
- No DNS, Nginx, security group, Vultr, Aliyun, production, customer-data,
  payment, subscription material, or public Admin mutation was performed.

## Result

AWS staging now validates the production-like control/data-plane integration
loop at the synthetic proof level:

- control-plane node and channel facts remain separated from runtime material;
- desired-state, material, lease, and receipt routes stay private and
  authenticated;
- receipt-gated rendering logic is covered by tests;
- usage/lifecycle accounting paths are present and redacted;
- image readiness and first-boot packet helpers remain no-secret and
  approval-gated.

This is staging evidence only. It does not replace a separate Risk A production
gate for node registration, protected material handoff, production edge-agent
activation, live order smoke, DNS/Nginx/provider changes, or runtime traffic.

## Next Gate

The next control-plane closeout gate should use this record as staging evidence
and then prepare a separate exact approval for production or a clean staging
promotion rehearsal. That next gate still needs explicit release/artifact/hash,
read-only inventory, backup, validation, rollback, and no-sensitive-output
boundaries.
