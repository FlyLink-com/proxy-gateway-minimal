# AWS Singapore Proxy Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an AWS Singapore `t4g.small` proxy node with Shadowsocks and an HTTPS Clash subscription URL.

**Architecture:** Provision one EC2 instance in `ap-southeast-1`, install `shadowsocks-libev`, run a tiny loopback Python subscription server, and terminate HTTPS with Caddy using an `sslip.io` hostname derived from the instance public IPv4. Keep all generated secrets and deployment output in the ignored `.proxy-gateway/aws-singapore/` directory.

**Tech Stack:** AWS CLI, EC2, Ubuntu 24.04 ARM64, cloud-init, shadowsocks-libev, Python 3, Caddy, PowerShell orchestration.

---

### Task 1: Local Deployment Inputs

**Files:**
- Create: `.proxy-gateway/aws-singapore/`
- Create: `.proxy-gateway/aws-singapore/user-data.sh`
- Create: `.proxy-gateway/aws-singapore/deploy-vars.json`

- [ ] **Step 1: Capture operator IP without local proxy**

Run:

```powershell
$operatorIp = (& curl.exe --silent --show-error --noproxy "*" https://checkip.amazonaws.com/).Trim()
if (-not ($operatorIp -match '^\d{1,3}(\.\d{1,3}){3}$')) { throw "Could not determine operator IPv4: $operatorIp" }
$operatorIp
```

Expected: prints one IPv4 address, such as `36.163.181.255`.

- [ ] **Step 2: Create ignored local deployment directory**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
New-Item -ItemType Directory -Force -Path $deployDir | Out-Null
```

Expected: directory exists and remains ignored by Git because `.proxy-gateway/` is in `.gitignore`.

- [ ] **Step 3: Resolve latest Ubuntu ARM64 AMI**

Run:

```powershell
$amiId = aws ec2 describe-images `
  --region ap-southeast-1 `
  --owners amazon `
  --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*" "Name=state,Values=available" `
  --query "sort_by(Images,&CreationDate)[-1].ImageId" `
  --output text
if (-not ($amiId -match '^ami-')) { throw "AMI lookup failed: $amiId" }
$amiId
```

Expected: prints an ARM64 Ubuntu AMI id.

- [ ] **Step 4: Save deployment variables**

Run:

```powershell
$vars = [ordered]@{
  region = 'ap-southeast-1'
  instanceType = 't4g.small'
  amiId = $amiId
  operatorIp = $operatorIp
  keyName = 'proxy-gateway-aws-sg-20260521'
  securityGroupName = 'proxy-gateway-aws-sg-20260521'
  ssPort = 18388
}
$vars | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $deployDir 'deploy-vars.json') -Encoding UTF8
```

Expected: `.proxy-gateway/aws-singapore/deploy-vars.json` exists.

### Task 2: AWS Key Pair and Security Group

**Files:**
- Create: `C:\Users\g\.ssh\proxy-gateway-aws-sg-20260521.pem`
- Create: `.proxy-gateway/aws-singapore/security-group.json`

- [ ] **Step 1: Create or verify EC2 key pair**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$vars = Get-Content -Raw -LiteralPath (Join-Path $repo '.proxy-gateway\aws-singapore\deploy-vars.json') | ConvertFrom-Json
$pemPath = Join-Path $env:USERPROFILE ".ssh\$($vars.keyName).pem"
$existingKey = aws ec2 describe-key-pairs --region $vars.region --key-names $vars.keyName --query 'KeyPairs[0].KeyName' --output text 2>$null
if ($LASTEXITCODE -ne 0 -or $existingKey -ne $vars.keyName) {
  aws ec2 create-key-pair --region $vars.region --key-name $vars.keyName --query 'KeyMaterial' --output text | Set-Content -LiteralPath $pemPath -Encoding ascii -NoNewline
  icacls $pemPath /inheritance:r /grant:r "$env:USERNAME:R" | Out-Null
}
if (-not (Test-Path $pemPath)) { throw "Missing PEM: $pemPath" }
$pemPath
```

Expected: PEM file path is printed and the key pair exists in AWS.

- [ ] **Step 2: Create or reuse security group**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$vars = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'deploy-vars.json') | ConvertFrom-Json
$vpcId = aws ec2 describe-vpcs --region $vars.region --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text
if (-not ($vpcId -match '^vpc-')) { throw "Default VPC not found" }
$sgId = aws ec2 describe-security-groups --region $vars.region --filters Name=group-name,Values=$vars.securityGroupName Name=vpc-id,Values=$vpcId --query 'SecurityGroups[0].GroupId' --output text 2>$null
if ($sgId -eq 'None' -or -not ($sgId -match '^sg-')) {
  $sgId = aws ec2 create-security-group --region $vars.region --group-name $vars.securityGroupName --description 'proxy gateway singapore node' --vpc-id $vpcId --query 'GroupId' --output text
}
aws ec2 create-tags --region $vars.region --resources $sgId --tags Key=Project,Value=proxy-gateway-minimal Key=Purpose,Value=aws-singapore-proxy | Out-Null
[pscustomobject]@{ vpcId=$vpcId; securityGroupId=$sgId } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $deployDir 'security-group.json') -Encoding UTF8
$sgId
```

Expected: prints one security group id.

- [ ] **Step 3: Authorize required inbound rules idempotently**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$vars = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'deploy-vars.json') | ConvertFrom-Json
$sg = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'security-group.json') | ConvertFrom-Json
$rules = @(
  @{IpProtocol='tcp';FromPort=22;ToPort=22;CidrIp="$($vars.operatorIp)/32";Description='SSH from operator IP'},
  @{IpProtocol='tcp';FromPort=80;ToPort=80;CidrIp='0.0.0.0/0';Description='ACME HTTP'},
  @{IpProtocol='tcp';FromPort=443;ToPort=443;CidrIp='0.0.0.0/0';Description='HTTPS subscription'},
  @{IpProtocol='tcp';FromPort=[int]$vars.ssPort;ToPort=[int]$vars.ssPort;CidrIp='0.0.0.0/0';Description='Shadowsocks TCP'},
  @{IpProtocol='udp';FromPort=[int]$vars.ssPort;ToPort=[int]$vars.ssPort;CidrIp='0.0.0.0/0';Description='Shadowsocks UDP'}
)
foreach ($rule in $rules) {
  aws ec2 authorize-security-group-ingress --region $vars.region --group-id $sg.securityGroupId --ip-permissions "IpProtocol=$($rule.IpProtocol),FromPort=$($rule.FromPort),ToPort=$($rule.ToPort),IpRanges=[{CidrIp=$($rule.CidrIp),Description='$($rule.Description)'}]" 2>$null | Out-Null
}
aws ec2 describe-security-groups --region $vars.region --group-ids $sg.securityGroupId --query 'SecurityGroups[0].IpPermissions' --output table
```

Expected: table includes ports `22`, `80`, `443`, and `18388` for TCP/UDP.

### Task 3: EC2 Launch

**Files:**
- Create: `.proxy-gateway/aws-singapore/user-data.sh`
- Create: `.proxy-gateway/aws-singapore/instance.json`

- [ ] **Step 1: Write cloud-init user-data**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$vars = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'deploy-vars.json') | ConvertFrom-Json
$userData = @"
#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

SS_PORT=$($vars.ssPort)
METHOD="chacha20-ietf-poly1305"
SS_PASSWORD="$(openssl rand -base64 32 | tr -d '\n')"
SUB_TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(32))
PY
)"
IMDS_TOKEN="$(curl -fsS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")"
PUBLIC_IPV4="$(curl -fsS -H "X-aws-ec2-metadata-token: ${IMDS_TOKEN}" http://169.254.169.254/latest/meta-data/public-ipv4)"
PUBLIC_HOST="${PUBLIC_IPV4}.sslip.io"

apt-get update
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https python3 shadowsocks-libev
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

install -d -m 0755 /etc/shadowsocks-libev /opt/proxy-subscription
cat >/etc/shadowsocks-libev/aws-sg.json <<EOF
{
  "server": "0.0.0.0",
  "server_port": ${SS_PORT},
  "password": "${SS_PASSWORD}",
  "timeout": 300,
  "method": "${METHOD}",
  "mode": "tcp_and_udp",
  "fast_open": false
}
EOF
chmod 600 /etc/shadowsocks-libev/aws-sg.json

cat >/etc/systemd/system/proxy-ss-server.service <<'EOF'
[Unit]
Description=Proxy Gateway Shadowsocks Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/ss-server -c /etc/shadowsocks-libev/aws-sg.json -u
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat >/opt/proxy-subscription/subscription_server.py <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import os

TOKEN = os.environ["SUB_TOKEN"]
PUBLIC_HOST = os.environ["PUBLIC_HOST"]
SS_PORT = os.environ["SS_PORT"]
METHOD = os.environ["METHOD"]
SS_PASSWORD = os.environ["SS_PASSWORD"]

YAML = f"""proxies:
  - name: aws-singapore
    type: ss
    server: {PUBLIC_HOST}
    port: {SS_PORT}
    cipher: {METHOD}
    password: {SS_PASSWORD}
    udp: true
proxy-groups:
  - name: GLOBAL
    type: select
    proxies:
      - aws-singapore
      - DIRECT
rules:
  - MATCH,GLOBAL
"""

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/sub/clash.yaml":
            self.send_response(404)
            self.end_headers()
            return
        token = parse_qs(parsed.query).get("token", [""])[0]
        if token != TOKEN:
            self.send_response(401)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"Unauthorized"}')
            return
        body = YAML.encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/x-yaml; charset=utf-8")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

HTTPServer(("127.0.0.1", 3456), Handler).serve_forever()
PY
chmod 700 /opt/proxy-subscription/subscription_server.py

cat >/etc/proxy-subscription.env <<EOF
SUB_TOKEN=${SUB_TOKEN}
PUBLIC_HOST=${PUBLIC_HOST}
SS_PORT=${SS_PORT}
METHOD=${METHOD}
SS_PASSWORD=${SS_PASSWORD}
EOF
chmod 600 /etc/proxy-subscription.env

cat >/etc/systemd/system/proxy-subscription.service <<'EOF'
[Unit]
Description=Proxy Gateway Clash Subscription
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/proxy-subscription.env
ExecStart=/usr/bin/python3 /opt/proxy-subscription/subscription_server.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/caddy/Caddyfile <<EOF
${PUBLIC_HOST} {
  encode gzip
  header {
    X-Content-Type-Options nosniff
  }
  reverse_proxy 127.0.0.1:3456
}
EOF

cat >/root/proxy-node-summary.txt <<EOF
PUBLIC_IPV4=${PUBLIC_IPV4}
PUBLIC_HOST=${PUBLIC_HOST}
SS_PORT=${SS_PORT}
METHOD=${METHOD}
SS_PASSWORD=${SS_PASSWORD}
SUB_TOKEN=${SUB_TOKEN}
SUBSCRIPTION_URL=https://${PUBLIC_HOST}/sub/clash.yaml?token=${SUB_TOKEN}
EOF
chmod 600 /root/proxy-node-summary.txt

systemctl daemon-reload
systemctl enable --now proxy-ss-server.service
systemctl enable --now proxy-subscription.service
systemctl enable --now caddy.service
systemctl restart caddy.service
"@
$userData | Set-Content -LiteralPath (Join-Path $deployDir 'user-data.sh') -Encoding UTF8
```

Expected: `user-data.sh` exists and contains no literal generated secrets.

- [ ] **Step 2: Launch EC2 instance**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$vars = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'deploy-vars.json') | ConvertFrom-Json
$sg = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'security-group.json') | ConvertFrom-Json
$instanceId = aws ec2 run-instances `
  --region $vars.region `
  --image-id $vars.amiId `
  --instance-type $vars.instanceType `
  --key-name $vars.keyName `
  --security-group-ids $sg.securityGroupId `
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":8,"VolumeType":"gp3","DeleteOnTermination":true}}]' `
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=proxy-gateway-aws-sg},{Key=Project,Value=proxy-gateway-minimal},{Key=Purpose,Value=aws-singapore-proxy}]' 'ResourceType=volume,Tags=[{Key=Project,Value=proxy-gateway-minimal},{Key=Purpose,Value=aws-singapore-proxy}]' `
  --user-data file://$deployDir/user-data.sh `
  --query 'Instances[0].InstanceId' `
  --output text
if (-not ($instanceId -match '^i-')) { throw "Instance launch failed: $instanceId" }
[pscustomobject]@{ instanceId=$instanceId } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $deployDir 'instance.json') -Encoding UTF8
$instanceId
```

Expected: prints one instance id.

- [ ] **Step 3: Wait for EC2 status checks**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$vars = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'deploy-vars.json') | ConvertFrom-Json
$inst = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'instance.json') | ConvertFrom-Json
aws ec2 wait instance-status-ok --region $vars.region --instance-ids $inst.instanceId
aws ec2 describe-instances --region $vars.region --instance-ids $inst.instanceId --query 'Reservations[0].Instances[0].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PublicDns:PublicDnsName}' --output json | Set-Content -LiteralPath (Join-Path $deployDir 'instance-describe.json') -Encoding UTF8
Get-Content -LiteralPath (Join-Path $deployDir 'instance-describe.json')
```

Expected: state is `running` and a public IPv4 is present.

### Task 4: Instance Validation and Secret Retrieval

**Files:**
- Create: `.proxy-gateway/aws-singapore/proxy-node-summary.txt`
- Create: `.proxy-gateway/aws-singapore/subscription-url.txt`

- [ ] **Step 1: Retrieve server-side summary over SSH**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$vars = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'deploy-vars.json') | ConvertFrom-Json
$desc = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'instance-describe.json') | ConvertFrom-Json
$pemPath = Join-Path $env:USERPROFILE ".ssh\$($vars.keyName).pem"
ssh -o StrictHostKeyChecking=accept-new -i $pemPath "ubuntu@$($desc.PublicIp)" "sudo cat /root/proxy-node-summary.txt" | Set-Content -LiteralPath (Join-Path $deployDir 'proxy-node-summary.txt') -Encoding UTF8
Select-String -LiteralPath (Join-Path $deployDir 'proxy-node-summary.txt') -Pattern '^PUBLIC_IPV4=|^PUBLIC_HOST=|^SS_PORT=|^METHOD=|^SUBSCRIPTION_URL='
```

Expected: summary file exists; printed lines do not include the password.

- [ ] **Step 2: Save the subscription URL separately**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$summary = Get-Content -LiteralPath (Join-Path $deployDir 'proxy-node-summary.txt')
$url = ($summary | Where-Object { $_ -like 'SUBSCRIPTION_URL=*' }).Substring('SUBSCRIPTION_URL='.Length)
if (-not ($url -match '^https://')) { throw "Subscription URL missing" }
$url | Set-Content -LiteralPath (Join-Path $deployDir 'subscription-url.txt') -Encoding UTF8
```

Expected: `subscription-url.txt` contains the HTTPS URL for Clash.

- [ ] **Step 3: Validate HTTPS auth behavior**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$url = (Get-Content -Raw -LiteralPath (Join-Path $deployDir 'subscription-url.txt')).Trim()
$bad = Invoke-WebRequest -Uri ($url -replace 'token=.*$', 'token=bad') -SkipHttpErrorCheck -TimeoutSec 20
$good = Invoke-WebRequest -Uri $url -TimeoutSec 30
[pscustomobject]@{
  badStatus = $bad.StatusCode
  goodStatus = $good.StatusCode
  goodHasProxy = $good.Content -match 'aws-singapore'
  goodHasPassword = $good.Content -match 'password:'
} | ConvertTo-Json
```

Expected: bad status is `401`, good status is `200`, and YAML contains `aws-singapore`.

- [ ] **Step 4: Validate Shadowsocks exit IP**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$summary = @{}
Get-Content -LiteralPath (Join-Path $deployDir 'proxy-node-summary.txt') | ForEach-Object {
  $idx = $_.IndexOf('=')
  if ($idx -gt 0) { $summary[$_.Substring(0,$idx)] = $_.Substring($idx+1) }
}
$tempConfig = Join-Path $deployDir 'sslocal-test.json'
@{
  server = $summary.PUBLIC_HOST
  server_port = [int]$summary.SS_PORT
  password = $summary.SS_PASSWORD
  method = $summary.METHOD
  local_address = '127.0.0.1'
  local_port = 11080
  mode = 'tcp_and_udp'
  timeout = 300
} | ConvertTo-Json | Set-Content -LiteralPath $tempConfig -Encoding UTF8
$ss = Start-Process -FilePath (Join-Path $repo 'bin\sslocal.exe') -ArgumentList @('-c', $tempConfig, '-U') -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
try {
  $exitIp = (& curl.exe --silent --show-error --socks5-hostname 127.0.0.1:11080 https://checkip.amazonaws.com/).Trim()
  [pscustomobject]@{ exitIp=$exitIp; expected=$summary.PUBLIC_IPV4; matches=($exitIp -eq $summary.PUBLIC_IPV4) } | ConvertTo-Json
} finally {
  Stop-Process -Id $ss.Id -Force -ErrorAction SilentlyContinue
}
```

Expected: `matches` is `true`.

### Task 5: Cost Guardrail and Final State

**Files:**
- Create: `.proxy-gateway/aws-singapore/budget.json`
- Create: `.proxy-gateway/aws-singapore/final-status.json`

- [ ] **Step 1: Create a low monthly AWS budget alert**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$accountId = (aws sts get-caller-identity --query Account --output text)
$budget = @{
  BudgetName = 'proxy-gateway-minimal-monthly-5usd'
  BudgetLimit = @{ Amount = '5'; Unit = 'USD' }
  TimeUnit = 'MONTHLY'
  BudgetType = 'COST'
  CostFilters = @{ TagKeyValue = @('Project$proxy-gateway-minimal') }
} | ConvertTo-Json -Depth 6
$notify = @(
  @{
    Notification = @{
      NotificationType = 'ACTUAL'
      ComparisonOperator = 'GREATER_THAN'
      Threshold = 80
      ThresholdType = 'PERCENTAGE'
    }
    Subscribers = @(
      @{ SubscriptionType = 'EMAIL'; Address = 'gaoyi1020@gmail.com' }
    )
  }
) | ConvertTo-Json -Depth 6
$budgetPath = Join-Path $deployDir 'budget.json'
$notifyPath = Join-Path $deployDir 'budget-notification.json'
$budget | Set-Content -LiteralPath $budgetPath -Encoding UTF8
$notify | Set-Content -LiteralPath $notifyPath -Encoding UTF8
aws budgets create-budget --account-id $accountId --budget file://$budgetPath --notifications-with-subscribers file://$notifyPath 2>$null
if ($LASTEXITCODE -ne 0) {
  aws budgets describe-budget --account-id $accountId --budget-name 'proxy-gateway-minimal-monthly-5usd' --output json
}
```

Expected: budget is created or already exists.

- [ ] **Step 2: Capture final AWS resource state**

Run:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$vars = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'deploy-vars.json') | ConvertFrom-Json
$inst = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'instance.json') | ConvertFrom-Json
$state = aws ec2 describe-instances --region $vars.region --instance-ids $inst.instanceId --query 'Reservations[0].Instances[0].{InstanceId:InstanceId,State:State.Name,Type:InstanceType,PublicIp:PublicIpAddress,SecurityGroups:SecurityGroups[*].GroupId,Tags:Tags}' --output json
$state | Set-Content -LiteralPath (Join-Path $deployDir 'final-status.json') -Encoding UTF8
$state
```

Expected: one running `t4g.small` instance with public IPv4.

- [ ] **Step 3: Verify local Git state remains clean except committed plan docs**

Run:

```powershell
git status --short
```

Expected: no tracked changes; `.proxy-gateway/aws-singapore/` is ignored.

## Rollback Commands

Terminate the instance:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$vars = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'deploy-vars.json') | ConvertFrom-Json
$inst = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'instance.json') | ConvertFrom-Json
aws ec2 terminate-instances --region $vars.region --instance-ids $inst.instanceId
```

Delete the security group after the instance terminates:

```powershell
$repo = 'C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal'
$deployDir = Join-Path $repo '.proxy-gateway\aws-singapore'
$vars = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'deploy-vars.json') | ConvertFrom-Json
$sg = Get-Content -Raw -LiteralPath (Join-Path $deployDir 'security-group.json') | ConvertFrom-Json
aws ec2 delete-security-group --region $vars.region --group-id $sg.securityGroupId
```
