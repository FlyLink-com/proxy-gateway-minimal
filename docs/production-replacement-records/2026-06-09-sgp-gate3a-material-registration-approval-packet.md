# SGP Gate 3A Material Registration Approval Packet


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: sgp_gate3a_material_registration_approval_packet
  superseded_by: null
  last_verified_at: 2026-06-09
  production_authority: false
```


Date: 2026-06-09, Asia/Shanghai.

Risk tier: A production protected-material registration.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This packet is a planning and approval packet. It is not itself production
approval. It does not contain raw environment values, raw runtime config, raw
logs, SQLite rows, account credentials, subscription URLs, tokens, passwords,
private keys, or customer data.

## Reason

SGP Gate 3 data-plane apply preflight found:

- Japan-to-SGP SSH works;
- SGP data-plane services and listeners are active;
- Xray and Mihomo can be config-tested with supported commands;
- Japan protected handoff queue currently has zero pending handoff files;
- Japan protected environment does not resolve the SGP channel placeholders:
  - `channel-sgp-a-vless-reality-tcp`;
  - `channel-sgp-a-hy2`;
  - `channel-sgp-a-tuic`.

Therefore Gate 3 must not apply or declare SGP closed until the control plane
has a protected, reviewable source for SGP channel material.

## Design Boundary

There are two different material classes. They must not be mixed:

1. Static channel material needed to render the public subscription bundle:
   host, SNI, VLESS Reality public key, VLESS short id, and static channel
   placeholders used by `config/proxy-servers.json`.
2. Per-order credential material anchored by `edgeCredentialRef`, stored through
   `EDGE_CREDENTIAL_MATERIAL_PATH`, and dispatched to runtime adapters or remote
   handoff.

This Gate 3A only addresses class 1. It must not dump, rewrite, or export the
per-order material store.

## Allowed Actions After Exact Approval

On Japan control plane only:

- backup protected env and current release env;
- backup protected proxy config and control/subscription DB files if configured;
- add only missing `SGP_*` protected environment keys required by
  `config/proxy-servers.json`;
- source values only from operator-protected runtime material or a reviewed
  protected handoff file;
- keep values out of stdout, docs, shell history, Git, and process arguments
  when practical;
- restart `proxy-gateway-candidate.service` only if the environment file is
  changed;
- run redacted placeholder presence checks;
- run redacted six-channel render proof with production env loaded;
- run public boundary checks.

On SGP data plane:

- read-only verification of service/listener/config-test posture is allowed;
- no SGP runtime config mutation in this Gate unless separately approved.

## Forbidden Actions

- DNS mutation;
- Nginx config mutation or reload;
- provider firewall mutation;
- Xray, Hysteria2, TUIC, or Mihomo config mutation;
- Xray, Hysteria2, TUIC, or Mihomo service restart;
- account or password generation;
- payment mutation;
- live order creation;
- subscription URL, token, password, private key, credential value, raw env,
  raw config, raw log, SQLite row, or customer-data output;
- copying SGP runtime config into Git;
- marking Gate 3 data-plane apply complete.

## Validation

Validation must report only redacted summaries:

- Japan service active;
- Japan local health 200;
- public portal/sub health 200;
- public Admin blocked;
- no-session portal APIs reject;
- Japan-to-SGP SSH ok;
- SGP services active;
- SGP TCP 8443 / UDP 10443 / UDP 443 listeners active;
- SGP stats listener loopback-only;
- `config/proxy-servers.json` SGP placeholder keys all resolve by key presence;
- redacted six-channel render proof status is ready;
- render proof shows six channel names:
  - `channel-vultr-a-vless-reality-tcp`;
  - `channel-vultr-a-hy2`;
  - `channel-vultr-a-tuic`;
  - `channel-sgp-a-vless-reality-tcp`;
  - `channel-sgp-a-hy2`;
  - `channel-sgp-a-tuic`;
- render proof returns no YAML and no credentials;
- handoff queue count is reported but handoff contents are not read.

## Rollback

Rollback must:

- restore Japan protected env backups;
- restore current release env backup if changed;
- restart `proxy-gateway-candidate.service` only if it was restarted during the
  gate;
- rerun health/public-boundary/no-session checks;
- not mutate SGP runtime unless the approved gate mutated it, which this packet
  does not allow.

## Exact Approval Template

```text
批准执行 SGP Gate 3A 受保护通道材料注册：
target=Vultr Japan control plane 45.76.222.52 only, with SGP 45.76.158.201 read-only validation only；
scope=backup Japan protected env/current release env/proxy config/control DB/subscription DB if configured; add only missing SGP_* protected env keys from operator-protected runtime material or reviewed protected handoff; restart proxy-gateway-candidate.service only if env changed; run redacted six-channel render proof and boundary validation；
validation=Japan health 200, portal/sub public 200, Admin blocked, no-session portal APIs reject, Japan-to-SGP SSH ok, SGP services/listeners read-only ok, SGP placeholder keys all resolve by key presence, six-channel render proof ready and yamlReturned=false, no live order creation；
rollback=restore Japan protected env/current env/proxy config/DB backups and restart proxy-gateway-candidate.service if changed；
forbidden=DNS,Nginx config/reload,provider firewall,SGP runtime config mutation/restart,Xray/Hy2/TUIC/Mihomo restart,payment,account/password generation,live order creation,subscription URL/token/password/private key/credential output,SQLite row dump,raw env/log/config output,copying SGP runtime config into Git.
```

## Next Gate After Success

If Gate 3A succeeds, run SGP Gate 3 again as a separate approval:

- consume reviewed SGP handoff items if any exist;
- apply SGP runtime only through the protected data-plane path;
- config-test Xray and Mihomo using supported commands;
- validate Hysteria2 through reviewed safe anchors;
- restart only approved SGP data-plane services after validation;
- archive consumed handoff items without printing raw material.
