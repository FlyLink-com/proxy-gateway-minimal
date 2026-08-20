# Aliyun TUIC Phase 3 Activation - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_tuic_phase3_activation
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

Approved target:

- Aliyun candidate runtime release;
- `proxy-gateway-candidate.service`;
- `mihomo-tuic.service`;
- protected Mihomo runtime config paths.

Approved release:

```text
ae68072d727b
```

Approved activation:

- switch candidate runtime `current` to the staged release;
- enable edge lifecycle runtime env;
- enable production edge credential mutation;
- configure the Mihomo explicit-restart runtime adapter;
- create an empty-user seed TUIC config;
- run Mihomo config-test;
- start `mihomo-tuic.service`;
- restart `proxy-gateway-candidate.service`;
- validate UDP 443 listener.

Forbidden changes were observed:

- no DNS mutation;
- no Nginx config mutation or reload;
- no firewall or provider security-group mutation;
- no payment mutation;
- no account or password generation;
- no live order creation;
- no passkey enablement;
- no token, password, subscription URL, raw config, raw log, raw env, raw
  certificate/private-key content, or SQLite row output.

## Preflight

Preflight posture:

- candidate env file: present.
- current candidate runtime release:
  `/opt/proxy-gateway-minimal-candidate/releases/c8c631cbd173`.
- staged release `ae68072d727b`: present.
- staged release `package-lock.json`: present.
- staged release `node_modules`: present.
- `USER_PORTAL_EDGE_LIFECYCLE_ENABLED=false`: yes.
- `EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION=false`: yes.
- edge lifecycle channel and protected path keys: present.
- `EDGE_CREDENTIAL_RUNTIME_ADAPTER`: absent.
- `USER_PORTAL_EDGE_RUNTIME_ADAPTER`: absent.
- `/etc/mihomo/server.crt`: present, owner
  `proxy-gateway-candidate:proxy-gateway-candidate`, mode `0644`.
- `/etc/mihomo/server.key`: present, owner
  `proxy-gateway-candidate:proxy-gateway-candidate`, mode `0600`.
- `/etc/mihomo/config.yaml`: absent.
- `/etc/mihomo/config.candidate.yaml`: absent.
- protected edge credential material file: absent.
- `proxy-gateway-candidate.service`: active.
- `mihomo-tuic.service`: disabled and inactive.
- UDP 443: free.

No raw env values, runtime config, credential material, subscription material,
certificate/private-key contents, logs, or SQLite rows were printed.

## Failed First Attempt

Backup reference for the first attempt:

```text
/var/backups/gccgw-edge/tuic-phase3-activation-20260605T154717Z
```

First attempt sequence:

- wrote an empty-user candidate TUIC config;
- Mihomo config-test returned ok;
- switched candidate runtime to `ae68072d727b`;
- started `mihomo-tuic.service`;
- restarted `proxy-gateway-candidate.service`;
- `mihomo-tuic.service` reported active;
- UDP 443 listener did not appear.

The deployment script treated missing UDP 443 as a hard failure and rolled back:

- candidate runtime `current` restored to `c8c631cbd173`;
- candidate env restored;
- Mihomo config files removed/restored to pre-attempt state;
- `mihomo-tuic.service` stopped;
- `proxy-gateway-candidate.service` restarted.

Rollback validation after the failed first attempt:

- current release restored to `c8c631cbd173`;
- proxy active;
- Mihomo disabled and inactive;
- edge lifecycle disabled;
- production mutation disabled;
- runtime adapter absent;
- cert/key material still staged;
- active/candidate Mihomo config absent;
- UDP 443 free;
- health 200, portal 200, public Admin 404, no-session portal API 400.

## Root Cause

Runtime diagnostics showed that the TUIC config shape was valid, but Mihomo
refused to read the `/etc/mihomo/server.crt` path at runtime because the path
was not under Mihomo home or `SAFE_PATHS`.

Reference:

- Official Mihomo docs describe `SAFE_PATHS` for paths outside the working
  directory:
  `https://wiki.metacubex.one/en/config/general/`.
- Official Mihomo TUIC v5 listener docs confirm the listener `users` map shape:
  `https://wiki.metacubex.one/en/config/inbound/listeners/tuic-v5/`.

Temporary probes confirmed:

- without `SAFE_PATHS`, high-port TUIC listener did not appear;
- with `SAFE_PATHS=/etc/mihomo`, both empty-user and dummy-user temporary TUIC
  configs produced a UDP listener;
- temporary probe processes were stopped and UDP 443 remained free before the
  final retry.

## Successful Mutation

Backup reference for the successful activation:

```text
/var/backups/gccgw-edge/tuic-phase3-activation-safe-paths-20260605T155503Z
```

Mutation applied:

- added a `SAFE_PATHS=/etc/mihomo` drop-in for
  `proxy-gateway-candidate.service`;
- added a `SAFE_PATHS=/etc/mihomo` drop-in for `mihomo-tuic.service`;
- ran `systemctl daemon-reload`;
- wrote `/etc/mihomo/config.candidate.yaml` as an empty-user seed TUIC config;
- ran Mihomo config-test with `SAFE_PATHS=/etc/mihomo`: ok;
- copied the seed config to `/etc/mihomo/config.yaml`;
- updated candidate env for:
  - `SAFE_PATHS=/etc/mihomo`;
  - edge lifecycle enabled;
  - edge credential production mutation enabled;
  - Mihomo explicit-restart runtime adapter;
  - active/candidate config paths;
  - backup directory;
  - service name;
  - Mihomo binary;
  - TUIC listener port/listen/alpn/congestion controller;
  - certificate/private-key paths;
- switched candidate runtime `current` to `ae68072d727b`;
- restarted `mihomo-tuic.service`;
- restarted `proxy-gateway-candidate.service`.

The seed config intentionally contains no users. It provides a validated TUIC
listener base. Future delivered orders should create protected edge credential
material and let the runtime adapter replace the managed users section.

## Validation

Post-activation validation:

- current release:
  `/opt/proxy-gateway-minimal-candidate/releases/ae68072d727b`.
- `proxy-gateway-candidate.service`: active.
- proxy restart result: success.
- proxy automatic restart count: `0`.
- `mihomo-tuic.service`: active.
- Mihomo service enabled state: disabled.
- Mihomo restart result: success.
- Mihomo automatic restart count: `0`.
- UDP 443: present.
- `/etc/mihomo/config.yaml`: present, owner
  `proxy-gateway-candidate:proxy-gateway-candidate`, mode `0600`.
- `/etc/mihomo/config.candidate.yaml`: present, owner
  `proxy-gateway-candidate:proxy-gateway-candidate`, mode `0600`.
- `/etc/mihomo/server.crt`: present, owner
  `proxy-gateway-candidate:proxy-gateway-candidate`, mode `0644`.
- `/etc/mihomo/server.key`: present, owner
  `proxy-gateway-candidate:proxy-gateway-candidate`, mode `0600`.
- protected edge credential material file: absent.
- `https://sub.globalcirclecat.com/api/health`: HTTP 200.
- `https://portal.globalcirclecat.com/`: HTTP 200.
- portal public Admin route: HTTP 404.
- portal no-session access-request check: HTTP 400.
- node policy check: ok, redacted, zero blockers.
- data-plane lifecycle policy check: ok, redacted, zero blockers.

No live order or subscription was created during validation.

## Rollback

Rollback shape, if separately approved or required for incident response:

1. stop `mihomo-tuic.service`;
2. restore `/opt/proxy-gateway-minimal-candidate/.env` from the successful
   activation backup above;
3. restore candidate runtime `current` to the previous release recorded in that
   backup;
4. restore or remove `/etc/mihomo/config.yaml` and
   `/etc/mihomo/config.candidate.yaml` according to the backup markers;
5. restore or remove the `SAFE_PATHS` drop-ins according to the backup markers;
6. run `systemctl daemon-reload`;
7. restart `proxy-gateway-candidate.service`;
8. validate proxy health, portal static availability, public Admin blocking,
   no-session portal API rejection, `mihomo-tuic.service` inactive state, and
   UDP 443 free state.

Do not print raw runtime config, env values, credentials, subscription
material, certificate/private-key contents, logs, or SQLite rows during
rollback.

## Conclusion

Aliyun Phase 3 activation is complete. The candidate runtime now points to
`ae68072d727b`, the proxy service is healthy, Mihomo TUIC is active, UDP 443 is
listening, and the edge lifecycle runtime adapter is enabled. No live order was
created during validation, so the protected per-order material file remains
absent until the next delivered order triggers credential issuance.
