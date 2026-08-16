# SGP Final Production Closeout Gate


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: sgp_final_production_closeout_gate
  superseded_by: null
  last_verified_at: 2026-06-09
  production_authority: false
```


Date: 2026-06-09, Asia/Shanghai.

Risk tier: A for any server, runtime, DNS, Nginx, provider firewall, systemd,
database, live order, or subscription-output validation against production.

This record is a repo-only execution packet. It is not production approval and
does not authorize SSH, upload, service restart, runtime config mutation,
database mutation, DNS, Nginx, provider firewall, account/password generation,
live order creation, subscription URL/token/password output, SQLite row dump,
raw config, raw logs, or raw environment output.

## Current Status

Known from the current project records:

- The Singapore data-plane runtime issue has been closed at repair level.
- The Japan control plane is still the production control-plane authority for
  account, order, artifact, credential lifecycle, subscription rendering, and
  usage ledger state.
- Singapore is a data-plane capacity host and must not become a second
  authoritative control store.
- The latest drift reconciliation says GitHub source, Japan runtime, and
  Singapore runtime are not identical baselines.
- The Singapore runtime tree must not be copied back into Git as source.
- Future production artifacts must pass the production artifact boundary check
  before upload.

Therefore SGP is not considered finally closed until a clean production artifact
and a controlled data-plane apply are executed and validated under an exact
Risk A approval.

## Required Source Baseline

Before any production action:

1. Select one reviewed Git commit or release id.
2. Build the production artifact from that commit only.
3. Record the source commit and artifact SHA-256.
4. Run `gccgw package inspect <package-dir> --json` or the production artifact
   boundary checker against the unpacked artifact manifest.
5. Stop if the artifact contains local worktrees, runtime scratch material,
   `.env`, SQLite files, private keys, certificates, raw logs, backup files, or
   unreviewed protected runtime config.

The Singapore runtime host is never a source baseline.

## Execution Order

### Gate 1 - Read-Only Inventory

Target: Vultr Japan control plane and Vultr Singapore data plane.

Allowed:

- identify current release ids;
- verify health endpoints;
- verify public portal/sub boundaries;
- verify public Admin is blocked;
- verify no-session portal APIs reject;
- inventory SGP Xray, Hysteria2, and TUIC service state;
- inventory SGP TCP 8443, UDP 10443, and UDP 443 listener presence;
- inventory protected path existence and backup readiness;
- run redacted render/policy proofs that do not output subscription URLs,
  tokens, passwords, raw config, raw logs, raw env, or SQLite rows.

Stop conditions:

- Japan health or portal/sub boundary is unhealthy;
- public Admin is exposed;
- SGP listener or service state disagrees with the intended six-channel model;
- protected backup paths are missing;
- validation would require printing raw secrets or raw runtime material.

### Gate 2 - Japan Control-Plane Runtime Upgrade

Target: Japan control plane only.

Allowed after exact approval:

- backup current symlink, protected env, subscription DB, control DB, and proxy
  config;
- upload verified clean artifact;
- run `npm ci`;
- switch current release;
- restart `proxy-gateway-candidate.service` only;
- run idempotent migrations required by the selected release.

Validation:

- artifact hash ok;
- package boundary check ok;
- service active;
- health 200;
- portal/sub public 200;
- public Admin blocked;
- no-session portal APIs reject;
- `tcp3456` remains loopback-only;
- channel refs match protected proxy config;
- no live order creation.

Rollback:

- restore previous current symlink;
- restore protected env and DB backups;
- restart `proxy-gateway-candidate.service`;
- do not mutate SGP while rolling back this gate unless separately approved.

### Gate 3 - Singapore Data-Plane Apply

Target: Singapore data plane only, controlled by Japan handoff output.

Allowed after exact approval:

- backup SGP protected runtime configs and systemd metadata;
- consume reviewed pending SGP handoff items;
- apply VLESS Reality, Hysteria2, and TUIC credential/runtime material through
  the protected data-plane apply path;
- run config-test for Xray, Hysteria2, and Mihomo/TUIC;
- restart only SGP approved data-plane services after config-test passes;
- preserve active config ownership for services running as the service user;
- archive or mark consumed handoff items without printing raw material.

Validation:

- SGP services active;
- TCP 8443 active for `channel-sgp-a-vless-reality-tcp`;
- UDP 10443 active for `channel-sgp-a-hy2`;
- UDP 443 active for `channel-sgp-a-tuic`;
- Hysteria2 stats endpoint is loopback-only;
- controlled-domain fake-IP/self-routing protection is present in rendered
  subscription output;
- redacted credential counts are present for SGP channels;
- no subscription URL, token, password, SQLite row, raw config, raw env, or raw
  log output.

Rollback:

- restore SGP protected config backups;
- restore prior service state;
- preserve the handoff queue backup for audit;
- remove any temporary apply credential if one was created for the gate.

### Gate 4 - New-Order Smoke

This is separate from deployment validation and must be explicitly approved
because it creates a live order.

Allowed after exact approval:

- create one small test order from the user panel or a protected operator route;
- refresh/import the resulting subscription;
- verify the rendered subscription bundle includes the intended Vultr Japan and
  SGP channels;
- verify desktop and phone client behavior using redacted channel names only.

Validation:

- order reaches the expected delivered/active state;
- subscription render includes:
  - `channel-vultr-a-vless-reality-tcp`
  - `channel-vultr-a-hy2`
  - `channel-vultr-a-tuic`
  - `channel-sgp-a-vless-reality-tcp`
  - `channel-sgp-a-hy2`
  - `channel-sgp-a-tuic`
- no raw subscription URL, token, password, credential, or SQLite row is copied
  into the report;
- failures are recorded as channel-specific or client-specific, not generalized
  as a source deployment failure without evidence.

## Exact Approval Template

Use an approval in this shape before any production execution:

```text
批准执行 SGP 最终生产收尾 Gate <1/2/3/4>：
release=<具体 release>;
artifact=<本地 artifact 路径，仅 Gate 2 需要>;
archive_sha256=<具体 sha256，仅 Gate 2 需要>;
target=Vultr Japan control plane 45.76.222.52 and/or SGP data plane 45.76.158.201 only;
scope=<本次 Gate 的精确 scope>;
validation=<本次 Gate 的精确 validation>;
rollback=<本次 Gate 的 rollback>;
forbidden=DNS,Nginx config/reload,provider firewall unless explicitly listed,payment,account/password generation,subscription URL/token/password output,SQLite row dump,raw env/log/config output,public Admin exposure.
```

## Closeout Criteria

SGP can be marked finally closed only after:

- clean artifact source commit and SHA-256 are recorded;
- production artifact boundary check passes;
- Japan control-plane runtime is on the reviewed release;
- SGP data-plane apply is complete through the protected handoff path;
- Japan render proof shows the full approved bundle;
- SGP listeners and services are active;
- public Admin remains blocked;
- no-session portal APIs reject;
- at least one separately approved new-order smoke confirms the subscription
  bundle behavior, or the record explicitly says live order smoke is deferred.
