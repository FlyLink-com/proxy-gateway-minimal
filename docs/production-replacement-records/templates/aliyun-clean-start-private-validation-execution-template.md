# Aliyun Clean-Start Private Validation Execution Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_clean_start_private_validation_execution_template
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


Date: YYYY-MM-DD, Asia/Shanghai.

## Status

```text
Type: Risk A execution record
Gate: Aliyun clean-start private validation
Execution state: not-started | passed | failed | blocked | rolled-back | cleaned-up
Production impact: none expected for this gate
Aliyun impact: candidate-only private validation after exact approval
AWS impact: none
DNS impact: none
Traffic impact: none
```

This template is for the execution record required by:

```text
docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md
docs/production-replacement-records/2026-05-27-aliyun-next-a-tier-execution-packet.md
```

Do not create a completed execution record from this template until the exact
approval phrase has been provided and recorded.

## Agent / Task Routing

```text
Lead agent:
Primary unit: Production Operations
Supporting units:
  Subscription Control Platform
  Subscription Access Control
  Validation / CI
  Operator Lab
Reviewer:
Follow-up owner:
```

## Approval

Exact approval phrase received:

```text
Approve Aliyun clean-start private validation. Allow candidate-only clean-start state initialization and private rendering checks on Aliyun. No DNS change, no public listener exposure, no public Admin, no edge traffic, no AWS mutation, and no historical state copy.
```

Approval source:

```text
operator message / PR comment / other durable approval source
```

Rejected as insufficient approval:

```text
short confirmations such as 同意 / 继续 / 开始 / ok / go
```

## Scope

Allowed after approval:

```text
create candidate backup before validation
initialize candidate-only clean-start state
run protected clean-start readiness checks
run private subscription rendering dry-run checks
verify candidate SQLite integrity after validation
create candidate backup after validation if retaining candidate-only state
record rollback or cleanup decision
```

Not authorized:

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
```

## Fresh Read-Only Preflight Evidence

Record only safe metadata.

```text
operator repo commit:
operator working-tree status:
Aliyun host identity summary:
Aliyun OS summary:
candidate app loopback health:
candidate Nginx loopback health:
host listener summary:
UFW summary:
provider firewall posture summary:
candidate SQLite integrity_check:
candidate backup presence:
AliDNS subscription records summary:
HP public check 80:
HP public check 443:
HP public check 3456:
HP public check 18080:
private Admin boundary:
rollback or cleanup choice before mutation:
```

Do not paste raw command output if it contains sensitive values. Summarize.

## Backup Before Mutation

```text
backup created: yes | no
backup safe filename:
backup size:
backup integrity/checksum metadata:
backup storage location label:
raw path or secret printed: no
```

## Candidate-Only Clean-Start Initialization

```text
state initialization attempted: yes | no
state initialization result:
state scope: candidate-only
historical state copied: no
production state touched: no
```

## Private Rendering Validation

Safe metadata only:

```text
clean-start readiness route result:
private rendering dry-run result:
subscription output content printed: no
raw URL printed: no
token printed: no
node host printed: no
protocol family summary:
rendered byte-size summary:
```

## Post-Validation Evidence

```text
candidate app loopback health:
candidate Nginx loopback health:
candidate SQLite integrity_check:
candidate backup after validation:
candidate state retained / rolled back / cleaned up:
```

## Rollback / Cleanup

Selected outcome:

```text
retain candidate-only state with named follow-up gate
or restore pre-validation backup
or remove candidate-only seed state
```

Evidence:

```text
rollback attempted:
rollback result:
cleanup attempted:
cleanup result:
post-rollback candidate health:
post-rollback SQLite integrity_check:
DNS unchanged:
public listener unchanged:
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
secret/token/subscription URL/customer data handling: not performed
```

## Final Decision

```text
gate result: passed | failed | blocked | rolled-back | cleaned-up
next gate recommendation:
operator follow-up required:
```

## Sensitive Output Audit

Confirm the execution record contains none of:

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
