# Manual CI Validation Runbook

Last updated: 2026-05-23, Asia/Shanghai.

This runbook defines the temporary manual CI-equivalent validation path to use
when GitHub-hosted Actions cannot start because of the current account billing
or spending-limit blocker. It is a repository validation procedure only. It is
not staging, not production deployment, and not approval to mutate AWS
resources.

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

Default to a temporary clean validation server:

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

- Temporary.
- Non-production.
- Not a staging target.
- Not attached to the production security group.
- Not connected to `/opt/proxy-gateway-minimal` production runtime.
- Destroyed after validation unless the operator explicitly approves reuse.

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
before destroying the host. If repository access cannot be granted safely, stop
and use a local archive transfer instead of weakening the secret boundary.

## Repository Access

The clone commands below assume short-lived GitHub repository access has already
been configured on the temporary server. Do not paste long-lived tokens into
shell history and do not copy production SSH keys to this host.

If short-lived repository access is not available, prepare an archive on the
operator machine and copy it to the validation server instead:

```powershell
$candidateSha = "<candidate-commit-sha>"
$archive = Join-Path $env:TEMP "proxy-gateway-ci-$candidateSha.tar"
git archive --format=tar --output $archive $candidateSha
scp $archive ubuntu@<validation-host>:/tmp/proxy-gateway-ci.tar
```

Then unpack it on the validation server:

```bash
mkdir -p proxy-gateway-minimal
tar -xf /tmp/proxy-gateway-ci.tar -C proxy-gateway-minimal
cd proxy-gateway-minimal
```

## Server Setup

On the temporary server:

```bash
sudo apt-get update
sudo apt-get install -y git curl build-essential python3

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

node --version
npm --version
```

Clean clone:

```bash
git clone https://github.com/gaoyi1020-web/proxy-gateway-minimal.git
cd proxy-gateway-minimal
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
Host lifecycle: temporary / destroyed / retained with approval
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
AWS / production touched: no
Notes:
```

If any command fails, keep the server until logs are collected, then destroy it
after the failure is recorded. Do not promote, merge, or deploy based on a
failed manual validation run.

## Server Cleanup

Before destroying the server, remove local caches and repository credentials:

```bash
history -c || true
rm -rf ~/.npm ~/.cache ~/.config/gh ~/.git-credentials
```

Then terminate the VM from the cloud provider console or CLI. Record the
destroyed state in the PR or handoff when the server lifecycle matters for the
decision.

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
