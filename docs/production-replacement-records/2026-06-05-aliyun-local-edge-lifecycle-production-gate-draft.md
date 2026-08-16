# Aliyun Local Edge Lifecycle Production Gate Draft


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_local_edge_lifecycle_production_gate_draft
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


Date: 2026-06-05, Asia/Shanghai

Risk: A

Status: blocked before production packaging.

## Scope

Prepare the next production gate for Aliyun local edge lifecycle support and
multi-channel policy wiring.

The intended production target is the Aliyun candidate runtime only. The target
edge channel is `channel-aliyun-a-tuic`, using `mihomo-tuic.service` with
explicit restart activation.

## Current Repository Evidence

Completed repo-only support:

- multi-channel safe metadata: `channelRole`, `lifecycle`,
  `physicalNodeRef`, and `generation`;
- lifecycle eligibility gate: `online` is not enough; default/automatic
  issuance requires `lifecycle=active`;
- stable pool policy gate for UDP/QUIC protocols with explicit operator
  approval warning;
- data-plane credential lifecycle policy for per-order add/disable/rotate;
- redacted desired-state reconciliation plan;
- injected Mihomo TUIC explicit-restart runtime adapter core.

## Validation Already Run

```text
npm test
Result: pass, 592/592

npm run project-state:check
Result: pass

node --test server\tests\edge-credential-reconciliation-gateway.test.mjs server\tests\edge-mihomo-tuic-runtime-adapter.test.mjs server\tests\subscription-channel-policy.test.mjs server\tests\subscription-node-registry.test.mjs
Result: pass, 24/24

node --test server\tests\cli-router.test.mjs --test-name-pattern "edge credentials reconciliation|business facade|policy-check"
Result: pass, 56/56

node bin\gccgw.mjs edge credentials reconcile-plan --input .codex-artifacts\aliyun-local-edge-desired-state.template.json --json
Result: ok=true, mutation=false, redacted=true

node bin\gccgw.mjs edge credentials apply --input .codex-artifacts\aliyun-local-edge-desired-state.template.json --execute-production-mutation --json
Result: blocked by non-interactive Risk A approval prompt before execution
```

## Packaging Blocker

A production release/archive was not generated from this working tree because
the repository is currently dirty with many unrelated changes outside the
Aliyun local edge lifecycle scope.

Do not deploy a package made directly from the current dirty working tree.

Before production packaging, create a clean release candidate that contains only
reviewed changes for:

- edge credential reconciliation gateway;
- Mihomo TUIC explicit-restart adapter;
- multi-channel node lifecycle metadata;
- channel policy gates;
- Aliyun local TUIC template;
- related tests and docs.

## Required Production Gate Fields

The exact approval must name:

- `release`: exact clean candidate release identifier;
- `archive_sha256`: exact archive SHA-256;
- `target`: Aliyun candidate runtime only;
- `channel`: `channel-aliyun-a-tuic`;
- `service`: `mihomo-tuic.service` only;
- `runtime_env`: no unrelated env mutation;
- `protected_config_path`: operator-provided protected runtime config path;
- `protected_material_source`: operator-provided protected credential material
  source;
- `protected_backup_path`: operator-provided protected backup directory;
- `activation`: explicit restart;
- `rollback`: previous candidate runtime release plus protected config backup;
- `validation`: health, no-session portal rejection, Admin blocking, policy
  dry-run, reconciliation dry-run, config-test, service active, UDP 443
  listener;
- `forbidden`: DNS, Nginx config mutation, firewall/security group, public
  Admin, payment, account/password generation, live order creation, passkey
  enablement, secrets/tokens/passwords/subscription URL output, SQLite row
  dump, unrelated node endpoint mutation, sub.globalcirclecat.com behavior
  change, ss-sg change, AWS mutation.

## Approval Template

```text
批准执行阿里云本机边缘节点生命周期上线：
release=<clean candidate release>;
archive_sha256=<clean candidate archive sha256>;
target=Aliyun candidate runtime only;
channel=channel-aliyun-a-tuic;
service=mihomo-tuic.service only;
runtime_env=no unrelated env mutation;
protected_config_path=<protected runtime config path>;
protected_material_source=<protected credential material source>;
protected_backup_path=<protected backup directory>;
activation=explicit restart;
restart=mihomo-tuic.service only after config-test passes;
rollback=restore previous candidate runtime release + protected config backup;
validation=health ok, portal no-session reject, Admin blocked, node policy ok, data-plane lifecycle policy ok, edge reconciliation dry-run ok, config-test ok, service active, UDP 443 present;
forbidden=DNS, Nginx config mutation, firewall/security group, public Admin, payment, account/password generation, live order creation, passkey enablement, secrets/tokens/passwords/subscription URL output, SQLite row dump, unrelated node endpoint mutation, sub.globalcirclecat.com behavior change, ss-sg change, AWS mutation, raw config/log/env output.
```

## Next Action

Create a clean candidate release from reviewed repository changes only, run the
same validation set from that clean candidate, compute the archive SHA-256, then
request the exact production approval using the template above.
