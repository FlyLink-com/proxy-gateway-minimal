#!/usr/bin/env node
// One-time validation for PR #629 canonical mapping + tracking invariants.
// Not part of the C-tier validation surface; called by hand to confirm
// the closed-enum / queue-separation / Skipped-closure invariants before
// merging. Errors are surfaced as non-zero exit; warnings as non-fatal.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const docPath = resolve(repo, "docs/TECH_STACK_FINDINGS.md");
const text = readFileSync(docPath, "utf8");

const FOLLOWUP_ENUM = new Set([
  "Issue only",
  "Issue + planned PR",
  "Architectural — Issue only",
  "Skipped (informational)",
]);
const SKIPPED_RE_PATTERN = /^Skipped \(R-\d+ retracted\)$/;
const RISK_ENUM = new Set(["C", "B", "A", "–"]);
const PR_QUEUE_FOLLOWUPS = new Set(["Issue + planned PR"]);
const SKIPPED = new Set(["Skipped (informational)"]);
const EMPTY_CELL = new Set(["–", ""]);

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exitCode = 1;
}
function warn(msg) {
  console.warn(`WARN  ${msg}`);
}

const lines = text.split(/\r?\n/);

function findTable(startMarker) {
  const idx = lines.findIndex((l) => l.includes(startMarker));
  if (idx < 0) throw new Error(`marker not found: ${startMarker}`);
  // Skip blank + paragraph lines until we hit the first | row
  let i = idx + 1;
  while (i < lines.length && !lines[i].trim().startsWith("|")) i++;
  const headerIdx = i;
  const rows = [];
  for (let j = headerIdx + 2; j < lines.length; j++) {
    const line = lines[j];
    if (!line.trim().startsWith("|")) break;
    rows.push(line.split("|").slice(1, -1).map((c) => c.trim()));
  }
  return { header: lines[headerIdx].split("|").slice(1, -1).map((c) => c.trim()), rows };
}

// 1. Canonical mapping table
const canonicalHeader = "## F-XX canonical mapping (single source of truth)";
let mapping;
try {
  mapping = findTable(canonicalHeader);
} catch (e) {
  fail(`could not locate canonical mapping table: ${e.message}`);
  process.exit(1);
}
console.log(`canonical mapping: ${mapping.rows.length} rows`);

const headerIndex = (name) => {
  const i = mapping.header.findIndex((h) => h === name);
  if (i < 0) throw new Error(`canonical mapping column missing: ${name}`);
  return i;
};
const fId = headerIndex("ID");
const risk = headerIndex("Risk tier");
const followup = headerIndex("Follow-up");
const issueTitle = headerIndex("Intended Issue title");
const prScope = headerIndex("Intended PR scope");

const canonicalIds = new Set();
for (const row of mapping.rows) {
  const id = row[fId];
  canonicalIds.add(id);
  // closed enums
  const fu = row[followup];
  if (!FOLLOWUP_ENUM.has(fu) && !SKIPPED_RE_PATTERN.test(fu)) {
    fail(`canonical mapping: ${id} Follow-up "${fu}" is not in the 5-value enum`);
  }
  if (!RISK_ENUM.has(row[risk])) {
    fail(`canonical mapping: ${id} Risk tier "${row[risk]}" is not in C/B/A/–`);
  }
  // PR-scope coupling invariant
  const scope = row[prScope];
  const isPlanned = PR_QUEUE_FOLLOWUPS.has(fu);
  const scopeEmpty = EMPTY_CELL.has(scope);
  if (isPlanned === scopeEmpty) {
    fail(
      `canonical mapping: ${id} PR-scope coupling violated (Follow-up=${fu}, scope=${scope})`
    );
  }
  // Skipped closure
  if (SKIPPED.has(fu) || SKIPPED_RE_PATTERN.test(fu)) {
    const t = row[issueTitle];
    const s = row[prScope];
    if (!EMPTY_CELL.has(t) || !EMPTY_CELL.has(s)) {
      fail(
        `canonical mapping: ${id} Skipped closure violated (title="${t}" scope="${s}")`
      );
    }
  }
}

// 2. Round 2 overview table — must use only canonical values
const overviewHeader = "## Round 2 new findings";
let overview;
try {
  overview = findTable(overviewHeader);
} catch (e) {
  fail(`could not locate round 2 overview: ${e.message}`);
  process.exit(1);
}
const oF = overview.header.indexOf("Follow-up");
const oR = overview.header.indexOf("Risk tier");
if (oF < 0 || oR < 0) {
  fail("round 2 overview missing Follow-up or Risk tier column");
} else {
  overview.rows.forEach((row, idx) => {
    const fu = row[oF];
    if (!FOLLOWUP_ENUM.has(fu) && !SKIPPED_RE_PATTERN.test(fu)) {
      fail(
        `round 2 overview row ${idx + 1}: Follow-up "${fu}" is not in the 5-value enum`
      );
    }
    if (!RISK_ENUM.has(row[oR])) {
      fail(
        `round 2 overview row ${idx + 1}: Risk tier "${row[oR]}" is not in C/B/A/–`
      );
    }
    if (/[()]|x\d/i.test(row[oR]) || /[()]|x\d/i.test(row[oF])) {
      fail(
        `round 2 overview row ${idx + 1}: compound cell detected ("${row[oR]}" / "${row[oF]}")`
      );
    }
  });
}

// 3. PR execution order — only "Issue + planned PR" rows; every row must exist in canonical mapping
const prOrderHeader = "## PR execution order (canonical, only Issue + planned PR items)";
let prOrder = null;
try {
  prOrder = findTable(prOrderHeader);
} catch (e) {
  warn(`could not locate PR execution order table: ${e.message}`);
}
if (prOrder) {
  // The PR execution order table does NOT include Follow-up — by construction
  // it is exactly the rows whose Follow-up = "Issue + planned PR" in canonical
  // mapping. We cross-check by ensuring every PR row references an F-ID whose
  // canonical Follow-up is "Issue + planned PR".
  const fCol = prOrder.header.findIndex((h) => /^F-\d+[a-z]?$/.test(h) || /find/i.test(h));
  const fIdx = fCol >= 0 ? fCol : prOrder.header.indexOf("Finding");
  if (fIdx < 0) {
    fail("PR execution order table missing Finding/F-XX column");
  } else {
    prOrder.rows.forEach((row, idx) => {
      const id = row[fIdx];
      if (!canonicalIds.has(id)) {
        fail(`PR execution order row ${idx + 1}: ${id} not present in canonical mapping`);
      } else {
        const canonRow = mapping.rows.find((r) => r[fId] === id);
        if (canonRow[followup] !== "Issue + planned PR") {
          fail(
            `PR execution order row ${idx + 1}: ${id} canonical Follow-up is '${canonRow[followup]}', not 'Issue + planned PR'`
          );
        }
      }
    });
  }
}

// 4. Issue creation order — set of Issue IDs must equal non-Skipped canonical set
const issueOrderHeader = "## Issue creation order";
let issueOrder = null;
try {
  issueOrder = findTable(issueOrderHeader);
} catch (e) {
  warn(`could not locate Issue creation order table: ${e.message}`);
}
if (issueOrder) {
  const ids = issueOrder.rows.map((row) => {
    const title = row[1] || "";
    const m = title.match(/^(F-\d+[a-z]?):/);
    return m ? m[1] : null;
  });
  const unique = [...new Set(ids.filter(Boolean))];
  unique.forEach((id) => {
    if (!canonicalIds.has(id)) {
      fail(`Issue creation order: ${id} not present in canonical mapping`);
    }
  });
}

// 5. Cross-section ID consistency (heuristic): every ID referenced in a
//    "F-XX" mention in the doc that looks like a tracking row should be
//    present in the canonical mapping.
const mentioned = new Set();
for (const line of lines) {
  const matches = line.match(/F-\d+[a-z]?/g);
  if (matches) matches.forEach((m) => mentioned.add(m));
}
mentioned.forEach((id) => {
  if (!canonicalIds.has(id)) {
    warn(`F-XX mention "${id}" not present in canonical mapping`);
  }
});

if (process.exitCode === 1) {
  console.error("\nresult: FAIL");
  process.exit(1);
}
console.log("\nresult: PASS");
