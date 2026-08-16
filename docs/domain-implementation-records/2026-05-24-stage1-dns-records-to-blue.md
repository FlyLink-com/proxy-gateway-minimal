# DNS / Domain Stage 1 Records To Blue

Date: 2026-05-24 03:17:44 +08:00

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: domain_implementation_records_2026_05_24_stage1_dns_records_to_blue
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```

Branch: `ops/domain-stage1-dns-records`

Base commit: `0a02e1a73020bec4f49625839bcb9e56300c8b7a`

Runbook: `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`

## Scope

This record covers Gate 1 / Stage 1 DNS records to the current blue production
node only.

Approved scope:

```text
sub.globalcirclecat.com A -> 47.129.247.102
ss-sg.globalcirclecat.com A -> 47.129.247.102
```

The original Stage 1 TTL target was `300`, but AliDNS rejected it because the
current valid range is `600` to `86400`. No record was created by the rejected
attempt. The operator then approved continuing Stage 1 with AliDNS minimum TTL
`600`.

This record does not authorize or perform:

- AWS mutation
- Nginx mutation
- HTTPS issuance
- Production `.env` change
- Production node-config change
- Service restart
- Green creation
- Cutover
- Secret, token, subscription URL, SQLite, AWS credential, or customer data copy

## Pre-Mutation Read-Only Check

Command type: `aliyun alidns DescribeDomainRecords`

Result before mutation:

```text
sub.globalcirclecat.com A records: none
ss-sg.globalcirclecat.com A records: none
```

## DNS Mutation Performed

Command type: `aliyun alidns AddDomainRecord`

Records created:

```text
sub.globalcirclecat.com A 47.129.247.102 TTL 600
RecordId: 2058265981713498112

ss-sg.globalcirclecat.com A 47.129.247.102 TTL 600
RecordId: 2058265985853242368
```

Post-mutation AliDNS read-only check:

```text
sub exact A count: 1
sub RecordId: 2058265981713498112
sub Value: 47.129.247.102
sub TTL: 600
sub Status: ENABLE

ss-sg exact A count: 1
ss-sg RecordId: 2058265985853242368
ss-sg Value: 47.129.247.102
ss-sg TTL: 600
ss-sg Status: ENABLE
```

## Validation

DNS resolution:

```text
sub.globalcirclecat.com A -> 47.129.247.102 TTL 600
ss-sg.globalcirclecat.com A -> 47.129.247.102 TTL 600
```

Public HTTP boundary through `sub.globalcirclecat.com`:

```text
http://sub.globalcirclecat.com/api/health -> 200
http://sub.globalcirclecat.com/api/admin/subscriptions -> 404
http://sub.globalcirclecat.com/sub/clash.yaml -> 401
```

Shadowsocks node DNS port check:

```text
ss-sg.globalcirclecat.com:18388 -> TCP reachable
Remote address: 47.129.247.102
```

## Rollback

The Stage 1 records did not exist before this execution. Rollback is record
deletion:

```powershell
aliyun alidns DeleteDomainRecord --RecordId 2058265981713498112
aliyun alidns DeleteDomainRecord --RecordId 2058265985853242368
```

Rollback was not performed.

## Conclusion

Stage 1 DNS records to blue completed.

Ready to request Stage 2 HTTP-only domain validation approval: yes, through a
separate explicit approval only.

Not approved by this record:

- Nginx config change or reload
- HTTPS certificate issuance
- `PUBLIC_SUBSCRIPTION_BASE_URL` migration
- `config/proxy-servers.json` node host migration
- Green creation
- Production cutover
