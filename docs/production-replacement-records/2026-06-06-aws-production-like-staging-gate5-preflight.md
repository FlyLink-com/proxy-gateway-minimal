# AWS Production-Like Staging Gate 5 Preflight


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aws_production_like_staging_gate5_preflight
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


Date: 2026-06-06, Asia/Shanghai.

Risk: A.

## Scope

Read-only Gate 5 preflight for the AWS production-like staging host.

Target:

```text
AWS staging host: 54.248.170.34
instance_id: i-08aa4775a099c9a18
release: bdc95d46ae4d
```

This preflight did not create a synthetic account, did not create an order, did
not generate a subscription artifact, did not mutate Vultr or Aliyun, and did
not output secrets, tokens, subscription URLs, raw env files, raw configs, raw
logs, or SQLite rows.

## Local Code Path

The Gate 5 synthetic portal flow should use the same public portal route path
as production-like users:

1. Operator-only initial account issuance through
   `gccgw platform issue-portal-initial-account`.
2. Human challenge through `POST /api/portal/human-challenges`.
3. Password session through `POST /api/portal/password/session`.
4. Synthetic order through `POST /api/portal/access-requests`.
5. Subscription refresh/render through the portal order lifecycle route after
   the created order is delivered by the auto-issuance path.

The CLI writes raw initial passwords only to a protected handoff file. Its JSON
stdout summary does not return the raw password or password hash.

## Remote Structure

Safe remote facts:

```text
runtime env file: present
release symlink: bdc95d46ae4d
control DB: present
subscription DB: present
service user: proxy-gateway-candidate
edge material file: absent before synthetic order creation
```

Required portal/auth/auto-issuance env keys were present by key name. The exact
env values were not printed.

Safe runtime booleans:

```text
edge lifecycle enabled: true
edge lifecycle execute mutation: true
password-only setup session: absent
```

Required platform control tables were present:

```text
platform_accounts: present
platform_portal_password_credentials: present
platform_portal_sessions: present
platform_portal_access_requests: present
platform_issuance_requests: present
```

The preflight inspected table and column metadata only. It did not dump data
rows.

## Public Boundary

Safe public route checks:

```text
GET /api/health: 200
GET /api/admin/platform/health: 404
GET /api/portal/access-requests/current without session: 401
POST /api/portal/human-challenges with empty JSON: 201
POST /api/portal/password/session with empty JSON: 400
GET /: 404
```

The human challenge probe issued an ephemeral challenge through the public
portal challenge route. No account, order, subscription artifact, or
credential material was created.

## Blocker

`USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION` is absent on the staging host.

This matters because initial accounts issued by
`platform issue-portal-initial-account` do not have an authenticator factor
yet. The password route verifies the password and then requires a second factor
unless `USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION=true` is set. Therefore a
synthetic initial account would not be able to enter the first-login security
setup flow without a staging-only env update and service restart.

## Next Approval Gate

The next mutation should be limited to AWS staging:

```text
Approve AWS production-like staging Gate 5 setup-session env hotfix:
target=AWS staging host 54.248.170.34 only;
instance_id=i-08aa4775a099c9a18;
scope=backup /etc/proxy-gateway-candidate/staging.env; set USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION=true only; restart proxy-gateway-candidate.service only;
validation=health ok, public Admin blocked, no-session portal APIs reject, password session empty-body still 400, service active with restart count recorded;
rollback=restore staging.env backup and restart proxy-gateway-candidate.service;
forbidden=Vultr production mutation, Aliyun mutation, DNS mutation, Nginx config mutation/reload, security group mutation, Mihomo config/restart, customer data, production secrets, live subscription issuance, payment, public Admin, subscription URL/token/password output, SQLite row dump, raw env/log/config output.
```

After that gate passes, a separate Gate 5 synthetic flow approval can create
one synthetic initial account, run one synthetic login/order/refresh path, and
record only redacted success summaries.
