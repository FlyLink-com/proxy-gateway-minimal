#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);

if (!args.includes("--execute-production-mutation")) {
  console.error("--execute-production-mutation is required for install bootstrap.");
  process.exit(1);
}

if (!args.includes("--apply")) {
  console.error("--apply is required and is passed to ops/edge-node/bootstrap.sh.");
  process.exit(1);
}

const removeDefaultNginxSite = args.includes("--remove-default-nginx-site");

const unsupported = args.filter((arg) => ![
  "--execute-production-mutation",
  "--apply",
  "--remove-default-nginx-site"
].includes(arg));
if (unsupported.length > 0) {
  console.error("unsupported install bootstrap argument");
  process.exit(1);
}

if (process.platform !== "linux") {
  console.error("install bootstrap can only run on a Linux server host.");
  process.exit(1);
}

const scriptPath = resolve("ops/edge-node/bootstrap.sh");
const result = spawnSync("bash", [scriptPath, "--apply"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...(removeDefaultNginxSite ? { REMOVE_DEFAULT_NGINX_SITE: "true" } : {})
  },
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
