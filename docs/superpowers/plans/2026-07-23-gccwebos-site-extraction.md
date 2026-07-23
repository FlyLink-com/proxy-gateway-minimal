# GCC WebOS Standalone Site Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a private, standalone `gaoyi1020-web/gccwebos-site` repository containing only the validated GCC WebOS company site, with independent tests, build verification, CI, and a Draft implementation PR.

**Architecture:** Extract the exact company-site component, scoped CSS, favicon, focused tests, and build verifier from the fixed monorepo source identity. Replace the test suite's Admin `App` dependency with direct `CompanySitePage` rendering, then supply a minimal Vite shell and GitHub Actions validation. This plan ends before any Vercel connection or deployment.

**Tech Stack:** React 19, TypeScript 5.8, Vite 8, Vitest 4, Testing Library, jsdom, lucide-react, GitHub CLI, PowerShell 7.

## Global Constraints

- Source repository: `gccwebos-com/proxy-gateway-minimal`.
- Source commit: `8115a81e750e05fb1ce7f5e30acd847c1f88ab97`.
- Source tree: `60c8562e5a7d378a0b021eccc2e30f1bbffcf910`.
- Target repository: private `gaoyi1020-web/gccwebos-site`.
- Target default branch: `master`.
- Implementation branch: `codex/import-gccwebos-site`.
- Preserve `/api/public/leads`, `https://portal.gccwebos.com/`, and `https://portal.gccwebos.com/portal/register/`.
- Do not migrate Portal, Admin, server, schemas, payment, Coins, order, attribution, settlement, or generated build output.
- Do not add a route framework, component system, animation library, tracking script, API contract, or runtime dependency beyond the listed stack.
- Keep all brand variables scoped inside `.company-site-shell`; the standalone base stylesheet contains resets only.
- Do not connect Vercel, create a deployment, modify DNS, or move aliases in this plan.
- Keep the implementation PR Draft until user review.

---

## File Map

| Path in target repository | Responsibility |
| --- | --- |
| `.github/workflows/validate.yml` | Run install, test, build, and public-build verification on PRs and `master`. |
| `public/favicon.svg` | Existing GCC WebOS favicon copied byte-for-byte. |
| `scripts/verify-public-site-build.mjs` | Fail closed if the build lacks public markers or exposes Admin/Portal/private markers. |
| `src/company-site-page.tsx` | Existing standalone company-site React surface and hash-based information pages. |
| `src/main.tsx` | React root and stylesheet imports. |
| `src/styles/tokens.css` | Root font rendering and color-scheme defaults only; no shared Design System. |
| `src/styles/base.css` | Minimal document reset needed by the public site. |
| `src/styles/public-site.css` | Existing `.company-site-shell` scoped visual, responsive, dark-mode, and reduced-motion rules. |
| `tests/company-site.test.tsx` | Eighteen focused company-site tests rendered without Admin `App`. |
| `.gitignore` | Ignore dependencies, build output, Vercel local link metadata, and test output. |
| `index.html` | Public metadata and Vite entrypoint. |
| `package.json` / `package-lock.json` | Minimal runtime/dev dependencies and stable validation commands. |
| `tsconfig.json` | Strict browser TypeScript configuration. |
| `vite.config.ts` | Vite React build, jsdom tests, and local preview port. |
| `vercel.json` | Static Vite build contract only; no domain or deployment mutation. |
| `README.md` | Scope, provenance, commands, runtime contracts, and production boundary. |

### Stable interfaces

```ts
export function CompanySitePage(): JSX.Element;
```

```text
npm test       -> vitest run
npm run build  -> tsc --noEmit && vite build
npm run verify -> node scripts/verify-public-site-build.mjs dist
```

---

### Task 1: Create the empty private repository boundary

**Files:**
- Create: GitHub repository `gaoyi1020-web/gccwebos-site`
- Create: local repository `C:\Users\g\.codex\worktrees\gccwebos-site`

**Interfaces:**
- Consumes: authenticated GitHub CLI access already available to the operator.
- Produces: private repository with empty `master` and working branch `codex/import-gccwebos-site`.

- [ ] **Step 1: Reconfirm the immutable source and clean target name**

Run:

```powershell
$sourceRepo = 'C:\Users\g\.codex\worktrees\bb17\proxy-gateway-minimal'
git -C $sourceRepo fetch origin master
$sourceCommit = '8115a81e750e05fb1ce7f5e30acd847c1f88ab97'
git -C $sourceRepo cat-file -e "$sourceCommit^{commit}"
git -C $sourceRepo show -s --format='%H%n%T' $sourceCommit
gh repo view gaoyi1020-web/gccwebos-site --json nameWithOwner,visibility 2>&1
```

Expected:

```text
8115a81e750e05fb1ce7f5e30acd847c1f88ab97
60c8562e5a7d378a0b021eccc2e30f1bbffcf910
GraphQL: Could not resolve to a Repository ...
```

`origin/master` may advance after this plan is written; that does not change the fixed migration input. Stop if the fixed commit is unavailable, its tree differs, or the target repository exists.

- [ ] **Step 2: Create the private GitHub repository**

Run:

```powershell
gh repo create gaoyi1020-web/gccwebos-site `
  --private `
  --description 'Public GCC WebOS company and marketing site'
```

Expected: GitHub reports `https://github.com/gaoyi1020-web/gccwebos-site`.

- [ ] **Step 3: Initialize an empty local `master`**

Run:

```powershell
$siteRepo = 'C:\Users\g\.codex\worktrees\gccwebos-site'
if (Test-Path -LiteralPath $siteRepo) {
  throw "target path already exists: $siteRepo"
}
New-Item -ItemType Directory -Path $siteRepo | Out-Null
git -C $siteRepo init -b master
git -C $siteRepo remote add origin https://github.com/gaoyi1020-web/gccwebos-site.git
git -C $siteRepo commit --allow-empty -m 'chore: initialize site repository'
git -C $siteRepo push -u origin master
git -C $siteRepo switch -c codex/import-gccwebos-site
```

Expected: `master` contains one empty initialization commit and the local checkout is on `codex/import-gccwebos-site`.

- [ ] **Step 4: Verify repository privacy and branch identity**

Run:

```powershell
gh repo view gaoyi1020-web/gccwebos-site `
  --json nameWithOwner,visibility,isPrivate,defaultBranchRef,url
git -C 'C:\Users\g\.codex\worktrees\gccwebos-site' status --short --branch
```

Expected:

```text
nameWithOwner = gaoyi1020-web/gccwebos-site
visibility = PRIVATE
isPrivate = true
defaultBranchRef.name = master
## codex/import-gccwebos-site
```

- [ ] **Step 5: Commit boundary**

No additional commit is required; the empty initialization commit is the reviewable default-branch anchor.

---

### Task 2: Establish the minimal toolchain and failing site tests

**Files:**
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\.gitignore`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\package.json`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\package-lock.json`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\tsconfig.json`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\vite.config.ts`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\tests\company-site.test.tsx`

**Interfaces:**
- Consumes: exact source test Git blob `01518b39ae2c4455ff57015fde0531784e6f95b6`.
- Produces: installed minimal dependencies and a RED test suite that imports `CompanySitePage` directly.

- [ ] **Step 1: Add the minimal package contract**

Create `package.json` with:

```json
{
  "name": "gccwebos-site",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "test": "vitest run",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1 --port 4174",
    "verify": "node scripts/verify-public-site-build.mjs dist"
  },
  "dependencies": {
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.8.0",
    "vite": "^8.0.16",
    "vitest": "^4.1.8"
  }
}
```

Create `.gitignore` with:

```gitignore
node_modules/
dist/
.vercel/
coverage/
test-results/
playwright-report/
*.log
```

- [ ] **Step 2: Add strict TypeScript and Vite test configuration**

Create `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "tests"]
}
```

Create `vite.config.ts` with:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    host: "127.0.0.1",
    port: 4174
  },
  test: {
    environment: "jsdom"
  }
});
```

- [ ] **Step 3: Copy the focused test and remove the Admin `App` dependency**

Mechanically extract the exact test from the fixed source commit:

```powershell
$sourceRepo = 'C:\Users\g\.codex\worktrees\bb17\proxy-gateway-minimal'
$siteRepo = 'C:\Users\g\.codex\worktrees\gccwebos-site'
$sourceCommit = '8115a81e750e05fb1ce7f5e30acd847c1f88ab97'
$extractRoot = 'C:\Users\g\.codex\worktrees\gccwebos-site-extract-tests'
$archivePath = 'C:\Users\g\.codex\worktrees\gccwebos-site-extract-tests.tar'
if ((Test-Path -LiteralPath $extractRoot) -or (Test-Path -LiteralPath $archivePath)) {
  throw 'exact extraction staging path already exists'
}
New-Item -ItemType Directory -Path $extractRoot | Out-Null
git -C $sourceRepo archive `
  --format=tar `
  --output=$archivePath `
  $sourceCommit `
  admin/src/test/company-site.test.tsx
tar -xf $archivePath -C $extractRoot
New-Item -ItemType Directory -Path (Join-Path $siteRepo 'tests') | Out-Null
Copy-Item `
  -LiteralPath (Join-Path $extractRoot 'admin/src/test/company-site.test.tsx') `
  -Destination (Join-Path $siteRepo 'tests/company-site.test.tsx')
$sourceBlob = git -C $sourceRepo rev-parse "$sourceCommit`:admin/src/test/company-site.test.tsx"
$targetBlob = git -C $siteRepo hash-object tests/company-site.test.tsx
if ($sourceBlob -ne $targetBlob) {
  throw 'company-site test blob mismatch'
}
```

Expected Git blob: `01518b39ae2c4455ff57015fde0531784e6f95b6`.

Then apply these changes:

```diff
-import { App } from "../App";
+import { CompanySitePage } from "../src/company-site-page";
```

Replace all sixteen occurrences:

```diff
-render(createElement(App))
+render(createElement(CompanySitePage))
```

Do not change assertions, copy, URLs, endpoint expectations, or CSS selectors.

- [ ] **Step 4: Install dependencies and generate the lockfile**

Run:

```powershell
npm install
```

Expected: `package-lock.json` is created and installation exits `0`.

- [ ] **Step 5: Run the test to prove the standalone implementation is missing**

Run:

```powershell
npm test -- tests/company-site.test.tsx
```

Expected: FAIL because `../src/company-site-page` does not exist. A passing result is a stop condition because it means the test is not exercising the intended boundary.

- [ ] **Step 6: Commit the RED contract**

Run:

```powershell
git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts tests/company-site.test.tsx
git diff --cached --check
git commit -m 'test: define standalone company site boundary'
```

Expected: one commit containing only toolchain and the intentionally failing direct-render test.

---

### Task 3: Add the exact company-site implementation and scoped styles

**Files:**
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\src\company-site-page.tsx`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\src\main.tsx`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\src\styles\tokens.css`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\src\styles\base.css`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\src\styles\public-site.css`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\public\favicon.svg`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\index.html`

**Interfaces:**
- Consumes:
  - component Git blob `35bd838f1bf8fbff545423c02d23d23f399c0df7`
  - public CSS Git blob `c480bb3414d6d719854bf78f671660d4dfc78575`
  - favicon Git blob `99e51a1178dbfde0bd18dfaf942458db3398444d`
- Produces: renderable standalone site preserving all existing runtime contracts.

- [ ] **Step 1: Extract and verify the three exact source assets**

Extract byte-for-byte from the source commit:

```powershell
$sourceRepo = 'C:\Users\g\.codex\worktrees\bb17\proxy-gateway-minimal'
$siteRepo = 'C:\Users\g\.codex\worktrees\gccwebos-site'
$sourceCommit = '8115a81e750e05fb1ce7f5e30acd847c1f88ab97'
$extractRoot = 'C:\Users\g\.codex\worktrees\gccwebos-site-extract-source'
$archivePath = 'C:\Users\g\.codex\worktrees\gccwebos-site-extract-source.tar'
if ((Test-Path -LiteralPath $extractRoot) -or (Test-Path -LiteralPath $archivePath)) {
  throw 'exact extraction staging path already exists'
}
New-Item -ItemType Directory -Path $extractRoot | Out-Null
git -C $sourceRepo archive `
  --format=tar `
  --output=$archivePath `
  $sourceCommit `
  admin/src/features/company-site/company-site-page.tsx `
  admin/src/styles/public-site.css `
  admin/public/favicon.svg
tar -xf $archivePath -C $extractRoot
New-Item -ItemType Directory -Path (Join-Path $siteRepo 'src/styles') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $siteRepo 'public') -Force | Out-Null
Copy-Item `
  -LiteralPath (Join-Path $extractRoot 'admin/src/features/company-site/company-site-page.tsx') `
  -Destination (Join-Path $siteRepo 'src/company-site-page.tsx')
Copy-Item `
  -LiteralPath (Join-Path $extractRoot 'admin/src/styles/public-site.css') `
  -Destination (Join-Path $siteRepo 'src/styles/public-site.css')
Copy-Item `
  -LiteralPath (Join-Path $extractRoot 'admin/public/favicon.svg') `
  -Destination (Join-Path $siteRepo 'public/favicon.svg')
```

Run:

```powershell
$pairs = @(
  @('admin/src/features/company-site/company-site-page.tsx', 'src/company-site-page.tsx'),
  @('admin/src/styles/public-site.css', 'src/styles/public-site.css'),
  @('admin/public/favicon.svg', 'public/favicon.svg')
)
foreach ($pair in $pairs) {
  $sourceBlob = git -C $sourceRepo rev-parse "$sourceCommit`:$($pair[0])"
  $targetBlob = git -C $siteRepo hash-object $pair[1]
  if ($sourceBlob -ne $targetBlob) {
    throw "source blob mismatch: $($pair[1])"
  }
}
```

Expected: the three Git blobs match the values in the Interfaces block. Git blob identity avoids false drift from Windows checkout line-ending conversion.

- [ ] **Step 2: Add the minimal root and stylesheet imports**

Create `src/main.tsx` with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CompanySitePage } from "./company-site-page";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/public-site.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CompanySitePage />
  </StrictMode>
);
```

Create `src/styles/tokens.css` with:

```css
:root {
  color-scheme: light dark;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  text-rendering: geometricPrecision;
}
```

Create `src/styles/base.css` with:

```css
* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

button,
input,
select,
textarea {
  font: inherit;
}
```

- [ ] **Step 3: Add the public HTML shell**

Create `index.html` with:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta
      name="description"
      content="GCC WebOS 通过多元网络服务，帮助个人、团队与合作伙伴连接更多信息、服务与观点。"
    />
    <title>GCC WebOS - 连接世界，从简单开始</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Run the focused tests**

Run:

```powershell
npm test -- tests/company-site.test.tsx
```

Expected:

```text
Test Files  1 passed
Tests       18 passed
```

- [ ] **Step 5: Prove the repository has no private application imports**

Run:

```powershell
rg -n "Admin|UserPortalPage|portal-main|/api/admin|server/|schemas/" src tests
rg -n "from ['\"].*(App|portal|admin)" src tests
```

Expected: no matches except assertions that explicitly forbid private markers.

- [ ] **Step 6: Commit the standalone site**

Run:

```powershell
git add src public index.html
git diff --cached --check
git commit -m 'feat: add standalone GCC WebOS company site'
```

---

### Task 4: Add the build boundary and Vercel-neutral configuration

**Files:**
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\scripts\verify-public-site-build.mjs`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\vercel.json`

**Interfaces:**
- Consumes: source verifier Git blob `8ba3f54aa4b1c3e823a8cdc79798441fb0771528`.
- Produces: `dist/` build that is independently checked for public markers and forbidden private markers.

- [ ] **Step 1: Copy the exact build verifier**

Copy byte-for-byte from the fixed commit:

```powershell
$sourceRepo = 'C:\Users\g\.codex\worktrees\bb17\proxy-gateway-minimal'
$siteRepo = 'C:\Users\g\.codex\worktrees\gccwebos-site'
$sourceCommit = '8115a81e750e05fb1ce7f5e30acd847c1f88ab97'
$extractRoot = 'C:\Users\g\.codex\worktrees\gccwebos-site-extract-verifier'
$archivePath = 'C:\Users\g\.codex\worktrees\gccwebos-site-extract-verifier.tar'
if ((Test-Path -LiteralPath $extractRoot) -or (Test-Path -LiteralPath $archivePath)) {
  throw 'exact extraction staging path already exists'
}
New-Item -ItemType Directory -Path $extractRoot | Out-Null
git -C $sourceRepo archive `
  --format=tar `
  --output=$archivePath `
  $sourceCommit `
  scripts/verify-public-site-build.mjs
tar -xf $archivePath -C $extractRoot
New-Item -ItemType Directory -Path (Join-Path $siteRepo 'scripts') | Out-Null
Copy-Item `
  -LiteralPath (Join-Path $extractRoot 'scripts/verify-public-site-build.mjs') `
  -Destination (Join-Path $siteRepo 'scripts/verify-public-site-build.mjs')
```

The package script passes `dist`, so the verifier's legacy default path is not used.

Run:

```powershell
$sourceBlob = git -C $sourceRepo rev-parse "$sourceCommit`:scripts/verify-public-site-build.mjs"
$targetBlob = git -C $siteRepo hash-object scripts/verify-public-site-build.mjs
if ($sourceBlob -ne $targetBlob) {
  throw 'public-site verifier blob mismatch'
}
```

Expected: `8ba3f54aa4b1c3e823a8cdc79798441fb0771528`.

- [ ] **Step 2: Add the static Vite build declaration**

Create `vercel.json` with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "installCommand": "npm ci",
  "buildCommand": "npm run build && npm run verify",
  "outputDirectory": "dist"
}
```

Do not add domains, aliases, deployment targets, rewrites, redirects, functions, or environment values.

- [ ] **Step 3: Run build and verifier**

Run:

```powershell
npm run build
npm run verify
```

Expected:

```text
vite ... built
public site build boundary ok: ...\dist
```

- [ ] **Step 4: Confirm generated output is untracked**

Run:

```powershell
git status --short
git check-ignore -v dist/index.html
```

Expected: `dist/` is ignored and no generated file appears in the commit.

- [ ] **Step 5: Commit the build boundary**

Run:

```powershell
git add scripts/verify-public-site-build.mjs vercel.json
git diff --cached --check
git commit -m 'build: verify standalone public site output'
```

---

### Task 5: Add CI and provenance documentation

**Files:**
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\.github\workflows\validate.yml`
- Create: `C:\Users\g\.codex\worktrees\gccwebos-site\README.md`

**Interfaces:**
- Consumes: stable npm commands from Task 2 and source identity from Global Constraints.
- Produces: exact-head GitHub validation and an auditable repository boundary.

- [ ] **Step 1: Add the always-run validation workflow**

Create `.github/workflows/validate.yml` with:

```yaml
name: Validate

on:
  pull_request:
  push:
    branches:
      - master

permissions:
  contents: read

concurrency:
  group: validate-${{ github.ref }}
  cancel-in-progress: true

jobs:
  site:
    name: Test and build company site
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install
        run: npm ci

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

      - name: Verify public boundary
        run: npm run verify
```

- [ ] **Step 2: Add the repository README**

Create `README.md` with:

```markdown
# GCC WebOS Site

Public company and marketing site for GCC WebOS.

## Scope

This repository contains only the public company site. Portal, Admin, backend,
payments, Coins, orders, attribution, settlement, and production operations
remain outside this repository.

## Provenance

- Source repository: `gccwebos-com/proxy-gateway-minimal`
- Source commit: `8115a81e750e05fb1ce7f5e30acd847c1f88ab97`
- Source tree: `60c8562e5a7d378a0b021eccc2e30f1bbffcf910`
- Source PR: `gccwebos-com/proxy-gateway-minimal#528`

The original source remains a read-only rollback reference until a later,
independently reviewed cleanup.

## Commands

```text
npm test
npm run build
npm run verify
npm run dev
npm run preview
```

## Runtime boundaries

- Public lead submissions retain the existing `/api/public/leads` contract.
- Registration and sign-in continue in the existing GCC WebOS Portal.
- A successful build or preview is not evidence of production deployment.
```

- [ ] **Step 3: Run the complete local validation**

Run:

```powershell
npm test
npm run build
npm run verify
git diff --check master...HEAD
```

Expected:

```text
Tests       18 passed
build exits 0
public site build boundary ok
git diff --check emits no output
```

- [ ] **Step 4: Commit CI and provenance**

Run:

```powershell
git add .github/workflows/validate.yml README.md
git diff --cached --check
git commit -m 'ci: validate standalone company site'
```

---

### Task 6: Perform local visual and accessibility QA

**Files:**
- Inspect only: `C:\Users\g\.codex\worktrees\gccwebos-site\src\company-site-page.tsx`
- Inspect only: `C:\Users\g\.codex\worktrees\gccwebos-site\src\styles\public-site.css`
- Inspect only: local preview at `http://127.0.0.1:4174/`

**Interfaces:**
- Consumes: passing Task 5 build.
- Produces: QA evidence without source mutation or production claims.

- [ ] **Step 1: Start the bounded local preview**

Run in a background terminal:

```powershell
npm run preview
```

Expected: Vite listens only on `127.0.0.1:4174`.

- [ ] **Step 2: Inspect the desktop experience**

Use a `1440 × 900` viewport and verify:

```text
Hero copy and two CTAs are centered.
Brand Environment is atmospheric and does not block text.
Navigation, products, plans, guide, support, contact, FAQ, and footer are reachable.
No Admin or Portal application UI appears.
```

In the browser console evaluate:

```js
({
  viewport: window.innerWidth,
  documentWidth: document.documentElement.scrollWidth,
  overflow: document.documentElement.scrollWidth > window.innerWidth
})
```

Expected: `overflow` is `false`.

- [ ] **Step 3: Inspect the mobile experience**

Use a `390 × 844` viewport and verify:

```text
The top concept stage is horizontally scrollable.
The lower product story scrolls vertically.
No start chooser card appears.
Get Started and Sign In remain directly accessible in the mobile menu.
Plans, contact form, FAQ, and footer have no horizontal overflow.
```

Evaluate the same width expression. Expected: document-level `overflow` is `false`.

- [ ] **Step 4: Inspect dark mode and reduced motion**

Emulate `prefers-color-scheme: dark` and verify readable text, focus outlines, controls, and form status.

Emulate `prefers-reduced-motion: reduce` and evaluate:

```js
getComputedStyle(document.querySelector(".company-site-brand-environment-state")).animationDuration
```

Expected: the reduced-motion rules suppress continuous motion or reduce the duration to an effectively immediate value.

- [ ] **Step 5: Record QA without committing screenshots**

Add the following safe summary to the Draft PR body:

```text
Local visual QA:
- Desktop 1440x900: pass
- Mobile 390x844: pass
- Dark mode: pass
- Reduced motion: pass
- Document-level horizontal overflow: none
```

If any item fails, keep the PR Draft and return to the smallest owning task with a new failing test before changing source.

---

### Task 7: Publish one Draft implementation PR

**Files:**
- No new files.
- External state: branch and Draft PR in `gaoyi1020-web/gccwebos-site`.

**Interfaces:**
- Consumes: all local validation and visual QA evidence.
- Produces: one reviewable Draft PR; no Vercel or production state.

- [ ] **Step 1: Confirm the exact changed surface**

Run:

```powershell
git status --short --branch
git diff --name-status master...HEAD
git log --oneline master..HEAD
git diff --check master...HEAD
```

Expected: only files listed in the File Map are changed; worktree is clean; diff check passes.

- [ ] **Step 2: Push once**

Run:

```powershell
git push -u origin codex/import-gccwebos-site
```

- [ ] **Step 3: Create the Draft PR**

Run:

```powershell
$prBody = @'
Intent: establish the private standalone company-site repository from the fixed monorepo source identity.

Scope: public React surface, scoped CSS, favicon, focused tests, build verifier, CI, Vite/Vercel build declarations, and provenance.

Non-goals: Portal, Admin, backend, payment, Coins, orders, attribution, settlement, Vercel connection, deployment, DNS, aliases, or production.

Validation:
- npm test: 18 passed
- npm run build: passed
- npm run verify: passed
- git diff --check master...HEAD: passed
- desktop/mobile/dark/reduced-motion QA: passed

Source:
- commit 8115a81e750e05fb1ce7f5e30acd847c1f88ab97
- tree 60c8562e5a7d378a0b021eccc2e30f1bbffcf910

This PR remains Draft and does not claim deployment.
'@
gh pr create `
  --repo gaoyi1020-web/gccwebos-site `
  --base master `
  --head codex/import-gccwebos-site `
  --draft `
  --title 'feat: extract standalone GCC WebOS company site' `
  --body $prBody
```

- [ ] **Step 4: Bind CI to the exact head**

Run:

```powershell
$head = git rev-parse HEAD
gh pr view --repo gaoyi1020-web/gccwebos-site --json headRefOid,isDraft,state,url
gh pr checks --repo gaoyi1020-web/gccwebos-site --watch
```

Expected: `headRefOid` equals `$head`, `isDraft` is `true`, and `Validate / Test and build company site` succeeds.

- [ ] **Step 5: Stop at review**

Report the branch, exact head, Draft PR URL, changed files, local/CI results, visual QA, and the explicit statement:

```text
No Vercel project, deployment, DNS, custom domain, alias, Portal, Admin, or backend state changed.
```

Do not mark Ready or merge under this plan.
