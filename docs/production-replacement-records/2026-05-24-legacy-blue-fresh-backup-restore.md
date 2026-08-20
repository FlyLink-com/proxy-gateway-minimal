# Production Replacement: Legacy Blue Fresh Backup And prod-edge-a Restore


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: legacy_blue_fresh_backup_restore
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```


Date: 2026-05-24 16:52-17:09 +08:00

Branch: `ops/legacy-blue-fresh-backup-restore`

Runbooks and related records:

- `docs/PRODUCTION_REPLACEMENT.md`
- `docs/PRODUCTION_DR.md`
- `docs/production-replacement-records/2026-05-24-prod-edge-a-cutover-preflight.md`
- `docs/production-replacement-records/2026-05-24-node-to-legacy-blue-data-preflight.md`

Approval:

```text
1
```

The approval selected the data-refresh path:

```text
Temporarily approve a narrow SSH/security-group path only for fresh
legacy-blue SQLite backup and then restore to prod-edge-a.
```

## Scope

This record covers the approved data-refresh operation needed before a future
prod-edge-a cutover request.

Approved scope:

- Temporarily add `22/tcp` access to legacy blue from prod-edge-a only.
- Use local SSH `ProxyCommand` through prod-edge-a; do not copy SSH private keys
  to any server.
- Create and validate a fresh legacy-blue SQLite backup.
- Restore the fresh legacy-blue SQLite backup to prod-edge-a.
- Validate blue and prod-edge-a SQLite integrity and service health.
- Remove temporary security group access.
- Remove temporary SQLite transfer files.

This record does not authorize or perform:

- DNS changes
- Production traffic cutover
- HTTPS issuance
- Nginx mutation
- Production node-config change
- Tenant migration
- Green promotion
- Legacy blue shutdown or termination
- Public Admin UI exposure
- Secret, token, raw subscription URL, SQLite content, AWS credential, private
  key, or customer data disclosure in PRs, docs, chat, or logs

## Temporary SSH Window

Temporary security group rule added to legacy blue:

```text
Group: sg-04a165ec77f430ee8
Rule: 22/tcp from 13.215.156.159/32
Rule ID: sgr-00a430ea14f55d1fb
Purpose: prod-edge-a ProxyCommand access for fresh SQLite backup
```

The rule was revoked after the backup/restore validation:

```text
Revoked rule ID: sgr-00a430ea14f55d1fb
```

A second temporary cleanup-only window was opened to remove `/tmp` transfer
files from legacy blue:

```text
Group: sg-04a165ec77f430ee8
Rule: 22/tcp from 13.215.156.159/32
Rule ID: sgr-0947637c410e1484f
Purpose: remove temporary backup transfer files from legacy blue
```

The cleanup-only rule was also revoked:

```text
Revoked rule ID: sgr-0947637c410e1484f
```

Final legacy-blue security group state:

```text
22/tcp -> 36.163.181.255/32 only
80/tcp -> 0.0.0.0/0
18388/tcp -> 0.0.0.0/0
18388/udp -> 0.0.0.0/0
443/tcp -> 0.0.0.0/0
No prod-edge-a SSH rule remains
```

## Legacy Blue Pre-Backup Checks

Legacy blue was reached through prod-edge-a using local SSH `ProxyCommand`.
Private keys stayed on the local workstation.

Initial read-only check:

```text
hostname -> ip-172-31-26-232
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
SQLite integrity_check -> ok
subscription_tenants count -> 2
subscription_tenants max(updated_at) -> 2026-05-22T15:32:23.326Z
```

During the first backup attempt, an incorrect SQLite CLI backup invocation
created an invalid zero-byte active database file on legacy blue. The operation
was stopped, existing backups were inspected, and the latest valid backup was
used to repair legacy blue before continuing.

Existing legacy-blue backups inspected:

```text
/opt/proxy-gateway-minimal/data/backups/subscriptions-20260522T160153Z.sqlite
  integrity_check -> ok
  subscription_tenants count -> 2
  max(updated_at) -> 2026-05-22T15:32:23.326Z

/opt/proxy-gateway-minimal/data/backups/subscriptions-20260523T194918Z.sqlite
  integrity_check -> ok
  subscription_tenants count -> 2
  max(updated_at) -> 2026-05-23T15:45:00.918Z

/opt/proxy-gateway-minimal/.proxy-gateway/backups/subscriptions-20260523T194901Z.sqlite
  integrity_check -> ok
  subscription_tenants count -> 2
  max(updated_at) -> 2026-05-23T15:45:00.918Z
```

Legacy blue service user:

```text
proxy-gateway-console.service User=ubuntu Group=ubuntu
```

Legacy blue was repaired from the latest valid existing backup:

```text
source backup: /opt/proxy-gateway-minimal/data/backups/subscriptions-20260523T194918Z.sqlite
restored path: /opt/proxy-gateway-minimal/data/subscriptions.sqlite
owner/mode: ubuntu:ubuntu 600
proxy-gateway-console.service -> restarted
SQLite integrity_check -> ok
subscription_tenants count -> 2
max(updated_at) -> 2026-05-23T15:45:00.918Z
```

This was a corrective restore of legacy blue after the failed backup attempt.

## Fresh Backup Created From Repaired Legacy Blue

Fresh backup command form:

```text
.backup main /tmp/legacy-blue-subscriptions-20260524T091000Z.sqlite
```

Fresh backup validation:

```text
file size -> 53248
owner/mode -> ubuntu:ubuntu 600
SQLite integrity_check -> ok
subscription_tenants count -> 2
max(updated_at) -> 2026-05-23T15:45:00.918Z
```

The fresh backup was copied through the local workstation to prod-edge-a for
restore. The local workstation was a temporary transfer hop only.

## prod-edge-a Restore

prod-edge-a actual subscription database path:

```text
SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite
```

prod-edge-a service user:

```text
proxy-gateway-console.service User=proxy-gateway Group=proxy-gateway
```

Restore steps:

```text
proxy-gateway-console.service -> stopped
existing prod-edge-a DB copied to temporary rollback file under /tmp
fresh legacy-blue backup installed to .proxy-gateway/subscriptions.sqlite
owner/mode -> proxy-gateway:proxy-gateway 600
stale WAL/SHM files removed
proxy-gateway-console.service -> started
```

Post-restore prod-edge-a validation:

```text
proxy-gateway-console.service -> active
proxy-gateway-ss.service -> active
nginx -> active
NRestarts -> 0 for all three units during final check
SQLite integrity_check -> ok
subscription_tenants count -> 2
max(updated_at) -> 2026-05-23T15:45:00.918Z
public /api/health -> 200
public /api/admin/subscriptions -> 404
public /sub/clash.yaml without token -> 401
public / -> 404
13.215.156.159:18388 TCP -> reachable
```

## Legacy Blue Post-Window Check

After the SSH window was closed, prod-edge-a could still reach legacy blue
public service paths:

```text
http://47.129.247.102/api/health -> 200
http://47.129.247.102/sub/clash.yaml without token -> 401
47.129.247.102:18388 TCP -> reachable
```

DNS remained unchanged:

```text
sub.globalcirclecat.com -> 47.129.247.102 TTL 600
ss-sg.globalcirclecat.com -> 47.129.247.102 TTL 600
```

## Cleanup

Removed temporary files:

```text
legacy blue:
  /tmp/legacy-blue-subscriptions-20260524T090000Z.sqlite
  /tmp/legacy-blue-subscriptions-20260524T091000Z.sqlite

prod-edge-a:
  /tmp/legacy-blue-subscriptions-20260524T091000Z.sqlite
  /tmp/prod-edge-a-before-blue-restore-20260524T091000Z.sqlite

local workstation:
  C:\tmp\legacy-blue-subscriptions-20260524T091000Z.sqlite
```

No temporary SQLite transfer file is intentionally retained from this operation.

## Current Data Authority

After this operation:

```text
legacy blue active DB -> restored from latest valid existing backup, then used
  to create fresh backup
prod-edge-a active DB -> restored from that fresh legacy-blue backup
green DB -> not changed by this operation
```

The prod-edge-a active DB now matches the fresh backup created from repaired
legacy blue:

```text
SQLite integrity_check -> ok
subscription_tenants count -> 2
max(updated_at) -> 2026-05-23T15:45:00.918Z
```

## Remaining Gate

Ready after this operation:

```text
prod-edge-a has fresh legacy-blue-derived SQLite data.
prod-edge-a service health and public boundary are valid.
Temporary SSH access was removed.
Transfer files were removed.
```

Still not authorized:

```text
DNS cutover
production node-config migration
Subscription V2 production activation
tenant migration
green cleanup
legacy blue retirement
```

Recommended next task:

```text
Risk: A / production activation plan
Goal: activate prod-edge-a as replacement target and enable Subscription V2
      production output through approved DNS/runtime config gates.
```

## Conclusion

The fresh-data blocker for prod-edge-a has been resolved. prod-edge-a now has a
fresh legacy-blue-derived SQLite database, validated service health, and valid
public boundary behavior. No traffic cutover occurred.

The next decision is not another data preflight. It is whether to approve a
separate prod-edge-a production activation plan covering DNS/runtime config,
Subscription V2 production output, validation, rollback, and monitoring.
