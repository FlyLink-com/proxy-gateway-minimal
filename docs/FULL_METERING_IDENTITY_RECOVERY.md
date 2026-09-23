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

The first authorized post-Linux read at 2026-09-23 12:30:45 UTC also returned
no mapping classification: its diagnostic-only directory guard rejected the
VLESS config's direct parent (ordinary, non-symlink directory, UID 999, no
group/other write). This is a diagnostic compatibility failure, not a new
metering root cause. That execution is consumed; no collector or service action
was performed. A separately approved inspector corrected the fixed-directory
admission locally and passed 35 boundary tests before the successful read below.
Production permissions were not changed to satisfy the diagnostic.

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

These cases explain the error but do not alone classify production. In
particular, normal expiration is not evidence that material was deleted. Do not
weaken either the local reader's mapping check or the driver's material
fingerprint check to make the collector run.

## Production mapping observation: 2026-09-23 12:42 UTC

The separately approved one-time Gate08 read completed successfully at
2026-09-23T12:42:20.3741345Z. It returned aggregate counts only, with no service,
configuration, identity or logical database mutation. SQLite WAL/SHM coordination
metadata effects remain possible. This packet is consumed and must not be replayed.

| Source | Runtime | Mapped | Missing map keys | Map only | Eligible | Retained | Retained without material |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Japan VLESS | 30 | 30 | 0 | 88 | 30 | 88 | 0 |
| Japan Hy2 | 30 | 28 | 2 | 77 | 28 | 77 | 0 |
| Japan TUIC | 30 | 28 | 2 | 89 | 28 | 89 | 0 |

All three inputs were stable; invalid/duplicate supplied reference counts were
zero. This is `mapping_keys_only` evidence, not a full material-fingerprint or
Identity Gate result. It establishes the current missing-key condition on Hy2
and TUIC and excludes missing retained material as the observed explanation at
this cutoff. It does not prove the first cause of the September 17 failure.

Four protocol entries are not necessarily four accounts, nor proven to be the
same accounts across protocols. Equal mapped/eligible counts do not prove set
equality. Map-only/retained records are not deletion candidates; their historical
and lifecycle handling remains subject to `docs/IDENTITY_LIFECYCLE.md`.

The installed helper/unit pins matched PR #728. Main service remained
`failed/exit-code/2`; its enabled timer was inactive. Checkpoint existed
(7,887,061 bytes); no pending file or writer lock was observed, with one temporary
file present. Checkpoint content compatibility and SGP were not examined. Do not
reset the checkpoint, remove the temporary file or declare the journal healthy
from file metadata alone.

Exact local evidence:

- Inspector SHA-256:
  `05079d2def2f08742927bb733d709e2d34eace599e39668af0d74be7e91542ca`.
- Executor SHA-256:
  `eb1b5b2a383578f32fc54887e35ecaa29930a0842dc3f0cc14de1c4e94c8d478`.
- Receipt:
  `.codex-artifacts/metering-main-mapping-readonly-20260923-08/main-metering-mapping-20260923-08.json`.
- Receipt SHA-256:
  `5931ab83c55b10c3bc60070e6fc8c1c8d750afbe1dfe4571139d01f738f29938`.

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

The mapping-key classification is complete. The remaining decision is restricted
to the two unmapped runtime keys on each of Japan Hy2 and TUIC, not another
whole-project inventory. Their exact authorization/lifecycle relation is not in
the aggregate receipt. On-host comparison with authoritative desired state must
establish whether to restore an existing authorized binding or remove a proven
obsolete runtime entry. Do not infer account revocation from a missing map key.

Existing `credential-reconciliation-gateway.mjs` builds revocations from current
credentials absent from desired credentials. The Hy2/TUIC runtime adapters render
the desired configuration, check it, back up, replace and restart only when
required. This provides an existing execution path, not permission to invoke a
whole-config rebuild from aggregate counts. Bind its exact intended changes first;
do not use generic account revocation or modify the identity guard as a shortcut.

Reuse the existing source and Linux evidence for unchanged behavior. Do not
assume a missing sample means zero or output identities, raw configurations,
database rows or subscription data. An affected configuration restart can
interrupt connections and requires the exact production repair approval.

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
