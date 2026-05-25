# Project Context

Last updated: 2026-05-25, Asia/Shanghai.

This file is the handoff note for continuing the `proxy-gateway-minimal` work from a new Codex conversation. Read this file first, then inspect the live repo state before making changes.

## How To Use This File

Use this file for current handoff state only:

- Current branch and baseline expectations.
- Current production facts and active blockers.
- Latest validation baselines.
- Active runbook links and recent execution records.
- Current next-step context when it changes durable project state.

Use `docs/README.md` for documentation navigation. Use
`docs/superpowers/README.md` for historical design and implementation archive
navigation. Use the relevant active runbook for production, AWS, DNS, Nginx,
HTTPS, staging, deployment, rollback, or node execution gates.
Use `docs/PROJECT_OPERATING_MODEL.md` for the project-level operating model:
source-of-truth layers, work lanes, risk tiers, production gates, and
subscription stability principles.

Future slimming goal: this file should not permanently duplicate every
historical PR, old stage detail, long command block, or runbook body that
already lives in a dedicated current doc. Do not delete existing history as
part of routine updates; shrink it only through an explicit docs cleanup PR.

## Repository

```text
C:\Users\g\Projects\订阅管理\proxy-gateway-minimal
```

## Environment Topology

- The project now treats GitHub `gaoyi1020-web/proxy-gateway-minimal` plus the local checkout at `C:\Users\g\Projects\订阅管理\proxy-gateway-minimal` as the only active code source of truth.
- Documentation navigation starts at `docs/README.md`, which classifies current state docs, active runbooks, execution records, paused docs, and historical specs/plans.
- `C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal` is a historical original checkout. It is useful for archaeology only and should not receive new work.
- `C:\Users\g\OneDrive\文档\订阅管理` is a legacy empty Codex project shell. Do not treat it as a real repository.
- Current production MVP target is `prod-edge-a` on `13.215.156.159`; `sub.globalcirclecat.com` and `ss-sg.globalcirclecat.com` now point there in authoritative AliDNS. Legacy blue instance `i-004ab1c6c71d06bca` has been stopped for controlled retirement review; do not terminate it or delete its security group without separate Risk A approval.
- Branch flow: `master` is the stable integrated baseline; use `codex/<task>`, `feat/<feature>`, or `ops/<topic>` for work; use a staging candidate only when an AWS pre-release test is needed.
- Detailed topology and branch/AWS role definitions live in `docs/ENVIRONMENT_TOPOLOGY.md`.
- Current and target architecture topology diagrams live in `docs/PROJECT_TOPOLOGY.md`. Use it to distinguish current production subscription delivery, target subscription control-plane / edge data-plane split, the target Local Edge Agent product topology, private operator lab / HP Relay diagnostics, server-side multi-node edge networking, control/delivery/data planes, and work lanes.
- Subscription control / edge split architecture lives in `docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md`. It defines the target split where `sub-control-a` / future `sub-control-b` own subscription state, artifacts, Admin, and rendering, while `prod-edge-a/b/c` carry edge data-plane traffic and report health. Current production is still co-located on `prod-edge-a`; any physical split, control-plane standby, database movement, DNS/Nginx/systemd change, or edge runtime change remains separate Risk A work.
- Provider-neutral node naming rules live in `docs/NODE_NAMING.md`. Future durable node identities should use internal abstract names such as `prod-edge-a`, `prod-edge-b`, and `prod-edge-c`; migrating existing production node IDs, DNS names, tenant `nodeId` values, or generated subscription labels remains Risk A production node-config work.
- Route architecture and implemented-versus-not-implemented subscription routing capability audit lives in `docs/ROUTES_ARCHITECTURE.md`. Current implemented facts include app-level public allowlist, `/api/admin` source-IP allowlist plus Bearer auth, Subscription V2 node selection, operator-only tenant node assignment, expired/disabled token-resolution blocking, and Shadowsocks-only Clash YAML output. Automatic carrier/DPI detection, mixed protocol output, blackhole node semantics, traffic accounting, quota enforcement, self-service portal, and route-local loopback checks inside each route file are not implemented today.
- Subscription V2 production contract and closeout gates live in `docs/SUBSCRIPTION_V2_REPLACEMENT.md`. V2 has replaced the MVP single-node subscription output in production while keeping the compatible refresh entry and server-side tenant token model. The user entitlement model is time and traffic only; multi-node output is platform delivery capacity, not a pricing tier. The document also records remaining closure gates for legacy query-token access, `prod-edge-b` iteration-node lifecycle, legacy blue, opaque artifacts, traffic accounting, and HTTPS. It does not authorize code deployment, production config changes, node migration, DNS changes, legacy endpoint removal, `prod-edge-b` carrying-instance replacement, legacy-blue retirement, or cutover.
- Device-scoped opaque subscription URL design lives in `docs/SUBSCRIPTION_DEVICE_SCOPED_OPAQUE_URLS.md`. It defines the follow-up product access model: per-device opaque refreshable subscription artifacts, server-side tenant token containment, dynamic V2 YAML output, and abuse signals for shared URLs. Repository-level backend support is implemented and one production canary artifact is active; broader issuance, legacy URL removal, user migration, and abuse enforcement remain separate Risk A work.
- Device-scoped opaque subscription implementation planning lives in `docs/SUBSCRIPTION_OPAQUE_IMPLEMENTATION_PLAN.md`. It defines the B-tier repository/code slice for artifact storage, artifact refresh routing, admin artifact operations, and tests. The first production canary is active, but broader activation, tenant artifact issuance, legacy endpoint removal, and deployment expansion remain separate Risk A work.
- The post-implementation opaque access-model gap record lives in `docs/SUBSCRIPTION_OPAQUE_ACCESS_MODEL_GAP.md`. It records that backend support is implemented and one production opaque artifact canary is active, but additional artifact issuance/migration, legacy query-token retirement, redirect changes, and traffic/device-abuse enforcement remain separate work with Risk A production gates where applicable.
- Local Edge Agent design lives in `docs/LOCAL_EDGE_AGENT_DESIGN.md`. It defines a next-generation channel-adapter direction: Clash/Mihomo remains the local router/UI, while a loopback-only local agent generates a local subscription and carries traffic over platform-controlled remote-edge channels. V1 explicitly does not create a virtual NIC, enable TUN, mutate system proxy/PAC/routes, install drivers, expose public listeners, or replace Clash/Mihomo. The repository-only skeleton is implemented in `agent/local-edge-agent.mjs`, `agent/socks5-adapter.mjs`, `agent/channel-profile.mjs`, and `agent/edge-tunnel.mjs`: it validates loopback-only config, serves local `/health`, `/clash.yaml`, and redacted `/diagnostics`, generates Clash YAML pointing only to a loopback SOCKS5 endpoint, includes a standalone SOCKS5 CONNECT adapter with an injected channel interface, can explicitly wire that adapter into the foreground runtime, provides a channel profile factory with disabled-by-default and local-development-only direct TCP profiles, and includes a local-development edge-tunnel skeleton with a one-line JSON CONNECT handshake, exported protocol contract constants, strict request/reply frame shape and frame-size behavior, bounded handshake timeouts, and redacted failure diagnostics. The default `npm run agent:local` path still does not start real traffic forwarding. The prototype does not implement production remote edge transport, transport authentication, transport encryption, device credential storage, artifact bootstrap, service installation, or production activation.
- Server Edge Mesh design lives in `docs/SERVER_EDGE_MESH_DESIGN.md`. It defines a server-side private edge mesh direction, with WireGuard as the preferred first candidate, for provider-neutral edge-to-edge health, management, validation, and recovery paths. V1 is not user-facing, does not route ordinary customer traffic, does not expose mesh endpoints to Clash/Mihomo or the Local Edge Agent, and does not authorize WireGuard setup, security-group changes, service changes, secret distribution, traffic migration, or cutover.
- Server Edge Mesh WireGuard canary gates live in `docs/SERVER_EDGE_MESH_WIREGUARD_CANARY_RUNBOOK.md`. It defines a two-node `prod-edge-a` / `prod-edge-b` WireGuard canary with mesh CIDR `10.89.0.0/24`, `wg-edge`, UDP `51820`, peer-restricted security-group rules, local key-generation boundaries, validation, rollback, and execution-record requirements. It does not authorize execution by itself; installing WireGuard, generating keys, opening mesh UDP, starting `wg-quick`, or validating live mesh traffic requires the explicit approval phrase in that runbook.
- Production edge fleet planning lives in `docs/PRODUCTION_EDGE_FLEET.md`. It defines `prod-edge-a` as the current primary slot, `prod-edge-b` as the iteration/canary secondary slot, and `prod-edge-c` as the future third recovery/standby slot; it does not authorize node creation, DNS changes, production config changes, secret/data copying, or traffic cutover. Repo-only provider-neutral recovery build materials for `prod-edge-c` live under `ops/edge-node/`; they do not contain production secrets, SQLite data, cloud credentials, private keys, or customer data.
- Deployment, staging, production promotion, and rollback rules live in `docs/DEPLOYMENT_FLOW.md`.
- Staging target decision lives in `docs/STAGING_TARGET_DECISION.md`: current recommendation is a new clean staging instance, not starting the stopped historical node as-is.
- Clean staging provisioning, validation, promotion gates, and cleanup rules live in `docs/STAGING_PROVISIONING.md`.
- Production disaster recovery rules live in `docs/PRODUCTION_DR.md`. The current production service is a single-node deployment, and DR actions remain Risk A work requiring explicit operator approval.
- Blue-green production replacement planning lives in `docs/PRODUCTION_REPLACEMENT.md`. Creating a green production replacement candidate, handling production secrets/data, and cutting traffic over remain Risk A work requiring explicit operator approval.
- The 2026-05-24 read-only production replacement preflight lives in `docs/production-replacement-preflight/2026-05-24-blue-green-preflight.md`. It did not mutate AWS or production and concluded that green creation should wait until an IP/DNS/node-config cutover strategy is selected.
- The 2026-05-24 green production replacement candidate creation record lives in `docs/production-replacement-records/2026-05-24-green-candidate-creation.md`. It created and validated green `i-0ad8676ee113d14cb` / `18.136.102.226` using initial `master` commit `57e4f39aeb8847ae45b7e6f1c860988ef79ce345`; blue remained serving and no cutover occurred.
- The 2026-05-24 green refresh record lives in `docs/production-replacement-records/2026-05-24-green-refresh-current-master.md`. It refreshed green to current `master` commit `c53f7087fc30b340667d94e0523d094063972e0d`, validated repository tests and green runtime behavior, and did not mutate blue, DNS, HTTPS, production config, production tenants, or cutover state.
- The 2026-05-24 green cutover preflight record lives in `docs/production-replacement-records/2026-05-24-green-cutover-preflight.md`. It performed read-only blue/green health, DNS still-blue, SQLite integrity, public boundary, and Nginx log-redaction checks. Blue and green were healthy, DNS still pointed to blue, and no mutation or cutover occurred. Immediate cutover was not ready because fresh blue SQLite backup/green restore or an explicit data-freshness decision, blue runtime/current-code verification, and separate DNS/runtime cutover gates are still required.
- The 2026-05-24 `prod-edge-a` candidate preflight lives in `docs/production-replacement-records/2026-05-24-prod-edge-a-candidate-preflight.md`. It defines the preconditions and approval phrase for creating a clean new provider-neutral primary candidate. It does not create AWS resources, copy secrets/data, change DNS, mutate production config, promote green, retire legacy blue, or cut traffic over.
- The 2026-05-24 `prod-edge-a` candidate creation record lives in `docs/production-replacement-records/2026-05-24-prod-edge-a-candidate-creation.md`. It created and validated clean `prod-edge-a` candidate `i-0b7791340d3fedff5` / `13.215.156.159`, deployed commit `cea90040a45458211570ae207214c4b2963ccc2a`, normalized the candidate copy to provider-neutral `prod-edge-a`, and did not change DNS, blue, green, production config, production tenants, or cutover state.
- The 2026-05-24 `prod-edge-a` cutover preflight lives in `docs/production-replacement-records/2026-05-24-prod-edge-a-cutover-preflight.md`. It confirmed prod-edge-a and green are healthy and reachable, DNS still points to legacy blue, and legacy blue remains unreachable from the local operator network. It concluded prod-edge-a is not ready for immediate cutover until a production SQLite data-authority decision or fresh approved backup/restore path is resolved.
- The 2026-05-24 node-to-legacy-blue data preflight lives in `docs/production-replacement-records/2026-05-24-node-to-legacy-blue-data-preflight.md`. It confirmed green and prod-edge-a can reach legacy blue on public HTTP and Shadowsocks TCP while the local operator-network path still times out. This supports a path/IP-specific block hypothesis, but it does not solve SQLite authority because no fresh legacy-blue backup was collected and SSH remains restricted by security group policy.
- The 2026-05-24 legacy-blue fresh backup and prod-edge-a restore record lives in `docs/production-replacement-records/2026-05-24-legacy-blue-fresh-backup-restore.md`. It temporarily allowed SSH from prod-edge-a to legacy blue, repaired legacy blue's active SQLite DB from the latest valid existing backup after a failed backup attempt created an invalid zero-byte active DB file, created a fresh backup from repaired legacy blue, restored that backup to prod-edge-a, validated both SQLite summaries and prod-edge-a public boundary, removed temporary SSH rules, and removed temporary transfer files. It did not change DNS, production node config, tenants, green, or cutover state.
- The 2026-05-24 prod-edge-a production activation record lives in `docs/production-replacement-records/2026-05-24-prod-edge-a-production-activation.md`. It activated prod-edge-a as the production MVP subscription gateway target, changed authoritative AliDNS records `sub.globalcirclecat.com` and `ss-sg.globalcirclecat.com` to `13.215.156.159`, updated prod-edge-a runtime node config to emit Subscription V2 output with `prod-edge-a` plus `prod-edge-b` as the iteration/canary secondary slot, changed prod-edge-a `PUBLIC_SUBSCRIPTION_BASE_URL` to `http://sub.globalcirclecat.com`, and corrected the active production tenant `nodeId` from the legacy node name to `prod-edge-a` after an initial 403 import failure. It did not rotate tokens, change expiry, issue HTTPS, mutate Nginx, replace the `prod-edge-b` carrying instance, or retire legacy blue.
- The 2026-05-24 prod-edge-a HTTPS preflight lives in `docs/production-replacement-records/2026-05-24-prod-edge-a-https-preflight.md`. It was read-only: DNS/public boundary, AWS instance/security-group, Nginx active config, log-redaction posture, 443 listener, and Certbot/certificate state only. It found `sub.globalcirclecat.com` resolving to prod-edge-a, HTTP boundary healthy, and security group 443 open, but no instance 443 listener, no Certbot, and no `/etc/letsencrypt` certificate state. HTTPS issuance still requires separate explicit Risk A approval and must not enable automatic redirect unless separately approved.
- The 2026-05-24 prod-edge-a HTTPS issuance record lives in `docs/production-replacement-records/2026-05-24-prod-edge-a-https-issuance.md`. It installed Certbot and the Nginx plugin, backed up the active Nginx public gateway config, issued a certificate for `sub.globalcirclecat.com` with `--no-redirect`, enabled Nginx `443`, verified HTTPS public boundary `200/404/401/404`, verified HTTP `/api/health` still returns `200` without redirect, verified Certbot renewal dry-run, and kept token-query log checks clean. It did not mutate DNS, production `.env`, production node config, opaque artifacts, legacy query-token access, tenants, `prod-edge-b`, legacy blue, or redirect behavior.
- The 2026-05-24 opaque artifact production canary record lives in `docs/production-replacement-records/2026-05-24-opaque-artifact-production-canary.md`. It deployed current server code to `prod-edge-a`, exposed `/sub/a/*` through Nginx, migrated `PUBLIC_SUBSCRIPTION_BASE_URL` to `https://sub.globalcirclecat.com`, created one active opaque artifact for the active production tenant, delivered the full import URL only to `C:\tmp\prod-edge-a-opaque-subscription-url-20260524T143100Z.txt`, and remediated artifact-path access logging with `/sub/a/[redacted]`. It did not mutate DNS, rotate tenant tokens, remove legacy query-token access, issue artifacts to all tenants, mutate `prod-edge-b`, or implement traffic/device enforcement.
- The 2026-05-24 active tenant legacy link drain record lives in `docs/production-replacement-records/2026-05-24-active-tenant-legacy-link-drain.md`. After the operator confirmed the opaque artifact import worked, it reset the active tenant's primary legacy token, expired the active tenant's remaining temporary `pgtmp_` links, verified the opaque artifact URL still returned `200`, and verified the local legacy temporary test URL returned `403`. It did not remove the `/sub/clash.yaml` route, remove future query-token support, issue additional artifacts, mutate DNS/Nginx/AWS, restart services, or implement traffic/device enforcement.
- The 2026-05-24 legacy blue retirement preflight lives in `docs/production-replacement-records/2026-05-24-legacy-blue-retirement-preflight.md`. It was read-only: AWS, DNS, EIP, public boundary, and repository-reference checks only. It found legacy blue still running and currently reachable, DNS no longer pointing production names to legacy blue, and `47.129.247.102` still not confirmed as EIP. Follow-up repo cleanup moved active local config and current docs away from legacy blue. Any stop, terminate, or security-group cleanup still requires separate explicit A-tier retirement approval.
- The 2026-05-24 legacy blue stop record lives in `docs/production-replacement-records/2026-05-24-legacy-blue-stop.md`. It stopped only legacy blue instance `i-004ab1c6c71d06bca`, confirmed AWS state `stopped`, retained security group `sg-04a165ec77f430ee8`, and verified production domain health still resolves to `prod-edge-a` on `13.215.156.159`. It did not terminate the instance, delete the security group, mutate DNS, mutate `prod-edge-a`, mutate `prod-edge-b`, change production config, migrate tenants, rotate tokens, or copy secrets/data. Any termination or cleanup remains separate Risk A work.
- The 2026-05-24 legacy blue connectivity review lives in `docs/production-incident-records/2026-05-24-legacy-blue-connectivity-review.md`. It records local read-only evidence that TCP to legacy blue `47.129.247.102` timed out on SSH/HTTP/Shadowsocks while current green `18.136.102.226` remained reachable, with AWS status checks still `ok` for both nodes. The operator direction is to preserve legacy blue for review, lessons learned, dependency drain, and controlled exit; do not use it as the future durable production target. A clean new `prod-edge-a`/blue candidate requires separate Risk A creation approval.
- The 2026-05-25 prod-edge-a timeout / packet-loss preflight lives in `docs/production-incident-records/2026-05-25-prod-edge-a-timeout-packetloss-preflight.md`. It was read-only across local Windows, Aliyun SWAS, and prod-edge-a host vantages, then supplemented with local operator-device follow-ups after the operator clarified the issue was observed on this device and affected both configured nodes. HTTPS gateway, opaque artifact refresh, prod-edge-a local health, services, SQLite, resources, Nginx, and TCP `18388` checks were healthy during the sampled window. ICMP to prod-edge-a and prod-edge-b showed 100% loss from checked vantages while TCP succeeded, so ICMP is not a reliable production-health signal here. The local-device follow-ups found stable Wi-Fi-to-gateway behavior, active local proxy listeners, no TCP `18388` failure on either `prod-edge-a` or `prod-edge-b`, and short latency spikes across both production nodes and the local proxy path. Local Clash/Mihomo sidecar logs then confirmed real proxy-session `i/o timeout` errors to `ss-sg.globalcirclecat.com:18388`, with recent sampled occurrences mapped to the current prod-edge-a path and no sampled prod-edge-b occurrences. A temporary local prod-edge-b-only Mihomo diagnostic instance then completed 30/30 real proxy requests without timeout and was fully removed after the probe. No DNS/AWS/Nginx/service/token/artifact/tenant/cutover mutation occurred.
- The 2026-05-25 server edge mesh preflight lives in `docs/server-edge-mesh-records/2026-05-25-server-edge-mesh-preflight.md`. It was read-only across AWS inventory, local public checks, and prod-edge-a/prod-edge-b host checks. It found both nodes running in the same VPC/subnet with WireGuard kernel module available and WireGuard packages available but not installed; private VPC reachability works for existing service ports, while no WireGuard/mesh UDP ingress, keys, interface, or service exists. It did not mutate AWS, security groups, WireGuard, DNS, Nginx, systemd, production config, secrets, traffic, or cutover state.
- Production cutover strategy decision lives in `docs/PRODUCTION_CUTOVER_STRATEGY.md`. The selected medium-term path remains DNS/domain abstraction; do not rely on the current unconfirmed blue public IP as movable. Green now exists as a candidate, but cutover is still not approved.
- DNS/domain abstraction planning lives in `docs/DOMAIN_ABSTRACTION_PLAN.md`. It proposes `sub.globalcirclecat.com` for subscription delivery and `ss-sg.globalcirclecat.com` for Shadowsocks node DNS, but does not approve DNS, HTTPS, Nginx, AWS, production config, green creation, or cutover execution.
- DNS/domain implementation gates and commands live in `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`. It remains documentation-only until explicit Risk A execution approval and does not approve DNS, Nginx, HTTPS, production config, green creation, or cutover execution.
- The 2026-05-24 DNS/domain Stage 0 read-only execution record lives in `docs/domain-implementation-records/2026-05-24-stage0-preflight.md`. It performed only read-only AWS, AliDNS, public boundary, and Nginx log-redaction checks; no DNS, AWS, Nginx, HTTPS, production config, green, or cutover mutation occurred.
- The 2026-05-24 DNS/domain Stage 1 execution record lives in `docs/domain-implementation-records/2026-05-24-stage1-dns-records-to-blue.md`. It created AliDNS A records `sub.globalcirclecat.com` and `ss-sg.globalcirclecat.com` pointing to current blue `47.129.247.102` with TTL `600`; no AWS, Nginx, HTTPS, production config, green, or cutover mutation occurred.
- The 2026-05-24 DNS/domain Stage 2 HTTP-only validation record lives in `docs/domain-implementation-records/2026-05-24-stage2-http-only-validation.md`. It confirmed the existing blue Nginx default server returns the expected HTTP public boundary for `sub.globalcirclecat.com` and that active Nginx access-log checks still avoid query-token logging; no DNS, AWS, Nginx, HTTPS, production config, green, or cutover mutation occurred.

## Current Stage

- Active branch: `master` for the integrated baseline; create a new feature or ops branch before making further changes.
- Domain DNS and HTTP-only boundary validation have started, and a green production replacement candidate exists with current code-bearing commit `c53f7087fc30b340667d94e0523d094063972e0d` deployed. A read-only green cutover preflight passed health checks, but immediate cutover is still not approved or ready until fresh data/runtime/cutover gates are handled by separate explicit Risk A approval.
- Subscription V2 is now the intended replacement direction for the MVP subscription output. V2 should keep subscription URLs and tokens stable, emit an approved multi-node platform node set for valid tenants, keep expired/disabled behavior unchanged, and reserve traffic quota enforcement for a separate data-plane design.
- The next subscription access-model direction is device-scoped opaque subscription artifacts: random-looking per-device refresh URLs, no tenant token in the user-visible URL, dynamic V2 YAML on refresh, and server-side abuse signals for shared URLs. Backend repository/core/routes/admin support is implemented, one production canary artifact is active on `prod-edge-a`, and the active tenant's old primary/temporary legacy links have been drained. Broader artifact issuance, route-level legacy query-token retirement, and abuse enforcement remain separate Risk A work.
- Subscription V2 renderer behavior is implemented in code: default-primary records receive the configured V2 node set, while explicit non-default node assignment remains an operator canary override that scopes that record to the selected node. There is no active tenant-migration workstream because there are no production tenant migrations to execute; older tenant language refers to the historical SQLite subscription model and recorded production actions only. The active implementation direction is the local proxy production agent plus multi-node server-edge networking. Production node registration and emitted production node activation remain Risk A production node-config work.
- Current product/architecture priority is Subscription Control / Edge Split plus Local Edge Agent plus Server Edge Mesh: keep the subscription control plane authoritative, make edge nodes replaceable data-plane capacity, build a loopback-only local channel adapter that can generate local Clash/Mihomo subscriptions, then connect that adapter to platform-controlled multi-node edge networking. Subscription artifacts remain an access/bootstrap mechanism, not the main product architecture. Private operator lab / HP Relay work can inform channel-manager and multi-upstream behavior, but it is not production, staging, CI, `prod-edge-c`, Server Edge Mesh, or the official Local Edge Agent runtime.
- Nginx stays in front of the app as the gateway protection layer.
- The public Nginx gateway does not expose the static console UI. It allows `/api/health`, `/sub/clash.yaml`, and the canary opaque artifact path `/sub/a/*`; other public paths return `404`.
- `master` already includes the subscription hardening work: temporary `pgtmp_` links, primary-token rotation, `/sub` rate limiting, app-level `/api/admin` source-IP allowlisting, Nginx public UI blocking, and token redaction guidance.
- `PR #3 Add admin console shell` was merged into `master` on 2026-05-22.
- The admin UI calls the real `/api/admin/*` backend APIs. It is no longer mock-only.
- `PR #7 Refactor subscription core architecture` was merged into `master` on 2026-05-22.
- `PR #8 Add environment foundation` was merged into `master` on 2026-05-22.
- `PR #10 Restore subscriptions with service user` was merged into `master` on 2026-05-22.
- `PR #12 Stop logging console token` was merged into `master` on 2026-05-23 Asia/Shanghai.
- `PR #13 Update context token log fix` was merged into `master` on 2026-05-23 Asia/Shanghai.
- `PR #14 Update local project path` was merged into `master` on 2026-05-23 Asia/Shanghai.
- `master` now includes a minimal Git-tracked environment foundation: systemd templates, Nginx public gateway template, SQLite backup/restore scripts, expanded env example, and ops recovery documentation.
- The admin UI is intended for local use or SSH tunnel access only. Do not expose it through the public gateway.
- The hardening branch was deployed to AWS Singapore `47.129.247.102` on 2026-05-22.
- Default tracked node config now uses provider-neutral production labels and Subscription V2 output: `prod-edge-a` plus `prod-edge-b` as the iteration/canary secondary slot.
- Phase 1 completed the staging target decision and clean staging provisioning runbook. It was a docs/ops planning phase only; no AWS resources were created.
- Phase 2 auth boundary work tightens protected `/api/*` routes to `Authorization: Bearer <console-token>` only; `/sub/clash.yaml` keeps query-token support for Clash/Mihomo subscription clients.
- Phase 3 adds GitHub Actions CI for PRs into `master` and pushes to `master`; CI runs `npm test`, `npm run admin:test`, and `npm run admin:build` without AWS secrets or production deployment.
- Phase 3 GitHub-hosted runner validation is currently deferred by the account billing/spending-limit blocker. Manual CI-equivalent validation from clean or current PR heads has been used as a temporary waiver; use `docs/CI_MANUAL_VALIDATION.md` for the approved Aliyun manual CI validation host workflow, and rerun master CI after the quota/billing issue is resolved.
- While GitHub-hosted Actions remains blocked, the preferred manual CI host is the long-lived Aliyun validation server. It is not staging, not production, not a self-hosted runner, and not deploy approval. Each run must use a clean per-run workspace and must clean workspaces, repository credentials, archives, logs, and dependency caches afterward.
- The approved Aliyun manual CI host is currently known to be an Aliyun Simple Application Server / SWAS host, not ECS: `us-west-1`, instance `3e9253d3fb044463b876edacf6af8784`, public IP `47.251.178.125`, Ubuntu 24.04, running as of the 2026-05-24 read-only inventory check. Use `aliyun swas-open list-instances --region us-west-1 --biz-region-id us-west-1` for read-only inventory. Codex SSH access was restored and verified on 2026-05-24 using `~/.ssh/gao_new.pem`; the local `miyao` alias now points at the new key and `ssh miyao` has been verified. Node `v22.22.2`, npm `10.9.7`, and git `2.43.0` are installed.
- Manual CI-equivalent validation was run on 2026-05-24 Asia/Shanghai against PR #89 commit `5ed38d7801b4ea57b52418394369ad9c934a8886` using the long-lived Aliyun SWAS validation host. Node was `v22.22.2`, npm was `10.9.7`; `npm ci`, `npm ci --prefix admin`, `npm test` (`141/141`), `npm run admin:test` (`24/24`), and `npm run admin:build` all passed. The run used a local git archive transfer instead of remote repository credentials, and cleanup removed the remote `/tmp` workspace, remote archive, npm cache, and local archive. No production `.env`, `CONSOLE_TOKEN`, `SS_PASSWORD`, subscription URLs, SQLite data, cloud credentials, customer data, or production runtime was copied to the host.
- Phase 4.1 added Admin connection health checks in the frontend. The UI checks `/api/health` without auth and `/api/admin/overview` with Bearer auth; no backend endpoint, auth model, AWS, production, or Nginx change was introduced.
- Phase 4.2 added Admin dangerous action confirmations in the frontend. Disable and temporary-link actions require confirmation, reset-token copy and repeat-submit protection were improved, and generated subscription URLs remain visible-once only.
- Recent Phase 1 through Phase 4.2 changes did not mutate AWS or production unless explicitly documented above in the older hardening/runtime sync notes.
- HTTP Bridge robustness work is complete: PR #36 added the spec, PR #37 extracted `createBridgeServer()` into `server/services/http-bridge.mjs` with DI hooks, and PR #38 added boundary tests plus minimal robustness fixes.
- HTTP Bridge tests now cover malformed targets, injected fetch/SOCKS failures, CONNECT failure, body stream errors, CONNECT peer/client socket errors, loopback binding, and stop/release behavior.
- `npm test` currently reports 132/132 passing after tenant node assignment backend/API work. This work did not touch AWS, production, Nginx, systemd, Admin UI, PowerShell, `ss-local`, or `ss-server`.
- HTTP Bridge optional follow-ups are complete: PR #43 added HEAD/204/null-body handling, and PR #44 added client-normal-close cleanup. No urgent network follow-up remains.
- PR #45 added SQLite `busy_timeout = 2000` and throttled ordinary tenant `lastUsed` writes to a 15-minute in-memory window while keeping temp-link `usedAt` writes immediate. It did not change schema, token/auth behavior, AWS, or production.
- Manual CI-equivalent validation was run on 2026-05-23 Asia/Shanghai against `master` commit `6e9fd58f6be16ab221631c3e187a33c5d04493d5` using a temporary AWS `us-east-1` validation host, not staging or production. Node was `v22.22.2`, npm was `10.9.7`; `npm ci`, `npm ci --prefix admin`, `npm test` (`121/121`), `npm run admin:test` (`24/24`), and `npm run admin:build` all passed.
- Manual CI validation cleanup on 2026-05-23 Asia/Shanghai: failed first host `i-09369c659f34f9c0b` and successful validation host `i-0b59ded1efe64b920` are both `terminated`; temporary security groups `sg-09b712b7f676472c0` and `sg-02fe60a32c31f4866` were deleted; temporary AWS key pairs and local archive/key files were deleted. No production `.env`, `CONSOLE_TOKEN`, `SS_PASSWORD`, SQLite data, AWS credentials, customer data, or production runtime was copied to the host.
- Manual CI-equivalent validation was rerun on 2026-05-23 Asia/Shanghai against current `master` commit `20dfa9ec27e11b8b0318a5e48430a9013c49bd71` using a temporary AWS `us-east-1` validation host, not staging, production, or a self-hosted runner. Node was `v22.22.2`, npm was `10.9.7`; `npm ci`, `npm ci --prefix admin`, `npm test` (`129/129`), `npm run admin:test` (`24/24`), and `npm run admin:build` all passed.
- Manual CI cleanup for the current `master` rerun on 2026-05-23 Asia/Shanghai: failed first host `i-0979a0c142f043b1e` and successful validation host `i-0499860208e5e6949` are both `terminated`; temporary security groups `sg-06e77e37746770118` and `sg-058bbed4de0dfe8ac` were deleted; temporary AWS key pairs and local archive/key/log files were deleted. No production `.env`, `CONSOLE_TOKEN`, `SS_PASSWORD`, SQLite data, AWS credentials, customer data, or production runtime was copied to the host.
- Default project workflow now uses A/B/C risk tiers: C 档 docs-only uses direct PR + `git diff --check`; B 档 compact code changes use one PR with focused tests; A 档 AWS/production/node/Nginx/systemd/auth/schema/deploy work keeps the full strict gate. The detailed default rules live in `AGENTS.md`.

## Verified Local State

- Current branch: `master`
- Remote tracking branch: `origin/master`
- Local `master` and `origin/master` should be aligned before new work; use the quick-check commands below for the current commit.
- Recent architecture checkpoints:
  - `55d2496 docs: design subscription architecture refactor`
  - `04d5eed refactor: introduce subscription core and store contracts`
- GitHub PR #7: merged.
- GitHub PR #3: merged.
- GitHub PR #8: merged.
- GitHub PR #10: merged.
- GitHub PR #12: merged.
- GitHub PR #13: merged.
- GitHub PR #14: merged.
- Local Vite admin UI: `http://127.0.0.1:5173/`
- Local backend `127.0.0.1:3456` is not expected to be running unless a local server or SSH tunnel is started.
- Pre-hardening source branch commit: `d5341d4 docs: add domain https runbook`
- Latest deployed hardening base before config alignment: `93b8610 chore: finish subscription hardening verification`
- `v0.1.0-mvp` is tagged on `master` at `8d38d2c Merge pull request #5 from gaoyi1020-web/feat/subscription-admin-core`
- Stage close-out result: `ops/environment-foundation` was verified, merged as PR #8, restore ownership compatibility was merged as PR #10, and local/remote feature branches were cleaned up.

Quick check:

```powershell
git -C C:\Users\g\Projects\订阅管理\proxy-gateway-minimal status --short --branch
git -C C:\Users\g\Projects\订阅管理\proxy-gateway-minimal log --oneline --decorate -8
```

## Current Operations State

- Current production MVP target: `prod-edge-a` on `13.215.156.159`
- Current production gateway DNS: `sub.globalcirclecat.com -> 13.215.156.159`
- Current production gateway HTTPS: enabled for `https://sub.globalcirclecat.com` on `prod-edge-a`; HTTP still works without forced redirect.
- Current opaque artifact canary: `/sub/a/*` is exposed through the `prod-edge-a` Nginx gateway, one active artifact exists for controlled operator validation, and the full import URL is stored only in `C:\tmp\prod-edge-a-opaque-subscription-url-20260524T143100Z.txt` with local user ACL. Do not paste or commit that URL. Legacy `/sub/clash.yaml?token=...` remains active until a separate retirement plan and approval.
- Active tenant legacy link drain: after successful opaque import validation, the active tenant's primary legacy token was reset and active tenant temporary `pgtmp_` links were expired. The local stale legacy temporary test URL returned `403`; the opaque artifact URL returned `200`. The `/sub/clash.yaml` route and query-token mechanism still exist for any future generated tokens.
- Latest timeout / packet-loss preflight: sampled local Windows, Aliyun SWAS, and prod-edge-a host checks did not show prod-edge-a host, Nginx, HTTPS gateway, opaque artifact route, or TCP `18388` failure. ICMP loss was observed to prod-edge-a and prod-edge-b even while TCP succeeded; treat ICMP as non-authoritative for this incident. If proxy timeouts continue, next evidence should come from client-side Clash/Mihomo logs or controlled Shadowsocks end-to-end probes.
- Current production Shadowsocks primary DNS: `ss-sg.globalcirclecat.com -> 13.215.156.159`
- Current production instance: `i-0b7791340d3fedff5`
- Current production security group: `sg-0379ece0b3d305c43`
- Iteration/canary secondary node in Subscription V2 output: `prod-edge-b`, currently carried by the validated green instance `18.136.102.226`
- Legacy blue under review: instance `i-004ab1c6c71d06bca`, security group `sg-04a165ec77f430ee8`. It was stopped on 2026-05-24 after active local config/current docs moved away from it and production DNS validation showed `sub.globalcirclecat.com` / `ss-sg.globalcirclecat.com` resolving to `prod-edge-a`. Do not terminate it or delete its security group until separate A-tier retirement approval is given.
- Public Nginx exposure verified on 2026-05-22: `/` and `/index.html` return `404`, `/api/admin/subscriptions` returns `404`, `/api/health` returns `200`, and `/sub/clash.yaml` with a valid token returns `200`.
- Production `proxy-gateway-console.service` and `proxy-gateway-ss.service` were verified active on 2026-05-22.
- Production admin API is reachable from the server itself on `127.0.0.1:3456` with the production `CONSOLE_TOKEN`.
- Production admin API returned 2 subscription users on 2026-05-22: `karing-blue-sg` and `karing-blue`.
- Production deploy directory `/opt/proxy-gateway-minimal` is not a Git checkout; verify deployment by file presence, service status, and endpoint behavior rather than `git rev-parse` on the server.
- PR #8 ops files were synced to production on 2026-05-22 without restarting services: `ops/`, `scripts/backup-subscriptions.sh`, and `scripts/restore-subscriptions.sh`.
- Production `sqlite3` package was installed on 2026-05-22 so SQLite backup/restore scripts can run.
- Current prod-edge-a production subscription DB path is `/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite`. Historical records may mention `/opt/proxy-gateway-minimal/data/subscriptions.sqlite`; verify the active path from runtime `.env` before any production backup, restore, or SQLite inspection.
- Production backup verification passed on 2026-05-22: `/opt/proxy-gateway-minimal/data/backups/subscriptions-20260522T160153Z.sqlite` was created with mode `600` and `sqlite3 ... "pragma integrity_check;"` returned `ok`.
- Production endpoint verification after ops sync on 2026-05-22: local `/api/health` returned `200`, local `/api/admin/subscriptions` without token returned `401`, public `/` returned `404`, public `/api/health` returned `200`, public `/api/admin/subscriptions` returned `404`, and public `/sub/clash.yaml` without token returned `401`.
- PR #12 runtime files were synced to production and `proxy-gateway-console.service` was restarted on 2026-05-23 Asia/Shanghai. Post-restart journal check showed `raw_console_token_lines=0`; the service now logs `Console Token Source: env` and `Console Token Store: ...` instead of the raw admin token.
- Post-restart production endpoint verification on 2026-05-23 Asia/Shanghai: `proxy-gateway-console.service`, `proxy-gateway-ss.service`, and `nginx` were active; public `/api/health` returned `200`, public `/api/admin/subscriptions` returned `404`, and public `/sub/clash.yaml` without token returned `401`.
- Green production replacement candidate created on 2026-05-24 Asia/Shanghai: `i-0ad8676ee113d14cb`, public IP `18.136.102.226`, security group `sg-06682c36aa03834f7`, initial deployed commit `57e4f39aeb8847ae45b7e6f1c860988ef79ce345`. Green validation passed: services active, `nginx -t` ok, local health `200`, local admin without token `401`, public health `200`, public admin `404`, public subscription without token `401`, root path `404`, SQLite integrity `ok`, `18.136.102.226:18388` TCP reachable, and valid console-bearer subscription fetch generated YAML pointing at green. No cutover occurred.
- Green refreshed to current `master` on 2026-05-24 Asia/Shanghai: deployed commit `c53f7087fc30b340667d94e0523d094063972e0d`; green validation passed with Node `v22.22.2`, npm `10.9.7`, `npm test` `132/132`, admin tests `24/24`, admin build passed, services active, SQLite integrity `ok`, public green boundary `200/404/401/404`, green `18388` TCP reachable, PR #66 node reassignment guard returned `400 validation_error` on missing `nodeId`, and console-bearer subscription YAML pointed at green. No blue, DNS, HTTPS, production config, tenant migration, or cutover mutation occurred.
- Green cutover preflight on 2026-05-24 Asia/Shanghai passed read-only checks: blue and green services were active, SQLite integrity returned `ok` on both, DNS still resolved `sub.globalcirclecat.com` and `ss-sg.globalcirclecat.com` to blue `47.129.247.102`, public boundaries stayed `200/404/401/404`, `18388` was reachable on both, and Nginx token-query log checks were clean. Immediate cutover and tenant canary were not ready at that time; future work should treat the validated green instance as the current `prod-edge-b` carrying instance and handle any lifecycle change through separate explicit Risk A approval.
- Legacy blue connectivity review on 2026-05-24 Asia/Shanghai found current local operator-network TCP timeouts to legacy blue `47.129.247.102` on `22`, `80`, and `18388`, while current green `18.136.102.226` remained reachable on the same ports. AWS instance and system status checks were still `ok` for both nodes, and security groups still allowed the expected service ports. Treat the finding as path/IP-level incident evidence from the current local vantage point; do not claim global customer impact without additional vantage or customer evidence.
- `prod-edge-a` candidate preflight on 2026-05-24 Asia/Shanghai defined the next mutating approval phrase: `Create a clean prod-edge-a production candidate. Do not cut over traffic.` That phrase authorizes only candidate creation and validation, not DNS cutover, production config migration, tenant migration, green promotion, legacy blue shutdown, or customer traffic movement.
- `prod-edge-a` candidate creation on 2026-05-24 Asia/Shanghai created `i-0b7791340d3fedff5` / `13.215.156.159` with security group `sg-0379ece0b3d305c43`, deployed `cea90040a45458211570ae207214c4b2963ccc2a`, installed Node `v22.22.2` / npm `10.9.7`, passed `npm test` `133/133`, Admin tests `24/24`, Admin build, service health, SQLite integrity, public boundary `200/404/401/404`, `18388` TCP reachability, and loopback-only checks for `3456` / `18180` / `1080`. It used current green as the temporary runtime boundary source because legacy blue SSH timed out, normalized only the candidate SQLite copy to `prod-edge-a`, and did not change DNS, blue, green, production config, production tenants, or cutover state.
- Current production subscription gateway authoritative DNS now points to prod-edge-a `13.215.156.159`: `sub.globalcirclecat.com` and `ss-sg.globalcirclecat.com` were updated in AliDNS with TTL `600`. prod-edge-a has fresh legacy-blue-derived SQLite data and runs Subscription V2 output with `prod-edge-a` plus `prod-edge-b` as the iteration/canary secondary slot (currently carried by the validated green instance `18.136.102.226`). The active production tenant is assigned to `prod-edge-a`; the disabled tenant was not changed. A temporary local test subscription link was generated under `C:\tmp\` and validated with `200` YAML output containing `prod-edge-a` and `prod-edge-b`; the link/token is not tracked or recorded. Local recursive DNS cache briefly returned the previous legacy-blue IP during retirement validation, but after cache clear the default resolver returned `ss-sg.globalcirclecat.com -> 13.215.156.159`. Replacing the `prod-edge-b` carrying instance, durable third-node work, HTTPS, traffic accounting, final legacy-blue termination, or rollback requires separate explicit Risk A approval.
- Previous AWS instance with project tag `proxy-gateway-minimal`: `i-0589aac321172dd74`, verified live as `stopped`
- Read-only AWS refresh on 2026-05-23 confirmed no staging/pre-release instance is currently assigned. The stopped `i-0589aac321172dd74` node must not be used as staging unless it is explicitly reassigned, retagged, and verified first.
- The production public IP `47.129.247.102` was not returned by `describe-addresses` on 2026-05-23, so it is not currently documented as an Elastic IP allocation. Do not stop the production instance without an IP retention plan.
- Production runtime listeners verified on 2026-05-23: public Nginx `80/tcp`, public Shadowsocks `18388/tcp+udp`, loopback console/API `127.0.0.1:3456`, and loopback HTTP proxy `127.0.0.1:18180`.
- Historical note: HTTPS to the old legacy-blue IP `https://47.129.247.102/api/health` did not establish on 2026-05-23. Current production HTTPS is now enabled on `https://sub.globalcirclecat.com` for `prod-edge-a`; legacy-blue IP HTTPS is not part of the active production path.
- Local ignored files under `.proxy-gateway/aws-singapore/` may be stale. In particular, old cached files referenced `52.221.198.76`; prefer live AWS queries over those cached status files.

To connect the local admin UI to the current prod-edge-a backend, open an SSH
tunnel:

```powershell
ssh -i "$env:USERPROFILE\.ssh\proxy-gateway-aws-sg-20260521.pem" -L 3456:127.0.0.1:3456 ubuntu@13.215.156.159
```

For legacy-blue review only, use the old target if the operator network can
reach it:

```powershell
ssh -i "$env:USERPROFILE\.ssh\proxy-gateway-aws-sg-20260521.pem" -L 3456:127.0.0.1:3456 ubuntu@47.129.247.102
```

Then use these UI settings:

```text
API base URL: leave blank in Vite dev mode so same-origin /api requests use the dev proxy
Console token: production CONSOLE_TOKEN from /opt/proxy-gateway-minimal/.env
```

Do not set the browser UI API base URL directly to `http://127.0.0.1:3456` unless the target backend sends CORS headers. The production backend does not currently expose browser CORS, so Vite dev proxy is the intended local testing path.

## Environment Connectivity

Verified on 2026-05-22:

- GitHub remote: `https://github.com/gaoyi1020-web/proxy-gateway-minimal.git`
- GitHub CLI account: `gaoyi1020-web`
- Repository permission: `ADMIN`
- Repository visibility: `PRIVATE`
- Remote branches checked after PR #12 cleanup: `master`, `ops/domain-https`
- AWS CLI identity: IAM user `arn:aws:iam::580857941765:user/gaoyi1020@gmail.com`
- AWS default region: `us-east-1`; use `--region ap-southeast-1` for the running Singapore node.
- AWS query for `47.129.247.102` returned the running instance `i-004ab1c6c71d06bca`.

If AWS or GitHub commands fail because the local proxy points to a dead `127.0.0.1:18180`, clear proxy variables for the process first:

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
```

Safe AWS refresh command:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aws ec2 describe-instances --region ap-southeast-1 --filters Name=ip-address,Values=47.129.247.102 --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,Type:InstanceType,LaunchTime:LaunchTime,Name:Tags[?Key=='Name']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value,Project:Tags[?Key=='Project']|[0].Value,SecurityGroups:SecurityGroups[*].GroupId}" --output table
```

## Domain And HTTPS Decision

- `sub.globalcirclecat.com` is now the active HTTP production subscription gateway host for `prod-edge-a`; `ss-sg.globalcirclecat.com` is the active Shadowsocks node DNS for `prod-edge-a`.
- HTTPS is enabled for `sub.globalcirclecat.com` on `prod-edge-a` with no automatic HTTP-to-HTTPS redirect. The 2026-05-24 issuance installed Certbot `2.9.0`, issued the certificate, enabled Nginx `443`, and passed renewal dry-run.
- `docs/DOMAIN_HTTPS.md` exists as an earlier domain HTTPS runbook. Treat current execution gates as `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md` plus the latest prod-edge-a HTTPS preflight/execution records.
- Do not change redirect behavior, issue additional artifacts, retire legacy query-token access, make further Nginx/certificate changes, or expand opaque artifact activation beyond the recorded canary without separate explicit Risk A approval.
- `docs/DOMAIN_ABSTRACTION_PLAN.md` is the planning document for the broader DNS/domain abstraction path.
- `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md` converts the domain abstraction plan into exact gates, commands, validation, and rollback, but still requires explicit Risk A execution approval before any mutation.
- Aliyun CLI is installed (`aliyun version` returned `3.3.15`).
- Aliyun manual CI inventory should use SWAS, not ECS, for the approved long-lived validation host: `aliyun swas-open list-instances --region us-west-1 --biz-region-id us-west-1`. Codex can connect with `ssh miyao`, which now points at `~/.ssh/gao_new.pem`.
- AliDNS credentials worked for a read-only `DescribeDomainRecords` call on 2026-05-22.
- Historical note: `sub.globalcirclecat.com` had no `sub` record during the initial 2026-05-22 domain check, but it now resolves to prod-edge-a.
- Keep Nginx as the gateway/protection layer.

AliDNS refresh command:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aliyun alidns DescribeDomainRecords --DomainName globalcirclecat.com --RRKeyWord sub --PageSize 10
```

## Existing Docs To Read

- `README.md`: user-facing project and API documentation.
- `qa-report.md`: v0.1.0 test and QA summary. It is useful for test coverage, but the server references are historical.
- `docs/ENVIRONMENT_TOPOLOGY.md`: source-of-truth map for local repo, GitHub, branch roles, and AWS runtime roles.
- `docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md`: target split between subscription control-plane authority and edge data-plane capacity.
- `docs/DEPLOYMENT_FLOW.md`: promotion flow from development to CI, candidate, staging, production, and rollback.
- `docs/STAGING_TARGET_DECISION.md`: decision record for choosing a clean staging instance versus rebuilding the stopped historical node.
- `docs/STAGING_PROVISIONING.md`: operator runbook for creating, validating, stopping, or destroying a clean staging instance.
- `docs/PRODUCTION_DR.md`: production single-node disaster recovery runbook, including hard-stop rules, read-only inventory, backup/restore requirements, recovery options, validation, and incident recording.
- `docs/PRODUCTION_REPLACEMENT.md`: blue-green production replacement runbook for keeping blue online, creating and validating a green production replacement candidate, choosing an IP/DNS/client cutover strategy, and preserving rollback gates.
- `docs/PRODUCTION_EDGE_FLEET.md`: production edge fleet plan for `prod-edge-a`, `prod-edge-b`, and `prod-edge-c`, including second-node and third-node standby boundaries.
- `ops/edge-node/README.md`: repo-only provider-neutral build materials for the future `prod-edge-c` recovery slot; no execution authority and no production secrets/data.
- `docs/production-replacement-preflight/2026-05-24-blue-green-preflight.md`: read-only preflight record for blue-green production replacement readiness; no AWS or production mutation was performed.
- `docs/PRODUCTION_CUTOVER_STRATEGY.md`: production cutover strategy decision record comparing EIP, DNS/domain, and subscription/node-config update options before any green creation approval.
- `docs/DOMAIN_ABSTRACTION_PLAN.md`: DNS/domain abstraction planning document for subscription base URL, Shadowsocks node host, DNS/TTL, HTTPS/Nginx, client migration, blue/green parallel window, and rollback gates.
- `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`: DNS/domain implementation runbook with explicit approval gates, AliDNS checks and commands, HTTP/HTTPS validation, Nginx access-log redaction checks, runtime config migration gates, client migration window, and rollback steps.
- `docs/CI_MANUAL_VALIDATION.md`: runbook for Aliyun manual CI validation host usage and fallback clean-server CI-equivalent validation while GitHub-hosted Actions is blocked.
- `docs/NETWORK_FORWARDING.md`: network forwarding architecture for local, PAC, Clash/Mihomo, Admin, production runtime paths, and the staging test matrix for node changes.
- `docs/DOMAIN_HTTPS.md`: earlier domain HTTPS runbook. Current HTTPS execution should follow the active domain implementation runbook and latest prod-edge-a HTTPS preflight/execution records.
- `docs/superpowers/specs/2026-05-22-admin-console-real-api-design.md`: real admin API integration design.
- `docs/superpowers/plans/2026-05-22-admin-console-real-api.md`: implementation plan for wiring `admin/` to `/api/admin/*`.
- `docs/superpowers/specs/2026-05-23-admin-connection-health-design.md`: Admin connection health design.
- `docs/superpowers/plans/2026-05-23-admin-connection-health.md`: implementation plan for Admin connection health.
- `docs/superpowers/specs/2026-05-23-admin-dangerous-action-confirmations-design.md`: Admin dangerous action confirmation design.
- `docs/superpowers/plans/2026-05-23-admin-dangerous-action-confirmations.md`: implementation plan for Admin dangerous action confirmations.
- `docs/superpowers/specs/2026-05-23-http-bridge-boundary-tests.md`: HTTP Bridge boundary testing and robustness contract, implemented by PR #37 and PR #38.
- `docs/superpowers/specs/2026-05-21-subscription-admin-core-design.md`: backend subscription-admin design.
- `docs/superpowers/plans/2026-05-21-subscription-admin-core.md`: implemented plan for the `feat/subscription-admin-core` branch that became `v0.1.0-mvp`.

## Implemented Baseline

`v0.1.0-mvp` includes:

- SQLite-backed subscription tenants.
- Hashed tenant tokens with visible-once raw token responses.
- Admin subscription APIs under `/api/admin/subscriptions`.
- Tenant-token `/sub/clash.yaml` fetch.
- Console-token subscription compatibility during migration.
- Existing tests reported as 76 passing in `qa-report.md`.

## Recent Hardening Close-Out

Branch: `feat/subscription-hardening`.

Implemented scope:

- Temporary random subscription links.
- Token rotation.
- Rate limiting on `/sub`.
- Block `/api/admin` from public access.
- Block the public static console UI at Nginx.
- Desensitize access logs so subscription tokens are not written to logs.
- Align tracked default node config with the deployed AWS Singapore node.

## Recent Admin UI Integration

Branch: `feat/admin-console-shell`.

Implemented scope:

- Separate Vite React admin app under `admin/`.
- Real admin API client with bearer `CONSOLE_TOKEN` auth.
- In-app connection panel for API base URL and console token.
- Blank API base URL support for same-origin `/api` requests through the Vite dev proxy.
- Subscription page wired to list, create, renew, disable, enable, reset token, and create temporary links.
- Overview and nodes pages wired to backend `/api/admin/overview` and `/api/admin/nodes`.
- Existing subscription URLs are not fabricated in the UI; full URLs are only shown immediately after create, reset, or temporary-link generation.
- Mobile layout was checked and adjusted so the connection panel does not overflow at narrow widths.

Verified on 2026-05-22:

- `npm run admin:build`: passing.
- `npm test`: passing, 97 tests.
- `npm run admin:test`: passing, 7 tests.
- Chrome mobile-width check: `innerWidth=390`, `docWidth=390`, `bodyWidth=390`.
- GitHub PR #3 includes the Vite dev proxy fix for local UI testing through an SSH tunnel.
- Real UI through Vite dev proxy plus SSH tunnel loaded production data on 2026-05-22: 2 subscription users, no browser fetch failure.

## Recent Subscription Architecture Refactor

Branch: `feat/subscription-architecture-refactor`, merged into `master` as PR #7.

Implemented scope:

- `SubscriptionCore` is exported from `server/services/subscriptions/core.mjs`.
- `server/services/subscriptions/service.mjs` remains as a compatibility export for existing imports.
- `SubscriptionStore` required methods are documented and validated in `store-contract.mjs`.
- Current SQLite implementation is exposed as `createSqliteSubscriptionStore`, with `createSubscriptionRepository` retained as a compatibility alias.
- Serializer and validation helpers were split out of the core module.
- `createPlatformSubscriptionIntegration()` defines the future platform/payment caller boundary without adding public platform APIs.
- Runtime state now exposes both `subscriptions.core/store` and compatibility aliases `subscriptions.service/repository`.
- Contract tests verify core/store/platform boundaries and confirm public subscription refresh does not depend on platform integration availability.
- HTTP routes prefer `subscriptions.core` and keep `subscriptions.service` as a compatibility fallback.
- `SubscriptionCore` exposes `listNodes()` as the stable node-list contract and keeps `nodes()` as a compatibility alias.
- `/api/admin/overview` returns flat UI fields and retains the legacy `counts` object.

## Recent Environment Foundation

Branch: `ops/environment-foundation`, merged into `master` as PR #8.

Implemented scope:

- Expanded `.env.example` with production subscription runtime variables.
- Added systemd templates under `ops/systemd/`.
- Added the public Nginx gateway template under `ops/nginx/`.
- Added SQLite backup and restore scripts under `scripts/`.
- Added `ops/README.md` with deployment, recovery, tunnel, and verification steps.
- Added `server/tests/environment-foundation.test.mjs` so the ops boundary remains checked by `npm test`.
- PR #10 updated `restore-subscriptions.sh` to derive the restored database owner from the systemd service `User`/`Group` instead of hard-coding `proxy-gateway`, which matches the current production service running as `ubuntu`.

Non-goals for this branch:

- No Docker, Terraform, Ansible, or GitHub Actions yet.
- No live AWS server mutation from the branch.
- No database migration away from SQLite.

Before continuing from a new session, refresh the repo and current AWS state:

```powershell
cd C:\Users\g\Projects\订阅管理\proxy-gateway-minimal
git status --short --branch
git fetch origin
```

## Guardrails

- Do not commit secrets, subscription URLs with real tokens, `.proxy-gateway/`, or AWS/SS credential material.
- Do not rely on ignored `.proxy-gateway/aws-singapore/` status files without verifying live state first.
- Do not change domain DNS, HTTPS redirect behavior, production base URL, opaque artifact exposure, or legacy subscription access unless the user explicitly asks for it and the work is recorded through the relevant Risk A gate.
- Do not remove Nginx from the gateway path while hardening public access.
- When changing auth, rate limits, or logs, add focused tests and run `npm test`.
