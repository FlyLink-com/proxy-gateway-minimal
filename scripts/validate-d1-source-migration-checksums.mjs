import { readFileSync } from "node:fs";
import { validateD1SourceMigrationChecksums } from "../server/services/platform/d1-source-migration-registry.mjs";

const path = process.argv[2] ?? "docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json";
const inventory = JSON.parse(readFileSync(path, "utf8"));
const result = validateD1SourceMigrationChecksums(inventory);
if (!result.valid) {
  process.stderr.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({
    valid: true,
    sourceCommit: inventory.sourceCommit,
    ...result
  }, null, 2) + "\n");
}
