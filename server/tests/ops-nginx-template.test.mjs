import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const PUBLIC_NGINX_TEMPLATES = [
  "ops/nginx/proxy-gateway-public.conf",
  "ops/edge-node/nginx/proxy-gateway-public.conf"
];

for (const relativePath of PUBLIC_NGINX_TEMPLATES) {
  test(`${relativePath} uses the active gccwebos subscription gateway host`, () => {
    const content = readFileSync(resolve(ROOT, relativePath), "utf8");

    assert.match(content, /server_name\s+sub\.gccwebos\.com\s+_;/);
    assert.doesNotMatch(content, /sub\.globalcirclecat\.com/);
  });
}
