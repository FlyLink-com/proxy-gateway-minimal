# Aliyun TUIC Per-Order Permission Gate - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_tuic_per_order_permission_gate
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

Approved target:

- Aliyun systemd units.
- Protected Mihomo runtime paths only.

Approved mutation:

- allow `proxy-gateway-candidate.service` to write the protected Mihomo config
  and backup paths used by the per-order lifecycle gate;
- run `mihomo-tuic.service` as the `proxy-gateway-candidate` identity so it can
  read the future managed `0600` runtime config;
- adjust ownership and permissions for `/etc/mihomo` and
  `/var/backups/gccgw-edge`;
- run `systemctl daemon-reload`;
- restart `proxy-gateway-candidate.service` only.

Forbidden changes were observed:

- no DNS mutation;
- no Nginx config mutation or reload;
- no firewall or provider security-group mutation;
- no payment mutation;
- no account or password generation;
- no live order creation;
- no passkey enablement;
- no token, password, subscription URL, raw config, raw log, raw env, or SQLite
  row output;
- no active TUIC config write;
- no `mihomo-tuic.service` start.

## Preflight

Preflight posture:

- `proxy-gateway-candidate.service`: active.
- `mihomo-tuic.service`: loaded, disabled, inactive.
- `/etc/mihomo/config.yaml`: absent.
- UDP 443: free.
- No per-order permission drop-ins existed before this gate.

Relevant protected path and unit posture before mutation:

- `/etc/systemd/system/proxy-gateway-candidate.service`: root-owned.
- `/etc/systemd/system/mihomo-tuic.service`: root-owned.
- `/etc/mihomo`: owned by `root:mihomo`, restricted directory mode.
- `/var/backups/gccgw-edge`: owned by `root:root`, restricted directory mode.

No raw unit contents, raw config, logs, env values, credentials, subscription
material, or SQLite rows were printed or copied into this record.

## Backup

Remote backup reference:

```text
/var/backups/gccgw-edge/tuic-per-order-permission-gate-20260605T145921Z
```

The backup includes the previous systemd unit files and metadata needed for a
later rollback. Raw backup contents were not printed.

## Mutation Applied

Permission gate mutation completed:

- installed a systemd drop-in for `proxy-gateway-candidate.service` that allows
  managed writes to:
  - `/opt/proxy-gateway-minimal-candidate/state`;
  - `/etc/mihomo`;
  - `/var/backups/gccgw-edge`;
- installed a systemd drop-in for `mihomo-tuic.service` to run as:
  - user: `proxy-gateway-candidate`;
  - group: `proxy-gateway-candidate`;
- changed `/etc/mihomo` ownership to `proxy-gateway-candidate`;
- changed `/var/backups/gccgw-edge` ownership to `proxy-gateway-candidate`;
- kept both protected directories restricted to the service identity;
- ran `systemctl daemon-reload`;
- restarted `proxy-gateway-candidate.service` only.

No `/etc/mihomo/config.yaml` file was created during this gate.

## Validation

Post-mutation validation:

- `proxy-gateway-candidate.service`: active.
- `proxy-gateway-candidate.service` restart result: success.
- `proxy-gateway-candidate.service` restart count: `0`.
- Effective writable paths for `proxy-gateway-candidate.service`:
  `/opt/proxy-gateway-minimal-candidate/state /etc/mihomo /var/backups/gccgw-edge`.
- `mihomo-tuic.service`: disabled and inactive.
- Effective `mihomo-tuic.service` runtime identity:
  `proxy-gateway-candidate:proxy-gateway-candidate`.
- `/etc/mihomo/config.yaml`: absent.
- UDP 443: free.
- Nginx config test: ok.
- Candidate runtime release pointer unchanged:
  `/opt/proxy-gateway-minimal-candidate/releases/c8c631cbd173`.
- Public boundary after mutation:
  - `https://sub.globalcirclecat.com/api/health`: HTTP 200.
  - `https://portal.globalcirclecat.com/`: HTTP 200.
  - portal public Admin route: HTTP 404.
  - portal no-session access-request check: rejected.

No live order or subscription was created during validation.

## Rollback

Rollback shape, if separately approved or required for incident response:

1. remove or restore the permission-gate drop-ins for
   `proxy-gateway-candidate.service` and `mihomo-tuic.service`;
2. restore previous unit files and metadata from the backup reference above;
3. restore `/etc/mihomo` to the pre-gate owner and restricted mode if no later
   active runtime config depends on the new service identity;
4. restore `/var/backups/gccgw-edge` to the pre-gate owner and restricted mode
   if no later active runtime uses the new service identity;
5. run `systemctl daemon-reload`;
6. restart `proxy-gateway-candidate.service`;
7. validate proxy health, portal static availability, public Admin blocking,
   no-session portal API rejection, `mihomo-tuic.service` inactive state, and
   UDP 443 free state.

Do not print raw runtime config, logs, env values, credentials, subscription
material, or SQLite rows during rollback.

## Conclusion

The Aliyun host now has the permission boundary required for the next
per-order TUIC lifecycle gate. The proxy service can write the protected Mihomo
paths, and the future Mihomo TUIC service can read a service-owned managed
config, but the TUIC service is still inactive and no active TUIC config exists.

The next gate remains a separate deployment approval: write the reviewed
per-order runtime config, run Mihomo config-test, start or restart
`mihomo-tuic.service`, validate UDP 443, and only then resume the candidate
runtime upgrade.
