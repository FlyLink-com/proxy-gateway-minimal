# AWS Singapore Proxy Node Design

## Goal

Deploy a small AWS Singapore proxy node that gives Clash Verge a secure HTTPS subscription URL and a working Shadowsocks server endpoint. The first deployment is an operational quick path, not a full cloud port of the Windows control console.

## Chosen Approach

Use AWS EC2 in `ap-southeast-1` with a free-tier eligible `t4g.small` Ubuntu ARM64 instance.

The cloud node will run:

- Shadowsocks server, listening on one TCP/UDP service port.
- A minimal HTTPS subscription endpoint, served through Caddy or Nginx.
- A static Clash/Mihomo YAML subscription containing the AWS node.

The local Windows project remains the richer control console. Windows-only features such as WinINet proxy control, PowerShell network repair, `schtasks`, `sslocal.exe`, and local HTTP proxy bridging are not deployed to Linux.

## Architecture

```text
Clash Verge on laptop
  -> HTTPS subscription URL on AWS
  -> imports AWS Shadowsocks node
  -> encrypted Shadowsocks connection to AWS
  -> AWS connects to target websites
```

Cloud components:

- EC2: `t4g.small`, Ubuntu 24.04 ARM64, Singapore.
- Security group:
  - SSH `22/tcp`: restricted to the current operator IP when possible.
  - HTTPS `443/tcp`: open to clients.
  - Shadowsocks service port: open for client access.
  - HTTP `80/tcp`: only for ACME/redirect if a real domain is used.
- Storage: small gp3 root volume.
- Secrets:
  - Shadowsocks password generated locally or on the instance.
  - Subscription token generated separately from the SS password.

## Subscription URL

Preferred production URL if DNS is available:

```text
https://proxy.globalcirclecat.com/sub/clash.yaml?token=redacted-token
```

Immediate bootstrap URL if DNS is not ready:

```text
https://203.0.113.10.sslip.io/sub/clash.yaml?token=redacted-token
```

The service must not log full query strings because the token is in the URL.

## Security Boundary

This setup improves the client-to-server leg by encrypting it with Shadowsocks. It does not make the server invisible.

Expected visibility:

- Networks between the laptop and AWS can see the laptop connecting to the AWS IP and traffic volume/timing.
- AWS and upstream networks can see the AWS instance connecting to target IPs and ports.
- HTTPS target content remains protected by the target site's HTTPS.
- Plain HTTP target content is not protected after it leaves the AWS instance.

Operational controls:

- Use a long random SS password.
- Use a separate long random subscription token.
- Do not expose the management API publicly.
- Avoid writing secrets to shell history.
- Keep cloud-init logs and web logs from recording full subscription URLs.
- Add an AWS budget alarm before or immediately after launch.

## Cost Guardrails

For this account and region, `t4g.small` is marked free-tier eligible by `describe-instance-types`. Public IPv4 and gp3 storage also have free-tier coverage within limits, but overages can still bill.

Guardrails:

- Use a single instance.
- Use one public IPv4 only.
- Use a small root disk.
- Avoid snapshots unless needed.
- Set a low AWS Budget alert.
- Tag resources with `Project=proxy-gateway-minimal` and `Purpose=aws-singapore-proxy`.

## Deployment Steps

1. Create or reuse a Singapore security group.
2. Launch `t4g.small` with Ubuntu 24.04 ARM64.
3. Install Shadowsocks server and Caddy/Nginx.
4. Generate secrets on the instance or pass them via cloud-init without printing them.
5. Write the Clash YAML subscription.
6. Serve it over HTTPS with query-token validation.
7. Validate:
   - EC2 running and reachable.
   - HTTPS subscription returns 200 with a valid token.
   - Invalid or missing token returns 401/403.
   - Clash imports the profile.
   - Proxy exit IP is the AWS public IP.

## Rollback

Rollback is resource cleanup:

- Remove the Clash profile locally.
- Stop or terminate the EC2 instance.
- Delete the security group if unused.
- Delete any unattached Elastic IP, EBS volume, or snapshots.

## Future Cloud Mode

A later project phase can add first-class cloud mode to this repository:

- `HOST=0.0.0.0`
- `PUBLIC_BASE_URL`
- Linux-safe command runner
- no Windows scripts in cloud runtime
- static subscription-only mode
- package `bin` entrypoint and deploy docs

That is out of scope for the first AWS node.
