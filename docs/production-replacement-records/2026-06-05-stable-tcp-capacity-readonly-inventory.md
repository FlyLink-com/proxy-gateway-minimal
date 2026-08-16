# Stable TCP Capacity Read-Only Inventory - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: stable_tcp_capacity_readonly_inventory
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

This record covers a read-only Aliyun candidate runtime and node registry
inventory for the user portal automatic issuance path.

Allowed checks:

- service status;
- safe node inspect;
- redacted stable protocol policy summary;
- no-session / invalid portal order API rejection;
- public Admin blocking;
- local health check;
- release pointer and release-directory summary.

Forbidden changes:

- DNS;
- Nginx config mutation;
- firewall or provider security-group mutation;
- systemd restart;
- runtime env mutation;
- account or password generation;
- subscription or order creation;
- token, password, subscription URL, endpoint, protocol credential, or SQLite
  row output.

## Commands

All commands were read-only. Outputs below are summarized and redacted.

```text
ssh -o BatchMode=yes miyao '<safe service, release pointer, node version, and health checks>'
ssh -o BatchMode=yes miyao 'cd /opt/proxy-gateway-minimal-candidate/current && node bin/gccgw.mjs node inspect --json'
ssh -o BatchMode=yes miyao 'cd /opt/proxy-gateway-minimal-candidate/current && node bin/gccgw.mjs node policy-check --json'
ssh -o BatchMode=yes miyao '<redacted protocol summary from config/proxy-servers.json>'
ssh -o BatchMode=yes miyao '<whitelisted portal runtime env summary>'
curl --noproxy "*" https://portal.globalcirclecat.com/
curl --noproxy "*" https://portal.globalcirclecat.com/api/admin/platform/health
curl --noproxy "*" -X POST https://portal.globalcirclecat.com/api/portal/access-requests --data "{}"
curl --noproxy "*" -X POST https://portal.globalcirclecat.com/api/portal/access-requests/refresh --data "{}"
curl --noproxy "*" -X POST https://portal.globalcirclecat.com/api/portal/access-requests/disable --data "{}"
```

## Runtime Summary

- `proxy-gateway-candidate`: active.
- `nginx`: active.
- Candidate `current`: `/opt/proxy-gateway-minimal-candidate/releases/492ba99ea564`.
- Loopback health: `ok=true`, `authRequired=true`.
- Recent release directories include `492ba99ea564`, `3790d74f73e9`,
  `e98cfc25a725`, `70342fb96a9d`, `3e1c9a79ec85`, `0e4e063e12dd`,
  `bfe6f89b723a`, and `da33de295cb0`.

No restart, symlink switch, or config mutation was performed.

## Node Registry Summary

Safe `gccgw node inspect --json` returned `ok=true`, `nodeCount=3`,
`mutation=false`, `productionAuthority=false`, and `redacted=true`.

| Node label | Pool | Status | Eligible | Protocol summary |
| --- | --- | --- | --- | --- |
| `prod-edge-a` | stable | maintenance | no | `shadowsocks-libev` |
| `prod-edge-b` | stable | maintenance | no | `shadowsocks-libev` |
| `channel-lab-b-tuic` | stable | online | yes | `tuic` |

The remote release does not yet include `gccgw node policy-check`; it returned
`Unknown gccgw command: node policy-check --json`.

A redacted local-equivalent protocol summary over the remote registry produced:

- `policyOk=false`;
- blocker: `udp_quic_protocol_in_stable_pool`;
- blocker node label: `channel-lab-b-tuic`;
- blocker protocol: `tuic`;
- no endpoint, credential, password, subscription URL, or SQLite data printed.

## Portal Runtime Summary

Whitelisted runtime settings show:

- `USER_PORTAL_ROUTES_ENABLED=true`;
- `USER_PORTAL_AUTO_ISSUANCE_ENABLED=true`;
- `USER_PORTAL_AUTO_ISSUANCE_NODE_ID=channel-lab-b-tuic`;
- `USER_PORTAL_AUTO_ISSUANCE_7D_MONTHLY_LIMIT=5000`;
- `USER_PORTAL_AUTO_ISSUANCE_30D_MONTHLY_LIMIT=1000`.

Only these whitelisted keys were read. The protected `.env` file was not printed.

## Public Boundary Summary

- `https://portal.globalcirclecat.com/`: HTTP 200 static portal entry.
- `https://portal.globalcirclecat.com/api/admin/platform/health`: HTTP 404
  under the portal vhost, so public Admin is not exposed through the portal
  domain.
- Invalid no-session portal order lifecycle requests returned HTTP 400
  `validation_error`.
- No live order or subscription was created during validation.

## Decision Answers

How many stable TCP nodes are eligible?

- Zero. The two stable Shadowsocks nodes are in maintenance and not
  subscription-eligible.

Is portal auto issuance currently pointed at a conservative stable node?

- No. It is currently pointed at `channel-lab-b-tuic`, which is TUIC.

Which candidate labels are maintenance, canary, or recovery?

- `prod-edge-a` and `prod-edge-b`: maintenance, non-eligible, conservative TCP
  candidates blocked from issuance.
- `channel-lab-b-tuic`: online and eligible in the current registry, but this is
  a UDP / QUIC-style protocol and should be treated as temporary continuity or
  scoped canary rather than the stable default.

Is TUIC only temporary continuity or scoped canary?

- Intended policy: yes.
- Current runtime fact: no. The current runtime points automatic issuance at
  `channel-lab-b-tuic`, and the node is still marked stable and eligible.

What rollback state exists before mutation?

- The current release pointer is known.
- Multiple previous release directories remain present.
- No rollback was executed in this inventory.
- Any production correction still requires a separate A-tier mutation approval
  with exact target, backup, validation, and rollback instructions.

## Conclusion

The production user portal automatic issuance path is not currently backed by a
stable TCP pool. It is issuing against `channel-lab-b-tuic`. That explains why a
newly created subscription can be successful at the portal layer while still
delivering the undesired experimental or continuity channel.

The next production mutation should not be a blind UI or order fix. The next
gate should either:

1. restore at least one conservative TCP stable node and switch automatic
   issuance to that node; or
2. fail closed by disabling automatic issuance until a conservative stable node
   is eligible.
