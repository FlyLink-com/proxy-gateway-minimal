# SGP New-Order Handoff Consumption Repair

Date: 2026-06-10, Asia/Shanghai.

Risk tier: A production control-plane and data-plane repair.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, or customer
data.

## Reason

After SGP Gate 3 data-plane apply completed, a later live order created fresh
SGP `edgeCredentialRef` rows and fresh SGP handoff files.

The order could reach `delivered` state in the Japan control plane, but the
Singapore runtimes had not consumed the new handoff material yet. As a result,
the subscription bundle could include SGP channel names while the client saw
SGP channels time out.

This confirms a design gap:

```text
credential rows and handoff files existed
but SGP runtime apply was not automatic
```

## Scope Executed

Executed on the Japan control plane:

- backed up the relevant protected handoff metadata and current control-plane
  state before repair;
- selected the latest protected SGP handoff items for the affected order;
- verified protected material coverage by ref and digest only;
- transferred the protected handoff subset to the Singapore data-plane apply
  path;
- archived the top-level pending SGP handoff files after successful apply;
- verified the latest order status and SGP row coverage without dumping SQLite
  rows.

Executed on the Singapore data plane:

- backed up protected runtime configs before apply;
- applied the selected SGP handoff subset through the existing protected
  runtime adapters;
- config-tested and restarted only the approved SGP runtime services;
- verified service state, listener presence, loopback-only stats, and material
  runtime match by redacted refs.

Not executed:

- no DNS, Nginx, provider firewall, payment, account/password, or live-order
  mutation beyond the already-created order under investigation;
- no public Admin exposure;
- no subscription URL, token, password, private key, raw environment, raw
  config, raw log, SQLite row, or customer-data output.

## Validation

Redacted order/runtime validation:

- top-level SGP handoff files after repair: `0`;
- latest order status: `delivered`;
- latest order SGP credential rows: `3`;
- SGP runtime material match:
  - `channel-sgp-a-vless-reality-tcp`: true;
  - `channel-sgp-a-hy2`: true;
  - `channel-sgp-a-tuic`: true.

Singapore service and listener validation:

- `xray-vless-reality.service`: active;
- `hysteria2.service`: active;
- `mihomo-tuic.service`: active;
- TCP 8443 listener: present;
- UDP 10443 listener: present;
- UDP 443 listener: present;
- traffic stats listener: loopback-only.

Public boundary validation:

- portal: HTTP 200;
- health: HTTP 200;
- public Admin route: HTTP 404;
- no-session portal API: HTTP 401.

## Result

The immediate SGP handoff backlog for the latest order was repaired. The
affected SGP runtime material now matches the latest order's SGP credential
refs, and the protected top-level SGP handoff queue was reduced to zero.

This repair does not close the architecture gap. Manual handoff consumption is
not a durable production model. The next design direction is documented in
`docs/EDGE_AGENT_PULL_APPLY_RECEIPT_ARCHITECTURE.md`: data-plane nodes should
pull node-scoped desired state, apply locally, and return redacted receipts
before remote channels are treated as normally renderable.

## Follow-Up

Next repo-only work:

- add desired-state and receipt contracts;
- add render fail-closed tests for missing remote receipts;
- add an SGP agent dry-run path;
- keep production activation behind a separate Risk A gate.
