# A3-1 Materializer Physical Execution Spec

> Status:
> - Type: Active implementation spec (source implementation in progress; physical execution pending)
> - Risk: A (physical validation and any future production use require separate approval; the current implementation PR is production-inert)
> - Execution authority: Source/test changes only. This spec authorizes no production mutation, no node access, no provider interaction, and no probe execution until the implementation exact head/artifact is bound by the Issue #636 pre-execution approval.
> - Production impact: None. The implementation keeps every production `worker_storage_limit_unavailable` guard in place; a later guard-lift PR remains separate.
> - Source of truth for: the seven physical execution paths that issue #636 Gate A3-1 requires before the production `worker_storage_limit_unavailable` guard may be reconsidered.
> - Bound identities: see §0.5.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: a3_1_materializer_physical_execution_spec
  superseded_by: null
  last_verified_at: 2026-08-21
  production_authority: false
```

> Supersedes: nothing.
> Refs: PR #646 (A3-0 contract skeleton); PR #648 (this spec, merged `b0cbbabc`); issue #636 (Gate A3-0 closed, Gate A3-1 implementation in progress).

## 0.5 Source-of-truth binding (exact identities)

The following exact identities are the immutable A3-0 evidence baseline used
to author this spec. Merging this docs-only spec will advance `master`; that
does not rewrite this historical baseline. The A3-1 implementation PR must
separately bind the then-current `master` SHA and a newly issued dependency
artifact. It must never reuse the artifact below as execution input after
`master` advances.

The current implementation branch is based on the exact spec merge and its
fresh dependency artifact. These values bind source development only; they do
not authorize provider access or physical execution.

| Implementation base field | Value |
|---|---|
| `implementation_base_master_sha` | `b0cbbabcc79096be7ac112c36153ac2c3d2c6e76` |
| `spec_pr` | `648` (merged) |
| `spec_pr_merged_at` | `2026-08-21T11:14:45Z` |
| `implementation_base_dependency_workflow_run_id` | `32476323908` |
| `implementation_base_dependency_artifact_id` | `9444414232` |
| `implementation_base_dependency_artifact_name` | `control-plane-dependency-b0cbbabcc79096be7ac112c36153ac2c3d2c6e76` |
| `implementation_base_dependency_artifact_digest` | `sha256:bfd92b66a688ca242fad61fa8a8dbc3701cb43fc94eb4c20b1784755a2785ebb` |
| `implementation_base_dependency_artifact_size_bytes` | `6460704` |

| Field | Value |
|---|---|
| `baseline_master_sha` | `10b98227e8c7aca667422bb5edad875cac2e7984` |
| `parent_pr` (PR #646, A3-0 contract skeleton) | merged |
| `parent_pr_head_sha` (PR #646 head before merge) | `ee430358c61fa7ff42aebf334600dd93843dde0a` |
| `parent_pr_merge_commit_sha` | `10b98227e8c7aca667422bb5edad875cac2e7984` |
| `parent_pr_merged_at` | `2026-08-21T10:00:58Z` |
| `parent_pr_merged_by` | `gccltd.co` (non-bot) |
| `dependency_workflow_run_id` | `32470644054` |
| `dependency_workflow_conclusion` | `success` |
| `dependency_artifact_id` | `9442381223` |
| `dependency_artifact_name` | `control-plane-dependency-10b98227e8c7aca667422bb5edad875cac2e7984` |
| `dependency_artifact_digest` | `sha256:b6c7394a2f25dcbb65f15e69331af90743411f4097702afcbcfa1aff0aecfe7b` |
| `dependency_artifact_size_bytes` | `6460706` |
| `release_artifact_portal_static_digest` | `sha256:e42e67cd4f7f7ac0ef41fb8913776bbaeefa7c75db62531372a7ed32d34562c7` |
| `release_artifact_admin_static_digest` | `sha256:c40c0473737f1863e507afcbc4b68b512f754949b6cee616eefca510c6858ae4` |
| `release_artifact_proxy_gateway_digest` | `sha256:293acd9e79aa30509a7b40e628336a49bcb668aee645ea7730f48be4538b100d` |
| `issue_refs` | `636` (Gate A3-0 closed by PR #646; Gate A3-1 next) |

| Identity pairing (candidate, recorded; **not** approved) | Status |
|---|---|
| `identity_verifier` | `gccltdco-cmd` |
| `approver_candidate` | `gccltd` |
| `relationship` | `same_org_distinct_accounts` |
| `relationship_evidence` | `user_attestation` (2026-08-21) |
| `pairing_status` | `candidate_valid` |
| `formal_approval.status` | `pending` |
| `formal_approval.required_record` | Issue #636 §7 comment by `gccltd` |
| `risk_a_independent_approval.status` | `not_yet_satisfied` |

```yaml
identity_pairing_candidate:
  identity_verifier: gccltdco-cmd
  approver_candidate: gccltd
  relationship: same_org_distinct_accounts
  relationship_evidence: user_attestation
  pairing_status: candidate_valid
formal_approval:
  status: pending
  required_record: Issue #636 §7 comment by gccltd
risk_a_independent_approval:
  status: not_yet_satisfied
disposable_target_provider:
  status: selected_pending_fresh_inventory_and_exact_execution_approval
  provider: aliyun_swas
  region: us-west-1
  instance_id: 3e9253d3fb044463b876edacf6af8784
  target_role: existing_non_production_validation_host
  disposable_boundary: per_run_loopback_xfs_sandbox
  required_record: Issue #636 pre-execution approval must bind the final implementation source/artifact and this exact target; A3-1 implementation PR body must repeat it
```

> **Recorded, not approved.** The pairing above is a candidate identity record
> only. It does **not** constitute formal approval. Risk A's independent-approval
> gate is satisfied only when `gccltd` posts the §7 comment on Issue #636 AND
> the final implementation source/artifact and selected provider/target are named in the Issue #636
> pre-execution approval and repeated in the A3-1 implementation PR body.
> Until both conditions hold: no provider interaction, no node access, no probe
> execution, no production guard lift.

> Supersedes: nothing.
> Refs: PR #646 (A3-0 contract skeleton); PR #648 (spec merge); issue #636 (A3-1 implementation source phase; execution approval pending).

## 0. Why this spec exists

PR #646 closed the **contract skeleton**: it pinned the exact evidence shapes for
`parseStorageQuotaEvidence` and `parseServiceSmokeReadback`, locked the test
injection boundary (`createCandidateDependencyGateTestRuntime`), and proved the
production `worker_storage_limit_unavailable` guard still fires under
`requireRoot: true` even with `allowTestWorkerStorage: true`. The PR is now
merged on `master` at `10b98227`. The contract is frozen; this spec does **not**
re-open contract shape decisions.

PR #646 is contract-skeleton code and tests only. It did not execute XFS
project-quota probes, did not spawn a service-principal sandbox unit, did not
read cgroups, did not bind any project-ID to a release artifact, and did not
lift the production guard.

Gate A3-1 (issue #636) requires the actual physical execution paths that produce
readback evidence matching those contracts. Until those paths run on a real
disposable Linux target and the readback evidence matches, the production guard
must remain in place.

This spec defines those seven physical paths, the test environment that can
host them, the read-only inventory that must precede them, the dry-run
checklist, the operator approval template, the rollback plan, and the PR
splitting strategy.

## 1. Scope (what A3-1 delivers, in seven items)

| # | Item | Contract reference | Touches production? |
|---|---|---|---|
| 1 | Trusted XFS project-quota physical probe | `parseStorageQuotaEvidence` | No (probe runs in a disposable sandbox on the approved non-production validation host) |
| 2 | Real XFS project-quota overload probe (exhaustion → ENOSPC, quota readback → hard limits) | `parseStorageQuotaEvidence.probe` | No |
| 3 | systemd-restricted native-smoke worker (validated service UID/GID transient unit) | `parseServiceSmokeReadback` | No |
| 4 | Precise terminal / cgroup-empty readback | `parseServiceSmokeReadback.terminalActiveState / terminalSubState / cgroupEmpty` | No |
| 5 | Wire physical evidence into `materialize` main flow | `materializeCandidateDependencies` boundary | Yes (gates production path) |
| 6 | Pre/post release binding: project-ID + quota + receipt | `preflightCandidateDependencies` / `verifyCandidateDependencies` | Yes |
| 7 | Re-evaluate `worker_storage_limit_unavailable` lift **only** after 1-6 met | All | Yes (guard lifted only by separate PR after items 1-6 verified) |

Item 7 is not implementation; it is a decision gate that authorises a future
follow-up PR to consider relaxing the guard. A3-1 itself keeps the guard.

## 2. Out of scope (explicit non-goals for the A3-1 implementation PR)

- Lifting `worker_storage_limit_unavailable` in the A3-1 implementation PR. The guard stays.
- Production candidate deployment. Production impact is `none` for the A3-1 implementation PR.
- Replacing the contract skeleton landed by PR #646. The contract is frozen.
- Touching any sibling / historical worktree under `C:/Users/g/copilot-worktrees/proxy-gateway-minimal-worktrees/` or `D:/Projects/proxy-gateway-minimal`. A3-1 lands in a fresh worktree branched from a clean baseline.
- Opening admin UI or ports `3456`/`18180`/`1080` to the public internet.
- Authorising A3-2, production deploys, or feature flag flips in the A3-1 PR.
- Self-approval by Agent / Bot / spec authors. Operator role is reserved for a
  resolvable production owner.

## 3. PR strategy

- **One** new Draft PR for items 1-6 (the seven items 1-6 are inseparable: the gate flow only makes sense if all evidence can be produced end-to-end).
- **Zero** code change in the A3-1 implementation PR that lifts the guard. Item 7 lives in a separate future PR and only opens if items 1-6 pass end-to-end in a clean disposable sandbox on the approved non-production Linux target with operator approval.
- Branch base: the exact `master` produced after this spec PR merges. Record
  that SHA and its newly issued dependency artifact in the A3-1 implementation
  PR body and Issue #636 approval. The §0.5 identities remain immutable A3-0
  authoring evidence, not reusable A3-1 execution input.
- Branch name: `codex/a3-materializer-physical-execution` (matches the repo's `codex/<topic>` convention).
- Worktree: a fresh worktree, never reused from sibling worktrees.

## 4. Test environment (approved non-production Linux host, disposable sandbox)

A3-1's physical probes must run inside a newly created, per-run disposable
sandbox on the exact approved non-production Linux validation host. The
selected host is Aliyun SWAS in `us-west-1`, instance
`3e9253d3fb044463b876edacf6af8784`. This selection is not execution approval:
fresh read-only inventory must first prove the host remains non-production and
contains no active candidate/current control-plane service, production data,
or unrelated persistent test material. None of this may be done on a developer
laptop, on production, on the CI runner, or on a stopped production node.

### 4.1 Required kernel/filesystem features

- Linux kernel ≥ 5.10 with `CONFIG_XFS_QUOTA=y` and `CONFIG_XFS_PQUOTA=y`.
- A newly created bounded loopback XFS filesystem mounted with `pquota` or
  `prjquota` (project quota enabled). The SWAS system filesystem must not be
  reformatted, remounted with quota options, or assigned a project ID.
  Verify the filesystem type and mount option through the exact `/proc/self/mountinfo`
  record (or `findmnt -no FSTYPE,OPTIONS -T <probe-root>`) and independently
  require `xfs_quota -x -c state <probe-root>` to report project accounting
  and enforcement enabled. `<probe-root>` is fixed from the approved run label
  as `/var/lib/control-plane-a3-1/<run-label>/probe`; `xfs_info` alone is not a
  mount-option proof.
- The loopback image size is fixed at `536870912` bytes (512 MiB). Create it
  with block allocation (`fallocate`), never `truncate` or a sparse-copy path,
  and require `st_blocks * 512 >= image_size_bytes`. Before image creation,
  `free_bytes_before` must be at least `image_size_bytes +
  minimum_reserve_bytes`, where `minimum_reserve_bytes` is fixed at
  `2147483648` bytes (2 GiB). If any value is missing, smaller, or changes
  before `losetup`, stop before loop-device allocation or formatting.
- `xfs_quota` (xfsprogs) ≥ 5.x.
- systemd ≥ 250 with transient service units, fixed numeric `User=`/`Group=`,
  `systemd-run --unit`, and exact terminal/cgroup readback available. The worker
  must use the already validated candidate service UID/GID; `DynamicUser=` is
  forbidden because it would create a different runtime identity.
- `cgroups v2` unified hierarchy mounted at `/sys/fs/cgroup`.
- `setpriv`, `runuser`, `capsh` available.
- A non-root operator account with passwordless `sudo` for `xfs_quota`, `systemctl`, `setpriv`.

### 4.2 Disposable target lifecycle

| Step | Command (illustrative) | Verification |
|---|---|---|
| Bind target | exact Aliyun SWAS region and instance ID from the approved Issue #636 record | fresh read-only provider and host inventory uniquely matches and proves non-production role |
| Create sandbox | allocate exactly `536870912` bytes with `fallocate` under a root-owned `0700` per-run directory; never use an existing/sparse image or mount | image absent before creation; `free_bytes_before >= 2684354560`; allocated blocks cover the full image; re-read reserve before `losetup` |
| Mount XFS sandbox | format only the new loopback image and mount it at the fixed per-run probe root with `pquota` or `prjquota` | exact mountinfo/findmnt record shows XFS + project-quota option and the loop device belongs to this run |
| Verify project quota tool | `xfs_quota -x -c state <probe-root>` | shows project accounting and enforcement enabled |
| Bind worker input | systemd manager bind-mounts the root-owned source into the unit namespace with exact `BindReadOnlyPaths=<source>:<fixed-target>`; worker argv references only `<fixed-target>` | worker cannot traverse the host `0700` run parent and sees the target read-only in its namespace |
| Verify fixed-principal transient service | Run `/bin/true` in a transient unit with the validated non-root numeric `User=`/`Group=` and the §6.3 sandbox properties | exit 0, exact terminal result, then empty cgroup readback |
| Verify cgroup v2 | `stat -c %T -f /sys/fs/cgroup` | `cgroup2fs` |
| **Destroy sandbox and access** | stop the exact transient units, prove their cgroups empty, unmount the exact run mount, detach the exact loop device, remove only the inode-bound run directory/image, revoke the exact temporary SSH access, restore newly installed packages, and remove exact run-created caches/local key material | unit/mount/loop/run-directory/key occurrences and run-created package/cache deltas all read back absent; host remains running and unchanged outside the approved run boundary |

The sandbox is single-use. The SWAS host may be reused only as the named
non-production validation host after a fresh approval and a fresh empty-state
readback; no sandbox, mount, project ID, unit, package cache, key, or artifact
from an earlier run may be reused. Aggregate-safe readback evidence captured
during the run is the only persistent artifact.

### 4.3 Forbidden states (must never run on)

- Any production host (Vultr Japan, SGP control plane, AWS production).
- Any staging host that holds persistent candidate artifacts.
- The selected SWAS if fresh inventory finds `/opt/proxy-gateway-minimal*`, a
  control-plane service/candidate unit, production/customer data, unrelated
  mounts under the probe root, or any unresolved previous-run material.
- The SWAS system disk or an existing block device as the XFS formatting or
  project-quota target.
- The CI runner (it lacks XFS project-quota).
- Any worktree directory under `D:/Projects/...` or `C:/Users/g/copilot-worktrees/...` (Windows; no XFS).

## 5. Read-only inventory (must precede any probe)

Before running any probe, capture the following on the selected SWAS and the
new disposable sandbox. Do
not capture on production. Store only redacted, aggregate-safe fields and
SHA-256 identities in the A3-1 implementation PR. Raw command output remains
ephemeral inside the disposable sandbox and must not be pasted into GitHub.

- XFS filesystem UUID hash, mount ID, mount option presence (`pquota` or
  `prjquota`), and `xfs_quota state` enabled booleans.
- Kernel major/minor, distribution identifier, systemd version, cgroup v2
  boolean, and required-tool presence booleans.
- Operator effective UID class (`root`/`non_root`) and only the capability
  booleans required by this gate; no full capability dump.
- `image_size_bytes`, `free_bytes_before`, `minimum_reserve_bytes`, allocated
  image bytes, and `free_bytes_after_cleanup`; the receipt rejects any value
  outside the fixed §4.1 bounds.
- Aggregate-only access lifecycle: temporary provider credential logical ID
  and expiry state, exact temporary SSH key occurrence count before/after,
  local key/known-hosts presence booleans before/after, and provider key
  detach/delete readback. Never publish key bytes or host-key material.
- Exact package names absent before the run but installed for it, plus
  post-cleanup absence. Do not use `autoremove` or broad cache cleanup; remove
  only packages and cache files whose pre-run absence and run-created identity
  were recorded.
- SHA-256 of the complete local inventory receipt plus its byte size. Do not
  publish hostnames, IPs, unit inventory, filesystem paths outside the fixed
  probe root, environment values, credentials, or package-mirror tokens.

No state on production nodes may be read. This gate does not change the SWAS
provider firewall, host firewall, security group, DNS, or public listeners. If
required packages cannot be obtained through the host's already-existing
outbound package-mirror path, stop rather than broadening network access.

## 6. Dry-run checklist (per item)

Each item below has a dry-run phase that creates no sandbox and produces no
physical quota/smoke evidence (probes do not fire, sandbox does not spawn,
materialize does not call anything new) and a real-run physical preflight plus
execution phase that produces the readback. Dry-run must pass before real-run.

### 6.1 Item 1 — Trusted XFS project-quota physical probe (dry-run)

- Confirm the host kernel/tool capability plan, fixed image/reserve constants,
  intended `<probe-root>`, and exact read-only inventory commands without
  creating the run directory, image, loop device, filesystem, or mount.
- Plan the real-run physical preflight that, only after the approved sandbox is
  mounted, requires project accounting/enforcement on the exact `<probe-root>`.
- Set up the project tree with `project -s`, then require `project -c` to return
  its two canonical summary lines on stdout and no stderr diagnostics. A zero
  exit status alone does not prove project ID and inheritance consistency.
- Pick a candidate `projectId` (e.g. `4242`).
- Plan a write that would exceed quota. Do not execute.
- Confirm probe code path will collect: `filesystem`, `projectId`,
  `byteHardLimit`, `byteCurrent`, `inodeHardLimit`, `inodeCurrent`,
  `headroomBytes`, `headroomInodes`.
- Pre-print the expected JSON shape using the contract's `quotaEvidence()`
  fixture from `server/tests/control-plane-materializer-a3-safety.test.mjs`.

### 6.2 Item 2 — Real XFS project-quota overload probe (dry-run)

- Plan a sequence:
  1. Set a deliberately small project quota (default `1MiB` bytes / `64`
     inodes) on the disposable probe project.
  2. Allocate only enough bounded test data/inodes to approach that limit.
  3. Attempt a final write that crosses the limit.
  4. Capture `errno = ENOSPC` for both inode and byte exhaustion, then read the
     live XFS project report while the probe files still exist and require both
     current values to equal their hard limits (`headroomBytes = 0`,
     `headroomInodes = 0`). `ENOSPC` without that quota readback is only a
     possible filesystem-full condition and must fail closed.
- Do not execute until items 6.1 dry-run passes.

### 6.3 Item 3 — fixed service-principal transient unit (dry-run)

- Draft the exact transient-unit invocation (`a3-smoke.service`) with the
  validated candidate service numeric `User=` and `Group=`,
  `DynamicUser=no`, `ProtectSystem=strict`, `ProtectHome=yes`,
  `PrivateDevices=yes`, `NoNewPrivileges=yes`,
  `CapabilityBoundingSet=`, `RestrictAddressFamilies=AF_UNIX`,
  `RestrictNamespaces=yes`, `SystemCallFilter=@system-service`.
- Plan exact `BindReadOnlyPaths=<root-owned-source>:<fixed-target>` creation by
  the root systemd manager. The source remains below the host `0700` run
  directory; the worker never receives or traverses that host path and its
  fixed argv reads only `<fixed-target>` inside the unit namespace. No ACL is
  added to the host run tree.
- Plan `systemd-run --unit=a3-smoke --wait --service-type=oneshot` with the
  fixed verified Node binary and fixed smoke entrypoint; no shell and no
  caller-controlled argv/environment.
- Do not start until 6.1/6.2 dry-run pass.

### 6.4 Item 4 — terminal / cgroup-empty readback (dry-run)

- Plan what the probe code reads, in this exact order:
  `serviceUid`, `serviceGid` from `getuid()`/`getgid()` inside the unit;
  after the unit exits, exact `ActiveState=inactive`, `SubState=dead`,
  `Result=success`, `ExecMainStatus=0`, and exact `ControlGroup` from
  `systemctl show a3-smoke.service`; then `cgroup.events populated=0` and an
  empty `cgroup.procs` from that exact cgroup path. A missing, malformed, or
  unreadable terminal/cgroup field is an attention-required failure and must
  never be treated as empty.
- Do not execute until 6.3 dry-run passes.

### 6.5 Item 5 — wire physical evidence into `materialize` main flow (dry-run)

- Plan the integration: `materializeCandidateDependencies` already throws
  `worker_storage_limit_unavailable` under `requireRoot: true`. The
  integration adds a new branch when `requireRoot: false` and
  `allowPhysicalMaterializer: true` is set (new env / option, default off).
- New branch must:
  1. Run items 1-2 evidence collection.
  2. Run item 3 sandbox + item 4 readback.
  3. Pass results through `parseStorageQuotaEvidence` and `parseServiceSmokeReadback`.
  4. Persist the parsed results into the candidate receipt.
- The branch must be unreachable in production (`allowPhysicalMaterializer`
  defaults to `false` everywhere outside the approved disposable sandbox).
- No code written until items 1-4 dry-run pass.

### 6.6 Item 6 — pre/post release binding (dry-run)

- Plan receipt schema additions (under the **version bump** policy, see §3 and §6.7):
  `materializerSchemaVersion`, `materializerProjectId`,
  `materializerQuotaEvidenceHash`, `materializerSmokeReadbackHash`,
  `materializerReadbackCapturedAt`.
- The hash is `sha256(canonicalJson(readback))` where `canonicalJson` is the
  repository's existing canonicaliser (do not invent a new one).
- Plan a CLI subcommand `gccgw candidate bind-materializer-readback
  --release <id>` that validates receipt hashes against the bound
  artifact.
- No code written until item 5 dry-run passes.

### 6.7 Receipt schema policy (version bump, not additive-only)

Quotas, project IDs, XFS project-quota exhaustion probes, and sandbox terminal/cgroup evidence
carry mandatory new safety semantics. An additive-only schema change would
let older receipts appear compatible and risk silent acceptance of unsafe
receipts. The A3-1 implementation PR **must** bump the receipt schema
version (e.g. `materializerSchemaVersion: 2`) and the receipt loader
**must** fail-closed for any receipt that:

- does not carry `materializerSchemaVersion: 2`;
- carries `materializerSchemaVersion: <2` but lacks any of
  `materializerProjectId`, `materializerQuotaEvidenceHash`,
  `materializerSmokeReadbackHash`, `materializerReadbackCapturedAt`;
- carries `materializerSchemaVersion: 2` whose hashes do not match a
  freshly recomputed `sha256(canonicalJson(readback))`.

The fail-closed rule applies **before** `materialize` reaches the
`requireRoot: true` branch and is independent of the
`worker_storage_limit_unavailable` guard.

## 7. Operator approval template

There are two distinct approval records. First, before any provider credential
use, node access, package installation, filesystem/quota mutation, transient
unit, or probe, `gccltd` must post the exact, unexpired §7 authorization comment
on Issue #636. It must bind the disposable provider/target, source commit,
allowed actions, forbidden actions, cleanup, and expiry. Without this record,
items 1-4 may not run.

Second, after items 1-4 evidence is captured and before item 5/6 code is merged,
the evidence/merge approval packet goes in
`docs/production-replacement-records/<YYYY-MM-DD>-a3-1-materializer-physical-approval-packet.md`
following the project's existing template (see
`docs/production-replacement-records/2026-06-11-edge-agent-scoped-receipt-render-gate-approval-packet.md`).

Required packet fields:

- `target`: exact Aliyun SWAS region + instance ID (no public IP)
- `sandbox_identity`: per-run non-secret run label + loopback image/mount identity hash
- `sandbox_cleanup_by`: ≤ 24h after approval
- `image_size_bytes`: exactly `536870912`
- `minimum_reserve_bytes`: at least `2147483648`
- `free_bytes_before`, `allocated_image_bytes`, and `free_bytes_after_cleanup`
- `target_os`: kernel + distro
- `inventory_receipt_sha256` and `inventory_receipt_size_bytes` from §5
- `quota_evidence_capture_sha256`: hash of captured evidence JSON
- `smoke_readback_capture_sha256`: hash of captured readback JSON
- `contract_match`: bool from `parseStorageQuotaEvidence(raw)` and
  `parseServiceSmokeReadback(raw)` both succeeding on the captured JSON
- `worker_storage_limit_unavailable_status_after_run`: PRESERVED
- `temporary_access_cleanup`: provider credential expiry/clear status, exact
  temporary SSH key detached/deleted, remote authorized-key occurrence `0`,
  and local key/known-hosts presence `false`
- `package_restore`: exact run-installed package/cache delta restored to the
  pre-run state; no `autoremove` or unrelated cache deletion
- `approver`: name + role + GitHub login (must be a resolvable production
  owner; Agent / Bot / spec authors are not eligible)
- `approver_github_login_verified_by`: name of the user confirming the
  approver's GitHub identity (must be different from the approver)
- `rollback_owner`: same approver
- `rollback_window_hours`: ≤ 24

No approval packet ⇒ no code merge ⇒ no production change.

## 8. Rollback plan

A3-1 items 5-6 land behind two flag gates (`allowPhysicalMaterializer: false`
by default everywhere; the new CLI subcommand ships disabled until operator
approval). If any post-merge signal indicates regression:

1. Disable `allowPhysicalMaterializer` in the candidate runtime config
   (single env flip; takes effect on next materialise attempt).
2. The production path reverts to the existing `requireRoot: true` →
   `worker_storage_limit_unavailable` fail-closed branch.
3. Disable the new CLI subcommand.
4. Re-run targeted tests
   (`node --test server/tests/control-plane-materializer-a3-safety.test.mjs`,
   `node --test server/tests/control-plane-candidate-dependency-gate.test.mjs`)
   to confirm no regression in the contract layer.
5. Open a follow-up issue with the captured evidence and the rollback log.

If the disposable sandbox still exists, stop only the exact transient units,
prove their cgroups empty, unmount the exact run mount, detach the exact loop
device, and remove only the inode-bound run directory/image. Then remove the
exact temporary authorized-key line through the approved out-of-band path,
read back occurrence `0`, detach/delete the exact provider key pair, clear the
process-only provider credential and local key/known-hosts material, and restore
only the exact packages/cache files whose pre-run absence was recorded. Any
cleanup/readback failure is attention-required. Do not power off, reboot,
reset, reformat, or repurpose the SWAS host. Do not copy sandbox state elsewhere.

## 9. PR body checklist (must appear in the A3-1 implementation Draft PR)

```
Risk: A
Process: spec (this PR / docs) -> dry-run -> read-only inventory -> operator approval -> implementation -> disposable-target validation -> promotion decision
Validation: dry-run per §6, real-run readback matching contract shapes per §1, no production deploy in this PR
Production impact: NONE (guard preserved, new branch gated off by default, receipt schema fail-closed for older receipts)
Validation commands:
  - git diff --check origin/master...HEAD
  - npm test
  - node --test server/tests/control-plane-materializer-a3-safety.test.mjs
  - node --test server/tests/control-plane-candidate-dependency-gate.test.mjs
  - npm run docs:authority:strict
Identity impact: true (binds runtime project-ID + quota + receipt; identity_gate before/after required if production is ever touched; for A3-1 the SWAS host and disposable sandbox are NOT production so the identity_gate is local to the sandbox)
Receipt schema impact: version bump; old schemas fail-closed
```

## 10. Hard constraints (from the project's risk model)

- Production `worker_storage_limit_unavailable` guard is **never** lifted by A3-1.
- No historical stopped node is treated as staging.
- No production `.env`, token, SQLite, or `SS_PASSWORD` is copied anywhere.
- No Admin UI is opened to the public network.
- Ports `3456`/`18180`/`1080` are not opened to the public network.
- The per-run loopback-XFS sandbox is single-use and destroyed after capture;
  the named SWAS host is not reset, reformatted, stopped, or treated as a
  disposable instance.
- A3-1 implementation PR does not authorise A3-2, production deploy, or
  feature flag flips.

## 11. Definition of done (A3-1 implementation PR is mergeable when)

- [ ] All six items 1-6 in §1 have a "done" checkbox ticked in the PR body.
- [ ] All six dry-runs in §6 have been executed and recorded in the PR.
- [ ] Read-only inventory from §5 is pasted into the PR.
- [ ] Real-run evidence for items 1-4 is captured, hashed, and matches the
      `parseStorageQuotaEvidence` / `parseServiceSmokeReadback` contracts
      bit-for-bit.
- [ ] Operator approval packet from §7 is filed under
      `docs/production-replacement-records/`, with named approver (a
      resolvable production owner) AND a separate identity-verifier.
- [ ] Rollback/cleanup plan from §8 has been rehearsed in the disposable sandbox.
- [ ] `git diff --check origin/master...HEAD` is clean.
- [ ] `npm test` is green.
- [ ] `npm run docs:authority:strict` is green.
- [ ] `worker_storage_limit_unavailable` guard is **still present** in all 11
      sites that PR #646 preserved.
- [ ] Receipt schema bumped per §6.7; old schemas fail-closed.

## 12. Definition of NOT done (do not mark A3-1 complete until §11 is fully met)

- "Contract skeleton only" (this is A3-0, already merged in PR #646).
- "Code written, tests skipped because environment not ready" — this fails
  §11.
- "Operator approval verbal only, no packet filed" — this fails §11.
- "Sandbox image, mount, project ID, unit, key, cache, or artifact reused across
  runs" — this fails §4.2 / §10.
- "Additive-only receipt schema change" — this fails §6.7.

## 13. Open questions to resolve before implementation

Each question has a default documented below; the user only needs to respond
to override.

1. **Base ref**: branch A3-1 implementation from the exact `master` produced
   after this spec PR merges. Record that SHA and its newly issued dependency
   artifact in the implementation PR and Issue #636 approval. **DECIDED**:
   merge #646 and this spec first, then branch from the latest master; the
   historical §0.5 artifact is not reused.
2. **Disposable target provider**: **DECIDED by operator on 2026-08-21**:
   use the exact existing Aliyun SWAS non-production validation host in
   `us-west-1`, instance `3e9253d3fb044463b876edacf6af8784`, but make only
   the per-run loopback-XFS sandbox disposable. The SWAS system disk and any
   existing block device must not be reformatted, remounted with quota options,
   or assigned a project ID. Fresh read-only inventory must prove the host is
   still non-production and free of previous-run state; otherwise stop. The
   implementation PR body and Issue #636 approval must repeat this exact target
   and bind the final implementation source/artifact before any provider or
   node access.
3. **Receipt schema migration**: version bump with fail-closed for old
   schemas. **DECIDED**: version bump.
4. **Operator role**: a resolvable production-owner GitHub identity. The
   current candidate is `gccltd` (the user that merged PR #646). The user
   must separately confirm that the same `gccltd` is the named approver in
   the §7 packet; an independent identity-verifier must also be named.
   `pending_operator_confirmation: true` remains in the metadata header
   until the user confirms and the verification pair is recorded in the
   §7 packet. Agent / Bot / spec authors are not eligible.

   **Candidate identity pair (recorded, not approved):**

   ```yaml
   identity_pairing_candidate:
     identity_verifier: gccltdco-cmd
     approver_candidate: gccltd
     relationship: same_org_distinct_accounts
     relationship_evidence: user_attestation
     pairing_status: candidate_valid
   formal_approval:
     status: pending
     required_record: Issue #636 §7 comment by gccltd
   risk_a_independent_approval:
     status: not_yet_satisfied
   ```

   The pairing is **candidate_valid** — two distinct GitHub identities under
   the same organization, with verifier attested by user as independent of
   the approver. Risk A's independent-approval requirement is **not yet
   satisfied** because `gccltd` has not yet recorded a §7 comment that binds
   the final A3-1 implementation source/artifact to the selected SWAS target.

---

End of A3-1 spec.
