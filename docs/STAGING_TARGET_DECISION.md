# Staging Target Decision

Last updated: 2026-05-23, Asia/Shanghai.

This document records the staging target decision for `proxy-gateway-minimal`. It is based on read-only AWS checks and does not represent a live infrastructure change.

## Decision

Use a clean, explicitly assigned staging instance for pre-release validation.

Do not start the historical stopped instance `i-0589aac321172dd74` and call it staging as-is.

## Recommended Path

Create a new staging instance when staging is needed, using:

| Field | Recommended value |
| --- | --- |
| Region | `ap-southeast-1` |
| AMI | `ami-08bf93219e21cea7a` |
| AMI name | `ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-20260515` |
| Architecture | `arm64` |
| Instance type | `t4g.small` |
| Key pair | `proxy-gateway-aws-sg-20260521` |
| VPC | `vpc-01be6089f9892a651` |
| Subnet | `subnet-0bd6d390d9e318744` |
| Runtime path | `/opt/proxy-gateway-minimal` |
| Tags | `Project=proxy-gateway-minimal`, `Environment=staging`, `Role=pre-release`, `Owner=codex` |

Staging should use its own `.env`, SQLite database, generated tokens, and node password. Do not copy production `.env`, production subscription tokens, or production SQLite data.

## Why Not Reuse The Stopped Instance As-Is

Read-only checks on 2026-05-23 found:

| Field | Production | Stopped historical node |
| --- | --- | --- |
| Instance ID | `i-004ab1c6c71d06bca` | `i-0589aac321172dd74` |
| State | `running` | `stopped` |
| Public IP | `47.129.247.102` | none |
| Private IP | `172.31.26.232` | `172.31.24.0` |
| AMI | `ami-08bf93219e21cea7a` | `ami-08bf93219e21cea7a` |
| Type | `t4g.small` | `t4g.small` |
| Root volume | `vol-0c97431aaf639e098`, 12GB gp3 | `vol-0f9fbd2759d4e6c2d`, 8GB gp3 |
| Security group | `sg-04a165ec77f430ee8` | `sg-0748fd9a7f936e28d` |
| Project tag | missing | `proxy-gateway-minimal` |
| Environment tag | missing | missing |
| Role tag | missing | missing |

The stopped node has a persistent root volume from an older operational path. Starting it as staging would mix unknown runtime state with a new validation role. It also has no public IP while stopped, so endpoint URLs and client-facing behavior would change on start unless an Elastic IP is assigned.

## Acceptable Alternative

The stopped instance may be repurposed only through an explicit rebuild path:

1. Confirm the production node remains untouched.
2. Snapshot or terminate the old root volume according to the chosen retention policy.
3. Rebuild or reprovision the instance from the current repository and staging-only secrets.
4. Retag the instance and volume with `Environment=staging` and `Role=pre-release`.
5. Record its public IP, private IP, security group, runtime path, and deployed commit in `docs/ENVIRONMENT_TOPOLOGY.md`.
6. Run the staging verification checklist in `docs/DEPLOYMENT_FLOW.md`.

This alternative is useful only if keeping the same instance ID matters. Otherwise, a new clean instance is simpler and lower risk.

## Staging Security Group Policy

Use a separate staging security group. It may mirror production public behavior for `/api/health` and subscription checks, but it must remain distinguishable from production.

Minimum inbound rules:

| Port | Protocol | Source | Purpose |
| --- | --- | --- | --- |
| `22` | TCP | operator `/32` only | SSH access |
| `80` | TCP | operator test range or `0.0.0.0/0` for short-lived public checks | Nginx gateway |
| `18388` | TCP/UDP | operator test range or `0.0.0.0/0` for short-lived client checks | Shadowsocks staging node |

Do not expose `3456/tcp` publicly. The console/API must remain bound to loopback and tested through SSH tunnel.

## Creation Gate

Before creating or starting a staging instance, require a separate operator approval that names the chosen path:

```text
Create a new clean staging instance
```

or:

```text
Rebuild the stopped historical instance as staging
```

Without that explicit approval, Codex should stop at documentation, read-only checks, and PR preparation.

## Verification Gate

After staging is assigned:

```powershell
git status --short --branch
npm test
npm run admin:test
npm run admin:build
```

Then on the staging host:

```bash
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx
ss -lntup
curl -i http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1:3456/api/admin/subscriptions
```

From the public side:

```bash
curl -i http://<staging-public-ip>/api/health
curl -i http://<staging-public-ip>/api/admin/subscriptions
curl -i http://<staging-public-ip>/sub/clash.yaml
```

Expected public results:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
```

## Follow-Up

The next infrastructure PR should either:

- create a tracked staging provisioning runbook for the recommended clean instance path, or
- record the explicit approval and exact rebuild steps for repurposing `i-0589aac321172dd74`.
