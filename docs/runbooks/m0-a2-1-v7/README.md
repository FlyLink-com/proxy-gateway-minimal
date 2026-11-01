# M0-A2-1 v7 — BWH read-only metering diagnostic (v9 byte-stable checkout repair)

**Status:** v9 Windows local validation was reported passed on code commit `5187edc19380fdb44dd2e0f531e9cfdf580b00e1` using Node `v22.16.0` (SHA256 7/7, syntax checks 4/4, self-test passed, tests 10/10). Hosted CI remains skipped; this is not production-read authorization. The documentation-only evidence update does not change diagnostic runtime or test code.

## Purpose

Prepare one narrowly scoped read-only pass to close the diagnostic gaps recorded in Issue #809 after M0-A2-1 v6:

1. Bind `gccgw-full-metering-collect.service` to its actual `WorkingDirectory`, `ExecStart`, `OnFailure`, `FragmentPath`, and drop-ins.
2. Verify the deployed full-metering collector directory against the exact 49-file content closure recorded by the existing proof manifest for `collector-plan-e834185cca07`.
3. Inspect `gccgw-full-metering-collect-stop.service` and correlate its last invocation with the collector's recorded failure time without claiming causality from timestamps alone.
4. Inspect the full-metering Timer separately.
5. Inspect the distinct status writer `gccgw-traffic-usage-collect.service` and its Timer, then compare that writer—not the full-metering service—with the App's `EDGE_USAGE_COLLECTOR_STATUS_PATH` binding.
6. If and only if the latest full-metering service invocation is still the recorded 2026-10-20 02:15:07 UTC invocation and has a valid `InvocationID`, read only that exact systemd journal invocation and extract a single allowlisted `errorCode` from the collector's redacted JSON message.
7. Read the bounded status projection only after the corrected App-to-status-writer binding is matched, and pass it through the pinned App sanitizer.

## What this package does not do

- No SSH, network request, provider API, DNS, certificate, firewall, or Nginx access.
- No `collect`, `--check`, `--preflight`, `--initialize`, or recovery command.
- No `systemctl start`, `stop`, `restart`, `enable`, `disable`, `reset-failed`, `daemon-reload`, or unit-file edit.
- No full-metering SQLite database read.
- No full-metering journal directory, `checkpoint.json`, `pending.json`, `writer.lock`, or config-file read.
- No environment-file content read. Systemd `Environment` values and `/proc/<AppPID>/environ` are read only in memory to compare the single status-path binding; raw values and paths are never printed.
- No raw systemd `ExecStart`, fragment/drop-in paths, environment values, process IDs, invocation IDs, journal messages, or raw status JSON in output.
- No automatic retry. Any blocked result is a stop point; another run requires separate approval.

The targeted `journalctl` query is a bounded **systemd journal** read, not a read of the full-metering collector's own journal/checkpoint directory. It is skipped unless the current service `ExecMainStartTimestamp` exactly matches the recorded failure start and `InvocationID` is valid. The command is filtered by both `_SYSTEMD_INVOCATION_ID` and `_SYSTEMD_UNIT`, capped at 64 records / 1 MiB / 5 seconds. Only a unique `errorCode` matching the collector entrypoint's safe prefix allowlist is returned. Raw journal output is never printed.

## Diagnostic boundaries and interpretation

### Full-metering lane

The script accepts only the historical deployed collector root:

`/opt/gccwebos-runtime/collector-plan-e834185cca07`

It requires the service `WorkingDirectory` and `ExecStart` to bind to that root, the known `traffic-full-metering-collect.mjs --collect --config ... --config-sha256 <64-hex>` argument shape, and all 49 pinned files to match their expected size and SHA-256. It also checks that the root and file closure contain no unexpected entries and are not symlinked or group/world writable.

The result label is deliberately `49_file_closure_matched`; it does not claim that a historical tar archive SHA was reconstructed from filesystem metadata. The config body is not read; only the configured path and presence of a 64-hex digest argument are checked.

### OnFailure and Timer

`OnFailure` is checked against `gccgw-full-metering-collect-stop.service`. The stop unit's `ExecStart` is accepted only when systemd reports `path=/usr/bin/systemctl` and the complete `argv[]` is exactly `/usr/bin/systemctl stop gccgw-full-metering-collect.timer`. Shell wrappers, a different executable, extra arguments, repeated `argv[]` records, or a different target are rejected. The stop unit's last start is compared with the collector's last exit; the output is only `matched`, `not_matched`, or `unknown`. A time match is temporal correlation, not proof of causal execution.

The full-metering Timer and status-writer Timer are separate records. An inactive one-shot service state is not interpreted as a disabled timer.

### Status writer and App binding

The correct comparison is:

`proxy-gateway-candidate.service` ↔ `gccgw-traffic-usage-collect.service`

not App ↔ `gccgw-full-metering-collect.service`.

The status binding is reported `matched` only if the status writer's `ExecStart` is bound to `traffic-usage-collect-once.mjs --collect`, its unit environment-file / pass / unset settings match the App, its direct `EDGE_USAGE_COLLECTOR_STATUS_PATH` assignment matches the App's assignment, and the running App process contains that same absolute path. If the value is only inherited from an environment file and no direct assignment can be proven by the selected metadata, the result remains `unknown`; do not infer that the path is absent.

Only after a match does the script read the status projection. The file is bounded to 256 KiB, must be a regular non-symlink with one link and no group/world permissions, and is read with before/after inode and metadata checks. The App release's pinned sanitizer is used before any status data is printed.

The producer projection remains explicitly partial: current source only defines the Japan TUIC credential-map producer and the SGP TUIC sidecar producer. It is not a complete producer map for all three Japan channels.

### App release identity

The caller must supply `--expected-release <exact-current-release-label>`. There is no hard-coded guessed release. At the beginning, the script records the `current` symlink target and its device/inode/metadata signature, verifies App `WorkingDirectory` and `/proc/<PID>/cwd`, and checks four previously pinned App-side projection/provenance modules. At the end, it re-resolves `current`, rechecks the App PID and process cwd, and requires the symlink target/signature and release directory to match the initial snapshot. Any drift blocks the result. Output remains `app_release_identity=label_only`; these checks are not a complete App artifact/source-commit proof.

## Path and byte-level portability

All paths read from Linux systemd are POSIX paths. `CURRENT_LINK` is built with `path.posix.join`, so a Windows Node test run keeps the same `/` separators as the Linux systemd values. Do not replace this with host-dependent `path.join`.

The seven files listed in `SHA256SUMS` are byte-verified inputs. Their Git attributes use `-text !eol`, not `text eol=lf`: Git must write the committed blob bytes to the worktree unchanged. This specifically prevents `core.autocrlf=true` from converting LF blobs to CRLF during checkout. The rule is scoped to this diagnostic package and does not change the user's global Git configuration or other repository files.

Use an **isolated checkout/worktree** of the exact commit being validated. For the first v9 check, the worktree must have been checked out after the `-text` rules were added. For a repeat check, the same isolated worktree may be reused after confirming `git rev-parse HEAD` equals the exact target commit and rechecking the effective attributes and EOL state. Do not switch or modify any other working directory with uncommitted changes. A repeat check does not require a new workspace or Node installation when the exact target commit and required Node runtime are already present.

From Git Bash or WSL, inspect the effective settings:

```bash
git config --show-origin --get core.autocrlf || true
git check-attr text eol -- \
  docs/runbooks/m0-a2-1-v7/SHA256SUMS \
  docs/runbooks/m0-a2-1-v7/VALIDATION.txt \
  scripts/m0-a2-1-v7.mjs \
  scripts/lib/m0-a2-1-v7-archive-pins.mjs
git ls-files --eol -- \
  scripts/m0-a2-1-v7.mjs \
  scripts/lib/m0-a2-1-v7-diagnostic.mjs \
  scripts/lib/m0-a2-1-v7-archive-pins.mjs \
  server/tests/m0-a2-1-v7.test.mjs \
  docs/runbooks/m0-a2-1-v7/README.md \
  docs/runbooks/m0-a2-1-v7/VALIDATION.txt \
  docs/runbooks/m0-a2-1-v7/REVIEW-REPORT.txt
```

Expected:
- `git check-attr`: `text: unset` and `eol: unspecified` for each sampled path.
- `git ls-files --eol`: every listed file reports `i/lf w/lf attr/-text`.
- `core.autocrlf` may still be `true`; do not change global Git configuration. The package attributes must prevent conversion for these paths.
- The worktree must reflect the exact target commit and the `-text` attributes. If any file reports `w/crlf`, stop; do not normalize the file manually and do not treat the checksum result as passed.

## Runtime deadline

The diagnostic enforces a 45-second elapsed-time budget at phase boundaries. This in-process check is a secondary guard, not a hard wall-clock limit: synchronous filesystem reads cannot be interrupted by a JavaScript timer. Any future host invocation MUST therefore be wrapped by GNU coreutils `timeout` with a 45-second TERM deadline and a 5-second KILL grace period. This bounds the complete process to at most 50 seconds. Exit status `124` or `137` is a timeout stop, not a completed diagnostic; do not retry under the same approval.

## Local validation

Use **Node v22.16.0 exactly** and run from the repository root in the same fresh isolated checkout. On Windows, use Git Bash or WSL with `sha256sum` available:

```bash
node --version
# Expected: v22.16.0
sha256sum -c docs/runbooks/m0-a2-1-v7/SHA256SUMS
node --check scripts/m0-a2-1-v7.mjs
node --check scripts/lib/m0-a2-1-v7-diagnostic.mjs
node --check scripts/lib/m0-a2-1-v7-archive-pins.mjs
node --check server/tests/m0-a2-1-v7.test.mjs
node scripts/m0-a2-1-v7.mjs --self-test
node --test server/tests/m0-a2-1-v7.test.mjs
# Expected: 13/13 tests passed
```

### Recorded v9 Windows result — operator-reported (2026-10-31)

- Isolated workspace: `D:\Projects\proxy-gateway-minimal-pr812-v9`.
- Tested code commit: `5187edc19380fdb44dd2e0f531e9cfdf580b00e1`; the existing isolated workspace was already at this exact commit, so it was reused. No new workspace was created.
- `core.autocrlf=true` remained unchanged.
- Node: `v22.16.0` from the isolated toolchain directory. The system Node `v24.16.0` was not replaced.
- The sampled `git check-attr` results were `text: unset` and `eol: unspecified`.
- All seven checksum inputs reported `i/lf w/lf attr/-text`.
- `sha256sum -c docs/runbooks/m0-a2-1-v7/SHA256SUMS`: 7/7 OK, exit code 0.
- Four `node --check` commands: all exit code 0.
- `node scripts/m0-a2-1-v7.mjs --self-test`: `m0_a2_1_v7_self_test=passed`, exit code 0.
- `node --test server/tests/m0-a2-1-v7.test.mjs`: 10/10 passed, exit code 0.
- The original working directory with uncommitted changes was not touched. No BWH/Provider connection or production read occurred.

This result is recorded as operator-reported local evidence and applies to the exact tested code commit above. The subsequent evidence-archive commit changes only README, validation/review records, and the SHA256 manifest; it does not change diagnostic runtime or test code. The seven manifest entries are regenerated for that archive commit.

### Subsequent archive-head checksum-only verification — operator-reported (2026-10-31)

- Archive head checked: `92a4ea3454cce9e873a49fd692ea374ec2078609`.
- After switching the same isolated v9 workspace to that exact commit, the operator reran only `sha256sum -c docs/runbooks/m0-a2-1-v7/SHA256SUMS`: **7/7 OK, exit code 0**.
- All seven files reported `i/lf w/lf attr/-text`.
- This was checksum-only. Node was not reinstalled, and the four `node --check` commands, `--self-test`, and `node --test` were not rerun against this archive head.
- The full code validation above remains bound to `5187edc19380fdb44dd2e0f531e9cfdf580b00e1`. This follow-up is operator-reported local checksum evidence only, not a full test rerun, hosted CI result, or production read.

Record the exact output and exit code of every command. If Node is not exactly `v22.16.0`, stop and record the version mismatch; do not substitute another Node version. A skipped CI run is not a pass.

`--self-test` exits before the production branch and makes no `systemctl` or `journalctl` call. The CLI entrypoint is guarded; the Node test suite imports the diagnostic module directly and tests parsers, service binding, current-pointer stability, exact stop-unit argv matching, status-writer binding, archive manifest integrity, exact-invocation error-code extraction, time correlation, the required external timeout wrapper, and the read-only command surface.

## Future execution shape — NOT APPROVED BY THIS PR

A future Risk A approval must name the target host, one exact time window, this exact script SHA-256, the expected App release label, and the one permitted command. After a separate approval only, the command shape is:

```bash
sudo /usr/bin/timeout --signal=TERM --kill-after=5s 45s \\
  /usr/bin/node scripts/m0-a2-1-v7.mjs --expected-release '<exact-current-release-label>'
```

The timeout wrapper sends TERM at 45 seconds and KILL no later than 5 seconds afterward. Timeout exit status 124 or 137 is a stop; do not retry. Do not run this command as part of PR review, CI, local validation, or this preparation task. If the expected release is not supplied from a fresh authoritative read, do not run it.

## M0 decision

M0 remains **BLOCKED**. This package is diagnostic preparation only. It does not authorize M0-A2-2, M1–M8, production recovery, database/journal/checkpoint inspection, or Japan node creation.
