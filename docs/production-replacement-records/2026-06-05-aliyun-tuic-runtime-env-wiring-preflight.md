# Aliyun TUIC Runtime Env Wiring Preflight - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_tuic_runtime_env_wiring_preflight
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

This record captures the read-only preparation after the Aliyun TUIC per-order
activation stopped before runtime mutation. It does not approve or execute
production env mutation, protected material creation, Mihomo config writes, or
service activation.

Approved read-only target:

- Aliyun candidate service env file metadata and key inventory;
- protected Mihomo path metadata;
- local code-derived runtime key requirements;
- next exact approval template.

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
- no env value output;
- no active TUIC config write;
- no `mihomo-tuic.service` start;
- no candidate runtime `current` symlink switch.

## Read-Only Inventory

Candidate service env file:

- path: `/opt/proxy-gateway-minimal-candidate/.env`;
- present: yes;
- owner: `proxy-gateway-candidate:proxy-gateway-candidate`;
- mode: `0600`.

Existing env key names included:

- `ADMIN_ALLOWED_CIDRS`;
- `CONSOLE_PORT`;
- `CONSOLE_TOKEN`;
- `PUBLIC_SUBSCRIPTION_BASE_URL`;
- `SS_PASSWORD`;
- `SUBSCRIPTION_CONTROL_DB_PATH`;
- `SUBSCRIPTION_DB_PATH`;
- `SUBSCRIPTION_TEMP_LINK_TTL_MINUTES`;
- `SUB_RATE_LIMIT_MAX`;
- `SUB_RATE_LIMIT_WINDOW_MS`;
- `TUIC_CHANNEL_LAB_B_PASSWORD`;
- `TUIC_CHANNEL_LAB_B_UUID`;
- `USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION`;
- `USER_PORTAL_AUTO_ISSUANCE_30D_MONTHLY_LIMIT`;
- `USER_PORTAL_AUTO_ISSUANCE_7D_MONTHLY_LIMIT`;
- `USER_PORTAL_AUTO_ISSUANCE_ENABLED`;
- `USER_PORTAL_AUTO_ISSUANCE_NODE_ID`;
- `USER_PORTAL_ROUTES_ENABLED`.

The following edge lifecycle and Mihomo runtime keys were absent:

- `USER_PORTAL_EDGE_LIFECYCLE_ENABLED`;
- `EDGE_CREDENTIAL_LIFECYCLE_ENABLED`;
- `USER_PORTAL_EDGE_CHANNEL_REF`;
- `EDGE_CREDENTIAL_CHANNEL_REF`;
- `EDGE_CREDENTIAL_MATERIAL_PATH`;
- `USER_PORTAL_EDGE_MATERIAL_PATH`;
- `EDGE_CREDENTIAL_RUNTIME_ADAPTER`;
- `USER_PORTAL_EDGE_RUNTIME_ADAPTER`;
- `EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION`;
- `EDGE_MIHOMO_ACTIVE_CONFIG_PATH`;
- `EDGE_MIHOMO_CANDIDATE_CONFIG_PATH`;
- `EDGE_MIHOMO_BACKUP_DIR`;
- `EDGE_MIHOMO_SERVICE_NAME`;
- `EDGE_MIHOMO_BINARY`;
- `EDGE_MIHOMO_TUIC_PORT`;
- `EDGE_MIHOMO_TUIC_LISTEN`;
- `EDGE_MIHOMO_TUIC_CERTIFICATE_PATH`;
- `EDGE_MIHOMO_TUIC_PRIVATE_KEY_PATH`;
- `EDGE_MIHOMO_TUIC_CONGESTION_CONTROLLER`;
- `EDGE_MIHOMO_TUIC_ALPN`.

Protected path inventory:

- `/etc/mihomo`: present, owned by `proxy-gateway-candidate`, mode `0700`.
- `/var/backups/gccgw-edge`: present, owned by `proxy-gateway-candidate`,
  mode `0700`.
- `/opt/proxy-gateway-minimal-candidate/state`: present, owned by
  `proxy-gateway-candidate`, mode `0700`.
- `/etc/mihomo`: zero files at the time of inventory.
- `/etc/mihomo/config.yaml`: absent.
- `/etc/mihomo/config.candidate.yaml`: absent.
- `/etc/mihomo/server.crt`: absent.
- `/etc/mihomo/server.key`: absent.
- `/etc/mihomo/edge-credential-material.json`: absent.
- `/opt/proxy-gateway-minimal-candidate/state/edge-credential-material.json`:
  absent.

## Code-Derived Runtime Requirements

`createRuntimeState(...)` wires edge lifecycle only when an edge lifecycle flag
is enabled and a channel reference is configured. With the Mihomo explicit
restart adapter, the runtime also requires protected config paths, backup path,
and listener certificate/private-key paths.

Full activation runtime env keys, derived from code:

```text
USER_PORTAL_EDGE_LIFECYCLE_ENABLED=true
USER_PORTAL_EDGE_CHANNEL_REF=channel-aliyun-a-tuic
EDGE_CREDENTIAL_MATERIAL_PATH=/opt/proxy-gateway-minimal-candidate/state/edge-credential-material.json
EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION=true
EDGE_CREDENTIAL_RUNTIME_ADAPTER=mihomo-tuic-explicit-restart
EDGE_MIHOMO_ACTIVE_CONFIG_PATH=/etc/mihomo/config.yaml
EDGE_MIHOMO_CANDIDATE_CONFIG_PATH=/etc/mihomo/config.candidate.yaml
EDGE_MIHOMO_BACKUP_DIR=/var/backups/gccgw-edge
EDGE_MIHOMO_SERVICE_NAME=mihomo-tuic.service
EDGE_MIHOMO_BINARY=/opt/mihomo/bin/mihomo
EDGE_MIHOMO_TUIC_PORT=443
EDGE_MIHOMO_TUIC_LISTEN=0.0.0.0
EDGE_MIHOMO_TUIC_CERTIFICATE_PATH=/etc/mihomo/server.crt
EDGE_MIHOMO_TUIC_PRIVATE_KEY_PATH=/etc/mihomo/server.key
EDGE_MIHOMO_TUIC_CONGESTION_CONTROLLER=bbr
EDGE_MIHOMO_TUIC_ALPN=h3
```

These are the keys needed for a later full activation gate. The non-activating
Phase 1 gate must use only the subset in the approval template below, must keep
production mutation disabled, and must not configure the runtime adapter yet.

Do not output the env file values during mutation or validation.

## Behavior Boundary

When edge lifecycle is enabled:

- delivered portal orders get an edge credential reference and material digest;
- raw material is written to the protected material file;
- `reconcileOrderLifecycle(...)` builds a full desired-state snapshot;
- with `EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION=true` and the
  Mihomo runtime adapter configured, the runtime writes candidate config, runs
  Mihomo config-test, backs up active config, replaces active config, restarts
  `mihomo-tuic.service`, and validates service/listener state.

Important implication:

- enabling non-activating env keys alone does not create a live order;
- the first active order after enablement can become the first runtime material
  source;
- starting `mihomo-tuic.service` before a valid generated config exists remains
  unsafe.

## Recommended Next Gate

The next gates should be split into three explicit phases.

Phase 1: env-only non-activating prewire.

- back up `/opt/proxy-gateway-minimal-candidate/.env`;
- append or update only the non-activating env keys listed below;
- set `USER_PORTAL_EDGE_LIFECYCLE_ENABLED=false`;
- set `EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION=false`;
- do not configure `EDGE_CREDENTIAL_RUNTIME_ADAPTER`;
- do not create or import listener certificate/private-key material;
- do not create active or candidate Mihomo config;
- do not switch the candidate runtime `current` symlink;
- keep `mihomo-tuic.service` inactive;
- restart `proxy-gateway-candidate.service`;
- validate proxy health, portal static, public Admin blocked, no-session portal
  API rejection, env key presence by key name only, and Mihomo inactive/UDP 443
  free state.

Phase 2: protected listener material wiring.

- name the TUIC host/SNI and certificate source;
- create or import protected TUIC listener certificate/private-key material
  under `/etc/mihomo`;
- set owner to `proxy-gateway-candidate:proxy-gateway-candidate`;
- set certificate mode to `0644` or stricter;
- set private key mode to `0600`;
- keep `mihomo-tuic.service` inactive;
- do not create active or candidate Mihomo config.

Phase 3: first generated Mihomo runtime config activation.

- do not create a live order during deployment validation;
- use a separately approved safe desired-state seed or wait for a real approved
  order event to generate material;
- switch the candidate runtime `current` symlink only if approved in this gate;
- set `USER_PORTAL_EDGE_LIFECYCLE_ENABLED=true` only in this activation phase;
- enable `EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION=true` only in
  this activation phase;
- configure `EDGE_CREDENTIAL_RUNTIME_ADAPTER=mihomo-tuic-explicit-restart` and
  the `EDGE_MIHOMO_*` runtime adapter keys only when config-test/service
  activation are approved;
- run Mihomo config-test against the candidate config;
- start or restart `mihomo-tuic.service` only after config-test passes;
- validate service active and UDP 443 listener present;
- record redacted receipt and rollback reference.

## Approval Template

```text
批准执行阿里云 TUIC env-only non-activating prewire：
target=Aliyun candidate env file only；
release=ae68072d727b staged, do not switch current yet；
scope=backup /opt/proxy-gateway-minimal-candidate/.env; append/update only these keys:
USER_PORTAL_EDGE_LIFECYCLE_ENABLED=false,
USER_PORTAL_EDGE_CHANNEL_REF=channel-aliyun-a-tuic,
EDGE_CREDENTIAL_MATERIAL_PATH=/opt/proxy-gateway-minimal-candidate/state/edge-credential-material.json,
EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION=false,
EDGE_MIHOMO_ACTIVE_CONFIG_PATH=/etc/mihomo/config.yaml,
EDGE_MIHOMO_CANDIDATE_CONFIG_PATH=/etc/mihomo/config.candidate.yaml,
EDGE_MIHOMO_BACKUP_DIR=/var/backups/gccgw-edge,
EDGE_MIHOMO_SERVICE_NAME=mihomo-tuic.service,
EDGE_MIHOMO_BINARY=/opt/mihomo/bin/mihomo,
EDGE_MIHOMO_TUIC_PORT=443,
EDGE_MIHOMO_TUIC_LISTEN=0.0.0.0,
EDGE_MIHOMO_TUIC_CONGESTION_CONTROLLER=bbr,
EDGE_MIHOMO_TUIC_ALPN=h3;
explicitly do not set EDGE_CREDENTIAL_RUNTIME_ADAPTER;
do not create/import listener certificate/private-key;
do not create active or candidate Mihomo config;
do not enable edge lifecycle;
restart=proxy-gateway-candidate.service only after env validation; do not start mihomo-tuic.service；
validation=proxy health ok, portal static ok, Admin blocked, no-session portal APIs reject, edge env keys present by key name only, USER_PORTAL_EDGE_LIFECYCLE_ENABLED=false, EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION=false, EDGE_CREDENTIAL_RUNTIME_ADAPTER absent, mihomo-tuic.service inactive, UDP 443 free, no active TUIC config, no candidate TUIC config；
rollback=restore env backup and restart proxy-gateway-candidate.service；
forbidden=DNS, Nginx config/reload, firewall/security group, payment, account/password generation, live order creation, passkey enablement, subscription URL/token/password output, SQLite row dump, raw config/log/env output, /etc/mihomo file creation, mihomo-tuic.service start, current symlink switch。
```

## Conclusion

The next safe mutation is not a full TUIC activation. It is non-activating
runtime env wiring while keeping edge lifecycle disabled, production mutation
disabled, Mihomo inactive, and UDP 443 free. Listener certificate/private-key
creation or import still needs a named TUIC host/SNI and certificate source.
Full per-order activation still needs a later gate that enables the runtime
adapter, produces or consumes a valid desired-state snapshot, and passes Mihomo
config-test before service start.
