# Node Onboarding Runbook

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Type: Active operator runbook
> - Risk: A for execution; C for this document
> - Execution authority: None. This runbook does not authorize provider
>   mutation, DNS, firewall, Nginx, systemd, runtime config, database writes,
>   protected material changes, live order creation, subscription rendering
>   unlock, traffic activation, or sensitive output.
> - Source of truth for: The safe sequence for onboarding a new data-plane node
>   or binding an already reviewed node into the current control-plane model.

## Purpose

This runbook is the top-level entrypoint for turning a node candidate into
receipt-gated production capacity. It connects the existing no-secret image,
node registration, protected material handoff, edge-agent apply, and
subscription render-gate contracts into one operator flow.

The current architecture remains a single control-plane / multi-data-plane
model:

- The control plane owns accounts, orders, artifacts, credential lifecycle,
  desired-state, material references, receipts, render policy, and audit.
- Data-plane nodes own protocol runtimes, local config-test, controlled apply,
  listeners, traffic capacity, and redacted receipts.
- A channel must not be rendered only because a server is reachable. It needs a
  matching current applied receipt for the order/channel generation.

## One-Page Flow

1. Classify the work as Risk A.
   Start with read-only inventory and exact operator approval. Do not mutate
   providers, hosts, DNS, firewall, Nginx, systemd, runtime configs, protected
   material, databases, or orders from this runbook alone.

2. Select the onboarding branch.
   Use `new_image_node` for a freshly provisioned host from a no-secret image.
   Use `bind_existing_reviewed_node_only` for a live reviewed host that already
   has runtime anchors and safe facts.

3. Prove no-secret image readiness when using a new host.
   Follow `docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md` and the image acceptance
   records. The image may contain binaries, service templates, health helpers,
   and agent scaffolding, but no secrets, credentials, tokens, subscription
   URLs, or customer data.

4. Produce or review safe node facts.
   The first-boot packet or reviewed-node packet may contain provider, region,
   role, pool, lifecycle, channel refs, runtime release refs, and health facts.
   It must not contain raw secrets, private keys, subscription URLs, customer
   data, or unredacted runtime config.

5. Bind the node in the control plane.
   Follow `docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md` and
   `docs/CONTROL_PLANE_NODE_REGISTRATION_CLOSEOUT.md`. Registration records the
   reviewed node identity, safe facts, lifecycle, pool, and channel refs. It is
   not a traffic activation step.

6. Register protected material references.
   Use key and digest refs only. Do not copy protected runtime values into Git,
   docs, chat, Linear, Slack, or PR text. Missing material or digest mismatch is
   a hard stop.

7. Generate desired-state.
   Desired-state is control-plane intent for a specific node/channel/order
   generation. For smoke tests, scope it to exactly one reviewed order or one
   approved test order.

8. Run edge-agent dry-run.
   The data-plane edge agent pulls desired-state and material through the
   private authenticated path, validates what would change, and emits a redacted
   dry-run summary. A failed dry-run stops the gate.

9. Apply only after dry-run passes.
   The data-plane agent applies the scoped or aggregate generation, runs
   runtime config-test, and restarts only approved data-plane services required
   by the apply path.

10. Post applied receipts.
    Receipts must identify the node, channel, generation, material digest, and
    status without exposing secrets. Scoped receipts must not be treated as an
    aggregate full-channel unlock.

11. Run receipt-gated render proof.
    The control plane may render node channels only when the receipt gate
    matches the order/channel/generation. Render proof and client smoke must not
    output subscription URLs, tokens, credentials, private keys, raw YAML, raw
    config, or SQLite rows.

12. Close out.
    Update docs, project-state, Linear/GitHub status, and execution records with
    redacted evidence, validation result, rollback readiness, and any remaining
    blockers.

## Approval Packet Template

Use exact filled values in the real approval. Placeholders below are not
approval.

```text
批准执行 <provider/region/node> data-plane node onboarding Gate：
release=<candidate release or "no runtime switch">；
artifact=<verified local artifact path or "not applicable">；
archive_sha256=<sha256 or "not applicable">；
target_control_plane=<control-plane host only>；
target_data_plane_node=<reviewed node or new host only>；
registration_mode=<new_image_node | bind_existing_reviewed_node_only>；
channel_refs=<comma-separated approved channel refs>；
scope=read-only inventory first; protected backups; safe node fact ingestion or reviewed-node binding; protected material key/digest refs only; desired-state dry-run; controlled edge-agent apply; config-test; approved service restarts only; redacted receipts; render proof；
validation=health ok, public boundaries ok, internal routes private, node registry safe facts present, protected material key/digest presence ok, desired-state present, fresh applied receipts present, render proof receipt-gated, unrelated orders not affected, no sensitive output；
rollback=restore protected env/proxy config/control DB/subscription DB/runtime backups; restore previous service state; restart only affected approved services after config-test；
forbidden=DNS,Nginx config/reload,provider firewall unless separately approved,public Admin,payment,account/password generation,unapproved live order creation,subscription URL/token/password/private-key/credential output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git,unrelated service restart。
```

## Validation Checklist

| Gate | Required evidence | Stop condition |
| --- | --- | --- |
| Read-only inventory | Control-plane release, public boundaries, internal route privacy, data-plane service/listener state | Inventory cannot prove target identity or boundary |
| Image readiness | No-secret image baseline, first-boot helper, safe packet helper | Image contains protected material or customer data |
| Node safe facts | Provider, region, role, pool, lifecycle, channel refs, release refs | Raw host secret, private key, token, credential, or customer data present |
| Control-plane binding | One reviewed node bound to channel refs and lifecycle | Duplicate or ambiguous node identity |
| Protected material refs | Key names and digests only, no values | Missing key, missing digest, or digest mismatch |
| Desired-state | Scoped or aggregate generation recorded for target node/channels | Desired-state points at unreviewed node or wrong channel refs |
| Edge-agent dry-run | Redacted dry-run summary, no runtime mutation | Dry-run reports material, config, or schema failure |
| Runtime config-test | Xray/Hy2/TUIC or approved runtime tests pass before restart | Config-test fails |
| Listener checks | Expected protocol listeners active and private metrics loopback-only | Public control surface or missing listener |
| Applied receipts | Current-generation applied receipts match node/channel/order scope | Receipt stale, scoped-only when aggregate required, or nodeRef mismatch |
| Render gate | Subscription render includes node channels only after matching receipts | Render unlock without matching receipt |
| Client smoke | Client-facing smoke succeeds without outputting URL/token/YAML | Sensitive output required to prove success |
| Closeout | Docs/project-state/task tracker updated with redacted evidence | State docs conflict with code or live proof |

## Fail-Closed Rules

- No matching applied receipt means no subscription render for that node/channel.
- Missing protected material or digest mismatch stops material handoff.
- Runtime config-test failure stops restart and apply.
- Public Admin, public internal agent route, or public metrics exposure triggers
  rollback before further onboarding work.
- Scoped smoke receipts prove only the reviewed order scope. They do not unlock
  unrelated orders or aggregate full-channel rendering.
- Channel quality measurements may influence policy, but they do not by
  themselves delete an entitled regional node from selectable subscription
  output. Use a separate quality or lifecycle gate for that decision.

## Existing Reviewed Node Branch

Use this branch when the host already exists and has reviewed runtime anchors.

1. Verify service/listener state read-only.
2. Bind the existing reviewed node with `bind_existing_reviewed_node_only`.
3. Attach channel refs and safe facts.
4. Register protected material key/digest refs.
5. Run desired-state dry-run/apply and receipt-gated render proof.

This branch skips image creation and provider provisioning, but it does not skip
material, dry-run, apply, receipt, render, validation, or rollback gates.

## New Image Node Branch

Use this branch when deploying a new host from a reusable image.

1. Build or select a no-secret image per
   `docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md`.
2. Provision the host only under a separate exact Risk A provider approval.
3. Run first boot and produce safe node facts.
4. Register the node in the control plane.
5. Continue with material handoff, desired-state, apply, receipts, and render
   gate.

## Automation Boundary

Future CLI or agent automation should prepare packets, run dry-runs, validate
artifacts, and summarize approval gaps. It should not become a direct node
mutator without the same Risk A approval, backup, validation, and rollback
boundaries.

The control plane remains the source of intent and audit. The edge agent remains
the node-local apply and receipt surface.

## Related Documents

- `docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md`
- `docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md`
- `docs/CONTROL_DATA_PLANE_INTERCONNECT_CONTRACT.md`
- `docs/SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md`
- `docs/CONTROL_PLANE_NODE_REGISTRATION_CLOSEOUT.md`
- `docs/EDGE_CREDENTIAL_RECONCILIATION_GATEWAY_DESIGN.md`
- `docs/production-replacement-records/2026-06-14-production-node-image-factory-acceptance-matrix.md`
- `docs/production-replacement-records/2026-06-14-control-plane-node-registration-production-gate-package.md`
