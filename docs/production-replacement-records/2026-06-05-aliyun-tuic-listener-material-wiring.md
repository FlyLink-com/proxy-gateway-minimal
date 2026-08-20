# Aliyun TUIC Listener Material Wiring - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_tuic_listener_material_wiring
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

Approved target:

- Aliyun protected Mihomo listener material paths only.

Approved SNI:

```text
sub.globalcirclecat.com
```

Approved source paths:

```text
/etc/letsencrypt/live/sub.globalcirclecat.com/fullchain.pem
/etc/letsencrypt/live/sub.globalcirclecat.com/privkey.pem
```

Approved target paths:

```text
/etc/mihomo/server.crt
/etc/mihomo/server.key
```

Approved mutation:

- back up existing target files if present;
- copy the approved certificate and private key into `/etc/mihomo`;
- set owner to `proxy-gateway-candidate:proxy-gateway-candidate`;
- set certificate mode to `0644`;
- set private-key mode to `0600`;
- do not restart `proxy-gateway-candidate.service`;
- do not start `mihomo-tuic.service`.

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
- no active or candidate Mihomo config creation;
- no `mihomo-tuic.service` start;
- no candidate runtime `current` symlink switch.

## Preflight

Remote preflight before mutation:

- source certificate path: present.
- source private-key path: present.
- `/etc/mihomo`: present, owned by `proxy-gateway-candidate`, mode `0700`.
- `/etc/mihomo/server.crt`: absent.
- `/etc/mihomo/server.key`: absent.
- `proxy-gateway-candidate.service`: active.
- `mihomo-tuic.service`: disabled and inactive.
- `/etc/mihomo/config.yaml`: absent.
- `/etc/mihomo/config.candidate.yaml`: absent.
- UDP 443: free.

Source file contents were not printed.

## Backup

Remote backup reference:

```text
/var/backups/gccgw-edge/tuic-listener-material-20260605T153818Z
```

The target files were absent before mutation, so the backup directory contains
absence markers for rollback. Backup contents were not printed.

## Mutation Applied

Listener material wiring completed:

- copied the approved certificate to `/etc/mihomo/server.crt`;
- copied the approved private key to `/etc/mihomo/server.key`;
- set owner to `proxy-gateway-candidate:proxy-gateway-candidate`;
- set certificate mode to `0644`;
- set private-key mode to `0600`.

The copy command completed the material copy. Its final metadata reporting block
had a shell syntax error, so an independent validation command was run
immediately afterward. That validation confirmed the target files and
non-activation boundaries were correct.

## Validation

Independent post-mutation validation:

- `/etc/mihomo/server.crt`: present, regular file, owner
  `proxy-gateway-candidate:proxy-gateway-candidate`, mode `0644`, non-empty
  small file.
- `/etc/mihomo/server.key`: present, regular file, owner
  `proxy-gateway-candidate:proxy-gateway-candidate`, mode `0600`, non-empty
  small file.
- certificate ownership/mode check: ok.
- private-key ownership/mode check: ok.
- `proxy-gateway-candidate.service`: active.
- `mihomo-tuic.service`: disabled and inactive.
- `/etc/mihomo/config.yaml`: absent.
- `/etc/mihomo/config.candidate.yaml`: absent.
- UDP 443: free.
- `/etc/mihomo`: two files.
- current candidate runtime release remained:
  `/opt/proxy-gateway-minimal-candidate/releases/c8c631cbd173`.
- Public boundary:
  - `https://sub.globalcirclecat.com/api/health`: HTTP 200.
  - `https://portal.globalcirclecat.com/`: HTTP 200.
  - portal public Admin route: HTTP 404.
  - portal no-session access-request check: HTTP 400.

No live order or subscription was created during validation.

## Rollback

Rollback shape, if separately approved or required for incident response:

1. remove `/etc/mihomo/server.crt` and `/etc/mihomo/server.key` because they
   were created by this gate and no previous target files existed;
2. if future gates replace these files, restore from the latest relevant backup
   instead of deleting blindly;
3. validate `proxy-gateway-candidate.service` active state,
   `mihomo-tuic.service` inactive state, no active/candidate Mihomo config, UDP
   443 free state, portal static availability, public Admin blocking, and
   no-session portal API rejection.

Do not print raw certificate/private-key contents, raw env values, raw config,
credentials, subscription material, logs, or SQLite rows during rollback.

## Conclusion

Aliyun now has protected TUIC listener certificate/private-key material staged
under `/etc/mihomo`. Mihomo remains inactive, no TUIC config exists, UDP 443
remains free, and the candidate runtime `current` symlink was not changed.

The next gate is full per-order activation: enable the runtime adapter, enable
production mutation, switch the candidate runtime if approved, produce or
consume a valid desired-state snapshot, run Mihomo config-test, and only then
start or restart `mihomo-tuic.service`.
