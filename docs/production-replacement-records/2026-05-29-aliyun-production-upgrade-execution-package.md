# Aliyun Production Upgrade Execution Package

Date: 2026-05-29, Asia/Shanghai.

Risk: A / production subscription-control deployment package.

Repository scope: docs-only execution package.

Actual production scope performed by this package: none.

## Approval Received

```text
Approve PR #275 review and merge, then prepare Aliyun production upgrade execution package. No production mutation.
```

This approval authorized:

```text
review PR #275
merge PR #275 if validation passed
prepare this no-mutation execution package
```

It did not authorize:

```text
deploy to Aliyun
restart proxy-gateway-candidate
change Nginx
reload Nginx
change DNS
change provider firewall or UFW
mutate SQLite rows
change subscription output
broaden TUIC rollout
retire legacy query-token access
issue broader artifacts
clean up channel-lab-b
```

## Current Evidence

Repository:

```text
PR #275: merged
Merge commit: e5473af92ede5c764b637a369e77828103b0bbf6
Capability added: provider artifact routes
```

PR #275 validation before merge:

```text
node --test server/tests/admin-subscriptions.test.mjs server/tests/clash-subscription.test.mjs server/tests/subscription-service.test.mjs server/tests/subscription-architecture-contract.test.mjs
  63/63 passed

npm test
  401/401 passed

npm run project-state:check
  passed

git diff --check origin/master...HEAD
  passed
```

Aliyun read-only preflight evidence before this package:

```text
current release: /opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
current release commit: da33de295cb0
proxy-gateway-candidate: active
nginx: active
nginx -t: ok
loopback app health: 200
SQLite integrity_check: ok
active tenants: 4
disabled tenants: 1
active artifacts: 4
tenant node counts:
  channel-lab-b-tuic: 4
  prod-edge-a: 1 disabled
```

Authoritative public DNS evidence from DoH:

```text
sub.globalcirclecat.com -> 47.251.178.125
ss-sg.globalcirclecat.com -> 13.215.156.159
```

Public boundary evidence:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
/ -> 200 public site
```

Runtime config evidence:

```text
current Aliyun runtime config includes:
  prod-edge-a / ss
  prod-edge-b / ss
  channel-lab-b-tuic / tuic
```

Channel-lab-b read-only evidence:

```text
AWS ap-northeast-1 channel-lab-b: running / status ok
mihomo-tuic.service: active
NRestarts: 0
UDP/443 listener: active
recent TUIC journal: timeout warnings present
```

## Upgrade Goal

Deploy a new Aliyun subscription-control release that includes:

```text
provider-mode renderer from PR #273
provider artifact routes from PR #275
```

Expected new repository route capabilities after deployment:

```text
/sub/a/<artifact>.yaml
  existing direct artifact YAML path, compatibility retained

/sub/a/<artifact>/profile.yaml
  provider-mode outer Clash/Mihomo profile

/sub/a/<artifact>/provider.yaml
  provider node-pool YAML
```

The provider profile must not inline node credentials. The provider YAML
contains active node connection material by design and must remain protected by
opaque artifact access and Nginx log-redaction rules.

## Required Stop Conditions

Stop before deployment if any of these are true:

```text
origin/master does not contain e5473af92ede5c764b637a369e77828103b0bbf6
Aliyun current service is not active
Aliyun loopback /api/health is not 200
nginx -t fails
SQLite integrity_check is not ok
PUBLIC_SUBSCRIPTION_BASE_URL is missing or not https
current release symlink cannot be recorded
SQLite backup cannot be created and verified
channel-lab-b runtime is inactive
channel-lab-b has fatal/panic service evidence
provider route validation would require recording raw artifact secrets
```

Stop after deployment if any of these are true:

```text
proxy-gateway-candidate fails to restart
loopback /api/health is not 200
public /api/health is not 200
public /api/admin/subscriptions is not 404
public /sub/clash.yaml without token is not 401
direct artifact refresh compatibility fails for the controlled test access
provider profile route fails for the controlled test access
provider node-pool route fails for the controlled test access
provider profile inlines node credentials
provider route accepts query-token fallback
Nginx access-log token/query redaction checks fail
SQLite integrity_check stops being ok
```

## Future Exact Approval Phrase

The next production mutation gate must use this exact phrase:

```text
Approve Aliyun production upgrade execution for provider artifact routes. Deploy current master to Aliyun subscription-control, restart proxy-gateway-candidate, validate provider artifact routes, no DNS change, no Nginx reload, no firewall change, no SQLite row mutation, no all-user rollout.
```

Short confirmations such as `同意`, `继续`, `开始`, or `可以` are not enough for
this gate.

## Execution Plan For The Future Gate

These steps are intentionally not executed by this package.

1. Refresh source facts:

   ```text
   verify origin/master commit
   verify PR #275 merge commit is an ancestor of origin/master
   verify Aliyun current release symlink
   verify proxy-gateway-candidate and nginx active
   verify SQLite integrity_check ok
   verify channel-lab-b service active
   ```

2. Create rollback material:

   ```text
   record previous current symlink target
   create a timestamped SQLite backup
   verify backup file exists and is non-empty
   record current release directory name
   record current service status summary
   ```

   Do not copy or record:

   ```text
   .env values
   raw tokens
   raw artifact secrets
   raw subscription URLs
   node credentials
   SQLite row contents
   customer data
   raw access logs
   ```

3. Stage the new release:

   ```text
   create a new release directory named after the target commit
   install production dependencies using the existing deployment method
   preserve the existing external state directory and EnvironmentFile
   do not modify Nginx
   do not modify provider firewall or UFW
   do not modify DNS
   ```

4. Switch the release and restart only the app service:

   ```text
   update /opt/proxy-gateway-minimal-candidate/current to the new release
   restart proxy-gateway-candidate
   do not restart or reload nginx
   do not restart channel-lab-b
   ```

5. Validate private behavior:

   ```text
   systemctl is-active proxy-gateway-candidate
   loopback /api/health -> 200
   SQLite integrity_check -> ok
   direct controlled artifact refresh -> 200
   controlled provider profile route -> 200
   controlled provider node-pool route -> 200
   provider profile contains proxy-providers and no inline credentials
   provider route does not accept query-token fallback
   ```

6. Validate public boundary:

   ```text
   public /api/health -> 200
   public /api/admin/subscriptions -> 404
   public /sub/clash.yaml without token -> 401
   public root site remains expected
   ```

7. Validate logging safety:

   ```text
   nginx -T contains no active access log format using $request_uri
   active access log token/query count summary remains safe
   raw log lines are not copied into the record
   ```

## Rollback Plan

If validation fails after switching the release:

```text
restore /opt/proxy-gateway-minimal-candidate/current to the previous release
restart proxy-gateway-candidate
validate loopback /api/health -> 200
validate public /api/health -> 200
validate public Admin remains 404
validate no-token subscription remains 401
validate SQLite integrity_check -> ok
```

SQLite backup restore is not the default rollback action for a code-only release
switch. Use the SQLite backup only if a later approved operation performs a
schema or row mutation and validation proves rollback requires state restore.

## Runtime Config Cleanup Is Separate

This package does not authorize removing or changing configured nodes.

The current runtime config still includes terminated historical SS nodes:

```text
prod-edge-a / ss
prod-edge-b / ss
```

Cleaning those entries may change default subscription output semantics. It
must be handled as a separate A-tier gate after the code deployment is stable.

Recommended later approval phrase:

```text
Approve Aliyun runtime subscription-output config cleanup. Remove terminated prod-edge-a/prod-edge-b from the Aliyun runtime config after backup and validation, keep channel-lab-b-tuic controlled scope, no DNS change, no Nginx reload, no firewall change, no all-user rollout.
```

## Not Performed

```text
no Aliyun deployment
no service restart
no Nginx reload
no Nginx config change
no DNS change
no provider firewall or UFW change
no SQLite row mutation
no artifact issuance
no legacy query-token retirement
no all-user rollout
no channel-lab-b runtime mutation or cleanup
no raw secrets, tokens, artifact URLs, subscription URLs, YAML, SQLite rows, or customer data recorded
```

## Package Conclusion

```text
PR #275: merged into master
Provider artifact route repo capability: ready for deployment gate
Aliyun production deployment: not performed
Runtime config cleanup: not performed
Next required gate: exact Aliyun production upgrade execution approval
```
