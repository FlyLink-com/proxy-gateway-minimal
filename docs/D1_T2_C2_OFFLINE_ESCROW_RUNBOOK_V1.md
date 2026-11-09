# D1 T2-C2 Cloudflare-Native Key Custody and Offline 2-of-3 Escrow Runbook v1

> Status: OWNER-APPROVED DESIGN BASELINE — 2026-11-08. Source-only runbook; no real key, share, Cloudflare secret, binding, escrow artifact, or production resource has been created.
> Production authority: BWH remains the only production control-data writer.

## 1. Owner decision

The project owner approves this C2 implementation route:

1. Cloudflare Workers Secrets are the online runtime secret store.
2. A dedicated Crypto Worker is the only Worker that receives the current purpose-separated HMAC key-ring secrets.
3. The business Control Plane Worker does not receive raw key bytes. Internal calls use a private Service Binding after caller identity and domain authorization have already been checked.
4. Cloudflare Secrets Store is not used by default. Reconsider it only if a demonstrated multi-Worker sharing requirement appears; it is not an HSM or KMS.
5. Independent recovery uses an offline encrypted escrow envelope and a 2-of-3 Shamir Secret Sharing threshold for the wrapping key.
6. No separate GCP, AWS, Azure, or other cloud KMS account is required or selected.
7. The encrypted envelope and metadata-only manifest are held in at least two independent offline physical locations. Three distinct named custodians hold one recovery share each; no person holds two shares.
8. This decision does not name custodians, select a specific Shamir implementation, generate real keys, create Cloudflare resources, deploy Workers, or authorize production operations.

This supersedes the external-managed-KMS preference in the earlier source-only provider evaluation. That evaluation remains historical comparison evidence, not the selected implementation route.

## 2. Security boundaries

### 2.1 Online runtime custody

- Use per-Worker Cloudflare Secrets for key material consumed only by the Crypto Worker.
- Current binding names: IDEMPOTENCY_HMAC_KEYRING_JSON, PROVIDER_EVENT_HMAC_KEYRING_JSON, PII_HMAC_KEYRING_JSON, CRYPTO_CONTROL_PLANE_CALLER_TOKEN, and optional CRYPTO_CONTROL_PLANE_CALLER_TOKEN_PREVIOUS during an approved overlap.
- These are binding names only; they do not prove that a real secret has been provisioned.
- The Crypto Worker loads key rings at request time, validates family separation, performs only allowlisted operations, and never returns raw keys.
- No public key-operation route is allowed. Keep workers.dev and preview URLs disabled. Do not add D1, KV, R2, or Durable Object bindings to the Crypto Worker for key storage.
- Protect Worker deployment permissions: anyone able to deploy arbitrary code to the Crypto Worker could attempt to exfiltrate runtime-accessible secrets. Require reviewed source, protected deployment identity, least-privilege API tokens, and separate production-deployment approval.
- Production secret values must never be placed in .dev.vars, .env, repository files, CI variables/logs, test fixtures, or shell command arguments. Local and CI tests use synthetic-only values.

Cloudflare encrypts Worker Secret values at rest and does not make the configured value readable again through the Dashboard or Wrangler. At runtime, however, the Worker can read the secret through its environment binding. This is runtime secret custody, not an HSM, non-exportable KMS key, or protection against malicious deployed code.

### 2.2 Offline recovery custody

- Each runtime key envelope receives a unique 256-bit recovery wrapping key (KEK). Do not reuse a KEK across key IDs, families, or generations.
- Wrap the runtime key with AES-256-GCM. Split the KEK into three shares using a vetted Shamir Secret Sharing implementation with threshold 2-of-3.
- Three distinct named custodians hold one share each in separate custody locations. No person or single location may hold two shares.
- Store the encrypted envelope and metadata-only manifest in at least two physically independent offline locations, separate from the share locations.
- Offline media must be tamper-evident and access-controlled. If electronic media are used, encrypt each share separately at rest and keep its unlock factor separate from the media.
- The Crypto Worker, Control Plane Worker, BWH, D1, Cloudflare, GitHub, Notion, and CI must not receive the offline KEK or Shamir shares.
- Do not put plaintext key material or recovery shares in chat, issue comments, PR descriptions, logs, screenshots, or evidence bundles.

The specific Shamir tool/library and pinned version/hash remain OPEN until source review, provenance verification, and synthetic threshold tests pass. Do not implement Shamir Secret Sharing from scratch.

## 3. Escrow envelope contract

The existing synthetic-only contract is the reference shape for the first envelope version:

- schemaVersion
- keyId
- family
- algorithm
- wrappedAt
- nonce
- ciphertext
- tag

Contract parameters:

- Runtime key material: exactly 32 bytes.
- Recovery KEK: exactly 32 bytes, unique per envelope.
- Cipher: AES-256-GCM.
- Nonce: 12 bytes from a cryptographically secure random source; never reuse with the same KEK.
- Authentication tag: 16 bytes.
- AAD: the exact ordered JSON array [schemaVersion, keyId, family, algorithm, wrappedAt], matching the existing synthetic contract.
- Metadata projection exposes only schema version, key ID, family, algorithm, and wrapped timestamp. It never exposes plaintext key material or recovery shares.

The current module server/services/platform/d1-t2-key-escrow-contract.mjs is explicitly synthetic-only. Its passing tests do not authorize using that module to wrap real keys. A separate offline utility must be reviewed and tested before real key generation or escrow creation.

## 4. Offline key generation and escrow preparation

This is the future controlled procedure, not an instruction to run now.

1. Record the three named custodians, recovery operator, independent approver, purpose, key family, environment, and ticket/reference before generating any key.
2. Select and pin the audited Shamir implementation, version, artifact hash, source provenance, and offline dependencies. Review its random-number source and threshold behavior.
3. Use an isolated, access-controlled workstation with networking disabled for generation and recovery rehearsal. Use the operating system cryptographic random generator; do not use a PRNG, timestamps, UUIDs, or human-generated passphrases as key material.
4. Generate a unique 32-byte runtime key and a separate unique 32-byte recovery KEK for each key envelope.
5. Wrap the runtime key using the approved AES-256-GCM envelope contract. Bind the exact key ID, family, algorithm, and wrapped timestamp as AAD.
6. Split the KEK into three Shamir shares with threshold two. Confirm that every possible two-share pair reconstructs the KEK and any single share is insufficient.
7. In memory, restore the envelope using the reconstructed KEK and verify byte equality plus independent HMAC known-answer vectors. Verify wrong-family, wrong-key-ID, modified-AAD, malformed-envelope, tampered-ciphertext, and corrupted-share rejection.
8. Write only encrypted envelopes and metadata-only manifests to two independent offline media locations. Distribute one share to each named custodian using separate tamper-evident custody packages.
9. Verify custody receipts and checksums without recording key material or shares in the receipt.
10. Only after escrow and recovery rehearsal are independently accepted may a separately authorized operator enter the runtime secret into the exact Crypto Worker secret binding using a controlled interactive secret-entry path.

Never put a real secret value in a command argument, terminal transcript, shell history, environment dump, clipboard history, local development file, CI variable, or source-control artifact. Validate the exact secret-entry procedure against the installed Wrangler version using synthetic values first.

## 5. Two-of-three recovery

A recovery requires two different custodians and a separate recorded purpose.

1. Open a time-bounded recovery record identifying environment, key family, immutable key ID, reason, requested operation, initiator, recovery operator, independent approver, and expiry.
2. Confirm the two custodians are distinct people and each presents only their own assigned share.
3. Move the encrypted envelope and metadata-only manifest into the isolated offline recovery environment.
4. Reconstruct the KEK in memory using the approved 2-of-3 tool. Do not write the reconstructed KEK or plaintext runtime key to disk.
5. Restore the key using the exact envelope metadata and AAD. Verify key ID, family, algorithm, length, key-family separation, and known-answer vectors.
6. For a synthetic rehearsal, do not provision the restored value to Cloudflare.
7. For a real availability recovery, provisioning the recovered key to the Crypto Worker requires separate exact-resource authorization. A suspected or confirmed runtime-key compromise requires rotation to a new key, not restoration of the compromised key.
8. Zeroize temporary buffers on a best-effort basis, close the isolated environment, and verify that no plaintext artifacts remain.
9. Record only non-secret evidence: key ID, family, envelope checksum, custodians, approver, operator, timestamps, reason, tool version/hash, test outcomes, and custody receipt references.

A one-share recovery must fail. A two-share recovery must not silently accept an unknown key ID, wrong family, wrong algorithm, malformed envelope, or tampered ciphertext.

## 6. Rotation, revocation, and retirement

- HMAC rotation: new writes use only the new active key ID. Old keys remain read-only only while dependent rows, lookup candidates, replay windows, provider retries, and restore paths require them.
- Retire an old HMAC key only after row-count/reconciliation evidence, retention closure, restore tests, and owner approval.
- KEK rotation: rewrap the same runtime key under a new unique KEK, create a new 2-of-3 share set, verify restoration, then retire the old share set and old envelope only after independent acceptance.
- If a custodian loses a share or leaves the role, do not merely delete the share record. Reconstitute under controlled dual custody and create a new 2-of-3 share set, or rotate the KEK and rewrap the envelope; verify old shares can no longer restore the current envelope.
- If a runtime key is compromised, rotate the runtime key family and preserve the old key only for approved retained reads if safe. Do not restore a compromised runtime key from escrow.
- Recovery and revocation evidence must never include secret values or shares.

## 7. Acceptance gates before any real key provisioning

- [ ] Three named custodians and distinct recovery/approval roles are recorded.
- [ ] The Shamir implementation is selected, independently reviewed, version-pinned, hash-verified, and its provenance recorded.
- [ ] Synthetic tests prove all three two-share combinations succeed, every one-share attempt fails, and malformed/corrupted shares fail closed.
- [ ] Synthetic AES-256-GCM tests prove exact AAD binding, wrong-key/family/key-ID rejection, tamper rejection, and metadata-only projection.
- [ ] The offline utility does not write plaintext keys, reconstructed KEKs, shares, or raw material to disk, logs, shell history, or artifacts.
- [ ] Encrypted envelopes and metadata-only manifests are stored in two independent offline physical locations.
- [ ] Three shares are distributed to three distinct custodians in separate custody locations, with receipts.
- [ ] A synthetic restore rehearsal is witnessed by two custodians and independently reviewed.
- [ ] The Crypto Worker secret-entry procedure is tested with synthetic values; local development and CI contain synthetic values only.
- [ ] Actual control-plane Service Binding integration waits for the C1 identity/domain authorization context and passes caller authorization tests.
- [ ] An independent reviewer accepts the exact evidence before real key generation or Cloudflare secret provisioning.

## 8. Explicit non-authorization and current status

This owner decision and runbook do not authorize:

- generating real production key material or real recovery KEKs;
- selecting or provisioning a production Shamir tool, shares, or offline backup media;
- creating or changing Cloudflare Worker Secrets, Secrets Store entries, Service Bindings, routes, tokens, or account resources;
- deploying the Crypto Worker or Control Plane Worker;
- BWH access, production data reads, D1 writes, DDL, dual-write, or cutover;
- payment-provider operations, Durable Object creation, or changes to production writer authority.

The architecture choice is APPROVED. The implementation tool, named custodians, offline custody locations, synthetic threshold implementation tests, non-production integration, domain-owner approvals, and independent review remain OPEN. C2 remains OPEN; T2 remains BLOCKED. BWH remains the only production control-data writer.

## 9. Related source contracts

- docs/D1_T2_C2_KEY_CUSTODY_OWNER_DECISION_PROPOSAL_V1.md
- docs/D1_T2_C2_KEY_CUSTODY_AND_ROTATION_ADR_V1.md
- docs/D1_T2_C2_CRYPTO_WORKER_INTERFACE_CONTRACT_V1.md
- docs/D1_T2_C2_EXTERNAL_ESCROW_PROVIDER_EVALUATION_V1.md
- server/services/platform/d1-t2-key-escrow-contract.mjs
- server/tests/d1-t2-key-escrow-contract.test.mjs
