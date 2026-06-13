# AWS Staging Gate 11 Lifecycle Usage Integration Proof

Date: 2026-06-08, Asia/Shanghai.

Risk tier: A.

Target: AWS production-like staging host only.

Production impact: none. No Vultr production, Aliyun, DNS, Nginx, payment,
customer data, production secrets, public Admin, live production subscription
issuance, subscription URL/token/password output, SQLite row dump, raw runtime
config, or raw logs were changed or disclosed.

## Approval

The operator approved Gate 11 with:

- release: `lifecycle-usage-gate11-20260608-002`
- archive SHA256:
  `693C897258ECE74EBE2BAEEE1735ED86437C4FEB791FE73519AB9019F648E64B`
- target host: `54.248.170.34`
- target instance: `i-08aa4775a099c9a18`
- target security group: `sg-0927469a10053fa98`
- temporary SSH source: `63.88.218.78/32`

An earlier local artifact for `lifecycle-usage-gate11-20260608-001` was
discarded before deployment because package hygiene checks found local hidden
configuration paths in the archive. The temporary SSH ingress opened for that
discarded artifact was revoked before the replacement artifact was prepared.

## Execution Summary

1. Rebuilt the staging artifact as `lifecycle-usage-gate11-20260608-002`.
2. Verified the local archive did not contain `.git`, `.codex`, `.claude`,
   `.codex-artifacts`, `node_modules`, local settings files, SQLite/DB files,
   or logs.
3. Added temporary SSH ingress for the approved operator source only.
4. Verified SSH access to the AWS staging host.
5. Uploaded the approved artifact to the staging host.
6. Verified the uploaded artifact SHA256 on the host.
7. Backed up the current staging runtime symlink and protected staging
   environment directory.
8. Unpacked the approved artifact into the candidate release directory.
9. Ran `npm ci --omit=dev --no-audit --no-fund` on the staging host.
10. Switched the staging `current` symlink to the approved release.
11. Restarted only `proxy-gateway-candidate.service`.
12. Validated public staging boundaries.
13. Ran a synthetic-only lifecycle fan-out and usage-ledger mapping proof.
14. Removed temporary proof files and the uploaded archive from `/tmp`.
15. Removed temporary SSH ingress and confirmed the current operator source no
    longer had SSH access.

Protected backup reference:

```text
gate11-lifecycle-usage-gate11-20260608-002-20260607T175409Z
```

## Validation Results

Passed:

- artifact SHA256 matched the approved SHA256;
- `npm ci` completed on the staging host;
- `proxy-gateway-candidate.service` restarted successfully and remained
  active;
- public `/api/health` returned HTTP 200;
- public Admin path remained blocked with HTTP 404;
- no-session portal order API returned HTTP 401;
- temporary SSH ingress for `63.88.218.78/32` was removed;
- SSH from the current operator source failed after cleanup.

## Synthetic Proof Result

Redacted proof conclusion:

```json
{
  "ok": true,
  "lifecycleFanout": {
    "delivered": true,
    "adapterCount": 3,
    "adapters": [
      "xray",
      "hysteria",
      "mihomo"
    ],
    "xrayConfigWritten": true,
    "hy2ConfigWritten": true,
    "tuicConfigWritten": true
  },
  "usageAccounting": {
    "ok": true,
    "observationCount": 1,
    "recordedCount": 1,
    "insertedCount": 1,
    "unresolvedCount": 0,
    "totalBytes": 640,
    "channelRef": "channel-gate11-hy2",
    "quotaDisableRequiredCount": 0
  },
  "sensitiveOutputSuppressed": true
}
```

Interpretation:

- the latest staging runtime can wire multi-channel lifecycle fan-out through
  three runtime adapter surfaces;
- runtime usage observations can be recorded into the control ledger and mapped
  to an order-scoped `edgeCredentialRef`;
- the proof used synthetic temp files, synthetic credentials, and synthetic
  traffic observations only;
- production promotion still requires a separate Vultr production approval.

## Boundary

This gate proves the latest code path in AWS staging. It does not authorize:

- Vultr production rollout;
- Aliyun mutation;
- DNS or Nginx changes;
- live order creation;
- payment changes;
- public Admin exposure;
- quota auto-disable enablement in production.

## Follow-Up

The next production gate should package the validated release for Vultr and
repeat the same boundary discipline: read-only inventory, exact artifact hash,
backup, deployment, health checks, no-session rejection, subscription render
smoke without leaking URLs, and a redacted lifecycle/usage proof before enabling
any quota-driven runtime disable behavior.
