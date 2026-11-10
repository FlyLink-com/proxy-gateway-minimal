# D1 T2-C2 External Key Escrow Provider Evaluation v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: d1_t2_c2_external_escrow_provider_evaluation
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```


> Status: SOURCE-ONLY EVALUATION. No external provider is selected or approved by this document. No cloud account, KMS/HSM key, escrow object, credential, or production resource is created.
> Evaluation date: 2026-11-08.
> Architecture approval: C2 target architecture approved by project owner on 2026-11-08.
> Production authority: BWH remains the only production control-data writer.

## 1. Decision to be made

C2 requires an independently recoverable encrypted escrow copy of each production HMAC key family. The escrow must be outside Cloudflare, GitHub, and Notion. The wrapping key must be controlled by a separate provider/account and must not be stored beside the wrapped key material.

The synthetic escrow contract already proves the local envelope shape. It does not select or integrate a real KMS/HSM. This evaluation compares provider classes and defines the acceptance contract without provisioning resources.

## 2. Required properties

A candidate must satisfy all of the following:

1. **Independent custody:** separate provider account/organization from Cloudflare and the application repository; not hosted on BWH.
2. **Non-exportable KEK:** the key-encryption key (KEK) remains inside the KMS/HSM boundary. The application stores only the wrapped 32-byte HMAC key ciphertext and public metadata.
3. **Authenticated metadata binding:** encryption context/AAD binds the escrow blob to project, key family, key ID, algorithm, escrow format version, and wrapped timestamp. These fields are non-secret metadata; never put PII, raw keys, or credentials in AAD because some providers record the context in audit logs.
4. **Separation of duties:** key administrators cannot use/decrypt the key by default; key users cannot administer, rotate, disable, or delete the KEK.
5. **Two-person recovery:** a custodian cannot approve and execute the same recovery alone. The approval record and execution identity are distinct and auditable.
6. **Auditability:** key creation, policy changes, encrypt, decrypt/unwrap, disable, rotation, and deletion attempts are logged and retained outside the application.
7. **Recovery portability:** the encrypted escrow blob and its non-secret manifest can be backed up in at least two independent locations outside Cloudflare/GitHub/Notion.
8. **Revocation:** emergency removal of decrypt permission and disabling the KEK are documented and tested. Runtime HMAC-key compromise is handled separately by Crypto Worker key rotation/revocation.
9. **No runtime decrypt permission:** the Crypto Worker and business control-plane Worker must never receive permission to decrypt escrow. Escrow is for controlled recovery only.

## 3. Candidate comparison

| Candidate | Relevant capabilities | Strengths | Constraints / risks | Assessment |
| --- | --- | --- | --- | --- |
| Google Cloud KMS | Envelope encryption; KEK remains in Cloud KMS; AAD; key-manager vs key-user role separation; Cloud Audit Logs; software or HSM protection levels | Strong documented separation-of-duties model and clear AAD binding; dedicated key project can be separated from application projects | Requires an independently administered Google Cloud organization/project; two-person recovery still needs a separate approval workflow; provider/account recovery becomes critical | **Leading technical candidate** if no existing independent KMS account is already preferred |
| AWS KMS | Symmetric Encrypt/Decrypt; encryption context; key policies; distinct key-administrator and key-user roles; CloudTrail | Mature policy model; 32-byte HMAC key is comfortably below the 4,096-byte Encrypt limit; context is cryptographically bound to ciphertext | A KMS decrypt permission is still usable by its holder; two-person approval must be enforced by separate identities and a controlled temporary-access workflow | **Equivalent alternative** if an existing separate AWS organization/account is available |
| Azure Key Vault / Managed HSM | WrapKey/UnwrapKey; non-exportable service-held keys; Crypto Officer/User roles; soft delete and purge protection; HSM-backed options | Clear wrapping operations and recovery controls; HSM protection available for high-security use | Backup/restore and purge controls are subscription/tenant scoped; operational fit depends on an existing Azure tenant and role design | Good alternative if the project already has an independently governed Azure tenant |
| HashiCorp Vault Transit | Encryption-as-a-service, key versioning and rewrap; exportability can be disabled | Provider-neutral API and flexible key lifecycle | A self-hosted Vault on BWH is not independent escrow; a separately hosted HA Vault adds operational, backup, and upgrade responsibility | Conditional only if already operated as an independent managed service |
| Offline encrypted escrow | Encrypted ciphertext file plus offline recovery material held by separate custodians | No dependency on another cloud account; can be a secondary disaster-recovery copy | Manual audit, access, custody, hardware loss, and recovery controls; two-person process is operational rather than provider-enforced | Secondary fallback copy, not preferred as the only primary escrow mechanism |

### 3.1 Technical recommendation

Prefer an **external managed KMS with a dedicated symmetric KEK**, non-exportable key material, separate key-admin/key-user roles, audit logs, and an explicit two-person break-glass approval process.

- Google Cloud KMS is the leading technical candidate when there is no existing independent KMS account, because its documentation explicitly describes key-manager/key-user separation, dedicated key projects, AAD, and audit logging.
- AWS KMS is equally acceptable if a separately administered AWS organization/account already exists. Use a symmetric KMS key with Encrypt/Decrypt and a non-sensitive encryption context; do not give the Crypto Worker a KMS permission.
- Azure Key Vault is reasonable when an independently governed Azure tenant already exists.
- Do not create a new cloud account solely from this evaluation. First establish which external provider account is already available and who independently controls it.

This is a technical recommendation, not a vendor selection or owner approval. No provider is selected in this version.

## 4. Proposed escrow envelope

The actual HMAC key remains 32 bytes of CSPRNG-generated material. It is generated in the approved secure key-generation environment, then wrapped by the external KMS KEK.

The encrypted escrow artifact contains:

- wrapped ciphertext returned by the external KMS;
- KMS provider, account/project, region, and KEK resource identifier;
- key family and immutable key ID;
- algorithm and key length;
- escrow envelope version;
- canonical AAD/encryption-context version and non-secret values;
- ciphertext SHA-256 checksum;
- generation and wrapping timestamps;
- custodian role identifiers and escrow lifecycle status.

It must not contain raw key bytes, plaintext key copies, raw PII, service tokens, or any credential.

Use a canonical, versioned AAD/encryption-context object binding at minimum:

- project = flylink;
- family = one exact allowlisted key family;
- keyId = immutable key ID;
- algorithm = HMAC-SHA-256;
- keyLengthBits = 256;
- escrowFormat = v1;
- wrappedAt = the recorded wrapping timestamp.

AAD/encryption-context values are metadata, not secrets. Do not put account email, IP, idempotency values, or other PII in them.

For AWS KMS, the symmetric encryption context is authenticated additional data and must match exactly at decrypt time; it is visible in CloudTrail and must contain no sensitive information. For Google Cloud KMS, AAD must match at decrypt time and is not stored in the ciphertext, so the manifest must preserve the exact canonical value.

## 5. Two-person recovery protocol

The minimum role separation is:

- **Key Custodian:** maintains the escrow inventory and initiates a recovery request; does not self-approve.
- **Security Approver:** independently approves or rejects the recovery; cannot use the KEK alone merely by approving.
- **Recovery Operator:** executes the temporary decrypt/unwrap operation after approval; cannot approve their own request.
- **KMS Administrator:** manages the KEK lifecycle and IAM policy; must not have standing decrypt permission.

The actual people assigned to these roles must be recorded by the project owner; this document does not invent names.

Recovery sequence:

1. Open a time-bounded recovery ticket with purpose, family, key ID, affected environment, requested operations, and expiry.
2. Obtain approval from two distinct authorized people. The initiator cannot be either sole approver and cannot self-approve.
3. Grant a short-lived decrypt/unwrap permission to the designated Recovery Operator only after approval. Record the policy/grant change.
4. Restore the encrypted artifact and manifest into an isolated non-production recovery environment.
5. Decrypt only in memory. Verify key ID, family, algorithm, key length, canonical AAD, family separation, and the synthetic known-answer HMAC vectors.
6. Do not write plaintext key material to disk, logs, D1, KV, R2, GitHub, Notion, or test artifacts. Do not provision it to a Worker during a rehearsal.
7. Destroy in-memory key material, revoke the temporary permission, and verify the revocation.
8. Record only metadata, approvers, operator, timestamps, KMS audit-log reference, test result, and ciphertext checksum.

A provider's role separation is necessary but is not by itself proof of a two-person approval workflow. The external approval gate and temporary access grant must be demonstrated in the selected provider.

## 6. Rotation and incident handling

KEK rotation and HMAC-key rotation are different operations:

- **KEK rotation:** rewrap the existing escrow ciphertext under the new KEK, preserve the HMAC key bytes and immutable key ID, verify the new ciphertext, and retain the old KEK until every escrow copy is rewrapped and a restore rehearsal passes.
- **HMAC rotation:** generate a new HMAC key ID and material, write with the new key, retain old keys for reads while dependent rows/replay windows remain, and retire only after source retention evidence and owner approval.
- **KEK compromise:** revoke decrypt/unwrap access, disable or replace the KEK as appropriate, and restore from an independently protected escrow copy. A KEK incident does not automatically rotate the live HMAC key.
- **HMAC-key compromise:** rotate the affected HMAC family and reconcile dependent rows/replay behavior. Escrow recovery must not silently re-enable a compromised HMAC key.

No Worker runtime identity receives KMS Decrypt/Unwrap permissions. The Crypto Worker receives only the final per-Worker HMAC key-ring secret bindings after a separately authorized provisioning process.

## 7. Acceptance gates before real provisioning

- [ ] Owner selects the external provider and dedicated account/project/tenant.
- [ ] Named Key Custodian, Security Approver, Recovery Operator, and KMS Administrator are recorded as distinct accountable people/roles.
- [ ] KEK algorithm, protection level (software or HSM), region, key policy, and key lifecycle are approved.
- [ ] Key administrators and key users are separated; no routine identity has both roles.
- [ ] Two-person recovery is enforced by a separate approval workflow and short-lived decrypt permission.
- [ ] Audit logging for key use, policy changes, and recovery is enabled and independently retained.
- [ ] Encrypted escrow ciphertext has two independent backup locations; the manifest contains metadata only.
- [ ] Non-production recovery proves AAD binding, key-family separation, HMAC known-answer verification, and access revocation.
- [ ] Recovery does not write plaintext key material to disk, logs, D1, KV, R2, GitHub, or Notion.
- [ ] Independent reviewer accepts the exact evidence before any real production key is generated or provisioned.

## 8. Non-authorization and current status

This evaluation does not authorize:

- selecting or creating a new external cloud account;
- creating a KMS/HSM key or policy;
- generating, importing, wrapping, or provisioning real HMAC key material;
- creating a Cloudflare secret, Worker Service Binding, or deployed Crypto Worker;
- BWH access, production data reads, D1 writes, dual-write, or cutover.

The C2 target architecture is approved. The external provider, account, named custodians, two-person workflow, and real recovery proof remain OPEN. The synthetic escrow envelope test remains synthetic-only. C2 is not closed; T2 remains BLOCKED; BWH remains the only production control-data writer.

## 9. Official provider references

- Google Cloud KMS envelope encryption: https://cloud.google.com/kms/docs/envelope-encryption
- Google Cloud KMS separation of duties: https://cloud.google.com/kms/docs/separation-of-duties
- Google Cloud KMS additional authenticated data: https://cloud.google.com/kms/docs/additional-authenticated-data
- Google Cloud KMS audit logging: https://cloud.google.com/kms/docs/audit-logging
- AWS KMS Encrypt API (4,096-byte limit and encryption context): https://docs.aws.amazon.com/kms/latest/APIReference/API_Encrypt.html
- AWS KMS role-based access control: https://docs.aws.amazon.com/kms/latest/developerguide/rbac.html
- AWS KMS encryption context: https://docs.aws.amazon.com/kms/latest/developerguide/encrypt_context.html
- AWS KMS CloudTrail logging: https://docs.aws.amazon.com/kms/latest/developerguide/logging-using-cloudtrail.html
- Azure Key Vault key operations and non-exportability: https://learn.microsoft.com/en-us/azure/key-vault/keys/about-keys-details
- Azure Key Vault recovery and purge protection: https://learn.microsoft.com/en-us/azure/key-vault/general/key-vault-recovery
- HashiCorp Vault Transit: https://developer.hashicorp.com/vault/docs/secrets/transit

## 10. Superseding owner decision — offline 2-of-3 escrow selected — 2026-11-08

This document remains a historical source-only comparison of managed KMS/HSM and offline options. The project owner has since selected **offline encrypted escrow with 2-of-3 recovery** as the C2 implementation route because no independent key-custody cloud account is available and a new cloud account is not required for this project.

Consequences:

- Google Cloud KMS, AWS KMS, Azure Key Vault/Managed HSM, and HashiCorp Vault Transit are not selected. No account or provider resource will be created for this requirement.
- Cloudflare per-Worker Secrets provide online runtime secret custody for the dedicated Crypto Worker. They are not described as an HSM/KMS and do not replace independent recovery.
- Each runtime key envelope is wrapped with AES-256-GCM under a unique 256-bit recovery KEK. The KEK is split with a vetted Shamir Secret Sharing implementation using a 2-of-3 threshold.
- The encrypted envelope and metadata-only manifest are stored in two independent offline physical locations. Three distinct named custodians hold one share each.
- The concrete Shamir tool/version/hash, named custodians, and physical custody locations remain OPEN. The synthetic escrow contract is not a production key-management utility.

Use [D1_T2_C2_OFFLINE_ESCROW_RUNBOOK_V1.md](D1_T2_C2_OFFLINE_ESCROW_RUNBOOK_V1.md) as the current implementation and acceptance contract. This superseding decision does not authorize real key generation, share creation, Cloudflare secret provisioning, binding creation, deployment, BWH access, D1 mutation, or production cutover. C2 remains OPEN; T2 remains BLOCKED; BWH remains the only production control-data writer.
