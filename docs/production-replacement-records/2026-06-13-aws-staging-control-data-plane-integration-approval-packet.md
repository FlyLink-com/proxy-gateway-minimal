# AWS Staging Control/Data-Plane Integration Approval Packet


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aws_staging_control_data_plane_integration_approval_packet
  superseded_by: null
  last_verified_at: 2026-06-13
  production_authority: false
```


Date: 2026-06-13, Asia/Shanghai.

## Status

- Type: approval packet
- Risk: A for AWS staging execution
- Target: AWS staging only
- Production impact: none unless a future separate gate explicitly promotes
  evidence into production planning

This document does not authorize production mutation, Vultr/Aliyun mutation,
DNS, Nginx, security-group changes, public Admin exposure, customer-data use,
production-secret use, payment, account/password generation, live production
order creation, subscription URL/token/password output, SQLite row dump, or raw
environment/log/config output.

## Context

`docs/production-replacement-records/2026-06-13-aws-staging-node-image-readiness-validation.md`
validated only the no-secret node-image readiness and first-boot packet helper
path on AWS staging with synthetic safe input.

The next validation should prove the control-plane and data-plane loop together
in a production-like but isolated AWS staging environment:

1. control-plane node registry ingestion;
2. protected-material reference handling;
3. synthetic order / credential-ref issuance;
4. desired-state generation;
5. staging edge-agent dry-run/apply;
6. redacted applied receipts;
7. receipt-gated subscription rendering;
8. usage/lifecycle accounting smoke with synthetic data only.

This is not a production-node activation and not a migration of production
authority to AWS.

## Required Candidate

The exact execution approval must include:

- `release`;
- local `artifact` path;
- `archive_sha256`;
- AWS staging host identity;
- AWS region and instance id;
- current staging release discovered by read-only inventory;
- rollback target.

Do not reuse the previous `aws-node-image-validation-20260613-001` package for
this gate unless the approval explicitly says the scope is limited to that old
image-readiness validation. This packet is for the broader control/data-plane
integration proof.

## Allowed Scope After Exact Approval

AWS staging only:

- read-only staging inventory;
- backup current staging symlink, protected staging env, control DB, and service
  metadata if present;
- upload and verify the reviewed artifact;
- unpack to the staging release directory;
- run `npm ci`;
- switch staging `current` only after preflight passes;
- restart `proxy-gateway-candidate.service` only;
- install or update staging edge-agent source/service if required by the
  candidate;
- use synthetic staging material only;
- create or reuse synthetic staging account/order/node facts only;
- run first-boot registration packet validation;
- generate desired-state notifications for the synthetic order;
- run edge-agent dry-run/apply in staging;
- config-test staging runtime adapters before any staging runtime restart;
- restart only approved staging runtime services if the controlled apply path
  requires it;
- post redacted receipts;
- run render proof without subscription URL, token, YAML, credential, private
  key, raw config, raw log, or SQLite-row output;
- run usage/lifecycle smoke with synthetic data only.

## Validation

The gate must prove, without sensitive output:

- artifact hash and remote hash match;
- `npm ci` passes;
- staging service is active after restart;
- health returns `200`;
- public Admin remains blocked;
- public internal agent route remains blocked;
- no-session portal APIs reject unauthenticated requests;
- internal control port remains loopback-only;
- synthetic first-boot/node registration facts are accepted;
- protected material is referenced by key/digest only;
- desired-state notifications exist for the synthetic scoped order;
- staging edge-agent dry-run succeeds;
- controlled apply succeeds or fails closed with a redacted reason;
- fresh applied receipts exist when apply succeeds;
- subscription render proof includes the synthetic node channels only after
  matching receipts;
- unrelated synthetic orders are not unlocked by scoped receipts;
- usage/lifecycle smoke records only redacted aggregate conclusions;
- no live order, production customer data, production secrets, DNS, Nginx,
  security group, Vultr, Aliyun, or provider mutation occurs.

## Rollback

Rollback must restore:

- previous staging current symlink;
- protected staging env backup;
- staging control DB backup if touched;
- staging service metadata backup if touched;
- affected staging data-plane service state after config-test.

Rollback must not delete or dump production data, subscription material,
credentials, or SQLite rows.

## Exact Approval Template

Fill all placeholders after the candidate package is built and the local SHA-256
is recorded.

```text
批准执行 AWS staging control/data-plane integration validation:
release=<exact release>;
artifact=<local artifact path>;
archive_sha256=<exact sha256>;
target=AWS staging host 54.248.170.34 only;
instance_id=i-08aa4775a099c9a18;
region=ap-northeast-1;
security_group=sg-0927469a10053fa98;
current_release=<read-only inventory current staging release>;
scope=read-only inventory; backup current staging symlink/protected staging env/control DB/service metadata if present; upload verified artifact; verify remote sha; npm ci; switch staging current only after preflight; restart proxy-gateway-candidate.service only; install/update staging edge-agent if required; use synthetic staging account/order/node/material only; run first-boot registration packet validation; generate synthetic desired-state; run edge-agent dry-run/apply; config-test staging runtime adapters; restart only required approved staging runtime services after config-test; post redacted receipts; run receipt-gated render proof and usage/lifecycle smoke without subscription URL/token/YAML/credential output;
validation=artifact hash ok, remote sha ok, npm ci ok, service active, health 200, public Admin blocked, public internal route blocked, no-session portal APIs reject, internal control port loopback-only, synthetic node registration ok, protected material key/digest presence ok, desired-state notifications present, dry-run ok, controlled apply ok or fail-closed redacted, fresh applied receipts when apply succeeds, render proof gates synthetic node channels by matching receipts, unrelated synthetic orders unaffected, usage/lifecycle smoke redacted, no production/customer/secret/live-order mutation;
rollback=restore previous staging current symlink/protected staging env/control DB/service metadata backups and restart only affected approved staging services after config-test;
forbidden=DNS,Nginx config/reload,security group mutation,production Vultr/Aliyun mutation,customer data,production secrets,payment,public Admin,live production order creation,subscription URL/token/password/private-key/credential output,SQLite row dump,raw env/log/config output.
```

## Non-Goals

- No production promotion.
- No AWS image or AMI creation.
- No production order or customer account.
- No production protected material.
- No public Admin.
- No Cloudflare, DNS, Nginx, provider firewall, or security-group mutation.
- No quota auto-disable activation.
