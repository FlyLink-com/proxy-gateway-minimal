# AWS Staging Node Image Readiness Validation

Date: 2026-06-13, Asia/Shanghai.

## Status

- Type: execution record
- Risk of executed gate: A
- Risk of this closeout: C, repo-only documentation/status update
- Target: AWS staging host only
- Production impact: none

This record closes the production-node image readiness slice. It does not
complete control-plane registration, protected material handoff, production node
activation, traffic activation, DNS, Nginx, firewall, or live order issuance.

## Approved Candidate

```text
release: aws-node-image-validation-20260613-001
artifact: D:\Projects\proxy-gateway-minimal\.codex-artifacts\aws-node-image-validation-20260613-001\proxy-gateway-aws-node-image-validation-20260613-001.zip
archive_sha256: 6663954D42E2166F5C665D3DDE1BFEC2E363E536C03907EA006F93DCB3631B5B
region: ap-northeast-1
instance_id: i-08aa4775a099c9a18
```

## Executed Scope

- Ran read-only staging inventory.
- Backed up the current staging symlink, protected staging environment, and
  control DB when present.
- Uploaded the approved artifact and verified the remote SHA-256.
- Unpacked the release under the staging candidate release directory.
- Ran `npm ci`.
- Switched the AWS staging current symlink to the approved release.
- Restarted `proxy-gateway-candidate.service` only.
- Ran node-image readiness and first-boot packet CLI validation with synthetic
  safe input only.

## Validation

The gate validated:

- Artifact hash matched locally and remotely.
- `npm ci` completed on the AWS staging host.
- `proxy-gateway-candidate.service` was active after restart.
- Public health returned `200`.
- Public Admin remained blocked.
- No-session portal APIs rejected unauthenticated requests.
- Admin loopback listener remained loopback-only.
- `node image-readiness-summary` accepted the final synthetic safe input.
- `node image-first-boot-packet` accepted synthetic safe input.
- No live order was created.
- No DNS, Nginx, security group, Vultr, Aliyun, production, customer-data, or
  payment mutation was performed.

One transient synthetic input check intentionally failed because `noOpenPrs`
was false; the CLI denied readiness by design. The final synthetic input
corrected that condition and passed.

## Result

Production-node image readiness is validated on AWS staging for the no-secret
image and first-boot packet helper path.

The next phase is control-plane closeout: node registry ingestion,
first-boot registration packet handling, protected material handoff,
desired-state generation, receipt-gated subscription rendering, operator
approval, validation, and rollback framing.
