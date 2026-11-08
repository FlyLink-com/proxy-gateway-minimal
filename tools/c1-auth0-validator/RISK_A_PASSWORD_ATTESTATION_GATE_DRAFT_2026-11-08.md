# Risk A Proof-Window Contract — Canonical Reference

This file is a cross-reference only. It is intentionally not a second implementation or a competing policy document.

## Canonical contract

The canonical synthetic Risk A proof-window contract and its tests are maintained on:

- Branch: `feat/c1-risk-a-proof-window-contract-20261108`
- Source contract: [D1 T2-C1 Risk A Login Proof-Window Contract v1](https://github.com/FlyLink-com/proxy-gateway-minimal/blob/feat/c1-risk-a-proof-window-contract-20261108/docs/D1_T2_C1_RISK_A_LOGIN_PROOF_WINDOW_CONTRACT_V1.md)
- Owner decision proposal: [D1 T2-C1 Risk A Login Proof-Window Owner Decision Proposal v1](https://github.com/FlyLink-com/proxy-gateway-minimal/blob/docs/t2-c1-a04-c2-wallet-digest-decisions-20261108/docs/D1_T2_C1_RISK_A_OWNER_DECISION_PROPOSAL_V1.md)
- Related child Draft PR: [#845](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/845)

The owner proposal recommends a bounded 30-calendar-day window, four-field-only records, first-observation-wins, per-account deletion on final disposition, and a hard purge deadline within seven days after the window closes. These are **recommended defaults only**; C1-A04 remains OPEN until the project owner explicitly accepts or amends them.

## Scope of this Auth0 validator PR

PR #844 covers the local Auth0 import/credential compatibility validator. It does not duplicate the Risk A production hook, persistence adapter, purge job, or owner-decision record.

## Production boundary

No production login hook, BWH table/column, observation persistence, notification, reset campaign, Auth0 tenant, real credential import, Worker/DO deployment, D1 mutation, or cutover is authorized by this cross-reference. BWH remains the production control-data authority.
