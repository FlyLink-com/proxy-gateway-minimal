import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("../../", import.meta.url)));

test("retired Aliyun TUIC template is archive-only and absent from active config", () => {
  const activeTemplatePath = resolve(rootDir, "config", "proxy-servers.aliyun-local-tuic.template.json");
  const archivedTemplatePath = resolve(
    rootDir,
    "docs",
    "archive",
    "runtime-templates",
    "proxy-servers.aliyun-local-tuic.template.json"
  );

  assert.equal(existsSync(activeTemplatePath), false);
  assert.equal(existsSync(archivedTemplatePath), true);

  const archivedTemplate = JSON.parse(readFileSync(archivedTemplatePath, "utf8"));
  assert.equal(archivedTemplate.archiveOnly, true);
  assert.equal(archivedTemplate.currentRuntimeTemplate, false);
  assert.match(archivedTemplate.templatePurpose, /historical/i);
});
