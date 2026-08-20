# 2026-06-06 Aliyun Portal Auth Runtime Upgrade


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_portal_auth_runtime_upgrade
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


## Scope

- Risk: A
- Target: Aliyun candidate runtime only
- Release: `portal-auth-runtime-20260606-001`
- Previous release: `ae68072d727b`
- Artifact: `.codex-artifacts/proxy-gateway-portal-auth-runtime-20260606-001.zip`
- Approved archive SHA-256:
  `52A6703A2C6E07C5AB870D40CB997565A0F235138C8035F09BFD1B26C2804496`

## Guardrails

- Runtime env: no mutation.
- Nginx: no config mutation; `nginx -t` validation only; no reload.
- Mihomo: no config mutation; no start/restart of `mihomo-tuic.service`.
- No DNS, firewall/security group, payment, account/password generation,
  passkey enablement, subscription token/URL output, SQLite row dump,
  `sub.globalcirclecat.com` behavior change, `ss-sg` change, or AWS mutation.
- No live order creation during validation.

## Execution

1. Verified local artifact SHA-256 matched the approved value.
2. Verified current Aliyun candidate release was `ae68072d727b`.
3. Uploaded the approved artifact to the Aliyun host.
4. Reverified artifact SHA-256 on the host before extraction.
5. Extracted the artifact into the candidate releases directory.
6. Installed production dependencies for the new release.
7. Ran syntax checks for the portal runtime entry files.
8. Atomically switched the candidate `current` symlink to
   `portal-auth-runtime-20260606-001`.
9. Restarted `proxy-gateway-candidate.service` only.

The first extraction attempt stopped before symlink mutation because `unzip` was
not installed on the host. The empty target release directory was confirmed and
removed, then extraction was retried with `python3 -m zipfile`.

## Validation

- Current release: `portal-auth-runtime-20260606-001`
- `proxy-gateway-candidate.service`: active, result success
- `mihomo-tuic.service`: active; not restarted by this change
- `nginx -t`: ok
- `https://sub.globalcirclecat.com/api/health`: 200
- `https://portal.globalcirclecat.com/`: 200
- Portal-host Admin API boundary check: 404
- `POST /api/portal/human-challenges`: 201, response shape ok
- `POST /api/portal/password/session` with an empty request: 400
  `human_verification_failed`, not `Unauthorized`
- Live order creation: not called

## Rollback

Rollback remains available by restoring the candidate `current` symlink to
`ae68072d727b` and restarting `proxy-gateway-candidate.service`.
