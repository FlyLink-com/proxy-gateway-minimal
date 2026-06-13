# AWS Staging Gate 8 Hysteria2 Per-Client Usage Proof

Date: 2026-06-06

Risk tier: A

Target: AWS production-like staging host only.

Production impact: none. No Vultr production, Aliyun, DNS, Nginx, payment,
customer data, production secrets, public Admin, or live production
subscription mutation was performed.

## Approval

The operator approved Gate 8 with:

- release: `3b73b2f63e31`
- archive SHA256:
  `1BD0E59FCF2B3ABF9E187BDEE060B4FF78AFCCA4288691F9B4A5B4668F53F477`
- target instance: `i-08aa4775a099c9a18`
- target security group: `sg-0927469a10053fa98`
- temporary SSH source: `63.88.218.78/32`
- Hysteria2 scope: staging-only runtime with loopback-only Traffic Stats API
- traffic scope: synthetic order and synthetic traffic only

Forbidden outputs remained forbidden: subscription URLs, tokens, passwords,
raw Traffic Stats API payloads, raw YAML, raw SQLite rows, raw environment
values, raw logs, and raw runtime configuration.

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
10. Backed up the protected staging environment and Hysteria2 proof paths.
11. Installed or validated the staging-only Hysteria2 runtime binary.
12. Wrote staging-only Hysteria2 server/client proof configuration.
13. Started `hysteria2-gate8.service`.
14. Validated the Hysteria2 UDP listener and loopback-only stats listener.
15. Seeded a synthetic control-plane order whose Hysteria2 client ID equals
    its synthetic `edgeCredentialRef`.
16. Generated synthetic traffic through the local Hysteria2 client.
17. Ran the redacted Hysteria2 usage proof script.
18. Removed the temporary SSH ingress rule.

## Validation Results

Passed:

- artifact SHA256 matched the approved SHA256;
- `npm ci` completed on the staging host;
- `proxy-gateway-candidate.service` was active after restart;
- `mihomo-tuic.service` remained active;
- `hysteria2-gate8.service` was active;
- Hysteria2 UDP proof listener was present;
- Hysteria2 Traffic Stats API listener was loopback-only;
- Hysteria2 Traffic Stats API public exposure check was blocked;
- public `/api/health` returned HTTP 200;
- public Admin path remained blocked with HTTP 404;
- no-session portal order API returned HTTP 401;
- synthetic order seeding completed without raw row output;
- synthetic traffic completed without exposing credentials;
- temporary SSH ingress was removed after validation.

Observed:

- The AWS staging root path returned HTTP 404. Gate 8 did not use root static
  content as an acceptance criterion.

## Runtime Usage Proof

Redacted proof conclusion:

```json
{
  "ok": true,
  "trafficStatsLoopbackOnly": true,
  "readClearMode": true,
  "collectorStatus": "collected",
  "accountingMode": "delta",
  "observationCount": 1,
  "mappedObservationCount": 1,
  "usageLedgerRecorded": true,
  "quotaDecision": "within_quota",
  "blockers": [],
  "sensitiveOutputSuppressed": true
}
```

Interpretation:

- Hysteria2 Traffic Stats API can expose client-ID keyed traffic counters.
- When the client ID is set equal to the order-scoped `edgeCredentialRef`, the
  collector can map runtime bytes to the correct control-plane binding.
- The traffic accounting service can record a usage ledger sample and rollup
  without exposing raw stats payloads or credential material.
- The quota decision is a control-plane conclusion only. This gate did not
  authorize runtime kick, disable, revoke, or production mutation.

## Boundary

This gate proves the per-credential usage-accounting model on AWS staging for
Hysteria2 with synthetic traffic.

It does not prove:

- production Vultr or Aliyun behavior;
- public Hysteria2 production rollout;
- customer traffic metering;
- quota-driven disable/revoke execution;
- payment or subscription commercial limits.

The result is materially different from Gate 7:

```text
Gate 7 Mihomo/TUIC metrics
  -> aggregate/connection-level only
  -> no edgeCredentialRef observation
  -> fail closed

Gate 8 Hysteria2 Traffic Stats API
  -> client-ID keyed counters
  -> edgeCredentialRef observation
  -> usage ledger sample recorded
```

## Follow-Up

The next implementation gate should design the production-safe lifecycle around
this proven anchor:

```text
order -> edgeCredentialRef -> runtime client ID -> usage sample -> quota
decision -> controlled disable/revoke gate
```

Before production use, add a separate gate for:

- Hysteria2 production config templating;
- per-order credential lifecycle;
- stats polling cadence and idempotent delta handling;
- quota threshold policy;
- controlled kick/disable/revoke workflow;
- user/admin panel usage display.
