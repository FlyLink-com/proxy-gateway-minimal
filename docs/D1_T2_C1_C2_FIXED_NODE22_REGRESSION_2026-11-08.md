# D1 T2 C1/C2 fixed Node 22.23.1 regression evidence — 2026-11-08

> Status: PASS for the bounded synthetic source slice only. This is not formal C1/C2 acceptance, full T2 acceptance, hosted CI evidence, or proof of a real Auth0 provider integration.
> Repository: FlyLink-com/proxy-gateway-minimal
> T1 source branch: fix/t2-c1-c2-t1-reenroll-only-20261108
> Exact source HEAD tested: c6a70b3f216d68c6ee7014af268645e1f9df5925
> PR #843: OPEN / DRAFT; base fix/t2-c1-c2-source-hardening-20261108 at bc3f8c9a; exact source head at test time c6a70b3f.

## 1. Environment and isolation

- Runtime: Node v22.23.1 (exact binary installed from npm package node@22.23.1 and version-checked before execution).
- OS: Linux x86_64, Vercel non-production sandbox, 2 vCPU / 4 GiB RAM.
- Network: custom allowlist limited to npm registry for the Node runtime and PyPI/file-hosted Python packages for the synthetic validator's bcrypt dependency. No Auth0, Cloudflare, BWH, or production endpoints were accessed.
- The five tests import only the four selected repository modules and Node built-ins; no project-wide npm install or full repository test command was used.

## 2. T1 repository source-slice regression

Command:
`node --test --test-reporter=tap server/tests/d1-t2-security-primitives.test.mjs server/tests/d1-t2-identity-boundary.test.mjs server/tests/platform-portal-identity-import-rehearsal.test.mjs server/tests/platform-portal-totp-verifier.test.mjs server/tests/d1-t2-security-vectors.test.mjs`

| Test file | Result |
|---|---:|
| d1-t2-security-primitives.test.mjs | 18/18 PASS |
| d1-t2-identity-boundary.test.mjs | 10/10 PASS |
| platform-portal-identity-import-rehearsal.test.mjs | 16/16 PASS |
| platform-portal-totp-verifier.test.mjs | 4/4 PASS |
| d1-t2-security-vectors.test.mjs | 14/14 PASS |
| Total | 62/62 PASS |

- Combined run 1: 62 tests, 62 pass, 0 fail, 0 skipped; duration 1,010.914 ms; TAP SHA-256 8e467a8807cc3dd5c34b2ea7a02a1f99d6947101d326ea650dfa84aedc2b54be.
- Combined run 2: 62 tests, 62 pass, 0 fail, 0 skipped; duration 923.411 ms; TAP SHA-256 43e852e42bb8bb5fa810e175ad6b0c1e804201f07913d385b4bf075fdd816811.
- Per-file counts SHA-256: d6042400cf38cc811ca56b070d188abcf55cab1568bd3df64c465b3b10b47642.
- Syntax check: node --check passed for all four service modules and all five test files (9/9).
- First/second run summaries and source SHA-256 inventory are pinned below.

## 3. Exact source file inventory

The Git Blob SHA identifies the exact repository file fetched from the tested source head; SHA-256 identifies the UTF-8 file bytes transferred into the isolated sandbox.

| Path | Git Blob SHA | File SHA-256 |
|---|---|---|
| server/services/platform/d1-t2-security-primitives.mjs | 77e80f9cf962cfec01fbee73068ac038c83213af | b0b1672d6a98a5697882164a73eed246557184aa3d7ca52e55636ea0af0c37e6 |
| server/services/platform/d1-t2-identity-boundary.mjs | 8bc20e01395dd0c0a8b28824e1973b6b3e5bc70b | 424c0bd4d11f4196c3c1595ae84096003afb5721184866c7d0b188dea3aeec79 |
| server/services/platform/portal-identity-import-rehearsal.mjs | 3f9f3136f1a398d54b8657fab04a0aa4efe0dea4 | 9b532a09e404af6b152e7a2fc90f27ed5d7c4d3d6d0b8ffda70a6e07d176fcf6 |
| server/services/platform/portal-totp-verifier.mjs | f093ed7693e829bb40d93e15f0dce09ca689ce60 | 1d8dbaff21aedeb6a05ea347e03453403633c34c21f2071e0edf3f76b13ce274 |
| server/tests/d1-t2-security-primitives.test.mjs | ce260efbd397df23d71d20faec3e2513869c29ec | e0d9e898fecfa1c3bf22c927c9f95e0d20eb8cd7b4700d65104e6ad34094f32a |
| server/tests/d1-t2-identity-boundary.test.mjs | ac19b608c45efbee9d4bee354b72bbd03cf616d3 | 5fd231ecfd4be5a3301018ef0820e9b2b967a28e4e4d399a61cb5c338c2f6a81 |
| server/tests/platform-portal-identity-import-rehearsal.test.mjs | 2b4541f82e8db4ba5149dc517da4fca9f6ad2647 | fb0f383adf5c849fe4ebe533cfa204036fca0880bfb926fe296bbf2d256a8873 |
| server/tests/platform-portal-totp-verifier.test.mjs | acf1ef1104a2b3fc2ffcc30f0cc5de75438686af | 5133eac4227fa00ec7367d80f0a5d3df68cc85e0506f3416cdb375325a6206b9 |
| server/tests/d1-t2-security-vectors.test.mjs | a20a49c77255d3b10a1c8ebff742f9aca4804765 | fa0b78d03e6676fa63bf1bc31261b39ef8cbaf9af1d0acd753f2215f4408f574 |

## 4. Separate synthetic Auth0 validator package — PR #844

- Exact PR head tested: 9dac357b0cd25bb676ce9a278bc2a882509e8309, based on T1 source head c6a70b3f.
- Python: 3.9.25; pyca/bcrypt 5.0.0 installed into the ignored local vendor directory only (not committed).
- Node: v22.23.1.
- Four test files: Scrypt import validator 10/10; login attestation 9/9; tenant isolation 8/8; Step 6 S0–S9 end-to-end 10/10; total 37/37.
- Two combined runs both passed 37/37, 0 failures, 0 skipped. Run 1 TAP SHA-256: a27961e8f15016ee403a6963b9aa4973d986d4404565a3bd5ec18cdb6156811c. Run 2 TAP SHA-256: 95566da7f967f8affe2ae2a3b547137b9d5162a0d6062d11f66570e24320eb45.
- All validator .mjs files passed node --check.
- The validator uses a local mock Auth0 implementation and synthetic identities. It does not connect to Auth0, verify a real Auth0 JWKS endpoint, create a tenant, or import real users.

## 5. Scope limits and non-claims

- No full repository npm test was run at c6a70b3f.
- No GitHub Actions / hosted CI was triggered; no CI PASS is claimed.
- The previous full-suite comparative result remains bound to bc3f8c9a and is not reclassified.
- These tests do not implement or prove real OIDC/JWKS signature verification, real Auth0 tenant behavior, real MFA UX/API, production proof-window hooks, key custody/escrow, or historical Wallet-first digest compatibility.
- No BWH connection, production data read/export, production key creation, remote D1 mutation, Worker/DO deployment, merge, or writer-authority switch occurred.
- BWH remains the only production control-data writer; C1/C2 remain OPEN and T2 remains BLOCKED.
