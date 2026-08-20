# AWS Staging Gate 7 Runtime Usage Collector Proof


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aws_staging_gate7_runtime_usage_proof
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


Date: 2026-06-06

Risk tier: A

Target: AWS production-like staging host only.

Production impact: none. No Vultr production, Aliyun, DNS, Nginx, payment,
customer data, production secrets, public Admin, or live production
subscription mutation was performed.

## Approval

The operator approved Gate 7 with:

- release: `5a57ee40c08e`
- archive SHA256:
  `11F8D19F9B5781E47B7BC912CD2687885D352B812473FE62E3A4FB2E370F6B6D`
- target instance: `i-08aa4775a099c9a18`
- target security group: `sg-0927469a10053fa98`
- temporary SSH source: `63.88.218.78/32`

Forbidden outputs remained forbidden: subscription URLs, tokens, passwords, raw
controller payloads, raw YAML, raw SQLite rows, raw environment values, raw
logs, and raw runtime configuration.

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
10. Backed up the protected staging environment and Mihomo config.
11. Enabled a Mihomo external-controller metrics surface bound to loopback only.
12. Ran Mihomo config-test successfully.
13. Restarted `mihomo-tuic.service` and `proxy-gateway-candidate.service`.
14. Validated service, listener, controller, and public boundary state.
15. Ran the redacted runtime usage proof.
16. Removed temporary proof files and the uploaded artifact from `/tmp`.
17. Removed the temporary SSH ingress rule.

The protected backup reference for this gate is:

```text
20260606T180242Z
```

## Validation Results

Passed:

- artifact SHA256 matched the approved SHA256;
- `npm ci` completed on the staging host;
- `proxy-gateway-candidate.service` was active after restart;
- `mihomo-tuic.service` was active after restart;
- UDP 443 listener was present;
- controller listener was loopback-only;
- controller public exposure check was blocked;
- public `/api/health` returned HTTP 200;
- public Admin path remained blocked with HTTP 404;
- no-session portal order API returned HTTP 401;
- temporary SSH ingress was removed after validation;
- current operator source could no longer SSH to the staging host after cleanup.

## Runtime Usage Proof

Redacted proof conclusion:

```json
{
  "ok": false,
  "controllerLoopbackOnly": true,
  "collectorStatus": "collector_not_supported",
  "observationCount": 0,
  "mappedObservationCount": 0,
  "aggregateOnlyBlocked": true,
  "usageLedgerRecorded": false,
  "quotaDecision": null,
  "blockers": [
    "node_aggregate_only"
  ],
  "sensitiveOutputSuppressed": true
}
```

Interpretation:

- the loopback-only runtime metrics surface is reachable from the host;
- the current Mihomo metrics surface does not emit per-credential usage entries
  that can map to `edgeCredentialRef`;
- the collector correctly fails closed instead of treating node aggregate or
  connection-level counters as per-order usage;
- quota-driven disable or revoke remains blocked.

## Boundary

This gate proves that the current AWS staging runtime can expose a safe
loopback-only controller surface, but does not prove per-order traffic
metering.

It also proves the current fail-closed behavior:

```text
runtime aggregate / connection-level metric
  -> no edgeCredentialRef observation
  -> collector_not_supported
  -> no usage ledger write
  -> no quota disable/revoke
```

## Follow-Up

Do not enable quota-driven runtime disable/revoke on this Mihomo TUIC path until
one of these is true:

- the runtime exposes real per-credential usage counters; or
- a different protocol/runtime is selected whose metrics surface can reliably
  map traffic to order-scoped credentials; or
- an explicit sidecar/gateway accounting layer is introduced and separately
  proven in staging.

Candidate next investigations:

- Hysteria2 runtime usage surfaces;
- VLESS/XUDP runtime usage surfaces;
- a lightweight edge gateway/sidecar that owns credential lifecycle and byte
  accounting before forwarding traffic to the runtime.
