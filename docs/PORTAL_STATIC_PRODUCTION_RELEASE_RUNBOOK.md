# Portal Static Production Release Gate

Last updated: 2026-08-14, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_static_production_release
  superseded_by: null
  last_verified_at: 2026-08-14
  production_authority: false
```

> Status:
> - Release unit: `portal-static`; `frontend_surface: portal`.
> - Risk: A for every inventory, host, Vercel, DNS, Nginx, file, pointer, or
>   public-endpoint action.
> - Execution authority: None. This runbook defines the next exact approval
>   packet; it does not authorize an inventory, deployment, promotion, or
>   rollback.

## Purpose and fixed boundary

Use this runbook to promote one verified Portal static artifact through the
confirmed delivery chain:

```text
Vercel DNS/CNAME binding -> Vultr Japan Nginx -> existing Portal static root
```

The fixed public name is `portal.gccwebos.com`. Before any mutation, a fresh
read-only inventory must prove the exact effective Nginx server block and the
one static root it serves for that name. Do not infer the target from an old
release directory, a local build, or a similarly named site.

This is a **static-only** release. It may create an immutable static release
directory and atomically move the static `current` pointer. It must not change
Vercel configuration or DNS, Nginx configuration or reload state, the
control-plane application, systemd, runtime/node configuration, database,
payment/provider state, credentials, account data, or subscription material.

It does **not** apply or activate wallet-first, any wallet-first schema,
deferred runtime, Account Resource Authority, a payment provider, or an
end-user credential flow. A Portal UI deployment is not evidence that any of
those capabilities is live.

## Required exact inputs

The approved execution packet fills these safe identifiers; do not put raw
configuration, credentials, provider tokens, subscription URLs, or customer
data in this document or its receipt.

| Input | Required proof |
| --- | --- |
| `source_commit` | Full merged `master` commit that exactly equals `artifact.json.sourceCommit`. |
| `artifact_zip`, `artifact_sha256`, `artifact_manifest` | A retrievable `portal-static` ZIP, its SHA-256, and manifest with `releaseUnit: portal-static`. GitHub Actions retention alone is insufficient. |
| `release_id` | New, unique immutable identifier; it is never reused for a retry. |
| `portal_static_root` | Exact existing static-root path selected by the effective Vultr Nginx configuration for `portal.gccwebos.com`. |
| `releases_dir`, `current_link`, `backup_root` | Paths derived from `portal_static_root`; they must be on the approved host and supplied in the execution packet. |
| `previous_release` | Fully resolved current pointer target, within `releases_dir`, before the switch. |
| `candidate_release` | A new directory directly under `releases_dir`, named from `release_id`; it must not exist before assembly. |
| `rollback_artifact` | A durable, verified backup of `previous_release`, independently retrievable throughout the rollback window. |

`portal_static_root`, `releases_dir`, `current_link`, and `backup_root` are
parameters, not defaults. Do not substitute a historical path from an old
Aliyun record or a local workspace path.

## Gate 0 — fresh read-only identity inventory

The operator performs only approved read-only checks and records aggregate
results in the approval packet:

1. Verify the Vercel DNS/CNAME binding for `portal.gccwebos.com`, its current
   public resolution, and that the expected Vultr serving path is selected.
2. Verify the effective Vultr Nginx configuration maps that host to exactly
   one Portal static root. Record only the safe logical mapping result, not
   raw Nginx configuration.
3. Verify that the effective root and resolved target are expected real
   directories, and that `current_link` is the one expected symlink;
   `current_link` must resolve inside `releases_dir` to `previous_release`.
4. Verify that the current anonymous Portal HTML entry and one asset referenced
   by it are publicly retrievable. Do not log in, call Portal APIs, create an
   order, recharge, reveal material, or exercise authenticated functionality.
5. Verify that `backup_root` is independently durable, writable only by the
   approved operator, and is not the candidate release directory or a
   short-lived CI artifact location.

Stop before approval if the DNS-to-Nginx-to-root mapping is ambiguous, if more
than one root could serve the host, if the current pointer does not resolve to
one release, or if the current static entry cannot be identified safely.

## Gate 1 — artifact and rollback admission

Before placing bytes in the serving tree, the approved operator must:

1. Verify the ZIP SHA-256 against both the approved value and
   `artifact.json`; verify `releaseUnit`, full `sourceCommit`, artifact name,
   and size. The ZIP must be retrievable from durable storage for the entire
   deployment and rollback window.
2. Verify the archive before extraction: no absolute paths, traversal paths,
   links, unexpected executable content, secrets, configuration overlays, or
   files outside the Portal static package. Verify the expected `index.html`
   and its referenced static assets are present.
3. Create a durable backup of `previous_release` under `backup_root`, including
   a backup manifest with the prior release identity, file inventory, SHA-256,
   creation time, and restoration-readback result. The backup must be verified
   before the pointer can move.
4. Retain `previous_release` unchanged in `releases_dir`; the backup is an
   additional recovery proof, not permission to delete the live prior release.

If any artifact, manifest, checksum, archive, or backup proof differs, stop.
Do not repair the input in place or use an unverified Actions artifact as the
only rollback source.

## Gate 2 — immutable static assembly and atomic promotion

This phase is allowed only after an explicit Risk A approval that names the
exact inputs above and permits the two static filesystem mutations below.

1. Extract the verified ZIP into `candidate_release` only. The directory must
   be newly created, non-symlinked, and immutable after its final file
   inventory/checksum readback. Do not extract into `current_link` or
   `portal_static_root` directly.
2. Recheck that `candidate_release` has the intended Portal HTML entry and
   referenced asset set, and that it is still bound to the verified artifact
   manifest and source commit.
3. Re-read `current_link`; it must still resolve to the approved
   `previous_release`. Any pointer drift stops the promotion.
4. Create a temporary replacement pointer beside `current_link`, verify it
   resolves exactly to `candidate_release`, then rename that pointer over
   `current_link` on the same filesystem. This is the sole publish operation:
   an atomic pointer switch, not a copy-over, deletion, Nginx reload, or
   service restart.
5. Read back the resolved `current_link` immediately. It must equal
   `candidate_release` exactly; retain both the candidate and previous release
   plus the verified backup.

The approval must forbid a recursive overwrite of the live root, a change to
Nginx/Vercel/DNS, and any cleanup during the validation window.

## Gate 3 — static-only acceptance

After the pointer switch, validate only the static surface:

- `current_link` still resolves to `candidate_release`, and the prior pointer
  target remains available for rollback.
- The anonymous `https://portal.gccwebos.com/` response is successful,
  identifies the candidate HTML entry, and matches the expected static content
  type and asset references.
- At least one candidate asset referenced by that HTML is successfully served
  and matches the candidate artifact fingerprint or content hash.
- A repeat public static read produces the same candidate identity; any CDN or
  cache behavior that prevents that proof is a failed acceptance, not a reason
  to infer success.

Do not use login, `/api/*`, wallet balance, recharge, checkout, order,
subscription, credential, or database probes as this release's acceptance
criteria. Those belong to separately approved application or commercial gates.

## Stop and rollback

- Before the pointer switch: stop with no publish mutation. Preserve evidence
  needed to correct the approval packet; do not delete or overwrite releases.
- After the pointer switch: if any static-only acceptance check fails, do not
  make a second candidate. The operator must atomically point `current_link`
  back to the exact `previous_release`, then repeat the same static-only
  readback for the restored release.
- The original approval must explicitly include this pointer-only rollback
  threshold and target. If it does not, stop and obtain a separate exact
  rollback approval. Database restoration, application rollback, Nginx/DNS
  change, cache purge, and credential action are outside this runbook.
- Keep `candidate_release`, `previous_release`, and the durable backup intact
  until the approved retention window closes. Cleanup is a later, separately
  approved action.

## Required Deploy Note after a successful release

Add a concise Deploy Note to the related PR only after acceptance passes:

```yaml
deployed_at: <UTC timestamp>
release_unit: portal-static
frontend_surface: portal
source_commit: <full commit>
artifact_or_release: <artifact name and release_id>
target: vultr-japan-control / portal static root
backup: <verified backup identity>
validation: <static-only pointer, HTML, and asset results>
```

The note records no raw paths, hashes beyond the approved artifact identity,
configuration, credentials, customer data, or claims of wallet-first/schema/
credential activation.

## Related contracts

- `RELEASE_MANIFEST.md` — source, artifact, release, and production gate model.
- `docs/CURRENT_RELEASE_STATE.md` — current documented state; it does not
  replace the fresh inventory required here.
- `docs/INFRASTRUCTURE_ACCESS_RULE.md` — provider-access, ephemeral credential,
  command-allowlist, and redacted-output requirements.
- `admin/README.md` — Portal source/build ownership only, not deployment
  authority.
