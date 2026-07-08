# 2026-07-06 Globalcirclecat Full Retirement Task

## Status

- Risk: A
- Type: follow-up task / approval package seed
- Current state: not executed in this task
- Reason: the operator has repeatedly stated that `globalcirclecat` domains are no longer production entry points.

## Objective

Remove remaining `globalcirclecat` production entry dependencies after verifying
that all active user, subscription, protocol, Admin, DNS, Nginx, certificate,
runtime, documentation, and rollback references have been replaced by
`gccwebos` equivalents or explicitly archived.

## Required Read-Only Inventory

Before any removal, collect redacted evidence for:

- Vercel DNS records under all relevant domains.
- Japan Nginx host blocks and enabled sites.
- Japan production `.env` key presence by key name only.
- Japan and SGP runtime certificate paths and covered DNS names.
- Production subscription config summaries for VLESS, Hy2, and TUIC.
- Portal/sub/admin public route boundaries.
- Repo references in active docs, config templates, tests, and runtime helpers.
- Recent execution records and rollback candidates that still mention
  `globalcirclecat`.

## Candidate Removal Scope

The exact approval must decide which classes are in scope:

- DNS record deletion or parking.
- Nginx `server_name` removal or explicit `410` blocks.
- Certificate renewal target cleanup.
- Runtime config/env alias cleanup.
- Repo config/template/test/docs cleanup.
- Public route redirects or hard retirement.
- Rollback retention for historical records.

## Guardrails

- Do not delete or mutate anything until a separate exact Risk A approval is
  provided.
- Do not change accounts, orders, payment, schema, subscription token,
  credentials, or customer data.
- Do not output raw env, raw config, token, subscription URL, credential,
  private key, SQLite row, customer data, or raw logs.
- Do not remove rollback evidence required for the July 2026 IPv6 and protocol
  runtime gates.
- Keep `gccwebos` portal/sub/jp/sgp entries active unless an exact approval says
  otherwise.

## Draft Approval Shape

```text
批准执行 globalcirclecat full retirement production gate:
target=Japan and SGP production plus Vercel DNS only as listed in read-only inventory;
scope=...;
validation=...;
rollback=...;
forbidden=account/order/payment/schema/subscription token/credential/customer data/raw secret output, gccwebos production disruption;
```
