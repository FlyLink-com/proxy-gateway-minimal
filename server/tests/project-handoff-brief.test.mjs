import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHandoffBriefRequest,
  loadContextBundle,
  redactSecrets,
  runProjectHandoffBrief
} from "../../scripts/project-handoff-brief.mjs";

test("handoff brief redacts raw secret patterns", () => {
  const redacted = redactSecrets("token=super-secret-value password=not-safe ss://abc123xyz");
  assert.match(redacted, /\[REDACTED\]/);
  assert.doesNotMatch(redacted, /super-secret-value/);
});

test("handoff brief loads repository context and caches the stable prefix", () => {
  const bundle = loadContextBundle(process.cwd());
  assert.ok(bundle.sources.includes("docs/PROJECT_CONTEXT.md"));
  assert.ok(bundle.text.includes("## docs/PROJECT_CONTEXT.md"));

  const request = buildHandoffBriefRequest({
    contextBundle: bundle,
    focus: "resume Gate 11 follow-up"
  });

  assert.equal(request.model, "claude-opus-4-7");
  assert.equal(request.thinking.type, "adaptive");
  assert.equal(request.output_config.format.type, "json_schema");
  assert.equal(request.system.at(-1).cache_control.type, "ephemeral");
  assert.match(request.messages[0].content, /resume Gate 11 follow-up/);
});

test("handoff brief dry-run reports prompt caching plan without API access", async () => {
  const code = await runProjectHandoffBrief(["--dry-run", "--json"], {
    rootDir: process.cwd()
  });
  assert.equal(code, 0);
});
