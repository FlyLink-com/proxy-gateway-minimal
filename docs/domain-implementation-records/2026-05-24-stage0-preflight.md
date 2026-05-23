# DNS / Domain Stage 0 Read-Only Preflight

Date: 2026-05-24 02:20:09 +08:00

Branch: `ops/domain-stage0-preflight`

Base commit: `a75d2ad4540cef70f932e6deb3a3535dcdcf27c2`

Runbook: `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`

## Scope

This record covers Stage 0 read-only checks only.

It does not authorize or perform:

- DNS mutation
- AWS mutation
- Nginx mutation
- HTTPS issuance
- Production `.env` change
- Production config change
- Service restart
- Green creation
- Cutover
- Secret, token, subscription URL, SQLite, AWS credential, or customer data copy

## AWS Blue Read-Only Check

Command type: `aws ec2 describe-instances`

Result:

```text
Instance ID: i-004ab1c6c71d06bca
State: running
Public IP: 47.129.247.102
Private IP: 172.31.26.232
Instance type: t4g.small
Architecture: arm64
AMI: ami-08bf93219e21cea7a
Launch time: 2026-05-21T15:04:19+00:00
Security group: sg-04a165ec77f430ee8
Name tag: proxy-gateway-node-sg-blue-20260521
Purpose tag: blue-deploy
Project tag: absent
```

Conclusion: blue is still running and is the current production target.

## Public IP / EIP Status

Command type: `aws ec2 describe-addresses --public-ips 47.129.247.102`

Result:

```text
InvalidAddress.NotFound
```

Conclusion: `47.129.247.102` is still not confirmed as an Elastic IP allocation
and must not be assumed movable.

## AliDNS Read-Only Records

Command type: `aliyun alidns DescribeDomainRecords`

Results:

```text
sub.globalcirclecat.com A records: none
ss-sg.globalcirclecat.com A records: none
```

Conclusion: there is no existing A-record conflict for the proposed names.
Creating or changing records still requires Gate 1 approval.

## Public Boundary Checks

Command type: unauthenticated public HTTP requests from the local workstation.

Results:

```text
http://47.129.247.102/api/health -> 200
http://47.129.247.102/api/admin/subscriptions -> 404
http://47.129.247.102/sub/clash.yaml -> 401
```

Conclusion: the current public boundary remains aligned with the expected
gateway behavior.

## Nginx Log Redaction Checks

Command type: read-only SSH inspection of Nginx config and access-log token
query count. Raw logs were not copied into this record.

Results:

```text
log_format proxy_gateway count: 1
proxy_gateway log format contains $uri: yes
$request_uri occurrences in nginx -T output: 0
active access_log path with proxy_gateway format: /var/log/nginx/access.log
token query count in active access log: 0
```

Note: `/var/log/nginx/proxy-gateway-access.log` was not present on the current
host. The active configured access log is `/var/log/nginx/access.log`.

Conclusion: the active Nginx logging configuration uses `$uri`, not
`$request_uri`, and the checked access log does not contain `?token=` entries.

## Stage 0 Conclusion

Ready to request Gate 1 DNS/domain implementation approval: yes, for a
separate explicitly approved execution record.

Not approved by this record:

- DNS record creation or update
- Nginx config change or reload
- HTTPS certificate issuance
- `PUBLIC_SUBSCRIPTION_BASE_URL` migration
- `config/proxy-servers.json` node host migration
- Green creation
- Production cutover

Known blockers and constraints before later stages:

- The current public IP is still not confirmed as a movable EIP.
- DNS, Nginx, HTTPS, runtime config, and node-host migration each need their
  own approved gate and validation.
- Green creation and cutover remain separate Gate 2 and Gate 3 work.
