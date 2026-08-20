# Clean Edge Node Rebuild Execution Record


```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: clean_edge_node_rebuild_execution_template
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


Date: YYYY-MM-DD, Asia/Shanghai.

## Status

```text
Type: Risk A execution record
Gate: clean edge data-plane rebuild
Execution state:
Production impact:
Cloud/provider impact:
DNS impact:
Subscription-output impact:
Edge traffic impact:
Public Admin impact:
```

## Agent / Task Routing

```text
Lead agent:
Primary unit: Production Operations / Edge Data Plane
Supporting units:
  Aliyun Subscription Control Platform
  Subscription Access Control
  Validation / CI
  Operator Lab
Follow-up owner:
Follow-up suitability:
```

## Approval

Exact operator approval phrase:

```text
Approve clean edge data-plane rebuild execution. Allow clean edge host provisioning, repo bootstrap, secret injection, and private edge validation only. No DNS change, no subscription output change, no user traffic, no public Admin, no AWS rollback-start, no stopped-node termination, and no security-group deletion.
```

## Scope

Allowed:

```text
clean edge host provisioning or assignment
provider firewall rules required for management and private validation
repo checkout/bootstrap from reviewed materials
edge-only secret injection without recording values
private validation of app, Nginx, systemd, and edge listener behavior
safe aggregate evidence recording
```

Not allowed:

```text
DNS change
subscription output change
user traffic
public Admin
AWS rollback-start
stopped-node termination
security-group deletion
historical state copy
raw secret / token / subscription URL / YAML / key / credential / customer data recording
```

## Fresh Preflight Evidence

Repository:

```text
git status:
latest master commit:
open PRs:
```

Aliyun subscription boundary:

```text
sub DNS:
public /api/health:
public Admin path:
public no-token subscription path:
```

Edge DNS and output:

```text
ss-sg DNS:
subscription output safe summary:
```

Stopped AWS nodes:

```text
prod-edge-a state:
prod-edge-b state:
public IP association:
security groups retained:
rollback-start status:
```

Clean edge target:

```text
provider:
region:
instance id:
public IP:
private IP:
OS image:
management source posture:
pre-existing data check:
```

Repo material check:

```text
ops/edge-node/bootstrap.sh:
systemd templates:
Nginx template:
runtime templates:
```

## Execution

Provision / assignment:

```text
result:
safe provider summary:
```

Provider firewall:

```text
management rule summary:
private validation rule summary:
public exposure summary:
```

Bootstrap:

```text
repo path:
repo commit:
Node version:
npm version:
bootstrap command:
bootstrap result:
```

Runtime config:

```text
.env created from template:
ss-server config created from template:
proxy-servers config created from template:
secret injection method:
secret values recorded: no
```

Service activation for private validation:

```text
proxy-gateway-console:
proxy-gateway-ss:
nginx:
```

## Post-Rebuild Validation

Local host:

```text
nginx -t:
systemctl summary:
ss listener summary:
curl http://127.0.0.1:3456/api/health:
curl local public-boundary /api/health:
local Admin path behavior:
local no-token subscription behavior:
```

Operator / HP vantage:

```text
management TCP/22:
edge listener TCP/UDP:
public 3456:
public 18080:
public Admin:
```

DNS and subscription output:

```text
sub DNS unchanged:
ss-sg DNS unchanged:
subscription output unchanged:
```

Data and secret audit:

```text
historical SQLite copied:
customer data copied:
raw subscription URLs recorded:
tokens/passwords/private keys recorded:
exact management-source IPs recorded:
```

## Result

```text
gate result:
candidate accepted for next gate:
next required gate:
```

## Rollback / Stop Evidence

If rollback or stop actions were needed:

```text
services stopped:
temporary firewall rules removed:
DNS unchanged:
subscription output unchanged:
stopped AWS nodes unchanged:
candidate host retained or cleanup gate required:
```

## Not Performed

```text
DNS change:
subscription output change:
user traffic:
public Admin:
AWS rollback-start:
stopped-node termination:
security-group deletion:
historical state copy:
raw secret/token/subscription URL/YAML/key/credential/customer data recording:
```
