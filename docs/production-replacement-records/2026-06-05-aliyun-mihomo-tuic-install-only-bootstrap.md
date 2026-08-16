# Aliyun Mihomo TUIC Install-Only Bootstrap - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_mihomo_tuic_install_only_bootstrap
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

Approved target:

- Aliyun host only.
- Mihomo v1.19.25 linux amd64 compatible.
- Install-only bootstrap for the future `channel-aliyun-a-tuic` runtime.

Approved mutation:

- download the reviewed Mihomo release asset to `/tmp`;
- verify the approved asset SHA256 before install;
- install `/opt/mihomo/bin/mihomo`;
- create the dedicated `mihomo` system user and group if absent;
- set `cap_net_bind_service` on the binary;
- create `/etc/mihomo`, `/var/lib/mihomo`, `/var/log/mihomo`, and
  `/var/backups/gccgw-edge`;
- install `/etc/systemd/system/mihomo-tuic.service`;
- keep the unit disabled and inactive.

Forbidden changes were observed:

- no DNS mutation;
- no Nginx config mutation or reload;
- no firewall or provider security-group mutation;
- no public Admin enablement;
- no payment mutation;
- no account or password generation;
- no live order creation;
- no passkey enablement;
- no token, password, subscription URL, raw config, raw log, raw env, or SQLite
  row output;
- no `proxy-gateway-candidate.service` restart;
- no `mihomo-tuic.service` start;
- no active TUIC config write.

## Preflight

- Host OS: Ubuntu 24.04 amd64.
- SSH user: root.
- Required tooling was present: `curl`, `gzip`, `sha256sum`, `install`,
  `systemctl`, `ss`, `setcap`, `getcap`, and user/group management tools.
- `proxy-gateway-candidate.service`: active before mutation.
- Existing `mihomo-tuic.service`: absent.
- Existing `/opt/mihomo/bin/mihomo`: absent.
- Existing `/etc/mihomo/config.yaml`: absent.
- UDP 443: free.
- Public boundary before mutation:
  - `https://sub.globalcirclecat.com/api/health`: HTTP 200.
  - `https://portal.globalcirclecat.com/`: HTTP 200.
  - portal public Admin route: HTTP 404.

## Asset

Approved source:

```text
https://github.com/MetaCubeX/mihomo/releases/download/v1.19.25/mihomo-linux-amd64-compatible-v1.19.25.gz
```

Approved asset SHA256:

```text
8d14bf2edbf2911db004abaed12754d63041eaf87e565af6f1e589883cd93ec8
```

The downloaded asset was verified against the approved SHA256 before install.

## Mutation Applied

Install-only bootstrap completed:

- dedicated `mihomo` system identity created or confirmed;
- Mihomo binary installed under `/opt/mihomo/bin/mihomo`;
- binary capability set for binding privileged ports;
- runtime directories created with restricted ownership and permissions;
- `mihomo-tuic.service` unit installed;
- systemd daemon reloaded;
- service left disabled and inactive.

No `/etc/mihomo/config.yaml` file was created during this bootstrap.

## Validation

Post-mutation validation:

- Mihomo version: v1.19.25 linux amd64.
- Binary capability: `cap_net_bind_service`.
- `mihomo-tuic.service`: loaded, disabled, inactive.
- `/etc/mihomo/config.yaml`: absent.
- UDP 443: free.
- `proxy-gateway-candidate.service`: active.
- Nginx config test: ok.
- Candidate release pointer unchanged:
  `/opt/proxy-gateway-minimal-candidate/releases/c8c631cbd173`.
- Public boundary after mutation:
  - `https://sub.globalcirclecat.com/api/health`: HTTP 200.
  - `https://portal.globalcirclecat.com/`: HTTP 200.
  - portal public Admin route: HTTP 404.
  - portal no-session access-request check: rejected.

No live order or subscription was created during validation.

## Rollback

Rollback shape, if separately approved or required for incident response:

1. remove `/opt/mihomo`;
2. remove `/etc/systemd/system/mihomo-tuic.service`;
3. remove `/etc/mihomo` only if no active runtime config has been created after
   this bootstrap;
4. optionally remove `/var/lib/mihomo`, `/var/log/mihomo`, and the bootstrap
   backup directory if no later runtime uses them;
5. run `systemctl daemon-reload`;
6. validate `proxy-gateway-candidate.service`, public Admin blocking, portal
   static availability, and no-session portal API rejection.

Do not print raw runtime config, logs, env values, credentials, subscription
material, or SQLite rows during rollback.

## Conclusion

The Aliyun host now has the install-only Mihomo TUIC runtime prerequisites for
the next per-order credential lifecycle gate. The TUIC service is not running
and no active TUIC config exists yet.

The next gate is the previously prepared per-order deployment that writes the
reviewed runtime config, runs config-test, starts or restarts
`mihomo-tuic.service`, validates UDP 443, and then switches the candidate
runtime release under a separate exact approval.
