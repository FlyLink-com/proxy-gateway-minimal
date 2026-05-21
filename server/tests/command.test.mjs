import assert from "node:assert/strict";
import test from "node:test";
import { runCommand, createCommandRunner } from "../services/command.mjs";

test("runCommand captures stdout and exit code", async () => {
  const result = await runCommand(process.execPath, ["-e", "console.log('ok')"], { timeoutMs: 2000 });

  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "ok");
  assert.equal(result.stderr, "");
  assert.equal(result.timedOut, false);
});

test("runCommand reports timeout", async () => {
  const result = await runCommand(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 100 });

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
});

test("createCommandRunner blocks unknown commands", async () => {
  const runner = createCommandRunner({
    known: { command: process.execPath, args: ["-e", "console.log('known')"], timeoutMs: 2000 }
  });

  assert.deepEqual(await runner("missing"), {
    ok: false,
    code: -1,
    stdout: "",
    stderr: "Command not allowed: missing",
    timedOut: false
  });
});

test("createCommandRunner runs known command specs", async () => {
  const runner = createCommandRunner({
    known: { command: process.execPath, args: ["-e", "console.log('known')"], timeoutMs: 2000 }
  });

  const result = await runner("known");
  assert.equal(result.ok, true);
  assert.equal(result.stdout, "known");
});
