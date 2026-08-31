import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOWS_DIRECTORY = resolve(REPOSITORY_ROOT, ".github/workflows");
const EXPECTED_WORKFLOW_ACTIONS = {
  "ci.yml": [
    "actions/checkout",
    "actions/setup-node",
    "actions/checkout",
    "actions/setup-node",
    "actions/checkout",
    "actions/setup-node"
  ],
  "control-plane-dependency-artifact.yml": [
    "actions/checkout",
    "actions/setup-node",
    "actions/upload-artifact"
  ],
  "control-plane-foundation-toolchain-inventory.yml": ["actions/checkout"],
  "control-plane-foundation-toolchain-publish.yml": [],
  "deploy-cloudflare-site.yml": [
    "actions/checkout",
    "actions/setup-node",
    "actions/checkout",
    "actions/setup-node"
  ],
  "governance-validate.yml": [
    "actions/checkout",
    "actions/checkout",
    "actions/setup-node"
  ],
  "japan-runtime-config-additive-repair.yml": [
    "actions/checkout",
    "actions/checkout",
    "actions/setup-node",
    "actions/download-artifact",
    "actions/checkout",
    "actions/setup-node",
    "actions/download-artifact"
  ],
  "japan-runtime-config-bootstrap-probe.yml": [
    "actions/checkout",
    "actions/setup-node"
  ],
  "production-deploy-dry-run.yml": [
    "actions/checkout",
    "actions/setup-node",
    "actions/upload-artifact"
  ],
  "release-artifact.yml": [
    "actions/checkout",
    "actions/setup-node",
    "actions/checkout",
    "actions/setup-node",
    "actions/upload-artifact",
    "actions/checkout",
    "actions/setup-node",
    "actions/upload-artifact",
    "actions/checkout",
    "actions/setup-node",
    "actions/upload-artifact"
  ],
  "synthetic-performance-baseline.yml": [
    "actions/checkout",
    "actions/setup-node",
    "actions/download-artifact",
    "actions/upload-artifact"
  ]
};
const EXPECTED_WORKFLOW_FILES = Object.keys(EXPECTED_WORKFLOW_ACTIONS);
const DEFAULT_CHECKOUT_PIN = "d23441a48e516b6c34aea4fa41551a30e30af803";
// governance-validate.yml is an immutable trust root in its own trusted job. Its
// two exact-SHA checkout positions remain on the base-reviewed pin until a
// separately authorized trust-root rotation can change that workflow.
const TRUSTED_GOVERNANCE_CHECKOUT_PIN =
  "df4cb1c069e1874edd31b4311f1884172cec0e10";
const REVIEWED_ACTION_PINS = {
  "actions/checkout": {
    sha: DEFAULT_CHECKOUT_PIN,
    annotation: "v6",
    count: 19
  },
  "actions/download-artifact": {
    sha: "3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
    annotation: "v8.0.1",
    count: 3
  },
  "actions/setup-node": {
    sha: "249970729cb0ef3589644e2896645e5dc5ba9c38",
    annotation: "v6",
    count: 16
  },
  "actions/upload-artifact": {
    sha: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    annotation: "v7",
    count: 6
  }
};
const EXPECTED_ACTION_REFERENCE_COUNT = 44;
const EXPECTED_ACTION_REVISION_COUNTS = {
  [`actions/checkout@${DEFAULT_CHECKOUT_PIN}`]: 17,
  [`actions/checkout@${TRUSTED_GOVERNANCE_CHECKOUT_PIN}`]: 2,
  [`actions/download-artifact@${REVIEWED_ACTION_PINS["actions/download-artifact"].sha}`]: 3,
  [`actions/setup-node@${REVIEWED_ACTION_PINS["actions/setup-node"].sha}`]: 16,
  [`actions/upload-artifact@${REVIEWED_ACTION_PINS["actions/upload-artifact"].sha}`]: 6
};
// Keep this source-only guard dependency-free: every uncommented `uses` token is
// reserved for this canonical one-line form and every other spelling fails closed.
const CANONICAL_ACTION_REFERENCE_LINE =
  /^ *(?:- +)?uses: +([^ \t#]+)(?: +# +(\S(?:.*\S)?))? *$/u;
const YAML_BLOCK_SCALAR_HEADER =
  /^( *)(?:(- +))?[A-Za-z_][A-Za-z0-9_-]*: *[>|]([+-]|[1-9]|[+-][1-9]|[1-9][+-])? *$/u;
const YAML_INDIRECTION_TOKEN =
  /(?:^|[ \t:[{,?])(?:[&*][A-Za-z0-9_-]+|<<:)/u;

function stripYamlComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote === "'") {
      if (character === "'" && line[index + 1] === "'") {
        index += 1;
      } else if (character === "'") {
        quote = null;
      }
      continue;
    }
    if (quote === '"') {
      if (character === "\\") {
        index += 1;
      } else if (character === '"') {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (
      character === "#"
      && (index === 0 || line[index - 1] === " " || line[index - 1] === "\t")
    ) {
      return {
        content: line.slice(0, index).trimEnd(),
        unterminatedQuote: null
      };
    }
  }
  return { content: line, unterminatedQuote: quote };
}

function readRepositoryFile(path) {
  return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

function jobBlock(workflow, jobName, nextJobName) {
  const start = workflow.indexOf(`  ${jobName}:`);
  assert.ok(start >= 0, `missing ${jobName} job`);
  const end = nextJobName ? workflow.indexOf(`  ${nextJobName}:`, start + 1) : -1;
  return workflow.slice(start, end >= 0 ? end : undefined);
}

function reviewedPinForWorkflowPosition({ action, referenceIndex, workflowFile }) {
  const reviewed = REVIEWED_ACTION_PINS[action];
  if (
    reviewed &&
    action === "actions/checkout" &&
    workflowFile === "governance-validate.yml" &&
    (referenceIndex === 0 || referenceIndex === 1)
  ) {
    return { ...reviewed, sha: TRUSTED_GOVERNANCE_CHECKOUT_PIN };
  }
  return reviewed;
}

function inspectWorkflowActionInventory(
  workflow,
  workflowFile,
  resolveReviewedPin = ({ action }) => REVIEWED_ACTION_PINS[action]
) {
  const references = [];
  const violations = [];
  const lines = workflow.replace(/\r\n?/gu, "\n").split("\n");
  let blockScalar = null;

  for (const [lineIndex, line] of lines.entries()) {
    const location = `${workflowFile}:${lineIndex + 1}`;
    const indentation = line.match(/^ */u)[0].length;
    if (blockScalar !== null) {
      if (line.trim() === "") continue;
      if (blockScalar.contentIndent === null) {
        if (indentation > blockScalar.baseIndent) {
          blockScalar.contentIndent = indentation;
          continue;
        }
      } else if (indentation >= blockScalar.contentIndent) {
        continue;
      }
      blockScalar = null;
    }
    const parsed = line.match(CANONICAL_ACTION_REFERENCE_LINE);

    if (!parsed) {
      const {
        content: sourceLine,
        unterminatedQuote
      } = stripYamlComment(line);
      if (unterminatedQuote !== null) {
        violations.push(
          `${location} multiline or unterminated YAML quoted scalars are forbidden`
        );
        continue;
      }
      if (sourceLine.trim() === "") continue;
      const blockHeader = sourceLine.match(YAML_BLOCK_SCALAR_HEADER);
      if (blockHeader) {
        // In a compact sequence mapping such as `- run: |`, sibling keys
        // start after the sequence marker. An explicit digit fixes the content
        // indentation; otherwise the first non-empty content line fixes it.
        const baseIndent =
          blockHeader[1].length + (blockHeader[2]?.length ?? 0);
        const explicitIndent = blockHeader[3]?.match(/[1-9]/u)?.[0];
        blockScalar = {
          baseIndent,
          contentIndent: explicitIndent
            ? baseIndent + Number(explicitIndent)
            : null
        };
      }
      if (sourceLine.includes("\\")) {
        violations.push(`${location} YAML escapes outside block scalars are forbidden`);
      } else if (YAML_INDIRECTION_TOKEN.test(sourceLine)) {
        violations.push(`${location} YAML mapping anchors and aliases are forbidden`);
      } else if (/\buses\b/u.test(sourceLine)) {
        violations.push(`${location} non-canonical uses syntax: ${line.trim()}`);
      }
      continue;
    }

    const reference = parsed[1];
    const annotation = parsed[2] ?? null;
    const separator = reference.lastIndexOf("@");
    if (separator <= 0 || separator === reference.length - 1) {
      violations.push(`${location} unpinned Action reference: ${reference}`);
      continue;
    }

    const action = reference.slice(0, separator);
    const revision = reference.slice(separator + 1);
    const referenceIndex = references.length;
    references.push({ action, revision });
    const reviewed = resolveReviewedPin({ action, referenceIndex, workflowFile });
    if (!reviewed) {
      violations.push(`${location} unreviewed Action: ${action}`);
      continue;
    }

    if (!/^[0-9a-f]{40}$/u.test(revision)) {
      violations.push(`${location} mutable Action revision: ${reference}`);
    } else if (revision !== reviewed.sha) {
      violations.push(`${location} unreviewed Action SHA: ${reference}`);
    }
    if (annotation !== reviewed.annotation) {
      violations.push(
        `${location} expected # ${reviewed.annotation} readability annotation: ${reference}`
      );
    }
  }

  return { references, violations };
}

test("workflow Action inventory parser fails closed outside the canonical source grammar", () => {
  const checkout = REVIEWED_ACTION_PINS["actions/checkout"];
  const accepted = inspectWorkflowActionInventory(
    `steps:\n  - uses: actions/checkout@${checkout.sha} # ${checkout.annotation}\n`,
    "accepted.yml"
  );
  assert.deepEqual(accepted.violations, []);
  assert.deepEqual(
    accepted.references.map(({ action }) => action),
    ["actions/checkout"]
  );
  assert.deepEqual(
    stripYamlComment('name: "quoted # value" # comment'),
    { content: 'name: "quoted # value"', unterminatedQuote: null }
  );
  assert.deepEqual(
    stripYamlComment("name: 'it''s # value' # comment"),
    { content: "name: 'it''s # value'", unterminatedQuote: null }
  );
  assert.deepEqual(
    stripYamlComment(String.raw`name: "escaped \"#\" and \\ value" # comment`),
    {
      content: String.raw`name: "escaped \"#\" and \\ value"`,
      unterminatedQuote: null
    }
  );
  assert.deepEqual(
    stripYamlComment("name: abc#def # comment"),
    { content: "name: abc#def", unterminatedQuote: null }
  );
  assert.deepEqual(
    stripYamlComment('name: "line'),
    { content: 'name: "line', unterminatedQuote: '"' }
  );
  assert.deepEqual(
    stripYamlComment("name: 'line"),
    { content: "name: 'line", unterminatedQuote: "'" }
  );
  assert.deepEqual(
    stripYamlComment('  # "comment-only'),
    { content: "", unterminatedQuote: null }
  );
  assert.deepEqual(
    stripYamlComment('name: safe # "ignored'),
    { content: "name: safe", unterminatedQuote: null }
  );

  const rejected = {
    "mutable tag": "steps:\n  - uses: actions/checkout@v6 # v6",
    "unreviewed SHA": `steps:\n  - uses: actions/checkout@${"0".repeat(40)} # v6`,
    "cross-action SHA": `steps:\n  - uses: actions/upload-artifact@${checkout.sha} # v7`,
    "uppercase SHA": `steps:\n  - uses: actions/checkout@${checkout.sha.toUpperCase()} # v6`,
    "quoted key": `steps:\n  - "uses": actions/checkout@${checkout.sha} # v6`,
    "unicode-escaped quoted key":
      "steps:\n  - \"\\u0075ses\": evil/action@v1",
    "hex-escaped quoted key":
      "steps:\n  - \"\\x75ses\": evil/action@v1",
    "escaped alias key":
      "key: &uses_key \"\\u0075ses\"\nsteps:\n  - *uses_key: evil/action@v1",
    "escaped anchored step mapping":
      "template: &hidden_step\n  \"\\u0075ses\": evil/action@v1\nsteps:\n  - *hidden_step",
    "multiline escaped explicit key":
      "steps:\n  - ? \"\\u0075" + "\\" + "\n      ses\"\n    : evil/action@v1",
    "flow mapping": `steps:\n  - { uses: actions/checkout@${checkout.sha} }`,
    "double-quoted hash before flow mapping uses":
      'steps:\n  - { name: " #", uses: attacker/action@v1 }',
    "single-quoted hash before flow mapping uses":
      "steps:\n  - { name: ' #', uses: attacker/action@v1 }",
    "single-quoted doubled quote before flow mapping uses":
      "steps:\n  - { name: 'it''s # text', uses: attacker/action@v1 }",
    "external comment after flow mapping uses":
      "steps:\n  - { name: ok, uses: attacker/action@v1 } # comment",
    "plain scalar hash before flow mapping uses":
      "steps:\n  - { name: abc#def, uses: attacker/action@v1 }",
    "multiline double-quoted flow mapping uses":
      'steps:\n  - { name: "line\n      # still string", uses: attacker/action@v1 }',
    "multiline single-quoted flow mapping uses":
      "steps:\n  - { name: 'line\n      # still string', uses: attacker/action@v1 }",
    "uses after block scalar":
      "steps:\n  - run: |\n      echo safe\n    uses: attacker/action@v1",
    "uses after block scalar terminator comment":
      "steps:\n  - run: |\n      echo safe\n# terminator\n    uses: attacker/action@v1",
    "uses after scalar-content comment":
      "steps:\n  - run: |\n      # scalar content\n    uses: attacker/action@v1",
    "uses after empty block scalar comment":
      "steps:\n  - run: |\n    # outside scalar\n    uses: attacker/action@v1",
    "uses after compact sequence block scalar":
      "steps:\n  -   run: |\n        echo safe\n      uses: attacker/action@v1",
    "uses after explicit-indent-one block scalar":
      "steps:\n  - run: |1\n     echo safe\n    uses: attacker/action@v1",
    "uses after explicit-indent block scalar":
      "steps:\n  - run: |2\n      echo safe\n    uses: attacker/action@v1",
    "space before colon": `steps:\n  - uses : actions/checkout@${checkout.sha} # v6`,
    alias: "steps:\n  - uses: *reviewed_checkout",
    expression: "steps:\n  - uses: ${{ env.REVIEWED_ACTION }}",
    "custom tag": `steps:\n  - uses: !reviewed actions/checkout@${checkout.sha}`
  };

  for (const [description, workflow] of Object.entries(rejected)) {
    const inspected = inspectWorkflowActionInventory(workflow, `${description}.yml`);
    assert.ok(inspected.violations.length > 0, description);
  }

  assert.deepEqual(
    inspectWorkflowActionInventory(
      `# uses: actions/checkout@v6\nsteps: [] # uses: actions/checkout@v6\n`,
      "comments.yml"
    ),
    { references: [], violations: [] }
  );
  assert.deepEqual(
    inspectWorkflowActionInventory(
      "steps:\n  - run: |\n\n      printf '\\\\u0075ses\\n'\n      echo 'uses &anchor *alias'\n      dangling \"\n      # uses: attacker/action@v1\n      uses: attacker/action@v1\n",
      "block-scalar.yml"
    ),
    { references: [], violations: [] }
  );
});

test("all workflow Action references use the reviewed full commit inventory", () => {
  const workflowEntries = readdirSync(WORKFLOWS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => /\.ya?ml$/iu.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const workflowFiles = workflowEntries.map((entry) => entry.name);

  const actionCounts = new Map(
    Object.keys(REVIEWED_ACTION_PINS).map((action) => [action, 0])
  );
  const actionRevisionCounts = new Map();
  const violations = [];
  let referenceCount = 0;

  if (JSON.stringify(workflowFiles) !== JSON.stringify(EXPECTED_WORKFLOW_FILES)) {
    violations.push(
      `workflow file inventory mismatch: ${JSON.stringify(workflowFiles)}`
    );
  }

  for (const entry of workflowEntries) {
    const workflowFile = entry.name;
    if (!entry.isFile()) {
      violations.push(`${workflowFile} must be a regular file`);
      continue;
    }
    const workflow = readRepositoryFile(`.github/workflows/${workflowFile}`)
      .replace(/\r\n?/gu, "\n");
    const unsafeCheckoutOverrides =
      workflow.match(/\ballow-unsafe-pr-checkout\b/gu)?.length ?? 0;
    if (unsafeCheckoutOverrides !== 0) {
      violations.push(
        `${workflowFile} forbids unsafe checkout overrides, found ${unsafeCheckoutOverrides}`
      );
    }
    const inspected = inspectWorkflowActionInventory(
      workflow,
      workflowFile,
      reviewedPinForWorkflowPosition
    );
    violations.push(...inspected.violations);
    referenceCount += inspected.references.length;
    const observedActions = inspected.references.map(({ action }) => action);
    const expectedActions = EXPECTED_WORKFLOW_ACTIONS[workflowFile];
    if (JSON.stringify(observedActions) !== JSON.stringify(expectedActions)) {
      violations.push(
        `${workflowFile} Action sequence mismatch: ${JSON.stringify(observedActions)}`
      );
    }
    for (const { action, revision } of inspected.references) {
      if (actionCounts.has(action)) {
        actionCounts.set(action, actionCounts.get(action) + 1);
      }
      const actionRevision = `${action}@${revision}`;
      actionRevisionCounts.set(
        actionRevision,
        (actionRevisionCounts.get(actionRevision) ?? 0) + 1
      );
    }
  }

  if (referenceCount !== EXPECTED_ACTION_REFERENCE_COUNT) {
    violations.push(
      `expected ${EXPECTED_ACTION_REFERENCE_COUNT} Action references, found ${referenceCount}`
    );
  }
  for (const [action, reviewed] of Object.entries(REVIEWED_ACTION_PINS)) {
    const observed = actionCounts.get(action);
    if (observed !== reviewed.count) {
      violations.push(`${action} expected ${reviewed.count} references, found ${observed}`);
    }
  }
  for (const [actionRevision, expected] of Object.entries(
    EXPECTED_ACTION_REVISION_COUNTS
  )) {
    const observed = actionRevisionCounts.get(actionRevision) ?? 0;
    if (observed !== expected) {
      violations.push(
        `${actionRevision} expected ${expected} references, found ${observed}`
      );
    }
  }
  for (const actionRevision of actionRevisionCounts.keys()) {
    if (!Object.hasOwn(EXPECTED_ACTION_REVISION_COUNTS, actionRevision)) {
      violations.push(`unexpected Action revision: ${actionRevision}`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `workflow Action pin violations:\n${violations.join("\n")}`
  );
});

test("CI keeps one stable Validate job, always checks the exact diff, and skips heavy validation only for docs-only", () => {
  const workflow = readRepositoryFile(".github/workflows/ci.yml");
  const validate = jobBlock(workflow, "validate");

  assert.equal((workflow.match(/^    name: Validate$/gm) ?? []).length, 1);
  assert.match(validate, /node scripts\/ci-change-classifier\.mjs/);
  assert.match(validate, /git diff --check/);
  assert.match(validate, /id: changes/);

  const heavyStepNames = [
    "Install root dependencies",
    "Install admin dependencies",
    "Run server tests",
    "Run admin tests",
    "Build admin app",
    "Verify admin build boundary",
    "Build Portal app",
    "Verify Portal build boundary",
    "Build public site",
    "Verify public site boundary",
    "Cloudflare public site dry run"
  ];
  for (const stepName of heavyStepNames) {
    const stepStart = validate.indexOf(`- name: ${stepName}`);
    assert.ok(stepStart >= 0, `missing ${stepName}`);
    const step = validate.slice(stepStart, validate.indexOf("\n      - name:", stepStart + 1));
    assert.match(step, /if: steps\.changes\.outputs\.run_full != '0'/, stepName);
  }

  const diffStepStart = validate.indexOf("- name: Check diff");
  assert.ok(diffStepStart >= 0, "missing diff check");
  const diffStep = validate.slice(diffStepStart, validate.indexOf("\n      - name:", diffStepStart + 1));
  assert.match(diffStep, /^\s*if: always\(\)/m);
  assert.match(diffStep, /\[\[ "\$CI_DIFF_BASE" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(diffStep, /\[\[ "\$CI_DIFF_HEAD" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(diffStep, /git cat-file -e "\$CI_DIFF_BASE\^\{commit\}"/);
  assert.match(diffStep, /git cat-file -e "\$CI_DIFF_HEAD\^\{commit\}"/);
  assert.match(diffStep, /git diff --check "\$range"/);

  const authorityStepStart = validate.indexOf("- name: Check document authority");
  assert.ok(authorityStepStart >= 0, "missing document authority check");
  const authorityStep = validate.slice(
    authorityStepStart,
    validate.indexOf("\n      - name:", authorityStepStart + 1)
  );
  assert.match(authorityStep, /^\s*if: always\(\)/m);
  assert.match(authorityStep, /npm run docs:authority:strict/);
  assert.match(workflow, /permissions:\r?\n  contents: read/);
});

test("CI separates read-only governance evidence from manual snapshot validation", () => {
  const workflow = readRepositoryFile(".github/workflows/ci.yml");
  const governance = jobBlock(workflow, "governance-evidence", "governance-snapshot");
  const snapshot = jobBlock(workflow, "governance-snapshot", "validate");

  assert.equal((workflow.match(/^    name: Governance evidence$/gm) ?? []).length, 1);
  assert.equal((workflow.match(/^    name: Governance snapshot$/gm) ?? []).length, 1);
  assert.match(governance, /if: github\.event_name != 'workflow_dispatch'/);
  assert.match(
    governance,
    new RegExp(
      `uses: actions/checkout@${REVIEWED_ACTION_PINS["actions/checkout"].sha} # v6`
    )
  );
  assert.match(governance, /fetch-depth: 0/);
  assert.match(governance, /persist-credentials: false/);
  assert.match(
    governance,
    new RegExp(
      `uses: actions/setup-node@${REVIEWED_ACTION_PINS["actions/setup-node"].sha} # v6`
    )
  );
  assert.match(governance, /node-version: 22/);
  assert.match(governance, /git show "\$CI_DIFF_BASE:project-state\/gates\.json"/);
  assert.match(governance, /git show "\$CI_DIFF_BASE:project-state\/repair-policy\.json"/);
  assert.match(governance, /--base-gates-file "\$RUNNER_TEMP\/base-gates\.json"/);
  assert.match(governance, /--base-policy-file "\$RUNNER_TEMP\/base-policy\.json"/);
  assert.match(governance, /--base-state-missing/);
  assert.doesNotMatch(governance, /--snapshot/);
  assert.match(snapshot, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(snapshot, /--snapshot/);
  assert.doesNotMatch(snapshot, /--base-gates-file|--base-state-missing/);
  assert.match(workflow, /permissions:\r?\n  contents: read/);
  assert.doesNotMatch(governance, /npm ci|contents: write|deploy|provider|ssh|scp|rsync|environment:/i);
});

test("trusted governance advisory uses only the base validator and immutable trust root", () => {
  const workflow = readRepositoryFile(".github/workflows/governance-validate.yml");
  const governance = jobBlock(workflow, "governance-validate");

  assert.match(workflow, /pull_request_target:/);
  assert.equal((workflow.match(/^    name: Governance trusted advisory$/gm) ?? []).length, 1);
  assert.match(workflow, /permissions:\r?\n  contents: read\r?\n  pull-requests: read/);
  assert.equal((governance.match(/actions\/checkout@[a-f0-9]{40} # v6/g) ?? []).length, 2);
  assert.equal(
    (governance.match(/actions\/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6/g) ?? []).length,
    2
  );
  assert.equal((governance.match(/actions\/setup-node@[a-f0-9]{40} # v6/g) ?? []).length, 1);
  assert.equal((governance.match(/persist-credentials: false/g) ?? []).length, 2);
  assert.doesNotMatch(governance, /allow-unsafe-pr-checkout/);
  assert.match(governance, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(governance, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(governance, /\[\[ "\$BASE_HEAD" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(governance, /\[\[ "\$CANDIDATE_HEAD" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(governance, /path: candidate/);
  assert.match(governance, /sparse-checkout:\s*\|\s*project-state\/gates\.json\s*project-state\/repair-policy\.json/s);
  assert.match(governance, /sparse-checkout-cone-mode: false/);
  assert.match(governance, /assert_trust_root_unchanged/);
  assert.match(governance, /\[\[ "\$base_mode" == "100644" && "\$candidate_mode" == "100644" \]\]/);
  assert.match(governance, /server\/services\/governance\/gate-governance\.mjs/);
  assert.match(governance, /schemas\/gate-ledger-v1\.schema\.json/);
  assert.match(governance, /schemas\/failure-attribution-v2\.schema\.json/);
  assert.match(governance, /schemas\/repair-policy-v2\.schema\.json/);
  assert.doesNotMatch(governance, /schemas\/(?:failure-attribution|repair-policy)-v1\.schema\.json/);
  assert.match(governance, /project-state\/repair-policy\.json/);
  assert.match(governance, /git -C candidate ls-tree "\$CANDIDATE_HEAD"/);
  assert.match(governance, /\[\[ "\$mode" == "100644" \]\]/);
  assert.match(governance, /git -C candidate cat-file blob "\$object"/);
  assert.match(governance, /node scripts\/check-gate-governance\.mjs/);
  assert.match(governance, /--head-gates-file \$\{\{ runner\.temp \}\}\/head-gates\.json/);
  assert.match(governance, /--head-policy-file \$\{\{ runner\.temp \}\}\/head-policy\.json/);
  assert.doesNotMatch(governance, /--head-(?:gates|policy)-file candidate\//);
  assert.doesNotMatch(governance, /node candidate\/|npm ci|contents: write|secrets\.|deploy|provider|ssh|scp|rsync|environment:/i);
});

test("Release Artifact skips package jobs only for an exact docs-only result and dispatch stays full", () => {
  const workflow = readRepositoryFile(".github/workflows/release-artifact.yml");
  const classify = jobBlock(workflow, "classify", "package");

  assert.match(classify, /node scripts\/ci-change-classifier\.mjs/);
  assert.match(classify, /outputs:/);
  assert.match(classify, /lane: \$\{\{ steps\.changes\.outputs\.lane \}\}/);
  assert.match(classify, /run_full: \$\{\{ steps\.changes\.outputs\.run_full \}\}/);

  const jobs = [
    ["package", "portal-static"],
    ["portal-static", "admin-static"],
    ["admin-static", undefined]
  ];
  for (const [jobName, nextJobName] of jobs) {
    const job = jobBlock(workflow, jobName, nextJobName);
    assert.match(job, /needs: classify/);
    assert.match(job, /if: needs\.classify\.outputs\.run_full != '0'/);
  }

  assert.match(workflow, /GITHUB_EVENT_NAME/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /permissions:\r?\n  contents: read/);
  assert.doesNotMatch(workflow, /contents: write|deploy|provider|ssh|scp|rsync/);
});

test("validation baseline documents the fail-closed docs-only lane contract", () => {
  const baseline = readRepositoryFile("docs/VALIDATION_BASELINE.md");

  assert.match(baseline, /docs-only/i);
  assert.match(baseline, /root `\*\.md`/);
  assert.match(baseline, /`docs\/\*\*\/\*\.md`/);
  assert.match(baseline, /`ops\/\*\*\/\*\.md`/);
  assert.match(baseline, /`\.github\/\*\*\/\*\.md`/);
  assert.match(baseline, /workflow_dispatch.*full/i);
  assert.match(baseline, /git diff --check/);
  assert.match(baseline, /project-state.*code lane/i);
  assert.match(
    baseline,
    /missing or\s+unexpected `run_full` value also defaults to full validation/i
  );
  assert.match(
    baseline,
    /exact lowercase docs-only lane to the numeric\s+`run_full` output `0`/i
  );
  assert.match(baseline, /always\(\)/);
  assert.match(baseline, /npm run docs:authority:check/);
  assert.match(baseline, /duplicate active canonical `authority_scope`/i);
});
