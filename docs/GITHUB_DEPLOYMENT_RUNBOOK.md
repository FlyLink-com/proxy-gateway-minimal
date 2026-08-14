# GitHub Deployment Runbook

Last updated: 2026-07-24, America/Los_Angeles.

This runbook defines the repository-owned GitHub deployment foundation for
`proxy-gateway-minimal`. It is not a production approval. Production host,
Nginx, systemd, firewall, data-plane runtime, DNS, schema, or protected material
changes still require a separate Risk A gate.

## Current Baseline

- `.github/workflows/ci.yml` validates pushes and pull requests to `master`.
- `release-artifact.yml` packages the current commit as a source artifact and
  records its SHA256.
- `deploy-cloudflare-site.yml` builds and verifies the public static site. It
  only deploys when the protected `cloudflare-production` environment allows
  it and either manual confirmation is provided or
  `CLOUDFLARE_SITE_AUTO_DEPLOY=true` is set as a repository or environment
  variable.
- `production-deploy-dry-run.yml` creates a production deploy packet and runs
  validation without contacting or mutating production hosts.

## Deployment Lanes

### Cloudflare Static Site

Scope:

- Builds `admin/dist-site` through `npm run cloudflare:site:build`.
- Verifies the public-site boundary with `npm run cloudflare:site:verify`.
- Runs the pinned Wrangler dry-run before any publish.

Required GitHub environment:

- `cloudflare-production`

Required secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional variable:

- `CLOUDFLARE_SITE_AUTO_DEPLOY=true`

If the auto-deploy variable is absent or not exactly `true`, pushes to `master`
only validate the static site. Manual deploys still require `workflow_dispatch`
with `mode=deploy` and confirmation text `deploy cloudflare site`.

### Production Runtime Preparation

`production-deploy-dry-run.yml` is intentionally a dry-run-only gate. It:

- validates root and Admin test/build commands;
- packages the current commit into a source artifact;
- records the target, release label, expected current release, and SHA256;
- uploads a short-lived deploy packet for operator review.

It does not:

- SSH to Vultr Japan or Singapore;
- switch production release symlinks;
- restart services;
- mutate Nginx, DNS, firewall, systemd, runtime configs, or SQLite;
- read or print protected runtime material.

### Japan Runtime-Config Additive Repair

`.github/workflows/japan-runtime-config-additive-repair.yml` defines a manual,
source-only production capability for release unit `japan-runtime-config` and
strategy `additive_missing_only`. Its protected Environment is
`vultr-japan-production`. Merging this workflow does not approve or perform a
production operation. Every dispatch and execution remains behind a separate
exact Risk A Gate.

This lane consumes only the new immutable source artifact from run
`30092196734`:

- source commit: `70880d83761b165e91e9c521ec480fcc840375fb`;
- artifact file: `proxy-gateway-japan-tuic-additive-repair-20260724-001.zip`;
- artifact size: `4829111` bytes;
- artifact SHA-256:
  `43d5cea28dc70b838f95706690b45282297b1dae3cfe3b76ab941660ed7a83fe`;
- gate basis: `japan-tuic-identity-additive-repair-20260724-003`;
- execution gate: `github-actions-japan-tuic-additive-repair-20260724-002`;
- candidate: `add=3`, `remove=0`, `deferred_remove=46`, `changed=0`,
  `missing_material=0`, `projected_map=82`.

The artifact manifest uses `control-plane-app` because the ZIP carries the
reviewed helper source. The archive is only an immutable tool carrier in this
lane: **control-plane-app is not authorized**. Application installation,
release switching, service or timer restart, stale deletion, schema/database
changes, and adjacent infrastructure mutation remain prohibited.

The fixed 2026-07-24 map-repair ZIP remains unchanged. It can establish only
the reviewed map-helper boundary it contains; it cannot prove that a newer
host-side sibling helper is deployed. Before bootstrap, the separately approved
Risk A Gate must bind both the deployed forced-command runner and its sibling
helper to the reviewed source release. This source/deployment binding is a
bootstrap prerequisite, not evidence that bootstrap, dispatch, map apply, or
closed-loop repair succeeded.

The preflight job has no production secrets. It validates the exact artifact
digest and independently compares the archive's canonical paths, blobs, and
executable modes with the artifact Git tree at
`70880d83761b165e91e9c521ec480fcc840375fb`. The dispatcher supplies the
required `approval_pr` number, not an approval token or confirmation value.
Before artifact download or any connection-secret reference, the protected
execute job queries that PR and accepts it only when its exact merge commit is
the workflow commit, its `Validate` check passed, and the latest state from an
approving reviewer other than the actual triggering actor is `APPROVED` on the
PR final head. This source authorization is reusable while those conditions
remain true; `approval_pr` is not a one-time or consumed credential. It then
streams the verified archive to a host-side forced command; it does not receive
an interactive shell, PTY, forwarding, SCP, rsync, or an operator SSH identity.
Logs and summaries contain aggregate receipts only.

#### Bootstrap Probe Before a New Execution Identity

After any execution that lacks a validated receipt, use
`.github/workflows/japan-runtime-config-bootstrap-probe.yml` before creating a
new final execution identity. The probe is manual-only, uses the same protected
Environment and five temporary connection secrets, and deliberately streams no
artifact input to the restricted command. It can only be accepted when the
aggregate receipt proves `stopped_pre_apply`, `artifact_identity_mismatch`,
verified host authorization cleanup, and the expected nonzero SSH status. It
does not download an artifact, apply a map, alter a service or timer, or change
any production configuration.

The probe consumes its temporary identity. On either success or failure, delete
all five temporary GitHub Environment secrets, read back their name absence,
and independently verify that the one marked host authorization is absent before
creating the distinct final execution identity. A
`receipt_validation_failed_without_production_claim` summary is diagnostic
evidence only: it does not prove map apply, rollback, host cleanup, or a
production result.

#### Japan TUIC Observation Source Prerequisite

The Japan TUIC repair-observation source is a bounded `Risk: B` capability for
release unit `control-plane-app` with `identity_impact: true`. Its deployment,
protected observation-file path, and active timer are recorded separately from
this source gate. Neither the writer deployment nor this new immutable artifact
creates CI credentials or bindings, changes a protected map, or dispatches this
workflow. They are not closed-loop repair results.

Before any repair execution, a separately approved Risk A sequence must occur
in this order:

1. deploy the reviewed control-plane source;
2. configure one protected observation-file path;
3. wait for two naturally timer-written accepted Japan observations;
4. complete a fresh aggregate preflight;
5. bootstrap the temporary forced-command identity;
6. dispatch one run; and
7. prove host and GitHub cleanup.

Each numbered action remains independently bounded by its applicable Risk A
authorization. The collector timer is the only observation producer: the
repair runner must not manually invoke, restart, enable, or disable it.

#### CI Identity Bootstrap Gate

> **Blocked pending a separate exact Risk A authorization.** This runbook does
> not authorize host bootstrap or workflow dispatch. A typed confirmation,
> unprotected manual run, or an `approval_pr` alone is not an acceptable
> substitute. The merged-PR check below is source authorization only; source
> authorization is not production success.

This independent exact Risk A Gate must be approved and completed before any
workflow dispatch. It creates a new temporary, dedicated CI SSH identity,
installs only the reviewed forced-command runner and its reviewed sibling
helper from the same reviewed source release, installs one marked restricted
authorization, pins the target host key, and writes only these five temporary
connection Environment secrets:

- `JAPAN_CI_HOST`
- `JAPAN_CI_PORT`
- `JAPAN_CI_USER`
- `JAPAN_CI_PRIVATE_KEY`
- `JAPAN_CI_KNOWN_HOSTS`

The Gate must bind the merged workflow commit, runner SHA-256, CI public-key
fingerprint, redacted endpoint/host-key identities, exact host and GitHub
mutations, and cleanup readback. It must stop if the principal would gain a
general shell or broader sudo authority. It must not create a production user,
daemon, provider resource, network rule, reusable deploy key, or generic
deployment access.

Bootstrap stops if the restricted principal would gain a general shell or
broader sudo authority. A typed dispatcher value, an unprotected manual run,
or an `approval_pr` that fails the exact merged-commit, final-head review,
`Validate`, or triggering actor checks is not an acceptable fallback.

#### Quantitative Production Execution Gate

After bootstrap readback, a second independent exact Risk A Gate authorizes one
manual workflow run and no automatic retry. The dispatcher starts the workflow
on the exact merged `master` commit and supplies `approval_pr`. Before artifact
download or any `JAPAN_CI_*` secret reference, the execute job uses its
ephemeral GitHub token to verify that the nominated PR was merged at that exact
workflow commit, has a passed `Validate` check, and has a latest-state
`APPROVED` review on its final head from an account other than the actual
triggering actor. The check is fail-closed; missing, unmerged, drifted,
stale-head, failed-`Validate`, or triggering-actor-only review evidence stops
the run before protected material is read. A rerun requires a new exact Risk A
dispatch/execution Gate, but may reuse the same `approval_pr` source
authorization while all merged-commit, final-head-review, `Validate`, and
triggering-actor conditions still pass. The earlier
`japan-tuic-identity-additive-repair-20260724-003` review is evidence for the
new source artifact and candidate counts; it is not CI execution authority.

The merged-PR check is reusable source authorization, not a one-time or
consumed credential. It authorizes only the reviewed source boundary. It does
not bootstrap a host identity, authorize dispatch, apply the map, or establish
a successful production result; those remain separately authorized and
validated Risk A actions.

The run must reproduce two stable pre-apply snapshots with the exact candidate
above before backup or mutation. A successful apply must produce this
aggregate Identity Gate:

```yaml
runtime_count: 36
mapped_count: 36
missing: 0
stale: 46
changed: 0
missing_material: 0
retention_state: pending
state: degraded
```

The runner creates a protected local backup, replaces only the approved map,
waits for a bounded natural timer-driven observation, and restores the backup
on any post-apply or observation failure. It never manually invokes or restarts
the collector. The fixed helper invocation never receives `--status-path`, so
dry-run, apply, rollback validation, and failure handling cannot write producer
status outside the protected-map backup boundary. The acceptance read uses a
fresh timer/service snapshot after the candidate observation. `stale=46`
remains unresolved; success must not be reported as identity healthy or
retention complete.

Closeout is mandatory after either apply or rollback. The forced command must
perform and verify **host authorization revocation** for only its marked key and
remove its Gate-owned temporary material. A separately authorized GitHub
mutation must then perform **GitHub secret deletion** for all five temporary
Environment connection secrets and read back name absence. Until both readbacks
succeed, the operation is incomplete and no later `control-plane-app` canary
Gate may be submitted.

## Future Production Promotion Gate

Real Japan or Singapore deployment should be added only after the dry-run packet
has been reviewed. The production workflow must remain manual and protected by a
GitHub Environment such as `vultr-japan-production` or
`vultr-sgp-production`.

Minimum future steps:

1. Read-only inventory of the target host and current release.
2. Stop if `expected_current_release` does not match live current.
3. Upload the reviewed artifact and verify remote SHA256.
4. Back up current symlink, protected env, proxy config, subscription DB, and
   systemd metadata as applicable. For the shared control DB, follow the
   separate [control-plane snapshot and restore contract](CONTROL_PLANE_DB_SNAPSHOT_RESTORE_CONTRACT.md)
   exactly: it requires a stopped, runtime condition start-blocked service and
   does not permit an automatic database restore.
5. Run `npm ci`.
6. Switch current release.
7. Restart only the approved service.
8. Validate health, public boundaries, internal route rejection, no-session API
   rejection, and data-plane listener/readiness checks.
9. Stop if validation fails; require an explicit approved rollback decision and
   the relevant rollback-runbook execution. Any control or subscription DB
   restore is a separate explicit decision and must never be automatic.

### Protected Release Overlay Identity Gate

The GitHub artifact remains source-only. Both `.env` and
`config/proxy-servers.json` are explicit source-ZIP exclusions and must not be
packaged in the GitHub source artifact or its public `artifact.json`.
The static `.env` exclusion is a containment defense, not a verifier waiver:
the source-only verifier blocks a tracked `.env`, `.env.<non-example>`,
database, key, log, or backup path in either the trusted Git tree or ZIP. Only
`config/proxy-servers.json` remains review-only and is the explicit verifier
omission. `.env.example` remains a tracked safe template and is not excluded.
During an approved Risk A release preparation, the candidate must be a real
directory reached through no symbolic-link or junction component and must be
missing both `.env` and `config/proxy-servers.json`. The gate copies the
protected active overlays into that source-only candidate on the target host.

The gate has three explicit steps:

1. Run a read-only prepare dry-run to prove that both candidate overlay paths
   are absent and that the active protected files have safe regular-file and
   parent-directory boundaries.
2. Run prepare with `--apply` to atomically create the protected `.env` and
   `config/proxy-servers.json` files in the inactive candidate, then write a
   mode-0600 `release-assembly.json`. The manifest contains only release
   names, relative paths, SHA256 values, sizes, modes, and creation time; it
   contains no protected content or absolute path.
3. Run read-only verify before the `current` pointer switch. A missing,
   pre-existing, symlinked, mismatched, or invalid overlay/manifest stops the
   promotion before any pointer or service mutation.

Example inside an approved production release preparation:

```bash
npm run release:config:prepare -- \
  --active-release "$ACTIVE_RELEASE_PATH" \
  --candidate-release "$CANDIDATE_RELEASE_PATH" \
  --manifest "$PROTECTED_ASSEMBLY_MANIFEST"

npm run release:config:prepare -- \
  --active-release "$ACTIVE_RELEASE_PATH" \
  --candidate-release "$CANDIDATE_RELEASE_PATH" \
  --manifest "$PROTECTED_ASSEMBLY_MANIFEST" \
  --apply

npm run release:config:verify -- \
  --active-release "$ACTIVE_RELEASE_PATH" \
  --candidate-release "$CANDIDATE_RELEASE_PATH" \
  --manifest "$PROTECTED_ASSEMBLY_MANIFEST"
```

This identity gate proves release assembly only. After the pointer switch, the
separate promotion health gate remains responsible for bounded runtime and
public-edge acceptance. Neither gate authorizes deployment or automatic
rollback by itself; any application-pointer rollback requires a separate
approved decision, and any database restore remains independently approved.

### Condition-Driven Promotion Health Window

`npm run promotion:health-gate -- ...` provides a read-only acceptance window
for the Japan control-plane service. It does not switch a release, restart a
service, or perform rollback. Those mutations remain in the separately
approved Risk A Change Record.

The script is standalone and may be streamed through Node stdin by that exact
Risk A execution without installing a file on the host. This transport does
not authorize reuse of a previously rolled-back release. After this capability
is merged, a production attempt must reference a new reviewed artifact built
from the resulting `master` commit.

The gate replaces a one-shot public health request with these conditions:

1. `proxy-gateway-candidate.service` is active/running; the `current` symlink
   and the service process working directory each resolve to the same expected
   immutable candidate's **full resolved path**. A matching release-directory
   basename alone is not release identity evidence.
2. `NRestarts` remains equal to the pre-switch baseline; any change rejects the
   promotion attempt immediately.
3. Loopback `/api/health` returns 200 for three consecutive probes.
4. Only after loopback readiness, the public
   `https://portal.gccwebos.com/api/health` route returns 200 for two
   consecutive probes.
5. The default deadline is 60 seconds with a two-second interval. Reaching the
   deadline returns a non-zero exit code for the approved outer rollback path.
   Every systemd and HTTP probe timeout is capped to the remaining deadline
   budget, and a probe completing after the deadline cannot validate the
   promotion.

Example invocation inside an already approved production attempt:

```bash
npm run promotion:health-gate -- \
  --expected-release "$EXPECTED_RELEASE" \
  --expected-release-path "$EXPECTED_RELEASE_PATH" \
  --current-link "$CURRENT_RELEASE_LINK" \
  --restart-baseline "$PRE_SWITCH_NRESTARTS" \
  --local-health-url "$PROTECTED_LOOPBACK_HEALTH_URL" \
  --public-health-url https://portal.gccwebos.com/api/health
```

`EXPECTED_RELEASE_PATH` must name the candidate directory itself, not a
symlink, and must exactly equal its full resolved path (so no ancestor may be
a symlink). Its resolved basename must exactly equal `EXPECTED_RELEASE`.
`CURRENT_RELEASE_LINK` must name the `current` symlink that points to that
candidate.

The JSON result contains only release identity, elapsed time, probe counts,
HTTP status codes, redacted pointer/CWD-match booleans, and restart-count delta.
It never emits the supplied URLs, absolute release or pointer paths, response
bodies, command stderr, environment values, or raw service logs. A successful
gate is acceptance evidence only; it does not itself declare or perform
production promotion.

## Secret Boundary

GitHub may store only minimal deployment credentials:

- deploy SSH key for a restricted deploy user;
- target host/user/port identifiers;
- Cloudflare API token and account id for the static site.

GitHub must not store:

- production SQLite files;
- subscription URLs or tokens;
- account passwords or portal credentials;
- runtime private keys;
- per-order edge credentials;
- raw protected env files or material-store contents.

## Validation Before Enabling Real Deploy

Before adding host mutation to any workflow:

```bash
git diff --check origin/master...HEAD
npm test
npm run admin:test
npm run admin:build
npm run cloudflare:site:validate
npm run project-state:check
```

The production workflow must additionally prove dry-run deploy packets are
reviewable and do not print secrets.
