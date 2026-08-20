# AWS Production-Like Staging Gate 5 Restart Permission Success


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aws_production_like_staging_gate5_restart_permission_success
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


Date: 2026-06-06 Asia/Shanghai

## Scope

Approved target:

- AWS staging host only: `54.248.170.34`
- Instance: `i-08aa4775a099c9a18`
- Security group: `sg-0927469a10053fa98`
- Release: `bdc95d46ae4d`

Approved purpose:

- temporarily allow SSH from the current operator source
- install a restricted systemd/polkit permission so
  `proxy-gateway-candidate` can restart only `mihomo-tuic.service`
- rerun staging-only synthetic portal order validation
- remove the temporary SSH ingress after validation/cleanup

Forbidden changes remained in force:

- no Vultr production mutation
- no Aliyun mutation
- no DNS mutation
- no Nginx mutation
- no customer data
- no production secrets
- no payment changes
- no public Admin
- no subscription URL, token, password, raw env, raw config, raw log, or SQLite row output

## Temporary SSH Source

Mutation performed:

```text
temporary SSH ingress added: TCP 22 from 63.88.218.78/32
temporary SSH ingress removed after validation: yes
final SSH source list: 45.76.222.52/32
```

Boundary validation:

```text
SSH after temporary ingress: ok
public /api/health: 200
public /api/admin/platform/health: 404
```

## Restart Permission

Installed host-side permission:

```text
permission mechanism: polkit rule
subject user: proxy-gateway-candidate
allowed unit: mihomo-tuic.service
allowed verb: restart
polkit service: active
```

Validation:

```text
restart as proxy-gateway-candidate: exit 0
mihomo-tuic.service: active
Mihomo config-test on active config: exit 0
UDP 443 listener: present
active config loaded by current Mihomo process: yes
```

The gate uses polkit instead of sudoers because the runtime adapter invokes
`systemctl restart mihomo-tuic.service` directly, without a `sudo` wrapper.

## Synthetic Order Validation

The validation created one staging-only synthetic portal account and one
staging-only 30-day order. The raw handoff file was used only on the host and
then removed with the temporary validation directory.

Safe result:

```text
human challenge status: 201
password login status: 200
session created: yes
order status: 201
order record status: delivered
order duration days: 30
order safety no raw handoff: true
```

Safe aggregate evidence after validation:

```text
portal access requests by status: delivered:1, pending_admin_review:2
issuance requests by status: issued:2
edge apply receipts by status: applied:1, failed:1
latest edge receipt: status=applied, configTest=1, serviceActive=1, listenerUdp443=1, add=2, unchanged=0
subscription tenants by status: active:2
subscription artifacts by status: active:2
mihomo-tuic.service: active
UDP 443 listener: present
active config loaded by current Mihomo process: yes
temporary validation handoff directory cleanup: ok
```

## Result

Gate 5 restart-permission validation succeeded on AWS staging.

The prior blocker was confirmed and resolved for staging: after granting a
restricted restart permission, the edge lifecycle apply step wrote the desired
TUIC runtime state, restarted Mihomo, and produced an `applied` edge receipt.

Remaining non-production context:

- this validates the permission/loading path on AWS staging only
- it does not mutate Vultr production
- it does not mutate Aliyun
- it does not perform DNS cutover
- it does not prove customer traffic behavior or production packet-loss recovery
