# Project Topology

Last updated: 2026-06-03, Asia/Shanghai.

> Status:
> - Type: Active architecture topology
> - Risk: C
> - Execution authority: Does not authorize code, production, AWS, DNS, Nginx,
>   HTTPS, systemd, node, artifact, credential, mesh, service, or cutover changes
> - Production impact: None
> - Source of truth for: Current and target topology relationships across local
>   agent, subscription control plane, operator lab relay, subscription
>   delivery, production edges, and server mesh planning

## Current Production Topology

Current production subscription delivery is the Aliyun public subscription
boundary. The former AWS `prod-edge-a` / `prod-edge-b` carrying instances were
terminated on 2026-05-29, so there is no active AWS edge data-plane baseline.
Local Edge Agent work is repository prototype only and is not production active.

```mermaid
flowchart LR
  subgraph "User Device"
    C["Clash / Mihomo"]
  end

  subgraph "Public Subscription Gateway"
    D["sub.globalcirclecat.com"]
    N["Nginx public boundary"]
    A["proxy-gateway app"]
    DB["SQLite subscription / artifact state"]
  end

  subgraph "Production Edge Fleet"
    E1["prod-edge-a\nterminated AWS slot"]
    E2["prod-edge-b\nterminated AWS slot"]
    E3["prod-edge-c\nfuture clean edge slot"]
  end

  C -->|"refreshes subscription\n/sub/a/* or compatible /sub/clash.yaml"| D
  D --> N --> A --> DB
  A -->|"renders Subscription V2 YAML"| C
  C -.->|"static config still references\nretired nodes until rebuilt"| E1
  C -.->|"static config still references\nretired nodes until rebuilt"| E2
  E3 -.->|"not active standby yet"| E1
```

Current production facts:

```text
prod-edge-a: historical AWS production edge slot; carrying instance terminated
prod-edge-b: historical AWS iteration/canary slot; carrying instance terminated
prod-edge-c: future recovery / standby slot, build materials only
legacy blue: stopped, controlled retirement review only
```

## Target Subscription Control / Edge Split

The current Aliyun runtime serves the subscription-distribution boundary while
edge data-plane activation remains pending. The target architecture separates
subscription authority from replaceable edge capacity.

```mermaid
flowchart LR
  subgraph "Subscription Control Plane"
    SC["sub-control-a\ncurrent Aliyun server\nafter CI exit and approval"]
    SB["sub-control-b\nfuture standby / restore target"]
    State["SQLite / artifact / tenant state"]
    Render["Subscription V2 renderer"]
  end

  subgraph "Retired Non-Aliyun Node Slots"
    A["prod-edge-a\nterminated AWS slot"]
    B["prod-edge-b\nterminated AWS slot"]
    C["historical / future nodes\nno default keep path"]
  end

  subgraph "Private Operations Plane"
    Mesh["wg-edge / private mesh candidate"]
    Health["future edge health registry"]
  end

  Clients["Clash / Mihomo\nor future Local Edge Agent"] -->|"refresh / bootstrap"| SC
  SC --> State --> Render
  Render -->|"approved policy"| Clients
  Clients -.->|"historical config reference\nnot live edge authority"| A
  Clients -.->|"historical config reference\nnot live edge authority"| B
  SC -.->|"backup / restore path"| SB
  A -.-> Mesh
  B -.-> Mesh
  C -.-> Mesh
  Mesh -.-> Health -.-> SC
```

Target split boundaries:

```text
sub-control-a on Aliyun produces subscriptions, owns artifacts, and keeps access state after separate approval
local Linux owns manual CI after separate validation
prod-edge-a/b AWS carrying instances were stopped and then terminated under explicit gates
non-Aliyun / non-HP nodes should only re-enter service through explicit new gates
future edge rebuilds are deferred unless a technical MVP integration gate approves them
edge nodes should not own subscription state or expose Admin
private mesh is health / validation / recovery infrastructure first
physical split is future Risk A work, not implied by this topology
```

## Target Product Topology

The active product direction is not tenant migration. It is a local proxy
production agent plus a subscription control plane feeding server-side
multi-node edge networking.

```mermaid
flowchart LR
  subgraph "User Device"
    C["Clash / Mihomo\nrouting and UI"]
    LSub["Local Edge Agent\n127.0.0.1 subscription"]
    LProxy["Local Edge Agent\nloopback SOCKS / HTTP adapter"]
  end

  subgraph "Platform Access"
    Artifact["Opaque artifact / device bootstrap\nserver-side credential containment"]
  end

  subgraph "Remote Edge Channels"
    Ch["Agent-to-edge channel manager\nfuture authenticated / encrypted transport"]
  end

  subgraph "Remote Channel Targets"
    A["historical prod-edge-a\nterminated slot"]
    B["historical prod-edge-b\nterminated slot"]
    C3["future target\nrequires new approval"]
    Mesh["private edge mesh\nfuture management / recovery plane"]
  end

  C -->|"imports local URL"| LSub
  LSub -->|"emits only loopback nodes"| C
  C -->|"proxy traffic to loopback endpoint"| LProxy
  Artifact -->|"bootstrap / refresh material\nnot exposed in generated YAML"| LSub
  LProxy --> Ch
  Ch --> A
  Ch --> B
  Ch -.->|"future failover / recovery"| C3
  A -.-> Mesh
  B -.-> Mesh
  C3 -.-> Mesh
```

Target product boundaries:

```text
Clash/Mihomo remains the router and user-facing client.
Local Edge Agent becomes the platform-controlled channel adapter.
Remote Edge or channel targets become the platform-controlled server-side data
plane only after a later approved integration gate.
Opaque artifacts are bootstrap/access material, not the main architecture.
Server Edge Mesh is for edge health, management, validation, and recovery first.
Subscription control and edge data-plane capacity should split over time.
The preferred physical split path is now: current Aliyun server as future
`sub-control-a` after CI exits, HP/local Linux as manual CI and operator lab,
and non-Aliyun / non-HP nodes drained through controlled retirement gates. The
clean new-server control-plane path remains a fallback, not the first target.
```

Adjacent boundary matrix:

| Concept | Owns | Does not own |
| --- | --- | --- |
| Clash/Mihomo | User-facing routing, rules, UI, and imported subscription handling. | Platform channel selection, server mesh, production edge lifecycle, or subscription authority. |
| Opaque artifacts | Access/bootstrap material and server-side credential containment. | Data-plane routing, local proxying, server mesh membership, or traffic accounting by themselves. |
| Local Edge Agent | Loopback-only client-side adapter and future platform-controlled channel selection. | Clash/Mihomo UI/rules, TUN/driver/system proxy mutation in V1, HP Relay, or Server Edge Mesh. |
| HP Relay | Operator lab diagnostics and upstream/channel behavior research. | Production, staging, CI, prod-edge-c, official Local Edge Agent runtime, or Server Edge Mesh. |
| sub-control-a candidate | Current Aliyun server after it exits the CI lane and passes production-control inventory, or clean fallback host if Aliyun is rejected. | Edge data-plane traffic, prod-edge-c recovery capacity, HP Relay, CI, or automatic production authority. |
| local-ci-a | Local Linux manual CI host for repository validation evidence. | Staging, production, deploy approval, production secrets, SQLite, or subscription URL storage. |
| Non-Aliyun node retirement | Controlled drain, stop, termination, and security-group cleanup after Aliyun promotion. | Approval-free shutdown, DNS change, or deletion while rollback depends on the node. |
| Server Edge Mesh | Private edge-to-edge health, management, validation, and recovery path. | User VPN, Clash/Mihomo endpoint, Local Edge Agent transport in V1, or ordinary customer traffic routing. |
| WireGuard canary | Candidate implementation for the private Server Edge Mesh. | Client VPN product, production traffic migration, opaque artifact migration, or approval-free setup. |

## Operator Lab / HP Relay Topology

The HP Relay is an operator-owned development network node. It is useful for
studying local subscription shape, relay behavior, upstream comparison, and
future Local Edge Agent channel-manager decisions. It is intentionally outside
the production, staging, and CI lanes.

```mermaid
flowchart LR
  subgraph "Operator Devices"
    W["Windows / iPhone\nClash / Mihomo"]
  end

  subgraph "Private Operator Lab"
    HP["HP Relay\nprivate LAN / management access only"]
    Sub["private relay subscription\noperator import only"]
    Auto["HP AUTO\nurl-test / fallback policy"]
    Relays["local relay adapters\nper-upstream listeners"]
  end

  subgraph "Production Edge Fleet"
    A["prod-edge-a"]
    B["prod-edge-b"]
  end

  W -->|"imports private lab subscription"| Sub
  Sub -->|"emits HP relay nodes only"| W
  W -->|"proxy traffic to private relay endpoint"| HP
  HP --> Auto --> Relays
  Relays -->|"upstream edge path"| A
  Relays -->|"upstream edge path"| B
```

HP Relay boundaries:

```text
operator lab / development network node only
not a production edge, not prod-edge-c, and not a public subscription gateway
not staging, not a CI validation host, and not deploy approval
not Server Edge Mesh and not the official Local Edge Agent runtime
private operator access only; no public listener assumption
may consume protected upstream subscription material for diagnostics
must not publish tokens, node passwords, artifact URLs, or customer data
can inform Local Edge Agent and channel-manager design decisions
```

Practical use:

```text
compare upstream edge behavior from one controlled local relay point
test HP AUTO / fallback subscription shape without changing production output
separate local client subscription issues from production gateway issues
collect diagnostic evidence, not production activation evidence
```

## Control, Delivery, And Data Planes

```mermaid
flowchart TB
  subgraph "Control Plane"
    Admin["Admin API / operator actions"]
    Core["Subscription Core / artifact repository"]
    State["SQLite state"]
    Docs["Runbooks / execution records"]
    Control["sub-control-a / future sub-control-b"]
  end

  subgraph "Delivery Plane"
    Gateway["Nginx gateway"]
    Refresh["/sub/a/* and compatible /sub/clash.yaml"]
    Renderer["Subscription V2 renderer"]
    LocalSub["future local agent /clash.yaml"]
  end

  subgraph "Data Plane"
    Clash["Clash / Mihomo"]
    Agent["Local Edge Agent adapter"]
    Edges["future clean edge target\nrequires approval"]
    Outbound["remote outbound traffic"]
  end

  Admin --> Control --> Core --> State
  Docs -.->|"gates and records"| Admin
  Core --> Renderer
  Gateway --> Refresh --> Renderer
  Renderer --> Clash
  LocalSub --> Clash
  Clash --> Agent --> Edges --> Outbound
```

Important separation:

```text
Repository merge does not imply production activation.
Runbook text does not imply execution approval.
Manual CI host is not staging, production, or deploy approval.
Operator lab relay behavior is diagnostic evidence, not CI or production gate.
Subscription refresh success does not prove Shadowsocks data-plane health.
Data-plane traffic accounting cannot be solved by the Node HTTP bridge alone.
```

## Server Edge Mesh Planning Topology

The mesh is planned as a private operational plane between production edges. It
is not a user VPN and is not exposed to Clash/Mihomo or the Local Edge Agent in
V1.

```mermaid
flowchart LR
  subgraph "Public User Delivery"
    DNS["sub.globalcirclecat.com\nss-sg.globalcirclecat.com"]
    Users["Clash / Mihomo or future Local Agent"]
  end

  subgraph "Edge Fleet"
    A["prod-edge-a\nprimary"]
    B["prod-edge-b\niteration / canary"]
    C["prod-edge-c\nfuture recovery"]
  end

  subgraph "Private Mesh Candidate"
    WG["WireGuard candidate\nwg-edge / 10.89.0.0/24"]
  end

  Users --> DNS --> A
  Users -.->|"emitted secondary or future agent policy"| B
  A -.->|"private health / management / recovery"| WG
  B -.->|"private health / management / recovery"| WG
  C -.->|"future standby membership"| WG
```

Mesh non-goals for the current stage:

```text
not a user-facing VPN
not ordinary customer traffic routing
not Clash/Mihomo exposed
not Local Edge Agent exposed in V1
not authorized until separate Risk A approval
```

## Work Topology

```mermaid
flowchart LR
  GH["GitHub master\nsource of truth"] --> PR["short PR boundary"]
  Local["local checkout"] --> PR
  PR --> Validation["local tests / local Linux manual CI"]
  Validation --> Merge["merge to master"]
  Merge -.->|"does not activate production"| ProdGate["Risk A production gate"]
  ProdGate -->|"explicit approval + execution record"| AWS["AWS / DNS / Nginx / systemd"]
  AWS --> Users["user delivery"]
```

Use this topology to decide where a change belongs:

```text
docs/code only -> C or B repository PR
validation only -> local tests or local Linux manual CI after validation
operator lab relay -> diagnostics and design evidence only
AWS/DNS/Nginx/systemd/runtime -> Risk A execution gate
user-facing import or generated subscription output -> treat as production-sensitive
local agent protocol prototype -> B repository PR until production activation
```
