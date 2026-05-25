# Manual CI Validation Runbook

> Status:
> - Type: Active runbook
> - Risk: C/B validation support; not a production gate
> - Execution authority: Does not authorize cloud resource mutation, staging,
>   production deploy, or self-hosted runner registration
> - Production impact: None
> - Source of truth for: manual CI validation host usage and fallback
>   clean-server CI-equivalent validation while GitHub-hosted Actions is blocked

Last updated: 2026-05-24, Asia/Shanghai.

This runbook defines the manual CI-equivalent validation path to use when
GitHub-hosted Actions cannot start because of the current account billing or
spending-limit blocker. It is a repository validation procedure only. It is not
staging, not production deployment, and not approval to mutate cloud resources.

## When To Use This

Use this runbook only when all of these are true:

- The GitHub Actions `CI` workflow cannot start on GitHub-hosted runners because
  of account billing, spending-limit, quota, or runner-start blockers.
- The PR or `master` commit still needs clean-environment validation evidence.
- Normal local developer-machine validation is not enough for the merge or
  handoff decision.

Do not use this runbook to permanently replace GitHub-hosted CI. After the
account blocker is resolved, rerun the `CI` workflow on `master` or the target
PR and record the hosted result.

## Default Mode

Target default is the approved local Linux manual CI validation host once it is
bootstrapped and validated. Until that transition is recorded, the existing
Aliyun manual CI validation host remains historical fallback infrastructure.
Do not keep routine CI on a server that is being prepared as production
subscription control plane.

Every validation run must use a clean per-run workspace and must remove the
workspace, repository credentials, local archives, logs, and dependency caches
after the run.

```text
approved manual CI validation host
not staging
not production
not self-hosted runner
clean per-run workspace
checkout master or PR head
npm ci
npm ci --prefix admin
npm test
npm run admin:test
npm run admin:build
record result in the PR or handoff
delete per-run workspace and credentials
clean caches and temporary files
retain host only as the approved validation host
```

### Target Local Linux Host Inventory

The target local Linux manual CI host must be verified before it replaces the
Aliyun fallback:

```text
OS: Ubuntu 24.04 LTS or compatible Linux
Node: 22.x
npm: compatible with package lockfiles
git: available if using checkout mode
network: private operator-managed access
production role: none
staging role: none
secrets copied: none
cleanup: required after every run
```

The target bootstrap and validation sequence lives in
`docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`.

### Historical Aliyun Host Inventory

Read-only inventory verified on 2026-05-24:

```text
Product: Aliyun Simple Application Server / SWAS, not ECS
Region: us-west-1
Instance ID: 3e9253d3fb044463b876edacf6af8784
Public IP: 47.251.178.125
OS image: Ubuntu 24.04
Status: Running
Node: v22.22.2
npm: 10.9.7
git: 2.43.0
```

Use SWAS inventory for this host:

```powershell
aliyun swas-open list-instances --region us-west-1 --biz-region-id us-west-1
```

Do not use `aliyun ecs DescribeInstances` as the primary inventory command for
this host. It is not an ECS instance, so ECS inventory can return no instances
even while the SWAS validation host is running.

Current access state as of the historical record: SSH access from the Codex local environment was restored
and verified on 2026-05-24 using the approved local key file
`~/.ssh/gao_new.pem`. The local `miyao` SSH alias now points at the new key and
has been verified with `ssh miyao` against the validation host. The old config
was retained as a local backup outside the repository. Do not record private key
material, passwords, repository credentials, or other secrets in this runbook,
PRs, chat, or validation records.

If the approved manual CI host is unavailable, use a temporary clean validation
server as a fallback:

```text
temporary non-production server
clean clone or clean archive unpack
checkout master or PR head
npm ci
npm ci --prefix admin
npm test
npm run admin:test
npm run admin:build
record result in the PR or handoff
destroy server
```

Do not register a GitHub self-hosted runner as the default workaround. A
self-hosted runner is allowed only as a later explicit ops task after confirming
that the GitHub account blocker still allows workflow jobs to be scheduled to
self-hosted runners.

## Validation Server Requirements

Recommended baseline:

```text
OS: Ubuntu 24.04 LTS x64
CPU: 2 vCPU
RAM: 4 GB
Disk: 20 GB
Node: 22.x
```

The validation host must be:

- Non-production.
- Not a staging target.
- Not attached to the production security group.
- Not connected to `/opt/proxy-gateway-minimal` production runtime.
- Cleaned after each validation run.

For any approved long-lived manual CI validation host, do not destroy the host
after each run. Destroying or reprovisioning that host is a separate ops
decision. Cleanup means deleting run-specific workspaces, archives, logs,
credentials, and caches from the host after each validation.

For the historical Aliyun host, cleanup and retirement from the CI lane are
separate Risk A-adjacent operations because the target plan may reuse that host
as the production subscription control-plane candidate. Do not mutate it for CI
cleanup without a specific approval record.

For fallback temporary validation servers, destroy the server after validation
unless the operator explicitly approves reuse.

## Secret And Data Boundary

Never copy these into the validation server:

- Production `.env`.
- Production `CONSOLE_TOKEN`.
- Production `SS_PASSWORD`.
- Production subscription URLs or tenant tokens.
- Production SQLite database.
- AWS credentials.
- Customer data.
- Long-lived SSH private keys.

For private repository access, prefer GitHub CLI authentication or another
short-lived repository credential on the validation host. Remove credentials
after each run. If repository access cannot be granted safely, stop and use a
local archive transfer instead of weakening the secret boundary.

## Repository Access

The clone commands below assume short-lived GitHub repository access has already
been configured on the validation host. Do not paste long-lived tokens into
shell history and do not copy production SSH keys to this host.

If short-lived repository access is not available, prepare an archive on the
operator machine and copy it to the validation server instead:

```powershell
$candidateSha = "<candidate-commit-sha>"
$archive = Join-Path $env:TEMP "proxy-gateway-ci-$candidateSha.tar"
git archive --format=tar --output $archive $candidateSha
scp $archive <validation-user>@<validation-host>:/tmp/proxy-gateway-ci-$candidateSha.tar
```

Then unpack it on the validation server:

```bash
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$candidateSha"
workdir="$HOME/proxy-gateway-manual-ci/$run_id"
mkdir -p "$workdir"
tar -xf "/tmp/proxy-gateway-ci-$candidateSha.tar" -C "$workdir"
cd "$workdir"
```

## Server Setup

On the validation host:

```bash
sudo apt-get update
sudo apt-get install -y git curl build-essential python3

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

node --version
npm --version
```

Clean clone into a per-run workspace:

```bash
candidate_ref="<master-or-pr-ref>"
run_id="$(date -u +%Y%m%dT%H%M%SZ)-manual-ci"
workdir="$HOME/proxy-gateway-manual-ci/$run_id"
mkdir -p "$workdir"
git clone https://github.com/gaoyi1020-web/proxy-gateway-minimal.git "$workdir"
cd "$workdir"
```

Validate `master`:

```bash
git switch master
git pull --ff-only origin master
git rev-parse HEAD
```

Validate a PR head:

```bash
git fetch origin pull/<PR_NUMBER>/head:manual-ci-pr-<PR_NUMBER>
git switch manual-ci-pr-<PR_NUMBER>
git rev-parse HEAD
```

## CI-Equivalent Commands

Run the same validation sequence as `.github/workflows/ci.yml`:

```bash
npm ci
npm ci --prefix admin
npm test
npm run admin:test
npm run admin:build
```

Do not skip `npm ci`; it is the clean dependency install boundary. Do not reuse
`node_modules` from another checkout.

## Result Recording Template

Record the result in the PR comment or project handoff:

```text
Manual CI-equivalent validation
Date:
Validation host:
Host lifecycle: long-lived manual validation host retained / temporary host destroyed / retained with approval
Repository:
Target: master / PR #<number>
Commit SHA:
Node:
npm:
npm ci:
npm ci --prefix admin:
npm test:
npm run admin:test:
npm run admin:build:
GitHub Actions blocked run:
Secrets copied: none
Cloud / production touched: no
Environment cleanup:
Notes:
```

If any command fails, keep only the minimum logs needed for diagnosis, redact
sensitive values, then clean the run workspace and credentials after the failure
is recorded. Do not promote, merge, or deploy based on a failed manual
validation run.

## Per-Run Cleanup

On the long-lived validation host, run cleanup after every validation:

```bash
cd "$HOME"
rm -rf "$HOME/proxy-gateway-manual-ci"
rm -f /tmp/proxy-gateway-ci-*.tar
rm -rf ~/.npm ~/.cache ~/.config/gh ~/.git-credentials
history -c || true
```

Record that the workspace, repository credentials, local archives, logs, and
caches were removed. Do not leave a checked-out repository, `node_modules`, GH
credentials, archives, PEM files, logs, or production-derived files on the
host.

For fallback temporary validation servers, perform the same cleanup and then
terminate the VM from the cloud provider console or CLI. Record the destroyed
state in the PR or handoff when the server lifecycle matters for the decision.

## Optional: GitHub Self-Hosted Runner

Self-hosted runner mode is not the default for this project.

Use it only when an operator explicitly approves all of these:

- Use only this private repository.
- Use a temporary VM with no production secrets.
- Use a dedicated label, for example `proxy-gateway-ci`.
- Do not attach AWS credentials or production SSH keys.
- Remove the runner from GitHub after the job.
- Destroy the VM after the run.

Do not change the existing `CI` workflow from `ubuntu-latest` to `self-hosted`
as part of routine validation. If self-hosted runner testing is needed, use a
separate ops PR or a temporary workflow branch.

GitHub references:

- https://docs.github.com/en/actions/concepts/runners/self-hosted-runners
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners
