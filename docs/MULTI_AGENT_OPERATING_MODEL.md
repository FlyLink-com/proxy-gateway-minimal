# Multi-Agent Operating Model

Last updated: 2026-09-26, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: multi_agent_operating_model
  superseded_by: null
  last_verified_at: 2026-09-26
  production_authority: false
```


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

## Authorized Progress And Evidence Reuse

The operating goal is continuous progress within an explicit task boundary,
not more mandatory agents, reports, tests, or approvals. Classify the actual
action, target, and impact: a validation or documentation role does not make a
production operation Risk C. A small addition to an existing project does not
require repeating the whole project lifecycle; its actual A/B/C boundary still
applies. This section grants no execution authority and adds no validation lane.

### Bound The Task And Evidence Scope

- Use the existing task packet to state the target, paths, allowed actions,
  evidence scope, and non-goals. Retain any execution window or evidence budget
  already required by the authorization or runbook; do not invent new ones.
  Resolve scope from the original authorization; do not silently expand a
  bounded check into a complete historical audit or extend an approval window.
- Identify the minimum missing evidence needed for the next decision and read
  it only within the authorized scope. If a required boundary remains unclear,
  stop the dependent action and state the missing decision. Independent,
  already-authorized work continues within its own valid boundary.
- Historical records establish their dated observations, not current facts.
  Their age alone does not release retention or rollback holds; those holds
  remain subject to the applicable contract and evidence requirements.

### Continue The Remaining Work

- On resumption, identify the requested outcome, allowed actions, completed
  steps with evidence, remaining steps, and any actual blocker. Reuse the
  existing PR or execution record; no separate continuation report is required.
- Within a clear, valid authorization, perform the remaining implementation,
  applicable validation, and closeout steps without asking again for every
  command. Diagnosis-only permission does not authorize a fix; implementation
  permission does not implicitly authorize merge or deployment.
- A new turn, agent handoff, or tool change alone does not restart the task.
  Short confirmations are interpreted against the specific scope they refer
  to, subject to the approval format required by the applicable runbook.
- Tool availability or compatibility problems may be diagnosed and repaired
  within the authorized local/validation scope. Tools support the task; do not
  turn a setup failure into a business failure or restart all earlier phases.
  This does not authorize changing a frozen worker or controller, bypassing an
  admission check, or moving execution to an unapproved host.
- Pause the affected action when a required premise fails, scope/target/risk
  changes, authority is absent or expired, or side effects are uncertain. State
  what is known, what remains, and the exact new decision needed. Independent,
  already-authorized safe work may continue; dependent mutation may not.
- `RELEASE_MANIFEST.md` owns release Gate stop/consumption semantics. A failed
  Gate requires a corrected successor, with fresh approval when required; a
  consumed one-time approval cannot authorize a second attempt. Do not replay
  a dispatched operation after timeout or transport loss. Use authorized
  readback/recovery, respect `retry false`, and do not relabel uncertainty as
  a safe pre-execution failure. Backup and rollback readiness precede mutation.

### Reuse Valid Evidence, Recheck The Changed Boundary

- The lead verifies evidence against the exact source/artifact under review,
  dependency/runtime identity, required environment properties, command scope,
  and result. Reuse requires all applicable bindings and freshness requirements
  to remain satisfied; an unsupported memory or summary is not a passing run.
- Existing CI/Linux validation need not run again merely because the agent or
  conversation changed. Verify its retained record and continue the next
  incomplete stage. A changed input requires checks covering that change and
  its integration effects; a required full baseline or exact-head check cannot
  be replaced by an unrelated focused pass or results from another commit.
- Fresh target inventory, expiring approvals, artifact retrievability, and
  runbook-mandated just-before-execution checks remain fresh checks. Source,
  merge, artifact, and production evidence stay distinct. A failed execution
  approval does not erase unrelated valid source evidence, but that evidence
  cannot reopen the failed Gate.
- Report new runs, verified reused evidence, and missing evidence separately.
  Retain exact commands/results and evidence links in the existing PR or
  execution record; do not generate duplicate role reports or a new evidence
  store. Follow `docs/VALIDATION_BASELINE.md` for the applicable checks.

### Validate The Actual Execution Path

- Bind validation to the exact source or file digest, input identity,
  dependencies, environment, and allowed actions for every executed layer:
  core, wrapper, parser, guard, and controller. Core CI does not establish
  coverage for a new or changed local script outside that tested source.
- For changed Linux command-output parsers or guards, cover observed output
  shapes and known failures using real redacted output from authorized local
  validation or retained evidence. Synthetic fixtures alone do not prove that
  compatibility. This does not require another production read; obtaining new
  host evidence retains its existing gate.
- Failure receipts identify the failed boundary using the existing contract's
  error-category and phase fields, without raw output, config, credentials, or
  customer data. If the contract has no such fields, describe that boundary in
  the existing execution record; do not introduce a universal receipt schema.
  A rejection stops the affected Gate under `RELEASE_MANIFEST.md`. For a tooling
  defect, add a failing local reproduction before repairing and testing within
  authorized scope; a legitimate refusal is not a reason to relax its guard.
- A local fix does not reopen the Gate or authorize changing a frozen tool.
  Do not replay an operation, rename an attempt to retry it, bypass a guard, or
  treat an unknown result as permission to continue. Use the existing successor
  Gate and approval rules when applicable.
- Reuse verified evidence whose bindings remain unchanged; validate changed
  layers and their integration effects. Preserve required full baselines and
  fresh checks without repeating unrelated completed validation.

### Report Recovery Within Its Proven Boundary

- State service recovery and validation from ordinary business activity with
  their observed scope and time. Report long-term historical reconciliation
  and pending retention work separately, with their remaining evidence gaps.
- Recovery does not prove complete accounting, identity health, or retention
  clearance. Keep those states pending where required and do not claim that
  everything is healthy. Unrelated long-term work does not invalidate recovery
  already verified within its stated boundary; relevant failed checks still
  block dependent claims and actions under the existing contract and Gate.

## Historical Heavyweight Specialist Profiles

The lead agent remains the global owner for scope, risk, integration, and final
verification. At this document's 2026-05-27 cutoff, two heavyweight specialist
profiles were recorded as examples. They do not assign current owners, active
work, or sequencing. Reuse a profile only when a fresh native Issue/PR record
does so explicitly.

### Historical Subscription Control Platform Profile

Mission recorded at the cutoff:

```text
build the Aliyun subscription-control platform MVP
keep subscription state, artifacts, account/entitlement shells, and rendering
  in the control plane
prepare clean-start authority, private validation, firewall, public-boundary,
  DNS-promotion, observation, rollback, and cleanup gates
coordinate Aliyun outward-facing platform preparation without exposing public
  Admin, dynamic customer entries, or subscription artifacts before approval
```

Owns:

```text
Aliyun user-management / subscription-distribution planning
platform lead/account/entitlement/access-grant shells
opaque artifact and legacy query-token retirement planning
Aliyun clean-start versus state-preserving source decisions
provider-firewall and public-boundary runbook preparation
public site / portal separation and dynamic-entry delivery boundaries
```

Does not own:

```text
new transport protocol design
channel-lab runtime experiments
edge protocol selection
production mutation without A-tier approval
manual CI as staging or production approval
```

Task boundary recorded at the cutoff:

```text
repo-only B/C work can continue under this agent
Aliyun runtime, DNS, firewall, state-copy, public listener, production authority,
  or cleanup work remains Risk A and needs separate approval
```

### Historical Channel Technical MVP Profile

Mission recorded at the cutoff:

```text
build the technical MVP for stronger channel capability
advance Clash/Mihomo-native multi-protocol subscription rendering
measure SS baseline, Hysteria2, TUIC, VLESS/XUDP, and later candidates with
  safe aggregate evidence
turn measurement evidence into candidate reports, investigation reports,
  decision packs, and next-candidate plans
```

Owns:

```text
channel strategy engine
channel benchmark fixtures, scoring, reports, and decision packs
Hysteria2 hold investigation and cleanup decision support
TUIC comparison planning
VLESS/XUDP secondary comparison planning
future runtime inventory packets for approved protocol canaries
```

Does not own:

```text
Aliyun subscription-control authority
customer/account entitlement policy
production DNS, Nginx, firewall, systemd, or node mutation
all-user rollout or subscription output activation
Local Edge Agent production activation unless the project explicitly reopens it
```

Task boundary recorded at the cutoff:

```text
repo-only C/B channel planning and tooling can continue under this agent
runtime canaries, server creation, port exposure, operator-device traffic,
  cleanup, or broader rollout remain Risk A and need separate approval
```

### Lead Verification Rule

If a fresh native Issue/PR record explicitly reuses either historical profile,
the lead agent must verify its output before claiming completion:

```text
Subscription Control Platform Agent output:
  check against docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md
  check against docs/PROJECT_CONTEXT.md and fresh native Issue/PR records
  use project-state/current.json only for dated compatibility evidence
  check current lane selection against docs/RUNTIME_LANE_AUTHORITY.md
  use docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md only for historical
    compatibility or decision archaeology
  confirm no runtime authority was implied by repo-only work

Channel Technical MVP Agent output:
  check against docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md
  check against docs/CHANNEL_STRATEGY_ENGINE.md
  check against docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md
  confirm no runtime canary or production output was implied by repo-only work
```

Project #1 is a mutable navigation projection, not task authority.
`project-state/current.json` and `tasks.json` are dated compatibility snapshots,
and `lanes.json` owns reviewed taxonomy rather than current membership. Every
agent must obtain current task state and sequencing from fresh native Issue/PR
records; no local snapshot or Project field can authorize Risk A work or prove
runtime state.

## Agent Roles

These roles are optional task capabilities, not a mandatory serial pipeline.
Use only the independent support the task needs; security, migration, or
release-evidence specialization can be scoped inside an existing role rather
than requiring a new agent. Role descriptions or YAML capability declarations
are policy, not proof of enforced tool permissions. The lead must honor the
actual tool boundary and cannot delegate authority it does not have.

### Lead Agent

Responsibilities:

```text
read AGENTS.md, docs/CURRENT_RELEASE_STATE.md, RELEASE_MANIFEST.md,
docs/PROJECT_CONTEXT.md, git status, docs/README.md, and the subsystem README
in that order; then fresh-read native Issue/PR records before selecting work
classify every task as Risk A / B / C
choose whether work is single-agent, sequential multi-agent, or parallel
prepare task packets for subagents
protect source-of-truth files from conflicting edits
review all subagent outputs
verify the complete required baseline, reusing valid evidence as defined above
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
existing docs-only checks from docs/VALIDATION_BASELINE.md
```

Optional support for cross-document work:

```text
lead handles a small docs change directly
use an independent consistency review when it adds value
combine documentation and sensitive-content checks into the existing review
lead integrates and verifies the existing docs-only baseline
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

Optional support, selected for the actual task:

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

Optional support within the runbook's required review boundary:

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

Use the existing PR routing block; `None` is valid for unused support or
follow-up roles. It is not a request to create more agents or follow-up tasks.

Subagent reports should cover applicable facts below; a short review may combine
them in a few sentences and cite existing evidence instead of creating a file:

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
verify required validation through new runs or applicable retained evidence
check git status
check for sensitive content when docs or configs changed
summarize what is known, what is inferred, and what remains open
```

Never say work is complete based only on a subagent summary.

Reviews check business invariants as well as code and test results. For wallet,
payment, or fulfillment work, use the subsystem's current contract: authoritative
balances must not bypass the ledger/domain transaction; duplicate callbacks
must have one settlement effect, not necessarily one total ledger row; uncertain
delivery must be reconciled before any retry that could debit or issue resources
again. These are review boundaries, not authorization for reconciliation writes
or new mandatory test suites for unrelated work. Lint and tests remain useful
but do not prove those invariants on their own.

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

When one agent hands work back to the lead, use the following as a checklist,
not a mandatory standalone report. Combine fields for small tasks and link
existing evidence:

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
1. Lead reads AGENTS.md, CURRENT_RELEASE_STATE.md, RELEASE_MANIFEST.md,
   PROJECT_CONTEXT.md, git status, docs/README.md, and the task-relevant
   subsystem README in that order.
2. Lead fresh-reads native Issue/PR records before selecting or ordering work;
   Project #1 is navigation only.
3. Lead classifies Risk A / B / C.
4. Lead identifies remaining work and reusable evidence.
5. If independent support is useful, lead writes scoped task packets.
6. Selected subagents analyze or implement within their packets; otherwise
   lead continues directly.
7. Lead reviews outputs and integrates changes.
8. Lead verifies the required baseline through new runs or valid retained evidence.
9. Lead updates source-of-truth docs when durable facts changed.
10. Lead commits and pushes only after verification.
11. Lead reports result, risks, and validation evidence to the user.
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
```

These are task-specific decisions, not prerequisites for every small change.
Without an explicit delegation boundary:

```text
subagents analyze and recommend within their assigned scope
lead edits source-of-truth files
lead executes production commands
lead performs final verification
```
