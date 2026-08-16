# Retired Shadowsocks Node Cloud Cleanup - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: retired_shadowsocks_node_cloud_cleanup
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

Operator direction:

```text
Directly clean the cloud-side production misleading retired-node state.
```

Allowed target:

- Aliyun candidate runtime only.
- Protected runtime `proxy-servers.json` and candidate `.env`.
- Restart `proxy-gateway-candidate.service` only.

Forbidden changes observed:

- no DNS mutation;
- no Nginx config mutation or reload;
- no firewall or provider security-group mutation;
- no public Admin enablement;
- no payment mutation;
- no account or password generation;
- no live order creation;
- no passkey enablement;
- no token, password, subscription URL, credential, raw YAML, raw env, or SQLite
  row output.

## Pre-Mutation Baseline

- `proxy-gateway-candidate.service`: active / running / result success.
- Candidate release: `6954d5d3300a`.
- Runtime env summary:
  - `USER_PORTAL_ROUTES_ENABLED=true`;
  - `USER_PORTAL_AUTO_ISSUANCE_ENABLED=true`;
  - auto-issuance target was `prod-edge-a`.
- Runtime node summary:

| Node label | Pool | Status | Protocol summary | Eligible posture |
| --- | --- | --- | --- | --- |
| `prod-edge-a` | stable | online | Shadowsocks | eligible |
| `prod-edge-b` | stable | online | Shadowsocks | eligible |

This baseline conflicted with the operator-confirmed lifecycle fact that these
historical Shadowsocks nodes are retired/obsolete and must not be used for
production issuance.

## Backup

Pre-mutation backup directory:

```text
/opt/proxy-gateway-minimal-candidate/backups/retired-node-cleanup-20260605T061600Z
```

Backed up before mutation:

- protected `config/proxy-servers.json`;
- protected candidate `.env`.

Backup file contents were not printed.

## First Mutation Applied

Runtime-only protected config changes:

| Node label | Before | After |
| --- | --- | --- |
| `prod-edge-a` | stable / online / Shadowsocks / eligible | recovery / disabled / maintenance / not eligible |
| `prod-edge-b` | stable / online / Shadowsocks / eligible | recovery / disabled / maintenance / not eligible |

Runtime env changes:

```text
USER_PORTAL_AUTO_ISSUANCE_ENABLED=false
USER_PORTAL_AUTO_ISSUANCE_NODE_ID=
```

The current release expects at least one named node in runtime config, so the
cleanup removed the retired nodes from the production-eligible path rather than
physically deleting every server record. Physical zero-node deletion remains a
follow-up code/runtime change that must first make startup fail closed.

## Physical Deletion Follow-Up

The operator clarified that disabling was insufficient and required physical
deletion of the two retired node records from cloud runtime config.

Additional preflight:

- Zero-node startup compatibility initially failed with:
  `At least one named proxy server is required`.
- A minimal runtime hotfix was applied to the active candidate release so
  `SubscriptionCore` allows `servers: []` and keeps subscription rendering
  fail-closed through normal node-unavailable checks.
- `node --check` passed for the patched subscription core file.
- A zero-node `SubscriptionCore` construction preflight passed after the
  hotfix.

Additional backup directory:

```text
/opt/proxy-gateway-minimal-candidate/backups/physical-retired-node-delete-20260605T062438Z
```

Backed up before physical deletion:

- active release `server/services/subscriptions/core.mjs`;
- protected `config/proxy-servers.json`;
- protected candidate `.env`.

Physical deletion result:

```text
removedRetiredNodes=2
remainingServers=0
```

## Restart

Only this service was restarted:

```text
proxy-gateway-candidate.service
```

Result:

- `proxy-gateway-candidate.service`: active / running / result success.
- `NRestarts=0`.
- Loopback health became ready after normal startup delay.

## Validation

Safe node summary after restart and physical deletion:

```text
serverCount=0
stableEligibleCount=0
```

Aggregate result:

```text
stableEligibleCount=0
USER_PORTAL_AUTO_ISSUANCE_ENABLED=false
USER_PORTAL_AUTO_ISSUANCE_NODE_ID=
```

Loopback validation:

- `/api/health`: HTTP 200.
- `/sub/clash.yaml` without token: HTTP 401.
- invalid empty portal order request: HTTP 400.
- invalid empty portal order refresh request: HTTP 400.
- invalid empty portal order disable request: HTTP 400.

Public boundary validation:

- `https://portal.globalcirclecat.com/`: HTTP 200.
- `https://portal.globalcirclecat.com/api/admin/overview`: HTTP 404.
- `https://sub.globalcirclecat.com/api/health`: HTTP 200.
- `https://sub.globalcirclecat.com/sub/clash.yaml` without token: HTTP 401.
- `nginx -t`: successful.

No live order was created during validation.

## Rollback

Rollback for the initial disable-only cleanup remains available from:

```text
/opt/proxy-gateway-minimal-candidate/backups/retired-node-cleanup-20260605T061600Z
```

Rollback for the physical deletion and zero-node startup hotfix remains
available from:

```text
/opt/proxy-gateway-minimal-candidate/backups/physical-retired-node-delete-20260605T062438Z
```

Rollback shape:

1. restore the backed-up subscription core file if reverting the zero-node
   startup hotfix;
2. restore the backed-up protected proxy server config;
3. restore the backed-up protected candidate env;
4. restart `proxy-gateway-candidate.service`;
5. validate health, public Admin blocking, no-token subscription rejection, and
   portal static availability.

Do not print backup file contents during rollback.

## Follow-Up

The cloud-side misleading production state has been physically removed from the
active cloud runtime node config. The active runtime is now a zero-node
fail-closed control plane with portal routes still enabled and automatic
issuance disabled.

The repository still needs a code-level guard so retired node labels cannot
become eligible again if a future runtime config is edited incorrectly. The
runtime hotfix should also be promoted into source control or replaced by an
equivalent reviewed implementation before the next clean release deployment.
