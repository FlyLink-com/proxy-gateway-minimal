# Aliyun TUIC Env-Only Non-Activating Prewire - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_tuic_env_only_prewire
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

Approved target:

- Aliyun candidate env file only.

Approved mutation:

- back up `/opt/proxy-gateway-minimal-candidate/.env`;
- append or update only the non-activating TUIC edge lifecycle env keys;
- keep edge lifecycle disabled;
- keep production mutation disabled;
- keep the runtime adapter unset;
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
- no `/etc/mihomo` file creation;
- no active or candidate Mihomo config creation;
- no `mihomo-tuic.service` start;
- no candidate runtime `current` symlink switch.

## Preflight

Remote preflight before mutation:

- `/opt/proxy-gateway-minimal-candidate/.env`: present.
- env file owner: `proxy-gateway-candidate:proxy-gateway-candidate`.
- env file mode: `0600`.
- current candidate runtime release:
  `/opt/proxy-gateway-minimal-candidate/releases/c8c631cbd173`.
- staged `ae68072d727b` release: present.
- `EDGE_CREDENTIAL_RUNTIME_ADAPTER`: absent.
- `USER_PORTAL_EDGE_RUNTIME_ADAPTER`: absent.
- `proxy-gateway-candidate.service`: active.
- `mihomo-tuic.service`: disabled and inactive.
- `/etc/mihomo/config.yaml`: absent.
- `/etc/mihomo/config.candidate.yaml`: absent.
- `/etc/mihomo`: zero files.
- UDP 443: free.

No raw env values, config contents, credentials, subscription material, logs, or
SQLite rows were printed during preflight.

## Backup

Remote backup reference:

```text
/var/backups/gccgw-edge/tuic-env-only-prewire-20260605T153037Z
```

The backup contains the previous candidate env file. Its contents were not
printed.

## Mutation Applied

The candidate env file was updated with non-activating TUIC edge lifecycle
prewire keys only.

Validated key posture after the env update:

- `USER_PORTAL_EDGE_LIFECYCLE_ENABLED`: present and set to `false`.
- `USER_PORTAL_EDGE_CHANNEL_REF`: present.
- `EDGE_CREDENTIAL_MATERIAL_PATH`: present.
- `EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION`: present and set to
  `false`.
- `EDGE_MIHOMO_ACTIVE_CONFIG_PATH`: present.
- `EDGE_MIHOMO_CANDIDATE_CONFIG_PATH`: present.
- `EDGE_MIHOMO_BACKUP_DIR`: present.
- `EDGE_MIHOMO_SERVICE_NAME`: present.
- `EDGE_MIHOMO_BINARY`: present.
- `EDGE_MIHOMO_TUIC_PORT`: present.
- `EDGE_MIHOMO_TUIC_LISTEN`: present.
- `EDGE_MIHOMO_TUIC_CONGESTION_CONTROLLER`: present.
- `EDGE_MIHOMO_TUIC_ALPN`: present.
- `EDGE_CREDENTIAL_RUNTIME_ADAPTER`: absent.
- `USER_PORTAL_EDGE_RUNTIME_ADAPTER`: absent.

The env file remained owned by `proxy-gateway-candidate:proxy-gateway-candidate`
with mode `0600`.

## Restart

Only `proxy-gateway-candidate.service` was restarted.

Restart validation:

- `proxy-gateway-candidate.service`: active.
- restart result: success.
- service automatic restart count: `0`.
- `mihomo-tuic.service`: disabled and inactive.

## Validation

Post-mutation validation:

- `proxy-gateway-candidate.service`: active.
- `USER_PORTAL_EDGE_LIFECYCLE_ENABLED=false`: yes.
- `EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION=false`: yes.
- `EDGE_CREDENTIAL_RUNTIME_ADAPTER`: absent.
- `USER_PORTAL_EDGE_RUNTIME_ADAPTER`: absent.
- `/etc/mihomo/config.yaml`: absent.
- `/etc/mihomo/config.candidate.yaml`: absent.
- `/etc/mihomo`: zero files.
- UDP 443: free.
- current candidate runtime release remained:
  `/opt/proxy-gateway-minimal-candidate/releases/c8c631cbd173`.
- staged `ae68072d727b` release remained present.
- Public boundary:
  - `https://sub.globalcirclecat.com/api/health`: HTTP 200.
  - `https://portal.globalcirclecat.com/`: HTTP 200.
  - portal public Admin route: HTTP 404.
  - portal no-session access-request check: HTTP 400.

No live order or subscription was created during validation.

## Rollback

Rollback shape, if separately approved or required for incident response:

1. restore `/opt/proxy-gateway-minimal-candidate/.env` from the backup reference
   above;
2. set owner to `proxy-gateway-candidate:proxy-gateway-candidate`;
3. set mode to `0600`;
4. restart `proxy-gateway-candidate.service`;
5. validate proxy health, portal static availability, public Admin blocking,
   no-session portal API rejection, `mihomo-tuic.service` inactive state, no
   Mihomo config file, and UDP 443 free state.

Do not print raw env values, config contents, credentials, subscription
material, logs, or SQLite rows during rollback.

## Conclusion

The Aliyun candidate env file now contains non-activating TUIC edge lifecycle
prewire keys. Edge lifecycle remains disabled, production mutation remains
disabled, the runtime adapter remains unset, Mihomo remains inactive, and no
Mihomo config or listener material exists yet.

The next gate is protected listener material wiring with an explicit TUIC
host/SNI and certificate source. Full per-order activation remains a later
separate gate.
