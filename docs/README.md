# Documentation Index

Last updated: 2026-05-29, Asia/Shanghai.

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

## Goal Documents

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/goals/2026-05-26-aliyun-subscription-control-platform-mvp.md` | Goal-driven execution plan for the Aliyun Subscription Control Platform MVP, keeping Aliyun as the control-plane candidate, HP as `local-ci-a` / operator lab, and edge capacity replaceable. | Active goal; repo-only until separate Risk A approval. | Read before starting PRs under the Aliyun control-platform MVP or assigning specialist agents to platform, entitlement, subscription access, validation, or production-ops work. |

## Workflow / Agent Rules

| Document | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `AGENTS.md` | Default agent instructions, A/B/C risk tiers, PR completion gate, validation expectations, and safety boundaries. | Active workflow rules. | Read before repo, ops, CI, network, deployment, or production-adjacent work. |
| `docs/PROJECT_OPERATING_MODEL.md` | Project operating model for source-of-truth layers, work lanes, PR definition of done, risk tiers, production gates, and subscription stability. | Active operating model; no execution authority. | Read when deciding how to classify, sequence, or parallelize project work. |
| `docs/DOMAIN_UNIT_BOUNDARIES.md` | Domain-unit boundary model separating product business, commercial entitlement, subscription access, edge nodes, local client, validation, operator lab, and production operations. | Active architecture boundary; no execution authority. | Read before mixing business, commercial, node, CI, HP Relay, Local Edge Agent, or production-ops responsibilities in one task. |
| `docs/units/README.md` | Per-unit design index for Product Business, Commercial / Entitlement, Subscription Access Control, Edge / Node Capacity, Local Client, Validation / CI, Operator Lab, and Production Operations. | Active unit design index; no execution authority. | Read when assigning a task to one primary unit or checking a unit-specific interface. |
| `docs/PROJECT_SIMPLIFICATION_MAP.md` | Project simplification map for product spine, active lanes, cleanup queue, code-inventory candidates, and stop-doing boundaries. | Active simplification map; no execution authority. | Read before slimming docs, classifying modules, or deciding whether a new idea belongs on the main product path. |
| `docs/PROJECT_CONTROL_PLANE.md` | Lightweight project control-plane model explaining how `project-state/*.json` complements docs for current state, lanes, tasks, and future consistency checks. | Active coordination model; no runtime or production authority. | Read before relying on structured project-state files or adding project-state tooling. |
| `docs/MULTI_AGENT_OPERATING_MODEL.md` | Multi-agent collaboration model covering global lead ownership, subagent roles, the two heavyweight specialist owners for Subscription Control Platform and Channel Technical MVP work, task packets, parallelization rules, verification, and no-secrets boundaries. | Active operating model; no execution authority. | Read before splitting work across multiple agents, verifying global lead versus specialist ownership, or dispatching independent review/implementation tracks. |
| `docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md` | CLI-first platform boundary: public routes stay small and explicit, while administrative workflows move to operator CLI, local/private console review, safe handoff files, and execution records. | Active product/ops boundary; no execution authority. | Read before adding public routes, Admin UI actions, operator CLI commands, subscription issuance flows, handoff material, or customer portal links. |
| `docs/OPERATOR_PROVISIONING_FORM_CONTRACT.md` | Operator provisioning form contract for turning reviewed form facts into a safe issuance input preview before CLI dry-run and separate Risk A execution approval. | Active repository tooling contract; no execution authority. | Read before adding internal forms, agent-assisted intake, operator provisioning adapters, or any workflow that prepares subscription issuance inputs. |
| `docs/ADMIN_UI_LEGACY_ARCHIVE.md` | Legacy Admin UI archive decision: the existing `admin/` app remains a local protected reference/testing surface, but is no longer the future user/operator/product UI baseline. | Active archive boundary; docs-only and no execution authority. | Read before polishing, extending, deleting, replacing, or publicly exposing the old Admin UI. |
| `docs/RESOURCE_PACKAGE_CLI.md` | CLI-first controlled-open and resource package model for turning operator-provided lead/account/entitlement/access facts into an operator-safe delivery package. | Active repository tooling contract; no execution authority. | Read before using natural-language/agent-assisted registration, subscription delivery preparation, or resource-package audit flows. |
| `docs/VALIDATION_BASELINE.md` | Current validation command matrix and PR completion gate by risk tier and touched surface. | Active validation entrypoint; not historical pass-count archive and not deploy approval. | Read before choosing which checks to run for a PR. |
| `docs/CI_MANUAL_VALIDATION.md` | Manual CI validation host workflow; target direction is local Linux manual CI, with historical Aliyun manual CI facts retained until the transition is validated. | Active runbook, not staging or deploy approval. | Read before using a manual validation host for repo-level CI evidence. |
| `docs/stage-reports/2026-05-27-pr-169-173.md` | PR cadence report for merged PRs #169-#173. | Stage report; no production or runtime authority. | Read for the five-PR checkpoint covering Aliyun promotion gates, channel investigation/comparison tooling, Gate A inventory, and Gate B source/firewall planning. |
| `docs/stage-reports/2026-05-27-pr-174-179.md` | PR cadence report for merged PRs #174-#179. | Stage report; no production or runtime authority. | Read for the checkpoint covering TUIC comparison planning, Aliyun clean-start planning and repo package, heavyweight agent ownership, and private-validation / provider-firewall gate runbooks. |
| `docs/stage-reports/2026-05-27-pr-180-184.md` | PR cadence report for merged PRs #180-#184. | Stage report; no production or runtime authority. | Read for the checkpoint covering Aliyun gate decision packet, gate evidence shell, project-state closeouts, validation evidence, and remaining A-tier gates. |
| `docs/stage-reports/2026-05-27-pr-185-189.md` | PR cadence report for merged PRs #185-#189. | Stage report; no production or runtime authority. | Read for the checkpoint covering Aliyun Admin gate review UI, execution handoff packet, execution-record templates, validation evidence, and exact-phrase A-tier gates. |
| `docs/stage-reports/2026-05-27-pr-190-194.md` | PR cadence report for merged PRs #190-#194. | Stage report; no production or runtime authority. | Read for the checkpoint covering Aliyun exact-phrase approval policy, gate-packet metadata, Admin rendering, repo MVP closeout, validation evidence, and remaining A-tier gates. |
| `docs/stage-reports/2026-05-27-pr-195-200.md` | PR cadence report for merged PRs #195-#200. | Stage report; no production or runtime authority. | Read for the checkpoint covering Aliyun candidate private validation, provider-firewall hardening, public-boundary dry run, subscription-distribution promotion, post-promotion observation, and the Aegis repair gate. |
| `docs/stage-reports/2026-05-27-pr-201-205.md` | PR cadence report for merged PRs #201-#205. | Stage report; no production or runtime authority. | Read for the checkpoint covering clean edge rebuild gate, TUIC inventory gate, opaque artifact issuance / legacy query-token retirement gates, and protected Admin gate-packet metadata. |
| `docs/stage-reports/2026-05-27-pr-206-211.md` | PR cadence report for merged PRs #206-#211. | Stage report; no production or runtime authority. | Read for the checkpoint covering TUIC read-only runtime inventory, channel runtime registry / inventory summary / gate packet, access-migration evidence capture, HP manual CI evidence, and remaining exact-phrase A-tier gates. |
| `docs/stage-reports/2026-05-27-pr-212-216.md` | PR cadence report for merged PRs #212-#216. | Stage report; no production or runtime authority. | Read for the checkpoint covering channel system decision flow, protected review API/UI, access-model inventory summary tooling, HP/manual validation evidence, and remaining exact-phrase A-tier gates. |
| `docs/stage-reports/2026-05-27-pr-217-222.md` | PR cadence report for merged PRs #217-#222. | Stage report; no production or runtime authority. | Read for the checkpoint covering channel runtime evidence bridge/review/workbench, Aegis preflight/execution, clean edge rebuild preflight, and remaining exact-phrase A-tier gates. |
| `docs/stage-reports/2026-05-27-pr-223-227.md` | PR cadence report for merged PRs #223-#227. | Stage report; no production or runtime authority. | Read for the checkpoint covering cadence-report catch-up, clean edge execution handoff, channel runtime execution handoff, B27 project-state closeout, post-226 clean edge live check, and remaining exact-phrase A-tier gates. |
| `docs/stage-reports/2026-05-27-pr-228-232.md` | PR cadence report for merged PRs #228-#232. | Stage report; no production or runtime authority. | Read for the checkpoint covering the #223-#227 cadence report, channel lab target decision, clean edge readiness summary, B28/B29 project-state closeout, C8 project-state closeout, and remaining exact-phrase A-tier gates. |
| `docs/stage-reports/2026-05-28-pr-233-237.md` | PR cadence report for merged PRs #233-#237. | Stage report; no production or runtime authority. | Read for the checkpoint covering clean edge readiness Admin review, B30 project-state closeout, historical node-change navigation, the #228-#232 cadence report, and the remaining channel-system integration gap. |
| `docs/stage-reports/2026-05-28-pr-238-242.md` | PR cadence report for merged PRs #238-#242. | Stage report; no production or runtime authority. | Read for the checkpoint covering subscription-output draft review, activation readiness, activation handoff, activation flow, the #233-#237 cadence report, and the remaining live channel/system integration gap. |
| `docs/stage-reports/2026-05-28-pr-243-247.md` | PR cadence report for merged PRs #243-#247. | Latest stage report; no production or runtime authority. | Read for the checkpoint covering activation-flow fixture/replay, activation record-template tooling/API/UI, the #238-#242 cadence report, and the remaining live channel/system integration gap. |

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
| `docs/ACCESS_MODEL_INVENTORY_SUMMARY.md` | Repository helper contract for turning safe operator-provided subscription-access inventory facts into redacted artifact-issuance preflight summaries. | B / repo-only tooling; no production query, artifact issuance, legacy-token retirement, DNS, Nginx, Aliyun, AWS, or runtime mutation. | Read before preparing safe inventory JSON for broader opaque artifact issuance or legacy query-token retirement preflight review. |
| `docs/CLEAN_EDGE_READINESS_SUMMARY.md` | Repository helper contract for turning safe operator-provided clean edge gate facts into redacted readiness summaries. | B / repo-only tooling; no cloud query, host provisioning, bootstrap, secret injection, DNS, subscription-output, Admin, AWS, or edge traffic mutation. | Read before preparing safe clean edge readiness JSON or reviewing whether preconditions are ready before exact-approved clean edge execution. |
| `docs/LOCAL_EDGE_AGENT_DESIGN.md` | Local Edge Agent design for a loopback-only channel adapter that lets Clash/Mihomo use platform-controlled remote-edge channels without system network takeover. | Active design and repo prototype reference; no production authority. | Read before prototyping a local agent, channel adapter, device credential flow, or agent-to-edge protocol. |
| `docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md` | Technical MVP definition for proving frontier-grade channel capability with SS baseline, direct Clash/Mihomo renderer support, VLESS/XUDP/Hysteria2/TUIC candidates, parked Local Edge Agent assets, QUIC/MPTCP research, measured quality gates, runtime inventory summaries, runtime registries, runtime gate packets, system decision flows, runtime evidence bridges, runtime gate workbench review, execution handoff packets, subscription-output draft reviews, production-module branch review packages, lab target decisions, and protected Admin review routes. | Active technical MVP design; no execution authority. | Read before planning channel renderer work, local-agent channel manager work, protocol candidate matrices, channel runtime inventory/registry/gate-packet/system-decision-flow/evidence-bridge/workbench/handoff/subscription-output-draft/production-module/target-decision work, protected review surfaces, or lab/prod-edge-b channel canaries. |
| `docs/CHANNEL_STRATEGY_ENGINE.md` | Repository contract for stable/private/canary/recovery node pools, default stable-pool subscription output, operator-only canary overrides, measurement evidence, decision packs, safe runtime inventory summaries, runtime registries, runtime gate packets, system decision flows, runtime evidence bridges, runtime gate workbench review, execution handoff packets, subscription-output draft reviews, target decisions, and protected Admin review integration. | Active repository contract; runtime activation remains Risk A. | Read before changing subscription node-pool selection, node summaries, canary override semantics, runtime inventory/registry/gate-packet/system-decision-flow/evidence-bridge/workbench/handoff/subscription-output-draft/target-decision semantics, protected review routes, or distribution readiness. |
| `docs/CHANNEL_TUIC_COMPARISON_CANARY_PLAN.md` | Plan for treating TUIC as the next measured channel candidate after the held Hysteria2 extended measurement. | Active channel comparison plan; no execution authority. | Read before requesting TUIC runtime inventory, TUIC runtime deployment, operator-device TUIC canary measurement, or VLESS/XUDP fallback comparison. |
| `docs/CHANNEL_CANARY_SERVER_SELECTION.md` | Server-selection gate for clean channel-runtime canary targets, covering long-haul path quality, UDP support, protocol fit, lifecycle, security, metrics, and approval phrases. | Active Risk A selection gate; explicit approval still required before server creation, runtime deployment, firewall change, production config change, or traffic canary. | Read before choosing or creating any new server for VLESS/XUDP, Hysteria2, TUIC, or other channel runtime experiments. |
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

## Historical Node Change Index

Use this section when tracing how a node, slot, or provider role changed over
time. It is an audit index only: it does not replace live AWS, Aliyun, DNS,
Nginx, systemd, SQLite, endpoint, or project-state verification, and it does
not authorize rollback, start, stop, termination, firewall, DNS, subscription
output, or traffic changes.

| Node / slot / role | Key records | Current reading posture |
| --- | --- | --- |
| Legacy blue AWS host | `docs/production-incident-records/2026-05-24-legacy-blue-connectivity-review.md`, `docs/production-replacement-records/2026-05-24-legacy-blue-fresh-backup-restore.md`, `docs/production-replacement-records/2026-05-24-legacy-blue-retirement-preflight.md`, `docs/production-replacement-records/2026-05-24-legacy-blue-stop.md` | Read before legacy-blue rollback, data-source review, stop/terminate planning, or security-group cleanup. The host was stopped for review, not terminated. |
| Green / prod-edge-b iteration candidate | `docs/production-replacement-records/2026-05-24-green-candidate-creation.md`, `docs/production-replacement-records/2026-05-24-green-refresh-current-master.md`, `docs/production-replacement-records/2026-05-24-green-cutover-preflight.md` | Read before interpreting early green/prod-edge-b candidate facts or carrying-instance lifecycle decisions. These records do not grant current traffic authority. |
| prod-edge-a primary replacement path | `docs/production-replacement-records/2026-05-24-prod-edge-a-candidate-preflight.md`, `docs/production-replacement-records/2026-05-24-prod-edge-a-candidate-creation.md`, `docs/production-replacement-records/2026-05-24-prod-edge-a-cutover-preflight.md`, `docs/production-replacement-records/2026-05-24-prod-edge-a-production-activation.md`, `docs/production-incident-records/2026-05-25-prod-edge-a-timeout-packetloss-preflight.md` | Read before reconstructing the AWS primary replacement history, DNS move, health reviews, or later stopped-node decisions. |
| prod-edge-a HTTPS / artifact access | `docs/production-replacement-records/2026-05-24-prod-edge-a-https-preflight.md`, `docs/production-replacement-records/2026-05-24-prod-edge-a-https-issuance.md`, `docs/production-replacement-records/2026-05-24-opaque-artifact-production-canary.md`, `docs/production-replacement-records/2026-05-24-active-tenant-legacy-link-drain.md` | Read before changing HTTPS redirect behavior, opaque artifact exposure, artifact logging, or legacy query-token drain plans. |
| Non-Aliyun node cleanup and Singapore stop | `docs/production-replacement-records/2026-05-26-non-aliyun-node-cleanup-preflight.md`, `docs/production-replacement-records/2026-05-26-singapore-prod-edge-stop.md` | Read before any AWS node drain, stop, rollback-start, termination, security-group deletion, or clean-edge rebuild decision. Singapore `prod-edge-a` and `prod-edge-b` were stopped with accepted outage; no termination was performed. |
| Aliyun subscription control / distribution host | `docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup-inventory.md`, `docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup.md`, `docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-preparation.md`, `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-execution.md`, `docs/production-replacement-records/2026-05-27-aliyun-production-subscription-distribution-promotion.md`, `docs/production-replacement-records/2026-05-27-aliyun-promotion-observation-aegis-readonly.md` | Read before changing Aliyun subscription distribution, public boundary, control-plane state, observation posture, or Aegis follow-up. Public Admin remains out of scope. |
| Aliyun firewall / management-source history | `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-execution.md`, `docs/production-replacement-records/2026-05-27-aliyun-hp-management-source-firewall-execution.md`, `docs/production-replacement-records/2026-05-27-aliyun-public-boundary-dry-run-execution.md` | Read before provider-firewall rollback, HP management-source adjustment, public-boundary dry run, or DNS promotion review. |
| Future clean edge / prod-edge-c path | `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md`, `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-preflight.md`, `docs/production-replacement-records/2026-05-27-clean-edge-rebuild-execution-handoff.md`, `docs/production-replacement-records/2026-05-27-post-226-clean-edge-live-check.md`, `ops/edge-node/README.md` | Read before exact-approved clean host provisioning, bootstrap, private edge validation, `ss-sg` migration, edge traffic activation, or stopped-node cleanup. |
| Channel-lab-a runtime canary host | `docs/production-replacement-records/2026-05-26-channel-canary-server-selection-inventory.md`, `docs/production-replacement-records/2026-05-26-channel-lab-a-creation.md`, `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-runtime.md`, `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-operator-device-canary.md`, `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-mihomo-import-validation.md`, `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-extended-measurement.md`, `docs/production-replacement-records/2026-05-27-tuic-runtime-inventory-execution.md` | Read before Hysteria2 investigation, TUIC/VLESS-XUDP comparison, channel-lab-a cleanup, or selecting a new channel-lab-b target. |
| Channel-lab-b TUIC canary path | `docs/production-replacement-records/2026-05-28-channel-lab-b-creation.md`, `docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-runtime.md`, `docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-operator-device-canary.md`, `docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-extended-measurement.md`, `docs/production-replacement-records/2026-05-28-aliyun-tuic-subscription-output-integration-inventory.md`, `docs/production-replacement-records/2026-05-28-aliyun-tuic-host-provider-inventory.md`, `docs/production-replacement-records/2026-05-28-aliyun-cloud-assistant-tuic-host-inventory.md`, `docs/production-replacement-records/2026-05-28-tuic-subscription-output-canary-planning.md`, `docs/production-replacement-records/2026-05-28-tuic-subscription-output-dry-run-package.md`, `docs/production-replacement-records/2026-05-28-tuic-subscription-output-config-review.md`, `docs/production-replacement-records/2026-05-28-tuic-controlled-access-activation-mechanism.md`, `docs/production-replacement-records/2026-05-28-tuic-controlled-access-activation-request.md`, `docs/production-replacement-records/2026-05-28-tuic-controlled-access-activation-stopped.md`, `docs/production-replacement-records/2026-05-28-tuic-controlled-operator-access-creation.md`, `docs/production-replacement-records/2026-05-28-tuic-controlled-access-activation.md` | Read before TUIC dry-run package generation, canary-only subscription-output activation, real controlled-access config decisions, channel-lab-b cleanup, DNS/config changes, or all-user rollout. One controlled operator access now outputs TUIC through `channel-lab-b-tuic`; all-user rollout remains unperformed. |
| Server edge mesh preflight | `docs/server-edge-mesh-records/2026-05-25-server-edge-mesh-preflight.md`, `docs/SERVER_EDGE_MESH_DESIGN.md`, `docs/SERVER_EDGE_MESH_WIREGUARD_CANARY_RUNBOOK.md` | Read before any private mesh, WireGuard, edge-to-edge management, or mesh-assisted recovery work. |

### Detailed Execution Record Indexes

For full chronological logs and raw execution facts, refer to the specific area indexes:
- [Production Replacement Index](INDEX_PRODUCTION_REPLACEMENT.md)
- [Production Incident Index](INDEX_PRODUCTION_INCIDENT.md)
- [Domain Implementation Index](INDEX_DOMAIN_IMPLEMENTATION.md)
- [Server Edge Mesh Index](INDEX_SERVER_EDGE_MESH.md)



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
