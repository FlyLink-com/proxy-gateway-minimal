# Initial-request click-ID log privacy inventory

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: source_only_ads_initial_request_log_privacy
  superseded_by: null
  last_verified_at: 2026-11-05
  production_authority: false
```

Status: Draft / source-only preparation. No production log settings, Cloudflare configuration, Nginx configuration, deployment workflow, secrets, or runtime variables are changed by this PR.

## Source facts confirmed

- `wrangler.jsonc` currently enables Worker observability and sets `head_sampling_rate: 1`.
- The current config does not set `observability.redact_query_string`.
- The repository pins `wrangler@4.99.0` in the Cloudflare site dry-run script and deployment workflow.
- The pinned Wrangler 4.99.0 schema does not expose `redact_query_string`; the Wrangler 4.128.0 source schema does.
- Both checked Nginx source templates (`ops/nginx/proxy-gateway-public.conf` and `ops/edge-node/nginx/proxy-gateway-public.conf`) log `$uri`, not `$request_uri`, which avoids writing the request query string in the request-target field.
- Those same Nginx templates also log the full `$http_referer` value. That is a concrete source-level leak surface: a Referer URL can itself contain a click identifier even when the request target uses `$uri`.
- Older production inventory records report `$uri` and no `$request_uri` in the specific configs checked at that time, but those dated records are not a fresh runtime verification of the current host or of Referer values.
- A repository source search did not identify an obvious third-party browser analytics SDK or a central Express request logger; this is not proof that every application/error path is clean.
- No production Cloudflare logs, Nginx logs, or customer request data were read for this inventory.

## Leak surfaces to verify in the separate Risk A gate

| Surface | Potential exposure | Required later verification |
|---|---|---|
| Cloudflare Worker request URL logs/traces | Query parameters such as `gclid`, `gbraid`, `wbraid` | Upgrade the pinned Wrangler toolchain, set top-level `observability.redact_query_string: true`, deploy only after approval, and inspect synthetic requests |
| Cloudflare request headers | A `Referer` header may contain a full landing URL and query string | Verify provider behavior; query-string redaction of request URLs must not be assumed to redact arbitrary headers |
| Nginx access logs | The checked source templates use query-free `$uri`, but also log full `$http_referer`, which may contain click IDs | Remove or reduce Referer to an approved origin-only value in a separate Risk A change; verify active host config and synthetic logs |
| Node/Express application logs | Request URL, headers, body, or error objects may contain click identifiers | Confirm logging uses an allowlist; never log request bodies, raw headers, or full query strings |
| Browser analytics and error reporting | URL, referrer, navigation breadcrumbs, or captured request payloads | Verify collection filters and synthetic event payloads; do not forward raw click IDs to unrelated telemetry |
| Support exports and diagnostic bundles | Captured URLs or copied request headers | Verify redaction before export and restrict access/retention |

## Cloudflare configuration note

The relevant future configuration belongs directly under `observability`, not under `observability.logs`:

```jsonc
{
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1,
    "redact_query_string": true
  }
}
```

This is deliberately not applied here. It changes deployed Worker observability behavior and requires a separate Risk A approval, toolchain compatibility validation, deployment approval, and log read-back. Query-string redaction also does not establish that Referer headers, request bodies, application logs, or other telemetry are clean.

## Synthetic validation harness

`inspectAdsClickLogEntries` accepts only caller-supplied synthetic strings in memory. It detects:

- raw synthetic identifiers;
- URI percent-encoded copies;
- base64 and base64url copies;
- UTF-8 hexadecimal copies.

It returns aggregate counts only and never returns the sentinel values. It does not read files, call Cloudflare, access Nginx, or inspect production logs. It cannot prove the absence of hashes, encryption, or every possible transformation; it is a regression probe for common reversible representations, not a production attestation.

## Risk A exit criteria

1. Approve the Wrangler version upgrade and deployed Worker config change.
2. Inspect the actual Nginx log format and remove raw request query / full Referer values.
3. Review application and browser telemetry for URL, header, body, and breadcrumb capture.
4. Send only synthetic sentinel IDs through a controlled test environment.
5. Inspect provider logs and application logs to confirm no raw or common reversible sentinel copies appear.
6. Record the exact environment, timestamp, configuration revision, and aggregate probe result.
7. Keep Google Ads upload disabled until the independent consent, privacy, and vendor approval gates are complete.
