# JP-01 R2 Image Verification Gate

Last updated: 2026-11-03, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: jp01_r2_image_verification_gate
  superseded_by: null
  last_verified_at: 2026-11-03
  production_authority: false
```

## Gate classification

- Risk: A — authenticated access to a Cloudflare infrastructure provider, even though the approved command set is read-only.
- Process: exact-target read-only inventory, explicit operator approval, ephemeral GitHub Actions secret injection, allowlisted S3-compatible read calls, redacted validation, and runner cleanup.
- Expected PR count: one focused PR with the JP-01 dry-run source and this independent R2 verification workflow.
- Production/AWS/Vultr impact: no production mutation, no AWS access, no Vultr API, no instance creation, no installation, and no runtime activation.
- Operator authorization: the operator explicitly requested the R2 GitHub Actions test on 2026-11-03. This authorization is limited to the exact read-only operations below.

## Target and credential

- Provider: Cloudflare R2.
- Account: 17d66c001f9d851fa0d5a88cd311c2c0.
- Bucket: jp01-images.
- Endpoint: https://17d66c001f9d851fa0d5a88cd311c2c0.r2.cloudflarestorage.com.
- GitHub Environment: jp01-image-verify, deployment branch restricted to master.
- Credential logical ID: R2_READ_ACCESS_KEY_ID + R2_READ_SECRET_ACCESS_KEY.
- Credential source: GitHub Environment Secrets; injected only into the one authenticated verification step.
- Provider-side permission readback (2026-11-03): the active account-owned token named `jp01-images-read-github` has permission group `Workers R2 Storage Bucket Item Read` and its policy resource is exactly `com.cloudflare.edge.r2.bucket.17d66c001f9d851fa0d5a88cd311c2c0_default_jp01-images`. This confirms the Cloudflare-side read-only permission and bucket scope.
- GitHub secret binding: GitHub does not reveal the stored Environment Secret values. Their association with the Cloudflare token remains pending the hosted T2 authentication test; secret names alone are not proof of binding.
- Separate upload credential: `jp01-images-upload-02` was also active at readback, with `Workers R2 Storage Bucket Item Write` scoped to the same bucket. It is not used by this workflow and should be revoked by the operator after upload completion.
- Non-sensitive variables: R2_ACCOUNT_ID, R2_BUCKET, R2_ENDPOINT, R2_REGION.

## Exact object scope

- Image object: jp-01/c0/2026-11-02/jp01-candidate-1.img.zst.
- Image expected size: 2269994633 bytes.
- Checksum sidecar: jp-01/c0/2026-11-02/jp01-candidate-1.img.zst.sha256.
- Sidecar expected size: 92 bytes.
- Expected SHA-256 is read from ops/node-provisioning/profiles/jp-01.json (image.artifactSha256); the sidecar filename is checked against image.artifactFileName.

## Allowed commands and operations

1. Unauthenticated DNS/TLS/HTTP preflight against the exact R2 S3 endpoint.
2. aws s3api head-object for the exact image key.
3. aws s3api head-object for the exact checksum-sidecar key.
4. aws s3api get-object for the checksum-sidecar key only.
5. Local parsing of the 92-byte sidecar and comparison to the reviewed JP-01 profile.
6. Write a bounded, non-secret GitHub Actions step summary.

The workflow is manual-only, has contents: read, uses a SHA-pinned checkout action with persist-credentials: false, and runs only on refs/heads/master through the dedicated Environment.

## Forbidden operations

- No bucket listing, account inventory, object listing, upload, overwrite, copy, delete, bucket mutation, lifecycle mutation, or public access change.
- No full-image download in this smoke test.
- No Cloudflare management API token.
- No Vultr API, SSH/SCP/rsync, rescue boot, disk write, C1 installation, WireGuard key/tunnel changes, Agent registration, or production mutation.
- No secret values in logs, artifacts, step summaries, PR text, or source files.
- Do not weaken the Environment branch restriction to run this workflow from a feature branch.

## Validation and stop conditions

The workflow passes only if all of the following are true:

- The four Environment variables match the reviewed account, bucket, endpoint, and region.
- The endpoint responds over TLS without credentials.
- Both exact objects are readable with HeadObject.
- Image ContentLength is exactly 2269994633.
- Sidecar ContentLength and downloaded byte count are exactly 92.
- The sidecar SHA-256 and filename exactly match the profile.
- No credentials or unrelated provider data are emitted.

Stop immediately on missing secrets/variables, endpoint mismatch, network/TLS failure, missing AWS CLI, authentication/authorization failure, missing object, size mismatch, sidecar mismatch, or any unexpected response. Do not retry under the same approval after a failed gate; diagnose the cause and obtain a new exact approval if the credential, target, or command scope changes.

## Cleanup and evidence limits

- Use one GitHub Actions step for credential-bearing commands.
- Mask the two secret values, disable shell tracing, use empty temporary AWS config/credentials files, and remove those files plus the downloaded sidecar in an EXIT trap.
- Unset AWS access-key environment variables before the step exits. The hosted runner is ephemeral; no credential is written to the repository or an Agent workstation.
- The Environment Secrets remain configured by design and must be rotated/revoked separately when the operator decides.
- A successful run proves authenticated access to the exact R2 objects, image metadata size, and sidecar/profile agreement. It does not prove the full compressed image bytes match the SHA-256. Full independent image download and SHA-256 verification is a separate, higher-bandwidth validation gate.
- A successful R2 check does not change artifactAvailableToRunner, C1 readiness, Vultr authorization, first-boot approval, WireGuard/Agent status, or production state.
