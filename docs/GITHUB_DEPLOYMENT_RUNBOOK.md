# GitHub Deployment Runbook

Last updated: 2026-08-23, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: github_deployment_runbook
  superseded_by: null
  last_verified_at: 2026-08-15
  production_authority: false
```


This runbook defines the repository-owned GitHub deployment foundation for
`proxy-gateway-minimal`. It is not a production approval. Production host,
Nginx, systemd, firewall, data-plane runtime, DNS, schema, or protected material
changes still require a separate Risk A gate.

## Current Baseline

- `.github/workflows/ci.yml` validates pushes and pull requests to `master`.
- `release-artifact.yml` packages the current commit as a source artifact and
  records its SHA256.
- `control-plane-dependency-artifact.yml` builds a Linux/Node 22 dependency
  layer in CI, runs the `better-sqlite3` memory-database and snapshot-import
  smoke, and publishes a lock/source/runtime-bound manifest with the archive
  and fixed GitHub Actions provenance.
- `deploy-cloudflare-site.yml` builds and verifies the public static site. It
  only deploys when the protected `cloudflare-production` environment allows
  it and either manual confirmation is provided or
  `CLOUDFLARE_SITE_AUTO_DEPLOY=true` is set as a repository or environment
  variable.
- `production-deploy-dry-run.yml` creates a production deploy packet and runs
  validation without contacting or mutating production hosts.

## Deployment Lanes

### Control-Plane Dependency Artifact (Phase A1)

This lane is the CI dependency-artifact consumer boundary. It is not a
production promotion and it does not run `npm ci` on a production host.

The workflow performs the following bounded sequence on Ubuntu 24.04 with the
exact Node `22.23.1` runtime:

1. install from the committed `package-lock.json` with `npm ci --omit=dev`;
2. load `better-sqlite3`, execute a `:memory:` query, and import the snapshot
   gate module;
3. create two independently written, normalized `node-modules.tar` archives and
   require byte-for-byte and SHA-256 equality before selecting the published
   archive;
4. extract that archive into a fresh isolated directory with fail-closed member
   type, link-target, traversal, duplicate, and size checks;
5. audit the extracted tree (not an adjacent live `node_modules`) for
   ownership/mode, special files, symlink escape, hardlinks, ACLs, and
   capabilities, then run the native smoke against that extracted tree; and
6. emit `dependency-artifact.json`, binding the archive and package metadata to
   the exact source commit, lockfile hashes, Linux architecture/libc, Node ABI,
   npm version, and native smoke result.

The workflow checks out the requested source SHA explicitly, derives the
manifest commit from `git rev-parse HEAD`, and asserts the two identities are
equal. Verify mode requires both the expected source commit and release label;
missing or mismatched identity fails closed. The consumer
(`scripts/control-plane-dependency-artifact.mjs`) recomputes all of those hashes
and runtime fields from the freshly extracted archive tree before accepting an
artifact. Missing, tampered, wrong-commit, wrong-release, wrong-lock, wrong-ABI,
non-Linux, unsafe-tree, or failed-native-smoke inputs fail closed. The old
host-side dependency builder
remains disabled until a separate Risk A deployment gate proves artifact
staging, extraction, snapshot validation, atomic switch, health window, and
rollback; this phase does not change `current`, systemd, SQLite, feature flags,
or Welcome Coins.

The reviewed source also provides a separate, default-off bounded admission
mode for this exact artifact. It is not a general archive installer and is not
equivalent to kernel quota: it is limited to the deterministic uncompressed
tar, 128 MiB / 10,000-entry payload caps, a fixed ext4 deployment root,
conservative block/inode accounting, an emergency reserve, exact tree/runtime
revalidation, same-device checks for candidate/staging/receipt paths before and
next to mutations, restricted service-native smoke, no-replace publication,
and a schema-4 receipt written only after staging cleanup. Lock-release failure
invalidates the receipt and published tree; uncertain cleanup remains
attention-required. The existing XFS project-quota mode remains an optional
stronger containment route. Neither mode is production authority merely
because its source is merged.

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
5. Use exactly the dependency method named by the approved release Gate:
   retain the legacy `npm ci` step unless a separately reviewed exact artifact,
   bounded-admission physical proof, and Risk A production approval explicitly
   replace it. Never mix the two methods in one candidate.
6. Switch current release.
7. Restart only the approved service.
8. Validate health, public boundaries, internal route rejection, no-session API
   rejection, and data-plane listener/readiness checks.
9. Stop if validation fails; require an explicit approved rollback decision and
   the relevant rollback-runbook execution. Any control or subscription DB
   restore is a separate explicit decision and must never be automatic.

### Default-Off Candidate Staging Controller

`npm run control-plane:production-stage` is a host-local, default-off staging
boundary. It never changes `current`, systemd, a database, or protected release
configuration. It accepts only a private root-owned mode-0700 input directory
containing exactly six mode-0600, single-link regular files: `artifact.json`,
the manifest-named source ZIP and its `.sha256` sidecar, plus
`dependency-artifact.json`, `node-modules.tar`, and `release-label.txt`.
The input directory must be path-disjoint from the complete fixed
`/opt/proxy-gateway-minimal-candidate` deployment tree: it may not equal, contain,
or be contained by that tree. All modes fail with `input_boundary_invalid` before
any controller-owned mutation when this boundary is violated; an independent
sibling directory remains valid.

The `preflight` mode is read-only. `stage` requires `--apply`, rechecks the
expected-current symlink CAS and all four approved SHA-256 identities, safely
extracts the bounded source ZIP without protected overlays or `node_modules`,
and publishes no-replace directories in this order: source candidate,
dependency inputs, then assembly receipts last. The assembly receipt directory
contains only the byte-identical `artifact-manifest.json` and schema-1
`artifact-stage-receipt.json`; it deliberately does not contain
`release-assembly.json`. `verify` re-reads the final trees, modes, hashes, exact
file sets, receipt, and current CAS without applying changes.
Preflight also fails closed unless fixed `/usr/bin/python3` can resolve the
Linux `renameat2` primitive required for no-replace publication.

`stage` uses an exactly-one, cooperative writer contract. After its initial
read-only current/input rechecks and before any controller-owned directory
mutation, it atomically creates the fixed root-owned mode-0600
`.production-stage-controller.lock` claim with create-exclusive/no-follow
semantics and holds the returned file descriptor through publication,
verification, cleanup, and claim release. It removes the claim only when the
path still identifies that exact zero-byte single-link inode, then fsyncs the
deployment root. Once `stage` reaches claim acquisition, an existing claim is
`stage_lock_unavailable`/attention-required; an earlier read-only boundary
failure retains its own condition. The controller does not infer whether a
claim is active or stale and never deletes, steals, or reuses it. A stale claim
requires separate read-only investigation and separately approved operator
handling.

For the approved session, the claim, all candidate-specific `.stage-*`
children below `releases`, `assembly-receipts`, and `dependency-artifacts`,
the exact final candidate child in each of those three roots, and either
optional publication root while the controller creates it are reserved to the
single staging controller. No second controller, manual command, or other
automation may write those namespaces until the claim is released. `current`
remains a read-only CAS boundary and is never controller-owned; this claim
does not authorize pointer, service, database, or protected-configuration
mutation.

This cooperative lock serializes supported controllers and prevents operator
or automation overlap. The security model trusts the kernel, mounts, and the
root/operator boundary; it does not claim to defend against a concurrent
hostile process with the same root privilege, which could remove the claim,
ptrace the controller, or mutate directories between system calls. Suspected
same-privilege compromise requires stopping the session and isolating the
host, not relying on controller cleanup.

All identity arguments below must come from the reviewed artifact and Gate;
placeholders are not executable values:

```bash
npm run control-plane:production-stage -- \
  --mode preflight \
  --input-directory "$PRIVATE_STAGE_INPUT" \
  --candidate-release "$CANDIDATE_RELEASE" \
  --expected-current-release "$EXPECTED_CURRENT_RELEASE" \
  --expected-source-commit "$EXPECTED_SOURCE_COMMIT" \
  --expected-artifact-release "$EXPECTED_ARTIFACT_RELEASE" \
  --expected-artifact-manifest-sha256 "$EXPECTED_ARTIFACT_MANIFEST_SHA256" \
  --expected-source-artifact-sha256 "$EXPECTED_SOURCE_ARTIFACT_SHA256" \
  --expected-dependency-manifest-sha256 "$EXPECTED_DEPENDENCY_MANIFEST_SHA256" \
  --expected-dependency-archive-sha256 "$EXPECTED_DEPENDENCY_ARCHIVE_SHA256"
```

Do not assume the currently deployed release already contains this script or
package command. For the first run, and for every later exact-head Gate, stage
a separately reviewed minimal controller closure in its own root-owned
mode-0700 bootstrap directory. The closure consists only of:

- `scripts/control-plane-production-stage-controller.mjs`;
- `scripts/control-plane-candidate-dependency-gate.mjs`;
- `scripts/control-plane-dependency-artifact.mjs`;
- `scripts/control-plane-release-config-gate.mjs`; and
- `server/services/platform/production-artifact-boundary.mjs`.

Every closure file must be root-owned mode-0600 and individually match the
per-file SHA-256 recorded for the approved exact source commit. The bootstrap
directory and six-file input directory must both remain outside the fixed
deployment tree and must be path-disjoint from each other. Invoke the pinned
system runtime directly as
`/usr/bin/node <bootstrap>/scripts/control-plane-production-stage-controller.mjs`;
do not invoke a controller extracted from the unverified source ZIP. After the
bounded session, remove only the Gate-owned bootstrap and input roots and read
back their absence. Bootstrap transfer, cleanup, and their hashes remain part
of the exact Risk A Gate; this runbook does not grant execution authority.

An approved staging invocation repeats the same exact arguments with
`--mode stage --apply`; the readback repeats them with `--mode verify` and no
`--apply`. A successful stage is not runtime compatibility, materialization,
promotion, deployment, or rollback authority. The separate protected-overlay
gate below must run afterward and remains responsible for `.env`,
`config/proxy-servers.json`, and `release-assembly.json`.

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
The active argument is not the resolved release directory: it must be the exact
`/opt/proxy-gateway-minimal-candidate/current` symlink. The candidate must be a
direct child of the same fixed `releases` directory. The manifest parent must
already have been published by the staging controller as root-owned mode 0700;
the overlay gate does not recursively create arbitrary production directories.

The production overlay policy is path-specific and fail-closed. The active and
candidate `config/proxy-servers.json` files must be owned by uid 0 with exact
mode 0640, while `.env` must be owned by uid 0 with exact mode 0600. Before an
approved apply, also verify that the config file group matches the service
`Group` read back from systemd so the restricted service keeps read access.
Special mode bits, a world-readable file, or a non-root owner block both
prepare and verify. A legacy active config at mode 0644 is not normalized by
the gate: changing it to root:`<service-group>` mode 0640 is a separate
explicit production mutation within the approved staging Gate, with original
metadata recorded for rollback and service-readability read back afterward.

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
  --active-release /opt/proxy-gateway-minimal-candidate/current \
  --candidate-release "/opt/proxy-gateway-minimal-candidate/releases/$CANDIDATE_RELEASE" \
  --manifest "/opt/proxy-gateway-minimal-candidate/assembly-receipts/$CANDIDATE_RELEASE/release-assembly.json"

npm run release:config:prepare -- \
  --active-release /opt/proxy-gateway-minimal-candidate/current \
  --candidate-release "/opt/proxy-gateway-minimal-candidate/releases/$CANDIDATE_RELEASE" \
  --manifest "/opt/proxy-gateway-minimal-candidate/assembly-receipts/$CANDIDATE_RELEASE/release-assembly.json" \
  --apply

npm run release:config:verify -- \
  --active-release /opt/proxy-gateway-minimal-candidate/current \
  --candidate-release "/opt/proxy-gateway-minimal-candidate/releases/$CANDIDATE_RELEASE" \
  --manifest "/opt/proxy-gateway-minimal-candidate/assembly-receipts/$CANDIDATE_RELEASE/release-assembly.json"
```

This identity gate proves release assembly only. After the pointer switch, the
separate promotion health gate remains responsible for bounded runtime and
public-edge acceptance. Neither gate authorizes deployment or automatic
rollback by itself; any application-pointer rollback requires a separate
approved decision, and any database restore remains independently approved.

### Control-Plane Database Snapshot Gate

For an approved SQLite schema or protected runtime-config change, follow the
separate [control-plane snapshot and restore contract](CONTROL_PLANE_DB_SNAPSHOT_RESTORE_CONTRACT.md).
That gate owns the exact inactive-service runtime start guard, a fresh verified
database snapshot, and the evidence required before a later restart. A source
tool must not substitute a copied database, a release-pointer rollback, or an
old snapshot for that gate.

The snapshot boundary is intentionally separate from release assembly and
feature admission. A caller must keep the exact start guard through any
approved schema operation and until the next approved start. The snapshot
contract, not an activation helper, controls service stop/start, snapshot
publication, database restore, and rollback decisions.

### Welcome Coins Admission Activation Gate

`control-plane-welcome-coins-activation-gate.mjs` is the narrowly scoped
editor for the first Welcome Coins admission canary. It is not a generic
`.env` editor and it can change only these two runtime settings:

- `USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED=true`
- `USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES=<one SHA-256 digest>`

The tool derives the protected `.env` only from the repository-defined
production `current` symlink and an expected resolved release label. It accepts
no deployment-root or current-pointer option: the resolved target must be the
direct `releases/<label>` child of that fixed root. It rejects arbitrary file
paths, unknown options, duplicate options, symbolic-link boundaries, non-root
production ownership or permissions, unsafe parent directories, pre-existing
or conflicting target keys, except an exact identity-bound retry of the same
already-active digest, and any base prerequisite or unrelated
wallet-first/deferred/setup/Authority flag that is not in its required state.
It never accepts a key, value, email, digest, or a force/disable action as a
command-line option.

Only `activate --apply` consumes one 64-character lowercase SHA-256 digest
from a non-interactive stdin-only stream. The digest, `.env` contents,
absolute paths, raw errors, PID values, and database values never appear in
the safe report. The returned environment SHA-256 is an identity binding for
the immediately following step; it is not protected configuration content.

Inside one separately approved Risk A change, use the sequence below:

1. Run `welcome-coins:activation:preflight` while the current release is
   healthy. It is read-only and returns a safe environment identity only when
   both target settings are absent, base Portal/Wallet/ordinary-Commerce
   prerequisites are true, and the four unrelated safety flags are false.
2. Establish the snapshot contract's exact runtime start guard, stop the
   approved service, create and verify a fresh control-database snapshot, then
   apply and validate the separately approved Welcome Coins schema migrations.
3. While the same guarded service remains inactive, pass the preflight
   environment identity to `welcome-coins:activation:apply`; provide the
   approved digest through stdin only. The helper writes a same-directory
   owner-preserving temporary file, fsyncs it, atomically renames it over
   `.env`, fsyncs the parent directory, and rereads the pointer, environment,
   and start-guard identity.
4. Run `welcome-coins:activation:verify` with the returned post-write identity
   before the single approved service start. A pre-publication failure leaves
   the old `.env` in place. A post-publication uncertainty is
   `attention_required`: leave the start guard in place and do not
   automatically rewrite the configuration, restore the database, or restart.
5. Only after an independent runtime and database readback may the exact
   approved start-guard cleanup occur. A separate operator-controlled new
   registration is required to prove the canary; an existing account is never
   retroactively selected.

The helper does not create a snapshot, apply schema, start or stop a service,
move a release pointer, create an account, credit Coins, or alter ordinary
Commerce, wallet-first, deferred runtime, shared nodes, Authority, setup
delivery, payment, or fulfillment.

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

### Immutable Transition Evidence Before an A5D Retry

`npm run promotion:transition-evidence -- ...` is a local, built-in-only
receipt utility for the next approved control-plane retry. It serializes only
already-observed, aggregate evidence; it never invokes `systemctl`, starts or
stops a service, changes a release pointer, reads or writes a database,
assembles protected configuration, contacts a provider, or changes a feature
flag.

This receipt is neither a deployment mechanism nor a health program. The
existing release-overlay gate still binds the protected assembly before a
switch. For A5D specifically, do **not** reuse
`npm run promotion:health-gate` as an acceptance gate: its public
`/api/health` requirement belongs to the earlier contract and is not an A5D
health boundary. An A5D retry requires a separately approved, local-root-only
health program. It must be named in that exact Risk A gate, run after the
approved candidate start, and remain outside this receipt utility; absent that
separate program, the retry stops before a pointer/service mutation. A valid
evidence chain only preserves the allowed aggregate observations and decision
outcome from that separately approved program.

Before a future A5D retry, create an empty owner-only evidence directory. Feed
each already-redacted JSON record through stdin to the `write` mode, then run
`verify` only after a terminal record:

```bash
# The input is an operator-produced, already-redacted JSON record. The utility
# rejects paths, URLs, raw PIDs, logs, configuration/database values, secrets,
# unrecognized fields, and non-canonical records.
npm run promotion:transition-evidence -- \
  --mode write \
  --directory "$TRANSITION_EVIDENCE_DIR" \
  < "$REDACTED_RECORD_FILE"

npm run promotion:transition-evidence -- \
  --mode verify \
  --directory "$TRANSITION_EVIDENCE_DIR"
```

Each record has a fixed allowlist: an opaque source-commit digest, candidate
and rollback release labels, artifact/assembly/snapshot SHA-256 bindings, a
safe transition identifier, and aggregate runtime evidence only. The aggregate
runtime evidence is limited to active/substate/result enums, the
main-PID-to-exec-PID relation enum (never a PID), a path-free `cwdBinding`
enum,
restart baseline/observed/delta, local-root HTTP counts/consecutive-success
count/statuses/timeouts and elapsed time, plus pointer/rollback booleans. It
contains no host path, URL,
process identifier, response body, service output, protected configuration, or
database value.

`cwdBinding` is deliberately only one of `candidate`, `rollback`, `mismatch`,
or `unknown`; it never includes a CWD or release path. `mismatch` means the
approved collector observed a CWD that does not bind to the expected release,
including a third-party release. It cannot stand in for `rollback`. `unknown`
means that collector cannot prove the binding.

Release/snapshot labels and the transition identifier use a restricted opaque
label grammar. In addition to rejecting paths and URLs, the utility rejects
recognizable secret or access-token markers; raw configuration/database values
cannot fit the record schema.

Records are canonical JSON with mode `0600`, published through an exclusive
temporary file, file fsync, atomic no-replace link, and parent-directory fsync.
The dedicated directory must be owner-only. The record filename is derived
from its sequence and stage; the record itself chains a stable
`transitionId`, contiguous `sequence`, and the previous record's SHA-256.
Changing an earlier record, changing the immutable release bindings, skipping
a sequence, adding an extra record, or taking an invalid stage transition makes
verification fail closed. The chain is continuity evidence inside the
owner-only record set; it is not a signature, approval, deployment credential,
or a substitute for the separately retained artifact and snapshot evidence.

On POSIX, the utility also refuses an evidence directory that is itself
group/world accessible, a symlink, or owned by another account. Each ancestor
must be a real directory owned by the operator or root and must not be
group/world writable, except for a sticky directory such as the standard
root-owned `/tmp`. This keeps a normal owner-only evidence subdirectory below
`/tmp` usable while rejecting a non-sticky shared parent.

The only legal lifecycle is:

```text
pre_switch
  -> candidate_started
  -> candidate_health_terminal
  -> validated_terminal | rollback_terminal
```

Record `pre_switch` only after the separate snapshot and protected-assembly
gates have passed, immediately adjacent to the approved stop/switch. It must
show the rollback release as active/running/success with a matching
main-to-exec PID relation, `cwdBinding: rollback`, and a three-or-more,
all-200, no-timeout local-root success window at that same observation point.
Its `restartObserved` must equal `restartBaseline` and its delta must be zero.
After recording `pre_switch`, perform no unapproved action before the approved
stop/switch; if that boundary is broken, discard the record and collect a new
pre-switch window. That first baseline is immutable across the whole chain:
every later record must carry the same `restartBaseline`, so a later record
cannot reset it to hide a candidate restart. Record `candidate_started` after
the approved pointer/service action; it may retain only `candidate`,
`mismatch`, or `unknown` while a startup failure is being observed. Record
`candidate_health_terminal` from the separately approved A5D local-root health
program, retaining only its allowed aggregate local-root facts. A `healthy`
candidate-health record and every `validated_terminal` record require
`cwdBinding: candidate` and `restartDelta: 0` against that fixed pre-switch
baseline. A failed candidate-health record may retain `mismatch` only with
`cwd_binding_failed`, or `unknown` only with `observation_unavailable`; neither
exception can validate the candidate.

Candidate-health terminal conditions are derived, not chosen freely. The
utility uses this fixed priority: `observation_unavailable`,
`runtime_inactive`, `runtime_substate_unexpected`,
`service_result_unexpected`, `main_exec_pid_relation_unexpected`,
`cwd_binding_failed`, `restart_count_changed`,
`local_root_probe_timeout`, `local_root_probe_failed`, then `healthy`.
`observation_unavailable` is permitted only when an essential service/CWD/PID
relation is explicitly `unknown` or the PID relation is `missing`, or when the
local-root program produced zero attempts. It cannot relabel a known failed
observation or an all-healthy observation. A `healthy` or `validated` record
requires at least three local-root attempts with all attempts counted as exact
200 successes, the same full-length consecutive-success count, first/final
status 200, and no timeout; an early or middle failure cannot be represented as
a healthy window. Write `validated_terminal` only after that local-root program
accepts the candidate.

Otherwise write `rollback_terminal` only after the independently approved
pointer rollback and post-service readback. A rollback terminal must show the
restored service as active/running/success with a matching main-to-exec PID
relation, `cwdBinding: rollback`, and the same three-or-more all-200,
no-timeout local-root success window. A `candidate`, `mismatch`, or `unknown`
CWD binding cannot claim rollback recovery. Its restart baseline/observed/delta
is a post-rollback observation relative to that same immutable pre-switch
baseline: zero or a positive delta is accepted, but it is not a claim that no
restart occurred; negative delta is rejected. The evidence utility performs
none of those actions and does not authorize a retry, rollback, schema action,
or feature activation.

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
