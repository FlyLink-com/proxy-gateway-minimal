import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const LAUNCHER_SOURCE = new URL(
  "../../scripts/native/welcome-coins-custody-launcher.c",
  import.meta.url
);
const PRELOAD_SOURCE = new URL(
  "../../scripts/native/welcome-coins-post-exec-bootstrap.c",
  import.meta.url
);

function source(url) {
  return readFileSync(url, "utf8");
}

test("native custody launcher is a fixed no-argument root broker", () => {
  const value = source(LAUNCHER_SOURCE);

  assert.match(value, /int\s+main\s*\(\s*int\s+argc\s*,\s*char\s*\*\*\s*argv\s*\)/u);
  assert.match(value, /argc\s*!=\s*1/u);
  assert.match(value, /geteuid\s*\(\s*\)\s*!=\s*0/u);
  assert.match(value, /WELCOME_COINS_CONTROLLER_FD\s+7/u);
  assert.match(value, /WELCOME_COINS_BOOTSTRAP_FD\s+6/u);
  assert.match(value, /\/usr\/bin\/node/u);
  assert.match(value, /control-plane-welcome-coins-activation-transaction-custody-cli\.mjs/u);
  assert.doesNotMatch(value, /\bsystem\s*\(|\bpopen\s*\(|\/bin\/(?:ba)?sh|execlp|execvp/u);
  assert.doesNotMatch(value, /argv\s*\[\s*[1-9]/u);
});

test("launcher owns the ptrace exec barrier and complete privilege drop", () => {
  const value = source(LAUNCHER_SOURCE);

  for (const token of [
    "PTRACE_TRACEME",
    "PTRACE_O_TRACEEXEC",
    "PTRACE_EVENT_EXEC",
    "PTRACE_DETACH",
    "setgroups",
    "setresgid",
    "setresuid",
    "PR_CAPBSET_DROP",
    "PR_CAP_AMBIENT_CLEAR_ALL",
    "PR_SET_NO_NEW_PRIVS",
    "capset",
    "waitpid"
  ]) {
    assert.match(value, new RegExp(`\\b${token}\\b`, "u"), token);
  }
  assert.match(value, /TracerPid/u);
  assert.match(value, /NoNewPrivs/u);
  assert.match(value, /CapInh/u);
  assert.match(value, /CapPrm/u);
  assert.match(value, /CapEff/u);
  assert.match(value, /CapBnd/u);
  assert.match(value, /CapAmb/u);
  assert.match(value, /NSpid/u);
  assert.match(value, /kill\s*\([^,]+,\s*SIGKILL\s*\)/u);
});

test("launcher releases exactly FD3 FD4 FD5 through SCM_RIGHTS after root authorization", () => {
  const value = source(LAUNCHER_SOURCE);

  assert.match(value, /SCM_RIGHTS/u);
  assert.match(value, /CMSG_LEN\s*\(\s*sizeof\s*\(\s*int\s*\)\s*\*\s*3U?\s*\)/u);
  assert.match(value, /SO_PEERCRED/u);
  assert.match(value, /require_root_stream_peer/u);
  assert.match(value, /socket_type\s*!=\s*SOCK_STREAM/u);
  assert.match(value, /receive_exact_bytes/u);
  assert.match(value, /receive_frame_packet/u);
  assert.doesNotMatch(value, /socket_type\s*!=\s*SOCK_SEQPACKET/u);
  assert.match(value, /memfd_create/u);
  assert.match(value, /MFD_ALLOW_SEALING/u);
  assert.match(value, /F_ADD_SEALS/u);
  assert.match(value, /F_SEAL_WRITE/u);
  assert.match(value, /welcome_coins_native_authorize/u);
  assert.match(value, /sendmsg\s*\(/u);
  assert.match(value, /SIGCONT/u);
  assert.match(value, /poll\s*\(/u);
  assert.match(value, /WELCOME_COINS_IO_TIMEOUT_MS/u);
  assert.doesNotMatch(value, /WELCOME_COINS_(?:CAPABILITY|ACQUIRED|AUTHORIZATION)_FD\s+[345]/u);
});

test("every native controller magic including its terminator fits the fixed wire field", () => {
  const value = source(LAUNCHER_SOURCE);
  const fieldBytes = Number(/#define\s+WELCOME_COINS_MAGIC_BYTES\s+(\d+)U?/u.exec(value)?.[1]);
  const magics = [...value.matchAll(
    /#define\s+WELCOME_COINS_[A-Z_]+_MAGIC\s+"([^"]+)"/gu
  )].map((match) => match[1]);

  assert.equal(Number.isSafeInteger(fieldBytes), true, "fixed magic field is declared");
  assert.equal(magics.length >= 10, true, "all protocol magics are covered");
  for (const magic of magics) {
    assert.equal(Buffer.byteLength(magic, "ascii") + 1 <= fieldBytes, true, magic);
  }
  assert.doesNotMatch(value, /char\s+magic\s*\[\s*32\s*\]/u);
});

test("launcher rejects nonzero bytes anywhere in fixed magic padding", () => {
  const value = source(LAUNCHER_SOURCE);
  const exactMagic = value.slice(
    value.indexOf("static int exact_magic"),
    value.indexOf("int main(", value.indexOf("static int exact_magic"))
  );

  assert.match(exactMagic, /for\s*\([^;]+;[^;]*WELCOME_COINS_MAGIC_BYTES[^)]*\)/u);
  assert.match(exactMagic, /actual\s*\[\s*index\s*\]\s*!=\s*['"]\\0['"]/u);
});

test("controller transport is an authenticated AF_UNIX stream", () => {
  const value = source(LAUNCHER_SOURCE);

  assert.match(value, /getsockopt\s*\([^;]+SO_DOMAIN/su);
  assert.match(value, /socket_domain\s*!=\s*AF_UNIX/u);
  assert.match(value, /domain_length\s*!=\s*\(socklen_t\)sizeof\(socket_domain\)/u);
  assert.match(value, /socket_type\s*!=\s*SOCK_STREAM/u);
  assert.match(value, /peer\.pid\s*!=\s*expected_pid/u);
});

test("pre-held controller and custody IO shares one monotonic deadline per operation", () => {
  const value = source(LAUNCHER_SOURCE);

  assert.match(value, /deadline_after_milliseconds/u);
  assert.match(value, /remaining_milliseconds/u);
  assert.match(value, /wait_fd_until/u);
  assert.doesNotMatch(value, /static\s+int\s+wait_fd\s*\(/u);
  assert.match(
    value,
    /receive_exact_bytes\s*\([^)]*int64_t\s+deadline[^)]*\)[\s\S]*?wait_fd_until\s*\([^;]*deadline/u
  );
  assert.match(
    value,
    /read_canonical_frame\s*\([^)]*\)[\s\S]*?int64_t\s+deadline\s*=\s*deadline_after_milliseconds[\s\S]*?wait_fd_until\s*\([^;]*deadline/u
  );
  assert.match(
    value,
    /write_all\s*\([^)]*\)[\s\S]*?int64_t\s+deadline\s*=\s*deadline_after_milliseconds[\s\S]*?wait_fd_until\s*\([^;]*deadline/u
  );
});

test("launcher forwards exactly two ordered frames in each custody direction", () => {
  const value = source(LAUNCHER_SOURCE);
  const firstAcquired = value.indexOf("WELCOME_COINS_ACQUIRED_MAGIC", value.indexOf("int main("));
  const firstCommit = value.indexOf("WELCOME_COINS_COMMIT_MAGIC", firstAcquired);
  const held = value.indexOf("WELCOME_COINS_HELD_MAGIC", firstCommit);
  const release = value.indexOf("WELCOME_COINS_RELEASE_MAGIC", held);
  const authorizationClose = value.indexOf("close(authorization_pipe[1])", release);

  assert.equal(firstAcquired > 0, true);
  assert.equal(firstAcquired < firstCommit, true, "acquired precedes commit authorization");
  assert.equal(firstCommit < held, true, "commit authorization precedes held proof");
  assert.equal(held < release, true, "held proof precedes final release");
  assert.equal(release < authorizationClose, true, "FD5 remains open through final release");
  assert.match(value, /require_canonical_frame_eof\s*\(\s*acquired_pipe\[0\]\s*\)/u);
  assert.match(value, /custody_held_invalid/u);
  assert.doesNotMatch(
    value,
    /receive_frame_packet_with_timeout\s*\(\s*&release/u,
    "a live stopped custody child is not killed by a fixed release timeout"
  );
});

test("held custody is pidfd-stopped and heartbeat-live until a hash-bound release", () => {
  const value = source(LAUNCHER_SOURCE);
  const main = value.slice(value.indexOf("int main("));
  const fork = main.indexOf("fork()");
  const pidfdOpen = main.indexOf("pidfd_open_child", fork);
  const heldBytes = main.indexOf("held.bytes");
  const heldRead = main.lastIndexOf("read_canonical_frame", heldBytes);
  const stop = main.indexOf("stop_child_for_held_custody", heldRead);
  const heldForward = main.indexOf("WELCOME_COINS_HELD_MAGIC", stop);
  const releaseWrite = main.indexOf("write_release_while_child_held(", heldForward);
  const resume = main.indexOf("SIGCONT", releaseWrite);
  const stopFunction = value.slice(
    value.indexOf("static int stop_child_for_held_custody"),
    value.indexOf("static int wait_for_held_controller_io")
  );
  const stopSignal = stopFunction.indexOf("pidfd_send_signal_checked");
  const stoppedWait = stopFunction.indexOf("WUNTRACED", stopSignal);
  const stoppedVerify = stopFunction.indexOf("verify_stopped_child_liveness", stoppedWait);
  const heartbeatBranch = main.indexOf("WELCOME_COINS_HEARTBEAT_MAGIC", heldForward);
  const heartbeatVerify = main.indexOf("verify_stopped_child_liveness", heartbeatBranch);
  const heartbeatCopy = main.indexOf("memcpy(heartbeat_ack.bytes", heartbeatVerify);
  const heartbeatSend = main.indexOf("send_packet_while_child_held", heartbeatCopy);
  const postBindMain = main.slice(main.indexOf("active_child_pidfd = child_pidfd"));
  const releaseWriter = value.slice(
    value.indexOf("static int write_release_while_child_held"),
    value.indexOf("static int exact_magic")
  );

  assert.match(value, /WELCOME_COINS_HEARTBEAT_MAGIC\s+"welcome_coins_native_heartbeat_v1"/u);
  assert.match(value, /WELCOME_COINS_HEARTBEAT_ACK_MAGIC\s+"welcome_coins_native_heartbeat_ack_v1"/u);
  assert.match(value, /SYS_pidfd_open/u);
  assert.match(value, /SYS_pidfd_send_signal/u);
  assert.match(value, /active_child_pidfd/u);
  assert.equal(fork < pidfdOpen, true, "pidfd opens immediately after fork");
  assert.equal(pidfdOpen < heldRead, true);
  assert.equal(heldRead < stop, true, "FD4 held+EOF precedes child stop");
  assert.equal(stopSignal >= 0, true);
  assert.equal(stopSignal < stoppedWait, true);
  assert.equal(stoppedWait < stoppedVerify, true);
  assert.equal(stop < heldForward, true, "only a verified stopped child publishes held");
  assert.equal(heldForward < releaseWrite, true);
  assert.equal(releaseWrite < resume, true, "FD5 release is written before pidfd SIGCONT");
  assert.equal(heartbeatBranch < heartbeatVerify, true);
  assert.equal(heartbeatVerify < heartbeatCopy, true);
  assert.equal(heartbeatCopy < heartbeatSend, true, "heartbeat ACK follows stopped identity readback");
  assert.match(value, /wait_for_held_controller_frame/u);
  assert.match(value, /poll\s*\([^;]+,\s*-1\s*\)/su);
  assert.match(value, /POLLHUP/u);
  assert.match(value, /POLLERR/u);
  assert.match(value, /POLLNVAL/u);
  assert.match(
    main,
    /memcpy\s*\(\s*heartbeat_ack\.bytes\s*,\s*release\.bytes\s*,\s*release\.size\s*\)/u
  );
  assert.doesNotMatch(main, /receive_frame_packet_with_timeout\s*\(\s*&release/u);
  assert.doesNotMatch(postBindMain, /\bkill\s*\(/u, "post-bind signals use only the child pidfd");
  assert.match(value, /pidfd_send_signal_checked\s*\(\s*active_child_pidfd\s*,\s*SIGKILL/u);
  assert.match(releaseWriter, /F_GETPIPE_SZ/u);
  assert.match(releaseWriter, /wait_for_held_controller_io\s*\(\s*child_pidfd\s*,\s*POLLOUT/u);
  assert.match(releaseWriter, /verify_stopped_child_liveness/u);
  assert.match(releaseWriter, /\bwrite\s*\(/u);
  assert.doesNotMatch(releaseWriter, /deadline|timeout|wait_fd_until/u);
});

test("custody child dies with its broker after privilege drop and verifies the contract", () => {
  const value = source(LAUNCHER_SOURCE);
  const preload = source(PRELOAD_SOURCE);
  const childStart = value.indexOf("static void exec_custody_child");
  const childEnd = value.indexOf("static int read_small_file", childStart);
  const child = value.slice(childStart, childEnd);

  assert.match(child, /PR_SET_PDEATHSIG\s*,\s*\(unsigned long\)SIGKILL/u);
  assert.match(child, /PR_GET_PDEATHSIG/u);
  assert.match(child, /parent_death_signal\s*!=\s*SIGKILL/u);
  assert.match(child, /getppid\s*\(\s*\)\s*!=\s*expected_parent/u);
  assert.equal(child.indexOf("drop_child_privileges") < child.indexOf("PR_SET_PDEATHSIG"), true);
  assert.equal(child.indexOf("PR_SET_PDEATHSIG") < child.indexOf("execve("), true);
  assert.match(preload, /PR_GET_PDEATHSIG/u);
  assert.match(preload, /post_exec_parent_death_signal\s*!=\s*SIGKILL/u);
});

test("custody child and root readback require exactly one supplementary service GID", () => {
  const value = source(LAUNCHER_SOURCE);
  const preload = source(PRELOAD_SOURCE);

  assert.match(value, /setgroups\s*\(\s*1U?\s*,\s*&service_gid\s*\)/u);
  assert.doesNotMatch(value, /setgroups\s*\(\s*0\s*,\s*NULL\s*\)/u);
  assert.match(value, /status_one_id_equals\s*\(\s*status\s*,\s*"Groups"\s*,\s*\(unsigned long\)service_gid\s*\)/u);
  assert.match(preload, /getgroups\s*\(\s*1\s*,\s*supplementary_groups\s*\)\s*!=\s*1/u);
  assert.match(preload, /supplementary_groups\s*\[\s*0\s*\]\s*!=\s*real_gid/u);
  assert.doesNotMatch(preload, /getgroups\s*\(\s*0\s*,\s*NULL\s*\)\s*!=\s*0/u);
});

test("wire magic and packed structure widths are compile-time assertions", () => {
  const value = source(LAUNCHER_SOURCE);

  for (const name of [
    "SETUP",
    "READY",
    "AUTHORIZE",
    "ACQUIRED",
    "COMMIT",
    "HELD",
    "RELEASE",
    "HEARTBEAT",
    "HEARTBEAT_ACK",
    "RIGHTS"
  ]) {
    assert.match(
      value,
      new RegExp(`_Static_assert\\s*\\(\\s*sizeof\\(WELCOME_COINS_${name}_MAGIC\\)`, "u"),
      name
    );
  }
  for (const structure of ["setup_packet", "ready_packet", "frame_packet"]) {
    assert.match(
      value,
      new RegExp(`_Static_assert\\s*\\(\\s*sizeof\\(struct ${structure}\\)`, "u"),
      structure
    );
  }
});

test("post-exec constructor establishes dumpable zero before receiving exact three descriptors", () => {
  const value = source(PRELOAD_SOURCE);
  const dumpable = value.indexOf("PR_SET_DUMPABLE");
  const receive = value.indexOf("receive_exact_rights(descriptors)", dumpable);

  assert.equal(dumpable >= 0, true);
  assert.equal(receive > dumpable, true, "SCM_RIGHTS receive follows post-exec dumpable hardening");
  assert.match(value, /__attribute__\s*\(\s*\(\s*constructor\s*\)\s*\)/u);
  assert.match(value, /PR_GET_DUMPABLE/u);
  assert.match(value, /PR_GET_NO_NEW_PRIVS/u);
  assert.match(value, /raise\s*\(\s*SIGSTOP\s*\)/u);
  assert.match(value, /SO_PEERCRED/u);
  assert.match(value, /SCM_RIGHTS/u);
  assert.match(value, /MSG_CTRUNC/u);
  assert.match(value, /MSG_TRUNC/u);
  assert.match(value, /dup3\s*\([^,]+,\s*3\s*,/u);
  assert.match(value, /dup3\s*\([^,]+,\s*4\s*,/u);
  assert.match(value, /dup3\s*\([^,]+,\s*5\s*,/u);
  assert.match(value, /F_DUPFD_CLOEXEC/u);
  assert.match(value, /_exit\s*\(/u);
});

test("post-exec SCM_RIGHTS receive keeps one monotonic deadline across EINTR", () => {
  const value = source(PRELOAD_SOURCE);

  assert.match(value, /deadline_after_milliseconds/u);
  assert.match(value, /remaining_milliseconds/u);
  assert.match(value, /wait_readable_until/u);
  assert.doesNotMatch(value, /static\s+int\s+wait_readable\s*\(/u);
  assert.match(
    value,
    /receive_exact_rights\s*\([^)]*\)[\s\S]*?int64_t\s+deadline\s*=\s*deadline_after_milliseconds[\s\S]*?wait_readable_until\s*\([^;]*deadline/u
  );
});

test("native final image rejects loader and Node environment pollution", () => {
  const launcher = source(LAUNCHER_SOURCE);
  const preload = source(PRELOAD_SOURCE);
  for (const name of [
    "LD_AUDIT",
    "LD_LIBRARY_PATH",
    "LD_DEBUG",
    "LD_PRELOAD",
    "NODE_OPTIONS",
    "NODE_PATH"
  ]) {
    assert.match(launcher, new RegExp(name, "u"), `launcher ${name}`);
    assert.match(preload, new RegExp(name, "u"), `preload ${name}`);
  }
  assert.match(launcher, /clearenv\s*\(/u);
});

test("real privileged launcher proof remains a separately authorized clean Linux gate", {
  skip: "source/build contracts do not substitute for privileged clean-Linux integration"
}, () => {});
