# Admin Console Navigation IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Admin navigation into an extensible operator console shell while keeping only real, supported pages visible today.

**Architecture:** Keep the existing React navigation module as the source of truth. Add console IA metadata for active and planned sections, derive visible navigation from active sections only, and document the section entry gate for future pages.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, markdown docs.

---

### Task 1: Lock Console IA Metadata

**Files:**
- Modify: `admin/src/app/navigation.ts`
- Test: `admin/src/test/navigation.test.ts`

- [x] **Step 1: Write the failing test**

Add assertions that `consoleSections` includes the current active sections plus future planned slots: `审计与工单`, `平台开发`, and `系统设置`. Assert planned sections do not appear in `navSections` or `navItems`.

- [x] **Step 2: Run test to verify it fails**

Run: `npm --prefix admin test -- navigation.test.ts`

Expected: FAIL because `consoleSections` is not exported yet.

- [x] **Step 3: Implement minimal navigation metadata**

Add `consoleSections` with `status: "active" | "planned"` and derive `navSections` from active sections only.

- [x] **Step 4: Run targeted test**

Run: `npm --prefix admin test -- navigation.test.ts`

Expected: PASS.

### Task 2: Update Shell Copy

**Files:**
- Modify: `admin/src/components/layout/app-sidebar.tsx`
- Test: `admin/src/test/navigation.test.ts`

- [x] **Step 1: Write the failing test**

Assert the sidebar describes GlobalCircle AI as an operator/platform console, not only an operations management panel.

- [x] **Step 2: Run test to verify it fails**

Run: `npm --prefix admin test -- navigation.test.ts`

Expected: FAIL on old sidebar subtitle.

- [x] **Step 3: Update the sidebar subtitle**

Change the subtitle to concise operator-console language.

- [x] **Step 4: Run targeted test**

Run: `npm --prefix admin test -- navigation.test.ts`

Expected: PASS.

### Task 3: Document Navigation Entry Gate

**Files:**
- Create: `docs/ADMIN_CONSOLE_NAVIGATION_IA.md`
- Modify: `docs/README.md`

- [x] **Step 1: Add the IA decision document**

Document the active sections, planned sections, entry gate, phase mapping, and non-goals.

- [x] **Step 2: Link the document from the docs index**

Add the document to `docs/README.md` in the current-state or Admin/UI area.

### Task 4: Validate And Publish Evidence

**Files:**
- No code edits.

- [x] **Step 1: Run targeted Admin tests**

Run: `npm run admin:test`

- [x] **Step 2: Run Admin build**

Run: `npm run admin:build`

- [x] **Step 3: Run full repo tests**

Run: `npm test`

- [x] **Step 4: Run diff check**

Run: `git diff --check origin/master...HEAD`

- [x] **Step 5: Browser QA**

Open local Admin UI and confirm the visible navigation has no empty placeholder sections and the console shell copy is visible.
