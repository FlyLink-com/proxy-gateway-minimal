# Vultr Independent Candidate Deployment Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: vultr_independent_candidate_deployment
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


Date: 2026-06-06

## Scope

This record captures the Vultr-side independent candidate deployment for
`globalcirclecat.cloud`. It intentionally excludes secrets, tokens, portal
passwords, subscription URLs, raw environment files, raw SQLite rows, and raw
runtime configuration.

## Candidate Host

- Provider: Vultr
- Region: Tokyo (`nrt`)
- Instance label: `gccgw-vultr-candidate`
- Public IPv4: `45.76.222.52`
- Logical channel: `channel-vultr-a-tuic`
- Runtime release base: `9ddf1ab66d6b`

## Deployed Boundaries

- User portal static assets are served by Nginx from the candidate release.
- Public portal APIs are proxied only for `/api/portal/*` and health checks.
- Admin APIs remain blocked at the public Nginx boundary.
- Mihomo TUIC runs as a dedicated systemd service with per-order credentials.
- Firewall posture allows SSH from the operator source only, public HTTP/HTTPS,
  and UDP 443 for TUIC.

## Fix Applied During Validation

The TUIC runtime adapter previously tested candidate Mihomo configs with:

```text
mihomo -t -f <candidate-config>
```

When executed by the restricted service user, Mihomo attempted to initialize its
default config directory and failed before the listener could be validated. The
adapter now passes the config directory explicitly:

```text
mihomo -t -d <candidate-config-dir> -f <candidate-config>
```

The fix is covered by
`server/tests/edge-mihomo-tuic-host-runtime-adapter.test.mjs`.

## Validation

Local validation:

- `node --test server/tests/edge-mihomo-tuic-host-runtime-adapter.test.mjs`:
  passed.
- `npm test`: passed, 633 tests.
- `npm run admin:test`: passed, 125 tests.
- `npm run admin:build`: passed.
- `npm run admin:portal:build`: passed.
- `npm run admin:portal:verify`: passed.
- `npm run project-state:check`: passed.
- `git diff --check`: passed.

Vultr candidate validation:

- `proxy-gateway-candidate.service`: active.
- `mihomo-tuic.service`: active.
- UDP 443 listener: present.
- Local health: ok.
- Public health over candidate IP: HTTP 200.
- Portal static over candidate IP: HTTP 200.
- Public Admin API boundary: HTTP 404.
- No-session portal API boundary: HTTP 401.
- End-to-end portal smoke path completed without exposing sensitive output:
  human challenge issued, password session created, 30-day order auto-delivered,
  and a subscription artifact was returned to the client path.
- HTTPS validation after DNS convergence:
  - `https://globalcirclecat.cloud/`: HTTP 200.
  - `https://portal.globalcirclecat.cloud/`: HTTP 200.
  - `https://sub.globalcirclecat.cloud/api/health`: HTTP 200.
  - Public Admin API boundary over HTTPS: HTTP 404.
  - No-session portal API boundary over HTTPS: HTTP 401.
  - Domain-level portal smoke path completed without exposing sensitive output:
    human challenge issued, password session created, 30-day order auto-delivered,
    subscription artifact fetched with HTTP 200, and the rendered subscription
    contained the expected Vultr TUIC node shape.

## DNS Status

Vultr DNS zone preparation is complete:

- `globalcirclecat.cloud`
- `portal.globalcirclecat.cloud`
- `sub.globalcirclecat.cloud`

All above records are staged in Vultr DNS for `45.76.222.52`.

Registrar nameserver delegation was submitted through the registrar API and the
task completed successfully. Registry RDAP now reports:

- `ns1.vultr.com`
- `ns2.vultr.com`

Public recursive DNS later converged for the portal/subdomain records:

- `portal.globalcirclecat.cloud` resolves to `45.76.222.52`.
- `sub.globalcirclecat.cloud` resolves to `45.76.222.52`.

Let's Encrypt issued and deployed a trusted certificate for:

- `globalcirclecat.cloud`
- `portal.globalcirclecat.cloud`
- `sub.globalcirclecat.cloud`

## Rollback Notes

- The previous remote adapter file was backed up under the protected edge backup
  directory before replacement.
- Reverting the candidate runtime file and restarting
  `proxy-gateway-candidate.service` restores the pre-fix runtime behavior.
- Vultr DNS records can be removed without affecting current public traffic
  while public delegation remains on HiChina.

## Next Gate

The Vultr independent candidate is live for the user portal and TUIC
subscription path. Remaining follow-up is operational hardening:

1. Add an external uptime monitor for HTTPS and UDP 443.
2. Decide whether to retire or archive the previous Aliyun candidate runtime.
3. Continue normal renewal monitoring for the Let's Encrypt certificate.
