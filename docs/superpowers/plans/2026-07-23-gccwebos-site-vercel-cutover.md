# GCC WebOS Vercel Repository Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconnect the existing GCC WebOS Vercel project to `gaoyi1020-web/gccwebos-site`, validate an exact unpromoted candidate, and promote it only through a separate approved production gate with a verified rollback.

**Architecture:** Keep the existing Vercel project and custom domains, change only its Git repository binding and standalone build settings, and rely on `autoAssignCustomDomains=false` to preserve the current public deployment during candidate review. Separate repository reconnection (Gate S1) from production promotion (Gate S2). Use the authenticated read-only Vercel connector for inventory; mutations require an approved process-only credential or a precisely bounded operator-performed Dashboard action.

**Tech Stack:** Vercel Git Integration, Vercel CLI 54+, Vercel read-only connector, GitHub CLI, PowerShell 7, browser-based visual QA.

## Global Constraints

- Risk: A.
- Existing Vercel project must be reused; do not create a new Vercel project.
- Expected Vercel team: `gccltd`; expected team ID: `team_FiT05F8Hvq9HAhr22ndT0sOO`.
- Expected Vercel project: `proxy-gateway-minimal`; expected project ID: `prj_XXzvF1FA89rvjKYvXx7cHHnuqC39`.
- Target Git repository: private `gaoyi1020-web/gccwebos-site`.
- Target production branch: `master`.
- Target install command: `npm ci`.
- Target build command: `npm run build && npm run verify`.
- Target output directory: `dist`.
- `autoAssignCustomDomains` must remain `false`.
- Existing custom domains: `gccwebos.com` and `www.gccwebos.com`.
- Last known production deployment before fresh inventory: `dpl_GZw9zwEckAsQUq1TsLuyJf3XDRNW`, source `7e9a8667657e5323e09ff7c262da85d26729e69b`.
- Last known identities are guardrails, not current facts; fresh read-only inventory is mandatory.
- Do not use, inspect, export, or rely on a persistent local Vercel credential or logged-in browser session.
- Do not change DNS, domains, aliases, environment values, Team, project identity, Portal, Admin, backend, payment, Coins, orders, attribution, or settlement.
- Do not claim production changed from a build, CI run, Preview, screenshot, or READY candidate.
- A Gate approval is consumed by its one execution; retry or scope drift requires a new exact Gate.

---

## State Map

| State | Owner | Required evidence |
| --- | --- | --- |
| Standalone source | `gaoyi1020-web/gccwebos-site@master` | Exact merged commit, passing CI, local build and verifier. |
| Vercel project | Existing `gccltd/proxy-gateway-minimal` | Exact project ID and unchanged domains/settings readback. |
| Current production | Existing deployment | Exact deployment ID, source identity, two custom aliases, HTTP 200. |
| Candidate | New repository deployment | Exact deployment ID, Git source commit, READY state, no custom aliases. |
| Production promotion | Approved candidate | Gate S2, exact promote command/action, post-promotion alias and HTTP validation. |
| Rollback | Pre-promotion production | Exact previous deployment ID and tested promotion path. |

No repository files are modified by this plan. Evidence is recorded in the standalone implementation PR and, after successful production promotion, as a Deploy Note on `gccwebos-com/proxy-gateway-minimal#528`.

---

### Task 1: Bind the standalone source and fresh provider inventory

**Files:**
- Inspect only: `C:\Users\g\.codex\worktrees\gccwebos-site`
- External read-only state: GitHub repository and Vercel project/deployments.

**Interfaces:**
- Consumes: merged standalone implementation PR and passing `master` CI.
- Produces: exact `$siteSourceCommit`, `$siteSourceTree`, `$previousProductionId`, `$previousProductionUrl`, and inventory timestamp.

- [ ] **Step 1: Verify the standalone repository is merged and clean**

Run:

```powershell
$siteRepo = 'C:\Users\g\.codex\worktrees\gccwebos-site'
git -C $siteRepo fetch origin master
git -C $siteRepo switch master
git -C $siteRepo pull --ff-only origin master
$siteSourceCommit = git -C $siteRepo rev-parse HEAD
$siteSourceTree = git -C $siteRepo show -s --format='%T' HEAD
git -C $siteRepo status --short --branch
gh run list --repo gaoyi1020-web/gccwebos-site --branch master --limit 5 `
  --json databaseId,headSha,status,conclusion,workflowName,url
```

Expected:

```text
The worktree is clean.
The latest Validate run has headSha equal to $siteSourceCommit.
status is completed and conclusion is success.
```

Stop if the implementation PR is still Draft/open, `master` CI is not successful, or the source is dirty.

- [ ] **Step 2: Re-run the portable build**

Run:

```powershell
npm ci
npm test
npm run build
npm run verify
```

Expected: 18 tests pass, build exits `0`, and the public boundary verifier succeeds.

- [ ] **Step 3: Read the Vercel project through the connector**

Use the authenticated read-only Vercel connector to:

```text
list teams
get project team_FiT05F8Hvq9HAhr22ndT0sOO / prj_XXzvF1FA89rvjKYvXx7cHHnuqC39
list deployments for the same team and project
get the deployment currently carrying gccwebos.com and www.gccwebos.com
```

Record only safe identities in `$inventory` using these exact fields:

| Field | Source |
| --- | --- |
| `inventory_at` | Current UTC time immediately after connector readback. |
| `team_id` | Vercel project readback. |
| `project_id` | Vercel project readback. |
| `project_name` | Vercel project readback. |
| `git_repository` | Vercel Git connection readback. |
| `production_branch` | Vercel Git connection readback. |
| `install_command` | Effective project/repository build configuration. |
| `build_command` | Effective project/repository build configuration. |
| `output_directory` | Effective project/repository build configuration. |
| `auto_assign_custom_domains` | Vercel project readback. |
| `previous_production_id` | Deployment carrying both custom aliases. |
| `previous_production_url` | URL of that deployment. |
| `previous_source_commit` | Git metadata for that deployment. |
| `custom_aliases` | Safe alias names `gccwebos.com` and `www.gccwebos.com`. |

Expected project IDs must match Global Constraints. The two custom domains must point to one uniquely identified deployment.

Bind the safe readback as the in-memory record `$inventory`, then bind:

```powershell
$previousProductionId = $inventory.previous_production_id
$previousProductionUrl = $inventory.previous_production_url
```

The record contains identifiers and settings only; it must not contain environment values, credentials, or raw logs.

- [ ] **Step 4: Verify the public baseline**

Run:

```powershell
$baselineApex = Invoke-WebRequest -Uri 'https://gccwebos.com/' -Method Get
$baselineWww = Invoke-WebRequest -Uri 'https://www.gccwebos.com/' -Method Get
@{
  apexStatus = $baselineApex.StatusCode
  wwwStatus = $baselineWww.StatusCode
  apexHasBrand = $baselineApex.Content.Contains('GCC WebOS')
  wwwHasBrand = $baselineWww.Content.Contains('GCC WebOS')
}
```

Expected: both status codes are `200` and both brand booleans are `true`.

- [ ] **Step 5: Stop on inventory drift**

Stop before proposing Gate S1 if:

```text
Team or project identity differs.
The two custom domains do not share one exact current deployment.
autoAssignCustomDomains is not false.
Current production is unavailable.
The standalone source commit cannot be tied to successful CI.
Any readback would require revealing environment values or credentials.
```

Do not “fix” drift under the inventory task.

---

### Task 2: Present and approve exact Gate S1 for repository reconnection

**Files:**
- No file changes.
- External approval record: current task and standalone implementation PR comment.

**Interfaces:**
- Consumes: exact identities from Task 1.
- Produces: one explicit, bounded, unconsumed Gate S1 approval.

- [ ] **Step 1: Render the Gate with Task 1 identities**

Present the following YAML with the actual readback values substituted before asking for approval:

```yaml
gate: gccwebos-site-vercel-git-reconnect-s1
risk: A
provider: Vercel
target:
  team_id: team_FiT05F8Hvq9HAhr22ndT0sOO
  project_id: prj_XXzvF1FA89rvjKYvXx7cHHnuqC39
  project_name: proxy-gateway-minimal
  from_repository: $inventory.git_repository
  to_repository: gaoyi1020-web/gccwebos-site
  source_commit: $siteSourceCommit
credential:
  privilege: unverified_assume_full_access
  local_source: process_only | approved_one_time_handoff
commands:
  allowed:
    - vercel link --yes --project proxy-gateway-minimal --scope gccltd
    - vercel git ls
    - vercel git disconnect github
    - vercel git connect
scope:
  set_git_repository: gaoyi1020-web/gccwebos-site
  set_production_branch: master
  use_repository_build_contract: vercel.json
  preserve_auto_assign_custom_domains: false
validation:
  - read back exact Git repository and production branch
  - confirm the candidate uses the repository vercel.json build contract
  - confirm previous production deployment and both custom aliases are unchanged
  - confirm no production promotion occurred
rollback:
  - reconnect the exact previous repository under a fresh Gate if readback fails
stop_conditions:
  - target project is not unique
  - GitHub repository is unavailable to the Vercel GitHub App
  - any domain or alias changes
  - an automatic production promotion occurs
  - command requests broader mutation
cleanup:
  - remove process VERCEL_TOKEN
  - delete .vercel local link metadata
  - verify no approved handoff file remains
forbidden:
  - persistent credentials
  - DNS, domain, alias, environment, Team, or project creation changes
  - production promotion or rollback
```

Interpolate `$inventory.git_repository` and `$siteSourceCommit` from Task 1 before presenting the Gate; do not present variable names as approval values.

- [ ] **Step 2: Explain the two permitted execution mechanisms**

Use exactly one:

```text
A. CLI: operator supplies a Gate-named one-time handoff; the token is loaded into
   one process, the handoff is deleted before the first API call, and cleanup is read back.
B. Dashboard: operator performs only the listed repository/settings actions; the
   agent does not control or inspect the persistent logged-in browser session.
```

The current Vercel connector has read/deploy capabilities but no Git-repository mutation operation, so it cannot execute S1 itself.

- [ ] **Step 3: Wait for explicit approval**

Approval must refer to `gccwebos-site-vercel-git-reconnect-s1`. Do not treat “continue,” an earlier broad approval, or approval of this plan as execution approval.

- [ ] **Step 4: Record the approved Gate**

Add the redacted Gate and approval reference to the standalone Draft/merged implementation PR as a comment. Do not include credentials, environment values, or browser-session details.

---

### Task 3: Execute Gate S1 and clean up credential state

**Files:**
- Temporary local only: `C:\Users\g\.codex\worktrees\gccwebos-site\.vercel\project.json`
- Must remain ignored and be removed after execution.

**Interfaces:**
- Consumes: approved, unconsumed Gate S1.
- Produces: Vercel project linked to `gaoyi1020-web/gccwebos-site`, unchanged live aliases, and cleanup receipt.

- [ ] **Step 1: Run the selected bounded mechanism**

For CLI execution, use one PowerShell process:

```powershell
$siteRepo = 'C:\Users\g\.codex\worktrees\gccwebos-site'
$handoffPath = 'C:\Users\g\.codex\vercel-gccwebos-site-s1.handoff'
$tokenValue = [System.IO.File]::ReadAllText($handoffPath).Trim()
Remove-Item -LiteralPath $handoffPath
$env:VERCEL_TOKEN = $tokenValue

try {
  vercel link $siteRepo --yes --project proxy-gateway-minimal --scope gccltd
  vercel git ls --cwd $siteRepo --scope gccltd
  vercel git disconnect github --cwd $siteRepo --scope gccltd
  vercel git connect --cwd $siteRepo --scope gccltd
} finally {
  Remove-Item Env:VERCEL_TOKEN -ErrorAction SilentlyContinue
  $tokenValue = $null
}
```

Never print `$tokenValue`, environment contents, or raw CLI configuration. If the installed CLI rejects a documented option, stop; do not improvise a different mutation command under the same Gate.

For Dashboard execution, the operator performs:

```text
Project Settings -> Git -> Disconnect current Git repository
Project Settings -> Git -> Connect Git Repository
Select gaoyi1020-web/gccwebos-site
Set Production Branch to master
Confirm automatic custom-domain assignment remains disabled
```

The agent resumes only after the operator reports completion.

- [ ] **Step 2: Perform immediate read-only readback**

Use the Vercel connector to get the exact project and deployments again.

Expected:

```yaml
git_repository: gaoyi1020-web/gccwebos-site
production_branch: master
auto_assign_custom_domains: false
custom_aliases:
  - gccwebos.com
  - www.gccwebos.com
previous_production_id: unchanged
```

Stop if any value differs.

- [ ] **Step 3: Verify local cleanup**

Run:

```powershell
$siteRepo = 'C:\Users\g\.codex\worktrees\gccwebos-site'
@{
  processTokenPresent = Test-Path Env:VERCEL_TOKEN
  handoffPresent = Test-Path -LiteralPath 'C:\Users\g\.codex\vercel-gccwebos-site-s1.handoff'
  localLinkPresent = Test-Path -LiteralPath (Join-Path $siteRepo '.vercel')
}
if (Test-Path -LiteralPath (Join-Path $siteRepo '.vercel')) {
  Remove-Item -LiteralPath (Join-Path $siteRepo '.vercel') -Recurse
}
git -C $siteRepo status --short --branch
```

Expected: no process token, no handoff file, `.vercel` removed, clean repository.

- [ ] **Step 4: Record the S1 execution receipt**

Comment on the standalone implementation PR:

```yaml
gate: gccwebos-site-vercel-git-reconnect-s1
result: completed
credential_local_before: approved_one_time_handoff | operator_dashboard
credential_local_after: absent
provider_credential_status: unverified_assume_valid
provider_mutation:
  git_repository: gaoyi1020-web/gccwebos-site
  production_branch: master
  build_contract_source: repository vercel.json
production_mutation: none
custom_aliases_changed: false
conclusion: repository connection changed; production remained on the previous deployment
next_gate: candidate validation
```

Use the actual selected credential mechanism and safe readback results.

---

### Task 4: Identify the exact unpromoted candidate

**Files:**
- No file changes.
- External read-only state: Vercel deployment list and exact deployment.

**Interfaces:**
- Consumes: S1 completion timestamp and `$siteSourceCommit`.
- Produces: exact `$candidateDeploymentId`, `$candidateUrl`, build state, and alias count.

- [ ] **Step 1: Wait for only the Git-triggered deployment**

List deployments created after the S1 execution timestamp through the Vercel connector.

Select a deployment only if:

```text
project ID matches prj_XXzvF1FA89rvjKYvXx7cHHnuqC39
Git repository matches gaoyi1020-web/gccwebos-site
Git ref is master
Git commit equals $siteSourceCommit
state is READY
```

If no deployment appears, stop and report that repository reconnection succeeded but the auto-deploy chain remains unproven. Do not use a manual deployment, empty commit, alias action, or Dashboard redeploy under S1.

- [ ] **Step 2: Verify candidate isolation**

Get the candidate and project through the connector.

Expected:

```yaml
candidate_state: READY
candidate_source_commit: $siteSourceCommit
candidate_custom_alias_count: 0
gccwebos_com_target: $previousProductionId
www_gccwebos_com_target: $previousProductionId
```

The candidate may be production-targeted internally, but it must not carry either public custom alias.

- [ ] **Step 3: Fetch the candidate safely**

If Vercel Authentication protects the candidate, use the connector's authenticated deployment fetch or temporary share URL. Do not disable deployment protection.

Verify:

```text
HTTP 200
HTML contains GCC WebOS
HTML does not contain Admin Console, UserPortalPage, or /api/admin
```

- [ ] **Step 4: Bind the candidate identity**

Bind the connector readback to the safe in-memory record used by later tasks:

```powershell
$candidate = [pscustomobject]@{
  deployment_id = $candidateReadback.id
  url = $candidateReadback.url
  source_repository = 'gaoyi1020-web/gccwebos-site'
  source_commit = $siteSourceCommit
  source_tree = $siteSourceTree
  state = 'READY'
  custom_alias_count = 0
}
$candidateDeploymentId = $candidate.deployment_id
$candidateUrl = $candidate.url
```

---

### Task 5: Complete candidate visual, interaction, and boundary QA

**Files:**
- Inspect only: exact candidate URL.
- No screenshots are committed.

**Interfaces:**
- Consumes: exact candidate from Task 4.
- Produces: candidate QA matrix tied to one deployment ID.

- [ ] **Step 1: Desktop and light-mode QA**

At `1440 × 900`, verify:

```text
Centered hero, readable brand environment, two primary hero actions.
Navigation reaches products, plans, guide, support, contact, and FAQ.
No document-level horizontal overflow.
No Admin, Portal application, order, payment, or settlement UI.
```

Evaluate:

```js
({
  overflow: document.documentElement.scrollWidth > window.innerWidth,
  title: document.title,
  language: document.documentElement.lang,
  brand: document.body.textContent.includes("GCC WebOS")
})
```

Expected: `overflow=false`, `brand=true`, and title/language match the selected locale.

- [ ] **Step 2: Mobile QA**

At `390 × 844`, verify:

```text
Concept stage scrolls horizontally without moving the whole document sideways.
Lower detail content scrolls vertically.
No repeated start chooser or bottom card appears.
Mobile menu exposes direct Get Started and Sign In links.
Plans, support, contact, FAQ, and footer remain within the viewport.
```

Evaluate the same overflow expression; expected `false`.

- [ ] **Step 3: Dark mode and reduced-motion QA**

Emulate dark color scheme and confirm all text, borders, form fields, focus rings, and status messages remain readable.

Emulate reduced motion and verify:

```text
Brand background does not continuously move.
Content is immediately available.
Navigation and form interaction remain usable.
No layout shift is introduced by disabled animation.
```

- [ ] **Step 4: Verify navigation contracts**

Inspect, but do not log in:

```text
Get Started -> https://portal.gccwebos.com/portal/register/
Sign In -> https://portal.gccwebos.com/
```

Verify the contact form's submit request is configured for `/api/public/leads`.

Do not create a real lead record. For UI success/error behavior, intercept the candidate browser request locally:

```text
POST /api/public/leads -> 201 with an empty safe response
POST /api/public/leads -> 503 with an empty safe response
```

Expected: success produces a non-color-only success status; failure produces `role="alert"`.

- [ ] **Step 5: Record the QA matrix**

Comment on the standalone implementation PR with the exact deployment ID:

```yaml
candidate_qa:
  desktop_1440x900: pass
  mobile_390x844: pass
  light_mode: pass
  dark_mode: pass
  reduced_motion: pass
  document_horizontal_overflow: none
  bilingual_copy: pass
  portal_destinations: pass
  lead_contract_intercepted: pass
  admin_portal_private_markers: absent
  production_aliases_moved: false
```

Any failure stops promotion. Fixes require a new source PR, a new exact commit, a new candidate, and a full repeat of Task 5.

---

### Task 6: Present and approve exact Gate S2 for production promotion

**Files:**
- No file changes.
- External approval record: current task and PR comment.

**Interfaces:**
- Consumes: passing Task 5 and exact candidate/previous production identities.
- Produces: one explicit, bounded, unconsumed production promotion approval.

- [ ] **Step 1: Render the exact promotion Gate**

Present the YAML below with actual Task 1 and Task 4 values:

```yaml
gate: gccwebos-site-vercel-promote-s2
risk: A
provider: Vercel
release_unit: company-site-static
frontend_surface: company-site
target:
  team_id: team_FiT05F8Hvq9HAhr22ndT0sOO
  project_id: prj_XXzvF1FA89rvjKYvXx7cHHnuqC39
  candidate_deployment_id: $candidateDeploymentId
  candidate_source_commit: $siteSourceCommit
  custom_domains:
    - gccwebos.com
    - www.gccwebos.com
credential:
  privilege: unverified_assume_full_access
  local_source: process_only | approved_one_time_handoff
commands:
  allowed:
    - vercel promote $candidateDeploymentId --yes --scope gccltd
scope:
  promote_only: $candidateDeploymentId
validation:
  - both custom domains target the candidate
  - both roots return HTTP 200 and GCC WebOS brand content
  - Portal destinations and public-site boundary remain intact
rollback:
  command: vercel promote $previousProductionId --yes --scope gccltd
  validate:
    - both custom domains return to the previous deployment
    - both roots return HTTP 200
stop_conditions:
  - candidate identity or state changed
  - aliases no longer share the expected previous production
  - any requested mutation exceeds promotion
  - post-promotion HTTP or content validation fails
cleanup:
  - remove process VERCEL_TOKEN
  - delete approved handoff
forbidden:
  - DNS, domain creation/removal, environment, Team, project, Git, Portal, Admin, or backend changes
```

Interpolate `$candidateDeploymentId`, `$siteSourceCommit`, and `$previousProductionId` from prior tasks before presenting S2; do not present variable names as approval values.

- [ ] **Step 2: Wait for explicit S2 approval**

Approval of S1, the candidate, or this plan does not approve S2. Wait for a response that names `gccwebos-site-vercel-promote-s2`.

---

### Task 7: Promote, validate, and rollback on failure

**Files:**
- No repository file changes.
- External state: Vercel production aliases.

**Interfaces:**
- Consumes: approved S2, exact candidate, exact rollback deployment.
- Produces: verified production promotion or verified rollback.

- [ ] **Step 1: Re-read identities immediately before mutation**

Through the connector confirm:

```text
Candidate ID, source commit, and READY state are unchanged.
Both custom domains still target the expected previous production deployment.
```

If either statement is false, consume S2 as stopped and request a new Gate.

- [ ] **Step 2: Promote with the approved mechanism**

For CLI execution, load the Gate-named one-time handoff into one process, delete the handoff before the API call, then run:

```powershell
vercel promote $candidateDeploymentId --yes --scope gccltd
```

For Dashboard execution, the operator opens the exact candidate and selects Promote to Production once. The agent does not control the persistent browser session.

- [ ] **Step 3: Validate aliases and public responses**

Use the connector and direct HTTP:

```powershell
$apex = Invoke-WebRequest -Uri 'https://gccwebos.com/' -Method Get
$www = Invoke-WebRequest -Uri 'https://www.gccwebos.com/' -Method Get
@{
  apexStatus = $apex.StatusCode
  wwwStatus = $www.StatusCode
  apexHasBrand = $apex.Content.Contains('GCC WebOS')
  wwwHasBrand = $www.Content.Contains('GCC WebOS')
}
```

Expected:

```text
Both aliases target $candidateDeploymentId.
Both status codes are 200.
Both brand booleans are true.
```

- [ ] **Step 4: Roll back immediately if validation fails**

If an approved post-promotion check fails, run only the S2 rollback:

```powershell
vercel promote $previousProductionId --yes --scope gccltd
```

Then verify both aliases and both HTTP roots return to the previous deployment. Do not attempt an in-place fix.

- [ ] **Step 5: Clean local credential state**

Clear the process token, remove the Gate handoff, remove `.vercel` local link metadata if created, and read back absence. Never claim the provider credential was revoked; record it as `unverified_assume_valid` unless the provider independently proves expiration or revocation.

---

### Task 8: Record the Deploy Note and close the migration stage

**Files:**
- No repository source changes.
- External record: comment on `gccwebos-com/proxy-gateway-minimal#528`.

**Interfaces:**
- Consumes: successful Task 7 production validation.
- Produces: immutable deployment receipt and explicit remaining cleanup.

- [ ] **Step 1: Add the Deploy Note**

Comment on PR #528 with actual values:

```powershell
$deployedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
```

```yaml
Deploy Note:
  deployed_at: $deployedAtUtc
  release_unit: company-site-static
  frontend_surface: company-site
  source_repository: gaoyi1020-web/gccwebos-site
  source_commit: $siteSourceCommit
  artifact_or_release: $candidateDeploymentId
  target:
    - gccwebos.com
    - www.gccwebos.com
  backup: $previousProductionId
  validation:
    aliases: candidate
    apex_http: 200
    www_http: 200
    brand_content: pass
    portal_destinations: pass
    desktop_mobile_dark_reduced_motion: pass
```

Serialize the Deploy Note with the exact values bound during Tasks 1, 4, and 7; do not post PowerShell variable names.

- [ ] **Step 2: Record the production receipt**

```yaml
gate: gccwebos-site-vercel-promote-s2
result: completed
credential_local_after: absent
provider_credential_status: unverified_assume_valid
provider_mutation: promoted exact candidate
production_mutation: company-site-static aliases updated
rollback_identity: retained
conclusion: production validated
next_gate: separate old-source cleanup PR after stability review
```

- [ ] **Step 3: Confirm non-goals remained untouched**

Verify:

```text
The organization monorepo still contains the old company-site source.
No DNS record changed.
No Portal, Admin, backend, payment, Coins, order, attribution, or settlement source changed.
No generated dist output was committed.
```

- [ ] **Step 4: Stop before cleanup**

Do not delete the old source, close the rollback path, or modify Cloudflare under this plan. Those actions require a later independent PR and, where applicable, a separate Provider Gate.
