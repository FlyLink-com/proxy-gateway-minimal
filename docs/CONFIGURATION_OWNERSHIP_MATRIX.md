# Configuration Ownership Matrix

Last updated: 2026-06-02, Asia/Shanghai.

This document defines where each configuration fact belongs and which surface
is allowed to edit it. It is a design boundary only. It does not authorize
production, DNS, Nginx, systemd, firewall, cloud, SQLite, secret, customer-data,
subscription-output, or traffic changes.

## Core Rule

Do not treat all configuration as one Git file. Runtime values converge in the
target-host `.env`; Git JSON files describe only non-secret structure, policy,
and required env names.

```text
target-host .env = runtime fill surface for deploy/install closure
gccgw = installer, validator, and gated execution shell
Admin Web = business settings and safe system status review
User Portal = customer subscription lifecycle only
Protected env/files = secrets and host-local runtime facts
SQLite = runtime and business state
Git templates/docs = non-secret intent, schemas, and package shape
```

## Ownership Matrix

| Configuration area | Examples | Owner surface | Storage | Git allowed | Browser editable | Risk gate | Rollback model |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Install identity | target role, install directory, service port, domain/base URL | `gccgw install configure` or local install wizard | target-host `.env` plus generated host config | template only | local/private install UI allowed | B for plan, A for apply | restore previous generated config or delete isolated install dir |
| Database paths | runtime subscription DB, business control DB | `gccgw` installer | target-host `.env`, derived from install directory by default | path examples only | view/override in operator UI only | B for local/lab, A for production write/migration | stop service, restore previous DB path/config and backup |
| Secrets | console token, SS password, payment webhook secret, protocol credentials, private cert material | operator / secret injection flow | protected host env, protected files, handoff | no | no raw values; status only | A in production | rotate secret and restore previous protected env if safe |
| Management source | `ADMIN_ALLOWED_CIDRS`, trusted operator source, loopback/private admin access | `gccgw` installer plus operator security review | protected env / host config | examples only | operator UI may edit with preview | A for production boundary | restore prior allowlist and validate admin/public boundary |
| Trusted proxy source | `TRUSTED_PROXY_CIDRS`, proxy IPs whose forwarded headers are trusted | operator security review | protected env / host config | examples only | operator UI may edit with preview | A for production boundary | restore prior trusted proxy list |
| Data-plane agent source | `EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS`, loopback/private agent pull/apply sources | operator security review | protected env / host config | examples only | operator UI may edit with preview | A for production boundary | restore prior allowlist and validate internal-agent boundary |
| Public boundary | public site, `/api/health`, `/api/public/leads`, `/sub/*`, blocked `/api/admin/*` | package template + operator UI preview | `public-boundary.json`, Nginx plan, runtime config | non-secret intent only | preview/edit expected policy; apply gated | A for Nginx/public mutation | restore previous Nginx config and validate routes |
| Subscription products | monthly/yearly package ids, durations, default pool, refresh policy | Admin Web | control DB / safe settings table | default template only | yes | B unless schema/prod migration | revert settings row/version |
| Rate limits | subscription refresh window/max, temp-link TTL | Admin Web | control DB or protected runtime settings | default template only | yes | B for repo/local, A for production runtime change if service reload required | restore previous setting and validate endpoint behavior |
| Node slots and pools | prod-edge-a/b/c, stable/canary/recovery, eligibility flags | Admin Web + node registry + package template | control DB / node registry / runtime config references | slot intent only | yes for safe metadata; no raw credentials | B for metadata, A for runtime activation | revert node status/pool assignment and validate subscription output |
| Node credentials | host credentials, protocol passwords, TUIC UUID/password/cert | operator secret injection | protected env/files | no | no raw values; status only | A | rotate/remove credentials and disable node if needed |
| Nginx config | public reverse proxy, Admin blocking, HTTPS, route forwarding | operator deployment gate | host `/etc/nginx` and repo templates | templates only | preview/diff yes; apply gated | A | restore previous Nginx config and reload/validate |
| systemd config | console service, SS service, restart policy, service user | operator deployment gate | host systemd unit files and repo templates | templates only | preview/diff/status yes; apply gated | A | restore previous unit, daemon-reload, restart/stop as approved |
| User portal state | package status, active subscription, refresh action, purchase history | User Portal / backend services | control DB and runtime DB refs | no | user-scoped only | B for repo code, A for production auth/schema/deploy | revert DB migration or restore backup by gate |
| Customer data | email, phone, Telegram, real name, support contact | User Portal or operator intake | control DB with redacted summaries | no | user may edit own profile; Admin sees safe summaries | B for repo code, A for production migration | restore prior profile row/version if needed |
| Subscription delivery | opaque artifact, dynamic entry, visible-once handoff | operator/user portal service boundary | runtime DB + operator-only handoff | no | never show raw secret after visible-once | A for real issuance | revoke artifact/tenant and record execution |
| Payment facts | provider, order status, webhook verification, package purchase confirmation | future payment adapter + Admin Web | control DB / protected env for webhook secret | provider-neutral template only | safe status/settings only | A for live provider/webhook | disable provider, revoke webhook secret, reconcile orders |

## Management Source

Management source is the network identity allowed to reach protected operator
surfaces. It is not the same as customer access.

```text
ADMIN_ALLOWED_CIDRS = who may reach protected admin/platform routes
TRUSTED_PROXY_CIDRS = which reverse proxies may supply trusted client IP headers
EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS = who may reach internal data-plane agent routes
```

Examples:

```text
127.0.0.1/32
operator-office-public-ip/32
private management subnet
```

Public customers do not need to be in `ADMIN_ALLOWED_CIDRS`. They should only
touch approved public routes such as health, public lead intake, user portal
entry points, and credential-bound subscription refresh paths.

## Install Wizard Boundary

The install wizard may ask for:

```text
domain / public base URL
install directory
console port
management source CIDR
target role
whether to generate Nginx/systemd plans
```

The installer should derive by default:

```text
runtime SQLite path
control SQLite path
handoff directory
env skeleton path
service working directory
```

If derived paths fail, treat it as an installation/platform problem first:

```text
directory permission
service user ownership
disk path mismatch
SQLite lock or parent directory missing
runtime path mismatch
```

Do not push users into manually understanding internal DB wiring unless a
deliberate override is requested.

## Web Admin Boundary

Admin Web may edit business-level settings:

```text
monthly/yearly packages
rate limits
refresh policy
node pool eligibility metadata
support handoff labels
safe public-boundary expectations
```

Admin Web may preview infrastructure plans:

```text
Nginx diff
systemd diff
service status
public-boundary validation
node health summary
```

Admin Web must not silently execute infrastructure mutation. Production Nginx,
systemd, firewall, DNS, cloud, real issuance, real SQLite migration, and secret
injection remain Risk A.

## User Portal Boundary

User Portal may only expose customer-scoped lifecycle actions:

```text
view current package state
request package activation
refresh current subscription artifact
view history
edit own contact profile
open support handoff
```

It must not expose operator controls, node credentials, Admin settings,
Nginx/systemd actions, or package import/apply controls.

## Git Boundary

Git may contain:

```text
schemas
templates
example paths
policy labels
node slot ids
pool names
runbook steps
non-secret package intent
```

Git must not contain:

```text
real .env values
tokens
payment secrets
cloud credentials
private keys
SQLite files or row dumps
customer data
raw subscription URLs
opaque artifact secrets
generated client YAML
runtime logs
handoff files
```

## Next Implementation Implications

Keep future work on these rails:

```text
1. Treat `.env.example` as the runtime key checklist.
2. Use `gccgw install configure --dry-run` to derive and review `.env` skeleton values.
3. Generate default DB paths from the install directory.
4. Add Admin Web settings for packages, rate limits, and safe node metadata only after the `.env` boundary is stable.
5. Add preview-only Nginx/systemd panels before any apply path.
6. Keep apply paths behind separate Risk A approval.
```
