# SGP Gate 3A Material Registration Execution


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: sgp_gate3a_material_registration_execution
  superseded_by: null
  last_verified_at: 2026-06-10
  production_authority: false
```


Date: 2026-06-10, Asia/Shanghai.

Risk tier: A production protected-material registration.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, or customer
data.

## Approval

The operator approved SGP Gate 3A with these boundaries:

- mutate only the Japan control-plane protected/current environment as needed;
- use SGP read-only validation only;
- add only missing SGP static channel material keys;
- restart `proxy-gateway-candidate.service` only if the environment changed;
- do not mutate DNS, Nginx, provider firewall, SGP runtime config, or data-plane
  services;
- do not create live orders or output subscription/credential material.

## Scope Executed

Executed on the Japan control plane:

- read local project context and verified a clean local branch;
- backed up Japan current environment, proxy config, and configured SQLite DB
  files before mutation;
- copied SGP protected material into a temporary Japan file through the existing
  Japan-to-SGP protected SSH path;
- added only these previously missing Japan environment keys:
  - `SGP_HY2_STATIC_PASSWORD`;
  - `SGP_TUIC_STATIC_PASSWORD`;
  - `SGP_TUIC_STATIC_UUID`;
  - `SGP_VLESS_STATIC_UUID`;
  - `SGP_XRAY_VLESS_REALITY_PUBLIC_KEY`;
  - `SGP_XRAY_VLESS_REALITY_SHORT_ID`;
- deleted the temporary transfer file;
- restarted `proxy-gateway-candidate.service`;
- ran redacted boundary, placeholder, policy, and render-proof validation.

Executed on the Singapore data plane:

- read-only service and listener validation only.

Not executed:

- no SGP runtime config mutation;
- no SGP runtime service restart;
- no handoff item consumption;
- no DNS, Nginx, provider firewall, payment, account/password, or live order
  mutation;
- no subscription URL, token, password, private key, raw environment, raw config,
  raw log, SQLite row, or customer-data output.

## Backup

Japan backup directory:

- `/opt/proxy-gateway-minimal-candidate/backups/sgp-gate3a-material-registration-20260610T030332Z`

Backed up file count:

- 4 files.

## Validation

Japan control-plane validation:

- `proxy-gateway-candidate.service`: active after restart;
- local health: HTTP 200;
- public portal: HTTP 200;
- public subscription health: HTTP 200;
- public Admin route: HTTP 404;
- no-session portal orders API: HTTP 401;
- Japan-to-SGP SSH: ok;
- SGP placeholder key presence: all six required keys present;
- node policy check:
  - ok: true;
  - nodeCount: 6;
  - blockers: 0;
  - warnings: 0.

Singapore read-only validation:

- `proxy-gateway-candidate.service`: active;
- `xray-vless-reality.service`: active;
- `hysteria2.service`: active;
- `mihomo-tuic.service`: active;
- local health: HTTP 200;
- public portal: HTTP 200;
- public Admin route: HTTP 404;
- no-session portal orders API: HTTP 401;
- TCP 8443 listener: present;
- UDP 10443 listener: present;
- UDP 443 listener: present;
- loopback-only stats listener: present.

Redacted six-channel render proof:

- status: `render_proof_ready_for_subscription_output_activation_request`;
- internal YAML render completed: true;
- YAML returned: false;
- rendered proxy count: 6;
- protocol counts:
  - vless: 2;
  - hysteria2: 2;
  - tuic: 2;
- rendered channel names:
  - `channel-vultr-a-vless-reality-tcp`;
  - `channel-vultr-a-hy2`;
  - `channel-vultr-a-tuic`;
  - `channel-sgp-a-vless-reality-tcp`;
  - `channel-sgp-a-hy2`;
  - `channel-sgp-a-tuic`;
- blockers: 0;
- missing candidates: 0;
- protocol mismatches: 0.

Handoff queue observation:

- pending JSON handoff count was reported as 48;
- no handoff files were read or consumed by this Gate 3A execution.

## Result

SGP Gate 3A is complete.

The Japan control plane can now resolve the SGP static subscription-rendering
material by key presence and can produce a redacted six-channel render proof
without returning YAML or credential material.

This does not complete SGP Gate 3 data-plane apply. Handoff consumption,
runtime credential reconciliation, data-plane apply, and any live new-order smoke
remain separate Risk A gates.

## Rollback

If rollback is required:

1. Restore the Japan backup directory listed above over the changed environment,
   proxy config, and DB files as applicable.
2. Restart `proxy-gateway-candidate.service`.
3. Re-run health, public boundary, no-session rejection, and render-proof
   checks.
4. Do not mutate Singapore runtime unless a separate approved gate mutated it.
