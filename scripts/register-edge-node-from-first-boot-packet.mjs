import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { buildEdgeNodeRegistrationRecordFromFirstBootPacket } from "../server/services/edge/node-registration-ingestion.mjs";

const USAGE = "Usage: node scripts/register-edge-node-from-first-boot-packet.mjs --packet <packet.json> --db <control.sqlite> [--apply]";

function parseArgs(argv) {
  const result = { packetPath: "", dbPath: "", apply: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--apply") {
      result.apply = true;
    } else if (arg === "--packet" || arg === "--db") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        const error = new Error("missing_argument_value");
        error.code = "validation_error";
        throw error;
      }
      if (arg === "--packet") result.packetPath = value;
      else result.dbPath = value;
      index += 1;
    } else {
      const error = new Error("unknown_argument");
      error.code = "validation_error";
      throw error;
    }
  }
  if (!result.help && (!result.packetPath || !result.dbPath)) {
    const error = new Error("required_arguments_missing");
    error.code = "validation_error";
    throw error;
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const packetPath = resolve(args.packetPath);
  const dbPath = resolve(args.dbPath);
  const firstBootPacket = JSON.parse(readFileSync(packetPath, "utf8"));
  const record = buildEdgeNodeRegistrationRecordFromFirstBootPacket(firstBootPacket);

  if (
    record.status !== "inactive"
    || record.pool !== "private"
    || record.lifecycle !== "private-validation"
  ) {
    const error = new Error("registration_must_remain_private_and_inactive");
    error.code = "registration_gate_violation";
    throw error;
  }

  if (!args.apply) {
    console.log(JSON.stringify({
      ok: true,
      mode: "dry_run",
      registration: record
    }, null, 2));
    return;
  }

  const store = createSqliteSubscriptionControlStore({ dbPath });
  try {
    const registered = store.upsertEdgeRegisteredNode(record);
    if (
      registered.status !== "inactive"
      || registered.pool !== "private"
      || registered.lifecycle !== "private-validation"
    ) {
      const error = new Error("registration_state_not_private");
      error.code = "registration_gate_violation";
      throw error;
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "registered_inactive",
      nodeRef: registered.nodeRef,
      physicalNodeRef: registered.physicalNodeRef,
      channelRefs: registered.channelRefs,
      pool: registered.pool,
      lifecycle: registered.lifecycle,
      status: registered.status,
      firstBootPacketRef: registered.firstBootPacketRef
    }, null, 2));
  } finally {
    store.close();
  }
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error?.code || "registration_failed"
  }));
  process.exitCode = 1;
}
