import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  checkProjectState,
  findSensitivePatternFindings
} from "../../scripts/check-project-state.mjs";

const REPOSITORY_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const REVIEWED_PROJECT_STATE_FILENAMES = [
  "lanes.json",
  "current.json",
  "tasks.json",
  "project-v2-contract.json"
];

function createActualProjectStateFixture(prefix, mutate = () => {}) {
  const rootDir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(rootDir, "project-state"));
  const states = {};
  const originalStates = {};
  const originalTexts = {};
  for (const filename of REVIEWED_PROJECT_STATE_FILENAMES) {
    originalTexts[filename] = readFileSync(
      join(REPOSITORY_ROOT, "project-state", filename),
      "utf8"
    );
    originalStates[filename] = JSON.parse(originalTexts[filename]);
    states[filename] = structuredClone(originalStates[filename]);
  }
  mutate(states);
  for (const [filename, state] of Object.entries(states)) {
    const unchanged = JSON.stringify(state) === JSON.stringify(originalStates[filename]);
    writeFileSync(
      join(rootDir, "project-state", filename),
      unchanged ? originalTexts[filename] : JSON.stringify(state)
    );
  }
  return rootDir;
}

test("project-state check validates the current repository state", () => {
  const result = checkProjectState();

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.match(result.summary, /validated project-state/);
});

test("project-state check pins every compatibility JSON to reviewed bytes", async (t) => {
  const cases = [
    ["lanes.json", (states) => {
      states["lanes.json"].lanes[0].purpose += " Unreviewed wording.";
    }],
    ["current.json", (states) => {
      states["current.json"].directionsAtObservation.push("Unreviewed wording.");
    }],
    ["tasks.json", (states) => {
      states["tasks.json"].purpose += " Unreviewed wording.";
    }],
    ["project-v2-contract.json", (states) => {
      states["project-v2-contract.json"].managedFields[0].options.push("Unreviewed");
    }]
  ];

  for (const [filename, mutate] of cases) {
    await t.test(filename, () => {
      const rootDir = createActualProjectStateFixture(
        "project-state-reviewed-digest-",
        mutate
      );
      const result = checkProjectState({ rootDir, today: "2026-08-29" });
      assert.equal(result.ok, false);
      assert.match(
        result.errors.join("\n"),
        new RegExp(`project-state/${filename}: content digest must match the reviewed compatibility contract`)
      );
      for (const otherFilename of REVIEWED_PROJECT_STATE_FILENAMES) {
        if (otherFilename !== filename) {
          assert.doesNotMatch(
            result.errors.join("\n"),
            new RegExp(`project-state/${otherFilename}: content digest must match the reviewed compatibility contract`)
          );
        }
      }
    });
  }
});

test("project-state reviewed digests accept checkout-only CRLF conversion", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "project-state-reviewed-crlf-"));
  mkdirSync(join(rootDir, "project-state"));
  for (const filename of REVIEWED_PROJECT_STATE_FILENAMES) {
    const text = readFileSync(
      join(REPOSITORY_ROOT, "project-state", filename),
      "utf8"
    );
    writeFileSync(
      join(rootDir, "project-state", filename),
      text.replace(/\r?\n/gu, "\r\n")
    );
  }

  const result = checkProjectState({ rootDir, today: "2026-08-29" });
  assert.doesNotMatch(
    result.errors.join("\n"),
    /content digest must match the reviewed compatibility contract/
  );
});

test("project-state reviewed files reject symlink substitution", async (t) => {
  for (const targetFilename of REVIEWED_PROJECT_STATE_FILENAMES) {
    await t.test(targetFilename, () => {
      const rootDir = mkdtempSync(join(tmpdir(), "project-state-reviewed-symlink-"));
      const outsideDir = mkdtempSync(join(tmpdir(), "project-state-reviewed-outside-"));
      mkdirSync(join(rootDir, "project-state"));

      for (const filename of REVIEWED_PROJECT_STATE_FILENAMES) {
        const text = readFileSync(
          join(REPOSITORY_ROOT, "project-state", filename),
          "utf8"
        );
        const targetPath = join(rootDir, "project-state", filename);
        if (filename === targetFilename) {
          const outsidePath = join(outsideDir, filename);
          writeFileSync(outsidePath, `${text} `);
          symlinkSync(outsidePath, targetPath);
        } else {
          writeFileSync(targetPath, text);
        }
      }

      const result = checkProjectState({ rootDir, today: "2026-08-29" });
      assert.equal(result.ok, false);
      assert.match(
        result.errors.join("\n"),
        new RegExp(`project-state/${targetFilename}: reviewed compatibility file must be a regular non-symlink file within the repository`)
      );
    });
  }
});

test("project-state check validates the reviewed semantic Project v2 contract", () => {
  const contract = JSON.parse(readFileSync(
    join(REPOSITORY_ROOT, "project-state", "project-v2-contract.json"),
    "utf8"
  ));

  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.contractType, "github-project-v2-static-contract");
  assert.equal(contract.verifiedAt, "2026-08-30");
  assert.equal(contract.identityBinding, "semantic-only");
  assert.deepEqual(contract.target, {
    owner: "gccwebos-com",
    projectNumber: 1,
    repository: "gccwebos-com/proxy-gateway-minimal",
    name: "GCC WebOS — Delivery",
    expectedClosed: false
  });
  assert.deepEqual(contract.authority, {
    projectProjectionOnly: true,
    productionAuthority: false,
    writebackEnabled: false
  });
  assert.equal(contract.nativeWorkflowGraceSeconds, 900);
  assert.deepEqual(
    contract.managedFields.map(({ key, name, type, options }) => ({ key, name, type, options })),
    [
      { key: "status", name: "Status", type: "single-select", options: ["Backlog", "Todo", "In Progress", "Blocked", "Done"] },
      { key: "lane", name: "Lane", type: "single-select", options: ["traffic-accounting", "portal-lifecycle", "commercial-foundation", "operations-foundation", "version-management", "dependency-materialization", "legacy-retirement"] },
      { key: "risk", name: "Risk", type: "single-select", options: ["A", "B", "C"] },
      { key: "source-production-state", name: "Source / Production State", type: "single-select", options: ["aligned", "drift", "runtime-only", "artifact-only", "unknown"] },
      { key: "validation-state", name: "Validation State", type: "single-select", options: ["Not started", "Running", "Passed", "Blocked"] },
      { key: "production-impact", name: "Production Impact", type: "single-select", options: ["none", "read-only", "mutation gated separately"] }
    ]
  );
  assert.deepEqual(contract.itemFieldRequirements, [
    {
      scope: "managed_repository",
      nativeKind: "issue",
      requiredFieldKeys: [
        "status",
        "lane",
        "risk",
        "source-production-state",
        "validation-state",
        "production-impact"
      ]
    },
    {
      scope: "managed_repository",
      nativeKind: "pull_request",
      requiredFieldKeys: ["status"]
    }
  ]);
  assert.deepEqual(contract.views, [
    { key: "portfolio-triage", name: "Portfolio Triage", layout: "table", filter: "is:issue is:open" },
    { key: "execution-board", name: "Execution Board", layout: "board", filter: "is:issue is:open", groupBy: "Status", sliceBy: "Lane" },
    { key: "risk-a-gates", name: "Risk A Gates", layout: "board", filter: "risk:A -status:Done", groupBy: "Status" },
    { key: "review-queue", name: "Review Queue", layout: "table", filter: "is:pr is:open -is:draft" }
  ]);
  assert.equal(contract.nativeWorkflows.length, 6);
});

test("project-state check fails closed on malformed or live Project v2 contract data", async (t) => {
  const cases = [
    ["rejects a non-object contract root", (states) => {
      states["project-v2-contract.json"] = [];
    }, /project-v2-contract\.json: expected an object in the reviewed static Project v2 contract/],
    ["requires exactly six fields", (states) => {
      states["project-v2-contract.json"].managedFields.pop();
    }, /managedFields: must contain exactly six reviewed fields/],
    ["rejects duplicate field keys", (states) => {
      states["project-v2-contract.json"].managedFields[1].key = "status";
    }, /managedFields\[1\]\.key: duplicate field key/],
    ["rejects duplicate field names", (states) => {
      states["project-v2-contract.json"].managedFields[1].name = "Status";
    }, /managedFields\[1\]\.name: duplicate field name/],
    ["rejects unsupported field types", (states) => {
      states["project-v2-contract.json"].managedFields[0].type = "text";
    }, /managedFields\[0\]\.type: must be single-select/],
    ["rejects duplicate options within a field", (states) => {
      states["project-v2-contract.json"].managedFields[0].options[1] = "Backlog";
    }, /managedFields\[0\]\.options\[1\]: duplicate option/],
    ["pins item field requirements by native kind", (states) => {
      states["project-v2-contract.json"].itemFieldRequirements[1].requiredFieldKeys.push("risk");
    }, /itemFieldRequirements: must exactly match the reviewed static Project v2 contract/],
    ["does not allow Issue required fields to shrink", (states) => {
      states["project-v2-contract.json"].itemFieldRequirements[0].requiredFieldKeys.splice(1, 1);
    }, /itemFieldRequirements: must exactly match the reviewed static Project v2 contract/],
    ["requires the item field applicability contract", (states) => {
      delete states["project-v2-contract.json"].itemFieldRequirements;
    }, /itemFieldRequirements: required field is missing or empty/],
    ["requires Lane options to equal lanes.json", (states) => {
      states["project-v2-contract.json"].managedFields[1].options.reverse();
    }, /Lane options must exactly match project-state\/lanes\.json/],
    ["keeps Project lanes disjoint from internal-only lanes", (states) => {
      states["lanes.json"].githubProjectIndex.internalOnlyLanes.push("traffic-accounting");
    }, /Lane options must not include internal-only lanes: traffic-accounting/],
    ["rejects live item data", (states) => {
      states["project-v2-contract.json"].liveItems = [{ number: 597 }];
    }, /liveItems: live item\/count\/queue\/runtime data is forbidden/],
    ["rejects live count data", (states) => {
      states["project-v2-contract.json"].openIssueCount = 15;
    }, /openIssueCount: live item\/count\/queue\/runtime data is forbidden/],
    ["rejects live queue data", (states) => {
      states["project-v2-contract.json"].reviewQueue = [];
    }, /reviewQueue: live item\/count\/queue\/runtime data is forbidden/],
    ["rejects runtime data", (states) => {
      states["project-v2-contract.json"].runtimeState = "healthy";
    }, /runtimeState: live item\/count\/queue\/runtime data is forbidden/],
    ["rejects GraphQL identifiers", (states) => {
      states["project-v2-contract.json"].managedFields[0].fieldId = "PVTF_fake";
    }, /fieldId: GraphQL identifiers are forbidden/],
    ["requires semantic-only identity binding", (states) => {
      states["project-v2-contract.json"].identityBinding = "graphql-id";
    }, /identityBinding: must be semantic-only/],
    ["keeps production authority disabled", (states) => {
      states["project-v2-contract.json"].authority.productionAuthority = true;
    }, /authority: must exactly match the reviewed static Project v2 contract/],
    ["pins the semantic target", (states) => {
      states["project-v2-contract.json"].target.projectNumber = 2;
    }, /target: must exactly match the reviewed static Project v2 contract/],
    ["pins the native workflow grace window", (states) => {
      states["project-v2-contract.json"].nativeWorkflowGraceSeconds = 0;
    }, /nativeWorkflowGraceSeconds: must be 900/],
    ["pins all reviewed view semantics", (states) => {
      states["project-v2-contract.json"].views[1].sliceBy = "Risk";
    }, /views: must exactly match the reviewed static Project v2 contract/],
    ["pins all reviewed workflow semantics", (states) => {
      states["project-v2-contract.json"].nativeWorkflows[4].action.value = "Todo";
    }, /nativeWorkflows: must exactly match the reviewed static Project v2 contract/]
  ];

  for (const [name, mutate, expected] of cases) {
    await t.test(name, () => {
      const rootDir = createActualProjectStateFixture(
        "project-v2-contract-invalid-",
        mutate
      );
      const result = checkProjectState({ rootDir, today: "2026-08-30" });
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), expected);
    });
  }
});

test("project-state check reports missing lane docs, incomplete tasks, and raw secret patterns", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "project-state-check-"));
  mkdirSync(join(rootDir, "project-state"));
  mkdirSync(join(rootDir, "docs"));

  writeFileSync(
    join(rootDir, "project-state", "lanes.json"),
    JSON.stringify({
      lanes: [
        {
          id: "bad-lane",
          name: "Bad Lane",
          status: "definition-only",
          riskBoundary: "C",
          purpose: "Continue Issue #525 as current work",
          primaryDocs: ["docs/missing.md"],
          primaryCodeAreas: [],
          nonGoals: []
        }
      ]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "current.json"),
    JSON.stringify({
      status: "active-snapshot",
      sourceDocs: ["docs/PROJECT_CONTEXT.md"]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "tasks.json"),
    JSON.stringify({
      tasks: [
        {
          id: "bad-task",
          risk: "A",
          status: "ready",
          lane: "bad-lane",
          title: "Bad task",
          goal: "exercise checker",
          allowedFiles: [],
          forbiddenActions: [],
          validation: []
        }
      ]
    })
  );
  writeFileSync(
    join(rootDir, "docs", "PROJECT_CONTEXT.md"),
    [
      "# Current",
      "",
      "token=raw-secret-value",
      "Historical Aliyun records are current authority."
    ].join("\n")
  );

  const result = checkProjectState({ rootDir });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /docs\/missing\.md/);
  assert.match(result.errors.join("\n"), /bad-task/);
  assert.match(result.errors.join("\n"), /raw secret pattern/);
  assert.match(result.errors.join("\n"), /metadata header/);
  assert.match(result.errors.join("\n"), /authority drift/);
  assert.doesNotMatch(result.errors.join("\n"), /raw-secret-value/);
});

test("project-state check accepts metadata headers and placeholder-only examples", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "project-state-check-valid-"));
  mkdirSync(join(rootDir, "docs"));

  const activeDoc = [
    "# Current",
    "",
    "> Status:",
    "> - Type: Active current-state handoff",
    "> - Risk: C",
    "> - Execution authority: Does not authorize production mutation",
    "> - Production impact: None",
    "> - Source of truth for: Test fixture",
    "",
    "Use token=<placeholder> only in examples.",
    "Use password=[REDACTED] when documenting redacted placeholders.",
    "Use api_key=<placeholder> when documenting placeholder keys."
  ].join("\n");
  writeFileSync(join(rootDir, "docs", "PROJECT_CONTEXT.md"), activeDoc);

  const result = checkProjectState();

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(findSensitivePatternFindings(rootDir, ["docs/PROJECT_CONTEXT.md"]), []);
});

test("project-state check reports token-shaped values in placeholder prose", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "project-state-check-mixed-secret-"));
  mkdirSync(join(rootDir, "project-state"));
  mkdirSync(join(rootDir, "docs"));

  const activeDoc = [
    "# Current",
    "",
    "> Status:",
    "> - Type: Active current-state handoff",
    "> - Risk: C",
    "> - Execution authority: Does not authorize production mutation",
    "> - Production impact: None",
    "> - Source of truth for: Test fixture",
    "",
    "Sample placeholder prose must not hide token=scanner-bypass-value-123456."
  ].join("\n");
  writeFileSync(join(rootDir, "docs", "PROJECT_CONTEXT.md"), activeDoc);

  writeFileSync(
    join(rootDir, "project-state", "lanes.json"),
    JSON.stringify({
      observedAt: "2026-08-26",
      lastUpdated: "2026-08-26",
      requiresLiveIssueRead: true,
      lanes: [
        {
          id: "validation-ci",
          name: "Validation And CI",
          status: "definition-only",
          riskBoundary: "B",
          purpose: "exercise checker",
          primaryDocs: ["docs/PROJECT_CONTEXT.md"],
          primaryCodeAreas: [],
          nonGoals: ["production mutation"]
        }
      ]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "current.json"),
    JSON.stringify({
      observedAt: "2026-08-26",
      lastUpdated: "2026-08-26",
      requiresLiveIssueRead: true,
      status: "active-snapshot",
      sourceDocs: ["docs/PROJECT_CONTEXT.md"],
      productSpine: ["validation"],
      productionSnapshot: {
        requiresLiveVerification: true
      },
      forbiddenInStateFiles: ["tokens"]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "tasks.json"),
    JSON.stringify({
      observedAt: "2026-08-26",
      lastUpdated: "2026-08-26",
      requiresLiveIssueRead: true,
      tasks: [
        {
          id: "B-validation",
          risk: "B",
          status: "observed-at-cutoff-validation",
          lane: "validation-ci",
          title: "Validation",
          goal: "exercise checker",
          allowedFiles: ["scripts/*"],
          forbiddenActions: ["mutate production"],
          validation: ["npm test"]
        }
      ]
    })
  );

  const result = checkProjectState({ rootDir });
  const errors = result.errors.join("\n");

  assert.equal(result.ok, false);
  assert.match(errors, /raw secret pattern matched \(token\)/);
  assert.doesNotMatch(errors, /scanner-bypass-value-123456/);
});

test("project-state sensitive scan never follows traversal or glob paths", () => {
  const parentDir = mkdtempSync(join(tmpdir(), "project-state-sensitive-path-"));
  const rootDir = join(parentDir, "repository");
  mkdirSync(rootDir);
  writeFileSync(join(parentDir, "outside.md"), "token=outside-boundary-secret-value");

  assert.deepEqual(
    findSensitivePatternFindings(rootDir, ["../outside.md", "docs/*.md"]),
    []
  );
});

test("project-state check fails closed on live queue fields and mutable GitHub inventory", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "project-state-check-live-queue-"));
  mkdirSync(join(rootDir, "project-state"));

  const freshness = {
    observedAt: "2026-08-26",
    lastUpdated: "2026-08-26",
    requiresLiveIssueRead: true
  };
  writeFileSync(
    join(rootDir, "project-state", "lanes.json"),
    JSON.stringify({
      ...freshness,
      status: "taxonomy-and-dated-evidence",
      lanes: [
        {
          id: "validation-ci",
          name: "Validation And CI",
          status: "active",
          riskBoundary: "B",
          purpose: "Continue Issue #525 as current work",
          primaryDocs: [],
          primaryCodeAreas: [],
          nonGoals: ["production mutation"]
        }
      ]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "current.json"),
    JSON.stringify({
      ...freshness,
      status: "dated-compatibility-snapshot",
      purpose: "Current live work queue. Project #1 is authoritative for status and sequencing.",
      activeBlockers: [{ id: "stale-blocker" }],
      activeDirections: ["stale direction"],
      activeGoal: { primaryIssue: 525 },
      currentWork: ["#525"],
      issueStates: { "525": "open" },
      sourceDocs: ["docs/*.md"],
      productSpine: ["validation"],
      validationSnapshot: {
        active_tasks: ["#525"],
        "next-action": "merge PR #678",
        liveTasks: ["#527"],
        open_issue_count: 7,
        token: "supersecretvalue"
      },
      branchContext: {
        live_queue_state: {
          taskSequence: ["Issue #999"],
          projectAuthority: "current work authority"
        }
      },
      productionSnapshot: {
        requiresLiveVerification: true,
        snapshotState: "current-live-authoritative",
        readyTasks: ["#525"],
        nextRecommendedQueue: ["stale ordering"],
        productionReady: true,
        oldReceiptAuthorizesDeletion: true,
        notes: "B-local-tooling is the next task; run it now.",
        companySitePromotionBoundary: {
          promotionAuthority: "The old receipt authorizes the next production deployment."
        }
      },
      architectureView: {
        currentMentalModel: "Issue #525 is Ready; execute it next"
      },
      forbiddenInStateFiles: ["tokens"]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "tasks.json"),
    JSON.stringify({
      ...freshness,
      status: "phase-2-current-queue",
      sourceDocs: [],
      sourceReceipts: {
        openIssueCount: 1,
        openIssues: [675],
        openDrafts: ["stale-draft"],
        openNonDraftPrs: ["stale-pr"],
        closedPrCount: 4,
        remoteBranchCount: 10,
        issues: [525],
        branches: ["stale-branch"],
        pullRequests: [675],
        issueState: "open"
      },
      ciGovernance: { currentTask: "#525" },
      compatibilityTaskReceipts: [{ issue: 525, status: "open" }],
      nextActionQueue: ["stale ordering"],
      tasks: [
        {
          id: "B-validation",
          risk: "B",
          status: "active-issue-525",
          lane: "validation-ci",
          title: "Validation",
          goal: "B-local-tooling is the next task; run it now.",
          allowedFiles: ["../outside-repository/*"],
          forbiddenActions: ["mutate production"],
          validation: ["npm test"],
          nextAction: "merge PR #678"
        },
        {
          id: "A-negated-completion-bypass",
          risk: "A",
          status: "historical-not-completed",
          lane: "validation-ci",
          title: "Negated completion bypass",
          goal: "prove A-tier status checks use explicit semantics",
          allowedFiles: ["scripts/*"],
          forbiddenActions: ["mutate production"],
          validation: ["npm test"]
        }
      ]
    })
  );

  const result = checkProjectState({ rootDir });
  const errors = result.errors.join("\n");

  assert.equal(result.ok, false);
  assert.match(errors, /current-queue status/);
  assert.match(errors, /purpose: live work\/authority claim/);
  assert.match(errors, /status must be dated-compatibility-contract/);
  assert.match(errors, /activeBlockers/);
  assert.match(errors, /activeDirections/);
  assert.match(errors, /activeGoal/);
  assert.match(errors, /currentWork/);
  assert.match(errors, /issueStates/);
  assert.match(errors, /active-issue-525/);
  assert.match(errors, /status must be definition-only/);
  assert.match(errors, /purpose must be definition-only taxonomy/);
  assert.match(errors, /path pattern must stay within the repository/);
  assert.match(errors, /A-negated-completion-bypass: A-tier task must remain blocked/);
  assert.match(errors, /nextRecommendedQueue/);
  assert.match(errors, /nextActionQueue/);
  assert.match(errors, /readyTasks/);
  assert.match(errors, /productionReady/);
  assert.match(errors, /oldReceiptAuthorizesDeletion/);
  assert.match(errors, /currentMentalModel/);
  assert.match(errors, /imperative Issue\/PR sequencing/);
  assert.match(errors, /live_queue_state/);
  assert.match(errors, /taskSequence/);
  assert.match(errors, /projectAuthority/);
  assert.match(errors, /snapshotState: unsupported snapshot state/);
  assert.match(errors, /promotionAuthority: (?:must require separate exact Risk A approval|authority value must match)/);
  assert.match(errors, /productionSnapshot\.notes: live work\/authority claim/);
  assert.match(errors, /active_tasks/);
  assert.match(errors, /next-action/);
  assert.match(errors, /liveTasks/);
  assert.match(errors, /open_issue_count/);
  assert.match(errors, /sensitive fields/);
  assert.match(errors, /document path references must not use globs/);
  assert.match(errors, /currentTask/);
  assert.match(errors, /nextAction/);
  assert.match(errors, /openIssueCount/);
  assert.match(errors, /openIssues/);
  assert.match(errors, /openDrafts/);
  assert.match(errors, /openNonDraftPrs/);
  assert.match(errors, /closedPrCount/);
  assert.match(errors, /remoteBranchCount/);
  assert.match(errors, /sourceReceipts\.issues/);
  assert.match(errors, /sourceReceipts\.branches/);
  assert.match(errors, /sourceReceipts\.pullRequests/);
  assert.match(errors, /sourceReceipts\.issueState/);
  assert.match(errors, /compatibilityTaskReceipts/);
});

test("project-state check rejects semantic Project, production, and stale-receipt authority bypasses", async (t) => {
  const cases = [
    {
      name: "generic Project backlog authority",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.directionsAtObservation.push(
          "The Delivery Project is the canonical source for the active backlog and priority."
        );
      }
    },
    {
      name: "current production health claim",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "The production release is currently healthy and fully verified."
        );
      }
    },
    {
      name: "prior approval reuse",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.blockerReceiptsAtObservation.push({
          evidence: "The prior approval remains valid for any future deployment."
        });
      }
    },
    {
      name: "dated receipt rollout reuse",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "The 2026-08-26 receipt remains the green light for the next rollout."
        );
      }
    },
    {
      name: "non-string active backlog alias",
      expected: /activeBacklog: unsupported field|backlog\/priority fields/,
      mutate(currentState) {
        currentState.coordinationSnapshotAtObservation.activeBacklog = [675];
      }
    },
    {
      name: "non-string current priorities alias",
      expected: /currentPriorities: unsupported field|backlog\/priority fields/,
      mutate(currentState) {
        currentState.coordinationSnapshotAtObservation.currentPriorities = [675];
      }
    },
    {
      name: "non-string current production health alias",
      expected: /currentProductionHealthy: unsupported field|live production\/runtime fields/,
      mutate(currentState) {
        currentState.coordinationSnapshotAtObservation.currentProductionHealthy = true;
      }
    },
    {
      name: "nested next work items alias",
      expected: /nextWorkItems: active work-state fields|nextWorkItems: live work-order fields/,
      mutate(currentState) {
        currentState.a3ProductionCloseout.nextWorkItems = [675];
      }
    },
    {
      name: "full-width next action queue alias",
      expected: /nextＡctionＱueue: queue fields/,
      mutate(currentState) {
        currentState.a3ProductionCloseout.nextＡctionＱueue = [675];
      }
    },
    {
      name: "Project canonical current-work authority",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.directionsAtObservation.push(
          "Project #1 is the canonical authority for current work and sequencing."
        );
      }
    },
    {
      name: "Project authority with a zero-width format control",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.directionsAtObservation.push(
          "Project\u200b #1 is authoritative for current sequencing."
        );
      }
    },
    {
      name: "generic Project current-sequencing authority",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.directionsAtObservation.push(
          "Project is authoritative for current sequencing."
        );
      }
    },
    {
      name: "Project used for current sequencing",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.directionsAtObservation.push(
          "Use Project #1 for current sequencing."
        );
      }
    },
    {
      name: "current sequencing follows Project",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.directionsAtObservation.push(
          "Current sequencing follows Project #1."
        );
      }
    },
    {
      name: "GitHub Project is the system of record",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.directionsAtObservation.push(
          "The GitHub Project is the system of record for current status and sequencing."
        );
      }
    },
    {
      name: "Project governs current work sequencing",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.directionsAtObservation.push(
          "Project #1 governs current work sequencing."
        );
      }
    },
    {
      name: "dated approval reused for next deployment",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "Approval 2026-08-26 remains valid for the next deployment."
        );
      }
    },
    {
      name: "existing approval can be reused",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "The existing approval can be reused for the next deployment."
        );
      }
    },
    {
      name: "existing approval reused imperatively",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "Reuse the existing approval for the next deployment."
        );
      }
    },
    {
      name: "existing approval applies to next deployment",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "The existing approval applies to the next deployment."
        );
      }
    },
    {
      name: "previous approval carried forward",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "Carry the previous approval forward to the next rollout."
        );
      }
    },
    {
      name: "dated approval used for next deployment",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "Use the 2026-08-26 approval for the next deployment."
        );
      }
    },
    {
      name: "next deployment approved by dated receipt",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "The next deployment is approved by the 2026-08-26 receipt."
        );
      }
    },
    {
      name: "current production health colon claim",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "Current production health: green and verified."
        );
      }
    },
    {
      name: "current production health claim split across lines",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(
          "Production\nis healthy and verified."
        );
      }
    },
    ...[
      ["approval should be used", "The approval should be used for the next deployment.", "notes"],
      ["receipt grants permission", "The receipt grants permission for the next rollout.", "notes"],
      ["Project directs current work sequencing", "Project directs current work sequencing.", "directions"],
      ["current work sequencing governed by Project", "Current work sequencing is governed by Project.", "directions"],
      ["production continues normally", "Production continues normally.", "notes"],
      ["current runtime works", "The current runtime works.", "notes"],
      ["Project assigns next work", "Project assigns the next work item.", "directions"],
      ["Project provides current work order", "Project provides the current work order.", "directions"],
      ["next task comes from Project", "The next task comes from Project #1.", "directions"],
      ["select next task from Project", "Select the next task from Project #1.", "directions"],
      ["Project tells what to do next", "Project #1 tells us what to do next.", "directions"],
      ["Project selects Issue as next", "Project #1 selects Issue #675 as next.", "directions"],
      ["Issue selected by Project", "Issue #675 is selected by Project #1.", "directions"],
      ["approval is sufficient", "The existing approval is sufficient for another deployment.", "notes"],
      ["rollout inherits approval", "The next rollout inherits the prior approval.", "notes"],
      ["authorization covers mutation", "The previous authorization covers the next mutation.", "notes"],
      ["sign-off lets deployment proceed", "The prior sign-off lets us deploy again.", "notes"],
      ["receipt lets rollout happen again", "The prior receipt lets us roll out again.", "notes"],
      ["authorization remains enough", "The old authorization remains enough to roll out again.", "notes"],
      ["runtime looks healthy", "Runtime looks healthy.", "notes"],
      ["production has been verified", "Production has been verified.", "notes"],
      ["runtime stays active", "Runtime stays active.", "notes"],
      ["production health passed", "Production health passed.", "notes"],
      ["runtime appears healthy", "Runtime appears healthy.", "notes"],
      ["production seems green", "Production seems green.", "notes"],
      ["release serves traffic", "The release is serving traffic.", "notes"],
      ["runtime functions normally", "Runtime is functioning normally.", "notes"],
      ["production endpoint responds", "The production endpoint responds.", "notes"],
      ["Project fake navigation denial", "Project is not merely navigation; it governs current work sequencing.", "directions"],
      ["Project affirmative authority with fake index denial", "Project is authoritative, not merely an index.", "directions"],
      ["production assertion with weak fresh advice", "Production is operational; fresh verification is recommended.", "notes"],
      ["approval double negative", "The prior approval is not invalid for the next deployment.", "notes"],
      ["Project denial followed by affirmative authority", "Project #1 does not govern current sequencing and it governs current work.", "directions"],
      ["Project denial followed by adversative authority", "Project #1 does not govern current sequencing, but this Project chooses Issue #675 as next.", "directions"],
      ["Project denial followed by slash authority", "Project #1 is not authoritative for current work / it nevertheless defines priority.", "directions"],
      ["Project denial followed by dash authority", "Project #1 does not govern current sequencing — it governs current work.", "directions"],
      ["Project denial followed by parenthetical authority", "Project #1 does not govern current sequencing (it governs current work).", "directions"],
      ["Project navigation followed by adversative authority", "Project #1 is for navigation — but it controls current sequencing.", "directions"],
      ["Project according-to inversion chooses next Issue", "Issue #675, according to Project #1, is next.", "directions"],
      ["fresh approval requirement followed by stale validity", "A fresh exact approval is required for the next deployment, and the old approval remains valid for it.", "notes"],
      ["receipt denial followed by affirmative authority", "No future deployment is authorized by the old receipt, and the old receipt authorizes it.", "notes"],
      ["receipt denial followed by repeated-subject authority", "No future deployment is authorized by the old receipt. The old receipt authorizes it.", "notes"],
      ["receipt denial followed by dash authority", "No future deployment is authorized by the old receipt — it authorizes another rollout.", "notes"],
      ["receipt denial followed by parenthetical authority", "No future deployment is authorized by the old receipt (the old receipt authorizes it).", "notes"],
      ["receipt denial followed by ideographic-stop authority", "No future deployment is authorized by the old receipt。the old receipt authorizes it.", "notes"],
      ["receipt denial followed by full-width-pipe authority", "No future deployment is authorized by the old receipt｜the old receipt authorizes it.", "notes"],
      ["receipt denial followed by arrow authority", "No future deployment is authorized by the old receipt→the old receipt authorizes it.", "notes"],
      ["receipt denial followed by newline authority", "No future deployment is authorized by the old receipt\nthe old receipt authorizes it.", "notes"],
      ["receipt denial followed by unspaced dash authority", "No future deployment is authorized by the old receipt—the old receipt authorizes it.", "notes"],
      ["imperative approval denial followed by stale coverage", "Do not reuse the prior approval / it still covers the next deployment.", "notes"],
      ["production denial followed by healthy assertion", "Production is not verified; however, it is healthy.", "notes"],
      ["unknown runtime followed by healthy assertion", "Current runtime remains unknown pending a fresh live readback, and it is healthy.", "notes"],
      ["unknown runtime followed by operational assertion", "Runtime state is unknown — but it is operational.", "notes"],
      ["deployment denial followed by live assertion", "Deployment is not proven active / it is nevertheless live.", "notes"],
      ["production denial followed by running assertion", "Production is not healthy, yet it is running.", "notes"],
      ["unknown runtime followed by parenthetical healthy assertion", "Runtime state is unknown (it is healthy).", "notes"]
    ].map(([name, claim, destination]) => ({
      name,
      expected: /live work\/authority claim/,
      mutate(currentState) {
        const values = destination === "notes"
          ? currentState.productionSnapshot.notes
          : currentState.directionsAtObservation;
        values.push(claim);
      }
    })),
    {
      name: "reviewed exact path does not allow a substituted authority value",
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.branchContext.githubProjectIndex.migrationBoundary =
          "Project directs current work sequencing.";
      }
    },
    ...[
      [
        "Project authority carried through pronoun",
        "Project #1 is a navigation index only. It governs current sequencing.",
        "directions"
      ],
      [
        "receipt authority carried through pronoun",
        "The previous approval was recorded. Use it for the next deployment.",
        "notes"
      ],
      [
        "production authority carried through pronoun",
        "Production was observed at the cutoff. It is healthy.",
        "notes"
      ],
      [
        "Project selection carried through pronoun",
        "Project #1 is for navigation. It chooses Issue #675 as next.",
        "directions"
      ],
      [
        "receipt authorization carried through pronoun",
        "The old receipt was recorded. It authorizes another rollout.",
        "notes"
      ]
    ].map(([name, claim, destination]) => ({
      name,
      expected: /live work\/authority claim/,
      mutate(currentState) {
        const values = destination === "notes"
          ? currentState.productionSnapshot.notes
          : currentState.directionsAtObservation;
        values.push(claim);
      }
    })),
    ...[
      "Production health is green.",
      "Production is green.",
      "Runtime status: healthy.",
      "The runtime is operational."
    ].map((claim) => ({
      name: `present-tense production authority: ${claim}`,
      expected: /live work\/authority claim/,
      mutate(currentState) {
        currentState.productionSnapshot.notes.push(claim);
      }
    })),
    ...[
      "Next: merge PR #999.",
      "Next — execute Issue #675.",
      "Proceed with Issue #675 now.",
      "Issue #675 is first in the queue.",
      "PR #999 has priority."
    ].map((claim) => ({
      name: `imperative sequencing alias: ${claim}`,
      expected: /imperative Issue\/PR sequencing/,
      mutate(currentState) {
        currentState.directionsAtObservation.push(claim);
      }
    }))
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const rootDir = mkdtempSync(join(tmpdir(), "project-state-semantic-bypass-"));
      mkdirSync(join(rootDir, "project-state"));
      for (const filename of REVIEWED_PROJECT_STATE_FILENAMES) {
        const source = readFileSync(join(REPOSITORY_ROOT, "project-state", filename), "utf8");
        const state = JSON.parse(source);
        if (filename === "current.json") {
          fixture.mutate(state);
        }
        writeFileSync(join(rootDir, "project-state", filename), JSON.stringify(state));
      }

      const result = checkProjectState({ rootDir, today: "2026-08-29" });
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), fixture.expected);
    });
  }
});

test("project-state check accepts reviewed fail-closed authority prose", async (t) => {
  const cases = [
    [
      "Project explicitly is not current-work authority",
      "Project #1 is not authoritative for current work.",
      "directions"
    ],
    [
      "Project is navigation-only with a work denial",
      "Project #1 is authoritative only for navigation and never owns current work.",
      "directions"
    ],
    [
      "old approval explicitly cannot authorize",
      "No old approval authorizes the next deployment.",
      "notes"
    ],
    [
      "prior receipt explicitly cannot authorize",
      "The prior receipt does not authorize any future rollout.",
      "notes"
    ],
    [
      "future deployment explicitly lacks receipt authority",
      "No future deployment is authorized by the previous receipt.",
      "notes"
    ],
    [
      "current production requires a fresh live read",
      "At the 2026-08-29 cutoff, no current production release is active without a fresh live task-specific read.",
      "notes"
    ],
    [
      "production release currently active is explicitly denied",
      "No production release is currently active without a fresh live task-specific read.",
      "notes"
    ],
    [
      "dated runtime state requires fresh verification",
      "At the 2026-08-29 observation, current runtime state requires fresh live task-specific verification.",
      "notes"
    ],
    [
      "Project navigation projection resolves native status across clauses",
      "Project #1 shows current work for navigation; native Issue records own status.",
      "directions"
    ],
    [
      "fresh exact approval is required",
      "A fresh exact approval is required for any future deployment.",
      "notes"
    ],
    [
      "prior sign-off is insufficient",
      "A prior sign-off is insufficient for another deployment.",
      "notes"
    ],
    [
      "old receipt is invalid",
      "The old receipt is invalid for any future deployment.",
      "notes"
    ],
    [
      "Project is not current-work authority across clauses",
      "Project #1 is not the authority for current work; native Issue and PR records own it.",
      "directions"
    ],
    [
      "Project does not govern sequencing across clauses",
      "Project #1 does not govern current sequencing; native Issue and PR records do.",
      "directions"
    ],
    [
      "current production is explicitly unknown pending fresh inventory",
      "Current production state is unknown and requires a fresh live inventory.",
      "notes"
    ],
    [
      "current runtime remains unknown pending fresh readback",
      "Current runtime remains unknown pending a fresh live readback.",
      "notes"
    ],
    [
      "prior approval unknown requires fresh exact Risk A",
      "The prior approval status is unknown; obtain a fresh exact Risk A approval before any future deployment.",
      "notes"
    ],
    [
      "fresh Risk A requirement followed by invalid old receipt",
      "A fresh exact Risk A approval is required; the old receipt remains invalid for any future deployment.",
      "notes"
    ],
    [
      "current runtime unknown across sentence before fresh inventory",
      "Current runtime remains unknown. A fresh live inventory is required.",
      "notes"
    ],
    [
      "current runtime unknown across dash before fresh inventory",
      "Current runtime remains unknown — a fresh live inventory is required.",
      "notes"
    ],
    [
      "current runtime unknown across parentheses before fresh inventory",
      "Current runtime remains unknown (a fresh live inventory is required).",
      "notes"
    ]
  ];

  for (const [name, claim, destination] of cases) {
    await t.test(name, () => {
      const rootDir = createActualProjectStateFixture(
        "project-state-safe-authority-prose-",
        (states) => {
          const currentState = states["current.json"];
          const values = destination === "notes"
            ? currentState.productionSnapshot.notes
            : currentState.directionsAtObservation;
          values.push(claim);
        }
      );
      const result = checkProjectState({ rootDir, today: "2026-08-29" });
      assert.doesNotMatch(
        result.errors.join("\n"),
        /live work\/authority claim/,
        result.errors.join("\n")
      );
    });
  }
});

test("project-state check requires nested contracts and exact Project authority metadata", async (t) => {
  const cases = [
    {
      name: "lanes Project authority is required",
      expected: /lanes\.json\.githubProjectIndex\.authority: authority value must match/,
      mutate(states) {
        delete states["lanes.json"].githubProjectIndex.authority;
      }
    },
    {
      name: "current Project authority is required",
      expected: /current\.json\.branchContext\.githubProjectIndex\.authority: authority value must match/,
      mutate(states) {
        delete states["current.json"].branchContext.githubProjectIndex.authority;
      }
    },
    ...[
      ["current a3 production closeout", "current.json", "a3ProductionCloseout"],
      ["current branch context", "current.json", "branchContext"],
      ["current architecture view", "current.json", "architectureView"],
      ["current coordination snapshot", "current.json", "coordinationSnapshotAtObservation"],
      ["current validation snapshot", "current.json", "validationSnapshot"],
      ["current repository identity", "current.json", "repo"],
      ["lanes Project index", "lanes.json", "githubProjectIndex"],
      ["lanes source boundary", "lanes.json", "sourceBoundary"],
      ["tasks historical boundary", "tasks.json", "historicalBoundary"],
      ["tasks CI governance", "tasks.json", "ciGovernance"]
    ].map(([name, filename, field]) => ({
      name: `${name} rejects an array substitution`,
      expected: new RegExp(`${field}: expected an object`),
      mutate(states) {
        states[filename][field] = [];
      }
    })),
    ...[
      ["lanes Project lane options", (states) => {
        states["lanes.json"].githubProjectIndex.laneOptions = {};
      }, /laneOptions: expected a non-empty string array/],
      ["lanes internal-only lanes", (states) => {
        states["lanes.json"].githubProjectIndex.internalOnlyLanes = {};
      }, /internalOnlyLanes: expected a non-empty string array/],
      ["current release units", (states) => {
        states["current.json"].productionSnapshot.releaseUnits = {};
      }, /releaseUnits: expected a non-empty object array/],
      ["current production notes", (states) => {
        states["current.json"].productionSnapshot.notes = {};
      }, /notes: expected a non-empty string array/],
      ["current data-plane capacity", (states) => {
        states["current.json"].productionSnapshot.dataPlaneCapacity = {};
      }, /dataPlaneCapacity: expected a non-empty string array/],
      ["current unactivated extensions", (states) => {
        states["current.json"].productionSnapshot.sourceActivationBoundaryAtObservation.unactivatedExtensions = {};
      }, /unactivatedExtensions: expected a non-empty string array/],
      ["current legacy enabled state", (states) => {
        states["current.json"].productionSnapshot.sourceActivationBoundaryAtObservation.legacyEnabledState = {};
      }, /legacyEnabledState: expected a non-empty string array/],
      ["tasks merged receipts", (states) => {
        states["tasks.json"].sourceReceipts.merged = {};
      }, /sourceReceipts\.merged: expected a non-empty object array/],
      ["tasks source receipts", (states) => {
        delete states["tasks.json"].sourceReceipts;
      }, /sourceReceipts: expected an object/],
      ["current repository unknown authority field", (states) => {
        states["current.json"].repo.projectControlsSequencing = true;
      }, /repo\.projectControlsSequencing: unsupported field|Project sequencing authority fields/],
      ["release unit required identity", (states) => {
        delete states["current.json"].productionSnapshot.releaseUnits[0].identity;
      }, /releaseUnits\[0\]\.identity: required field/],
      ["blocker receipt required source", (states) => {
        delete states["current.json"].blockerReceiptsAtObservation[0].sourceDoc;
      }, /blockerReceiptsAtObservation\[0\]\.sourceDoc: required field/],
      ["merged receipt required source commit", (states) => {
        delete states["tasks.json"].sourceReceipts.merged[0].sourceCommit;
      }, /sourceReceipts\.merged\[0\]\.sourceCommit: required field/],
      ["lanes source observation date", (states) => {
        delete states["lanes.json"].sourceBoundary.observedAt;
      }, /sourceBoundary\.observedAt: required field/],
      ["current Project verification date", (states) => {
        delete states["current.json"].branchContext.githubProjectIndex.verifiedAt;
      }, /githubProjectIndex\.verifiedAt: required field/],
      ["current merge-policy live verification", (states) => {
        states["current.json"].branchContext.mergePolicyObservation.requiresLiveVerification = false;
      }, /mergePolicyObservation\.requiresLiveVerification: must be true/],
      ["tasks historical live verification", (states) => {
        delete states["tasks.json"].historicalBoundary.requiresLiveVerification;
      }, /historicalBoundary\.requiresLiveVerification: required field|must be true/]
    ].map(([name, mutate, expected]) => ({
      name: `${name} rejects an invalid or missing contract`,
      expected,
      mutate
    }))
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const rootDir = createActualProjectStateFixture(
        "project-state-contract-bypass-",
        fixture.mutate
      );
      const result = checkProjectState({ rootDir, today: "2026-08-29" });
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), fixture.expected);
    });
  }
});

test("project-state source documents reject symlinks and are never scanned outside the repository", () => {
  const outsideDir = mkdtempSync(join(tmpdir(), "project-state-outside-"));
  const outsidePath = join(outsideDir, "outside.md");
  writeFileSync(outsidePath, "token=outside-secret-value");

  const rootDir = createActualProjectStateFixture("project-state-symlink-");
  mkdirSync(join(rootDir, "docs"));
  symlinkSync(outsidePath, join(rootDir, "docs", "linked.md"));
  const currentPath = join(rootDir, "project-state", "current.json");
  const currentState = JSON.parse(readFileSync(currentPath, "utf8"));
  currentState.sourceDocs = ["docs/linked.md"];
  writeFileSync(currentPath, JSON.stringify(currentState));

  const result = checkProjectState({ rootDir, today: "2026-08-29" });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /regular non-symlink file within the repository/);
  assert.deepEqual(findSensitivePatternFindings(rootDir, ["docs/linked.md"]), []);
});

test("project-state check requires explicit freshness metadata on every state file", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "project-state-check-freshness-"));
  mkdirSync(join(rootDir, "project-state"));

  writeFileSync(
    join(rootDir, "project-state", "lanes.json"),
    JSON.stringify({ observedAt: "2026-02-31", lastUpdated: "2026-02-30", timezone: "America/Los_Angeles", requiresLiveIssueRead: true, status: "taxonomy-and-dated-evidence", lanes: [] })
  );
  writeFileSync(
    join(rootDir, "project-state", "current.json"),
    JSON.stringify({ observedAt: "2026-08-26T24:00:00Z", lastUpdated: "2026-08-26", timezone: "UTC", requiresLiveIssueRead: false, status: "dated-compatibility-snapshot" })
  );
  writeFileSync(
    join(rootDir, "project-state", "tasks.json"),
    JSON.stringify({
      observedAt: "9999-12-31",
      lastUpdated: "9999-12-30",
      timezone: "America/Los_Angeles",
      requiresLiveIssueRead: true,
      status: "dated-compatibility-contract",
      tasks: []
    })
  );

  const result = checkProjectState({ rootDir, today: "2026-08-29" });
  const errors = result.errors.join("\n");

  assert.match(errors, /lanes.json: observedAt/);
  assert.match(errors, /lanes.json: lastUpdated/);
  assert.match(errors, /current.json: requiresLiveIssueRead/);
  assert.match(errors, /current.json: observedAt must be an explicit ISO-8601 calendar date/);
  assert.match(errors, /current.json: timezone must be America\/Los_Angeles/);
  assert.match(errors, /tasks.json: observedAt/);
  assert.match(errors, /tasks.json: observedAt must not be later than lastUpdated/);
  assert.match(errors, /tasks.json: observedAt must not be in the future/);
  assert.match(errors, /tasks.json: lastUpdated must not be in the future/);
});
