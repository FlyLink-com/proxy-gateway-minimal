# Superpowers Archive Index

Last updated: 2026-05-24, Asia/Shanghai.

This directory stores historical design and implementation artifacts produced
during earlier planning work. These files are useful for background and
decision archaeology, but they are not the default operational source of truth
unless a current document explicitly references them.

Use the current documentation index first:

```text
docs/README.md
```

## Sections

| Directory | Purpose | Status | When to read |
| --- | --- | --- | --- |
| `docs/superpowers/specs/` | Historical design specs and decision notes. | Archived design artifacts. | Read for background on why a feature or ops path was designed. |
| `docs/superpowers/plans/` | Historical implementation plans. | Archived implementation artifacts. | Read for background on how prior work was intended to be implemented. |

## Source-Of-Truth Rule

Current operational truth lives in active docs such as:

- `docs/PROJECT_CONTEXT.md`
- `docs/README.md`
- active runbooks listed in `docs/README.md`
- current code and tests

Historical specs and plans should not override current code, active runbooks,
execution records, or `docs/PROJECT_CONTEXT.md`.

## Safety

Do not copy secrets, tokens, subscription URLs, SQLite data, AWS credentials, or
customer data into archive notes.
