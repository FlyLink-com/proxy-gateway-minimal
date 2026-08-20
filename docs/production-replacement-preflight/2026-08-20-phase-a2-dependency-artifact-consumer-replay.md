# Phase A2 Dependency Artifact Consumer Replay Receipt

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: phase_a2_dependency_artifact_consumer_replay_2026_08_20
  superseded_by: null
  last_verified_at: 2026-08-20
  production_authority: false

```

```yaml
receipt_schema: "phase-a2-consumer-replay/v1"
receipt_state: verified
verified_at: "2026-08-20"
issue: 632
risk: A
scope: verify-only-non-production
production_authority: false

gate:
  issue: 632
  phase: A2
  result: completed
  execution_request_ref: issue-632-phase-a2-replay
  operator_approval_ref: controlled-task-authorization-a2-2026-08-20
  approval_channel: controlled-operator-session
  approval_public_review_ref: not-applicable
  inventory_verified_at: "2026-08-20T12:01:34Z"
  replay_started_at: "2026-08-20T12:01:34Z"
  replay_completed_at: "2026-08-20T12:27:37Z"
  cleanup_verified_at: "2026-08-20T12:29:58Z"
  receipt_recorded_at: "2026-08-20T12:29:58Z"

provider:
  name: aliyun-swas
  target:
    role: disposable-non-production
    identity_sha256: 50b055d5d7d745443c057f69e563a6bcb129647debde118b75a16d44ddc8b3bf
    inventory_verified_at: "2026-08-20T12:01:34Z"
    isolation_evidence_sha256: 63b80f9a274180b30b1a0210276dce37119561c11caa4d888a7450677544fbbc
  credential:
    api:
      logical_id_sha256: 268018c0db7b7b272eee12e6479526a6e39052244a05104e5c4c1ae31026234e
      privilege: unverified_assume_full_access
      local_source: configured-cli-opaque
      local_before: uninspected
      local_after: uninspected
      provider_credential_status: unverified_assume_valid
    temporary_ssh_key:
      logical_id_sha256: bf2f51b730b8dfbe14feac559c54fce3c876edac58006e76d3bab8862f3cfca0
      privilege: root-session-only
      local_source: process_only
      local_before: absent
      local_after: absent
      provider_credential_status: revoked

commands_executed:
  - aliyun swas-open read-only inventory and Cloud Assistant status
  - aliyun swas-open temporary key import, attach, detach, and delete for the hashed target
  - Cloud Assistant RunShellScript for host inventory, key installation, key removal, and readback
  - strict SSH/scp verify-only replay using the temporary key
  - control-plane-dependency-artifact.mjs --mode verify with the final source and artifact bindings
  - apt-get install/purge acl as a single temporary package, without autoremove

provider_mutation:
  - temporary cloud key pair imported and attached
  - temporary authorized_keys entry added and removed with before/after readback
  - temporary cloud key pair detached and deleted with absent readback
  - temporary acl package installed and purged

credential_local_before: process-only temporary key; no persisted copy
credential_local_after: absent
provider_credential_status:
  temporary_ssh_key: revoked
  configured_api_credential: unverified_assume_valid
production_mutation: none
conclusion: verify-only replay completed; no production promotion
next_gate: separate Phase A3 Risk A production-promotion gate

source:
  master_sha: f2e4095661b8e5b1a15e5be5326cc67c2c3abfff

artifact:
  workflow_run: 32363290307
  artifact_id: 9404326614
  name: control-plane-dependency-f2e4095661b8e5b1a15e5be5326cc67c2c3abfff
  envelope_sha256: 0ac7ef467520998ee3d4cf31a9cd289256ffa50d241eb4c06cb2918f4c44d357
  github_zip_size_bytes: 6460690
  expires_at: "2026-09-03T11:20:22Z"
  release_unit: control-plane-app
  artifact_release: f2e4095661b8
  manifest_sha256: d313d5deeec4ad52b3884b5518274e4274c8e63b83a60b099eabb9cd593a7ff4
  manifest_size_bytes: 1232
  package_sha256: 45cc416d0c9fbf2d399b15ca426e03fed570631c1c282dd8c96c4f9d6cd80cdf
  package_size_bytes: 9840
  package_lock_sha256: 40b21e0bc4b97d3beca49eaa6f94aee2906fdecbfde963e0c581a1303b7c6794
  package_lock_size_bytes: 53965
  archive_sha256: c87e70c8fbae033eb357b103ac2da554b99f6af4a50d02294fe1e615c3c7de5b
  archive_size_bytes: 26664960
  tree_sha256: 0cbbb5a00829263489f38e3db31ba1eb1f1b03b55c8a4e37f8fbb076430e7b4c
  tree_entries: 1466
  tree_total_bytes: 25553465
  provenance:
    builder: github-actions
    workflow: control-plane-dependency-artifact.yml

consumer:
  environment: disposable-non-production-swas
  temporary_extraction: created-verified-and-removed
  persistent_candidate_publish: not-performed
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
  - no persistent candidate-release node_modules publication
  - no production candidate materialization
  - no current pointer change
  - no systemd mutation
  - no database/schema mutation
  - no feature-flag or Welcome-Coins change
  - no production promotion approval
```

This receipt records a single verify-only consumer replay. It does not authorize
production deployment or replace the separate Phase A3 Risk A inventory,
rollback, operator-approval, staging, atomic-switch, and health-window gates.
