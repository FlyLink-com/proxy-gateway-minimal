# AWS Production-Like Staging Resource Creation

Date: 2026-06-06, Asia/Shanghai.

## Scope

This record captures the approved AWS production-like staging resource creation
for the `proxy-gateway-minimal` staging lane.

This record intentionally excludes secrets, tokens, subscription URLs, portal
passwords, private keys, raw environment values, raw SQLite rows, raw runtime
configuration, and customer data.

## Approval

Operator approval allowed:

- release `bdc95d46ae4d`
- artifact SHA256
  `5BC1B1B27EC15A3D0C762AF835A08C28A09B92413C7F23F80743FB9F0D107F92`
- region `ap-northeast-1`
- Ubuntu 24.04 AMI `ami-091d8d62fdf169cfd`
- instance type `t3.medium`
- gp3 30 GB root disk
- key pair `gccgw-aws-staging-operator-20260606`
- security group `gccgw-aws-staging-20260606`
- SSH source `45.76.222.52/32`
- public TCP 80, public TCP 443, public UDP 443
- no Elastic IP
- no DNS mutation

Forbidden:

- Vultr production mutation
- Aliyun mutation
- DNS mutation
- customer data
- production secrets
- live subscription issuance
- payment
- public Admin
- subscription URL, token, or password output
- SQLite row dump

## Preflight

Read-only preflight confirmed:

- AWS CLI identity lookup succeeded.
- Artifact existed locally and matched the approved SHA256.
- Current operator egress matched the approved SSH source.
- `t3.small` and `t3.medium` were offered in `ap-northeast-1`.
- Ubuntu 24.04 AMI `ami-091d8d62fdf169cfd` existed.
- A default VPC and default subnets existed in `ap-northeast-1`.
- Default on-demand standard instance quota was enough for one `t3.medium`.
- No existing staging instance, staging security group, staging key pair,
  staging EIP, or staging volume conflict was found for this project.
- Key-pair import and security-group creation dry-run gates returned
  `DryRunOperation`.

## Created Resources

| Resource | Value |
| --- | --- |
| Region | `ap-northeast-1` |
| Key pair | `gccgw-aws-staging-operator-20260606` |
| Security group | `sg-0927469a10053fa98` |
| Instance | `i-08aa4775a099c9a18` |
| Instance type | `t3.medium` |
| AMI | `ami-091d8d62fdf169cfd` |
| Public IPv4 | `54.248.170.34` |
| Private IPv4 | `172.31.43.76` |
| Subnet | `subnet-02fb5ce116f8fd19d` |
| Root volume | `vol-03b1fc39947ff45b5` |
| Root disk | `gp3`, 30 GB, delete on termination |

Security-group ingress:

| Protocol | Port | Source |
| --- | --- | --- |
| TCP | 22 | `45.76.222.52/32` |
| TCP | 80 | `0.0.0.0/0` |
| TCP | 443 | `0.0.0.0/0` |
| UDP | 443 | `0.0.0.0/0` |

No Elastic IP was allocated.

## Validation

Validation results:

- EC2 state: `running`.
- EC2 system status: `ok`.
- EC2 instance status: `ok`.
- SSH validation with the approved operator key: passed.
- Security group ingress matched the approved scope.
- Attached root volume was gp3 30 GB and set to delete on termination.
- Staging EIP inventory remained empty.

SSH validation only executed a minimal host reachability command. No remote
environment, runtime config, logs, SQLite rows, credentials, subscription
artifacts, or customer data were read or printed.

## Not Performed

This gate did not perform:

- DNS changes
- EIP allocation
- Vultr production mutation
- Aliyun mutation
- runtime bootstrap
- systemd service installation
- Nginx config installation
- Mihomo installation
- protected environment write
- SQLite initialization
- account or password generation
- live order creation
- subscription issuance
- traffic testing

## Rollback

Rollback for this gate is resource deletion only:

```powershell
aws ec2 terminate-instances --region ap-northeast-1 --instance-ids i-08aa4775a099c9a18
aws ec2 wait instance-terminated --region ap-northeast-1 --instance-ids i-08aa4775a099c9a18
aws ec2 delete-security-group --region ap-northeast-1 --group-id sg-0927469a10053fa98
aws ec2 delete-key-pair --region ap-northeast-1 --key-name gccgw-aws-staging-operator-20260606
```

The root volume is configured with `DeleteOnTermination=true`. After rollback,
verify that no project staging instances, security groups, key pairs, EIPs, or
volumes remain.

## Next Gate

The next gate is host bootstrap with synthetic staging runtime material only.
It requires separate exact approval before installing packages, uploading the
artifact, writing protected staging environment values, installing systemd
units, configuring Nginx, installing Mihomo, starting services, or creating any
synthetic control database.
