# Operator Configuration Notepad

Last updated: 2026-06-02, Asia/Shanghai.

This is the human-editable checklist for the production input package. It is
the "notepad" view of the deployment intent, not a runtime config file and not
a secret store.

Use it before editing the JSON files in this directory:

```text
read this notepad
-> fill or review the non-secret intent below
-> copy non-secret structure into topology.json / nodes.json / plans.json / public-boundary.json / env.required.json
-> copy .env.example to .env on the target host and fill runtime values there
-> run gccgw package inspect
-> run gccgw package import --dry-run
-> request a separate Risk A approval before apply/bootstrap
```

`gccgw` does not import this Markdown file directly. The importable contract
remains the JSON files declared by `package-manifest.json`.

Runtime values converge in the target host `.env`. The JSON files only describe
non-secret structure and required env names.

## Fill-In Summary

Keep values concrete enough for review, but never paste secrets or customer
data here.

```text
[package]
name = production-template
environment = production
packageKind = full-project-package
authority = template-only

[control-plane]
id = aliyun-subscription-control
runtimePath = /opt/proxy-gateway-minimal
publicBaseUrl = https://control.example.invalid
publicAdmin = false
adminAccess = loopback-or-private-only
managementSource = operator-approved-management-source-only

[public-boundary]
publicSite = / or 404 unless explicitly deployed
health = /api/health public 200
leadIntake = /api/public/leads public when explicitly activated
adminApis = blocked publicly
legacyClash = /sub/clash.yaml public but credential-required compatibility only
opaqueArtifacts = /sub/a/<opaque-artifact> public but artifact-required

[plans]
monthly = 30 days, manual-or-payment-provider-confirmed
annual = 365 days, manual-or-payment-provider-confirmed
trafficPolicy = operator-defined

[nodes]
stablePrimary = prod-edge-a, pool stable, protocols ss, hostRef runtime:PROD_EDGE_A_HOST
stableSecondary = prod-edge-b, pool stable, protocols ss, hostRef runtime:PROD_EDGE_B_HOST
recoveryCandidate = prod-edge-c, pool recovery, protocols ss, hostRef runtime:PROD_EDGE_C_HOST
controlledCanary = channel-lab-b-tuic, pool canary, protocols tuic, protected refs only

[target-host-env]
NODE_ENV
CONSOLE_PORT
CONSOLE_TOKEN
SS_PASSWORD
SUBSCRIPTION_DB_PATH
SUBSCRIPTION_CONTROL_DB_PATH
HANDOFF_DIR
PUBLIC_SUBSCRIPTION_BASE_URL
ADMIN_ALLOWED_CIDRS
TRUSTED_PROXY_CIDRS
SUB_RATE_LIMIT_WINDOW_MS
SUB_RATE_LIMIT_MAX
SUBSCRIPTION_TEMP_LINK_TTL_MINUTES

[operator-review]
packageInspect = pending
packageImportDryRun = pending
installPreflightOnTarget = pending
installConfigureDryRun = pending
riskAApproval = not granted
rollbackPlan = pending
```

## Edit Map

| Intent | Edit file |
| --- | --- |
| Package identity, hard stops, import phases, registration policy | `package-manifest.json` |
| Control-plane URL, runtime path, public/protected route shape, database refs | `topology.json` |
| Public route expectations and public Admin blocking | `public-boundary.json` |
| Subscription package names, durations, renewal policy refs | `plans.json` |
| Node slots, pools, protocol labels, safe host refs, credential refs | `nodes.json` |
| Required `.env` variable names and storage locations | `env.required.json` and target-host `.env` |
| Approval, validation, rollback order | `runbook.md` |

## Do Not Paste

Never put any of these in this notepad, JSON files, README, PRs, docs, chat, or
logs:

- `.env` values
- console tokens
- subscription URLs
- raw opaque artifact secrets
- Shadowsocks passwords
- TUIC UUIDs or passwords
- private keys or PEM material
- cloud provider AK/SK or API tokens
- SQLite files, row dumps, or tenant records
- customer names, phone numbers, emails, Telegram handles, or payment details
- raw production logs or handoff files

## Validation Commands

Run these after changing the JSON package files:

```bash
gccgw package inspect deployments/production-template --json
gccgw package import deployments/production-template --dry-run --json
```

Run this separately for the target host install plan:

```bash
gccgw install configure --dry-run \
  --domain https://control.example.invalid \
  --install-dir /opt/gccgw \
  --management-source 203.0.113.10/32 \
  --json
```

These commands do not grant production authority. `package apply` and
`install bootstrap` remain Risk A actions requiring reviewed plans, explicit
operator approval, target-environment validation, and rollback evidence.
