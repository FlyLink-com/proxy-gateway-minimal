# SGP Gate 3 Data-Plane Apply Execution


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: sgp_gate3_data_plane_apply_execution
  superseded_by: null
  last_verified_at: 2026-06-10
  production_authority: false
```


Date: 2026-06-10, Asia/Shanghai.

Risk tier: A production data-plane runtime apply.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, or customer
data.

## Approval

The operator approved SGP Gate 3 data-plane apply with these boundaries:

- back up Japan handoff metadata, protected environment, proxy config, control
  DB, and subscription DB where configured;
- back up Singapore protected runtime configs and systemd metadata;
- consume the reviewed SGP handoff queue through the protected Japan-to-SGP
  apply path;
- reconcile Singapore runtime credentials for:
  - `channel-sgp-a-vless-reality-tcp`;
  - `channel-sgp-a-hy2`;
  - `channel-sgp-a-tuic`;
- config-test Xray and Mihomo;
- validate Hysteria2 through approved service, listener, and loopback stats
  anchors;
- restart only the approved Singapore Xray, Hysteria2, and TUIC services after
  validation;
- archive consumed handoff items;
- restart the Japan control plane only if required.

Forbidden during this gate:

- DNS, Nginx, provider firewall, payment, account/password, or live-order
  mutation;
- subscription URL, token, password, private key, credential material, SQLite
  row, raw environment, raw config, or raw log output;
- public Admin exposure.

## Scope Executed

Executed on the Japan control plane:

- verified local project context and a clean local branch;
- backed up Japan handoff metadata, protected environment, protected proxy
  config, and configured DB files where present;
- selected the latest reviewed SGP handoff snapshots for the three Singapore
  channels;
- verified the protected material store covered every pending
  `edgeCredentialRef` needed by those handoffs;
- transferred a protected material subset and the reviewed handoff snapshots to
  Singapore through the Japan-to-SGP apply path;
- validated a redacted six-channel render proof after runtime apply;
- archived the consumed pending SGP handoff files into the protected processed
  directory;
- did not restart the Japan control-plane service.

Executed on the Singapore data plane:

- backed up protected runtime configs for Xray, Hysteria2, and Mihomo/TUIC;
- backed up relevant systemd unit metadata;
- ran the protected SGP handoff apply script;
- reconciled runtime credentials for Xray/VLESS Reality, Hysteria2, and
  Mihomo/TUIC;
- config-tested Xray and Mihomo through the reviewed runtime adapters;
- restarted only the approved SGP data-plane services after config validation;
- validated service state, listeners, loopback stats, and credential counts.

Not executed:

- no DNS, Nginx, provider firewall, payment, account/password, or live-order
  mutation;
- no public Admin exposure;
- no subscription URL, token, password, private key, raw environment, raw
  config, raw log, SQLite row, or customer-data output.

## Backup

Japan backup directory:

- `/opt/proxy-gateway-minimal-candidate/backups/sgp-gate3-data-plane-apply-20260610T033931Z`

Singapore backup directory:

- `/opt/proxy-gateway-minimal-candidate/protected/backups/sgp-gate3-data-plane-apply-20260610T033931Z`

Protected handoff apply work directory:

- `/opt/proxy-gateway-minimal-candidate/protected/data-plane-handoff/.gate3-sgp-gate3-data-plane-apply-20260610T033931Z`

## Apply Results

Reviewed handoff selection:

- latest SGP handoff snapshots selected: 3;
- pending handoff files observed before archive: 48;
- unique pending `edgeCredentialRef` values: 79;
- protected material subset records: 79;
- missing material records: 0.

Singapore runtime apply results:

- `channel-sgp-a-vless-reality-tcp`: applied;
- `channel-sgp-a-hy2`: applied;
- `channel-sgp-a-tuic`: applied;
- all three runtime adapters reported successful config validation and approved
  service restart.

Handoff queue archive:

- pending JSON handoff files after archive: 0;
- archived JSON handoff files: 48.

## Validation

Japan control-plane validation:

- local health: HTTP 200;
- public portal: HTTP 200;
- public subscription health: HTTP 200;
- public Admin route: HTTP 404;
- no-session portal API: HTTP 401;
- Japan-to-SGP SSH: ok.

Singapore public boundary validation:

- public portal: HTTP 200;
- public health: HTTP 200;
- public Admin route: HTTP 404;
- no-session portal API: HTTP 401.

Singapore runtime validation:

- `proxy-gateway-candidate.service`: active;
- `xray-vless-reality.service`: active;
- `hysteria2.service`: active;
- `mihomo-tuic.service`: active;
- TCP 8443 listener: present;
- UDP 10443 listener: present;
- UDP 443 listener: present;
- traffic stats listener: loopback-only;
- public stats exposure: not present.

Redacted Singapore credential-count validation:

- Xray/VLESS Reality managed credential refs: 24;
- Hysteria2 managed credential refs: 31;
- Mihomo/TUIC managed users: 24.

Redacted six-channel render proof:

- status: `render_proof_ready_for_subscription_output_activation_request`;
- internal YAML render completed: true;
- YAML returned: false;
- rendered proxy count: 6;
- protocol counts:
  - vless: 2;
  - hysteria2: 2;
  - tuic: 2;
- baseline:
  - `channel-vultr-a-vless-reality-tcp`;
- canary:
  - `channel-vultr-a-hy2`;
  - `channel-vultr-a-tuic`;
  - `channel-sgp-a-vless-reality-tcp`;
  - `channel-sgp-a-hy2`;
  - `channel-sgp-a-tuic`;
- blockers: 0;
- missing candidates: 0;
- protocol mismatches: 0.

## Result

SGP Gate 3 data-plane apply is complete.

The reviewed SGP handoff queue was consumed and archived. Singapore now has
runtime credentials reconciled for the approved VLESS Reality, Hysteria2, and
TUIC channels. The Japan control plane can produce a redacted six-channel render
proof with `yamlReturned=false`.

This gate did not create a live order. A fresh no-secrets desktop/mobile
new-order smoke remains a separate Risk A gate before making broader rollout
claims about newly issued subscriptions.

## Rollback

If rollback is required:

1. Restore the Japan backup directory listed above over the changed handoff
   metadata, protected environment, proxy config, and DB files as applicable.
2. Restore the Singapore backup directory listed above over the changed runtime
   configs and systemd metadata as applicable.
3. Restore the prior Singapore service state and restart only affected approved
   services after config validation.
4. Preserve the handoff queue backup for audit; do not discard the processed
   archive without a separate reviewed cleanup.
5. Re-run Japan and Singapore health, public-boundary, listener, stats, and
   redacted render-proof validation.
