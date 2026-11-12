# D1 T2-C2 Key Custody Owner Decision Proposal v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: d1_t2_c2_key_custody_owner_decision_proposal
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```


> **Status:** TARGET ARCHITECTURE APPROVED BY PROJECT OWNER — 2026-11-08. This approval selects the bounded architecture below only; implementation, real custody, named custodians, external escrow provisioning and production operations remain separately gated.
> **Source anchor:** `feat/t2-c4-c5-payment-retention-contracts-20261108`.
> **Production authority:** BWH remains the only production control-data writer.

## 1. Approved target architecture (owner approval: 2026-11-08)

Adopt the existing C2 ADR architecture with the following bounded defaults:

1. A dedicated, narrowly scoped cryptographic service Worker owns key operations. The business control-plane Worker never receives raw key bytes.
2. Use private Worker Service Bindings for internal calls. The caller must authenticate/authorize before invoking the crypto service; do not expose a public key-operation endpoint.
3. Use per-Worker secret bindings for key families consumed by one Worker. Use Cloudflare Secrets Store only if a demonstrated multi-Worker sharing need exists; it is not an HSM/KMS.
4. Maintain independent encrypted key escrow outside Cloudflare, GitHub, and Notion. A Cloudflare secret binding must not be the only recoverable copy.
5. Use separate key material for idempotency HMAC, provider-event HMAC, PII HMAC, and any future AES purpose. Never reuse bytes across families.
6. Keep first-party Portal/Admin TOTP AES keys unprovisioned while the approved C1/Auth0 direction owns target MFA. Old BWH TOTP material follows the already-approved T1 re-enrollment rule.
7. **Separate compatibility item, not covered by this architecture approval:** the Wallet-first handoff SHA-256-domain-v1 digest formula remains as audited in `D1_T2_C2_WALLET_FIRST_DIGEST_COMPATIBILITY_AUDIT_V1.md`; its owner acceptance, replay/retention window and long-term disposition remain separately tracked.

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

## 6. Owner decision record — target architecture APPROVED (2026-11-08)

Project owner approval covers the architecture choices below:

- Crypto Worker + private Service Binding boundary.
- Per-Worker secret bindings as default; Secrets Store only for proven shared use.
- Independent encrypted escrow and two-person recovery.
- The family separation table above, including no Portal/Admin TOTP AES key under current T1.
- Active-write / retained-read rotation and evidence-based retirement.
- **Not included in this architecture approval:** Wallet-first SHA-256-domain-v1 compatibility and its delivered-row replay/retention duration; see the separate source audit and obtain the relevant domain-owner decision.

Approval boundary: the target architecture is accepted as the design baseline. This does not assign named people or approve each data-domain purpose. Functional owner roles remain Platform/Security key custodian, Identity/Privacy owner, and Payment/Commerce owner; the actual accountable people must be named in the project decision register before implementation.

## 7. Explicit non-authorization

This proposal does not authorize production key generation, Cloudflare Secrets Store creation, Worker secret bindings, crypto Worker deployment, Auth0 tenant creation, production PII/identity reads, BWH access, D1 writes, or cutover.

**Current gate:** target architecture decision is APPROVED. C2 implementation and formal acceptance remain OPEN pending named accountable custodians, selection and validation of the concrete independent escrow/recovery mechanism, isolated non-production Worker/Binding integration, domain-owner approvals, replay/retention decisions, and independent review.

## 8. Synthetic escrow restore prototype validated — 2026-11-08

Added:
- `server/services/platform/d1-t2-key-escrow-contract.mjs`
- `server/tests/d1-t2-key-escrow-contract.test.mjs`

The pure contract wraps and restores 32-byte synthetic key material with AES-256-GCM using a separate wrapping key and AAD bound to key ID, family, algorithm, and wrapped timestamp. It also checks family/key-ID uniqueness and prevents material reuse across key families. Inventory projection exposes metadata only.

Fixed Node v22.23.1, isolated non-production sandbox:
- 10/10 PASS, 0 failed, 0 skipped — Run 1 TAP SHA-256: `86bd5b1c9c8efd655b017161be263ef1a5f24e978e131d38b39063ad0e611a56`.
- 10/10 PASS, 0 failed, 0 skipped — Run 2 TAP SHA-256: `7b071c69b87e61231e186143371886a2f16af5de41a576d67524afe405d67729`.
- `node --check` 2/2 PASS.

This validates the synthetic envelope contract only. It is not an external KMS/HSM integration, a real escrow backup, a Cloudflare secret binding, or a production restore drill. No real key was generated or stored. The target architecture decision is now APPROVED; concrete custody/restore implementation and acceptance remain OPEN.


## 9. Owner approval record — 2026-11-08

The project owner approved this document's target architecture as the C2 design baseline, limited to:

- Dedicated cryptographic service Worker; business control-plane Worker never receives raw key bytes.
- Private Worker Service Bindings only; caller authentication/authorization must occur before the internal call; no public key-operation endpoint.
- Per-Worker secret bindings as the default; Cloudflare Secrets Store only if a demonstrated multi-Worker sharing requirement exists. Secrets Store is not treated as an HSM/KMS.
- Independent encrypted key escrow outside Cloudflare, GitHub and Notion, with two-person recovery/revocation. The concrete wrapping provider or offline recovery mechanism is not yet selected.
- Separate key material and domains for idempotency HMAC, provider-event HMAC, PII HMAC and any separately approved future AES purpose.
- Active-write / retained-read rotation, evidence-based retirement and fail-closed behavior.
- No first-party Portal/Admin TOTP AES key provisioning under the already-approved T1/Auth0-managed MFA direction.

Not included in this approval:
- Wallet-first digest compatibility, delivered-row replay/retention duration, or domain-specific retention policy.
- Named individual custodians or domain-owner sign-offs.
- Selection or provisioning of a real KMS/HSM, external escrow, Cloudflare secret, Worker binding, Crypto Worker or Durable Object.
- Production key generation, BWH access, D1 mutation, deployment, dual-write, cutover or change of production write authority.

The synthetic escrow contract has passed 10/10 twice under Node v22.23.1. This is a synthetic envelope test, not a real external backup or recovery drill. C2 remains OPEN until the remaining implementation, domain approvals, recovery proof and independent review gates pass.

BWH remains the only production control-data writer.

## 10. Owner decision — Cloudflare-native online custody and offline 2-of-3 escrow

On 2026-11-08, the project owner approved the concrete C2 route:

- Online runtime secrets: Cloudflare per-Worker Secrets, bound only to the dedicated Crypto Worker. No separate GCP, AWS, Azure, or other KMS cloud account will be created for this requirement.
- Internal calls: private Worker Service Binding only, after caller identity and domain authorization. No public crypto endpoint and no raw key return.
- Offline recovery: AES-256-GCM encrypted key envelope plus a unique 256-bit recovery KEK per envelope, split using Shamir Secret Sharing with a 2-of-3 threshold.
- The encrypted envelope and metadata-only manifest are held in two independent offline physical locations. Three distinct named custodians hold one share each; no person holds two shares.
- Cloudflare Secrets Store remains unnecessary unless a real multi-Worker sharing requirement is demonstrated; it is not an HSM/KMS.
- The existing synthetic escrow helper remains synthetic-only. A vetted, pinned Shamir implementation and a separately reviewed offline utility must pass synthetic threshold/recovery tests before any real key is generated.

The implementation and operational boundaries are specified in [D1_T2_C2_OFFLINE_ESCROW_RUNBOOK_V1.md](D1_T2_C2_OFFLINE_ESCROW_RUNBOOK_V1.md). This decision selects the architecture, not the Shamir software, individual custodians, physical custody locations, or real provisioning.

No real key, recovery KEK, share, Cloudflare secret, binding, Worker deployment, external account, D1 mutation, BWH access, or production operation is authorized. C2 remains OPEN pending the runbook acceptance gates, domain-owner approvals, and independent review. BWH remains the only production control-data writer.
