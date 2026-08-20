# CLI Production Provisioning SOP

Last updated: 2026-05-31, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: cli_production_provisioning_sop
  superseded_by: null
  last_verified_at: 2026-05-31
  production_authority: false
```


This document serves as the Standard Operating Procedure (SOP) for issuing and revoking user subscriptions via the platform CLI. It guarantees that all subscription handling remains operator-controlled, auditable, and secure.

This SOP is for operators only. It is not the customer portal flow, and the
user portal must not shell out to or depend on these CLI commands for normal
self-service actions such as viewing account state or refreshing an allowed
subscription artifact. CLI and portal adapters share domain services, but they
remain separate product surfaces.

> [!WARNING]
> This runbook is considered A-tier when executing against production environments for actual users. Follow the exact approval process before issuing real subscriptions.

## 1. Safety Rules & Boundaries

1. **No Raw Secrets in Repository or Chat**: Raw subscription URLs, `.env` file contents, artifact secrets, or full SQLite rows MUST NOT be committed to git, pasted in GitHub PRs, logged to terminals in a CI environment, or shared in chat with agents.
2. **Handoff Directory**: The actual generated `.txt` files meant for users must only be stored in the local `handoff/` directory (which is ignored by Git) or a secure `0600` path on the operator's machine.
3. **Approvals**: Bulk or small-batch generation of real subscriptions is an A-tier activity. It requires an explicit operator approval phrase.

## 2. Provisioning Procedure (Controlled Open)

Use this flow to convert a lead into a provisioned account, entitlement, and access grant.

### Step 2.1: Prepare Operator Form Facts

For subscription issuance preparation, prefer the operator provisioning form
contract before any execution path. It turns reviewed form facts into a safe
issuance input preview and still performs no database mutation:

```powershell
npm run platform:provisioning-form -- scripts/provisioning-form-input.example.json
```

See `docs/OPERATOR_PROVISIONING_FORM_CONTRACT.md`.

### Step 2.2: Prepare Controlled-Open Input

Create a JSON input file for the real issuance. Store this locally (e.g. `handoff/batch-1-input.json`).
Refer to `scripts/issuance-input.example.json` for the required format.

```json
{
  "displayName": "operator-safe label",
  "expiresAt": "2026-06-04T00:00:00.000Z",
  "nodeId": "channel-lab-b-tuic",
  "note": "preproduction-canary",
  "control": {
    "accountId": "acct_operator_safe_example",
    "ownerRef": "cust_operator_safe_hashref",
    "entitlementId": "ent_operator_safe_example",
    "plan": "pilot",
    "requestId": "iss_operator_safe_example_001",
    "requestedByRef": "operator_local_hashref",
    "purpose": "preproduction-canary",
    "maxArtifacts": 1,
    "maxDevices": 1,
    "trafficLimitBytes": 0
  },
  "artifact": {
    "create": true
  }
}
```

### Step 2.3: Execute Issuance CLI (A-tier)

Run the issuance CLI. This command requires mandatory flags to mutate production data.

```powershell
npm run platform:issue-subscription -- --execute-production-mutation --approval-ref "PR-265" --db-path ".proxy-gateway/subscriptions.sqlite" --control-db-path ".proxy-gateway/subscription-control.sqlite" --public-base-url "https://your-public-url.com" --handoff-file "handoff/user-A-delivery.txt" handoff/batch-1-input.json
```

**Flag Requirements:**
- `--execute-production-mutation`: Mandatory for real execution. Omitting this triggers a dry-run.
- `--approval-ref`: The PR or approval ticket number.
- `--db-path`: The explicit path to the SQLite database.
- `--control-db-path`: The explicit path to the subscription-control business
  ledger database. Real issuance is forbidden without it.
- `--public-base-url`: Must be `https://` (unless `--allow-local-test` is used).
- `--handoff-file`: The exact operator-only `0600` path where the visible-once handoff material will be written. Prefer a path outside the repository; repo-local `handoff/` is allowed only because it is gitignored.

### Step 2.4: Handoff and Output

The script will print a safe JSON summary to `stdout` containing hashed `tenantRef` and `artifactRef` values only. The raw opaque artifact `subscriptionUrl` will strictly be written to the specified `--handoff-file`. Do NOT paste the handoff file contents into the terminal or chat.

### Step 2.5: Database Verification

Verify both databases using safe aggregate queries. **DO NOT** use `SELECT *`.

```powershell
# Check technical subscription runtime state
$dbPath = ".proxy-gateway/subscriptions.sqlite"
sqlite3 $dbPath "SELECT status, count(*) FROM subscription_tenants GROUP BY status;"
sqlite3 $dbPath "SELECT status, count(*) FROM subscription_artifacts GROUP BY status;"

# Check business-control state
$controlDbPath = ".proxy-gateway/subscription-control.sqlite"
sqlite3 $controlDbPath "SELECT status, count(*) FROM platform_issuance_requests GROUP BY status;"
sqlite3 $controlDbPath "SELECT status, count(*) FROM platform_issued_subscription_links GROUP BY status;"
sqlite3 $controlDbPath "SELECT metric, sum(amount) FROM platform_quota_counters GROUP BY metric;"
```

## 3. Portal Entry Procedure

Use this flow only after the account and entitlement already exist in the
subscription-control business ledger. It creates a dynamic portal entry token
for TOTP enrollment or portal binding. It does not issue a subscription,
activate payment, expose a public portal route, or mutate runtime tenant /
artifact state.

### Step 3.1: Prepare Portal Entry Input

Create an operator-safe input JSON outside chat and PR bodies. Use
`scripts/portal-entry-input.example.json` as the shape:

```json
{
  "accountId": "acct_operator_safe_example",
  "entitlementId": "ent_operator_safe_example",
  "issuedByRef": "operator_local_hashref",
  "expiresAt": "2026-06-04T00:00:00.000Z",
  "maxUses": 1
}
```

### Step 3.2: Execute Portal Entry CLI

Production execution is A-tier because it mutates the control database and
creates visible-once handoff material.

```powershell
npm run platform:issue-portal-entry -- --execute-production-mutation --approval-ref "PR-portal-entry-approval" --control-db-path ".proxy-gateway/subscription-control.sqlite" --handoff-file "handoff/user-A-portal-entry.json" handoff/portal-entry-input.json
```

**Flag Requirements:**

- `--execute-production-mutation`: mandatory for real execution; omitting it
  triggers dry-run.
- `--approval-ref`: approval ticket or gate reference.
- `--control-db-path`: explicit subscription-control ledger path.
- `--handoff-file`: operator-only `0600` path for the visible-once entry token.

The command prints only a safe JSON summary to stdout. The raw dynamic portal
entry token is written only to the handoff file. Do not paste the handoff file
contents into chat, docs, PRs, logs, or public tickets.

### Step 3.3: Safe Control DB Verification

Use aggregate queries only:

```powershell
$controlDbPath = ".proxy-gateway/subscription-control.sqlite"
sqlite3 $controlDbPath "SELECT status, count(*) FROM platform_portal_entries GROUP BY status;"
sqlite3 $controlDbPath "SELECT count(*) FROM platform_portal_sessions;"
```

## 4. Revocation / Rollback Procedure

If a subscription was issued in error, or access needs to be revoked, follow these steps.

### Step 4.1: Plan Revocation (Dry Run)

Run the revoke script in plan-only mode to generate a safety summary.

```powershell
npm run platform:revoke-access -- <tenant-id> --dry-run
```

Review the dry-run output to ensure you are targeting the correct tenant and artifacts.

### Step 4.2: Execute Revocation (Separate A-tier Approval Required)

The dry-run output is not execution authority. True revocation mutates
subscription state and therefore requires a separate exact-phrase A-tier
approval or an explicitly authorized production operation record.

After that approval, use the existing approved runbook or authorized operator
tooling to perform the following changes. The required programmatic rollback
actions against the `subscriptions.core` API are:

1. `disableTenant(tenantId)`: Sets the tenant status to disabled.
2. `revokeSubscriptionArtifact(artifactId)`: Marks the artifact as revoked.

If executing manually via SQL (implementation shape only, not execution authority):
1. Set the tenant status to `disabled`.
   ```sql
   UPDATE subscription_tenants SET status = 'disabled' WHERE id = '<tenant-id>';
   ```
2. Mark associated active opaque artifacts as `revoked` with a revocation
   timestamp.
   ```sql
   UPDATE subscription_artifacts SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE id = '<artifact-id>';
   ```
3. Re-check public refresh behavior through the approved validation command.
4. Reload Nginx only if a separate Nginx/static-output gate explicitly requires
   it.

## 5. Audit & Record Keeping

After completion, fill out the `docs/production-replacement-records/TEMPLATE_SUBSCRIPTION_PROVISIONING.md` template.
Save it as `docs/production-replacement-records/YYYY-MM-DD-batch-provisioning.md` and commit it to the repository.
Ensure NO raw links or secrets are included in the markdown file.
