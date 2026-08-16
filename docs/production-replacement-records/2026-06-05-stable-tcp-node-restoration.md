# Stable TCP Node Restoration - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: stable_tcp_node_restoration
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

Operator approval:

```text
target=Aliyun candidate runtime only
node_config=restore prod-edge-a/prod-edge-b as stable online Shadowsocks eligible; move channel-lab-b-tuic to canary only
runtime_env=set USER_PORTAL_AUTO_ISSUANCE_NODE_ID=prod-edge-a; keep auto issuance limits unchanged
backup=protected proxy-servers config + protected env before mutation
restart=proxy-gateway-candidate.service only
nginx=no config mutation, nginx -t validation only, no reload
```

Forbidden changes were observed:

- no DNS mutation;
- no firewall or provider security-group mutation;
- no Nginx config mutation or reload;
- no public Admin enablement;
- no payment mutation;
- no account or password generation;
- no live order creation;
- no passkey enablement;
- no token, password, subscription URL, credential, or SQLite row output;
- no `sub.globalcirclecat.com` behavior change was intended.

## Pre-Mutation Baseline

- Host: Aliyun candidate runtime, reached through the approved local SSH alias.
- `proxy-gateway-candidate.service`: active.
- `nginx`: active.
- Candidate `current`: `/opt/proxy-gateway-minimal-candidate/releases/492ba99ea564`.
- Loopback health: `ok=true`, `authRequired=true`.
- `gccgw node inspect --json` showed:
  - `prod-edge-a`: stable, maintenance, not subscription-eligible;
  - `prod-edge-b`: stable, maintenance, not subscription-eligible;
  - `channel-lab-b-tuic`: stable, online, subscription-eligible.
- Whitelisted runtime env showed:
  - portal routes enabled;
  - auto issuance enabled;
  - auto issuance target: `channel-lab-b-tuic`;
  - 7-day and 30-day monthly limits unchanged from the prior deployment.

No raw protected env file, endpoint, credential, subscription URL, token, or
SQLite row was printed.

## Backup

Pre-mutation backup directory:

```text
/opt/proxy-gateway-minimal-candidate/backups/stable-tcp-fix-20260604T164746Z
```

Backed up before mutation:

- protected `config/proxy-servers.json`;
- protected candidate `.env`.

The backup directory was created with restricted permissions. Backup file
contents were not printed.

## Mutation Applied

Runtime-only node config changes:

| Node label | Before | After |
| --- | --- | --- |
| `prod-edge-a` | stable / maintenance / Shadowsocks / not eligible | stable / online / Shadowsocks / eligible / priority 10 |
| `prod-edge-b` | stable / maintenance / Shadowsocks / not eligible | stable / online / Shadowsocks / eligible / priority 20 |
| `channel-lab-b-tuic` | stable / online / TUIC / eligible | canary / online / TUIC / eligible / priority 90 |

Runtime env change:

```text
USER_PORTAL_AUTO_ISSUANCE_NODE_ID=prod-edge-a
```

The existing auto-issuance limits were left unchanged.

## Restart

Only this service was restarted:

```text
proxy-gateway-candidate.service
```

Result:

- `proxy-gateway-candidate.service`: active after restart.
- `nginx -t`: ok.
- Nginx was not reloaded.
- Loopback health after restart: `ok=true`, `authRequired=true`.

## Validation

Safe node inspect after restart:

| Node label | Pool | Status | Eligible | Protocol summary |
| --- | --- | --- | --- | --- |
| `prod-edge-a` | stable | online | yes | Shadowsocks |
| `prod-edge-b` | stable | online | yes | Shadowsocks |
| `channel-lab-b-tuic` | canary | online | yes | TUIC |

Redacted stable-pool policy equivalent:

- `stableTcpEligibleCount=2`;
- `autoIssuanceTargetResolvable=true`;
- `policyOk=true`;
- blockers: none.

The remote release still does not include `gccgw node policy-check`; it returned
`Unknown gccgw command: node policy-check --json`. This is expected for this
runtime-only mutation because no code release was deployed. The repo-only
`policy-check` implementation remains a follow-up deployment item.

Public boundary checks:

- `https://portal.globalcirclecat.com/`: HTTP 200.
- `https://portal.globalcirclecat.com/api/admin/platform/health`: HTTP 404
  through the portal vhost.
- Invalid empty portal order create request: HTTP 400 `validation_error`.
- Invalid empty portal order refresh request: HTTP 400 `validation_error`.
- Invalid empty portal order disable request: HTTP 400 `validation_error`.
- `https://sub.globalcirclecat.com/`: HTTP 200.

No live order or subscription was created during validation.

## Rollback

Rollback remains available from:

```text
/opt/proxy-gateway-minimal-candidate/backups/stable-tcp-fix-20260604T164746Z
```

Rollback shape:

1. restore the backed-up protected proxy server config;
2. restore the backed-up protected candidate env;
3. restart `proxy-gateway-candidate.service`;
4. validate health, safe node inspect, public Admin blocking, portal static, and
   no-session portal API rejection.

Do not print backup file contents during rollback.

## Conclusion

The production user portal automatic issuance path now points at conservative
stable TCP capacity:

- `prod-edge-a` and `prod-edge-b` are stable, online, Shadowsocks, and
  subscription-eligible;
- TUIC remains online but is scoped to canary instead of broad stable default;
- automatic issuance targets `prod-edge-a`;
- validation completed without live order creation and without exposing
  credentials or subscription material.
