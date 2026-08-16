# AWS Staging Node Image Readiness Validation


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aws_staging_node_image_readiness_validation
  superseded_by: null
  last_verified_at: 2026-06-14
  production_authority: false
```


Date: 2026-06-14, Asia/Shanghai.

## Status

- Type: execution record
- Risk of executed gate: A
- Risk of this closeout: C, repo-only documentation/status update
- Target: AWS staging host only
- Production impact: none

This record repeats and updates the AWS staging proof for the no-secret
production-node image readiness lane. It does not complete control-plane node
registration, protected material handoff, production node activation, traffic
activation, DNS, Nginx, firewall, provider security group, or live order
issuance.

## Approved Candidate

```text
release: aws-node-image-validation-20260614-001
artifact: D:\Projects\proxy-gateway-minimal\.codex-artifacts\aws-node-image-validation-20260614-001\proxy-gateway-aws-node-image-validation-20260614-001.zip
archive_sha256: 33F3AA3E823BD82EF5234B19951292405BB3BB04570BC9DFB0D37C03EDCD404B
region: ap-northeast-1
instance_id: i-08aa4775a099c9a18
```

## Executed Scope

- Ran read-only staging inventory.
- Backed up the current staging symlink, protected staging environment, and
  control DB when present.
- Uploaded the approved artifact and verified the remote SHA-256.
- Unpacked the release under the AWS staging candidate release directory.
- Ran `npm ci`.
- Switched the AWS staging current symlink to the approved release.
- Restarted `proxy-gateway-candidate.service` only.
- Ran node-image readiness and first-boot packet CLI validation with synthetic
  safe input only.
- Removed temporary upload and npm-ci output files after validation.

## Validation

The gate validated:

- Artifact hash matched locally and remotely.
- `npm ci` completed on the AWS staging host.
- Current release is `aws-node-image-validation-20260614-001`.
- `proxy-gateway-candidate.service` was active after restart.
- Loopback health returned `200`.
- Public health returned `200`.
- Public Admin remained blocked with `404`.
- No-session portal API rejected unauthenticated requests with `401`.
- Root path remained `404`.
- Internal control port `3456` remained loopback-only.
- `node image-readiness-summary` accepted synthetic safe input and did not
  grant activation.
- `node image-first-boot-packet` accepted synthetic safe input and did not
  grant first-boot apply.
- No live order was created.
- No DNS, Nginx, provider security group, Vultr, Aliyun, production,
  customer-data, payment, account/password, subscription URL, token, private
  key, SQLite row, raw environment, raw log, or raw runtime config mutation or
  output occurred.

## Result

GCC-15 is complete for AWS staging: the node-image startup/readiness helper
path is validated with the current repository artifact and synthetic safe input
only.

This result is not production promotion approval. The next image-factory lane
is GCC-16: a production image promotion approval packet with exact target,
release, artifact hash, image manifest, channel plan, validation plan, and
rollback plan. Actual production node registration and protected material
handoff remain separate Risk A gates.

## Rollback Posture

The previous staging current symlink, protected staging environment, and
control DB backups were retained on the AWS staging host. Rollback remains:
restore the previous current symlink and protected backups, then restart
`proxy-gateway-candidate.service`.
