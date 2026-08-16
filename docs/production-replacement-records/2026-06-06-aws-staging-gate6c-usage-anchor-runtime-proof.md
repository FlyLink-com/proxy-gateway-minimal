# AWS Staging Gate 6C Usage Anchor Runtime Proof


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aws_staging_gate6c_usage_anchor_runtime_proof
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


Date: 2026-06-06

Risk tier: A

Target: AWS production-like staging host only.

Production impact: none. No Vultr, Aliyun, DNS, Nginx, payment, customer data,
production secrets, public Admin, live subscription issuance, or production
traffic mutation was performed.

## Approval

The operator approved Gate 6C with:

- release: `cda86bb18d16-usage-anchor-20260606-001`
- archive SHA256:
  `40DB77C95F98FEF1D079FF791BB38E7C5BF3280F2F14B76A095FE6D29D928254`
- target instance: `i-08aa4775a099c9a18`
- target security group: `sg-0927469a10053fa98`
- temporary SSH source: `63.88.218.78/32`

Forbidden outputs remained forbidden: subscription URLs, tokens, passwords,
raw YAML, raw SQLite rows, raw environment values, raw logs, and raw runtime
configuration.

## Execution Summary

1. Verified the local artifact SHA256 matched the approved SHA256.
2. Confirmed the staging instance was running and attached to the approved
   security group.
3. Added temporary SSH ingress for the approved operator source only.
4. Uploaded the approved artifact to the staging host.
5. Verified the uploaded artifact SHA256 on the host.
6. Unpacked the artifact into the candidate release directory.
7. Ran `npm ci` on the staging host.
8. Switched the staging `current` symlink to the approved release.
9. Restarted `proxy-gateway-candidate.service`.
10. Ran redacted HTTP boundary checks.
11. Ran a synthetic usage-anchor proof.
12. Removed temporary staging artifacts from `/tmp`.
13. Removed the temporary SSH ingress rule.

## Validation Results

Passed:

- `proxy-gateway-candidate.service` active after restart.
- Public `/api/health` returned HTTP 200.
- Public Admin path remained blocked with HTTP 404.
- No-session portal order APIs returned HTTP 401.
- Temporary SSH ingress was removed after validation.
- Current operator source could no longer SSH to the staging host after
  cleanup.

Synthetic usage-anchor proof passed:

- synthetic order delivery succeeded;
- opaque artifact resolution succeeded;
- rendered subscription output used the order-scoped runtime credential;
- static template credential material was suppressed;
- a synthetic usage observation mapped to the same `edgeCredentialRef`;
- usage rollup was recorded;
- direct runtime mutation remained disabled;
- no raw subscription URL, token, password, YAML, SQLite row, environment value,
  log, or runtime config was output.

## Boundary

This gate proves the control-plane and subscription-output identity chain:

```text
synthetic order
  -> edgeCredentialRef
  -> protected runtime credential material
  -> rendered per-order subscription credential
  -> synthetic usage observation
  -> usage ledger rollup
```

It does not prove real data-plane traffic metering. The next gate must still
prove that the selected runtime can expose real per-credential usage
observations that map to `edgeCredentialRef`.

## Follow-Up

The next phase remains blocked on runtime capability:

- prove a real runtime usage source at per-credential granularity; or
- select a runtime/protocol whose metrics surface can reliably map traffic to
  the order-scoped credential; and
- only then consider quota-driven disable/revoke through the controlled edge
  reconciliation gate.
