# Aliyun TUIC Listener Material Preflight - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_tuic_listener_material_preflight
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

This record captures the read-only Phase 2 preparation for protected TUIC
listener certificate/private-key material on the Aliyun host.

Approved read-only target:

- existing TLS certificate path metadata;
- Nginx server-name and certificate directive metadata;
- protected Mihomo path metadata;
- service/listener non-activation boundary.

Forbidden changes were observed:

- no DNS mutation;
- no Nginx config mutation or reload;
- no firewall or provider security-group mutation;
- no payment mutation;
- no account or password generation;
- no live order creation;
- no passkey enablement;
- no token, password, subscription URL, raw config, raw log, raw env, raw
  certificate/private-key content, or SQLite row output;
- no `/etc/mihomo` file creation;
- no active or candidate Mihomo config creation;
- no `mihomo-tuic.service` start;
- no candidate runtime `current` symlink switch.

## Read-Only Inventory

Existing Let's Encrypt live certificate names:

- `portal.globalcirclecat.com`;
- `sub.globalcirclecat.com`.

Nginx server names observed:

- `portal.globalcirclecat.com`;
- `sub.globalcirclecat.com globalcirclecat.com www.globalcirclecat.com`;
- `_`.

Nginx certificate path metadata observed:

- certificate path for `portal.globalcirclecat.com`;
- private-key path for `portal.globalcirclecat.com`;
- certificate path for `sub.globalcirclecat.com`;
- private-key path for `sub.globalcirclecat.com`.

The exact path names are public operational metadata. Certificate and
private-key file contents were not printed.

Protected Mihomo path posture:

- `/etc/mihomo`: present, owned by `proxy-gateway-candidate`, mode `0700`.
- `/etc/mihomo/server.crt`: absent.
- `/etc/mihomo/server.key`: absent.
- `/etc/mihomo`: zero files.

Runtime boundary:

- `proxy-gateway-candidate.service`: active.
- `mihomo-tuic.service`: inactive.
- UDP 443: free.

## Recommended SNI And Source

Recommended TUIC host/SNI for Phase 2:

```text
sub.globalcirclecat.com
```

Reasoning:

- it is already the public subscription domain;
- it already has a Let's Encrypt certificate on the Aliyun host;
- TCP 443 remains served by Nginx while UDP 443 is currently free for TUIC;
- no DNS, Nginx, or firewall mutation is required for the certificate material
  wiring phase.

Recommended protected material source:

```text
/etc/letsencrypt/live/sub.globalcirclecat.com/fullchain.pem
/etc/letsencrypt/live/sub.globalcirclecat.com/privkey.pem
```

Recommended target paths:

```text
/etc/mihomo/server.crt
/etc/mihomo/server.key
```

Recommended copy strategy for Phase 2:

- copy the public full chain to `/etc/mihomo/server.crt`;
- copy the private key to `/etc/mihomo/server.key`;
- set owner to `proxy-gateway-candidate:proxy-gateway-candidate`;
- set certificate mode to `0644` or stricter;
- set private key mode to `0600`;
- do not create active or candidate Mihomo config;
- do not start `mihomo-tuic.service`;
- do not switch the candidate runtime `current` symlink.

Tradeoff:

- copying avoids broadening Mihomo service access to the Let's Encrypt live
  directory;
- the copy will not automatically follow certificate renewal until a later
  renewal hook/sync gate is added.

## Approval Template

```text
批准执行阿里云 TUIC protected listener material wiring：
target=Aliyun protected Mihomo listener material paths only；
sni=sub.globalcirclecat.com；
certificate_source=/etc/letsencrypt/live/sub.globalcirclecat.com/fullchain.pem；
private_key_source=/etc/letsencrypt/live/sub.globalcirclecat.com/privkey.pem；
certificate_target=/etc/mihomo/server.crt；
private_key_target=/etc/mihomo/server.key；
scope=backup existing /etc/mihomo/server.crt and /etc/mihomo/server.key if present; copy certificate/private-key from approved source paths to approved target paths; set owner proxy-gateway-candidate:proxy-gateway-candidate; set certificate mode 0644 or stricter; set private key mode 0600；
restart=no proxy restart; do not start mihomo-tuic.service；
validation=source files present by metadata only, target files present by metadata only, owner/mode correct, proxy active, mihomo-tuic.service inactive, UDP 443 free, no active TUIC config, no candidate TUIC config, portal static ok, Admin blocked, no-session portal APIs reject；
rollback=restore previous /etc/mihomo/server.crt and /etc/mihomo/server.key if backed up, or remove only files created by this gate；
forbidden=DNS, Nginx config/reload, firewall/security group, payment, account/password generation, live order creation, passkey enablement, subscription URL/token/password output, SQLite row dump, raw config/log/env/certificate/private-key output, active/candidate Mihomo config creation, mihomo-tuic.service start, current symlink switch。
```

## Conclusion

Phase 2 should copy existing `sub.globalcirclecat.com` TLS material into the
protected Mihomo runtime directory without starting TUIC. Full per-order
activation remains a separate later gate that enables the runtime adapter,
writes a generated Mihomo config, runs config-test, starts the service, and
validates UDP 443.
