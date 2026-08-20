# Phase A2 Dependency Artifact Consumer Replay Receipt

```yaml
receipt_schema: "phase-a2-consumer-replay/v1"
receipt_state: verified
verified_at: "2026-08-20"
issue: 632
risk: A
scope: verify-only-non-production
production_authority: false

source:
  master_sha: f2e4095661b8e5b1a15e5be5326cc67c2c3abfff

artifact:
  workflow_run: 32363290307
  artifact_id: 9404326614
  name: control-plane-dependency-f2e4095661b8e5b1a15e5be5326cc67c2c3abfff
  envelope_sha256: 0ac7ef467520998ee3d4cf31a9cd289256ffa50d241eb4c06cb2918f4c44d357
  manifest_sha256: d313d5deeec4ad52b3884b5518274e4274c8e63b83a60b099eabb9cd593a7ff4
  manifest_size_bytes: 1232
  archive_sha256: c87e70c8fbae033eb357b103ac2da554b99f6af4a50d02294fe1e615c3c7de5b
  archive_size_bytes: 26664960
  tree_sha256: 0cbbb5a00829263489f38e3db31ba1eb1f1b03b55c8a4e37f8fbb076430e7b4c
  tree_entries: 1466
  tree_total_bytes: 25553465

consumer:
  environment: disposable-non-production-swas
  os: Ubuntu-24.04
  platform: linux
  arch: x64
  libc: glibc-2.39
  node: v22.23.1
  node_abi: "127"
  npm: v10.9.8
  better_sqlite3: 12.10.0
  archive_verify: passed
  tree_audit: passed
  native_memory_smoke: passed
  snapshot_import_smoke: passed

cleanup:
  replay_directory: removed-and-read-back-absent
  temporary_acl_package: purged-and-read-back-absent
  temporary_authorized_key: removed-and-read-back-absent
  temporary_cloud_key_pair: detached-deleted-and-read-back-absent
  local_temporary_material: removed-and-read-back-absent

non_goals:
  - no candidate node_modules materialization
  - no current pointer change
  - no systemd mutation
  - no database/schema mutation
  - no feature-flag or Welcome-Coins change
  - no production promotion approval
```

This receipt records a single verify-only consumer replay. It does not authorize
production deployment or replace the separate Phase A3 Risk A inventory,
rollback, operator-approval, staging, atomic-switch, and health-window gates.
