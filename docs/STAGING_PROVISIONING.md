# Staging Provisioning Runbook

Last updated: 2026-07-14, America/Los_Angeles.

> Status:
> - Type: Active conditional runbook with historical AWS resource examples
> - Risk: A
> - Execution authority: None
> - Production impact: None unless separately approved and executed
> - Source of truth for: Ordered clean-staging steps after current target
>   selection and complete exact Risk A approval
>
> **No current target or reusable resource identity is declared here.** The
> AWS identifiers and values below are dated planning evidence. Fresh inventory
> and the approved gate must replace them before any provider mutation.

This runbook turns an already approved staging target into an operator
checklist for creating, deploying, verifying, stopping, and destroying a clean
staging AWS instance for `proxy-gateway-minimal`.

Before using any mutating step, select the current lane through
`docs/RUNTIME_LANE_AUTHORITY.md`, complete fresh live read-only inventory under
the applicable access rules, and obtain a complete exact Risk A gate. The path
labels in `docs/STAGING_TARGET_DECISION.md` describe alternatives only; they do
not constitute approval by themselves.

## Scope

In scope:

- Create a clean staging EC2 instance when a candidate needs AWS validation.
- Deploy one exact candidate commit to `/opt/proxy-gateway-minimal`.
- Use staging-only `.env`, SQLite data, node password, and subscription tokens.
- Verify public gateway behavior and loopback-only admin behavior.
- Stop or destroy staging after validation.

Out of scope:

- Production deployment.
- Starting the historical stopped instance as staging.
- Copying production `.env`, subscription URLs, tenant tokens, or SQLite data.
- Exposing the admin UI or admin API publicly.
- Docker, Terraform, Ansible, or automatic CD.

## Not Performed Boundary

Unless a later staging execution record has exact approval and records matching
validation evidence, this runbook has not performed:

```text
AWS staging instance or security-group creation
AWS start, stop, terminate, tag, firewall, or listener mutation
deployment to a staging host
staging .env, SQLite, node password, or subscription-token generation
public gateway or Shadowsocks validation traffic
cleanup, stop, destroy, or teardown
```

## Safety Gates

### Read-Only Operations

These operations are safe during planning:

```powershell
git status --short --branch
git rev-parse HEAD
gh pr view <pr-number> --json number,title,headRefName,headRefOid,isDraft

$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aws ec2 describe-instances --region ap-southeast-1 --filters Name=tag:Project,Values=proxy-gateway-minimal
aws ec2 describe-security-groups --region ap-southeast-1 --filters Name=vpc-id,Values=vpc-01be6089f9892a651
```

### Mutating Operations

The commands below create or change AWS resources. Do not run them unless a
complete exact Risk A gate has been durably approved and read back. That gate
must bind the current target, exact allowed commands, candidate identity,
sensitive-output boundary, validation, rollback, stop conditions, and forbidden
actions.

The following text is a path label only, not approval text:

```text
Create a new clean staging instance
```

Rebuilding the stopped historical node is a different path and requires its
own complete exact Risk A gate. It is not covered by this clean-instance
runbook.

## Preflight Check

Every staging execution must complete the `Dry-Run Checklist` before any AWS
resource creation, deployment, security-group change, listener exposure,
service start, validation traffic, cleanup, stop, or destroy action. The
preflight record is required to state:

```text
Risk: A / mutation forbidden until complete exact gate approval
Mutation: none
Candidate SHA and validation evidence: recorded
Read-only AWS inventory and production-exclusion checks: verified
Exact gate target and allowed commands: match fresh inventory
Staging-only secret/data plan: recorded
Secrets/customer data: not printed or copied into Git
Cleanup/teardown owner: named
```

If any preflight fact is stale, missing, or inconsistent with the staging
target or mutation boundary in the exact gate, stop before mutation and refresh
the dry-run evidence.

## Resource Plan

The following values are the dated 2026 planning snapshot. Do not use them as a
current resource plan. Fresh read-only inventory and the complete exact Risk A
gate must supply and bind every provider-specific value before execution; if
any required value is absent or differs, stop before mutation.

| Field | Historical planning value |
| --- | --- |
| Region | `ap-southeast-1` |
| AMI | `ami-08bf93219e21cea7a` |
| AMI name | `ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-20260515` |
| Architecture | `arm64` |
| Instance type | `t4g.small` |
| Key pair | `proxy-gateway-aws-sg-20260521` |
| VPC | `vpc-01be6089f9892a651` |
| Subnet | `subnet-0bd6d390d9e318744` |
| Runtime path | `/opt/proxy-gateway-minimal` |
| Service user | `proxy-gateway` |
| Staging name | `proxy-gateway-staging-sg-<YYYYMMDD>` |
| Security group name | `proxy-gateway-staging-sg-<YYYYMMDD>` |
| Tags | `Project=proxy-gateway-minimal`, `Environment=staging`, `Role=pre-release`, `Owner=codex` |

The following inbound rules are also a historical proposal. The exact gate
must bind the current source ranges and allowed ports before any security-group
mutation:

| Port | Protocol | Source | Purpose |
| --- | --- | --- | --- |
| `22` | TCP | operator `/32` only | SSH |
| `80` | TCP | operator test range or short-lived `0.0.0.0/0` | Public Nginx gateway |
| `18388` | TCP | operator test range or short-lived `0.0.0.0/0` | Shadowsocks staging check |
| `18388` | UDP | operator test range or short-lived `0.0.0.0/0` | Shadowsocks staging check |

Never expose `3456/tcp` publicly. The console/API must remain bound to
`127.0.0.1` and be tested through SSH tunnel or on-host curl.

## Dry-Run Checklist

Complete this checklist before running any mutating AWS command. The dry-run
stage is limited to local Git/GitHub checks, separately authorized read-only
AWS inventory, complete exact gate capture, and notes. It must not create,
start, stop, terminate, tag, or modify AWS resources.

### Candidate And Validation

- Confirm the local checkout is clean and on the intended branch:

  ```powershell
  git status --short --branch
  git fetch origin
  git rev-parse HEAD
  ```

- Record the exact candidate SHA. If the candidate is a PR, record the PR
  number and the PR head SHA:

  ```powershell
  gh pr view <pr-number> --json number,title,headRefName,headRefOid,isDraft,mergeable
  ```

- Confirm local or PR validation has completed. At minimum, record the result
  of the repository checks that gate this candidate, such as:

  ```powershell
  npm test
  npm run admin:test
  npm run admin:build
  ```

  If GitHub-hosted CI is unavailable because of account billing or spending
  limits, record the run ID and the manual CI-equivalent validation used as the
  temporary waiver.

### Read-Only AWS Inventory

Clear stale proxy variables for this PowerShell process before inventory
commands:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
```

Run read-only inventory only. The `Project=proxy-gateway-minimal` queries help
find staging or historical project resources, but they are not sufficient to
exclude production because the current production blue instance may not carry
`Project` or `Role` tags.

```powershell
aws ec2 describe-instances `
  --region ap-southeast-1 `
  --filters Name=tag:Project,Values=proxy-gateway-minimal `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,Name:Tags[?Key=='Name']|[0].Value,Environment:Tags[?Key=='Environment']|[0].Value,Role:Tags[?Key=='Role']|[0].Value}" `
  --output table

aws ec2 describe-security-groups `
  --region ap-southeast-1 `
  --filters Name=tag:Project,Values=proxy-gateway-minimal `
  --query "SecurityGroups[].{GroupId:GroupId,GroupName:GroupName,VpcId:VpcId,Description:Description,Tags:Tags}" `
  --output table

aws ec2 describe-instances `
  --region ap-southeast-1 `
  --instance-ids i-004ab1c6c71d06bca i-0589aac321172dd74 `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,Name:Tags[?Key=='Name']|[0].Value,Project:Tags[?Key=='Project']|[0].Value,Environment:Tags[?Key=='Environment']|[0].Value,Role:Tags[?Key=='Role']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value,SecurityGroups:SecurityGroups[*].GroupId}" `
  --output table

aws ec2 describe-instances `
  --region ap-southeast-1 `
  --filters Name=ip-address,Values=47.129.247.102 `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,Name:Tags[?Key=='Name']|[0].Value,SecurityGroups:SecurityGroups[*].GroupId}" `
  --output table

aws ec2 describe-security-groups `
  --region ap-southeast-1 `
  --group-ids sg-04a165ec77f430ee8 `
  --query "SecurityGroups[].{GroupId:GroupId,GroupName:GroupName,VpcId:VpcId,Description:Description,IpPermissions:IpPermissions}" `
  --output table
```

Confirm:

- No current staging instance is already assigned unless this run is explicitly
  an update/reuse path.
- Production was checked by explicit instance ID and current public IP, not only
  by `Project` tag.
- The stopped historical node was checked by explicit instance ID.
- The production security group was checked by explicit group ID.
- The active production instance is not the staging target.
- The stopped historical instance is not being reused as staging.
- No production security group, volume, `.env`, SQLite database, node config, or
  public IP retention plan is being changed by this run.

### Operator Approval Gate

Without a complete exact Risk A gate whose target and commands match the fresh
inventory, stop after this dry-run checklist and PR preparation. Do not run
commands such as:

```text
aws ec2 create-security-group
aws ec2 authorize-security-group-ingress
aws ec2 run-instances
aws ec2 create-tags
aws ec2 stop-instances
aws ec2 terminate-instances
aws ec2 delete-security-group
```

The path label for this clean-instance alternative is:

```text
Create a new clean staging instance
```

This label is not an approval. The historical stopped node is not covered by
this path, and any reuse or rebuild requires a separate complete exact Risk A
gate under `docs/STAGING_TARGET_DECISION.md`.

### Secret And Data Boundary

Before approval, confirm that the planned staging environment will use:

- A staging-only `.env`.
- A staging-only `CONSOLE_TOKEN`.
- A staging-only `SS_PASSWORD`.
- A staging-only SQLite database initialized empty.
- A staging-only `config/proxy-servers.json` host override.
- No production subscription URL, tenant token, SQLite data, node password, or
  ignored `.proxy-gateway/` material.

Do not write generated staging secrets, subscription URLs, tenant tokens, or raw
node passwords into Git, docs, PR comments, or chat replies.

### Abort Conditions

Abort before any mutating command if any of these are true:

- The local checkout has unrelated changes or the candidate SHA is unclear.
- The PR head SHA and recorded candidate SHA do not match.
- Required local validation or accepted CI-equivalent validation is missing.
- A staging target already exists and no exact update/reuse gate was approved.
- The command plan references the production instance, production security
  group, production `.env`, production SQLite database, or production node
  config.
- The plan references the stopped historical instance without a separate exact
  historical-node gate.
- Operator CIDR, VPC, subnet, AMI, key pair, or tags are unknown.
- Any secret, token, subscription URL, or customer data would be copied from
  production into staging.

### Dry-Run Record Template

Copy this template into the PR comment, issue, or operator notes before moving
to `Preflight`:

```text
Dry-run date:
Operator:
Candidate branch:
Candidate SHA:
PR:
Local validation:
GitHub Actions run / waiver:
AWS inventory command timestamps:
Existing staging target:
Production instance lookup method:
Production security group lookup:
Production instance excluded:
Historical stopped node excluded:
Operator CIDR:
Planned VPC / subnet / AMI / key pair:
Exact Risk A gate ID:
Durable approval and readback verified:
Approved current target:
Approved command boundary:
Validation / rollback / stop / forbidden boundaries recorded:
Secret boundary confirmed:
SQLite boundary confirmed:
Node config boundary confirmed:
Abort notes:
Next step:
```

## Preflight

Run locally before provisioning:

```powershell
git status --short --branch
git fetch origin
git rev-parse HEAD
npm test
npm run admin:test
npm run admin:build
```

Record the candidate commit SHA, PR number, and validation result. If the
candidate comes from a PR, deploy the PR head SHA or the post-merge `master`
commit explicitly; do not deploy "whatever branch is current" on the server.

Confirm no staging target is currently assigned:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aws ec2 describe-instances `
  --region ap-southeast-1 `
  --filters Name=tag:Project,Values=proxy-gateway-minimal Name=tag:Environment,Values=staging `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,Name:Tags[?Key=='Name']|[0].Value,Role:Tags[?Key=='Role']|[0].Value}" `
  --output table
```

If this returns an existing staging instance, update or reuse that instance only
after reading its recorded state in `docs/ENVIRONMENT_TOPOLOGY.md`.

## Create AWS Resources

Set local PowerShell variables:

```powershell
$region = "ap-southeast-1"
$vpcId = "vpc-01be6089f9892a651"
$subnetId = "subnet-0bd6d390d9e318744"
$operatorCidr = "<operator-public-ip>/32"
$stagingName = "proxy-gateway-staging-sg-<YYYYMMDD>"
$securityGroupName = "proxy-gateway-staging-sg-<YYYYMMDD>"
```

Create a dedicated staging security group:

```powershell
$sgId = aws ec2 create-security-group `
  --region $region `
  --group-name $securityGroupName `
  --description "proxy-gateway-minimal staging gateway" `
  --vpc-id $vpcId `
  --query "GroupId" `
  --output text

aws ec2 create-tags `
  --region $region `
  --resources $sgId `
  --tags Key=Name,Value=$securityGroupName Key=Project,Value=proxy-gateway-minimal Key=Environment,Value=staging Key=Role,Value=pre-release Key=Owner,Value=codex
```

Authorize inbound rules. Keep `80` and `18388` on the operator range unless a
short public compatibility check is needed:

```powershell
aws ec2 authorize-security-group-ingress --region $region --group-id $sgId --protocol tcp --port 22 --cidr $operatorCidr
aws ec2 authorize-security-group-ingress --region $region --group-id $sgId --protocol tcp --port 80 --cidr $operatorCidr
aws ec2 authorize-security-group-ingress --region $region --group-id $sgId --protocol tcp --port 18388 --cidr $operatorCidr
aws ec2 authorize-security-group-ingress --region $region --group-id $sgId --ip-permissions "IpProtocol=udp,FromPort=18388,ToPort=18388,IpRanges=[{CidrIp=$operatorCidr}]"
```

Launch the instance:

```powershell
$instanceId = aws ec2 run-instances `
  --region $region `
  --image-id ami-08bf93219e21cea7a `
  --instance-type t4g.small `
  --key-name proxy-gateway-aws-sg-20260521 `
  --subnet-id $subnetId `
  --security-group-ids $sgId `
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=12,VolumeType=gp3,DeleteOnTermination=true}" `
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$stagingName},{Key=Project,Value=proxy-gateway-minimal},{Key=Environment,Value=staging},{Key=Role,Value=pre-release},{Key=Owner,Value=codex}]" "ResourceType=volume,Tags=[{Key=Name,Value=$stagingName-root},{Key=Project,Value=proxy-gateway-minimal},{Key=Environment,Value=staging},{Key=Role,Value=pre-release},{Key=Owner,Value=codex}]" `
  --query "Instances[0].InstanceId" `
  --output text

aws ec2 wait instance-running --region $region --instance-ids $instanceId
aws ec2 describe-instances `
  --region $region `
  --instance-ids $instanceId `
  --query "Reservations[0].Instances[0].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,SecurityGroups:SecurityGroups[*].GroupId}" `
  --output table
```

Record the instance ID, public IP, private IP, security group, and candidate
commit before deploying.

## Bootstrap The Host

SSH to the staging host:

```powershell
ssh -i "$env:USERPROFILE\.ssh\proxy-gateway-aws-sg-20260521.pem" ubuntu@<staging-public-ip>
```

Install runtime dependencies:

```bash
sudo apt-get update
sudo apt-get install -y git nodejs npm nginx sqlite3 shadowsocks-libev
node --version
npm --version
node -e "const major = Number(process.versions.node.split('.')[0]); if (major < 20) process.exit(1)"
```

This repository requires Node.js `20.x` or newer. If the OS package source
installs an older Node.js version, stop and install a supported Node.js runtime
through the operator-approved package source before continuing.

Create the service user and runtime directory:

```bash
sudo useradd --system --home /opt/proxy-gateway-minimal --shell /usr/sbin/nologin proxy-gateway || true
sudo mkdir -p /opt/proxy-gateway-minimal
sudo chown -R proxy-gateway:proxy-gateway /opt/proxy-gateway-minimal
```

Deploy the candidate commit. Because the GitHub repository is private and the
production runtime is not treated as a Git checkout, the default staging
transport is a local archive copied over SSH rather than storing GitHub
credentials on the staging host.

On the operator machine:

```powershell
$candidateSha = "<candidate-commit-sha>"
$archive = Join-Path $env:TEMP "proxy-gateway-staging-$candidateSha.tar"
git archive --format=tar --output $archive $candidateSha
scp -i "$env:USERPROFILE\.ssh\proxy-gateway-aws-sg-20260521.pem" $archive ubuntu@<staging-public-ip>:/tmp/proxy-gateway-staging.tar
```

On the staging host:

```bash
if [ -e /opt/proxy-gateway-minimal/.env ] || [ -e /opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite ]; then
  echo "staging runtime data already exists; stop and choose an update or destroy path" >&2
  exit 1
fi
sudo mkdir -p /opt/proxy-gateway-minimal
sudo tar --no-same-owner -xf /tmp/proxy-gateway-staging.tar -C /opt/proxy-gateway-minimal
printf '%s\n' '<candidate-commit-sha>' | sudo tee /opt/proxy-gateway-minimal/.deployed-commit >/dev/null
sudo chown -R proxy-gateway:proxy-gateway /opt/proxy-gateway-minimal
cd /opt/proxy-gateway-minimal
sudo -u proxy-gateway npm ci
sudo -u proxy-gateway npm ci --prefix admin
sudo -u proxy-gateway npm run admin:build
```

Do not import the production database. Initialize staging from an empty runtime
directory:

```bash
sudo -u proxy-gateway mkdir -p /opt/proxy-gateway-minimal/.proxy-gateway/backups
sudo chmod 700 /opt/proxy-gateway-minimal/.proxy-gateway
```

Create staging-only environment values:

```bash
cd /opt/proxy-gateway-minimal
sudo -u proxy-gateway cp .env.example .env
sudo -u proxy-gateway chmod 600 .env
sudo -u proxy-gateway editor .env
```

Required staging `.env` differences:

```text
CONSOLE_TOKEN=<new staging-only random admin token>
SS_PASSWORD=<new staging-only Shadowsocks password>
SUBSCRIPTION_DB_PATH=/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite
PUBLIC_SUBSCRIPTION_BASE_URL=http://<staging-public-ip>
ADMIN_ALLOWED_CIDRS=127.0.0.1/32,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
```

Do not write the generated values into Git, docs, PRs, or chat replies.

Create a staging runtime node config. The tracked `config/proxy-servers.json`
points at production, so staging must replace it on the host with staging-only
host values before subscription checks:

```bash
sudo -u proxy-gateway editor config/proxy-servers.json
```

Required staging changes:

```text
servers[0].name=aws-singapore-staging
servers[0].host=<staging-public-ip>
servers[0].password=${SS_PASSWORD}
pingHosts[0]=<staging-public-ip>
nginx.host=<staging-public-ip>
```

A minimal staging config should keep the password value as an environment
reference:

```json
{
  "servers": [
    {
      "name": "aws-singapore-staging",
      "host": "<staging-public-ip>",
      "port": 18388,
      "method": "aes-256-gcm",
      "password": "${SS_PASSWORD}",
      "type": "shadowsocks-libev",
      "note": "AWS Singapore staging node"
    }
  ],
  "pingHosts": ["<staging-public-ip>"],
  "nginx": {
    "host": "<staging-public-ip>",
    "ports": [80, 18388]
  }
}
```

Install services and Nginx:

```bash
cd /opt/proxy-gateway-minimal
sudo cp ops/systemd/proxy-gateway-console.service /etc/systemd/system/
sudo cp ops/systemd/proxy-gateway-ss.service /etc/systemd/system/
sudo systemctl daemon-reload

sudo cp ops/nginx/proxy-gateway-public.conf /etc/nginx/sites-available/proxy-gateway-public.conf
sudo ln -sf /etc/nginx/sites-available/proxy-gateway-public.conf /etc/nginx/sites-enabled/proxy-gateway-public.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

sudo systemctl enable --now proxy-gateway-console.service
sudo systemctl enable --now proxy-gateway-ss.service
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

## Staging Verification

On the staging host:

```bash
systemctl is-active proxy-gateway-console.service proxy-gateway-ss.service nginx
ss -lntup
curl -i http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1:3456/api/admin/subscriptions
sudo -u proxy-gateway sqlite3 /opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite "pragma integrity_check;"
sudo -u proxy-gateway sqlite3 /opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite "select count(*) from subscription_tenants;"
```

Expected loopback behavior:

```text
/api/health -> 200
/api/admin/subscriptions without bearer token -> 401
console/API listener -> 127.0.0.1:3456 only
SQLite integrity_check -> ok
subscription_tenants count -> 0 before staging test tenants are created
```

From the operator machine or another public network:

```powershell
curl.exe -i http://<staging-public-ip>/api/health
curl.exe -i http://<staging-public-ip>/api/admin/subscriptions
curl.exe -i http://<staging-public-ip>/sub/clash.yaml
curl.exe -i http://<staging-public-ip>/
curl.exe -i http://<staging-public-ip>/index.html
```

Expected public behavior:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
/ -> 404
/index.html -> 404
```

For Admin UI checks, use an SSH tunnel. Do not open `3456/tcp` in the staging
security group:

```powershell
ssh -i "$env:USERPROFILE\.ssh\proxy-gateway-aws-sg-20260521.pem" -L 3456:127.0.0.1:3456 ubuntu@<staging-public-ip>
npm run admin:dev
```

In the local UI, leave the API base URL blank so Vite dev proxy sends `/api/*`
to the tunnel target.

## Promotion Gate

Passing staging does not deploy production. Before production promotion:

- Confirm the exact candidate commit.
- Confirm staging verification results are recorded.
- Back up production SQLite with `scripts/backup-subscriptions.sh`.
- Verify production SQLite integrity with `sqlite3 ... "pragma integrity_check;"`.
- Preserve production `.env`, production SQLite data, production node config, and
  Nginx public admin blocking.
- Require explicit operator approval for production deployment.

## Rollback / Cleanup

Staging rollback means stopping or destroying only the approved staging
instance and its staging security group. It does not authorize production
rollback, production service restart, production data restore, or reuse of the
historical stopped node.

## Stop Or Destroy Staging

For a short pause:

```powershell
aws ec2 stop-instances --region ap-southeast-1 --instance-ids <staging-instance-id>
```

Before stopping, record whether the public IP is disposable. A stopped instance
without Elastic IP may receive a different public IP when started again.

For cleanup after validation:

```powershell
aws ec2 terminate-instances --region ap-southeast-1 --instance-ids <staging-instance-id>
aws ec2 wait instance-terminated --region ap-southeast-1 --instance-ids <staging-instance-id>
aws ec2 delete-security-group --region ap-southeast-1 --group-id <staging-security-group-id>
```

Delete the staging security group only after the instance and its network
interfaces are gone. Do not delete production security groups or volumes.

## Documentation Updates

After assigning staging, update `docs/ENVIRONMENT_TOPOLOGY.md` with:

- Instance ID.
- Public IP and private IP.
- Security group.
- Runtime path.
- Candidate commit SHA.
- Data boundary: staging `.env`, staging SQLite, staging node password.
- Verification results.

Update `docs/PROJECT_CONTEXT.md` with the date, branch or commit, AWS target,
service restart status, and endpoint results.

If staging is destroyed, update both documents again so future operators do not
treat a dead instance ID or old public IP as current.
