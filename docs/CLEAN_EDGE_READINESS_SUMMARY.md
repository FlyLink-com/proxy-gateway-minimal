# Clean Edge Readiness Summary

Date: 2026-05-27, Asia/Shanghai.

## Purpose

`platform:clean-edge-readiness-summary` converts operator-provided clean edge
gate facts into a redacted readiness summary before any exact-approved clean
edge data-plane rebuild execution.

It is a repository-local helper only. It does not query Aliyun, AWS, DNS,
Nginx, systemd, SQLite, tenants, artifacts, or edge nodes. It does not create a
host, select a host, bootstrap a host, inject secrets, change DNS, change
subscription output, expose Admin, start traffic, or submit approval.

## Command

```bash
npm run platform:clean-edge-readiness-summary -- safe-clean-edge-input.json
```

## Protected Admin Review

The same summary can be reviewed through the protected Admin platform API:

```text
POST /api/admin/platform/clean-edge-readiness-summary
```

Admin Overview also exposes a `Clean edge readiness` review panel for the same
safe packet shape. This surface is private Admin-only and remains review-only:
it does not submit approval phrases, expose approval text, create hosts, select
targets, bootstrap hosts, inject secrets, change DNS, change subscription
output, expose public Admin, mutate AWS/Aliyun, or move traffic.

The input file must contain safe booleans and optional safe notes only. Do not
include raw hosts, IPs, ports, URLs, tokens, secrets, credentials, customer
data, SQLite rows, YAML payloads, private keys, or exact management-source
values.

## Safe Input Shape

```json
{
  "generatedAt": "2026-05-27T21:40:00.000Z",
  "repoState": {
    "branchSynced": true,
    "noOpenPrs": true,
    "projectStateCheckPassed": true
  },
  "subscriptionBoundary": {
    "subOnAliyun": true,
    "healthOk": true,
    "adminBlocked": true,
    "rootBlocked": true,
    "noTokenRejected": true
  },
  "edgeDns": {
    "ssSgUnchangedOnOldAws": true
  },
  "stoppedNodes": {
    "prodEdgeAStopped": true,
    "prodEdgeANoPublicIp": true,
    "prodEdgeBStopped": true,
    "prodEdgeBNoPublicIp": true
  },
  "cleanTarget": {
    "noTargetSelected": true,
    "noTargetProvisioned": true
  },
  "approval": {
    "exactApprovalReceived": false
  },
  "notes": ["summary only"]
}
```

## Output Semantics

The helper returns:

```text
readiness.preconditionsReady:
  true only when repo state, public boundary, old-edge posture, stopped-node
  posture, and clean-target non-selection/non-provisioning all pass.

readiness.approvalRequired:
  true when the exact clean edge rebuild approval has not been received.

readiness.executionAllowed:
  true only when preconditionsReady is true and exactApprovalReceived is true.

readiness.blockers:
  safe, non-secret strings describing missing evidence.
```

Even when `executionAllowed` is true, this helper is not an executor. It is only
an evidence normalizer for the Production Operations Agent and Project
Gatekeeper before they follow the clean edge runbook.

## Safety

The helper rejects unsupported fields and note values that look like raw hosts,
IP addresses, URLs, tokens, secrets, credentials, customer data, or subscription
paths. Error messages are generic and do not echo unsafe values.

The output explicitly records:

```text
summaryOnly: true
noRuntimeMutation: true
noProductionMutation: true
noCloudMutation: true
noDnsMutation: true
noSubscriptionOutputMutation: true
noSecretHandling: true
```

## Related Records

```text
docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md
docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-preflight.md
docs/production-replacement-records/2026-05-27-clean-edge-rebuild-execution-handoff.md
docs/production-replacement-records/2026-05-27-post-226-clean-edge-live-check.md
```
