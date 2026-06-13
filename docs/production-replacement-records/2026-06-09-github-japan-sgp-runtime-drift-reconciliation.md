# GitHub / Japan / Singapore Runtime Drift Reconciliation

Date: 2026-06-09, Asia/Shanghai.

Risk tier: B for repository-only analysis and guardrails. Any live server
inspection, runtime apply, deploy, service restart, DNS, Nginx, provider
firewall, or database mutation remains Risk A and requires a separate approval.

## Purpose

This record captures the current mismatch between GitHub source, the Vultr
Japan control-plane runtime, and the Vultr Singapore data-plane runtime. The
goal is to prevent future production deployments from mixing source code,
protected runtime config, and local development residue.

This record does not copy, print, or store raw environment values, SQLite rows,
subscription URLs, tokens, passwords, private keys, raw runtime config, raw
logs, or customer data.

## Verified Source Boundaries

Current source boundaries observed during the read-only reconciliation:

- GitHub PR branch: `feat/install-config-wizard`.
- PR head commit: `c7497d9ce4767a1b3418b8f38a7ad19125c44f89`.
- GitHub `master` remains behind the active service-lane PR.
- Vultr Japan control-plane runtime is running an approved hotfix release
  derived from the broader integration lane, not current `master` and not the
  latest PR head.
- Vultr Singapore data-plane runtime is running a replacement deployment that
  contains runtime services and local/dev residue not suitable as a clean
  source package.

These facts are orientation data only. They are not deployment approval and
must be refreshed before any Risk A action.

## Drift Classes

### Japan Control Plane

The Japan runtime is close to a previously approved runtime artifact, but it is
not identical to current GitHub PR head.

Observed classes:

- expected runtime-only material, such as local control files;
- protected runtime config, especially `config/proxy-servers.json`, which may
  intentionally differ from Git and must be reviewed as runtime state rather
  than blindly overwritten;
- a residual ad-hoc backup file in the release tree;
- missing files that exist only in the newer PR head, including the repo-only
  handoff queue support added after the deployed hotfix;
- line-ending noise that should be normalized before treating a source file as
  semantically changed.

Recommended action:

1. Treat Japan as the control-plane upgrade target.
2. Build a clean artifact from a reviewed commit.
3. Verify package-boundary rules before upload.
4. Upgrade through the normal Risk A runtime gate with backup, validation, and
   rollback.

### Singapore Data Plane

The Singapore runtime should not be used as a source baseline. Its release tree
contains development and local-runtime residue, including categories such as:

- local assistant settings;
- local preview/runtime scratch material;
- nested worktree content;
- host-specific runtime material.

Recommended action:

1. Treat Singapore as a data-plane rebuild/clean-artifact target, not a source
   import source.
2. Rebuild from a clean, reviewed artifact after Japan control-plane source is
   stabilized.
3. Re-apply protected runtime config through the remote data-plane handoff
   mechanism.
4. Validate VLESS Reality, Hysteria2, and TUIC listeners and credential counts
   without printing raw material.

## Repo Guardrail Added

The repository now includes a production artifact boundary checker:

- implementation:
  `server/services/platform/production-artifact-boundary.mjs`
- tests:
  `server/tests/production-artifact-boundary.test.mjs`
- CLI integration:
  `gccgw package inspect <package-dir> --json`

The checker blocks production package manifests containing:

- `.worktrees/`
- `.codex-runtime/`
- `.claude/`
- `.proxy-gateway/`
- `.env` and `.env.local`
- SQLite/database files
- private-key or certificate material
- runtime logs
- ad-hoc backup files

It also marks protected runtime config such as `config/proxy-servers.json` as
review-required instead of treating it as ordinary source drift.

Text comparison helpers normalize CRLF/LF line endings before comparing hashes,
so Windows/Linux write-method noise is not mistaken for source drift.

`gccgw package inspect` now includes the boundary result in its redacted report
and fails closed when the package file list contains production-package blockers.

## Future Deployment Checklist

Before the next Vultr production deployment:

1. Confirm the intended Git commit and PR/branch identity.
2. Build a clean artifact from that commit only.
3. Run `gccgw package inspect <package-dir> --json` or the production artifact
   boundary checker against the artifact manifest.
4. Record artifact SHA-256 and source commit.
5. Verify Japan runtime config drift separately from source drift.
6. Do not use Singapore runtime files as source material.
7. Deploy Japan control-plane upgrade first.
8. Rebuild or re-apply Singapore data-plane runtime through a separate approved
   gate.
9. Validate public portal/sub boundaries, loopback-only Admin, no-session API
   rejection, channel render proof, and data-plane listener state.

## Stop Conditions

Stop before deployment if any of these are true:

- the artifact contains local worktrees or preview runtime files;
- the artifact contains `.env`, SQLite, keys, logs, or backup files;
- `config/proxy-servers.json` drift has not been explicitly reviewed;
- the source commit is unknown or not recorded;
- Singapore runtime is being copied back into Git as source;
- validation would require printing raw credentials, tokens, subscription URLs,
  SQLite rows, raw logs, raw config, or raw environment values.
