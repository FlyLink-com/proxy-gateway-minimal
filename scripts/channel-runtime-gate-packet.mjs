import { readFileSync } from "node:fs";
import { buildChannelRuntimeGatePacket } from "../server/services/channel-runtime-gate-packet.mjs";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("failed to read channel runtime gate packet input");
  }
}

function main(argv) {
  if (argv.length !== 1) {
    throw new Error("channel runtime gate packet requires one runtime registry file path");
  }

  return buildChannelRuntimeGatePacket({
    runtimeRegistry: readJson(argv[0])
  });
}

try {
  const packet = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel runtime gate packet failed: ${error.message}\n`);
  process.exitCode = 1;
}
