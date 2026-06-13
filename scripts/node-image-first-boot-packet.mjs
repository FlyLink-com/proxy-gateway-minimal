import { readFileSync } from "node:fs";
import { buildNodeImageFirstBootPacket } from "../server/services/node-image-first-boot-packet.mjs";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("failed to read node image first-boot packet input");
  }
}

function main(argv) {
  if (argv.length !== 1) {
    throw new Error("node image first-boot packet requires one safe inventory file path");
  }

  return buildNodeImageFirstBootPacket(readJson(argv[0]));
}

try {
  const packet = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`node image first-boot packet failed: ${error.message}\n`);
  process.exitCode = 1;
}
