# Edge Node Build Materials

Last updated: 2026-06-08, America/Los_Angeles.

> Status:
> - Type: Repo-only build materials
> - Risk: A
> - Execution authority: Does not authorize cloud creation, production mutation, secret copying, SQLite restore, DNS changes, Nginx reload, service start, traffic cutover, or standby promotion by itself
> - Production impact: None unless separately approved and executed
> - Source of truth for: Provider-neutral edge-node bootstrap files for the future `prod-edge-c` recovery slot

## Purpose

This directory keeps a provider-neutral recovery build package in Git so a
third production edge slot can be rebuilt from reviewed materials when both
active production slots are unavailable or a recovery exercise is explicitly
approved.

Use `docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md` before replacing these
materials with files from old checkouts, `.worktrees/`, generated artifacts,
or previous release packages. This directory may contain generic templates
only; live runtime material remains protected runtime state and must not be
copied into Git.

The default target slot is:

```text
prod-edge-c
```

These files are intentionally generic. They do not contain provider names,
instance IDs, public IPs, production secrets, SQLite data, customer data, or
raw subscription URLs.

## Contents

```text
ops/edge-node/bootstrap.sh
ops/edge-node/systemd/proxy-gateway-console.service
ops/edge-node/systemd/proxy-gateway-ss.service
ops/edge-node/nginx/proxy-gateway-public.conf
ops/edge-node/templates/env.example
ops/edge-node/templates/ss-server.json.example
ops/edge-node/templates/proxy-servers.json.example
```

## What Git May Contain

Allowed in this directory:

- bootstrap scripts;
- provider-neutral systemd templates;
- query-safe Nginx public gateway templates;
- placeholder `.env` and Shadowsocks config examples;
- operator instructions and validation commands.

Forbidden in this directory:

- production `.env`;
- `CONSOLE_TOKEN`;
- `SS_PASSWORD`;
- SQLite database files or backups;
- raw subscription URLs;
- generated Clash/Mihomo YAML with embedded secrets;
- cloud credentials;
- private keys or PEM files;
- customer data;
- provider-specific secret inventory.

## Bootstrap Boundary

`bootstrap.sh` is fail-closed by default. The `gccgw install bootstrap` wrapper
requires a reviewed `gccgw install configure --dry-run` plan before it reaches
the host mutation path:

```bash
gccgw install configure --dry-run \
  --domain https://sub.example.com \
  --install-dir /opt/proxy-gateway-minimal \
  --management-source 203.0.113.10/32 \
  --json > reviewed-install-configure-plan.json

gccgw install bootstrap \
  --config-plan reviewed-install-configure-plan.json \
  --execute-production-mutation \
  --apply
```

The underlying shell script still only mutates a host when invoked with:

```bash
sudo bash ops/edge-node/bootstrap.sh --apply
```

It prepares OS/runtime dependencies, service templates, Nginx templates, and
application dependencies. It does not start services, restore SQLite, copy
secrets, change DNS, or cut traffic over.

Run it only after the relevant production replacement or recovery approval is
recorded.

## Recovery Sequence

Use this package only inside an approved Risk A recovery or standby-validation
action:

```text
1. Create or assign a clean host under an approved execution record.
2. Place the reviewed repository checkout at /opt/proxy-gateway-minimal.
3. Generate and review `gccgw install configure --dry-run` output.
4. Run `gccgw install bootstrap --config-plan <reviewed-plan.json> --execute-production-mutation --apply`.
5. Create /opt/proxy-gateway-minimal/.env from templates/env.example.
6. Create /etc/proxy-gateway/ss-server.json from templates/ss-server.json.example.
7. Create config/proxy-servers.json from templates/proxy-servers.json.example if this node will generate subscription YAML.
8. Inject approved production secrets without recording them in Git, PRs, docs, or chat.
9. Restore an approved SQLite backup and run pragma integrity_check.
10. Validate local health, public boundary, Nginx config, systemd state, and Shadowsocks reachability.
11. Request a separate cutover or standby-promotion approval if needed.
```

## Validation Checklist

After secrets and SQLite are approved and installed:

```bash
sudo nginx -t
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx
systemctl show proxy-gateway-console.service proxy-gateway-ss.service nginx \
  --property=ActiveState,SubState,Result,ExecMainStatus,NRestarts \
  --no-pager
curl -fsS http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1:3456/api/admin/subscriptions
curl -i http://127.0.0.1/api/health
curl -i http://127.0.0.1/api/admin/subscriptions
curl -i http://127.0.0.1/sub/clash.yaml
```

Expected public behavior:

```text
/api/health -> 200
/api/admin/* -> 404
/sub/clash.yaml without token -> 401
/ -> 404
```

Inspect process command lines, `ss -lntup`, and journal output locally and
redact sensitive values before recording incident notes. Do not paste raw
command lines or logs into PRs, docs, chat, or incident records if they include
command arguments, tokens, passwords, subscription URLs, environment-derived
secrets, or customer data.

## Relationship To Other Docs

- `docs/PRODUCTION_EDGE_FLEET.md`: defines the `prod-edge-a/b/c` slot model.
- `docs/PRODUCTION_DR.md`: production incident recovery gates.
- `docs/PRODUCTION_REPLACEMENT.md`: blue/green replacement gates.
- `docs/NODE_NAMING.md`: provider-neutral node naming policy.
