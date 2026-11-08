# D1 T2-C2 Key Custody Owner Decision Proposal v1

> **Status:** RECOMMENDED DEFAULTS FOR ONE GROUPED OWNER DECISION. No key, secret, binding, tenant, or production resource is created by this proposal.
> **Source anchor:** `feat/t2-c4-c5-payment-retention-contracts-20261108`.
> **Production authority:** BWH remains the only production control-data writer.

## 1. Recommended decision

Adopt the existing C2 ADR architecture with the following bounded defaults:

1. A dedicated, narrowly scoped cryptographic service Worker owns key operations. The business control-plane Worker never receives raw key bytes.
2. Use private Worker Service Bindings for internal calls. The caller must authenticate/authorize before invoking the crypto service; do not expose a public key-operation endpoint.
3. Use per-Worker secret bindings for key families consumed by one Worker. Use Cloudflare Secrets Store only if a demonstrated multi-Worker sharing need exists; it is not an HSM/KMS.
4. Maintain independent encrypted key escrow outside Cloudflare, GitHub, and Notion. A Cloudflare secret binding must not be the only recoverable copy.
5. Use separate key material for idempotency HMAC, provider-event HMAC, PII HMAC, and any future AES purpose. Never reuse bytes across families.
6. Keep first-party Portal/Admin TOTP AES keys unprovisioned while the approved C1/Auth0 direction owns target MFA. Old BWH TOTP material follows the already-approved T1 re-enrollment rule.
7. Preserve Wallet-first handoff SHA-256-domain-v1 digests; do not add them to the HMAC key family. The source audit and entropy hardening are recorded in `D1_T2_C2_WALLET_FIRST_DIGEST_COMPATIBILITY_AUDIT_V1.md`.

## 2. Key-family disposition

| Family | Purpose | Recommended custody | Status |
|---|---|---|---|
| `idempotency-hmac` | Six approved raw idempotency domains | Dedicated key family, crypto Worker only | Synthetic primitives ready; real custody OPEN |
| `provider-event-hmac` | Payment provider event dedupe | Separate key and domain | Synthetic primitives ready; Payment owner OPEN |
| `pii-hmac` | Account email, registration IP and request-context pseudonyms | Separate key and domain; Identity/Privacy controlled | Synthetic vectors ready; Privacy owner OPEN |
| `portal-totp-aes` | First-party Portal MFA only if Auth0 does not own factors | Do not provision under current T1 decision | DEFERRED / NOT REQUIRED FOR CURRENT PATH |
| `admin-totp-aes` | First-party Admin MFA only if Auth0 does not own factors | Do not provision under current T1 decision | DEFERRED / NOT REQUIRED FOR CURRENT PATH |
| Wallet-first `idempotency_key_hash` / `session_binding_hash` | High-entropy transient handoff tokens | Preserve exact domain-separated SHA-256 v1; no key | Compatibility recommendation ready |
| Lease-token digests | Lease ownership/fencing | Existing domain-separated SHA-256 contract | No secret key required |

## 3. Generation and escrow

- Generate each production key as 256 bits of cryptographically secure randomness in the approved key-generation environment.
- Assign a unique immutable key ID and family. Do not encode key bytes or secrets in a source file, D1 row, KV value, R2 object, log, fixture, or Notion page.
- Store the runtime copy only in the approved Worker secret binding or Secrets Store entry.
- Create a separate encrypted escrow copy wrapped by an independent KMS/HSM-controlled key or an approved offline recovery mechanism. The wrapping key must not be stored beside the ciphertext.
- Require two-person authorization for escrow recovery and key revocation.
- Record only key ID, family, generation time, custodian role, escrow reference, and lifecycle state in the non-secret inventory. Never record key material.

## 4. Rotation and retirement

### HMAC
- New writes use only the active key ID.
- Reads may use the active key plus explicitly retained old key IDs.
- Envelopes remain `hmac-sha256:v1:<key-id>:<digest>`.
- Keep old keys until every dependent row, replay window, provider retry window, restore path, and retention class is closed or safely re-keyed.
- HMAC is not reversible. Do not claim an existing digest can be converted to another key without the canonical input or a separately approved migration method.

### AES-GCM
- New ciphertext uses the active key ID in the versioned envelope.
- Retain old decrypt keys only while live ciphertext depends on them.
- Re-encrypt live records under the new key before retiring the old key; if the legacy key is unavailable or compromised, fail closed and use the approved re-enrollment/recovery path.
- Portal/Admin key families remain separate if ever needed.

## 5. Recovery acceptance

Before any production key provisioning, the synthetic recovery rehearsal must prove:

1. A key ring can be restored from the encrypted escrow into an isolated non-production environment.
2. Key IDs, family separation, and active/read-only ordering are preserved.
3. Existing synthetic HMAC envelopes verify under retained keys.
4. Existing synthetic AES-GCM envelopes decrypt only under the correct family, key ID, and AAD.
5. New writes use only the active key after rotation.
6. Unknown key IDs, malformed escrow, missing keys, and tampered ciphertext fail closed.
7. Old-key retirement is blocked while any synthetic dependent row or replay window remains.

## 6. Grouped owner decision

To close the design portion of C2, record one grouped approval covering:

- Crypto Worker + private Service Binding boundary.
- Per-Worker secret bindings as default; Secrets Store only for proven shared use.
- Independent encrypted escrow and two-person recovery.
- The family separation table above, including no Portal/Admin TOTP AES key under current T1.
- Active-write / retained-read rotation and evidence-based retirement.
- Wallet-first SHA-256-domain-v1 compatibility.

Functional owners: Platform/Security key custodian, Identity/Privacy owner, Payment/Commerce owner. Record the actual accountable people in the project decision register; do not invent names.

## 7. Explicit non-authorization

This proposal does not authorize production key generation, Cloudflare Secrets Store creation, Worker secret bindings, crypto Worker deployment, Auth0 tenant creation, production PII/identity reads, BWH access, D1 writes, or cutover.

**Current gate:** C2 key custody and independent restore remain OPEN pending the grouped owner decision. Synthetic primitives and source audits may continue independently.
