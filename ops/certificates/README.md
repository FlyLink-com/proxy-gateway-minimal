# Runtime certificate renewal synchronization

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: runtime_certificate_renewal_sync
  superseded_by: null
  last_verified_at: 2026-09-19
  production_authority: false
```

Risk: A when installed or invoked against production. Source/tests/runbook stay in
one PR. Release units: `japan-runtime-config` and `sgp-runtime-config`.
`identity_impact: false`. This directory grants no production authority by itself.

## Purpose and boundary

This directory is the maintained source for the bounded hook and its synthetic
tests. Dated certificate replacement receipts elsewhere are historical evidence,
not the current executable or a deployment authorization. Never copy private keys,
production configs, credentials, or raw logs into this directory. Start with the
repository entry sequence, then the installation gate below.

Certbot maintains `/etc/letsencrypt/live/<domain>`, while TUIC and Hysteria2 read a
separate pair in `/etc/mihomo/tls/<domain>`. Renewing the former does not update
the latter. The deploy hook bridges that exact boundary after a successful
renewal; it is not another scheduler or an application deployer.

Only `jp.gccwebos.com` and `sgp.gccwebos.com` are supported, with one exact domain
selected in each host's root-owned wrapper. Other Certbot lineages are ignored.
The only service mutations allowed are restarts of `mihomo-tuic.service` and
`hysteria2.service`, and only if both were already running and the verified
certificate pair actually changed. Xray, backend, Nginx, billing, identities,
collectors, DNS, and listener configuration are not modified by the helper.

The existing Certbot authenticator may temporarily reload Nginx during ACME
validation. That is separate from this hook. No TLS-verification bypass,
application credentials, new Python packages, or backend dependency is required.

## Safety contract

- Match Certbot's exact `RENEWED_LINEAGE` to the configured domain before any
  mutation. Never treat caller-supplied paths as arbitrary copy destinations.
- Validate source ownership/permissions and archive containment, trusted chain,
  hostname, remaining validity, full-chain composition, and key-pair match.
- Validate the fixed consumer config paths, runtime file types/permissions, and
  service state. Preserve runtime ownership and permissions; current certificates
  are intentionally owned by the `proxy-gateway` service account.
- Serialize using a root-controlled lock. Use safe filesystem operations on
  service-owned target directories and root-only state/backup storage.
- Exact identical pair: return a successful no-op without restarting services.
- Changed pair: verify a host-local backup first, record an in-progress marker,
  replace the pair, restart only the two running consumers, and verify stability.
- Copy/restart/readback failure: restore and verify the previous pair and
  service state; return failure even when rollback succeeds. An uncertain
  rollback or a hard-interruption marker requires operator inspection, not
  automatic replay. A backup certificate may be expired; restoration alone is
  not proof of valid TLS.
- Emit only sanitized state/error summaries. Never print private key bytes,
  raw service configuration, customer identifiers, or command stderr.

## Planned installation and exact gate

User authorization must cover the two exact node targets, source/artifact
identity, hook paths, validation and rollback. Do not copy a helper from an
unreviewed working tree or skip the repository source/artifact gates.

1. Fresh read-only inventory: existing renewal options/timer, source/runtime
   fingerprints, ownership, consumers, service PIDs and absence of conflicting
   helper/hook files. Runtime PEM files and their directory must not require
   extended ACLs or security labels: replacement preserves uid/gid/mode, not
   xattrs. Stop if such metadata is present. Reuse prior evidence only within
   the same boundary.
2. Validate the exact helper/test head locally and on isolated Linux temporary
   files with synthetic certificates and mocked service commands. No production
   `.env`, private key, runtime config or customer record is used in fixtures.
3. Preserve a root-only server backup/receipt. Install the reviewed helper at
   `/usr/local/libexec/gccgw-runtime-certificate-sync.py` (root:root 0755), and
   the node-specific wrapper at
   `/etc/letsencrypt/renewal-hooks/deploy/50-gccgw-runtime-certificate` (root:root
   0755). Extract the helper and template from the exact reviewed Git commit,
   preserving LF endings; render only the allowlisted node domain. Both files
   must have the expected SHA-256; do not overwrite conflicts.
   The helper uses `/var/lib/gccgw-certificate-sync/<domain>` for protected state.
4. Wrapper uses absolute `/usr/bin/python3 -I`, the installed helper, the exact
   node domain and `--apply`. No untrusted shell interpolation. It receives
   `RENEWED_LINEAGE` / `RENEWED_DOMAINS` from Certbot.
5. Run `--check-only`, then invoke the installed wrapper twice with the current
   exact lineage. Since the runtime pair is already current, both executions
   must be no-ops with unchanged certificate bytes and service PIDs.
6. Run only the selected lineage's `certbot renew --cert-name <domain> --dry-run
   --run-deploy-hooks`. This uses the current live certificate for the deploy
   hook, not the staging certificate. Verify a no-op hook result and unchanged
   runtime/service identities. No broad renewal of retired domains.
7. Verify each node's actual QUIC TLS endpoints using strict trusted-CA,
   hostname and expected leaf-fingerprint checks; no user authentication needed.
   Record the precise source/artifact, target, backup, result and limitations in
   a Deploy Note.

## Failure visibility and rollback

The hook's sanitized output is captured by Certbot/systemd logs and a nonzero
hook result must not be called successful. Inspect the hook result, not merely
whether ACME issuance succeeded. No email/third-party alert channel is added.
After an error, fix its cause under the applicable gate and explicitly verify
the existing renewed source against the runtime copy; Certbot need not issue
another certificate. A deploy hook is not a periodic retry worker.

To roll back this integration, first inventory any pending state and verify the
installed file identities. Remove only this exact owned wrapper and helper,
or restore their recorded previous versions if any. Leave current valid
certificates and Certbot timer/renewal configuration intact; disabling the hook
requires no service restart. Do not remove protected backups or pending records
until their recovery state has been resolved.

## Validation

```text
python -m unittest discover -s ops/certificates -p test_runtime_certificate_sync.py -v
git diff --check
```

Linux-specific locking, ownership, safe-path and filesystem tests must run on
Linux; a Windows run with skipped cases is not the complete gate. Runtime
readback remains a separate production check. This operational-only component
does not change application code or claim full application CI as evidence.

Certbot reference: [renewal hooks and dry-run semantics](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).
