# AWS Production-Like Staging Gate 5 Setup-Session Env Hotfix

Date: 2026-06-06, Asia/Shanghai.

Risk: A.

## Scope

Exact-approved AWS staging-only environment hotfix.

Approved target:

```text
AWS staging host: 54.248.170.34
instance_id: i-08aa4775a099c9a18
release: bdc95d46ae4d
```

Approved change:

```text
Set USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION=true only.
Restart proxy-gateway-candidate.service only.
```

This gate did not mutate Vultr production, Aliyun, DNS, Nginx config, security
groups, Mihomo config, customer data, production secrets, payment, public
Admin, account/password generation, live order creation, or subscription
artifact generation.

## Pre-Change Snapshot

Safe facts before mutation:

```text
release: bdc95d46ae4d
env file: present
USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION key: absent
proxy-gateway-candidate.service: active/running, Result=success, NRestarts=0
public /api/health: 200
public /api/admin/platform/health: 404
public /api/portal/access-requests/current: 401
public /api/portal/password/session with empty body: 400
instance status: running, instance ok, system ok
```

No raw environment file content was printed.

## Mutation

The staging env file was backed up and only the setup-session key was added.

Safe mutation summary:

```text
backup_created: yes
backup_label: staging.env.gate5-setup-session-20260606T131433Z
setup_session_key_after: true
restart_invoked: yes
restarted service: proxy-gateway-candidate.service
```

The backup label is recorded for rollback coordination. The backup file content
was not printed.

## Validation

Safe validation results after restart:

```text
proxy-gateway-candidate.service: active/running, Result=success, NRestarts=0
loopback /api/health: 200
USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION key: true
public /api/health: 200
public /api/admin/platform/health: 404
public /api/portal/access-requests/current: 401
public /api/portal/password/session with empty body: 400
public /: 404
instance status: running, instance ok, system ok
```

The empty-body password-session check remains 400, which confirms the public
route is reachable but still validates input.

## Rollback

Rollback remains available by restoring the recorded backup and restarting only
`proxy-gateway-candidate.service`:

```bash
sudo cp /etc/proxy-gateway-candidate/backups/staging.env.gate5-setup-session-20260606T131433Z /etc/proxy-gateway-candidate/staging.env
sudo chown root:proxy-gateway-candidate /etc/proxy-gateway-candidate/staging.env
sudo chmod 0640 /etc/proxy-gateway-candidate/staging.env
sudo systemctl restart proxy-gateway-candidate.service
```

## Next Gate

The next Gate 5 step can run one synthetic portal flow after separate approval:

```text
Approve AWS production-like staging Gate 5 synthetic portal/order validation:
target=AWS staging host 54.248.170.34 only;
instance_id=i-08aa4775a099c9a18;
scope=create one synthetic staging-only initial portal account through the approved CLI, write raw initial password only to a protected on-host handoff file, issue one human challenge, create one password setup session, create one 30-day synthetic order through /api/portal/access-requests, validate auto-delivery and subscription artifact rendering with redacted summaries only, and verify edge material file existence and Mihomo service health;
validation=health ok, public Admin blocked, no-session portal APIs reject, synthetic password session created without printing password, one synthetic order auto-delivered, rendered subscription contains channel-aws-staging-a-tuic without printing subscription URL/token/password, edge material file exists, mihomo active, UDP 443 present;
rollback=disable the synthetic order/access request, revoke synthetic account credentials/session, remove protected handoff file, and leave staging services active for inspection;
forbidden=Vultr production mutation, Aliyun mutation, DNS mutation, Nginx config mutation/reload, security group mutation, customer data, production secrets, payment, public Admin, raw subscription URL/token/password output, SQLite row dump, raw env/log/config output.
```
