# Aliyun Clean-Start Private Validation Execution Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_clean_start_private_validation_execution
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A execution record
Gate: Aliyun clean-start private validation
Execution state: passed
Production impact: none
Aliyun impact: candidate-only runtime refresh, private in-memory validation,
and loopback-only rendering checks
AWS impact: none
DNS impact: none
Traffic impact: none
```

This execution record follows:

```text
docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md
docs/production-replacement-records/2026-05-27-aliyun-next-a-tier-execution-packet.md
```

The first preflight found that the deployed Aliyun candidate runtime package did
not contain the repository clean-start package or protected route. The operator
then clarified that not-yet-online candidate-environment operations are
approved as test operations, while production-facing actions remain out of
scope. The candidate runtime was refreshed privately, the native dependency
issue was fixed, and the clean-start private validation passed.

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Subscription Control Platform
  Subscription Access Control
  Validation / CI
  Operator Lab
Reviewer: Sidecar Reviewer recommended before provider-firewall hardening
Follow-up owner: Production Operations Agent
```

## Approval

Exact approval phrase received for clean-start private validation:

```text
Approve Aliyun clean-start private validation. Allow candidate-only clean-start state initialization and private rendering checks on Aliyun. No DNS change, no public listener exposure, no public Admin, no edge traffic, no AWS mutation, and no historical state copy.
```

Operator clarification received after the initial runtime-drift block:

```text
Current Aliyun work is a not-yet-online test/candidate environment; not-yet-online
operations are approved as test operations and are not fixed production policy.
```

Approval source:

```text
operator messages in current Codex thread
```

Rejected as insufficient approval for production-facing actions:

```text
DNS change
public listener exposure
public Admin exposure
provider firewall mutation
AWS mutation
historical state copy
edge traffic
user traffic
production authority transfer
irreversible cloud resource deletion
```

## Scope

Allowed after approval and clarification:

```text
create candidate backup before validation
refresh the private candidate runtime package to current validated master
restart the candidate service on loopback-only posture
initialize candidate-only clean-start state
run protected clean-start readiness checks
run private subscription rendering dry-run checks
verify candidate SQLite integrity after validation
record rollback or cleanup decision
```

Not authorized and not performed:

```text
DNS change
public listener exposure
public Admin exposure
provider firewall mutation
AWS mutation
historical state copy
edge traffic
user traffic
public-boundary dry run
production authority transfer
irreversible cloud resource deletion
```

## Fresh Read-Only Preflight Evidence

Record only safe metadata.

```text
operator repo commit: da33de295cb02d1035419af59b1c52e9a3a51ce3
operator working-tree status: clean at branch creation; execution-record branch only
Aliyun host identity summary: SSH alias miyao, root login, host iZrj92lvcxgfwxsyrupgfkZ
Aliyun OS summary: Ubuntu 24.04.2 LTS, kernel 6.8.0-63-generic
Aliyun runtime summary: Node v22.22.2, npm 10.9.7
candidate app loopback health before refresh: 127.0.0.1:3456 /api/health returned HTTP 200
candidate Nginx loopback health before refresh: 127.0.0.1:18080 /api/health returned HTTP 200
candidate service summary before refresh: proxy-gateway-candidate active, nginx active, ufw active
host listener summary before refresh: public SSH only; candidate app 127.0.0.1:3456; candidate Nginx 127.0.0.1:18080; existing wg-home UDP 51820 preserved
UFW summary: active; default deny incoming; OpenSSH allowed; existing wg-home 51820/udp allowed
provider firewall posture summary: refreshed via Aliyun SWAS read-only CLI; still too broad, including public 80/443 and broad TCP/UDP allowances; separate provider-firewall hardening remains required
candidate SQLite integrity_check before refresh: ok
candidate backup presence before refresh: no existing candidate SQLite backup file found under the candidate tree
AliDNS subscription records summary: sub.globalcirclecat.com and ss-sg.globalcirclecat.com still point to the old AWS address with TTL 600 and ENABLE status
HP public check 80 before refresh: closed_or_timeout; HTTP health check returned no response
HP public check 443 before refresh: closed_or_timeout; HTTPS health check returned no response
HP public check 3456 before refresh: closed_or_timeout; HTTP health check returned no response
HP public check 18080 before refresh: closed_or_timeout; HTTP health check returned no response
HP public check 22 before refresh: open
private Admin boundary before refresh: /api/admin/platform/clean-start without auth returned 401; with private auth returned 404 because the runtime route was absent
rollback or cleanup choice before mutation: retain old release and pre-refresh backup for rollback; no production rollback dependency
```

Do not paste raw command output if it contains sensitive values. Summarize.

## Runtime Package Drift And Refresh

Initial runtime drift:

```text
previous candidate release label: bfe6f89b723a
clean-start service file present on previous candidate: no
clean-start protected route present on previous candidate: no
public lead intake route present on previous candidate: no
```

Runtime refresh:

```text
new candidate release label: da33de295cb0
source baseline: origin/master at da33de295cb02d1035419af59b1c52e9a3a51ce3
runtime deployment method: archive transfer to new release directory, keep old release, update current symlink
service action: proxy-gateway-candidate restarted
public boundary posture: unchanged, loopback-only app and loopback-only candidate Nginx
```

Native dependency issue and fix:

```text
initial refresh health result: service failed to start because better-sqlite3 native binding was not built after npm ci --ignore-scripts
root cause: install command skipped native build scripts
fix applied: stopped crash loop, rebuilt better-sqlite3 in the new release, then started proxy-gateway-candidate
post-fix service result: active
post-fix app loopback health: HTTP 200
post-fix candidate Nginx loopback health: HTTP 200
```

## Backup Before Mutation

```text
backup created: yes
backup safe filename: subscriptions-before-runtime-refresh-20260527T083223Z-da33de295cb0.sqlite
backup size: 73728 bytes
backup integrity/checksum metadata: sha256 25a098bc0c5e52273328be653e9b4dfd15e1537746a583ec7acea54a36b8c39a
backup storage location label: candidate state backups under the Aliyun candidate tree
raw path or secret printed: no
```

## Candidate-Only Clean-Start Initialization

```text
state initialization attempted: yes
state initialization result: passed
state scope: candidate-only in-memory platform state on the private candidate runtime
historical state copied: no
production state touched: no
seed data type: synthetic validation lead/account/entitlement/access-grant metadata only
real customer data used: no
```

## Private Rendering Validation

Safe metadata only:

```text
clean-start readiness route result: ready_for_private_validation
private rendering dry-run result: ready
subscription output content printed: no
raw URL printed: no
token printed: no
node host printed: no
protocol family summary: ss
rendered byte-size summary: 937 bytes
renderable node count: 2
blockers: none
historical state copied: false
redaction flag: true
```

## Post-Validation Evidence

```text
current candidate release label: da33de295cb0
candidate app loopback health: HTTP 200
candidate Nginx loopback health: HTTP 200
candidate SQLite integrity_check: ok
proxy-gateway-candidate service: active
nginx service: active
ufw service: active
host public TCP listeners: SSH only
candidate app listener: 127.0.0.1:3456
candidate Nginx listener: 127.0.0.1:18080
HP public check 80 after refresh: closed_or_timeout
HP public check 443 after refresh: closed_or_timeout
HP public check 3456 after refresh: closed_or_timeout
HP public check 18080 after refresh: closed_or_timeout
HP public check 22 after refresh: open
candidate backup after validation: pre-refresh backup retained
candidate state retained / rolled back / cleaned up: retained in running candidate process; no persisted platform customer state created
```

## Rollback / Cleanup

Selected outcome:

```text
retain refreshed candidate runtime and candidate-only validation state with named follow-up gate
```

Rollback evidence:

```text
rollback attempted: no
rollback result: n/a
cleanup attempted: temporary validation scripts removed after use
cleanup result: temporary validation scripts removed from Aliyun and HP
post-rollback candidate health: n/a
post-rollback SQLite integrity_check: n/a
DNS unchanged: yes
public listener unchanged: yes
old release retained for symlink rollback: yes
pre-refresh candidate SQLite backup retained: yes
```

If rollback is required before the next gate:

```text
switch current symlink back to bfe6f89b723a
restart proxy-gateway-candidate.service
verify app and candidate Nginx loopback health
verify candidate SQLite integrity_check
leave DNS, provider firewall, AWS, and public listeners unchanged
```

## Not Performed

```text
DNS change: not performed
public listener exposure: not performed
public Admin exposure: not performed
provider firewall mutation: not performed
AWS mutation: not performed
historical state copy: not performed
edge traffic: not performed
user traffic: not performed
production authority transfer: not performed
public-boundary dry run: not performed
secret/token/subscription URL/customer data handling: not performed
```

## Final Decision

```text
gate result: passed
next gate recommendation: provider-firewall hardening before any public-boundary dry run or DNS promotion
operator follow-up required: yes, for provider-firewall hardening or later public-boundary/DNS gates
```

## Sensitive Output Audit

The execution record contains none of:

```text
.env values
tokens
subscription URLs
opaque artifact paths or raw artifact references
private keys
WireGuard keys
raw portal URLs
node credentials
SQLite rows
customer emails
organization names
cloud credentials
unredacted logs
```
