import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RUNNER_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/native/welcome-coins-custody-synthetic-runner.c"
);
const CHILD_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/fixtures/welcome-coins-custody-synthetic-child.mjs"
);

function requiredSource(path, label) {
  assert.equal(existsSync(path), true, label + " source must exist");
  return readFileSync(path, "utf8");
}

test("test-only custody synthetic runner drives the fixed native controller protocol", () => {
  const runner = requiredSource(RUNNER_PATH, "synthetic runner");
  const child = requiredSource(CHILD_PATH, "synthetic child");

  for (const requiredValue of [
    "WELCOME_COINS_SETUP_MAGIC",
    "welcome_coins_native_setup_v1",
    "welcome_coins_native_ready_v1",
    "welcome_coins_native_authorize_v1",
    "welcome_coins_native_acquired_v1",
    "welcome_coins_native_commit_v1",
    "welcome_coins_native_held_v1",
    "welcome_coins_native_release_v1",
    "WELCOME_COINS_CONTROLLER_FD 7",
    "WELCOME_COINS_SYNTHETIC_LAUNCHER_PATH"
  ]) {
    assert.equal(
      runner.includes(requiredValue),
      true,
      "synthetic runner must bind " + requiredValue
    );
  }

  assert.match(runner, /socketpair\s*\(\s*AF_UNIX\s*,\s*SOCK_STREAM/u);
  assert.match(runner, /getpwnam\s*\(\s*"nobody"\s*\)/u);
  assert.match(runner, /\bexecve\s*\(/u);
  assert.match(runner, /\bwaitpid\s*\(/u);
  assert.doesNotMatch(
    runner,
    /\b(?:system|popen|execvp|execvpe|execlp|posix_spawnp)\s*\(/u
  );

  assert.match(
    child,
    /writeSync\s*\(\s*4\s*,\s*"synthetic-acquired\\n"\s*\)/u
  );
  assert.match(child, /readFileSync\s*\(\s*5\s*,\s*"utf8"\s*\)/u);
  assert.match(
    child,
    /writeSync\s*\(\s*4\s*,\s*"synthetic-held\\n"\s*\)/u
  );
  assert.match(child, /closeSync\s*\(\s*4\s*\)/u);
  assert.doesNotMatch(
    child,
    /\b(?:process\.env|child_process|net\.|fetch\s*\()/u
  );
});


test("compile-time synthetic diagnostics preserve the public post-exec condition", () => {
  const launcher = requiredSource(
    resolve(REPOSITORY_ROOT, "scripts/native/welcome-coins-custody-launcher.c"),
    "native launcher"
  );
  const main = launcher.slice(launcher.indexOf("int main("));

  assert.match(launcher, /#ifdef WELCOME_COINS_SYNTHETIC_DIAGNOSTIC/u);
  assert.match(launcher, /emit_blocked\("post_exec_security_invalid"\)/u);
  assert.match(launcher, /synthetic_post_exec_barrier_invalid/u);
  assert.match(launcher, /synthetic_post_exec_pipe_invalid/u);
  assert.match(launcher, /synthetic_post_exec_ptrace_setoptions_invalid/u);
  assert.match(launcher, /synthetic_post_exec_exec_event_invalid/u);
  assert.match(launcher, /synthetic_post_exec_bootstrap_process_invalid/u);
  assert.match(launcher, /synthetic_post_exec_status_identity_invalid/u);
  assert.match(launcher, /synthetic_post_exec_status_parent_invalid/u);
  assert.match(launcher, /synthetic_post_exec_status_security_invalid/u);
  assert.match(launcher, /synthetic_post_exec_status_namespace_invalid/u);
  assert.doesNotMatch(
    launcher,
    /\b(?:strerror|perror|fprintf)\s*\(/u
  );
  assert.match(
    main,
    /if\s*\(\s*establish_exec_barrier[\s\S]*?emit_post_exec_security_invalid/u
  );
  assert.match(
    main,
    /fstat\s*\(\s*acquired_pipe\[1\][\s\S]*?emit_post_exec_security_invalid/u
  );
});
