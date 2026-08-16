# 2026-06-05 Route 53 globalcirclecat.com Hosted Zone Preparation


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: route53_globalcirclecat_hosted_zone_prep
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

- Risk tier: A.
- Target: AWS Route 53 DNS hosting preparation for `globalcirclecat.com`.
- Approval scope: create one public hosted zone and create six approved A records.
- Explicit non-goals:
  - Do not modify Aliyun nameservers.
  - Do not create `ss-sg.globalcirclecat.com`.
  - Do not change DNSSEC.
  - Do not change Cloudflare.
  - Do not change servers, Nginx, firewall, application runtime, accounts, credentials, tokens, or subscription material.

## Preflight

- AWS caller identity was available for account `580857941765`.
- Route 53 had no existing hosted zone for `globalcirclecat.com`.
- Current public NS before execution was still Aliyun/HiChina:
  - `dns25.hichina.com`
  - `dns26.hichina.com`
- Current Aliyun DNS record inventory contained seven A records:
  - `globalcirclecat.com` -> `47.251.178.125`
  - `www.globalcirclecat.com` -> `47.251.178.125`
  - `sub.globalcirclecat.com` -> `47.251.178.125`
  - `portal.globalcirclecat.com` -> `47.251.178.125`
  - `wecom.globalcirclecat.com` -> `47.251.178.125`
  - `29uscu.globalcirclecat.com` -> `47.251.178.125`
  - `ss-sg.globalcirclecat.com` -> retired legacy address; excluded from Route 53 preparation.
- Local system DNS returned `198.18.x.x` fake-IP values, so DNS validation used Aliyun inventory, DNS-over-HTTPS for public NS, and Route 53 native `test-dns-answer` instead of local resolver output.

## Execution

- Created Route 53 public hosted zone:
  - hosted zone ID: `Z073516423FG7P5MMA1DL`
  - hosted zone name: `globalcirclecat.com.`
- Route 53 assigned nameservers:
  - `ns-578.awsdns-08.net`
  - `ns-1837.awsdns-37.co.uk`
  - `ns-1152.awsdns-16.org`
  - `ns-152.awsdns-19.com`
- Created six approved A records with TTL 600:
  - `globalcirclecat.com` -> `47.251.178.125`
  - `www.globalcirclecat.com` -> `47.251.178.125`
  - `sub.globalcirclecat.com` -> `47.251.178.125`
  - `portal.globalcirclecat.com` -> `47.251.178.125`
  - `wecom.globalcirclecat.com` -> `47.251.178.125`
  - `29uscu.globalcirclecat.com` -> `47.251.178.125`
- Excluded `ss-sg.globalcirclecat.com` as approved.
- Route 53 change ID for record creation: `C04822172TDIGHG1ZKT4M`.

## Validation

- Route 53 record creation change reached `INSYNC`.
- Route 53 `list-resource-record-sets` showed:
  - the six approved A records,
  - the default Route 53 NS record,
  - the default Route 53 SOA record,
  - no `ss-sg.globalcirclecat.com` record.
- Route 53 `test-dns-answer` returned `NOERROR` and `47.251.178.125` for all six approved records.
- Route 53 `test-dns-answer` returned `NXDOMAIN` for `ss-sg.globalcirclecat.com`.
- DNS-over-HTTPS public NS check after execution still returned:
  - `dns25.hichina.com`
  - `dns26.hichina.com`
- Therefore the execution prepared Route 53 only; public delegation was not switched.

## Rollback

Before Aliyun nameserver cutover, rollback is simply to leave Aliyun NS unchanged or delete the unused Route 53 hosted zone `Z073516423FG7P5MMA1DL`.

After a future nameserver cutover, rollback would be to restore Aliyun/HiChina nameservers at the registrar:

- `dns25.hichina.com`
- `dns26.hichina.com`

That future cutover and rollback path require a separate explicit A-tier approval.
