# D1 T2-C1 Cognito Non-Production AWS CLI Runbook v1

~~~yaml
document_metadata:
  doc_type: operational_runbook
  lifecycle: draft
  authority_scope: d1_t2_c1_cognito_nonprod_infrastructure
  last_verified_at: 2026-11-15
  production_authority: false
~~~

> **DRAFT — PREPARATION ONLY.** These templates and commands have not been applied to an AWS account. Creating a CloudFormation change set is a separate operator action; executing it creates billable AWS resources and requires a separate explicit go-ahead. This runbook does not authorize production resources, production users, real-user imports, Cloudflare changes, or cutover.

## 1. Purpose and resource inventory

Create two independent non-production Cognito User Pools for the FlyLink D1 C1 proof:

| Surface | CloudFormation template | MFA policy | OIDC client |
|---|---|---|---|
| Portal | infra/cognito/nonprod/portal-user-pool.yaml | TOTP optional | Public Authorization Code + PKCE |
| Admin | infra/cognito/nonprod/admin-user-pool.yaml | TOTP required | Public Authorization Code + PKCE |

Each stack defines:
- One Cognito User Pool with email alias sign-in, email auto-verification for future sign-ups, ESSENTIALS feature plan, and deletion protection ACTIVE.
- One Cognito prefix domain using classic Hosted UI (ManagedLoginVersion 1) for the non-production OIDC authorization-code proof.
- One public first-login bootstrap client with USER_PASSWORD_AUTH only. It exists solely to test imported-password first sign-in and must not become the normal application login client.
- One public OIDC client with code grant, no client secret, short test token lifetimes, token revocation and SRP API flow enabled. Browser and Android callers must use PKCE with S256, state and nonce.
- One IAM role that Cognito can assume to write import-job results to CloudWatch Logs.

The pools have separate issuers, signing keys, user directories, domains, app clients and MFA policies. No cross-pool trust is configured. The templates contain no production callbacks, production identifiers, customer data, static secrets, Lambda triggers, Cloudflare resources or D1 resources.

The first-login bootstrap client is intentionally separate from the OIDC client. The imported-password path requires USER_PASSWORD_AUTH or ADMIN_USER_PASSWORD_AUTH until the first successful sign-in migrates the credential. Normal OIDC traffic must use the OIDC client and the authorization-code PKCE flow. After the PoC, review whether the bootstrap clients should be removed or disabled.

## 2. AWS design decisions and limits

- UserPoolTier is ESSENTIALS. AWS currently describes Essentials as the default plan for new pools and documents the first 10,000 MAUs as free for the Essentials user-pool SKU. Actual billing remains account-, region- and usage-dependent; verify the current AWS pricing page before creating stacks.
- CSV import itself does not contribute to Cognito MAU billing. Sign-in, token refresh, password reset and other identity operations can count as MAUs.
- No SMS MFA is configured. Both pools enable SOFTWARE_TOKEN_MFA only. Portal uses OPTIONAL; Admin uses ON.
- Admin imports must leave cognito:mfa_enabled blank or set it to true. AWS documents that a blank value adopts the pool's required MFA state. An imported Admin user without a valid factor cannot sign in until the user completes TOTP setup.
- The templates deliberately do not set a final production password policy. AWS does not enforce a pool password policy during password-hash import. Existing FlyLink G-12 policy and cohort validation remain authoritative for any future migration decision.
- DeletionProtection is ACTIVE. Stack teardown is intentionally not a one-command operation: an operator must first review the evidence, update the pool protection to INACTIVE through CloudFormation, and only then delete the stack.
- The domain prefix must be unique in the selected AWS Region. The runbook assumes a commercial AWS partition and the standard Cognito prefix-domain suffix.

Official references:
- [Cognito user-pool feature plans](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-sign-in-feature-plans.html)
- [Cognito pricing](https://aws.amazon.com/cognito/pricing/)
- [Cognito MAU and quota behavior](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html)
- [CloudFormation UserPool](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpool.html)
- [CloudFormation UserPoolClient](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html)
- [CloudFormation UserPoolDomain](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpooldomain.html)

## 3. Account and region preflight

Use an AWS IAM Identity Center / SSO profile or another approved short-lived credential flow. Do not paste access keys, secret keys, session tokens, passwords, import CSV files or pre-signed URLs into ChatGPT, GitHub, Slack or Notion.

PowerShell example:

~~~powershell
aws configure sso --profile flylink-nonprod
aws sso login --profile flylink-nonprod
$Profile = "flylink-nonprod"
$Region = "<choose-an-AWS-commercial-region>"
$env:AWS_PROFILE = $Profile
$env:AWS_REGION = $Region
aws sts get-caller-identity --profile $Profile --region $Region --query "{Account:Account,Arn:Arn}" --output json
~~~

Stop if the returned account or principal is not the intended non-production account. Do not infer an AWS region from the user's current location. Choose the region deliberately, compare current Cognito and email-delivery pricing, and use the same region for both pools.

Before any stack change, list existing pools and check for name/domain collisions:

~~~powershell
aws cognito-idp list-user-pools --max-results 60 --profile $Profile --region $Region
~~~

## 4. Local template validation

Run these read-only checks locally. They do not create AWS resources.

~~~powershell
aws cloudformation validate-template --template-body file://infra/cognito/nonprod/portal-user-pool.yaml --profile $Profile --region $Region
aws cloudformation validate-template --template-body file://infra/cognito/nonprod/admin-user-pool.yaml --profile $Profile --region $Region

# If cfn-lint is installed:
cfn-lint infra/cognito/nonprod/portal-user-pool.yaml
cfn-lint infra/cognito/nonprod/admin-user-pool.yaml
~~~

The callback and logout URI parameters must be replaced with the actual non-production client URIs. Portal should include its browser callback and the Android app callback scheme. Admin should include only its non-production Admin callback. Use HTTPS except for localhost test callbacks or registered app URI schemes.

## 5. CloudFormation change-set preview

The following commands create CloudFormation change-set records only. They do not create the User Pools, domains, app clients or IAM roles. Review the full change set and its IAM role before any later execute-change-set action.

Portal preview:

~~~powershell
$Stamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$ParameterRoot = Join-Path ([System.IO.Path]::GetTempPath()) "flylink-cognito-poc"
New-Item -ItemType Directory -Force -Path $ParameterRoot | Out-Null
$Utf8NoBom = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false

$PortalParamsFile = Join-Path $ParameterRoot "portal-change-set-parameters.json"
$PortalParams = @(
  @{ ParameterKey = "UserPoolName"; ParameterValue = "flylink-portal-nonprod" },
  @{ ParameterKey = "DomainPrefix"; ParameterValue = "<unique-portal-domain-prefix>" },
  @{ ParameterKey = "CallbackUrls"; ParameterValue = "https://portal-np.example.invalid/oidc/callback,flylink-portal://oauth/callback" },
  @{ ParameterKey = "LogoutUrls"; ParameterValue = "https://portal-np.example.invalid/logout" }
)
[System.IO.File]::WriteAllText($PortalParamsFile, ($PortalParams | ConvertTo-Json -Depth 4), $Utf8NoBom)
aws cloudformation create-change-set --stack-name flylink-cognito-portal-np --change-set-name "preview-portal-$Stamp" --change-set-type CREATE --template-body file://infra/cognito/nonprod/portal-user-pool.yaml --parameters "file://$PortalParamsFile" --capabilities CAPABILITY_IAM --profile $Profile --region $Region
~~~

Admin preview:

~~~powershell
$AdminParamsFile = Join-Path $ParameterRoot "admin-change-set-parameters.json"
$AdminParams = @(
  @{ ParameterKey = "UserPoolName"; ParameterValue = "flylink-admin-nonprod" },
  @{ ParameterKey = "DomainPrefix"; ParameterValue = "<unique-admin-domain-prefix>" },
  @{ ParameterKey = "CallbackUrls"; ParameterValue = "https://admin-np.example.invalid/oidc/callback" },
  @{ ParameterKey = "LogoutUrls"; ParameterValue = "https://admin-np.example.invalid/logout" }
)
[System.IO.File]::WriteAllText($AdminParamsFile, ($AdminParams | ConvertTo-Json -Depth 4), $Utf8NoBom)
aws cloudformation create-change-set --stack-name flylink-cognito-admin-np --change-set-name "preview-admin-$Stamp" --change-set-type CREATE --template-body file://infra/cognito/nonprod/admin-user-pool.yaml --parameters "file://$AdminParamsFile" --capabilities CAPABILITY_IAM --profile $Profile --region $Region
~~~

Replace every example.invalid URI and every domain prefix before running. The example values are documentation placeholders, not approved callback URLs.

Inspect the change sets:

~~~powershell
aws cloudformation describe-change-set --stack-name flylink-cognito-portal-np --change-set-name "preview-portal-$Stamp" --profile $Profile --region $Region --query "{Status:Status,ExecutionStatus:ExecutionStatus,Changes:Changes[].ResourceChange.{Action:Action,LogicalResourceId:LogicalResourceId,ResourceType:ResourceType,Replacement:Replacement}}" --output json
aws cloudformation describe-change-set --stack-name flylink-cognito-admin-np --change-set-name "preview-admin-$Stamp" --profile $Profile --region $Region --query "{Status:Status,ExecutionStatus:ExecutionStatus,Changes:Changes[].ResourceChange.{Action:Action,LogicalResourceId:LogicalResourceId,ResourceType:ResourceType,Replacement:Replacement}}" --output json
~~~

Do not run execute-change-set as part of this preparation task. Actual stack creation requires a separate explicit authorization after account, region, cost and change-set review.

## 6. Post-creation read-only verification (future step)

Only after separately authorized stack creation, collect the UserPoolId, OIDC client ID, bootstrap client ID, issuer, JWKS URI and import role ARN from CloudFormation outputs. Then verify the pool settings:

~~~powershell
aws cloudformation describe-stacks --stack-name flylink-cognito-portal-np --profile $Profile --region $Region
aws cognito-idp describe-user-pool --user-pool-id <portal-user-pool-id> --profile $Profile --region $Region
aws cognito-idp describe-user-pool-client --user-pool-id <portal-user-pool-id> --client-id <portal-oidc-client-id> --profile $Profile --region $Region
aws cognito-idp get-csv-header --user-pool-id <portal-user-pool-id> --profile $Profile --region $Region
~~~

Repeat for Admin. Verify:
- Portal MfaConfiguration is OPTIONAL and EnabledMfas contains SOFTWARE_TOKEN_MFA.
- Admin MfaConfiguration is ON and EnabledMfas contains SOFTWARE_TOKEN_MFA.
- Both pools are on the expected feature plan and have DeletionProtection ACTIVE.
- OIDC clients have GenerateSecret=false, code grant, exact callbacks, token revocation and no password-auth flow.
- Bootstrap clients have USER_PASSWORD_AUTH only and no OAuth grant.
- Issuer and JWKS URIs match the exact pool IDs; the Worker must later enforce exact issuer and client/audience binding.

## 7. Synthetic-only SCRYPT import rehearsal (future step)

### 7.1 Confirm the actual CSV template

Download the current template.csv from each pool's Cognito console Import users page. AWS documentation's sample GetCSVHeader response does not show password_hash, while the current password-hash-import instructions state that the downloadable import template includes it. Treat the actual pool-specific template as the source of truth.

The generator below fails closed unless the downloaded header contains all four required columns: cognito:username, email, email_verified and password_hash. Do not invent a missing column or silently modify the template. If the console template and GetCSVHeader output disagree, stop and record the discrepancy.

### 7.2 Generate one fixed synthetic row

Use a user-only temporary directory. On Windows, the script requires the output file to be under the current user's system temporary directory and creates it without overwriting an existing file.

~~~powershell
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "flylink-cognito-poc"
New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
$PortalTemplate = "<path-to-downloaded-portal-template.csv>"
$PortalCsv = Join-Path $TempRoot "portal-synthetic.csv"
node scripts/platform-cognito-synthetic-import-csv.mjs --template-csv $PortalTemplate --output $PortalCsv
~~~

Repeat with the Admin template and a different output filename. The generator writes exactly one synthetic user row, never prints the CSV or password hash, and does not accept arbitrary user records. On POSIX systems it enforces file mode 0600. On Windows, keep the file in the user-only temp directory and rely on the account's inherited local ACLs.

The generated row uses the fixed reserved example.test email and a synthetic username. It marks email_verified TRUE because the fixture is explicitly synthetic and pre-classified as verified. Never copy this setting to a real user without authoritative source verification evidence. The Admin row leaves cognito:mfa_enabled blank; AWS documents that blank adopts the required pool MFA state.

### 7.3 Create, upload and start the import job

Run Portal and Admin imports sequentially. AWS permits only one active import job per account. The pre-signed upload URL expires after 15 minutes. The URL is a temporary upload credential: keep it in process memory, never print it, never save it to a log, and never paste it into a ticket or chat.

Portal example:

~~~powershell
$PortalJob = aws cognito-idp create-user-import-job --job-name "c1-portal-synthetic-$Stamp" --user-pool-id <portal-user-pool-id> --cloud-watch-logs-role-arn <portal-import-logs-role-arn> --password-hashing-algorithm SCRYPT --profile $Profile --region $Region | ConvertFrom-Json
$PortalJobId = $PortalJob.UserImportJob.JobId
$PortalUploadUrl = $PortalJob.UserImportJob.PreSignedUrl
if (-not $PortalJobId -or -not $PortalUploadUrl) { throw "Cognito import job did not return its upload details." }
# The URL is passed only to the local upload process; do not echo it.
& curl.exe --fail --silent --show-error -T $PortalCsv -H "x-amz-server-side-encryption:aws:kms" $PortalUploadUrl
if ($LASTEXITCODE -ne 0) { throw "Portal synthetic CSV upload failed." }
aws cognito-idp start-user-import-job --user-pool-id <portal-user-pool-id> --job-id $PortalJobId --profile $Profile --region $Region
~~~

Poll the job with describe-user-import-job until Status is Succeeded or Failed. Acceptance for the one-row fixture is ImportedUsers=1, FailedUsers=0 and SkippedUsers=0. Review the corresponding CloudWatch import log. AWS documents that these logs identify rows by line number and do not write user data.

Repeat the same sequence for Admin using the Admin pool ID, Admin import role ARN, Admin CSV and a new import job name. Do not start both jobs concurrently.

If the upload URL expires, do not reuse it. Create a new import job and upload to its new URL. Do not stop an import job unless aborting is intentional; a stopped job cannot be restarted.

### 7.4 First sign-in and credential migration

The imported-hash path must first use the dedicated bootstrap client with USER_PASSWORD_AUTH. Do not pass the synthetic plaintext password as a command-line argument, shell literal, environment variable, GitHub Actions input or chat message. Use a local non-production test client/SDK that prompts securely for the fixed synthetic test password.

Acceptance:
1. Correct synthetic password succeeds on the first imported-hash sign-in.
2. Wrong password fails without account enumeration.
3. Admin first sign-in returns the expected MFA_SETUP path when the imported user has no TOTP factor.
4. TOTP enrollment and challenge complete successfully for Admin.
5. Portal optional TOTP can be enrolled and challenged without forcing every Portal user to enroll.
6. After successful first sign-in, subsequent sign-in works with SRP through the normal OIDC/app client.
7. Browser and Android OIDC use Authorization Code + PKCE (S256), state and nonce; validate issuer, audience/client, signature, token use, expiry and relevant authentication claims.
8. Admin tokens carry the actual verified MFA evidence required by the Worker. A configured factor alone is not proof that the current sign-in completed TOTP.

### 7.5 Critical Scrypt acceptance gate

AWS documents the SCRYPT format as N$r$p$hexSalt$hexHash, with maximum N=65536, r=8 and p=1. The existing FlyLink source uses N=32768, r=8, p=1, a 16-byte salt and a 64-byte derived key. The AWS documentation example shows a 32-byte derived hash, but does not specify a supported derived-hash length range.

Therefore, the first non-production import must prove that Cognito accepts the exact 64-byte source digest. A local parser or a green unit test is not provider acceptance. If Cognito rejects the 64-byte digest, stop. Do not truncate it, re-derive it with a different key length, or change the production password format as a workaround. Return to a separately reviewed compatibility decision.

Also test first sign-in with 71, 72 and 73 UTF-8-byte passwords and the Chinese multibyte fixtures. The local Scrypt tests do not prove Cognito's actual service behavior.

## 8. Cost, logs and cleanup

- CSV import does not count as a MAU; sign-in and token operations can. Check current regional pricing before creating stacks.
- Cognito's default email sender has service limits; the reserved example.test address is not a deliverable mailbox. This PoC does not prove email delivery, password recovery or email OTP.
- The import role grants only the CloudWatch Logs actions in AWS's documented Cognito import policy, scoped to the /aws/cognito/* log-group namespace.
- Do not add real users, real email addresses, production hashes, plaintext passwords, TOTP seeds, recovery codes or production identifiers to the PoC.
- Remove the generated CSV and downloaded template from the local temp directory after the import is complete. Standard file deletion is not guaranteed secure erasure on SSDs; use an encrypted, access-restricted local disk and keep the artifact lifetime short.
- Keep DeletionProtection ACTIVE until the PoC evidence is reviewed. If cleanup is later authorized, update the corresponding CloudFormation template to set DeletionProtection INACTIVE, apply and verify that stack update, then delete the stack. Do not bypass protection by deleting the User Pool out of band.
- Retain redacted results only: pool IDs, job IDs, status counts, test outcomes, issuer/JWKS metadata and cost observations. Never retain pre-signed URLs, CSV contents, password hashes, plaintext passwords, TOTP secrets or authentication tokens in Notion or GitHub.

## 9. Current execution status

- Templates and this runbook are repository artifacts on the Cognito PoC branch.
- No AWS profile was configured or used in this session.
- No AWS account identity was queried.
- No CloudFormation validation call, change set, stack, User Pool, domain, app client, IAM role or import job was created.
- No CSV was generated or uploaded.
- No production user, password hash, TOTP secret, Worker, D1, DO, Secret, route or binding was accessed or modified.
- Local YAML parse and internal CloudFormation Ref/GetAtt checks passed for both templates; cfn-lint and AWS cloudformation validate-template were not run.
- The focused isolated Node 22.16 harness passed 8/8 tests; the full repository test command and root suite were not run in a complete checkout.
- The CSV writer smoke test created one local synthetic fixture under the temp directory, verified POSIX mode 0600 and confirmed that a second run does not overwrite the file. No CSV from a real pool template was uploaded to AWS.
- C1 remains PARTIAL/BLOCKED and T2 remains BLOCKED until the full provider and identity-custody evidence is independently reviewed and accepted.

## 10. Official AWS references

- [Import users from CSV and password hashes](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html)
- [CreateUserImportJob API](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_CreateUserImportJob.html)
- [SetUserPoolMfaConfig API](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SetUserPoolMfaConfig.html)
- [Cognito User Pool CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpool.html)
- [Cognito User Pool Client CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html)
- [Cognito User Pool Domain CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpooldomain.html)
