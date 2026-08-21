# A3-1 Materializer Physical Execution Spec

> Status:
> - Type: Active planning spec (pre-implementation)
> - Risk: A (production-affecting in a future PR; **this PR is spec-only**)
> - Execution authority: None. This spec authorizes no production mutation, no node access, no provider interaction, no probe execution, no A3-1 implementation start.
> - Production impact: None unless a separate A3-1 implementation PR is opened, reviewed, merged, and an approved Risk A gate executes the corresponding physical runbook.
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
> Refs: PR #646 (A3-0 contract skeleton, merged `10b98227` on `master`); issue #636 (Gate A3-0 closed, Gate A3-1 next).

## 0.5 Source-of-truth binding (exact identities)

The following exact identities are bound to this spec. They are valid **only
while `master` HEAD remains `10b98227e8c7aca667422bb5edad875cac2e7984`**.
If `master` advances, this spec must be rebased, the bound identities below
refreshed, and the dependency artifact re-issued; the old artifact identity
must not be reused.

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

| Pending confirmation | Status |
|---|---|
| Disposable target provider (KVM vs. one-shot Aliyun ECS) | `pending` — must be named in the A3-1 implementation PR body before any probe runs |
| Named operator approver (`gccltd` candidate) | `pending` — user must separately confirm the same `gccltd` is the §7 approver; an independent identity-verifier must also be named |

> Supersedes: nothing.
> Refs: PR #646 (A3-0 contract skeleton, merged `10b98227` on `master`); issue #636 (Gate A3-0 closed, Gate A3-1 next).

## 0. Why this spec exists

PR #646 closed the **contract skeleton**: it pinned the exact evidence shapes for
`parseStorageQuotaEvidence` and `parseServiceSmokeReadback`, locked the test
injection boundary (`createCandidateDependencyGateTestRuntime`), and proved the
production `worker_storage_limit_unavailable` guard still fires under
`requireRoot: true` even with `allowTestWorkerStorage: true`. The PR is now
merged on `master` at `10b98227`. The contract is frozen; this spec does **not**
re-open contract shape decisions.

PR #646 is spec-only on its own. It did not execute XFS project-quota probes,
did not spawn systemd DynamicUser units, did not read cgroups, did not bind any
project-ID to a release artifact, and did not lift the production guard.

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
| 1 | Trusted XFS project-quota physical probe | `parseStorageQuotaEvidence` | No (probe runs in disposable VM) |
| 2 | Real EDQUOT overload probe (exhaustion → EDQUOT, headroom → 0) | `parseStorageQuotaEvidence.probe` | No |
| 3 | systemd-restricted native-smoke worker (DynamicUser transient unit) | `parseServiceSmokeReadback` | No |
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
- **Zero** code change in the A3-1 implementation PR that lifts the guard. Item 7 lives in a separate future PR and only opens if items 1-6 pass end-to-end on a clean Linux disposable target with operator approval.
- Branch base: `master` @ `10b98227e8c7aca667422bb5edad875cac2e7984` (post-PR-#646 merge). If `master` advances again before the A3-1 implementation PR is opened, **do not reuse the old artifact identity** — rebase the spec onto the new master SHA, refresh the `baseline_master_sha` field in `document_metadata`, and re-issue the dependency artifact reference. The bound artifact identity below is only valid while master is `10b98227`.
- Branch name: `codex/a3-materializer-physical-execution` (matches the repo's `codex/<topic>` convention).
- Worktree: a fresh worktree, never reused from sibling worktrees.

## 4. Test environment (one-shot privileged disposable Linux)

A3-1's physical probes must run on a clean disposable Linux target with the
following capabilities. None of this may be done on a developer laptop, on
production, on the CI runner, or on a stopped production node.

### 4.1 Required kernel/filesystem features

- Linux kernel ≥ 5.10 with `CONFIG_XFS_QUOTA=y` and `CONFIG_XFS_PQUOTA=y`.
- XFS filesystem mounted with `pquota` (project quota enabled). Verified by:
  `xfs_info /path | grep -q pquota`.
- `xfs_quota` (xfsprogs) ≥ 5.x.
- systemd ≥ 250 with `DynamicUser=` support and `systemd-run --scope`/`--unit` available.
- `cgroups v2` unified hierarchy mounted at `/sys/fs/cgroup`.
- `setpriv`, `runuser`, `capsh` available.
- A non-root operator account with passwordless `sudo` for `xfs_quota`, `systemctl`, `setpriv`.

### 4.2 Disposable target lifecycle

| Step | Command (illustrative) | Verification |
|---|---|---|
| Provision | local KVM/QEMU or cloud VM instance, ephemeral | `cloud-init status --wait` |
| Attach XFS data disk | `/dev/vdb` mounted at `/var/lib/probe` with `-o pquota` | `xfs_info /var/lib/probe` shows `pquota` |
| Verify project quota tool | `xfs_quota -x -c state /var/lib/probe` | shows `pquota enabled` |
| Verify systemd DynamicUser | `systemd-run --unit=probe-smoke --wait --service-type=oneshot /bin/true` | exit 0, no unit leftovers |
| Verify cgroup v2 | `stat -c %T -f /sys/fs/cgroup` | `cgroup2fs` |
| **Destroy** | `poweroff` after spec run; do not reuse the instance | n/a |

The target is single-use. Readback evidence captured during the run is the
only persistent artifact.

### 4.3 Forbidden states (must never run on)

- Any production host (Vultr Japan, SGP control plane, AWS production).
- Any staging host that holds persistent candidate artifacts.
- The CI runner (it lacks XFS project-quota).
- Any worktree directory under `D:/Projects/...` or `C:/Users/g/copilot-worktrees/...` (Windows; no XFS).

## 5. Read-only inventory (must precede any probe)

Before running any probe, capture the following on the disposable target. Do
not capture on production. Store the inventory in the A3-1 implementation PR
body under a foldable details section.

- `xfs_info /var/lib/probe` output (full)
- `xfs_quota -x -c state /var/lib/probe` output (full)
- `uname -a`
- `systemctl --version`
- `stat -c '%T' -f /sys/fs/cgroup`
- `capsh --print` (for the operator user)
- `getcap -r / 2>/dev/null | head -50`
- `ls -la /etc/systemd/system/ | head -20`
- `systemctl list-unit-files --state=enabled,static | head -40`

No state on production nodes may be read. If the disposable target needs
network access to download packages, allow-list only the package mirror and
deny everything else (single-purpose iptables/nftables snapshot recorded in
the PR body).

## 6. Dry-run checklist (per item)

Each item below has a dry-run phase that produces no evidence (probes do not
fire, sandbox does not spawn, materialize does not call anything new) and a
real-run phase that produces the readback. Dry-run must pass before real-run.

### 6.1 Item 1 — Trusted XFS project-quota physical probe (dry-run)

- Confirm `xfs_quota` exists and `pquota` enabled on `/var/lib/probe`.
- Pick a candidate `projectId` (e.g. `4242`).
- Plan a write that would exceed quota. Do not execute.
- Confirm probe code path will collect: `filesystem`, `projectId`,
  `byteHardLimit`, `byteCurrent`, `inodeHardLimit`, `inodeCurrent`,
  `headroomBytes`, `headroomInodes`.
- Pre-print the expected JSON shape using the contract's `quotaEvidence()`
  fixture from `server/tests/control-plane-materializer-a3-safety.test.mjs`.

### 6.2 Item 2 — Real EDQUOT overload probe (dry-run)

- Plan a sequence:
  1. Set project quota to `8GiB` bytes / `65536` inodes.
  2. Pre-allocate files until `byteCurrent ≈ 8GiB` / `inodeCurrent ≈ 65535`.
  3. Attempt a final write that crosses the limit.
  4. Capture `errno = EDQUOT`, `headroomBytes = 0`, `headroomInodes = 0`.
- Do not execute until items 6.1 dry-run passes.

### 6.3 Item 3 — systemd DynamicUser transient unit (dry-run)

- Draft a unit file (`a3-smoke.service`) with:
  `DynamicUser=yes`, `ProtectSystem=strict`, `ProtectHome=yes`,
  `PrivateDevices=yes`, `NoNewPrivileges=yes`,
  `CapabilityBoundingSet=`, `RestrictAddressFamilies=AF_UNIX`,
  `RestrictNamespaces=yes`, `SystemCallFilter=@system-service`.
- Plan `systemd-run --unit=a3-smoke --wait --service-type=oneshot node /opt/probe/smoke.mjs`.
- Do not start until 6.1/6.2 dry-run pass.

### 6.4 Item 4 — terminal / cgroup-empty readback (dry-run)

- Plan what the probe code reads:
  `serviceUid`, `serviceGid` from `getuid()`/`getgid()` inside the unit;
  `cgroupEmpty` from `cat /proc/self/cgroup` plus a check that the cgroup
  contains no PIDs other than the worker;
  `terminalActiveState`/`terminalSubState`/`terminalResult` from
  `systemctl show a3-smoke`.
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
  defaults to `false` everywhere outside the disposable target).
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

Quotas, project IDs, EDQUOT probes, and sandbox terminal/cgroup evidence
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

Operator approval must be obtained **after** items 1-4 real-run evidence is
captured and **before** item 5/6 code is merged. The approval packet goes in
`docs/production-replacement-records/<YYYY-MM-DD>-a3-1-materializer-physical-approval-packet.md`
following the project's existing template (see
`docs/production-replacement-records/2026-06-11-edge-agent-scoped-receipt-render-gate-approval-packet.md`).

Required packet fields:

- `target`: disposable Linux VM identifier (ephemeral, no PII)
- `target_destroy_at`: ≤ 24h after approval
- `target_os`: kernel + distro
- `xfs_info`: full output captured in §5
- `quota_evidence_capture_sha256`: hash of captured evidence JSON
- `smoke_readback_capture_sha256`: hash of captured readback JSON
- `contract_match`: bool from `parseStorageQuotaEvidence(raw)` and
  `parseServiceSmokeReadback(raw)` both succeeding on the captured JSON
- `worker_storage_limit_unavailable_status_after_run`: PRESERVED
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

If the disposable target is still alive, power it off (`poweroff`). Do not
reuse it. Do not copy its state elsewhere.

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
Identity impact: true (binds runtime project-ID + quota + receipt; identity_gate before/after required if production is ever touched; for A3-1 the disposable target is NOT production so the identity_gate is local to the disposable target)
Receipt schema impact: version bump; old schemas fail-closed
```

## 10. Hard constraints (from the project's risk model)

- Production `worker_storage_limit_unavailable` guard is **never** lifted by A3-1.
- No historical stopped node is treated as staging.
- No production `.env`, token, SQLite, or `SS_PASSWORD` is copied anywhere.
- No Admin UI is opened to the public network.
- Ports `3456`/`18180`/`1080` are not opened to the public network.
- Disposable target is single-use; destroyed after capture.
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
- [ ] Rollback plan from §8 has been rehearsed on the disposable target.
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
- "Disposable target reused across runs" — this fails §4.2 / §10.
- "Additive-only receipt schema change" — this fails §6.7.

## 13. Open questions to resolve before implementation

Each question has a default documented below; the user only needs to respond
to override.

1. **Base ref**: branch A3-1 implementation from current `master` (`10b98227`).
   If `master` advances again, rebase onto the new master SHA and refresh
   the `baseline_master_sha` field. **DECIDED**: merge #646 first, then
   branch from latest master. (Default: branch from `master` @ `10b98227`.)
2. **Disposable target provider**: preferred local KVM (independent XFS
   test disk, `pquota`/`prjquota`, root, systemd, cgroup v2); otherwise a
   one-shot cloud VM (Aliyun ECS preferred over any existing lightweight
   server). SWAS system disk and production-style mounts must not be
   reformatted or modified. **DECIDED**: KVM first; if unavailable, a
   fresh one-shot Aliyun ECS, never reuse an existing lightweight server.
   `pending_disposable_target_provider_confirmation: true` remains in the
   metadata header until the actual provisioning provider is named in the
   implementation PR body.
3. **Receipt schema migration**: version bump with fail-closed for old
   schemas. **DECIDED**: version bump.
4. **Operator role**: a resolvable production-owner GitHub identity. The
   current candidate is `gccltd` (the user that merged PR #646). The user
   must separately confirm that the same `gccltd` is the named approver in
   the §7 packet; an independent identity-verifier must also be named.
   `pending_operator_confirmation: true` remains in the metadata header
   until the user confirms and the verification pair is recorded in the
   §7 packet. Agent / Bot / spec authors are not eligible.

---

End of A3-1 spec.
