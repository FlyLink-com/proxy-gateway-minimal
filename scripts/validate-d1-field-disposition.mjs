import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateD1FieldDisposition } from "../server/services/platform/d1-field-disposition-contract.mjs";

const inventoryPath = process.argv[2] ?? "docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json";
const dispositionPath = process.argv[3] ?? "docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json";
const inventoryBytes = readFileSync(inventoryPath);
const dispositionBytes = readFileSync(dispositionPath);
const inventory = JSON.parse(inventoryBytes.toString("utf8"));
const disposition = JSON.parse(dispositionBytes.toString("utf8"));
const sourceInventoryBlob = createHash("sha1")
  .update(`blob ${inventoryBytes.length}\0`)
  .update(inventoryBytes)
  .digest("hex");
const result = validateD1FieldDisposition({ inventory, disposition, sourceInventoryBlob });
if (!result.valid) {
  process.stderr.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({
    valid: true,
    sourceCommit: inventory.sourceCommit,
    sourceInventoryBlob,
    ...result.actualCounts
  }, null, 2) + "\n");
}
