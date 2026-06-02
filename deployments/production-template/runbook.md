# Production Input Package Runbook

Last updated: 2026-06-02, Asia/Shanghai.

## Purpose

Use this runbook to turn the non-secret production input package into a
candidate deployment plan. This file does not authorize production deployment.

## Risk Boundary

Reading or editing this template is Risk C.

The following are Risk A and require separate exact approval:

- cloud instance creation or termination;
- DNS mutation;
- Nginx public boundary mutation or reload;
- systemd service install, start, stop, restart, or enable;
- firewall or security-group mutation;
- production `.env` write;
- production SQLite initialization, restore, or migration;
- real subscription issuance;
- binding customer access to a new node;
- promoting canary or recovery nodes into the default stable pool.

## Preflight Inputs

Before deployment, fill or verify:

```text
topology.json
nodes.json
public-boundary.json
plans.json
env.required.json
```

Do not fill secrets in these files. Use host environment files, provider secret
stores, or operator-only handoff material.

## Candidate Checks

Run locally before asking for a deployment gate:

```bash
gccgw package inspect deployments/production-template --json
gccgw package import deployments/production-template --dry-run --json
gccgw install configure --dry-run \
  --domain https://sub.example.com \
  --install-dir /opt/proxy-gateway-minimal \
  --management-source 203.0.113.10/32 \
  --json
gccgw release status --json
gccgw commands --json
gccgw docs domain release
gccgw docs domain node
git diff --check origin/master...HEAD
npm run project-state:check
npm run project:verify
```

On a clean Linux target, run:

```bash
npm ci --no-audit --no-fund
npm link
gccgw self check
gccgw install preflight --json
```

Expected:

```text
gccgw self check ok: true
gccgw install preflight ok: true before bootstrap
```

`nginx` and root checks may remain false until the target host is prepared for
an actual bootstrap gate. Do not treat that as deployment approval.

## Package Apply Gate

After the B-tier import dry-run and install configure plans have been reviewed,
the bounded A-tier package apply command is:

```bash
gccgw package apply deployments/production-template \
  --import-plan reviewed-package-import-plan.json \
  --config-plan reviewed-install-configure-plan.json \
  --execute-production-mutation \
  --apply
```

This command is Linux-target only. It prepares reviewed local host material:
a redacted `.env` skeleton, package metadata, runtime/control SQLite files, and
the handoff directory. It does not reload Nginx, install or start systemd
services, change firewall rules, mutate DNS, issue real subscriptions, or
write customer data.

## Execution Gate Shape

When ready, request a separate A-tier approval that names:

```text
target host
target role
target commit
allowed files to write
allowed service actions
allowed public boundary changes
validation commands
rollback command set
hard stops
```

Short confirmations such as `ok`, `go`, `continue`, or `同意` are not enough
for production deployment.

## Post-Deployment Validation

Minimum checks after an approved deployment:

```bash
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx
systemctl show proxy-gateway-console.service proxy-gateway-ss.service nginx \
  --property=ActiveState,SubState,Result,ExecMainStatus,NRestarts \
  --no-pager
curl -fsS http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1/api/health
curl -i http://127.0.0.1/api/admin/subscriptions
curl -i http://127.0.0.1/sub/clash.yaml
```

Expected public boundary:

```text
/api/health -> 200
/api/admin/* -> 404
/sub/clash.yaml without credential -> 401
```

## Rollback

Rollback must be ready before production mutation:

```text
previous commit or release artifact
previous Nginx config
previous runtime config
previous protected environment file
verified SQLite backup label
service restart sequence
post-rollback validation commands
```

Do not record raw secrets, raw SQLite rows, raw subscription URLs, raw artifact
URLs, or customer data in rollback notes.
