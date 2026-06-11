# Business SSH Whitelist - Vultr Japan and Singapore

Date: 2026-06-10

Risk: A

## Scope

Approved operator request: check whether SSH access is IP-whitelisted and add
business-server SSH allow rules for the Aliyun, Japan, and Singapore server IPs
to avoid future repair blocks.

Targets changed:

- Vultr Japan provider firewall group:
  `7846d5cd-63ac-4dd1-bebd-fe440fef1a12`
- Vultr Singapore provider firewall group:
  `9972b989-ace7-4797-a250-ea47973a15f0`

Targets not changed:

- Aliyun security group / firewall.
- DNS, Nginx, runtime services, systemd units, subscription data, account data,
  payment, Xray, Hysteria2, TUIC, and Mihomo runtime configuration.

## Inventory Finding

Vultr SSH access was provider-firewall whitelisted:

- Japan previously allowed TCP 22 from the current operator source only.
- Singapore previously allowed TCP 22 from Japan only.

This meant business-server-to-business-server SSH repair paths could be blocked
when the operator or control-plane route changed.

Aliyun CLI authentication was available, but the current Aliyun CLI account did
not locate the `47.251.178.125` server through ECS or Simple Application Server
queries. Aliyun SSH remained closed from local, Japan, and Singapore validation
points, so no Aliyun-side firewall mutation was performed.

## Change

Added missing TCP 22 `/32` allow rules for these business server sources:

- `47.251.178.125` - Aliyun business server source.
- `45.76.222.52` - Vultr Japan control plane source.
- `45.76.158.201` - Vultr Singapore data-plane source.

Final Vultr TCP 22 state:

- Japan allows `47.251.178.125/32`, `45.76.222.52/32`,
  `45.76.158.201/32`, and the existing operator source.
- Singapore allows `47.251.178.125/32`, `45.76.222.52/32`, and
  `45.76.158.201/32`.

## Validation

Validated after the change:

- Vultr CLI authentication succeeded.
- Japan SSH from the local operator path succeeded.
- Singapore SSH from the local operator path succeeded.
- Japan to Singapore TCP 22 check succeeded.
- Singapore to Japan TCP 22 check succeeded.

Still blocked / not completed:

- Aliyun `47.251.178.125:22` remained closed or blocked from local, Japan, and
  Singapore.
- Aliyun-side firewall/security-group mutation requires locating the owning
  Aliyun resource, region, and firewall/security group in the correct account.

## Rollback

Rollback, if required, is to delete only the added Vultr firewall rules with
notes beginning with `gccgw-business-ssh-` from the two Vultr firewall groups.
Do not delete pre-existing operator or Japan-to-Singapore rules without a
separate approval.
