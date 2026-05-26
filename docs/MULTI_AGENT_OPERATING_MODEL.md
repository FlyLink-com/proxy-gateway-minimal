# Multi-Agent Operating Model

Last updated: 2026-05-26, Asia/Shanghai.

> Status:
> - Type: Active operating model
> - Risk: C for this document; A for any production, cloud, DNS, Nginx,
>   systemd, node, database, credential, artifact, deploy, or cutover action
> - Execution authority: Does not authorize code, production, AWS, DNS, Nginx,
>   HTTPS, systemd, node, database, artifact, credential, mesh, service, CI
>   host, or cutover changes
> - Production impact: None
> - Source of truth for: how to split work across agents, when to parallelize,
>   and how the lead agent verifies agent outputs

## Purpose

The project now has enough moving parts that single-threaded context can become
error-prone:

```text
subscription control plane
edge data plane
Local Edge Agent
Server Edge Mesh
HP Relay / operator lab
local Linux manual CI
historical Aliyun manual CI
prod-edge-a / prod-edge-b / prod-edge-c
opaque artifacts
Subscription V2
production runbooks and execution records
```

The goal of this document is to make multi-agent work safer, not faster at any
cost. Multiple agents may help analyze independent domains, but the lead agent
remains accountable for integration, risk classification, verification, and the
final user-facing answer.

## Core Decision

Use multi-agent decomposition for independent analysis and implementation
tracks. Do not use it to bypass project gates.

Required posture:

```text
one lead agent owns scope, risk, integration, and final answer
subagents receive explicit task packets, not vague inherited context
subagents do not touch production unless a Risk A runbook explicitly says so
subagent output is evidence, not truth, until the lead verifies it
parallel work is allowed only when file ownership and external state do not conflict
```

## Agent Roles

### Lead Agent

Responsibilities:

```text
read AGENTS.md and docs/PROJECT_CONTEXT.md before project work
classify every task as Risk A / B / C
choose whether work is single-agent, sequential multi-agent, or parallel
prepare task packets for subagents
protect source-of-truth files from conflicting edits
review all subagent outputs
run final verification commands
stage, commit, push, or hand off only after verification
write the final answer to the user
```

The lead agent is the only role that may declare work complete.

### Architecture Agent

Scope:

```text
docs/PROJECT_TOPOLOGY.md
docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md
docs/LOCAL_EDGE_AGENT_DESIGN.md
docs/SERVER_EDGE_MESH_DESIGN.md
docs/PRODUCTION_EDGE_FLEET.md
```

Responsibilities:

```text
check conceptual boundaries
find contradictions between topology docs
verify that HP Relay, Server Edge Mesh, Local Edge Agent, and production edges
  are not conflated
flag missing diagrams or stale role names
```

Forbidden:

```text
production mutation
node config mutation
secret handling
claiming live state without read-only evidence
```

### Code Agent

Scope:

```text
server code
admin UI
agent prototype
tests
repo-only scripts
```

Responsibilities:

```text
implement B-tier repository changes
write focused tests before or with implementation
run targeted tests and report exact commands
avoid production, DNS, Nginx, systemd, AWS, and secret changes
```

Forbidden:

```text
editing production records to justify code
changing generated production output without Risk A gate
using real tokens, artifact URLs, or production databases
```

### Ops Agent

Scope:

```text
Risk A read-only inventory
runbooks
execution records
AWS / DNS / Nginx / systemd / SQLite planning
```

Responsibilities:

```text
collect read-only facts
write dry-run plans and rollback paths
separate inventory from mutation
produce execution records after approved actions
```

Forbidden:

```text
mutating production without explicit approval
opening public ports without a runbook gate
copying production .env, SQLite, private keys, or subscription URLs into Git
running destructive commands
```

### Security Agent

Scope:

```text
secret exposure
auth boundaries
public surface
log redaction
artifact and token handling
operator lab versus production boundaries
```

Responsibilities:

```text
scan diffs and docs for raw secrets or sensitive paths
check that Admin remains private and Bearer-protected
check that edge nodes do not expose subscription authority
check that HP Relay remains operator lab only
flag public exposure of 3456, 18180, 1080, Admin UI, or raw artifact URLs
```

Forbidden:

```text
printing raw secrets in findings
using real credentials in prompts
changing production auth model without Risk A gate
```

### Validation Agent

Scope:

```text
git diff checks
npm test
npm run admin:test
npm run admin:build
targeted tests
manual CI-equivalent validation records
```

Responsibilities:

```text
run commands exactly as requested
report command, exit code, and meaningful output
separate local validation from production validation
confirm cleanup when using manual CI hosts
```

Forbidden:

```text
claiming tests pass from memory
using manual CI as deploy approval
copying secrets or production data to validation hosts
```

### Documentation Agent

Scope:

```text
docs/README.md
docs/PROJECT_CONTEXT.md
docs/PROJECT_OPERATING_MODEL.md
runbook indexes
execution-record indexes
```

Responsibilities:

```text
keep navigation current
ensure source-of-truth docs point to the right detailed documents
write concise handoff facts
remove ambiguity between current state, target state, and open decisions
```

Forbidden:

```text
rewriting history without explicit cleanup scope
recording secrets or raw subscription URLs
marking planned work as done
```

## Task Tracks

Use these tracks before dispatching agents:

```text
Architecture Track:
  control/edge split
  Local Edge Agent
  Server Edge Mesh
  HP Relay operator lab

Repository Track:
  server code
  Admin UI
  agent prototype
  tests

Production Track:
  AWS
  DNS
  Nginx
  systemd
  node config
  SQLite backup/restore

Validation Track:
  local tests
  local Linux manual CI after validation
  historical Aliyun manual CI records
  production read-only checks
  operator-device diagnostics

Documentation Track:
  PROJECT_CONTEXT
  README
  topology docs
  operating model
  runbook indexes
```

Do not mix tracks inside one subagent task unless the lead explicitly explains
why they must be handled together.

## Standard Task Packet

Every subagent task must be self-contained:

```text
Task title:
Risk tier:
Goal:
Context files to read:
Allowed files:
Forbidden files/actions:
Required checks:
Expected output:
Secrets policy:
Completion boundary:
```

Example:

```text
Task title:
  Review Local Edge Agent docs for conflict with control/edge split

Risk tier:
  C docs-only

Goal:
  Find contradictions between Local Edge Agent, Server Edge Mesh, and
  Subscription Control / Edge Split docs.

Context files to read:
  docs/LOCAL_EDGE_AGENT_DESIGN.md
  docs/SERVER_EDGE_MESH_DESIGN.md
  docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md

Allowed files:
  none, review only

Forbidden files/actions:
  no production commands
  no secret lookup
  no code edits

Required checks:
  cite exact file and section for each finding

Expected output:
  findings, severity, recommended doc change

Secrets policy:
  do not print tokens, artifact URLs, passwords, private keys, or customer data

Completion boundary:
  report findings only; lead decides edits
```

## Parallelization Rules

Parallelize only when all are true:

```text
tasks are independent
tasks do not edit the same files
tasks do not mutate external state
tasks have clear task packets
lead can review outputs before integration
```

Do not parallelize when any are true:

```text
Risk A execution is involved
multiple agents would edit PROJECT_CONTEXT.md at the same time
multiple agents would touch generated production output
one task's result determines another task's scope
the task needs a single coherent threat model
the task involves secret handling or credential rotation
```

Allowed examples:

```text
Architecture Agent reviews docs while Validation Agent runs local tests.
Security Agent scans a PR diff while Documentation Agent updates README links.
Code Agent writes a local test while Architecture Agent checks a design doc.
```

Disallowed examples:

```text
two agents editing docs/PROJECT_CONTEXT.md simultaneously
one agent changing node config while another changes production docs
parallel DNS and Nginx mutations
parallel database restore and service restart
subagent executing production commands from inherited chat context
```

## Risk-Tier Behavior

### C-Tier

Allowed:

```text
docs-only review
docs-only edits
navigation updates
git diff --check
```

Recommended multi-agent use:

```text
one Architecture Agent for consistency review
one Documentation Agent for index and handoff updates
one Security Agent for no-secrets scan
lead integrates and runs git diff --check
```

### B-Tier

Allowed:

```text
repository code
focused tests
Admin UI local changes
agent prototype local changes
repo-only scripts
```

Recommended multi-agent use:

```text
Code Agent implements one bounded subsystem
Validation Agent runs targeted and full local tests
Security Agent checks auth/log/secret boundaries when relevant
Documentation Agent updates source-of-truth docs if behavior changes
```

Required lead checks:

```text
git diff --check origin/master...HEAD
npm test when backend/server changes
npm run admin:test and npm run admin:build when Admin UI changes
targeted tests for the touched behavior
```

### A-Tier

Allowed only after explicit operator approval and the relevant runbook gate.

Recommended multi-agent use:

```text
Ops Agent performs read-only inventory
Security Agent reviews public exposure and secret boundaries
Validation Agent prepares validation checklist
Documentation Agent prepares execution record skeleton
Lead Agent serializes the actual approved execution
```

Forbidden:

```text
parallel production mutation
mutation from a subagent without lead review
using manual CI as production approval
copying secrets or SQLite data into agent prompts, Git, PRs, docs, or logs
```

## Source-Of-Truth File Ownership

Some files are high-conflict and should usually be edited by the lead:

```text
docs/PROJECT_CONTEXT.md
docs/README.md
docs/PROJECT_OPERATING_MODEL.md
AGENTS.md
```

Subagents may recommend edits to those files, but the lead should integrate
them after resolving conflicts and checking current state.

Detailed subsystem docs can be owned by specialist agents when file ownership
is explicit:

```text
Architecture Agent:
  docs/PROJECT_TOPOLOGY.md
  docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md
  docs/LOCAL_EDGE_AGENT_DESIGN.md
  docs/SERVER_EDGE_MESH_DESIGN.md

Ops Agent:
  active runbooks
  execution records

Code Agent:
  repo code and tests only inside its assigned subsystem
```

## Verification Contract

PR descriptions must include an Agent / Task Routing section, even when no
subagents were used:

```text
Lead agent:
Supporting agents used:
Primary unit:
Secondary units:
Follow-up agent suitability:
Recommended next owner:
```

Use `Follow-up agent suitability` to say whether the task naturally splits into
Architecture, Code, Validation / CI, Operator Lab, Production Ops, Product
Business, Commercial / Entitlement, Subscription Access, Edge / Node Capacity,
or Local Client follow-up work. If a task should remain lead-owned because it
touches source-of-truth files, secrets, production gates, or cross-unit
integration, state that explicitly.

Subagent reports must include:

```text
commands run
exit codes or clear command result
files read
files changed
risks found
residual uncertainty
no-secrets confirmation
```

Lead verification must include:

```text
review subagent output
inspect actual diff
run required validation commands
check git status
check for sensitive content when docs or configs changed
summarize what is known, what is inferred, and what remains open
```

Never say work is complete based only on a subagent summary.

## Secret And Sensitive Data Rules

The following must not enter task packets, docs, PRs, commits, chat summaries,
CI logs, or support bundles:

```text
raw subscription URLs
tenant tokens
opaque artifact values
CONSOLE_TOKEN
SS_PASSWORD
production .env
SQLite database contents
cloud credentials
private keys
customer data
browser history or raw destination URLs
```

If a task needs to verify sensitive material exists, report only:

```text
kind of secret
safe path or system location when already documented
permissions or presence status
redacted validation result
```

## Handoff Format

When one agent hands work back to the lead, use this format:

```text
Scope handled:
Files read:
Files changed:
Commands run:
Validation result:
Findings:
Risks:
Secrets exposure:
Recommended next action:
```

For production-adjacent work, add:

```text
External state touched:
Approval phrase / record:
Rollback path:
Cleanup performed:
```

If no external state was touched, say so explicitly.

## Failure Modes To Avoid

```text
mixing HP Relay into production topology
calling Server Edge Mesh a user VPN
calling manual CI staging or deploy approval
marking PR merge as production activation
letting edge nodes become subscription authorities without design approval
editing current-state docs from stale memory
parallel edits to source-of-truth files
trusting a subagent result without verifying the diff and commands
recording secrets while trying to be helpful
```

## Recommended Default Workflow

For non-trivial work:

```text
1. Lead reads AGENTS.md, PROJECT_CONTEXT.md, and git status.
2. Lead classifies Risk A / B / C.
3. Lead identifies independent tracks.
4. Lead writes explicit task packets.
5. Subagents analyze or implement within their packets.
6. Lead reviews outputs and integrates changes.
7. Lead runs required validation.
8. Lead updates source-of-truth docs when durable facts changed.
9. Lead commits and pushes only after verification.
10. Lead reports result, risks, and validation evidence to the user.
```

For small C-tier docs-only changes, a single lead agent may be enough. Use
multi-agent review when the topic crosses multiple source-of-truth documents or
architecture domains.

## Open Decisions

Before using multi-agent execution for production-adjacent work, decide:

```text
1. Whether subagents may run read-only production commands, or only prepare
   command plans for the lead.
2. Whether each subagent should work in a separate git worktree for B-tier code.
3. Which files are permanently lead-owned and never directly edited by
   subagents.
4. Whether a Security Agent no-secrets scan is mandatory for every PR.
5. Whether PR descriptions should include a standardized multi-agent evidence
   section.
```

Until those are decided, use the stricter boundary:

```text
subagents analyze and recommend
lead edits source-of-truth files
lead executes production commands
lead performs final verification
```
