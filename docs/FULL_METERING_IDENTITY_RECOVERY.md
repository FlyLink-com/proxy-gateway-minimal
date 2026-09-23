# Full metering identity failure: isolated reproduction and recovery boundary

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: full_metering_identity_recovery
  superseded_by: null
  last_verified_at: 2026-09-23
  production_authority: false
```

Risk: B for source regression coverage; A for any production recovery.
One work item/PR, related to #437. This record is **not a production repair or
activation receipt**. No collector implementation or identity check is changed.

## Known fault and remaining distinction

The previously captured production event at 2026-09-17 14:47:44 UTC is
`full_metering_local_identity_mapping_invalid`. The installed collector can
produce this when a runtime principal has no valid, unique reference in its
verified identity map. The earlier production diagnostic attempts did not
produce the binding/material counts needed to distinguish the following cases.

The single authorized post-Linux read at 2026-09-23 12:30:45 UTC also returned
no mapping classification: its diagnostic-only directory guard rejected the
VLESS config's direct parent (ordinary, non-symlink directory, UID 999, no
group/other write). This is a diagnostic compatibility failure, not a new
metering root cause. That execution is consumed; no collector or service action
was performed. Correct all fixed runtime-directory boundary tests locally before
requesting another exact read; do not repair permissions on production merely to
satisfy the diagnostic.

| Synthetic state | Expected result |
| --- | --- |
| Active, fully bound identities | Initialize without historical charge; collect subsequent increments |
| Retained/expired binding with no material, principal still in runtime | Observed mapping error for Xray, Hy2 and TUIC |
| Runtime principal without a business binding, even with material | Same mapping error for all three protocols |
| Active binding with missing material | Different error: `full_metering_material_binding_changed` |
| Expired binding with complete verified material | Readable, excluded from active usage charges |
| Material-less retained principal already absent from runtime | Does not block the remaining valid identities |
| Active-to-expired transition with existing checkpoint | Retains checkpoint and excludes expired usage |
| Legacy primary binding plus newly added identity | Preserves the original baseline; new identity gets no historical charge |

These cases explain the error but **do not prove which case exists in production**.
In particular, normal expiration is not evidence that material was deleted. Do
not weaken either the local reader's mapping check or the driver's material
fingerprint check to make the collector run.

## Source and verification

`server/tests/full-metering-identity-lifecycle-integration.test.mjs` composes the
real SQLite binding inspector, source driver, local-source parsers, collector,
sample writer and durable journal. All runtime commands and statistics HTTP
responses are injected synthetic inputs: this is not a live Xray/Hy2/TUIC test.
All database rows and identity values are synthetic. No production data is
copied into a fixture.

Two interruption tests additionally verify that collection recovers an older
durable pending intent before reading fresh sources. A later mapping failure
can therefore follow a legitimate recovery write. Never run `collect` as a
read-only diagnostic, claim all mapping failures imply zero database writes,
clear a pending intent, or reset the checkpoint to bypass an error.

Exact test command:

```sh
node --test --test-concurrency=1 \
  server/tests/full-metering-identity-lifecycle-integration.test.mjs \
  server/tests/full-metering-binding-inspector.test.mjs \
  server/tests/full-metering-source-driver.test.mjs \
  server/tests/full-metering-local-source.test.mjs \
  server/tests/full-metering-collection.test.mjs
```

On 2026-09-23:

- Windows: 130 passed, 0 failed, 0 skipped; 21 cases are newly added.
- Existing Aliyun nonproduction Linux host: the same 130 passed, 0 failed,
  0 skipped, using portable Node 22.23.1 and a fresh exact-lockfile dependency
  install. Tests ran as UID/GID 65534 without a network namespace uplink;
  existing candidate service metadata was unchanged before/after.
- Tested base: `e8acb366bce4687782dbaefef75c50a04166e284` plus the new test
  SHA-256 `17a6eee3c7974bd1196884e7378805ad894658563fcba6c46b1446f25540e872`.
- Lockfile SHA-256:
  `46aa9df28cb8e0afe7a03ed5c09790bd59df78d0c5e25927a3b64c53e65dd0fb`.
- Linux source archive SHA-256:
  `e29350f4fca14a31fc5e68c6396ab59f3a52b20ed24fead38e65997cc7397f41`.
- Linux test log SHA-256:
  `cbfd00ed5d68520c3a7cb0ffbf11afdebf4ce94b530062104f6907cd0bb1792f`.
- The owned Linux validation workspace is retained. Local execution receipt:
  `.codex-artifacts/metering-aliyun-isolation-20260923/proxy-validate.result.json`.
- Source validation discovers `server/tests/*.test.mjs` automatically; no new
  test-registration manifest is required. Full project validation has not been
  rerun for this diagnostic work item.

## Minimum remaining production step

After exact authorization, obtain one aggregate-only mapping classification
for the affected collector path. Reuse the existing source and Linux evidence;
do not repeat whole-project inventory or assume a missing sample means zero.
Distinguish active/retained/unbound principals and missing/changed material
without outputting identities, raw configs, database rows or subscription data.

Choose the repair from that result. A stale runtime principal, a missing
protected material record and a live binding mismatch are not interchangeable
remedies. Before mutation, bind the precise target/delta, retain a fresh
host-local backup and define rollback without overwriting committed usage.
Preserve valid pending intents, the original activation baseline and current
checkpoints. Do not issue new identities, backcharge unassignable history,
change entitlements, or enable the retired legacy collector.

Only after the chosen repair is tested and authorized should the existing main
collector resume. Verify distinct successful natural runs and sample/checkpoint
progress, then add the production Deploy Note. Until then, this PR remains
Draft and the production fault is not marked resolved.
