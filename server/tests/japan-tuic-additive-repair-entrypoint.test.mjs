import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SourceTextModule } from "node:vm";

const ENTRYPOINT_URL = new URL(
  "../../scripts/japan-tuic-additive-repair-entrypoint.sh",
  import.meta.url
);

const EXPECTED_ENTRYPOINT = `#!/usr/bin/dash
set -eu
exec /usr/bin/env -i LANG=C.UTF-8 PATH=/usr/bin:/bin \\
  /usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 \\
  /var/lib/gccgw/japan-tuic-additive-repair/repair.lock \\
  /usr/bin/node --disable-proto=throw --import=/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs \\
  /usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs \\
  --binding /etc/gccgw/japan-tuic-additive-repair-binding.json
`;

test("forced entrypoint bytes are the exact no-variable command", () => {
  const source = readFileSync(ENTRYPOINT_URL, "utf8");
  assert.equal(source, EXPECTED_ENTRYPOINT);
  assert.equal(source.match(/exec \/usr\/bin\/env -i/g)?.length, 1);
  assert.match(source, /LANG=C\.UTF-8 PATH=\/usr\/bin:\/bin/);
  assert.match(source, /\/usr\/bin\/flock --exclusive --nonblock --conflict-exit-code 75/);
  assert.match(source, /\/var\/lib\/gccgw\/japan-tuic-additive-repair\/repair\.lock/);
  assert.match(
    source,
    /\/usr\/bin\/node --disable-proto=throw --import=\/usr\/local\/libexec\/gccgw\/japan-tuic-additive-repair-bootstrap\.mjs \\\n  \/usr\/local\/libexec\/gccgw\/japan-tuic-additive-repair-runner\.mjs/
  );
  assert.match(source, /\/usr\/local\/libexec\/gccgw\/japan-tuic-additive-repair-runner\.mjs/);
  assert.match(source, /--binding \/etc\/gccgw\/japan-tuic-additive-repair-binding\.json/);
  assert.equal(source.split("\n").length - 1, 8);
});

test("forced entrypoint exposes no alternate command surface", () => {
  const source = readFileSync(ENTRYPOINT_URL, "utf8");
  assert.doesNotMatch(source, /\$SSH_ORIGINAL_COMMAND|\beval\b|\bsh\s+-c\b/);
  assert.doesNotMatch(source, /NODE_OPTIONS|NODE_PATH/);
  assert.doesNotMatch(source, /\$\{|\$\(|`/);
  assert.equal(source.match(/^exec\s/gm)?.length, 1);
  assert.equal(source.match(/^\s+\/usr\/local\/libexec\/gccgw\//gm)?.length, 1);
});

test("runner static ESM closure is exactly the four reviewed modules and builtin allowlist", () => {
  const scriptsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts");
  const entry = resolve(scriptsRoot, "japan-tuic-additive-repair-runner.mjs");
  const pending = [entry];
  const visited = new Set();
  const builtins = new Set();
  const localNames = [];
  while (pending.length > 0) {
    const path = pending.shift();
    if (visited.has(path)) continue;
    visited.add(path);
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /\bcreateRequire\b|\brequire\s*\(/);
    const module = new SourceTextModule(source, { identifier: path });
    const requests = module.moduleRequests?.map((request) => request.specifier)
      ?? module.dependencySpecifiers;
    for (const specifier of requests) {
      assert.doesNotMatch(specifier, /[?#]/);
      assert.notEqual(specifier, "node:module");
      assert.doesNotMatch(specifier, /^(?:file:|data:|\/)/);
      if (specifier.startsWith("node:")) {
        builtins.add(specifier);
        continue;
      }
      assert.match(specifier, /^\.\/japan-tuic-additive-repair-(?:contract|frame|state)\.mjs$/);
      const child = resolve(dirname(path), specifier);
      localNames.push(child);
      pending.push(child);
    }
  }
  assert.deepEqual(
    [...visited].map((path) => path.slice(scriptsRoot.length + 1)).sort(),
    [
      "japan-tuic-additive-repair-contract.mjs",
      "japan-tuic-additive-repair-frame.mjs",
      "japan-tuic-additive-repair-runner.mjs",
      "japan-tuic-additive-repair-state.mjs"
    ]
  );
  assert.deepEqual([...new Set(localNames)].sort(), [...visited].filter((path) => path !== entry).sort());
  assert.deepEqual([...builtins].sort(), [
    "node:child_process",
    "node:crypto",
    "node:fs",
    "node:fs/promises",
    "node:path",
    "node:url",
    "node:util"
  ]);
  const runner = readFileSync(entry, "utf8");
  assert.equal(runner.match(/\bimport\s*\(/g)?.length, 1);
  assert.match(
    runner,
    /import\(pathToFileURL\(join\([\s\S]*?root,[\s\S]*?"scripts",[\s\S]*?"traffic-accounting-natural-observation\.mjs"/
  );
});
