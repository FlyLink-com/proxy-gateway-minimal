# Production Replacement: Node-to-Legacy-Blue Data Preflight

Date: 2026-05-24 16:35-16:48 +08:00

Branch: `ops/node-to-legacy-blue-data-preflight`

Runbooks and related records:

- `docs/PRODUCTION_REPLACEMENT.md`
- `docs/PRODUCTION_EDGE_FLEET.md`
- `docs/production-replacement-records/2026-05-24-prod-edge-a-cutover-preflight.md`
- `docs/production-incident-records/2026-05-24-legacy-blue-connectivity-review.md`

Approval:

```text
Approved read-only node-to-legacy-blue connectivity and data-source preflight.
```

## Scope

This record checks whether current reachable nodes can still reach legacy blue,
and whether that changes the cutover data-source decision.

Allowed scope:

- Read-only AWS status checks.
- Read-only security group inspection.
- Read-only DNS checks.
- Read-only local operator-network connectivity checks.
- Read-only SSH commands on green and prod-edge-a to probe legacy blue TCP and
  HTTP reachability.

This record does not authorize or perform:

- DNS changes
- AWS mutation
- Security group mutation
- Legacy blue mutation
- Green mutation
- prod-edge-a mutation
- Nginx mutation or reload
- HTTPS issuance
- Service restart
- Production `.env` change
- Production node-config change
- SQLite backup or restore
- Production tenant migration
- Green promotion
- Legacy blue shutdown or termination
- Traffic cutover
- Secret, token, raw subscription URL, SQLite content, AWS credential, or
  customer data disclosure in PRs, docs, chat, or logs

## Baseline

Repository `master` at preflight time:

```text
798f1d4 Merge pull request #75 from gaoyi1020-web/ops/prod-edge-a-cutover-preflight
```

Current roles:

```text
legacy blue:
  public IP: 47.129.247.102
  role: current DNS target, review/controlled-exit only

current green:
  public IP: 18.136.102.226
  role: temporary validated candidate

prod-edge-a:
  public IP: 13.215.156.159
  role: clean provider-neutral production candidate
```

## AWS Read-Only Status

Instance status checks:

```text
i-004ab1c6c71d06bca legacy blue -> running, InstanceStatus=ok, SystemStatus=ok
i-0ad8676ee113d14cb green -> running, InstanceStatus=ok, SystemStatus=ok
i-0b7791340d3fedff5 prod-edge-a -> running, InstanceStatus=ok, SystemStatus=ok
```

Relevant security group facts:

```text
legacy blue sg-04a165ec77f430ee8:
  80/tcp -> 0.0.0.0/0
  18388/tcp -> 0.0.0.0/0
  18388/udp -> 0.0.0.0/0
  22/tcp -> 36.163.181.255/32

green sg-06682c36aa03834f7:
  same public service shape

prod-edge-a sg-0379ece0b3d305c43:
  same public service shape
```

Interpretation:

```text
22/tcp from green or prod-edge-a to legacy blue is expected to fail under the
current security group rule. 80/tcp and 18388/tcp are the relevant public-path
checks for node-to-blue reachability.
```

## DNS Read-Only Check

Local resolver checks:

```text
sub.globalcirclecat.com -> 47.129.247.102 TTL 600
ss-sg.globalcirclecat.com -> 47.129.247.102 TTL 600
```

Conclusion:

```text
DNS still points to legacy blue.
No DNS cutover to green or prod-edge-a has occurred.
```

## Local Operator-Network To Legacy Blue

From the local operator network:

```text
47.129.247.102:22 TCP -> timeout
47.129.247.102:80 TCP -> timeout
47.129.247.102:18388 TCP -> timeout
http://47.129.247.102/api/health -> 000 / timeout
http://47.129.247.102/sub/clash.yaml without token -> 000 / timeout
```

This confirms the current operator-network path to legacy blue remains blocked
or unreachable.

## Node-To-Legacy-Blue Checks

From current green `18.136.102.226`:

```text
47.129.247.102:22 TCP -> failed
47.129.247.102:80 TCP -> reachable
47.129.247.102:18388 TCP -> reachable
http://47.129.247.102/api/health -> 200
http://47.129.247.102/sub/clash.yaml without token -> 401
```

From prod-edge-a `13.215.156.159`:

```text
47.129.247.102:22 TCP -> failed
47.129.247.102:80 TCP -> reachable
47.129.247.102:18388 TCP -> reachable
http://47.129.247.102/api/health -> 200
http://47.129.247.102/sub/clash.yaml without token -> 401
```

Interpretation:

```text
Node-to-blue public HTTP and Shadowsocks TCP paths are healthy from green and
prod-edge-a. The local operator-network failure is path-specific, not proof
that the legacy blue instance or services are down.
```

The failed node-to-blue SSH checks are not useful as incident evidence because
legacy blue currently allows SSH only from the operator IP CIDR, not from the
other node public IPs.

## Data-Source Assessment

This preflight improves the incident diagnosis:

```text
legacy blue public service path from other nodes -> reachable
legacy blue public service path from local operator network -> timeout
legacy blue AWS status -> ok
```

It does not by itself solve the SQLite authority problem:

```text
fresh legacy-blue SQLite backup collected -> no
legacy-blue SSH from local operator network -> no
legacy-blue SSH from green/prod-edge-a -> blocked by SG policy
current green/prod-edge-a SQLite copy declared authoritative -> no
```

Conclusion:

```text
Ready for immediate prod-edge-a cutover: no
```

Blocking reason:

```text
The production SQLite authority is still unresolved. Node-to-blue HTTP/SS
reachability proves legacy blue is serving from node vantage points, but it does
not provide a fresh approved SQLite backup path.
```

## Recommended Next Decision

Recommended path:

```text
1. Treat the legacy blue incident as local/operator-network path blocking until
   broader customer-vantage evidence says otherwise.
2. Proceed with MVP-to-V2 production replacement planning around prod-edge-a.
3. Before DNS cutover, choose one data authority path:
   a. temporarily approve a narrow SSH/security-group path only for fresh
      legacy-blue SQLite backup and then restore to prod-edge-a; or
   b. explicitly declare the existing green/prod-edge-a SQLite copy
      authoritative for cutover.
4. After data authority is resolved, execute a separate Risk A production
   activation plan for Subscription V2 and prod-edge-a replacement.
```

Do not combine the data-authority decision, DNS cutover, production node-config
change, and legacy-blue retirement into this read-only record.

## Conclusion

The node-to-legacy-blue checks confirm that legacy blue remains reachable from
green and prod-edge-a on public HTTP and Shadowsocks TCP, while the local
operator-network path to legacy blue still times out. This supports the working
hypothesis of a path/IP-specific block instead of an instance-down incident.

prod-edge-a can remain the replacement target, but production cutover still
requires a separate data-authority decision or a fresh approved backup/restore
path.
