# gccwebos IPv6 Production Execution


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: gccwebos_ipv6_production_execution
  superseded_by: null
  last_verified_at: 2026-07-06
  production_authority: false
```


Date: 2026-07-06.

Risk tier: A production DNS/Nginx network change.

Target:

- Vultr Japan control plane: `45.76.222.52`
- Japan IPv6: `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
- Domains: `portal.gccwebos.com`, `sub.gccwebos.com`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, runtime
credential material, or customer data.

## Approval

The operator approved the `gccwebos` Japan IPv6 HTTPS production gate:

- target Japan only;
- add IPv6 listeners for existing `gccwebos` portal/subscription hostnames;
- reload Nginx only after `nginx -t` passes;
- add only `portal.gccwebos.com` and `sub.gccwebos.com` AAAA records after
  forced IPv6 HTTPS validation;
- do not change A records;
- do not use `globalcirclecat.*` as a production entry;
- do not target SGP for `portal.gccwebos.com` or `sub.gccwebos.com`;
- do not mutate app code, schema, payment, account, order, subscription, token,
  credential material, runtime services, or public Admin exposure.

## Preflight

Read-only findings before mutation:

- `portal.gccwebos.com` A: `45.76.222.52`; no AAAA.
- `sub.gccwebos.com` A: `45.76.222.52`; no AAAA.
- `gccwebos.com` authoritative nameservers: Vercel DNS.
- Vercel DNS scope used: `gccltd`.
- Japan Nginx active; `nginx -t` passed.
- Japan certificate SAN covers `portal.gccwebos.com` and `sub.gccwebos.com`.
- Japan Nginx did not listen on IPv6 TCP `80` or `443` before the gate.
- Japan IPv6 TCP `8443` and UDP `10443` were already present for protocol
  runtime capacity.

## Backup

Backup directory on Japan:

`/root/gccgw-nginx-backups/gccwebos-ipv6-20260706-001`

Backed up:

- active `globalcirclecat-cloud.conf` site config;
- pre-change `nginx -T` summary;
- pre-change `nginx -t` output;
- pre-change IPv6 address and TCP listener facts.

An initial edit attempt targeted the Admin-specific site config and failed
`nginx -t` because the appended block referenced a log format defined later in
the include order. The automation restored that file from backup immediately.
No Nginx reload occurred for that failed attempt, and the rollback test passed.

## Change Executed

Japan Nginx:

- appended marked IPv6-only blocks to
  `/etc/nginx/sites-available/globalcirclecat-cloud.conf`;
- added IPv6 HTTP redirect handling for `portal.gccwebos.com` and
  `sub.gccwebos.com`;
- added IPv6 HTTPS handling for `portal.gccwebos.com`;
- added IPv6 HTTPS handling for `sub.gccwebos.com`;
- did not add any `globalcirclecat.*` hostname to the new IPv6-only blocks;
- ran `nginx -t`;
- reloaded Nginx after the config test passed.

Vercel DNS:

- created AAAA record `portal.gccwebos.com` ->
  `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
  - record id: `rec_a5bde8da6d920f3de8242e30`
- created AAAA record `sub.gccwebos.com` ->
  `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`
  - record id: `rec_147e863bae62aad5e1a5afea`

No A record was changed.

## Validation

Nginx and service state:

- `nginx -t`: OK.
- Nginx reload: OK.
- Japan IPv6 TCP `80`: present.
- Japan IPv6 TCP `443`: present.
- `nginx`: active.
- `proxy-gateway-candidate.service`: active.

DNS:

- Vercel DNS listed the new `portal` AAAA record.
- Vercel DNS listed the new `sub` AAAA record.
- Authoritative and public resolvers returned:
  - `portal.gccwebos.com` A `45.76.222.52`;
  - `portal.gccwebos.com` AAAA
    `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`;
  - `sub.gccwebos.com` A `45.76.222.52`;
  - `sub.gccwebos.com` AAAA
    `2401:c080:1000:2a0e:5400:6ff:fe38:fa1c`.

IPv6 HTTPS:

- Japan direct DNS IPv6 `https://portal.gccwebos.com/api/health`: HTTP 200.
- Japan direct DNS IPv6 `https://sub.gccwebos.com/api/health`: HTTP 200.
- Japan forced IPv6 `https://portal.gccwebos.com/api/health`: HTTP 200.
- Japan forced IPv6 `https://sub.gccwebos.com/api/health`: HTTP 200.
- Japan IPv6 `https://portal.gccwebos.com/api/admin`: HTTP 404.
- Japan IPv6 `https://sub.gccwebos.com/api/admin/platform/accounts`: HTTP 404.
- Japan IPv6 HTTP `portal.gccwebos.com/api/health`: HTTP 301 redirect to HTTPS.

IPv4/public boundary:

- IPv4 `https://portal.gccwebos.com/api/health`: HTTP 200.
- IPv4 `https://sub.gccwebos.com/api/health`: HTTP 200.
- IPv4 `https://portal.gccwebos.com/api/admin`: HTTP 404.
- IPv4 `https://sub.gccwebos.com/api/admin/platform/accounts`: HTTP 404.
- Public TCP `portal.gccwebos.com:3456`: closed.
- Public TCP `portal.gccwebos.com:18080`: closed.
- Public TCP `sub.gccwebos.com:3456`: closed.
- Public TCP `sub.gccwebos.com:18080`: closed.

Local workstation direct IPv6 to Japan was not usable in this environment, so
the direct IPv6 HTTP checks were executed from IPv6-capable production hosts.

## Rollback

Rollback remains available:

1. Delete Vercel DNS records:
   - `rec_a5bde8da6d920f3de8242e30`
   - `rec_147e863bae62aad5e1a5afea`
2. Restore Japan Nginx site config from:
   `/root/gccgw-nginx-backups/gccwebos-ipv6-20260706-001/globalcirclecat-cloud.conf.before`
3. Run `nginx -t`.
4. Reload Nginx only after the config test passes.
5. Revalidate IPv4 portal/subscription health and public boundary closure.

## Outcome

The approved `gccwebos` IPv6 production gate completed successfully.

`portal.gccwebos.com` and `sub.gccwebos.com` now have IPv6 HTTPS entry through
Japan. Existing IPv4 behavior remains healthy. Public Admin remains blocked.
Public high ports remain closed. SGP was not used as the production
portal/subscription target.
