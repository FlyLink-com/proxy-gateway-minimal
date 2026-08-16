# HP Portal Validation Runbook

Last updated: 2026-06-01, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: hp_portal_validation_runbook
  superseded_by: null
  last_verified_at: 2026-06-01
  production_authority: false
```


> Status:
> - Type: private validation runbook
> - Risk: C for this document; A for any HP host mutation, deployment,
>   process start, port exposure, Nginx/systemd change, SQLite write, secret,
>   artifact, tenant, or subscription-material operation
> - Execution authority: this document does not approve execution by itself
> - Production impact: none
> - Source of truth for: using HP as an Aliyun-like private validation
>   environment for the user portal and subscription-control service seams

## Purpose

HP can be used as a private validation host to test the user portal and
subscription-control flow before touching Aliyun production boundaries.

The intent is:

```text
current repo branch
  -> package / build
  -> isolated HP test directory
  -> test SQLite only
  -> loopback or private listener only
  -> portal flow smoke tests
  -> execution record
```

This is not a production deployment path. Aliyun remains the production
subscription-control and subscription-distribution platform. HP is an
operator-lab / validation surface only.

## Allowed Validation Targets

HP validation may cover:

- Static user-portal bundle loading.
- `UserPortalClient` contract behavior against a private test adapter.
- Portal lifecycle rendering for `none`, `pending`, `active`, and `expired`.
- Contact-info modal and `updateContactInfo` persistence behavior against a
  test database.
- Package application request creation in `pending`.
- Operator-approval simulation using test-only rows.
- Active refresh simulation and old-link invalidation event rendering.
- Profile history read-model rendering.
- Safe visible-once display rules using fake/demo material only.
- Public Admin blocking equivalence in the private validation boundary.
- Local smoke tests for `/api/health` and portal-only private routes when a
  route is explicitly enabled for validation.

## Not Allowed

This runbook does not allow:

- DNS changes.
- Aliyun mutation.
- AWS mutation.
- Public listener exposure.
- Public Admin exposure.
- Production Nginx changes.
- Persistent systemd service installation.
- Production SQLite copy, migration, or write.
- Customer-data import.
- Real tenant or artifact issuance.
- Raw subscription URL or artifact secret logging.
- Payment activation.
- Edge traffic activation.
- Legacy query-token retirement.
- Traffic accounting or quota enforcement mutation.

## Not Performed Boundary

Unless a later execution record has exact A-tier approval and records matching
validation evidence, this runbook has not performed:

```text
HP host mutation, deployment, process start, or port exposure
Nginx, systemd, firewall, DNS, Aliyun, AWS, or production-boundary mutation
production SQLite/customer-data copy, migration, or write
real tenant, artifact, subscription URL, payment, or entitlement issuance
edge traffic activation or legacy query-token retirement
```

## Risk Boundary

| Activity | Risk | Approval |
| --- | --- | --- |
| Editing this runbook | C | Normal docs review |
| Local repo tests only | B | Normal code/test flow |
| HP read-only inventory | A preflight | Operator approval recommended before SSH inventory |
| Copying repo/build artifacts to HP | A | Exact approval required |
| Creating test SQLite on HP | A | Exact approval required |
| Starting a loopback/private test service on HP | A | Exact approval required |
| Changing HP Nginx/systemd/firewall | A | Separate exact approval required |
| Any production or Aliyun mutation | A | Separate production approval required |

## Preflight Check

Every HP validation execution must complete `Read-Only Inventory` before any
copy, package install, test database creation, process start, listener exposure,
or host mutation. The preflight record is required to state:

```text
Risk: A / read-only
Mutation: none
HP host identity and toolchain: verified
Current listeners and disk capacity: verified
Validation target and isolated directory: named
Secrets/customer data: not printed or copied into Git
Rollback cleanup action: named
```

If any preflight fact is stale, missing, or inconsistent with the approval
phrase, stop before HP setup mutation.

## Read-Only Inventory

Before any HP mutation, collect only non-secret facts:

```powershell
ssh hp-server "hostname; uname -a; id; pwd"
ssh hp-server "node -v; npm -v; git --version"
ssh hp-server "df -h; ss -ltnp"
```

Do not print environment files, SQLite row data, tokens, subscription URLs,
artifact secrets, customer data, SSH keys, or process command lines that contain
secrets.

## Execution Approval Phrase

Use an exact phrase before any HP setup mutation:

```text
Approve HP Aliyun-like private portal validation environment setup. Allow
deploying the current branch to hp-server under an isolated test directory,
installing dependencies from the repository lockfile, creating only test SQLite
data, and starting a loopback/private test service for portal validation. No
DNS change, no public listener exposure, no production SQLite/customer data, no
Aliyun mutation, no Nginx public boundary change, no systemd persistent service
unless separately approved, no real subscription issuance, and rollback by
stopping the test service and deleting the isolated test directory.
```

Short confirmations such as `同意`, `继续`, `开始`, `ok`, or `go` are not
execution approval for this A-tier setup.

## Setup Shape

The HP validation directory should be isolated and disposable:

```text
/opt/proxy-gateway-minimal-portal-validation/
  repo/
  data/
    control-test.sqlite
    runtime-test.sqlite
  logs/
  handoff/
```

Rules:

- `data/` contains test databases only.
- `handoff/` is local to the HP validation host and must not be committed.
- Raw visible-once material, if a test produces any, must stay in `handoff/`
  with restrictive permissions and fake/demo content only.
- The service should prefer loopback or private management binding.
- Public Nginx should not be changed unless a separate A-tier approval is
  issued.

## Validation Flow

1. Confirm the branch, commit, and build inputs.
2. Run repository tests locally before copying anything to HP.
3. Perform HP read-only inventory.
4. Create or refresh the isolated validation directory.
5. Install dependencies from the committed lockfile.
6. Build the Admin/user-portal bundle.
7. Create test-only SQLite databases.
8. Start the private validation service.
9. Run smoke checks:
   - health endpoint returns success;
   - portal shell loads;
   - `none` lifecycle renders without expiry;
   - contact modal blocks application until required fields exist;
   - `pending` lifecycle shows no concrete expiry;
   - `active` lifecycle shows backend-provided expiry only;
   - refresh shows old-link invalidation only when returned by the backend;
   - profile history renders from backend read-model rows only.
10. Stop the validation service unless a separate approval keeps it running.
11. Record the evidence in a dated execution record.

## Pass Criteria

The validation passes only if:

- No production data is copied to HP.
- No public listener is opened.
- No public Admin route is exposed.
- No raw subscription URL or artifact secret appears in terminal output, docs,
  PR body, logs, or chat.
- User portal states match `docs/USER_PORTAL_FLOW.md`.
- Subscription issuance remains controlled by the backend/service boundary and
  does not shell out to operator CLI from the user portal.
- Rollback removes the isolated test process and test directory.

## Rollback

Rollback for the approved private validation setup is:

```powershell
ssh hp-server "pkill -f proxy-gateway-minimal-portal-validation || true"
ssh hp-server "rm -rf /opt/proxy-gateway-minimal-portal-validation"
```

Do not run rollback commands without first verifying the resolved absolute
target path on HP and confirming it is the isolated validation directory.

## Execution Record Template

Create a dated record under `docs/production-replacement-records/` or another
approved validation-record directory with:

- approval phrase and timestamp;
- branch and commit;
- HP inventory summary with no secrets;
- setup commands summarized;
- validation checks and outputs summarized;
- rollback evidence;
- non-goals explicitly confirmed.

The execution record must not contain raw subscription URLs, artifact secrets,
customer data, access tokens, private keys, or production SQLite rows.
