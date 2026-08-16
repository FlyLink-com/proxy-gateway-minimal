# Legacy Blue Connectivity Review

Date: 2026-05-24, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: production_incident_records_2026_05_24_legacy_blue_connectivity_review
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```


> Status:
> - Type: Read-only production incident and lifecycle decision record
> - Risk: A
> - Execution authority: Does not authorize DNS, AWS, Nginx, HTTPS, production config, service restart, traffic cutover, or node termination
> - Production impact: Read-only checks only
> - Source of truth for: Legacy blue connectivity findings and follow-up node lifecycle decision

## Scope

This record captures the current connectivity findings for the legacy blue
production node and the operator direction for future node lifecycle work.

It does not execute or approve:

- DNS mutation;
- AWS resource mutation;
- Nginx mutation or reload;
- HTTPS issuance;
- production `.env` or `config/proxy-servers.json` change;
- service restart;
- blue stop, reboot, or termination;
- green promotion;
- new blue creation;
- traffic cutover;
- secret, token, subscription URL, SQLite, cloud credential, or customer-data
  copying.

## Current Roles

```text
Legacy blue:
  Current public IP: 47.129.247.102
  Current instance: i-004ab1c6c71d06bca
  Current DNS target: sub.globalcirclecat.com and ss-sg.globalcirclecat.com
  Current lifecycle decision: preserve for read-only review and controlled exit; do not use as a future durable production target

Current green:
  Current public IP: 18.136.102.226
  Current instance: i-0ad8676ee113d14cb
  Current role: temporary production replacement candidate
  Current lifecycle decision: maintain temporarily until cutover, canary, or cleanup is separately approved

Future new blue:
  Current instance: none
  Target role: clean provider-neutral primary candidate after lessons are absorbed
  Required process: separate Risk A creation and validation approval
```

Use provider-neutral durable node identities from `docs/NODE_NAMING.md`.
Do not introduce new customer-visible or long-lived names based on cloud
provider, region, blue/green role, instance ID, or public IP.

## Read-Only Checks Performed

Commands were run from the local operator environment with proxy environment
variables cleared for the process. No production host commands, service
restarts, file edits, DNS changes, or AWS mutations were performed.

### AWS Inventory

Read-only EC2 inventory returned both instances as running:

```text
Legacy blue:
  InstanceId: i-004ab1c6c71d06bca
  PublicIp: 47.129.247.102
  State: running
  Instance type: t4g.small
  Security group: sg-04a165ec77f430ee8

Current green:
  InstanceId: i-0ad8676ee113d14cb
  PublicIp: 18.136.102.226
  State: running
  Instance type: t4g.small
  Security group: sg-06682c36aa03834f7
```

Read-only EC2 status checks returned `ok` for both system and instance status
on both nodes.

### Security Group Inventory

Read-only security group inventory showed both legacy blue and current green
allow the expected public service ports:

```text
80/tcp: public
18388/tcp: public
18388/udp: public
443/tcp: public
22/tcp: operator IP restricted
```

This does not prove the application services are healthy on legacy blue. It
only shows the AWS security group rules do not explain the local TCP timeout.

### Local TCP Reachability

Local TCP checks:

```text
47.129.247.102:22     -> timeout
47.129.247.102:80     -> timeout
47.129.247.102:18388  -> timeout

18.136.102.226:22     -> reachable
18.136.102.226:80     -> reachable
18.136.102.226:18388  -> reachable
```

The local evidence is consistent with path-level blocking or filtering toward
the legacy blue IP from the current operator network. It is not enough by
itself to prove global customer impact. Any global outage conclusion still
requires additional vantage points or customer-impact evidence.

### DNS And HTTP Boundary

Read-only DNS checks:

```text
sub.globalcirclecat.com   -> 47.129.247.102
ss-sg.globalcirclecat.com -> 47.129.247.102
```

Because both names still point at legacy blue, local HTTP checks through the
domain timed out together with direct legacy-blue HTTP:

```text
http://47.129.247.102/api/health                 -> timeout
http://sub.globalcirclecat.com/api/health        -> timeout
http://sub.globalcirclecat.com/api/admin/...     -> timeout
http://sub.globalcirclecat.com/sub/clash.yaml    -> timeout
http://sub.globalcirclecat.com/                  -> timeout
```

Direct green HTTP remained reachable:

```text
http://18.136.102.226/api/health -> 200
```

## Findings

Known facts:

- Both legacy blue and current green instances are running at the AWS control
  plane level.
- Both instances pass EC2 system and instance status checks.
- Both security groups allow the expected public service ports.
- From the current local operator network, TCP to legacy blue times out on
  SSH, HTTP, and Shadowsocks ports.
- From the same local operator network, TCP to current green succeeds on SSH,
  HTTP, and Shadowsocks ports.
- Current DNS still points subscription and Shadowsocks node hostnames at
  legacy blue.

Reasonable interpretation:

- The observed failure is likely outside the Node.js application code path.
- The observed failure is consistent with network-path filtering or IP-level
  blocking toward the legacy blue public IP from the current local network.
- Green remains the best currently validated emergency replacement candidate,
  but it is not production until a separate cutover or canary approval is
  granted.

Information gaps:

- Whether customers outside the current local operator network are affected.
- Whether the legacy blue services are still healthy from inside the instance.
- Whether the legacy blue IP becomes reachable again from other networks.
- Whether future protocol hardening or a different data-plane design is needed
  before broad multi-node exposure.

## Lifecycle Decision

Operator direction:

```text
Legacy blue should not become the future durable production target.
Use it only for read-only review, lessons learned, dependency drain, and controlled retirement.
Keep current green as a temporary candidate while a clean new blue/prod-edge-a candidate is planned.
Build any future durable node identity using provider-neutral names.
```

This decision does not stop or remove legacy blue. While DNS still points to
legacy blue, it remains part of the current runtime path until an explicit
cutover, rollback, or retirement action changes that fact.

## Lessons To Absorb Before New Blue

Before approving a new blue or `prod-edge-a` candidate:

- Do not reuse provider-, region-, color-, or IP-based durable node names.
- Keep subscription URL and tenant token stable.
- Prefer provider-neutral node DNS and customer-visible labels.
- Confirm whether the failure pattern is IP-specific, protocol-specific, or
  local-network-specific before assuming a protocol fix.
- Keep protocol obfuscation, data-plane traffic accounting, and multi-node
  subscription output as separate designs unless explicitly approved together.
- Require fresh validation from at least the local operator network and the
  candidate node's public IP before any production promotion.
- Keep rollback explicit: DNS rollback, production config rollback, tenant
  assignment rollback, and green cleanup are separate actions.

## Recommended Next Actions

1. Keep current green as a temporary validated candidate; do not promote it
   without separate approval.
2. Create a separate Risk A read-only record if additional external vantage
   checks are performed for legacy blue.
3. Plan a new clean `prod-edge-a` candidate only after this incident evidence
   is accepted.
4. Keep Subscription V2 implementation separate from production node cutover.
5. Do not run protocol obfuscation or traffic-accounting changes as part of
   this incident review.

## Exit Criteria For Legacy Blue

Legacy blue can move from review hold to retirement only after a separate Risk
A action confirms:

- DNS no longer points required customer paths to legacy blue;
- current subscription clients no longer depend on legacy blue as the only
  emitted node;
- fresh SQLite backup and restore/cutover data decision are complete;
- rollback plan is explicit;
- no required evidence remains only on legacy blue;
- operator explicitly approves stop, terminate, or quarantine continuation.

## Validation

Repository validation for this record:

```text
git diff --check origin/master...HEAD
```
