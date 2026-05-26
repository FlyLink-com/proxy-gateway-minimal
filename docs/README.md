# Documentation Index

Last updated: 2026-05-26, Asia/Shanghai.

Use this file as the first navigation point for project documentation. It
classifies current source-of-truth docs, active runbooks, execution records,
and historical design artifacts. It does not authorize production, AWS, DNS,
Nginx, HTTPS, deploy, secret, token, subscription URL, SQLite, or customer-data
actions by itself.

## Project Landing Pages

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `README.md` | Chinese project landing page, quick start, topology summary, APIs, module tree, and current project overview. | Active entrypoint. | Read when onboarding Chinese-speaking operators or checking quick-start usage. |
| `README_EN.md` | English project landing page, quick start, topology summary, APIs, and source-of-truth pointer. | Active entrypoint. | Read when onboarding English-speaking collaborators. |

## Current State

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/PROJECT_CONTEXT.md` | Compact current handoff, active blockers, documented production snapshot, validation baseline, and latest durable next-step context. | Active current-state handoff; not the full docs index or execution-history archive. | Read first when resuming the repo or before changing project direction, then use this index for detailed docs navigation and execution records. |

## Workflow / Agent Rules

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `AGENTS.md` | Default agent instructions, A/B/C risk tiers, PR completion gate, validation expectations, and safety boundaries. | Active workflow rules. | Read before repo, ops, CI, network, deployment, or production-adjacent work. |
| `docs/PROJECT_OPERATING_MODEL.md` | Project operating model for source-of-truth layers, work lanes, PR definition of done, risk tiers, production gates, and subscription stability. | Active operating model; no execution authority. | Read when deciding how to classify, sequence, or parallelize project work. |
| `docs/DOMAIN_UNIT_BOUNDARIES.md` | Domain-unit boundary model separating product business, commercial entitlement, subscription access, edge nodes, local client, validation, operator lab, and production operations. | Active architecture boundary; no execution authority. | Read before mixing business, commercial, node, CI, HP Relay, Local Edge Agent, or production-ops responsibilities in one task. |
| `docs/units/README.md` | Per-unit design index for Product Business, Commercial / Entitlement, Subscription Access Control, Edge / Node Capacity, Local Client, Validation / CI, Operator Lab, and Production Operations. | Active unit design index; no execution authority. | Read when assigning a task to one primary unit or checking a unit-specific interface. |
| `docs/PROJECT_SIMPLIFICATION_MAP.md` | Project simplification map for product spine, active lanes, cleanup queue, code-inventory candidates, and stop-doing boundaries. | Active simplification map; no execution authority. | Read before slimming docs, classifying modules, or deciding whether a new idea belongs on the main product path. |
| `docs/PROJECT_CONTROL_PLANE.md` | Lightweight project control-plane model explaining how `project-state/*.json` complements docs for current state, lanes, tasks, and future consistency checks. | Active coordination model; no runtime or production authority. | Read before relying on structured project-state files or adding project-state tooling. |
| `docs/MULTI_AGENT_OPERATING_MODEL.md` | Multi-agent collaboration model covering lead/subagent roles, task packets, parallelization rules, verification, and no-secrets boundaries. | Active operating model; no execution authority. | Read before splitting work across multiple agents or dispatching independent review/implementation tracks. |
| `docs/VALIDATION_BASELINE.md` | Current validation command matrix and PR completion gate by risk tier and touched surface. | Active validation entrypoint; not historical pass-count archive and not deploy approval. | Read before choosing which checks to run for a PR. |
| `docs/CI_MANUAL_VALIDATION.md` | Manual CI validation host workflow; target direction is local Linux manual CI, with historical Aliyun manual CI facts retained until the transition is validated. | Active runbook, not staging or deploy approval. | Read before using a manual validation host for repo-level CI evidence. |

## Structured Project State

| File | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `project-state/current.json` | Compact machine-readable current-state snapshot for repo, active PR direction, product spine, documented production snapshot, validation summary, blockers, and queue. | Active snapshot; drift-prone production facts require live verification. | Read after `docs/PROJECT_CONTEXT.md` when orienting an agent or preparing a task packet. |
| `project-state/lanes.json` | Machine-readable active lanes, primary docs, code areas, risk boundaries, and non-goals. | Active lane index; no execution authority. | Read before assigning work to a lane or dispatching subagents. |
| `project-state/tasks.json` | Machine-readable C/B/A backlog for simplification and project-control work. | Active backlog; A-tier entries remain blocked until runbook and approval. | Read before selecting the next cleanup, inventory, or architecture-hardening task. |

Check structured state with `npm run project-state:check`.

## Network / Runtime

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/NETWORK_FORWARDING.md` | Local forwarding, PAC, Clash/Mihomo subscription forwarding, Admin tunnel, production runtime paths, and network test matrix. | Active architecture source of truth. | Read before network, proxy, node, or subscription-path changes. |
| `docs/ENVIRONMENT_TOPOLOGY.md` | Local checkout, GitHub, branch roles, AWS runtime roles, and current topology. | Active topology reference. | Read before interpreting environment roles or AWS instance identity. |
| `docs/PROJECT_TOPOLOGY.md` | Current and target topology diagrams for production delivery, Local Edge Agent, private operator lab / HP Relay, server edge mesh, control/delivery/data planes, and work lanes. | Active architecture topology; no execution authority. | Read before aligning product direction, drawing architecture diagrams, or deciding whether work belongs to local agent, operator lab relay, server mesh, subscription delivery, or production ops. |
| `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md` | Near-term Aliyun user-management / subscription-distribution runbook, HP validation/lab boundary, separate technical MVP track, and controlled non-Aliyun node drain/retirement gates. | Active Risk A runbook; no cleanup, bootstrap, DNS, node stop, termination, or security-group authority by itself. | Read before building Aliyun `sub-control-a`, separating it from PR #129 technical channel work, or retiring non-Aliyun/HP nodes. |
| `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md` | Target plan for current Aliyun subscription control, local Linux manual CI, and controlled non-Aliyun node drain / retirement. | Active planning document; no execution authority. | Read before moving CI off Aliyun, preparing Aliyun as control plane, or retiring non-Aliyun / non-HP nodes. |
| `docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md` | Target architecture for splitting subscription control-plane authority from edge data-plane capacity. | Active architecture design; no execution authority. | Read before planning control-plane standby, edge-only nodes, edge health registry, or any physical control/edge split. |
| `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md` | Clean new-server fallback runbook for validating a future `sub-control-a` candidate if the Aliyun control-plane path is rejected. | Active Risk A fallback runbook; explicit approval still required before provisioning or mutation. | Read before creating a new subscription control-plane candidate, restoring production-derived state to it, validating its public boundary, or considering promotion. |
| `docs/NODE_NAMING.md` | Provider-neutral production edge node naming policy. | Active naming policy; runtime migrations remain Risk A. | Read before adding, renaming, exposing, or documenting production node identities. |
| `docs/ROUTES_ARCHITECTURE.md` | Express route boundaries, public/protected/admin route model, Subscription V2 route behavior, and implemented versus not-yet-implemented routing capabilities. | Active architecture audit; no execution authority. | Read before changing route auth boundaries, subscription routing behavior, or making claims about DPI, protocol, blackhole, traffic, or self-service capabilities. |
| `docs/SUBSCRIPTION_V2_REPLACEMENT.md` | Subscription V2 design for replacing MVP single-node output with stable-token multi-node delivery. | Active design contract; no execution authority. | Read before implementing or activating Subscription V2. |
| `docs/SUBSCRIPTION_DEVICE_SCOPED_OPAQUE_URLS.md` | Device-scoped opaque subscription artifact design for random-looking refreshable subscription URLs and abuse detection. | Active design contract; no execution authority. | Read before changing subscription URL shape, artifact generation, device binding, or anti-sharing behavior. |
| `docs/SUBSCRIPTION_OPAQUE_IMPLEMENTATION_PLAN.md` | First repository implementation plan for device-scoped opaque subscription artifacts. | Active implementation plan; broader production activation remains Risk A. | Read before implementing opaque artifact repository/core/routes/admin APIs or planning further production activation. |
| `docs/SUBSCRIPTION_OPAQUE_ACCESS_MODEL_GAP.md` | Remaining access-model gaps after repository-level opaque artifact support, including canary exposure, path logging, issuance, legacy query-token retirement, and device-abuse enforcement. | Active gap record; further activation remains Risk A. | Read before expanding `/sub/a/*`, issuing more production artifacts, retiring query-token access, or planning traffic-accounting enforcement. |
| `docs/LOCAL_EDGE_AGENT_DESIGN.md` | Local Edge Agent design for a loopback-only channel adapter that lets Clash/Mihomo use platform-controlled remote-edge channels without system network takeover. | Active design and repo prototype reference; no production authority. | Read before prototyping a local agent, channel adapter, device credential flow, or agent-to-edge protocol. |
| `docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md` | Technical MVP definition for proving frontier-grade channel capability with SS baseline, direct Clash/Mihomo renderer support, VLESS/XUDP/Hysteria2/TUIC candidates, parked Local Edge Agent assets, QUIC/MPTCP research, and measured quality gates. | Active technical MVP design; no execution authority. | Read before planning channel renderer work, local-agent channel manager work, protocol candidate matrices, or lab/prod-edge-b channel canaries. |
| `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md` | Runtime canary gates for turning repository renderer/config support into controlled protocol candidate validation. | Active Risk A runbook; explicit approval still required before any runtime, node, DNS, Nginx, systemd, config, tenant/artifact, or traffic change. | Read before deploying VLESS/XUDP, Hysteria2, TUIC, or other channel candidates on a lab edge or `prod-edge-b`. |
| `docs/SERVER_EDGE_MESH_DESIGN.md` | Server-side private edge mesh design for provider-neutral edge-to-edge health, management, validation, and recovery paths. | Active design proposal; no mesh setup or production authority. | Read before planning WireGuard/private mesh setup, edge service registry, mesh health checks, or mesh-assisted recovery. |
| `docs/SERVER_EDGE_MESH_WIREGUARD_CANARY_RUNBOOK.md` | Two-node WireGuard canary runbook for prod-edge-a and prod-edge-b. | Active Risk A runbook; explicit approval still required before execution. | Read before installing WireGuard, generating mesh keys, opening mesh UDP, starting wg-quick, or validating a private mesh canary. |
| `docs/API_COMPATIBILITY.md` | API compatibility notes for external callers and existing clients. | Current reference. | Read before changing API response shape or endpoint behavior. |
| `docs/MIGRATION.md` | Migration notes for earlier project usage and compatibility transitions. | Reference / migration notes. | Read when maintaining compatibility with older local usage. |

## Deployment / Staging

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/DEPLOYMENT_FLOW.md` | Development, PR, candidate, staging, production promotion, and rollback flow. | Active deployment flow. | Read before deployment, promotion, rollback, or candidate selection work. |
| `docs/STAGING_PROVISIONING.md` | Clean staging provisioning, dry-run inventory, approval gates, validation, and cleanup. | Active staging runbook. | Read before any staging AWS mutation. |
| `docs/STAGING_TARGET_DECISION.md` | Decision record for clean staging versus reusing the historical stopped node. | Active decision record. | Read before assigning or reassigning a staging target. |

## Production Safety

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/PRODUCTION_DR.md` | Single-node production disaster recovery, hard-stop rules, read-only inventory, backup/restore, validation, and incident template. | Active Risk A runbook; does not authorize mutation by itself. | Read before incident recovery, backup/restore, or production DR action. |
| `docs/PRODUCTION_REPLACEMENT.md` | Blue-green replacement gate: keep blue serving, create and validate green, decide cutover, preserve rollback. | Active Risk A runbook; does not authorize green creation by itself. | Read before planning a production replacement candidate. |
| `docs/PRODUCTION_EDGE_FLEET.md` | Provider-neutral production edge fleet plan for `prod-edge-a`, `prod-edge-b`, and future `prod-edge-c`. | Active Risk A planning document; no execution authority. | Read before changing the prod-edge-b iteration/canary slot, replacing its carrying instance, or preparing third-node standby materials. |
| `ops/edge-node/README.md` | Provider-neutral repo-only build materials for the future `prod-edge-c` recovery slot. | Build-material reference; no execution authority and no secrets/data. | Read before preparing or reviewing third-node recovery build materials. |
| `docs/PRODUCTION_CUTOVER_STRATEGY.md` | EIP, DNS/domain, and subscription/node-config cutover strategy decision. | Active decision record. | Read before choosing a traffic-cutover mechanism. |
| `docs/DOMAIN_ABSTRACTION_PLAN.md` | Domain/DNS abstraction plan for subscription base URL and Shadowsocks node host. | Active planning document; no execution authority. | Read before DNS/domain implementation planning. |
| `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md` | DNS/domain execution gates, AliDNS commands, HTTP/HTTPS validation, runtime config migration gates, client window, and rollback. | Active Risk A runbook; explicit approval still required before mutation. | Read before any DNS, Nginx, HTTPS, production config, or domain migration step. |
| `docs/production-replacement-preflight/2026-05-24-blue-green-preflight.md` | Read-only production replacement preflight facts. | Execution record; historical facts for the named date. | Read when checking whether green creation was previously considered ready. |
| `docs/production-replacement-records/2026-05-24-green-candidate-creation.md` | Green production replacement candidate creation and validation record. | Execution record; green candidate exists but cutover is not approved. | Read before any green/prod-edge-b follow-up validation or carrying-instance lifecycle decision. |
| `docs/production-replacement-records/2026-05-24-green-refresh-current-master.md` | Green production replacement candidate refresh to current `master` and validation record. | Execution record; green is refreshed but cutover is not approved. | Read before any green/prod-edge-b validation or carrying-instance lifecycle decision. |
| `docs/production-replacement-records/2026-05-24-green-cutover-preflight.md` | Read-only blue/green cutover preflight and readiness assessment. | Execution record; health passed, but cutover is not approved or immediately ready. | Read before choosing cutover planning, tenant canary planning, or prod-edge-b carrying-instance lifecycle changes. |
| `docs/production-replacement-records/2026-05-24-prod-edge-a-candidate-preflight.md` | Clean `prod-edge-a` candidate preflight and approval gate. | Planning/execution gate record; does not authorize AWS creation or cutover. | Read before requesting approval to create a new clean primary candidate. |
| `docs/production-replacement-records/2026-05-24-prod-edge-a-candidate-creation.md` | Clean `prod-edge-a` candidate creation and validation record. | Execution record; candidate exists and passed validation, but cutover is not approved. | Read before prod-edge-a cutover preflight, DNS/node-host migration, prod-edge-b carrying-instance changes, or legacy-blue retirement. |
| `docs/production-replacement-records/2026-05-24-prod-edge-a-cutover-preflight.md` | Read-only prod-edge-a cutover preflight, including DNS, public boundary, runtime, and data-authority assessment. | Execution record; prod-edge-a is healthy, but cutover is not approved or ready until data authority is resolved. | Read before requesting prod-edge-a cutover execution or data-refresh/data-authority approval. |
| `docs/production-replacement-records/2026-05-24-node-to-legacy-blue-data-preflight.md` | Read-only green/prod-edge-a to legacy-blue connectivity and data-source preflight. | Execution record; node-to-blue public paths are reachable, but data authority remains unresolved. | Read before deciding fresh legacy-blue backup versus green/prod-edge-a data-authority cutover. |
| `docs/production-replacement-records/2026-05-24-legacy-blue-fresh-backup-restore.md` | Legacy blue fresh SQLite backup, prod-edge-a restore, temporary SSH window, cleanup, and validation record. | Execution record; prod-edge-a now has fresh legacy-blue-derived data, but cutover is not approved. | Read before prod-edge-a production activation, DNS/runtime migration, or Subscription V2 production output approval. |
| `docs/production-replacement-records/2026-05-24-prod-edge-a-production-activation.md` | prod-edge-a production MVP activation with Subscription V2 output and DNS migration. | Execution record; authoritative DNS now points to prod-edge-a, with prod-edge-b as the iteration/canary secondary slot. | Read before rollback, prod-edge-b carrying-instance changes, legacy-blue retirement, or durable third-node planning. |
| `docs/production-replacement-records/2026-05-24-prod-edge-a-https-preflight.md` | Read-only HTTPS readiness preflight for `sub.globalcirclecat.com` on prod-edge-a. | Execution record; DNS/SG/HTTP boundary are ready, but HTTPS issuance is not performed or immediately ready. | Read before requesting HTTPS certificate issuance, Nginx 443 config, redirect behavior, or opaque artifact production exposure. |
| `docs/production-replacement-records/2026-05-24-prod-edge-a-https-issuance.md` | Approved HTTPS issuance record for `sub.globalcirclecat.com` on prod-edge-a with no automatic redirect. | Execution record; HTTPS was enabled, but base URL migration, opaque artifact activation, and legacy query-token retirement were not performed in that record. | Read before changing redirect behavior or reviewing the HTTPS issuance boundary. |
| `docs/production-replacement-records/2026-05-24-opaque-artifact-production-canary.md` | Approved opaque artifact production canary record for `prod-edge-a`, including `/sub/a/*` exposure, one artifact, HTTPS base URL, and artifact-path log redaction. | Execution record; one canary artifact is active, but broader issuance and legacy query-token retirement are not performed. | Read before importing the canary URL, issuing more artifacts, changing artifact logging, or retiring legacy query-token access. |
| `docs/production-replacement-records/2026-05-24-active-tenant-legacy-link-drain.md` | Approved active-tenant legacy link drain after opaque artifact import validation. | Execution record; active tenant primary and temporary legacy links were drained, but `/sub/clash.yaml` and future query-token support still exist. | Read before broader legacy query-token retirement, additional artifact issuance, or stale local URL cleanup. |
| `docs/production-replacement-records/2026-05-26-sub-control-a-candidate-readonly-preflight.md` | Read-only A2 preflight for the clean `sub-control-a` candidate path, covering AWS, DNS, endpoint, and SSH/internal-inventory readiness. | Execution record; external checks passed, but host-internal inventory is blocked by SSH access and candidate provisioning is not approved. | Read before requesting clean `sub-control-a` candidate provisioning or any temporary SSH/security-group change for internal inventory. |
| `docs/production-replacement-records/2026-05-26-local-linux-ci-readonly-inventory.md` | Read-only inventory for the HP local Linux host as the target manual CI candidate. | Execution record; host is reachable and hardware-ready, but Node.js 22/npm are absent and bootstrap is not approved. | Read before requesting local Linux CI bootstrap, archive-based manual CI validation, or Aliyun CI-lane retirement. |
| `docs/production-replacement-records/2026-05-26-local-linux-ci-bootstrap-validation.md` | Approved HP local Linux manual CI bootstrap and archive-based validation record. | Execution record; HP manual CI passed for the recorded commit and cleanup completed, but it is not staging or deploy approval. | Read before using HP as manual CI evidence or retiring Aliyun from the validation lane. |
| `docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup-inventory.md` | Read-only inventory for the current Aliyun server before CI-lane cleanup and subscription-control candidate preparation. | Execution record; no cleanup or bootstrap performed, and Aliyun remains gated before becoming `sub-control-a`. | Read before requesting Aliyun manual CI cleanup, candidate hardening, or subscription-control bootstrap. |
| `docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup.md` | Approved Aliyun manual CI lane cleanup record. | Execution record; only root npm/cache and matching CI archive residue were cleaned. No production authority, DNS, Nginx, systemd, firewall, WireGuard, SQLite, tenant, artifact, or user-traffic mutation was performed. | Read before requesting Aliyun subscription-control candidate preparation. |
| `docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-preparation.md` | Approved Aliyun private subscription-control candidate preparation record. | Execution record; candidate app and loopback Nginx are active behind UFW with no DNS, user traffic, production authority, state-copy, edge traffic, AWS, or public Admin mutation. | Read before requesting Aliyun private state-copy validation or production subscription-distribution promotion. |
| `docs/production-replacement-records/2026-05-26-aliyun-state-copy-preflight.md` | Read-only Aliyun private state-copy preflight. | Execution record; Aliyun candidate app, loopback Nginx, UFW, and candidate SQLite integrity are healthy, but production source internal inspection is blocked by prod-edge-a SSH banner timeout. No state copy or production mutation was performed. | Read before requesting source internal inspection, private state-copy validation, or Aliyun promotion. |
| `docs/production-replacement-records/2026-05-26-prod-edge-a-source-internal-state-copy-inspection.md` | Read-only prod-edge-a source internal state-copy inspection attempt. | Execution record; EC2 health and public production endpoints are healthy, SSM is unavailable, and SSH TCP/22 is reachable but closes before banner/auth, so source SQLite integrity and fresh backup remain unverified. No production mutation was performed. | Read before requesting source access remediation planning, private state-copy validation, or Aliyun promotion. |
| `docs/production-replacement-records/2026-05-26-singapore-prod-edge-stop.md` | Approved stop-only cleanup of Singapore `prod-edge-a` and `prod-edge-b` with accepted service outage. | Execution record; both AWS Singapore proxy-gateway nodes are stopped, DNS and security groups were left unchanged, Aliyun was not changed, and no termination was performed. | Read before rebuilding clean edge nodes, rolling back by starting stopped nodes, changing DNS, or terminating AWS resources. |
| `docs/production-replacement-records/2026-05-26-non-aliyun-node-cleanup-preflight.md` | Read-only cleanup preflight for non-Aliyun / non-HP nodes after the "Aliyun + HP only" target decision. | Execution record; AWS, AliDNS, endpoint, and repository-reference evidence show `prod-edge-a` and `prod-edge-b` cannot be stopped yet. No node cleanup mutation was performed. | Read before requesting AWS node drain, stop, termination, security-group cleanup, or MeshCentral ownership decisions. |
| `docs/production-replacement-records/2026-05-24-legacy-blue-retirement-preflight.md` | Read-only retirement preflight for legacy blue after prod-edge-a activation. | Execution record; retirement is not approved. | Read before requesting any stop, terminate, security-group cleanup, or legacy-blue retirement action. |
| `docs/production-replacement-records/2026-05-24-legacy-blue-stop.md` | Approved stop of the legacy blue EC2 instance after production DNS moved to prod-edge-a. | Execution record; legacy blue is stopped but not terminated, and its security group is retained. | Read before any legacy-blue termination, security-group cleanup, or final retirement action. |
| `docs/production-incident-records/2026-05-24-legacy-blue-connectivity-review.md` | Read-only legacy blue connectivity review and lifecycle decision record. | Execution record; legacy blue is preserved for review/controlled exit and should not become the future durable target. | Read before new blue/prod-edge-a planning, legacy blue retirement, or incident follow-up checks. |
| `docs/production-incident-records/2026-05-25-prod-edge-a-timeout-packetloss-preflight.md` | Read-only prod-edge-a timeout / packet-loss preflight across local, Aliyun, and host vantages. | Execution record; no production mutation, and sampled TCP/HTTP checks were healthy while ICMP was not authoritative. | Read before service restart, DNS change, prod-edge-b canary, traffic cutover, or data-plane observability follow-up. |
| `docs/server-edge-mesh-records/2026-05-25-server-edge-mesh-preflight.md` | Read-only prod-edge-a/prod-edge-b private mesh readiness preflight. | Execution record; no WireGuard setup or mutation performed. | Read before requesting a two-node WireGuard/private mesh canary runbook or execution approval. |
| `docs/domain-implementation-records/2026-05-24-stage0-preflight.md` | Read-only DNS/domain Stage 0 preflight facts. | Execution record; historical facts for the named date. | Read before requesting Gate 1 DNS/domain implementation approval. |
| `docs/domain-implementation-records/2026-05-24-stage1-dns-records-to-blue.md` | DNS/domain Stage 1 record for AliDNS A records pointing to current blue. | Execution record; DNS mutation only. | Read before Stage 2 HTTP-only domain validation or rollback. |
| `docs/domain-implementation-records/2026-05-24-stage2-http-only-validation.md` | DNS/domain Stage 2 record for HTTP-only public-boundary and Nginx log-redaction validation on current blue. | Execution record; read-only HTTP/Nginx validation. | Read before requesting Stage 3 HTTPS issuance approval. |

## Paused / Historical

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/DOMAIN_HTTPS.md` | Earlier domain HTTPS runbook for `sub.globalcirclecat.com`. | Paused; superseded for current execution by the domain abstraction docs unless explicitly re-enabled. | Read only for historical context or if the domain HTTPS plan is explicitly resumed. |
| `docs/superpowers/specs/*` | Design specs created during feature and ops planning. | Historical design artifacts unless referenced by current docs. | Read for background, not as the default operational source of truth. |
| `docs/superpowers/plans/*` | Implementation plans created during feature and ops work. | Historical implementation artifacts unless referenced by current docs. | Read for background on why prior work was implemented. |
| `qa-report.md` | Earlier QA summary for the MVP baseline. | Historical QA reference. | Read for old coverage context, not for current test counts. |

## Reading Order

For routine development:

1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT.md`
3. The subsystem document listed above

For production, AWS, DNS, Nginx, HTTPS, deploy, rollback, or node work:

1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT.md`
3. The relevant active Risk A runbook
4. The latest relevant execution record, if one exists

Runbooks describe gates and commands, but they do not grant approval. Real
production, AWS, DNS, Nginx, HTTPS, or cutover execution still requires a
separate explicit operator approval record.
