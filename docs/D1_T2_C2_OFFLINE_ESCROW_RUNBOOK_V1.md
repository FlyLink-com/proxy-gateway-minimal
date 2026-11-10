# D1 T2-C2 Cloudflare Runtime Secrets + SOPS/age 2-of-3 Custody-Domain Runbook v1.1

> Status: OWNER-APPROVED AMENDMENT — 2026-11-10. SOPS v3.13.3 + age v1.3.2 toolchain verification and synthetic threshold rehearsal PASS (Stage 2 item 1 only). Exact offline workstation and real custody-domain configuration remain OPEN.
> Scope: online runtime key custody, independent offline recovery, and staged C2 gates. This is not C2 formal acceptance.
> Production authority: BWH remains the only production control-data writer.
> Safety boundary: no real age identity, runtime key, SOPS escrow record, Cloudflare Secret, Service Binding, AWS custody object, deployment, BWH access, or production operation is authorized by this runbook amendment.

## 1. Current owner decision

The project owner has approved the following current C2-D1 route:

1. **Online runtime custody:** Cloudflare per-Worker Secrets hold the purpose-separated runtime key rings and are bound only to the dedicated Crypto Worker. The business Control Plane Worker never receives raw key bytes.
2. **Internal invocation:** use a private Worker Service Binding only, after caller identity and domain authorization have been checked. No public key-operation route and no raw-key return.
3. **Offline recovery format:** SOPS v3.13.3 + age v1.3.2, with exactly three key groups, one distinct age recipient in each group, and `shamir_threshold: 2`.
4. **Custody model:** three independent control domains, not necessarily three different natural persons. Each domain holds one age identity. The cryptographic threshold protects against one domain being compromised; it does not prove two-person approval.
5. **No second wrapping layer:** SOPS is the selected production recovery format. Do not add the historical AES-256-GCM envelope + per-envelope KEK + manual Shamir layer on top of SOPS. The repository AES-GCM helper remains synthetic-only.
6. **No separate KMS selection:** AWS KMS, GCP KMS, Azure Key Vault/Managed HSM, and other managed KMS products are not selected for this route. An AWS account may be considered as a custody domain for one age identity, not as a KMS dependency.
7. **Artifact copies:** SOPS ciphertext and metadata-only manifests must exist in at least two physically independent offline locations, separate from the age-identity stores. Google Drive may be an additional ciphertext-only copy, not an offline location. **Owner deviation (ADR §21.3, ruled 2026-11-10):** the two designated copies are (1) Google Drive and (2) the owner's BitLocker-encrypted USB drive held offline; the Drive copy holds ciphertext and metadata only, never age identities.
8. **Human limitation:** a single operator may currently administer the three domains. This is not human separation of duties and is not two-person recovery/approval. Record this limitation in C2/T2 until independent human custodians are available.

This amendment supersedes the previous runbook's three-named-custodian and custom AES-GCM/KEK recovery procedure. The online Cloudflare runtime architecture remains unchanged.

## 2. Security boundaries

### 2.1 Online runtime custody

- Per-Worker Cloudflare Secrets are runtime inputs only for the dedicated Crypto Worker.
- Current binding names: `IDEMPOTENCY_HMAC_KEYRING_JSON`, `PROVIDER_EVENT_HMAC_KEYRING_JSON`, `PII_HMAC_KEYRING_JSON`, `CRYPTO_CONTROL_PLANE_CALLER_TOKEN`, and optional `CRYPTO_CONTROL_PLANE_CALLER_TOKEN_PREVIOUS` during an approved overlap.
- Binding names do not prove that a real secret has been provisioned.
- The Crypto Worker validates key-family separation, performs allowlisted operations, and never returns raw keys.
- No public key-operation route. Keep workers.dev and preview URLs disabled. Do not add D1, KV, R2, or Durable Object bindings to the Crypto Worker for key storage.
- Protect Crypto Worker deployment rights. Anyone who can deploy arbitrary code to the Worker may be able to exfiltrate runtime-accessible secrets. Require reviewed source, protected deployment identity, least-privilege API tokens, and separate production-deployment approval.
- Production secret values must never appear in .dev.vars, .env, repository files, CI variables/logs, test fixtures, shell command arguments, chat, screenshots, or evidence bundles. Local and CI tests use synthetic values only.
- Cloudflare Worker Secrets are runtime-readable by the bound Worker. They are not an HSM, a non-exportable KMS key, or protection against malicious deployed code.

### 2.2 Offline recovery custody

- Each custody domain owns exactly one independent age identity (private key) and its corresponding public recipient.
- The age private identity is never placed in Cloudflare Worker Secrets, passed to the Crypto Worker, placed in the business Control Plane Worker, BWH, D1, GitHub, Notion, CI, or the runtime deployment pipeline.
- The SOPS encrypted file may be copied between approved backup locations. The age private identities must remain separated by custody domain.
- The encrypted records and metadata-only manifest are stored in at least two physically independent offline locations, separate from the three identity stores. (Designated copies per the ADR §21.3 owner deviation: Google Drive + offline BitLocker-encrypted USB.)
- No plaintext runtime key, decrypted SOPS record, or age private identity may be written to logs, terminal transcripts, shell history, chat, issue comments, PR descriptions, screenshots, or evidence bundles.
- Do not treat a shared administrator, shared SSO, shared recovery email, or common reset authority as independent custody.

## 3. Three custody domains and independence criteria

The Stage 2 synthetic fixture used the following labels only:

| Domain | Stage 2 synthetic label | Intended role | Current status |
|---|---|---|---|
| A | Cloudflare | One independent recovery identity domain | Placeholder only; not configured. Must be separated from Crypto Worker runtime secrets and deployment authority. |
| B | AWS account 580857941765 | One independent recovery identity domain | Placeholder only; not configured. Before use, replace AWS root credentials on lucky with a dedicated least-privilege IAM identity. |
| C | Fully offline | One physically isolated recovery identity domain | Placeholder only; final device, medium, storage location, and access procedure not selected. |

These labels are not a final vendor/account approval. The Stage 2 test did not create or configure any Cloudflare or AWS resource. If Domain A cannot be shown independent from the Cloudflare runtime/deployment control plane, it must be reassigned before it counts as a custody domain. The exact final service-provider/account mapping remains an OPEN owner decision.

Every real domain must pass all of the following:

- unique account/control boundary and independent administrator;
- independent login credentials and MFA;
- independent account-recovery channel and reset path;
- no shared SSO or parent administrator capable of resetting or accessing another domain;
- one age private identity only, with no second domain's identity or recovery factor;
- evidence that compromise of this domain alone cannot decrypt the SOPS escrow file.

Three domains do not mean three people. A single person with access to any two domains can decrypt; a single person who controls all three can recover the file. This is the accepted single-operator limitation, not a two-person approval mechanism.

## 4. SOPS record format and configuration

### 4.1 One record per key ID and family

The plaintext input record used for the synthetic Stage 2 fixture has this shape:

| Field | Meaning |
|---|---|
| `schemaVersion` | Record schema version |
| `keyId` | Unique runtime key identifier |
| `family` | Purpose-separated key family |
| `algorithm` | Current algorithm identifier, e.g. HMAC-SHA-256 |
| `keyLengthBits` | 256 for the current HMAC key families |
| `generatedAt` | Canonical generation timestamp |
| `keyMaterialBase64` | Base64 encoding of 32 cryptographically random bytes |

Use one SOPS-encrypted JSON record per runtime key ID/family. Never combine unrelated key families or reuse the same key bytes across families or generations.

The metadata-only manifest contains the non-secret metadata above plus `keyMaterialSha256` for independent inventory reconciliation. It never contains `keyMaterialBase64`, any age private identity, or any recovery secret. The manifest is not a substitute for SOPS authenticated encryption/MAC.

### 4.2 Threshold configuration

The approved structure is three separate key groups, exactly one age recipient per group, and threshold two. Public recipients are placeholders below; real public recipients are not yet selected or committed.

```yaml
creation_rules:
  - path_regex: '.*\.escrow\.json$'
    shamir_threshold: 2
    key_groups:
      - age:
          - age1REPLACE_PUBLIC_RECIPIENT_A
      - age:
          - age1REPLACE_PUBLIC_RECIPIENT_B
      - age:
          - age1REPLACE_PUBLIC_RECIPIENT_C
```

Do not place two recipients in the same group and count them as two custody domains. Keep real private age identities out of the repository; only reviewed non-secret public-recipient configuration may be source-controlled after the real domains are approved.

SOPS owns the structured-file encryption, data-key handling, authenticated encryption/MAC, and Shamir threshold. No custom AES-GCM envelope or separately split per-envelope KEK is layered on top. The existing `server/services/platform/d1-t2-key-escrow-contract.mjs` is synthetic-only and is not a real-key wrapping utility.

## 5. Pinned toolchain and release-integrity evidence

### 5.1 Selected versions

| Artifact | Version | SHA-256 |
|---|---|---|
| SOPS Linux AMD64 binary | v3.13.3 | `e5bec3346a873ae91d871550f3e698c1aad962aff462a080e40f25fde17fef6b` |
| SOPS checksums file | v3.13.3 | `91710ede6a3218e5b62286412543768a92d0c3449434951bd148d21043aad538` |
| SOPS Sigstore bundle | v3.13.3 | `b140370c339c465dff725b879e0caad3e7ff441fdbbef51179924f9c4b45082f` |
| SOPS SLSA provenance | v3.13.3 | `d8756a37a9b0f37e8cbe473535e97e154f899bf8202d5e46ee4610455a47ac9b` |
| age Linux AMD64 tarball | v1.3.2 | `cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10` |
| age Sigsum proof | v1.3.2 | `98402fa59b4e433426156b4a7e74a32e44902e0434c61158f7de18ffc84f1f97` |
| age binary | v1.3.2 | `eb7dd1b518f0a307c99cd97782623c5321da049154b04acd2d98d21aa7bc9b2c` |
| age-keygen binary | v1.3.2 | `0a0009db842259d6717f7eeb30acb6b90d2a2eb924c6acd0a0db0ca1f1537899` |

Verification aids (not custody tools): Cosign v3.1.4 SHA-256 `424e2c97d0b45fd7a6b608a87f090f35633f4c23ece5f092d48bba11aaf4bbfa`; slsa-verifier v2.7.1 SHA-256 `946dbec729094195e88ef78e1734324a27869f03e2c6bd2f61cbc06bd5350339`; sigsum-verify built from sigsum-go v0.13.1 SHA-256 `1410cd8228cd0d2be5c650c9a899f4c4052a3385ed4d36b395278396fe15b2d0`; Go v1.27.3 tarball SHA-256 `65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40`.

### 5.2 Verification result

- SOPS binary matched the official v3.13.3 checksums file.
- Cosign `verify-blob` returned `Verified OK`; certificate identity pinned to `https://github.com/getsops/sops/.github/workflows/release.yml@refs/tags/v3.13.3`, OIDC issuer `https://token.actions.githubusercontent.com`.
- SLSA verifier returned `PASSED`; source `github.com/getsops/sops`, tag v3.13.3, commit `26e2f4784ca61353082c32dbd987c25eda086dc9`.
- age v1.3.2 Sigsum proof passed using the official age `SIGSUM.md` recipe and `sigsum-generic-2025-1` policy.
- The above Linux AMD64 BOM was tested on the Muse VM as a stand-in. It does not select the final offline workstation OS/architecture. The exact offline workstation remains an owner decision.

## 6. Stage 2 synthetic threshold rehearsal evidence

The Stage 2 run generated three synthetic age identities and one non-member identity. No real custody identity, runtime key, Cloudflare/AWS resource, or real-secret envelope was created.

| Test | Expected | Result |
|---|---|---|
| A+B | Decrypt and match manifest | PASS |
| A+C | Decrypt and match manifest | PASS |
| B+C | Decrypt and match manifest | PASS |
| A+B+C | Decrypt and match manifest | PASS |
| A only | Reject | PASS (rejected) |
| B only | Reject | PASS (rejected) |
| C only | Reject | PASS (rejected) |
| Non-member X only | Reject | PASS (rejected) |
| A + non-member X | Reject | PASS (rejected) |
| A+B on tampered ciphertext | Reject authentication/MAC | PASS (rejected) |

The successful cases required every decrypted field to match the original synthetic record and the decoded key-material SHA-256 to match the metadata-only manifest.

Transparency note: the first tamper script failed before producing a tampered file; that attempt is not counted. The script was corrected to alter the encrypted payload and assert that the ciphertext hash changed before decryption. The 10/10 result is from the corrected full rerun.

Evidence:
- [SOPS_AGE_TOOLCHAIN_VERIFICATION_2026-11-09.md](https://drive.google.com/file/d/1-ALe9oRFd1q5a9K9ia5hWZ_VtxXGOBl1/view)
- Evidence SHA-256: `64eea14eeb92e530cdb6c32e954ea288be866ebebc15fc7fc8b4c771722b880e`
- Build log SHA-256: `18f9425e0d18ad6582da34657fe843fd8bd3c2e93a28891e7ab5b1711a0eee58`
- Matrix log SHA-256: `36daed7a4e60329981698bff81709e22c666ea176619a606daf8bbf9b1d38b90`

**Verdict:** Stage 2 item 1 (pinned tool acquisition, release-integrity verification, and synthetic 2-of-3 rehearsal) is PASS. This does not close the remaining Stage 2 work.

## 7. Future controlled setup procedure — not authorized by this record

The following is the future implementation sequence. Do not execute it until each required owner authorization is recorded.

1. Select the exact offline workstation OS/architecture and acquire the matching pinned SOPS/age BOM. Re-verify signatures/provenance on that workstation.
2. Finalize the real A/B/C provider/account mapping. Prove independent credentials, MFA, recovery channels, and administrator boundaries. Reject any mapping where one parent admin can reset all domains.
3. For AWS Domain B, replace the AWS root credentials currently on lucky with a dedicated least-privilege IAM identity before the account is used as a custody domain. This does not create or select AWS KMS.
4. Verify that a Cloudflare Domain A, if retained, is isolated from the Crypto Worker's runtime secret binding and deployment principal. The Worker must never receive the age private identity.
5. Generate one age identity per domain in the approved isolated process. Deliver each private identity only to its own domain; retain only public recipient strings in the non-secret SOPS config.
6. Generate purpose-separated runtime keys using the approved OS cryptographic random source. One 32-byte key per key ID/family/generation; never reuse key bytes across families.
7. Build the JSON record and metadata-only manifest. Encrypt the JSON with the exact three-group SOPS configuration and `shamir_threshold: 2`.
8. Place ciphertext + manifest in two physically independent offline locations, separate from the three identity stores. Google Drive may be an additional ciphertext-only copy. Per the ADR §21.3 owner deviation (2026-11-10), the designated copies are Google Drive (ciphertext + manifest only) and the owner's offline BitLocker-encrypted USB drive.
9. Conduct Stage 3 recovery rehearsal with networking disabled. Demonstrate how two domain identities are brought to the workstation without collapsing the custody domains; do not write plaintext key material or identities to persistent storage or logs.
10. Obtain independent review and explicit owner authorization before any real key is generated or any Cloudflare Secret / Service Binding is configured.

If two identities cannot be made available to a genuinely offline workstation without using a live provider API, classify the procedure as network-assisted recovery and document that dependency. Do not call it air-gapped recovery.

## 8. Recovery procedure and evidence

For an approved recovery event:

1. Record the incident/ticket, key ID, family, environment, reason, operator, and approving authority before access.
2. Retrieve exactly two age identities from two distinct custody domains. Never combine or store all three identities on one routine workstation.
3. Use the approved offline workstation and pinned binaries. Keep network disabled if the procedure is claimed to be air-gapped.
4. Decrypt the SOPS record directly into a controlled in-memory consumer. Do not print plaintext to a terminal or write a decrypted JSON record, key material, or identity to ordinary disk, logs, shell history, or artifacts. The memory-only handling method must be validated in Stage 3 before real recovery.
5. Verify key ID, family, algorithm, key length, generatedAt, and key-material SHA-256 against the metadata-only manifest.
6. Provision a restored runtime key only under a separate explicit authorization and the approved secret-entry procedure. This runbook does not authorize Cloudflare secret changes.
7. Record only metadata, artifact hashes, identity-domain pair used, timestamps, test results, and approvals. Never record secret values or shares.

A single domain must not be enough to decrypt. A two-domain technical threshold is not proof of two-person approval while one natural person controls multiple domains.

## 9. Rotation, loss, compromise, and retirement

- Runtime-key rotation: create a new purpose-specific key ID and generation. New writes use only the new active key; old keys remain read-only only while approved dependent rows, lookup candidates, replay windows, provider retries, and restore paths require them.
- Retire an old runtime key only after row-count/reconciliation evidence, retention closure, restore tests, and owner approval.
- Age identity rotation: use two unaffected domains to decrypt the existing SOPS record, generate a replacement identity for the affected domain, update the public-recipient group, re-encrypt the record, and verify all new two-domain combinations before retiring old ciphertext and the old identity. Keep old ciphertext only for a controlled overlap with documented risk.
- Lost identity: do not treat a missing identity as recoverable from a single remaining domain. Use the other two domains under the approved procedure to rotate the lost domain's identity and re-encrypt.
- Compromised age identity: replace the identity and re-encrypt the escrow record. A compromised identity alone must not decrypt, but its exposure is still a custody incident.
- Compromised runtime key: rotate the runtime key family. Do not restore a known-compromised runtime key from escrow.
- No recovery evidence may include plaintext keys, private identities, or decrypted payloads.

## 10. Acceptance gates and current status

### Stage 2 — toolchain and custody-domain preparation

- [x] Pin SOPS v3.13.3 and age v1.3.2 Linux AMD64 artifacts and record SHA-256 values.
- [x] Verify SOPS checksum, Cosign signature identity, SLSA provenance, and age Sigsum release proof.
- [x] Prove the synthetic 2-of-3 threshold matrix (10/10 expected outcomes).
- [ ] Select the exact offline workstation OS/architecture; Muse VM linux/amd64 is only a stand-in.
- [ ] Configure the three real custody domains and prove their independent credentials, MFA, recovery channels, and administrator boundaries.
- [ ] Replace AWS root credentials currently on lucky with a dedicated least-privilege IAM identity before AWS is accepted as Domain B.
- [ ] Prove the Cloudflare recovery identity (if Domain A is retained) is inaccessible to the runtime Crypto Worker and its deployment principal.

### Stage 3 — offline recovery drill (separately gated)

- [ ] Retrieve two identities from two domains without collapsing their control boundaries.
- [ ] Prove the claimed offline/network-assisted recovery mode and its exact network dependency.
- [ ] Prove memory-only handling, manifest matching, tamper rejection, and no plaintext persistence/logging.
- [ ] Complete an independent witness/review of the synthetic recovery evidence.

### Stage 4 — isolated non-production integration (separately gated)

- [ ] Integrate the Crypto Worker through private Service Binding after caller identity/domain authorization.
- [ ] Use synthetic-only runtime keys; prove no public endpoint, no raw-key return, and fail-closed behavior.
- [ ] Verify secret provisioning/replacement procedure without production resources.

### Stage 5 — C2 formal acceptance

- [ ] Close domain-purpose approvals, Wallet-first compatibility/replay/retention decisions, key-family retention rules, and independent review.
- [ ] Obtain Yi's explicit C2 acceptance decision.
- [ ] Keep production key generation/provisioning as a separate gate.

**Current status:** Stage 2 item 1 PASS; Stage 2 remaining items OPEN; Stage 3–5 not started/accepted. C2 remains OPEN and T2 remains BLOCKED.

## 11. Explicit non-authorization

This runbook does not authorize:

- generating any real age identity, runtime key, production key, or SOPS escrow record;
- creating or modifying any Cloudflare Worker Secret, Secrets Store entry, Service Binding, route, token, Worker, or account resource;
- creating or modifying AWS IAM users/roles, S3 buckets, policies, root credentials, or any AWS resource;
- selecting final provider/account mappings or claiming that a placeholder domain is configured;
- deploying the Crypto Worker or Control Plane Worker;
- BWH access, production data reads, D1 writes, DDL, dual-write, or cutover;
- payment-provider operations, Durable Object creation, or changes to production writer authority;
- claiming three-domain custody is equivalent to three-person approval.

BWH remains the only production control-data writer.

## 12. Related source contracts and references

- `docs/D1_T2_C2_KEY_CUSTODY_AND_ROTATION_ADR_V1.md`
- `docs/D1_T2_C2_KEY_CUSTODY_OWNER_DECISION_PROPOSAL_V1.md` (historical proposal; this runbook and ADR amendment are authoritative for current D1 custody)
- `docs/D1_T2_C2_CRYPTO_WORKER_INTERFACE_CONTRACT_V1.md`
- `docs/D1_T2_C2_EXTERNAL_ESCROW_PROVIDER_EVALUATION_V1.md` (historical comparison; not the selected KMS route)
- `server/services/platform/d1-t2-key-escrow-contract.mjs` (synthetic-only; not a production SOPS utility)
- `server/tests/d1-t2-key-escrow-contract.test.mjs` (synthetic-only tests)
- SOPS documentation: https://getsops.io/docs/reference/
- SOPS v3.13.3 release: https://github.com/getsops/sops/releases/tag/v3.13.3
- age v1.3.2 release: https://github.com/FiloSottile/age/releases/tag/v1.3.2

## 13. Change history

- 2026-11-08 v1: approved Cloudflare per-Worker runtime Secrets and independent offline 2-of-3 recovery as the target architecture. Initial recovery notes described a custom AES-256-GCM envelope, per-envelope KEK, manually split Shamir shares, and three named custodians.
- 2026-11-10 v1.1: selected SOPS v3.13.3 + age v1.3.2 after verified synthetic 2-of-3 rehearsal; amended recovery custody to three independent control domains (not necessarily three people); made the single-operator limitation explicit; recorded the Stage 2 residuals and retained all non-production/production authorization gates.
