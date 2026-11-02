// Shared open-PR scope evaluation for readiness summaries.
//
// The previous repoState.noOpenPrs boolean blocked readiness on ANY open PR
// in the repository. The scoped model records evidence instead: the full
// list of currently open PR refs plus the subset declared blocking for the
// specific readiness scope. Readiness is blocked only when a declared
// blocking PR is actually open, or when the scope evidence was not recorded
// at all. Unrelated open PRs never block. Both readiness summaries evaluate
// the scope through this module so the rule exists exactly once.

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const SENSITIVE_TEXT_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;

function safeRefList(values, throwSafeError) {
  if (!Array.isArray(values)) {
    throw throwSafeError();
  }
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || !SAFE_REF_PATTERN.test(normalized) || SENSITIVE_TEXT_PATTERN.test(normalized)) {
      throw throwSafeError();
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

// Returns null when the scope evidence was not recorded (either ref list
// missing); callers must treat that as a blocker, never as a clear scope.
export function parseOpenPrScope(input, throwSafeError) {
  const source = input ?? {};
  if (!Object.hasOwn(source, "openPrRefs") || !Object.hasOwn(source, "blockingPrRefs")) {
    return null;
  }
  const openPrRefs = safeRefList(source.openPrRefs, throwSafeError);
  const blockingPrRefs = safeRefList(source.blockingPrRefs, throwSafeError);
  const open = new Set(openPrRefs);
  const blockingOpenPrRefs = blockingPrRefs.filter((ref) => open.has(ref));
  return {
    openPrRefs,
    blockingPrRefs,
    blockingOpenPrRefs,
    clear: blockingOpenPrRefs.length === 0
  };
}

export function openPrScopeBlockers(scope) {
  if (!scope) return ["open PR scope evidence is not recorded"];
  return scope.clear ? [] : ["scoped blocking PRs are still open"];
}

export function openPrScopeOutput(scope) {
  return {
    openPrScopeRecorded: Boolean(scope),
    openPrRefs: scope?.openPrRefs ?? [],
    blockingPrRefs: scope?.blockingPrRefs ?? [],
    blockingOpenPrRefs: scope?.blockingOpenPrRefs ?? []
  };
}
