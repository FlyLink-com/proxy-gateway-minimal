# Project Context

Last updated: 2026-05-27, Asia/Shanghai.

This file is the compact handoff note for continuing
`proxy-gateway-minimal`. Read it first, then inspect the live repo state before
making claims or changes. It intentionally summarizes current facts and links
to detailed records instead of repeating historical execution logs.

## How To Use This File

Use this file for:

- Current repo/source-of-truth orientation.
- Current product direction and risk boundaries.
- Current documented production snapshot.
- Active blockers and next work lanes.
- Latest validation baseline and quick commands.

Do not use this file as:

- A production inventory source.
- A deployment approval.
- A replacement for live DNS, AWS, Nginx, systemd, SQLite, tenant, or endpoint
  verification.
- A place to store secrets, tokens, subscription URLs, credentials, SQLite data,
  or customer data.

Detailed navigation lives in `docs/README.md`. Structured project state lives in
`project-state/*.json`; it is a coordination aid, not a runtime control plane.

## Repository

```text
C:\Users\g\Projects\订阅管理\proxy-gateway-minimal
```

The active code source of truth is GitHub
`gaoyi1020-web/proxy-gateway-minimal` plus the local checkout above.

Do not use these as active code checkouts:

- `C:\Users\g\OneDrive\文档\订阅管理` - legacy empty Codex project shell.
- `C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal` -
  historical archaeology only.

Before any repo work:

```powershell
cd C:\Users\g\Projects\订阅管理\proxy-gateway-minimal
git status --short --branch
git fetch origin
```

## Workflow Boundary

Default risk tiers live in `AGENTS.md`:

- C: docs-only; usually validate with `git diff --check origin/master...HEAD`.
- B: repo code, tests, Admin UI, local tooling; run focused checks plus the
  relevant project tests.
- A: AWS, production, DNS, Nginx, HTTPS, systemd, security groups, nodes, auth
  model, schema/migration, deploy, rollback, or tenant/artifact mutation. A-tier
  work requires read-only inventory, dry-run, explicit operator approval,
  validation, and rollback evidence.

Do not lower risk just because a task is easy to run locally.

Every PR must complete its approved design -> execution -> validation loop
before it is marked Ready, submitted for merge, or reported complete. A
spec-only, runbook-only, or inventory-only PR is allowed only when that is the
explicit scope and the PR body states the non-goals, skipped execution, and next
approval gate.

`docs/PROJECT_OPERATING_MODEL.md` also defines the PR cadence reporting rule:
after every five merged PRs, give a concise stage report covering the PR range,
risk tiers, validation evidence, production boundary changes, blockers, and
recommended next actions.

Latest cadence report:

```text
docs/stage-reports/2026-05-27-pr-217-222.md
```

## Current Product Direction

The active product spine is:

```text
stable subscription/import experience
  -> authoritative subscription control plane
  -> replaceable edge data-plane capacity
  -> loopback-only local client adapter path
  -> measured validation and operations
```

Current architecture priorities:

- Active Goal: `docs/goals/2026-05-26-aliyun-subscription-control-platform-mvp.md`
  is the current goal-driven execution baseline. It started repo-only B/C and
  HP `ci-full` validation first; subsequent exact-phrase A-tier approvals now
  cover the completed clean-start private validation, provider-firewall
  hardening, public-boundary dry run, and production subscription-distribution
  promotion records. It still does not authorize public Admin, edge traffic,
  AWS rollback-start, historical state copy, broader artifact issuance, or
  legacy query-token retirement.
- Aliyun User Management / Subscription Distribution: the near-term business
  split is Aliyun for user management/subscription distribution, HP for local CI/operator
  lab, and all other nodes in a controlled drain/retirement queue. See
  `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`.
- Public Site / Portal Split: the repository now treats the static company site
  as a public brand/cooperation surface for geek-style AI research, mainstream
  media advertising, operations growth, and frontier product research. Logged-in
  customer portal entry is a separate operator-issued dynamic entry concept and
  must not be hard-linked from the public site or public campaign landing pages.
  The public site uses a repository-only `/api/public/leads` intake endpoint
  for validated contact submissions; no external Webhook/CRM/email automation,
  DNS, or production deployment is implied by that route.
- Platform Domain Contract: repository-only platform lead, account,
  entitlement, and subscription-access grant shapes live under
  `server/services/platform/control-plane-contract.mjs`. They provide
  validation and operator-safe summaries only; no SQLite schema, production
  storage, billing provider, Aliyun runtime, DNS, or user traffic is activated.
- Platform Lead Review Queue: repository-only public lead intake can now feed an
  in-memory platform review queue under
  `server/services/platform/lead-review-queue.mjs`, with protected operator
  routes in `server/routes/admin-platform.mjs`. This is not CRM, Webhook,
  email automation, Aliyun deployment, production storage, or customer portal
  activation.
- Platform Account / Entitlement Shell: repository-only protected Admin routes
  can convert reviewed leads into in-memory account summaries and create/list
  account entitlement summaries through
  `server/services/platform/account-entitlement-shell.mjs`. Entitlement
  usability is fail-closed from status and validity windows. This is not
  billing, payment collection, CRM, SQLite persistence, Aliyun deployment,
  production storage, customer portal activation, DNS, or user traffic.
- Platform Dynamic Entry / Access Grant Shell: repository-only protected Admin
  routes can issue and list in-memory subscription access grant summaries
  through `server/services/platform/subscription-access-shell.mjs`. The
  summary exposes only operator-safe metadata such as issued status, delivery
  type, visible-once posture, and whether dynamic entry or artifact references
  exist. It does not expose raw customer portal URLs, artifact references,
  subscription URLs, SQLite persistence, Aliyun deployment, production storage,
  public portal resolution, DNS, or user traffic.
- Platform Clean-Start Package: repository-only clean-start readiness support
  lives in `server/services/platform/clean-start-control-plane.mjs` and the
  protected Admin route `/api/admin/platform/clean-start`. It summarizes
  account, entitlement, access-grant, and private rendering dry-run readiness
  without exposing raw portal URLs, artifact references, subscription URLs,
  node hosts, node credentials, source-state paths, tokens, customer emails, or
  organization names. It is not Aliyun deployment, runtime initialization,
  public listener exposure, DNS, provider-firewall hardening, SQLite
  persistence, state copy, user traffic, or production authority.
- Platform Aliyun Gate Decision Packet: repository-only gate-decision support
  lives in `server/services/platform/aliyun-gate-decision-packet.mjs` and the
  protected Admin route `/api/admin/platform/aliyun-gates`. It summarizes the
  clean-start private validation, provider-firewall hardening,
  public-boundary dry run, DNS promotion, broader opaque artifact issuance,
  and legacy query-token retirement gates with explicit approval phrases for
  the next executable A-tier gates, blockers, source docs, and not-authorized
  actions. It does not expose firewall raw rules, management source labels, raw
  portal URLs, artifact references, subscription URLs, node hosts, node
  credentials, tokens, customer emails, or organization names. It is not Aliyun
  deployment, firewall mutation, public listener exposure, DNS, state copy, AWS
  mutation, artifact issuance, legacy query-token retirement, legacy route
  removal, user traffic, edge traffic, or production authority.
- Platform Aliyun Gate Evidence Shell: repository-only operator evidence
  support lives in `server/services/platform/aliyun-gate-evidence-shell.mjs`
  with protected Admin routes `/api/admin/platform/aliyun-gate-evidence` and
  `/api/admin/platform/aliyun-gate-evidence/provider-firewall` plus
  `/api/admin/platform/aliyun-gate-evidence/access-migration`. It records
  in-memory provider-firewall and access-migration gate evidence for decision
  support and exposes only status/boolean summaries. It lets the gate decision
  packet consume boolean internal evidence without retaining or echoing
  firewall raw rules, management-source labels, wg-home decision text, private
  notes, raw portal URLs, artifact references, subscription URLs, raw tokens,
  node hosts, node credentials, customer emails, or organization names. It is
  not Aliyun deployment, firewall
  mutation, UFW change, public listener exposure, DNS, SQLite persistence,
  state copy, AWS mutation, artifact issuance, legacy query-token retirement,
  user traffic, edge traffic, or production authority.
- Platform Access Model Inventory Summary: repository-only local tooling can
  normalize operator-provided subscription-access inventory facts into a
  redacted preflight summary through
  `server/services/platform/access-model-inventory-summary.mjs` and
  `scripts/access-model-inventory-summary.mjs`. It accepts only safe counts,
  booleans, and note labels; rejects raw subscription URLs, raw artifact URLs,
  tokens, artifact secrets, customer emails, SQLite rows, credentials, and
  other unsupported fields without echoing submitted values; and produces
  blocker evidence for broader opaque artifact issuance preflight. It is not
  Aliyun runtime inspection, SQLite access, artifact issuance, legacy
  query-token retirement, legacy route removal, DNS, Nginx, firewall, AWS,
  edge traffic, or production authority.
- Platform Aliyun Gate Review UI: repository-only Admin Overview support can
  show the protected Aliyun gate decision packet and gate-evidence summary for
  operator review. It displays exact-phrase fail-closed approval policy
  metadata for the executable gates without showing approval phrase text. It
  can record provider-firewall and access-migration evidence only as booleans
  and does not submit approval phrases or expose A-tier execution buttons. It
  does not display or submit raw firewall rules, management-source labels,
  wg-home decision text, notes, raw portal URLs, artifact references,
  subscription URLs, raw tokens, node hosts, node credentials, customer emails,
  or organization names. It is not Aliyun deployment, firewall mutation, UFW
  change, public listener exposure, DNS, SQLite persistence, state copy, AWS
  mutation, artifact issuance, legacy query-token retirement, user traffic,
  edge traffic, or production authority.
- Aliyun Promotion Runbook / Package 5: the repository-only promotion gate
  model is documented in `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`
  and recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-promotion-runbook-readiness.md`.
  It separates repo-only design, live read-only inventory, source-state
  decision, private state-copy validation, public-boundary dry run, DNS
  promotion, observation, rollback, and cleanup. It does not authorize Aliyun
  deployment, DNS changes, state copy, public listener exposure, edge traffic,
  or production authority transfer.
- Aliyun Clean-Start Control Plane: the Gate B clean-start recommendation is
  now captured as the default planning direction in
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-control-plane-plan.md`.
  Clean-start means Aliyun is planned as a new subscription-control authority
  without copying historical AWS SQLite, artifact, legacy query-token, or
  subscription-output state. The clean-start repo package now exists as
  protected operator-safe readiness and private rendering dry-run metadata. The
  next execution gates are separate A-tier approvals for clean-start private
  validation and provider-firewall hardening, documented in
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md`
  and
  `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md`.
  The next-gate handoff packet lives in
  `docs/production-replacement-records/2026-05-27-aliyun-next-a-tier-execution-packet.md`;
  it copies the exact approval phrases and evidence targets for the two gates
  and explicitly says that short confirmations such as `同意`, `继续`, or
  `开始` do not authorize execution. It is repo-only documentation and does
  not perform Aliyun, firewall, DNS, runtime, state, or traffic mutation.
  Execution-record templates for the two next gates live under
  `docs/production-replacement-records/templates/` and must only be copied into
  dated execution records after the matching exact approval phrase is received.
  The repository also has a tested Aliyun gate approval-phrase policy in
  `server/services/platform/aliyun-gate-decision-packet.mjs`; it accepts only
  the exact phrase for the named gate and rejects short confirmations without
  echoing submitted text. The gate packet exposes the same fail-closed
  policy as operator-facing metadata for the clean-start private validation and
  provider-firewall hardening gates, while still exposing no approval
  submission route and no execution control.
  The protected `/api/admin/platform/aliyun-gates` packet can now show which
  next gates are ready for operator approval and which remain blocked, and the
  protected gate-evidence shell can record operator-provided provider-firewall
  evidence for that packet. Runtime initialization, public-boundary dry run,
  and production subscription-distribution promotion have execution records;
  edge rebuild and rollback-start remain separate A-tier gates.
  The repo-only B/C MVP closeout audit lives in
  `docs/production-replacement-records/2026-05-27-aliyun-repo-mvp-closeout.md`
  and records that repository contracts, protected Admin review surfaces, gate
  policy metadata, and validation boundaries are ready for the next exact-phrase
  A-tier decision gate. The exact-phrase clean-start private validation
  attempt is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-execution.md`;
  it refreshed the loopback-only Aliyun candidate runtime to current `master`,
  initialized candidate-only in-memory validation state, and passed private
  clean-start rendering metadata checks. No DNS, public listener, public Admin,
  provider firewall, AWS, historical state-copy, edge traffic, user traffic, or
  production authority transfer was performed. The provider-firewall hardening
  execution record is
  `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-execution.md`;
  it removed broad provider inbound rules and left only current operator
  management `/32` access for SSH and the existing wg-home UDP lab path. Public
  80/443/3456/18080 remain closed, AliDNS is unchanged, and no public-boundary
  dry run, DNS promotion, user traffic, edge traffic, AWS mutation, or
  production authority transfer was performed. The HP management-source
  follow-up is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-hp-management-source-firewall-execution.md`;
  it added HP public `/32` as a separate provider-firewall management source
  for SSH and existing wg-home UDP, corrected a temporary broad-rule creation
  issue in the same execution, verified HP TCP/22 reachability and UDP/51820
  arrival at Aliyun, and still performed no DNS, public listener, public Admin,
  state-copy, user traffic, edge traffic, AWS mutation, or production authority
  transfer. The HP wg-home logical handshake remained stale and is a separate
  operator-lab follow-up if needed. The public-boundary dry run is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-public-boundary-dry-run-execution.md`;
  it temporarily opened HP-scoped 80/443, validated that Nginx can expose
  `/api/health` while keeping Admin and root paths blocked and 3456/18080
  private, then removed the temporary provider rules, UFW rules, Nginx config,
  and temporary self-signed certificate. Final public 80/443/3456/18080 are
  closed again, AliDNS is unchanged, and no user traffic, state-copy, AWS
  mutation, or production authority transfer was performed. The exact-phrase
  production subscription-distribution promotion is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-production-subscription-distribution-promotion.md`;
  it promoted `sub.globalcirclecat.com` to the Aliyun public subscription
  boundary with durable 80/443 and HTTPS, validated public health/Admin
  blocking/no-token behavior plus a single authorized smoke refresh, and kept
  `ss-sg.globalcirclecat.com`, edge traffic, AWS, historical state copy,
  public Admin, 3456, and 18080 out of scope. The smoke tenant is disabled and
  the Aliyun `aegis.service` side effect is recorded for follow-up. The
  post-promotion observation and Aegis read-only follow-up is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-promotion-observation-aegis-readonly.md`;
  it observed five stable public samples, confirmed DNS remained in the
  intended split state, confirmed DB aggregate safety, and diagnosed Aegis as a
  failed systemd unit with Aegis processes still present. No Aegis repair or
  other host mutation was performed. The optional Aegis repair gate is defined
  in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-runbook.md`,
  with a matching execution template in
  `docs/production-replacement-records/templates/aliyun-aegis-service-repair-execution-template.md`.
  It requires an exact approval phrase and is limited to Aegis-only process
  cleanup and service restart with proxy-gateway health guards. A fresh
  read-only preflight is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-preflight.md`;
  it confirms the subscription boundary remains healthy, public Admin remains
  blocked, 3456/18080 remain externally closed from HP, SQLite integrity and
  safe aggregates are ok, and `aegis.service` is still failed due to leftover
  Aegis process state. The exact-phrase Aegis repair execution is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-execution.md`;
  it attempted `reset-failed`, `start`, and Aegis-only process cleanup, but
  the stuck Aegis/AliYunDun processes could not be terminated within the gate
  and `aegis.service` remains failed. The repair stopped safely: subscription
  health remained 200, public Admin remained 404, no-token refresh remained
  401, DNS stayed unchanged, Nginx/ufw/proxy-gateway/certbot stayed active,
  SQLite integrity stayed ok, 3456/18080 stayed externally closed from HP, and
  no reinstall, disablement, reboot, DNS, firewall, Nginx, proxy-gateway,
  AWS, tenant, artifact, or edge mutation was performed.
- Clean Edge Node Rebuild Gate: the next clean edge data-plane rebuild gate is
  defined in
  `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md`,
  with a matching execution template in
  `docs/production-replacement-records/templates/clean-edge-node-rebuild-execution-template.md`.
  It treats the rebuilt edge host as replaceable data-plane capacity, not as
  the current Aliyun control-plane host, HP, or a rollback-start of the stopped
  AWS nodes. It requires an exact approval phrase before clean host
  provisioning/bootstrap/private validation and explicitly keeps DNS,
  subscription output, user traffic, public Admin, AWS rollback-start,
  stopped-node termination, and security-group deletion out of scope. A fresh
  read-only preflight is recorded in
  `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-preflight.md`;
  it confirms the Aliyun subscription boundary is healthy from a remote
  vantage, public Admin is blocked, no-token refresh returns 401, Aliyun
  3456/18080/18388 are not externally reachable from that vantage, the old AWS
  edge address is not serving, `prod-edge-a/b` remain stopped without public IP
  association, and no clean edge target has been selected or provisioned. The
  execution handoff packet is recorded in
  `docs/production-replacement-records/2026-05-27-clean-edge-rebuild-execution-handoff.md`;
  it recommends `prod-edge-c` as the first clean rebuild logical identity and
  consolidates the approval phrase, start checklist, stop conditions, execution
  envelope, execution-record target, and not-performed boundaries for a future
  Production Operations Agent.
- Subscription Control / Edge Split: keep subscription state, Admin actions,
  opaque artifacts, and rendering authoritative in the control plane. CI has
  moved off the current Aliyun server, and that host now serves the approved
  public subscription-distribution boundary while keeping the app private,
  Admin blocked, and edge data-plane activation out of scope.
- Edge Data Plane: AWS Singapore `prod-edge-a/b` have been stopped under an
  accepted-outage cleanup decision. New edge capacity now needs clean rebuild
  planning; do not describe the current state as serving production traffic.
- Validation / CI: move manual CI toward a local Linux validation host so the
  future production subscription control plane does not also run repository
  validation workloads.
- Channel Upgrade MVP: prioritize Clash/Mihomo-native subscription rendering
  for multi-protocol channel candidates. SS remains the baseline; VLESS/XUDP,
  Hysteria2, and TUIC are renderer-supported candidate families; QUIC/MPTCP stay
  research items until measured in controlled canaries. The repository channel
  strategy engine now separates default `stable` output from `private`,
  `canary`, and `recovery` capacity while preserving explicit operator canary
  assignment as single-node output. Repository measurement scoring can now turn
  local benchmark summaries into advisory quality tiers and recommended pools;
  candidate reports can join dry-run config metadata with scores into
  stable/canary/private/hold/missing-measurement groups for operator review,
  and decision packs can turn those inputs into safe baseline/canary/blocker
  artifacts. Channel runtime inventory summary support can now normalize
  operator-provided runtime gate facts into safe summary artifacts without raw
  hosts, ports, URLs, credentials, raw logs, tokens, subscription URLs, or
  customer data. Channel runtime registry integration can join dry-run config,
  measurement score, and those safe runtime inventory summaries into
  canary-ready, runtime-blocked, and missing-inventory groups without contacting
  edge nodes or mutating runtime state. Channel runtime gate packets can turn
  the registry into an operator-safe approval-readiness packet for the next
  separate Risk A runtime canary gate without submitting approval phrases,
  deploying runtimes, moving traffic, or changing subscription output. Channel
  system decision flows can now build the runtime inventory summary, runtime
  registry, runtime gate packet, and top-level readiness status from the three
  safe local inputs in one repository artifact without contacting edge nodes or
  authorizing runtime changes. A protected Admin platform route can now expose
  the same channel system decision flow for operator review surfaces without
  adding approval submission, runtime, DNS, firewall, traffic, or
  subscription-output controls. The protected Admin Overview can now consume
  that route from a read-only channel system review panel, so operators can
  paste a safe evidence packet and inspect flow status, required next action,
  canary readiness, and runtime blockers without execution controls. The
  channel runtime evidence bridge can now convert safe runtime evidence packets
  into runtime inventory input and the full system decision readiness artifact
  without edge-node contact, runtime mutation, approval submission, traffic
  movement, or production activation. The protected Admin platform route and
  Admin Overview review panel can now run that bridge from safe operator
  runtime evidence packets without requiring CLI composition and without
  exposing runtime deployment, approval submission, DNS, firewall, traffic, or
  subscription-output controls. A protected channel runtime gate workbench can
  now turn the same safe runtime bridge packets into gate-facing advisory
  status, counts, approval-readiness metadata, and candidate groupings without
  adding approval submission, approval-phrase echo, runtime execution,
  edge-node contact, traffic movement, or production activation. Extended measurement assessments can classify
  already-collected local benchmark summaries as ready, needing more samples,
  or hold for investigation before an operator decides on the next canary gate. Measurement
  investigation reports can consume safe bundle reports and classify hold
  patterns such as sustained tail latency or isolated tail spikes into
  advisory next actions. Candidate comparison plans can combine those
  investigation reports with dry-run config summaries to identify TUIC or
  VLESS/XUDP as the next measured candidate family after a held Hysteria2
  result. These repository tools do not mutate runtime config or activate
  nodes. Runtime
  canaries are gated by
  `docs/CHANNEL_CANARY_SERVER_SELECTION.md` and
  `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`; repository renderer/config support
  does not authorize server creation or remote protocol deployment by itself.
  The Technical MVP baseline wording is now aligned with the current Aliyun
  subscription boundary and stopped AWS edge state: SS remains a comparison and
  rollback model, not proof of currently serving edge traffic. The next TUIC
  Stage 0 read-only inventory handoff is
  `docs/production-replacement-records/2026-05-27-tuic-runtime-inventory-gate.md`;
  it requires the exact inventory approval phrase before any live inventory and
  still does not authorize TUIC runtime deployment, port exposure, subscription
  output changes, operator-device traffic, or cleanup mutation.
  The approved Stage 0 read-only inventory execution is recorded in
  `docs/production-replacement-records/2026-05-27-tuic-runtime-inventory-execution.md`.
  It verified `channel-lab-a` AWS identity, running state, SG posture, ENI, and
  TUIC upstream release metadata, but host-internal inventory was blocked by
  SSH banner timeout and SSM was unavailable. TUIC deployment remains blocked;
  the recommended next path is a clean `channel-lab-b` comparison gate, or a
  separate `channel-lab-a` access/port/cleanup plan before reuse.
- Local Edge Agent: keep as a parked future node/agent adaptation asset, not
  the current mainline for the next channel-upgrade slice.
- Server Edge Mesh: plan private edge-to-edge health, management, validation,
  and recovery paths. It is not a user VPN and does not authorize WireGuard
  execution by itself.
- Operator Lab / HP Relay: useful for local path and upstream behavior
  research, but not production, staging, CI, `prod-edge-c`, Server Edge Mesh, or
  the official Local Edge Agent runtime.

Use these docs for detail:

- `docs/PROJECT_TOPOLOGY.md`
- `docs/goals/2026-05-26-aliyun-subscription-control-platform-mvp.md`
- `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`
- `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`
- `docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md`
- `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md`
- `docs/LOCAL_EDGE_AGENT_DESIGN.md`
- `docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md`
- `docs/CHANNEL_STRATEGY_ENGINE.md`
- `docs/CHANNEL_CANARY_SERVER_SELECTION.md`
- `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`
- `docs/SERVER_EDGE_MESH_DESIGN.md`
- `docs/PROJECT_SIMPLIFICATION_MAP.md`
- `docs/MULTI_AGENT_OPERATING_MODEL.md`

## Current Production Snapshot

This snapshot reflects documented project state as of 2026-05-27. Refresh live
AWS, DNS, Nginx, service, endpoint, and SQLite state before A-tier work.

- Current subscription-distribution status: Aliyun promotion executed for
  `sub.globalcirclecat.com`; edge data-plane service is still not activated.
- Current DNS records:
  `sub.globalcirclecat.com -> 47.251.178.125` and
  `ss-sg.globalcirclecat.com -> 13.215.156.159`.
- `sub.globalcirclecat.com` serves the Aliyun public subscription boundary over
  HTTP/HTTPS with `/api/health` returning 200, public Admin/root returning 404,
  and no-token subscription refresh returning 401. Public Admin is not exposed.
- `ss-sg.globalcirclecat.com` remains on the old AWS stopped address by design;
  edge traffic activation was not approved in the promotion gate.
- AWS Singapore `prod-edge-a` and `prod-edge-b` are stopped under accepted
  outage.
- Current stopped primary instance: `i-0b7791340d3fedff5`; security group
  retained: `sg-0379ece0b3d305c43`.
- Current stopped secondary instance: `i-0ad8676ee113d14cb`; security group
  retained: `sg-06682c36aa03834f7`.
- The stopped instances have no Elastic IP associations after stop; rollback by
  start may require DNS/config updates if AWS assigns new public IPv4 addresses.
- HTTPS and public subscription endpoints on the stopped AWS nodes are not the
  current subscription-distribution authority after Aliyun promotion; edge
  traffic still needs clean rebuild or separate rollback-start approval.
- The active opaque artifact canary exists for controlled operator validation.
  The full import URL is stored only in a local `C:\tmp\...` file and must not
  be pasted, committed, logged, or written into docs.
- Legacy `/sub/clash.yaml?token=...` support still exists until a separate
  A-tier retirement plan is approved.
- Subscription V2 tracked config still references `prod-edge-a` and
  `prod-edge-b`, but those carrying instances are stopped under the accepted
  outage decision.
- The latest non-Aliyun node cleanup preflight is recorded in
  `docs/production-replacement-records/2026-05-26-non-aliyun-node-cleanup-preflight.md`.
  It refreshed AWS, AliDNS, public endpoint, and repository-reference evidence
  and did not perform any stop, terminate, DNS, security-group, runtime, tenant,
  SQLite, or artifact mutation.
- The approved stop-only cleanup is recorded in
  `docs/production-replacement-records/2026-05-26-singapore-prod-edge-stop.md`.
  It stopped `prod-edge-a` and `prod-edge-b`, retained security groups, left
  DNS unchanged, did not terminate instances, and did not mutate Aliyun.
- The approved Aliyun subscription-distribution promotion is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-production-subscription-distribution-promotion.md`.
  It changed only `sub.globalcirclecat.com`, opened durable Aliyun 80/443,
  issued HTTPS for the subscription boundary, verified public health/Admin
  blocking/no-token and authorized-smoke behavior, left `ss-sg` unchanged, did
  not activate edge traffic, and recorded an Aliyun `aegis.service` follow-up.
- The post-promotion observation and Aegis read-only follow-up is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-promotion-observation-aegis-readonly.md`.
  It observed five stable public samples, preserved the intended DNS split,
  confirmed DB integrity and disabled-smoke state, and found `aegis.service`
  failed while Aegis updater/client/monitor processes remain present. It did
  not mutate DNS, firewall, Nginx, proxy-gateway, Aegis, AWS, tenants,
  artifacts, or edge traffic.
- The optional Aegis repair runbook is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-runbook.md`.
  It defines the exact approval phrase, Aegis-only repair scope, hard stops,
  post-repair validation, and sensitive-output boundaries. It does not execute
  Aegis process cleanup, service restart, reinstall, disablement, reboot, or
  any DNS / Nginx / proxy-gateway / firewall / AWS / tenant / edge mutation.
- The fresh Aegis repair preflight is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-preflight.md`.
  It confirms the Aliyun subscription boundary is still healthy, Admin/no-token
  behavior remains safe, private ports remain externally closed from HP,
  SQLite integrity and safe aggregate counts are ok, and `aegis.service`
  remains failed with leftover Aegis process evidence. It does not execute
  repair mutation and still requires the exact Aegis repair approval phrase.
- The Aegis repair execution is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-execution.md`.
  Exact approval was received, `reset-failed` and `start` were attempted, and
  Aegis-only process cleanup was attempted. The repair failed and stopped
  safely because the stuck Aegis/AliYunDun processes could not be terminated
  within this gate. `aegis.service` remains failed, but the subscription
  boundary, DNS, Nginx, UFW, proxy-gateway, SQLite integrity, and private-port
  posture remained safe and unchanged. Broader vendor-agent repair, package
  reinstall, Aegis disablement, or host reboot remains unapproved.
- The clean edge node rebuild runbook is recorded in
  `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md`.
  It defines the exact approval phrase, clean edge host/bootstrap/private
  validation scope, rollback/stop posture, hard stops, and next gates. It does
  not execute cloud provisioning, DNS changes, subscription-output changes,
  user traffic, public Admin exposure, AWS rollback-start, stopped-node
  termination, or security-group deletion. It also keeps the current Aliyun
  subscription-control host and HP out of the edge-node role. The matching
  read-only preflight is recorded in
  `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-preflight.md`.
  It excludes proxy-contaminated local Windows DNS/TCP checks, uses AliDNS and
  Aliyun remote-vantage evidence, confirms `sub` on Aliyun, `ss-sg` on the old
  stopped AWS address, private Aliyun app ports closed externally, stopped AWS
  nodes without public IP association, and no selected clean edge target. The
  execution handoff packet is recorded in
  `docs/production-replacement-records/2026-05-27-clean-edge-rebuild-execution-handoff.md`;
  it remains docs-only and does not provision, assign, bootstrap, inject
  secrets, start services, change DNS, or change subscription output.
- The opaque artifact issuance and legacy query-token retirement runbook is
  recorded in
  `docs/production-replacement-records/2026-05-27-opaque-artifact-issuance-and-legacy-token-retirement-runbook.md`.
  It splits broader artifact issuance from later legacy query-token retirement,
  defines exact approval phrases and execution templates for both gates, and
  keeps future route removal as a separate compatibility gate. It does not
  issue artifacts, rotate or drain legacy tokens, change DNS, change Nginx,
  expose public Admin, activate edge traffic, mutate AWS, copy historical
  state, or record raw subscription URLs, tokens, or artifact secrets.
- The access-model inventory summary helper is documented in
  `docs/ACCESS_MODEL_INVENTORY_SUMMARY.md`. It is repo-only B-tier support for
  those gates: it can produce redacted preflight summaries from safe operator
  JSON, but it does not gather live inventory or execute either A-tier gate.
- The latest channel canary server selection inventory is recorded in
  `docs/production-replacement-records/2026-05-26-channel-canary-server-selection-inventory.md`.
  It recommends a clean provider-neutral `channel-lab-a` target and Hysteria2
  as the first protocol family, but it did not create a server, choose a
  provider, deploy runtime, open ports, or change traffic.
- The approved `channel-lab-a` creation is recorded in
  `docs/production-replacement-records/2026-05-26-channel-lab-a-creation.md`.
  It created an AWS ap-southeast-1 clean canary instance
  `i-0f2cf745a1bb5ba51` with security group `sg-0cad3c8a7380528f9`, SSH
  restricted to the operator `/32`, and UDP/443 reserved for a future Hysteria2
  canary. No Hysteria2 runtime, DNS, Nginx, production config, subscription
  output, or traffic canary was performed.
- The approved Hysteria2 runtime deployment is recorded in
  `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-runtime.md`.
  Hysteria2 v2.9.2 is active on `channel-lab-a`, UDP/443 is listening, and a
  host-only client smoke test returned HTTP 200 through the local Hysteria
  path. No operator-device canary, DNS, production config, subscription output,
  or production traffic was performed.
- The approved controlled operator-device Hysteria2 canary is recorded in
  `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-operator-device-canary.md`.
  A local Hysteria2 client on the operator device completed 20/20 short HTTP
  proxy samples through `channel-lab-a` with no client log errors. Local canary
  config was generated outside the repository and is sensitive. No all-user
  rollout, subscription output change, DNS, Nginx, production config, runtime
  reconfiguration, security-group mutation, or production traffic was
  performed.
- The approved controlled Mihomo import validation is recorded in
  `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-mihomo-import-validation.md`.
  A temporary standalone Mihomo v1.19.25 core on the operator device parsed the
  local Hysteria2 canary config, listened on `127.0.0.1:28280`, and completed
  20/20 short HTTP proxy samples through `channel-lab-a` with no Mihomo log
  errors. No all-user rollout, subscription output change, DNS, Nginx,
  production config, system proxy, TUN, runtime reconfiguration,
  security-group mutation, or production traffic was performed.
- The approved Hysteria2 extended measurement is recorded in
  `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-extended-measurement.md`.
  Direct Hysteria2 and standalone Mihomo paths each completed 3 windows of 60
  operator-device samples with 180/180 successes and no timeouts. The
  repository bundle report classified both probes as `hold_for_investigation`:
  the direct path exceeded p95/p99 latency thresholds, and the Mihomo path had
  one p99 latency spike. No all-user rollout, subscription output change, DNS,
  Nginx, production config, runtime reconfiguration, service restart,
  security-group mutation, system proxy change, TUN, or production traffic was
  performed.
- Legacy blue `i-004ab1c6c71d06bca` is stopped and retained for controlled
  retirement review. Do not terminate it or delete its security group without
  separate A-tier approval.
- Current prod-edge-a production subscription DB path is documented as
  `/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite`. Historical
  records may mention `/opt/proxy-gateway-minimal/data/subscriptions.sqlite`;
  verify the active runtime `.env` before backup, restore, or SQLite inspection.
- The live production deployment directory is not a Git checkout. Verify
  production by file presence, `systemctl`, `journalctl`, endpoint behavior, and
  SQLite/tooling checks rather than `git rev-parse` on the host.

## Active Blockers And Gated Work

The following remain blocked unless a specific runbook, read-only inventory,
operator approval, validation, and rollback path exist:

- Broader opaque artifact issuance, now gated by
  `docs/production-replacement-records/2026-05-27-opaque-artifact-issuance-and-legacy-token-retirement-runbook.md`.
- Legacy query-token retirement, now gated by
  `docs/production-replacement-records/2026-05-27-opaque-artifact-issuance-and-legacy-token-retirement-runbook.md`
  after broader artifact issuance and observation. Future route removal remains
  a separate compatibility gate.
- Traffic accounting, quota enforcement, and device-abuse enforcement.
- Channel runtime canary execution for VLESS/XUDP, Hysteria2, TUIC, or any
  other protocol candidate. Repository renderer/config support is merged, but
  server selection, server creation, runtime deployment, node config activation,
  security-group/firewall changes, operator-device canaries, or broader rollout
  remain A-tier and must follow `docs/CHANNEL_CANARY_SERVER_SELECTION.md` and
  `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`.
  The current `channel-lab-a` records prove server runtime health, short
  controlled canaries, and one extended operator-device Hysteria2 measurement.
  Extended measurement volume is sufficient, but the latest result is
  `hold_for_investigation` because latency thresholds were exceeded. GUI import
  evidence, TUIC/VLESS-XUDP comparison, subscription output changes, broader
  rollout, and cleanup/termination each still require separate approval and
  evidence.
- The TUIC comparison canary plan is documented in
  `docs/CHANNEL_TUIC_COMPARISON_CANARY_PLAN.md`. It defines TUIC as the next
  measured channel candidate after the held Hysteria2 extended measurement,
  with VLESS/XUDP as the secondary comparison candidate. It does not authorize
  TUIC runtime deployment, server creation, port exposure, subscription output
  changes, DNS, Nginx, systemd, firewall/security-group changes, operator-device
  traffic, or production traffic.
- The TUIC runtime inventory gate handoff is documented in
  `docs/production-replacement-records/2026-05-27-tuic-runtime-inventory-gate.md`.
  It defines the next exact Stage 0 read-only inventory approval phrase, the
  allowed evidence, stop conditions, and later deployment/canary gates. It did
  not execute TUIC inventory, deploy TUIC, create a server, open ports, change
  firewall/security groups, change subscription output, run operator-device
  traffic, or clean up `channel-lab-a`.
- The approved TUIC Stage 0 read-only inventory execution is recorded in
  `docs/production-replacement-records/2026-05-27-tuic-runtime-inventory-execution.md`.
  It verified that `channel-lab-a` is still running in AWS ap-southeast-1 with
  the expected security group and UDP/443 Hysteria2 exposure, but SSH reached
  TCP connect and timed out before banner/auth, while SSM is not registered.
  Host-internal runtime state was not reverified, so TUIC runtime deployment is
  blocked. The record recommends a fresh `channel-lab-b` TUIC comparison gate
  unless the operator separately approves `channel-lab-a` access remediation,
  second-port planning, or Hysteria2 cleanup planning.
- Physical control-plane / edge data-plane split.
- Local Linux manual CI is now bootstrapped and validated as an archive-based
  repository validation host. See
  `docs/production-replacement-records/2026-05-26-local-linux-ci-readonly-inventory.md`
  and
  `docs/production-replacement-records/2026-05-26-local-linux-ci-bootstrap-validation.md`.
  It is not staging, not production, and not deploy approval.
- Aliyun state-preserving source copy remains blocked unless the operator
  rejects clean-start and approves a separate source-rescue path. The
  current Aliyun candidate-preparation record is
  `docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-preparation.md`.
  The latest private state-copy preflight record is
  `docs/production-replacement-records/2026-05-26-aliyun-state-copy-preflight.md`.
  The latest source internal inspection attempt is
  `docs/production-replacement-records/2026-05-26-prod-edge-a-source-internal-state-copy-inspection.md`.
  The Package 5 promotion runbook readiness record is
  `docs/production-replacement-records/2026-05-27-aliyun-promotion-runbook-readiness.md`.
  The latest Gate A live inventory is
  `docs/production-replacement-records/2026-05-27-aliyun-gate-a-live-inventory.md`.
  The latest Gate B source-state and provider-firewall planning record is
  `docs/production-replacement-records/2026-05-27-aliyun-gate-b-source-firewall-plan.md`.
  The latest clean-start control-plane planning record is
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-control-plane-plan.md`.
  The clean-start private validation and provider-firewall hardening gate
  runbooks are
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md`
  and
  `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md`.
  The latest clean-start private validation execution attempt is
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-execution.md`;
  it passed after candidate runtime refresh and private metadata-only
  validation. The latest provider-firewall hardening execution record is
  `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-execution.md`;
  provider-level public 80/443/3456/18080 were closed before promotion. The HP
  management-source follow-up is
  `docs/production-replacement-records/2026-05-27-aliyun-hp-management-source-firewall-execution.md`;
  HP now has scoped provider-firewall access for SSH and the existing wg-home
  UDP lab path, but the wg-home logical handshake did not refresh. A
  public-boundary dry run passed and was cleaned up in
  `docs/production-replacement-records/2026-05-27-aliyun-public-boundary-dry-run-execution.md`.
  The exact-phrase production subscription-distribution promotion is now
  recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-production-subscription-distribution-promotion.md`;
  durable Aliyun 80/443 and `sub.globalcirclecat.com` are active for the
  subscription boundary, public Admin remains blocked, `ss-sg` remains
  unchanged, edge traffic is not activated, and the Aliyun `aegis.service`
  follow-up remains open.
- Clean fallback `sub-control-a` candidate provisioning now remains only a
  fallback if the current Aliyun path is rejected; state-preserving copy,
  public-boundary rerun, or additional promotion work still needs separate
  A-tier approval.
- A2 host-internal read-only inventory is currently incomplete because SSH to
  `prod-edge-a` / `prod-edge-b` closes during key exchange from the current
  operator environment. See
  `docs/production-replacement-records/2026-05-26-sub-control-a-candidate-readonly-preflight.md`.
- `prod-edge-b` carrying-instance replacement, restart, or lifecycle mutation.
- `prod-edge-c` creation or durable third-node recovery work.
- AWS node restart, termination, or security-group cleanup after the accepted
  stop-only cleanup. Restart/rollback, termination, and security-group cleanup
  each require separate A-tier approvals and evidence.
- Legacy blue final termination or security-group cleanup.
- WireGuard install, mesh key generation, UDP security-group changes,
  `wg-quick` start, or live mesh validation.
- DNS, Nginx, HTTPS redirect behavior, systemd, production runtime config,
  tenant state, or SQLite authority changes.

GitHub-hosted Actions validation is currently blocked by billing,
spending-limit, or quota constraints. The expected account-quota recovery date
is 2026-06-01; until then, PR validation uses local and HP manual CI evidence
per `docs/CI_MANUAL_VALIDATION.md`. Manual CI fallback is documented, but it is
not staging, not production, and not deployment approval.

## Current Work Queue

Use `project-state/tasks.json` as the compact backlog source. The current C/B
simplification queue is closed:

- `C1-doc-context-slimming` - completed in PR #112.
- `C3-validation-baseline-entrypoint` - completed in PR #113.
- `C2-architecture-non-goal-hardening` - completed in PR #114.
- `B1-code-module-inventory` - completed in PR #115.
- `B2-admin-ui-surface-simplification` - completed in PR #115.
- `B5-channel-strategy-engine-mvp` - completed in the Channel Strategy Engine work; default
  subscription rendering now uses the `stable` pool, while explicit operator
  assignment can still emit a single private/canary/recovery node.
- `B6-channel-measurement-scoring` - completed in the Channel Measurement
  Scoring work; local benchmark summaries can be scored into quality tiers,
  channel scores, reason codes, and advisory pools without production mutation.
- `B7-channel-candidate-report` - completed in the Channel Candidate Report
  work; dry-run config summaries and measurement scores can be joined into
  safe grouped operator recommendations without exposing hosts, ports, tokens,
  credentials, or raw errors.
- `B8-channel-decision-pack` - completed in the Channel Decision Pack work;
  dry-run summaries and measurement scores can be packaged into advisory
  baseline/canary/blocker decision artifacts without production mutation.
- `B9-channel-extended-measurement-assessment` - completed in the Channel
  Extended Measurement Assessment work; already-collected local benchmark
  summaries can be classified into ready, needs-more-samples, or hold states
  without running probes, touching edge nodes, or mutating production.
- `B10-channel-measurement-investigation` - completed in the Channel
  Measurement Investigation work; safe measurement bundle reports can be
  classified into sustained latency, isolated spike, reliability, or
  evidence-gap follow-up patterns without running probes, touching edge nodes,
  or mutating production.
- `B11-channel-candidate-comparison` - completed in the Channel Candidate
  Comparison work; safe investigation reports and dry-run config summaries can
  produce advisory next-candidate comparison plans for TUIC or VLESS/XUDP after
  a held Hysteria2 result without running probes, touching edge nodes, or
  mutating production.
- `B18-channel-runtime-registry` - completed in the Channel Runtime Registry
  work; dry-run summaries, measurement scores, and safe runtime inventory
  summaries can now be joined into canary-ready, runtime-blocked, and
  missing-inventory groups without running probes, touching edge nodes,
  deploying runtimes, opening ports, or changing subscription output.
- `B19-channel-runtime-inventory-summary` - completed in the Channel Runtime
  Inventory Summary work; operator-provided runtime gate facts can now be
  normalized into safe registry input artifacts without raw hosts, ports, URLs,
  credentials, raw logs, tokens, subscription URLs, customer data, runtime
  mutation, or production activation.
- `B20-channel-runtime-gate-packet` - completed in the Channel Runtime Gate
  Packet work; runtime registry output can now be turned into an operator-safe
  approval-readiness packet that distinguishes approval-ready, blocked, and
  missing-inventory states without submitting approval phrases, deploying
  runtimes, moving traffic, or changing subscription output.
- `B21-channel-system-decision-flow` - completed in the Channel System Decision
  Flow work; dry-run summary, measurement score, and safe runtime inventory
  input can now be composed into a single advisory system readiness artifact
  without running probes, contacting edge nodes, submitting approval phrases,
  deploying runtimes, moving traffic, or changing subscription output.
- `B22-channel-system-review-api` - completed in the Channel System Review API
  work; the protected Admin platform surface can now accept the same safe
  channel decision inputs and return the redacted system readiness artifact
  without exposing a public route or adding any execution controls.
- `B23-channel-system-review-ui` - completed in the Channel System Review UI
  work; the protected Admin Overview can now submit safe channel decision inputs
  to the protected review API and render flow status, required next action,
  canary readiness, and runtime blockers without exposing approval submission,
  runtime execution, DNS, firewall, traffic, or subscription-output controls.
- `B24-channel-runtime-evidence-bridge` - completed in the Channel Runtime
  Evidence Bridge work; safe runtime evidence packets can now be converted
  into runtime inventory input and full channel system readiness artifacts
  without edge-node contact, runtime mutation, approval submission, traffic
  movement, subscription-output change, or production activation.
- `B25-channel-runtime-evidence-review` - completed in the Channel Runtime
  Evidence Review work; the protected Admin platform route and Admin Overview
  can now accept safe runtime evidence bridge packets and return the normalized
  runtime inventory input plus channel system readiness artifact without public
  routes, execution controls, edge-node contact, runtime mutation, approval
  submission, DNS, firewall, traffic, subscription-output change, or production
  activation.
- `B26-channel-runtime-gate-workbench` - completed in the Channel Runtime Gate
  Workbench work; the protected Admin platform route and Admin Overview can now
  convert safe runtime bridge packets into gate-facing advisory status,
  approval-readiness metadata, candidate counts, and grouped candidates without
  public routes, approval submission, approval-phrase echo, runtime execution,
  edge-node contact, DNS, firewall, traffic movement, subscription-output
  change, or production activation.
- `C4-tuic-comparison-canary-plan` - completed in the TUIC Comparison Canary
  Plan work; TUIC is now the documented next measured channel candidate after
  the held Hysteria2 extended measurement, while VLESS/XUDP remains the
  secondary comparison candidate. Runtime inventory, deployment, measurement,
  and cleanup remain A-tier.

The remaining queued items are A-tier and remain blocked:

- `A1-legacy-query-token-retirement`
- `A2-physical-control-edge-split`

For A2, the preferred first step is now the role split in
`docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`: local Linux manual CI first,
then Aliyun production-control candidate inventory, then controlled
non-Aliyun node drain / retirement after Aliyun promotion. Do not start either
A-tier item without a specific runbook, read-only inventory, operator approval,
validation plan, and rollback evidence.

Latest local Linux CI candidate inventory:

- `docs/production-replacement-records/2026-05-26-local-linux-ci-readonly-inventory.md`
- `docs/production-replacement-records/2026-05-26-local-linux-ci-bootstrap-validation.md`
- `hp-server` is reachable through the approved local SSH key.
- Node.js `v22.22.3` and npm `10.9.8` are available through a user-local
  toolchain under `~/.local/ci-node/`.
- Archive-based manual CI passed for commit
  `4dacd1edf0b179cea38654de4cda2fd845c6d922`: `npm ci`,
  `npm ci --prefix admin`, `npm test` 180/180, `npm run admin:test` 25/25,
  and `npm run admin:build`.
- Per-run workspace, archive, npm cache, GitHub config, and git credentials
  were cleaned after validation.
- Aliyun CI cleanup has been completed; HP is now the manual CI lane.
- HP manual CI is split into `ci-smoke`, `ci-full`, and `ci-visual`; not every
  PR should trigger every lane.

Latest Aliyun CI cleanup / subscription-control candidate inventory:

- `docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup-inventory.md`
- `docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup.md`
- `docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-preparation.md`
- `docs/production-replacement-records/2026-05-26-aliyun-state-copy-preflight.md`
- `docs/production-replacement-records/2026-05-26-prod-edge-a-source-internal-state-copy-inspection.md`
- `docs/production-replacement-records/2026-05-26-singapore-prod-edge-stop.md`
- `docs/production-replacement-records/2026-05-27-aliyun-promotion-runbook-readiness.md`
- `docs/production-replacement-records/2026-05-27-aliyun-gate-a-live-inventory.md`
- `docs/production-replacement-records/2026-05-27-aliyun-gate-b-source-firewall-plan.md`
- `docs/production-replacement-records/2026-05-27-aliyun-clean-start-control-plane-plan.md`
- `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md`
- `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md`
- The current Aliyun SWAS host is reachable through SSH alias `miyao`.
- It is running Ubuntu 24.04.2 with Node.js `v22.22.2`, npm `10.9.7`, git
  `2.43.0`, 2 CPU, about 2 GiB memory, and 40 GiB disk.
- No active manual-CI workspace, repository archive, GitHub CLI config, or git
  credential file was found in the read-only scan.
- The cleanup removed only `/root/.npm`, `/root/.cache`, and any matching
  `/tmp/proxy-gateway-ci-*.tar` archives; the post-cleanup recheck found CI
  workspace, GitHub CLI config, git credentials, npm/cache residue, and CI
  archives absent.
- The Aliyun proxy-gateway runtime remains private on app port 3456, while
  Nginx now exposes only the approved public subscription boundary on 80/443
  for `sub.globalcirclecat.com`.
- WireGuard `wg-home` is active on UDP 51820 and must be explicitly accepted,
  scoped, or removed during any future production hardening.
- UFW is active with default deny incoming / allow outgoing; OpenSSH, existing
  `wg-home` UDP 51820, and approved public 80/443 are allowed inbound.
- The candidate app listens on `127.0.0.1:3456`; private Nginx still has a
  loopback path, and public Nginx now serves the approved subscription boundary
  on 80/443. No edge proxy listener was opened.
- Post-promotion validation found public 80/443 serving only the approved
  subscription boundary, while public 3456 and 18080 remain closed or timed
  out.
- The promotion mutated only the approved Aliyun public subscription boundary
  and `sub.globalcirclecat.com` DNS record. No `ss-sg` change, edge traffic,
  AWS, public Admin, WireGuard, historical state copy, customer data copy, or
  unrelated node mutation was performed.
- Aliyun private state-copy preflight confirms candidate app health, loopback
  Nginx health, UFW deny-incoming posture, and candidate SQLite
  `integrity_check: ok`.
- The same preflight historically confirmed AliDNS still pointed
  `sub.globalcirclecat.com` and `ss-sg.globalcirclecat.com` to
  `13.215.156.159`, and HP-side public checks did not observe Aliyun candidate
  public exposure on 80/443/3456/18080 before promotion.
- Private state-copy validation is still blocked because prod-edge-a source
  internal SSH inspection timed out during banner exchange; source SQLite
  integrity and fresh source backup are not yet verified.
- Follow-up source internal inspection confirmed prod-edge-a EC2 health and
  production public endpoint health, but SSM inventory is empty and SSH TCP/22
  closes before banner/auth. Source command execution remains blocked.
- Aliyun Gate A live inventory on 2026-05-27 found the candidate app and
  loopback Nginx healthy, candidate SQLite `integrity_check: ok`, HP-side
  public checks still not observing Aliyun 80/443/3456/18080 exposure, and
  AliDNS still pointing subscription domains to the stopped AWS address. It
  also found Aliyun provider firewall rules remain too broad, including public
  allow rules for 80/443 and broad TCP/UDP ranges, while host UFW currently
  blocks most public paths except SSH and the existing wg-home lab UDP path.
  This is now historical pre-promotion evidence.
- Aliyun Gate B source-state planning now recommends a clean-start Aliyun
  control plane unless the operator explicitly requires historical subscription
  state preservation. If historical state is required, prefer a separate
  source-state rescue planning path before relying on SSH-first remediation; if
  temporary service restoration is required, use a separate AWS rollback-start
  preflight. Provider-firewall hardening remains a separate prerequisite before
  any public-boundary dry run.
- Aliyun clean-start control-plane planning now makes clean-start the active
  default for the next repo-only package. New accounts, entitlements,
  subscription-access grants, opaque artifacts, and Subscription V2 outputs
  should be issued from Aliyun clean-start authority after private validation.
  Historical AWS state copy is no longer the default dependency for the MVP,
  but remains available only through a separate state-preserving source rescue
  path if the operator later requires continuity.
- Clean-start private validation, provider-firewall hardening, HP
  management-source follow-up, public-boundary dry run, and production
  subscription-distribution promotion now each have execution records. The
  latest promotion record proves `sub.globalcirclecat.com` on Aliyun, public
  Admin blocked, no-token subscription rejection, one authorized smoke refresh,
  disabled smoke state, and unchanged edge DNS. A read-only observation/Aegis
  follow-up then confirmed stable public samples and narrowed Aegis to a failed
  systemd unit with Aegis processes still present. The optional Aegis repair
  gate was later approved and attempted, but it failed safely and left broader
  vendor-agent repair unapproved. The remaining work is clean edge rebuild
  execution approval, rollback-start decisions, broader artifact issuance, and
  legacy query-token retirement. The clean edge rebuild runbook, execution
  template, read-only preflight, and execution handoff now exist, but no clean
  edge host has been provisioned, bootstrapped, or activated. The opaque
  artifact issuance and legacy
  query-token retirement runbook now exists and deliberately separates artifact
  issuance from legacy-token retirement; neither gate has been executed.

Latest Aliyun user-management / subscription-distribution decision:

- `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`
- Near-term target: Aliyun becomes the user-management and subscription
  distribution platform, HP remains local CI/operator lab, and all other nodes
  are drained and retired through explicit A-tier gates.
- The separate technical MVP branch is PR #129,
  `codex/local-edge-channel-probe-harness`; it owns local edge channel probe,
  benchmark, and manager work and must not be coupled to Aliyun production
  authority without a later integration gate.
- On 2026-05-26, the operator approved stopping AWS Singapore `prod-edge-a` and
  `prod-edge-b` with accepted service outage. Both instances are stopped.
- Authoritative AliDNS now points `sub.globalcirclecat.com` to the Aliyun
  subscription boundary and leaves `ss-sg.globalcirclecat.com` on the old AWS
  stopped address because edge traffic activation was not approved.
- Latest cleanup preflight:
  `docs/production-replacement-records/2026-05-26-non-aliyun-node-cleanup-preflight.md`.
- The tracked static node config still references `prod-edge-a` and
  `prod-edge-b`, so subscription output/config must be rebuilt before the
  service can be considered healthy again.
- The next executable gates are separate A-tier approvals for Aliyun
  `aegis.service` repair if desired, clean edge node rebuild execution,
  rollback-start approval for stopped AWS nodes if temporary restore is needed,
  broader artifact issuance, or legacy query-token retirement. Aegis repair
  must use the exact approval phrase from
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-runbook.md`;
  clean edge rebuild must use the exact approval phrase from
  `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md`;
  opaque artifact issuance and legacy query-token retirement must use their
  separate exact approval phrases from
  `docs/production-replacement-records/2026-05-27-opaque-artifact-issuance-and-legacy-token-retirement-runbook.md`.
  Short confirmations such as `同意` do not authorize any of those gates.

Latest A2 preflight:

- `docs/production-replacement-records/2026-05-26-sub-control-a-candidate-readonly-preflight.md`
- External AWS, DNS, public-boundary, and edge-port checks were healthy.
- Host-internal service / SQLite / backup / journal checks are blocked until
  an approved internal inspection path exists. The latest source inspection
  attempt confirmed the path is still blocked before SSH banner/auth and SSM is
  unavailable.
- Clean `sub-control-a` candidate provisioning is not approved. The clean
  new-server control-plane path is now a fallback if the Aliyun candidate path
  is rejected by inventory or cleanup gates.

## Current Validation Baseline

Use `docs/VALIDATION_BASELINE.md` as the active validation command matrix.

Short version:

- C docs-only: `git diff --check origin/master...HEAD`
- Project-state JSON: `npm run project-state:check` plus diff check
- Server/shared code: `npm test` plus diff check
- Admin UI: `npm run admin:test`, `npm run admin:build`, `npm test`, and diff
  check
- Manual CI lanes: `ci-smoke`, `ci-full`, and `ci-visual` are selected per
  `docs/CI_MANUAL_VALIDATION.md`; the Codex skill maps to `ci-full`
- A-tier work: runbook-specific validation only; there is no generic shortcut

Latest PR #111 validation before merge:

- `npm run project-state:check` passed.
- `npm test` passed with 175/175 tests.
- `git diff --check origin/master...HEAD` passed.

## Local Run And Admin Access

Local server:

```powershell
npm run server
```

Admin UI:

```powershell
npm run admin:dev
```

To connect local Admin UI to current prod-edge-a backend, open an SSH tunnel:

```powershell
ssh -i "$env:USERPROFILE\.ssh\proxy-gateway-aws-sg-20260521.pem" -L 3456:127.0.0.1:3456 ubuntu@13.215.156.159
```

Then use:

```text
API base URL: leave blank in Vite dev mode so same-origin /api requests use the dev proxy
Console token: production CONSOLE_TOKEN from /opt/proxy-gateway-minimal/.env
```

Do not set the browser UI API base URL directly to `http://127.0.0.1:3456`
unless the target backend sends CORS headers. The production backend does not
currently expose browser CORS, so Vite dev proxy is the intended local testing
path.

## Connectivity Notes

If AWS, Aliyun, GitHub, or other CLI commands fail because local proxy
environment variables point to a dead local listener, clear proxy variables for
the current process first:

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
```

Safe AWS refresh pattern:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aws ec2 describe-instances --region ap-southeast-1 --filters Name=ip-address,Values=13.215.156.159 --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,Type:InstanceType,LaunchTime:LaunchTime,Name:Tags[?Key=='Name']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value,Project:Tags[?Key=='Project']|[0].Value,SecurityGroups:SecurityGroups[*].GroupId}" --output table
```

Safe AliDNS refresh pattern:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aliyun alidns DescribeDomainRecords --DomainName globalcirclecat.com --RRKeyWord sub --PageSize 10
```

## Documentation Navigation

Use `docs/README.md` as the full docs index. It classifies current state docs,
active runbooks, production safety records, execution records, paused docs, and
historical specs/plans.

High-value entrypoints:

- `AGENTS.md` - workflow rules and A/B/C risk gates.
- `docs/PROJECT_OPERATING_MODEL.md` - source-of-truth layers and work lanes.
- `docs/PROJECT_SIMPLIFICATION_MAP.md` - cleanup map and complexity hotspots.
- `docs/PROJECT_CONTROL_PLANE.md` - structured project-state model.
- `docs/VALIDATION_BASELINE.md` - current validation command matrix.
- `project-state/current.json` - compact current-state snapshot.
- `project-state/lanes.json` - active lane index and risk boundaries.
- `project-state/tasks.json` - active backlog.
- `docs/NETWORK_FORWARDING.md` - local/proxy/Admin/runtime forwarding model.
- `docs/ENVIRONMENT_TOPOLOGY.md` - repo, GitHub, branch, and AWS role map.
- `docs/DEPLOYMENT_FLOW.md` - deployment, staging, promotion, rollback flow.
- `docs/CI_MANUAL_VALIDATION.md` - manual validation host workflow.
- `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md` - target split for current
  Aliyun production subscription control, local Linux manual CI, and controlled
  non-Aliyun node drain / retirement.
- `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md` - clean
  `sub-control-a` candidate fallback gates for the future physical split.

Detailed production and incident history remains in:

- `docs/production-replacement-records/*.md`
- `docs/production-incident-records/*.md`
- `docs/domain-implementation-records/*.md`
- `docs/server-edge-mesh-records/*.md`

Do not copy full historical execution details back into this handoff unless
they change current state, blockers, or required next actions.

## Historical Baseline

Historical feature and operations context is still useful but should not bloat
the current handoff:

- `v0.1.0-mvp` introduced SQLite-backed subscription tenants, hashed tokens,
  Admin subscription APIs, and tenant-token subscription fetch.
- Subscription hardening introduced temporary links, token rotation, `/sub`
  rate limiting, Admin public blocking, public console UI blocking, and token
  redaction guidance.
- Admin UI work connected the frontend to real `/api/admin/*` endpoints through
  Bearer auth and same-origin Vite dev proxy use.
- Subscription architecture refactor introduced `SubscriptionCore`, store
  contracts, compatibility exports, serializer/validation separation, and
  platform integration boundaries.
- Environment foundation added systemd templates, Nginx gateway template,
  SQLite backup/restore scripts, `.env.example` expansion, and ops docs.

For detailed historical specs/plans, use `docs/superpowers/README.md` and the
corresponding files under `docs/superpowers/`.

## Guardrails

- Do not commit secrets, subscription URLs with real tokens, `.proxy-gateway/`,
  AWS/SS credential material, SQLite data, or customer data.
- Do not rely on ignored `.proxy-gateway/aws-singapore/` status files without
  live verification.
- Do not change domain DNS, HTTPS redirect behavior, production base URL,
  opaque artifact exposure, legacy subscription access, production nodes,
  Nginx, systemd, security groups, or tenants unless the user explicitly asks
  and the work follows the relevant A-tier gate.
- Do not expose the Admin UI through the public gateway.
- Do not remove Nginx from the gateway path while hardening public access.
- When changing auth, rate limits, logs, subscription output, tenant behavior,
  or route boundaries, add focused tests and run the relevant validation.
