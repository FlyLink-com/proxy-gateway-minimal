#define _GNU_SOURCE

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <pwd.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/poll.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#ifndef WELCOME_COINS_SYNTHETIC_LAUNCHER_PATH
#error "WELCOME_COINS_SYNTHETIC_LAUNCHER_PATH must bind an isolated synthetic candidate"
#endif

#define WELCOME_COINS_CONTROLLER_FD 7
#define WELCOME_COINS_IO_TIMEOUT_MS 30000
#define WELCOME_COINS_FRAME_MAX_BYTES 8192U
#define WELCOME_COINS_MAGIC_BYTES 40U
#define WELCOME_COINS_SETUP_MAGIC "welcome_coins_native_setup_v1"
#define WELCOME_COINS_READY_MAGIC "welcome_coins_native_ready_v1"
#define WELCOME_COINS_AUTHORIZE_MAGIC "welcome_coins_native_authorize_v1"
#define WELCOME_COINS_ACQUIRED_MAGIC "welcome_coins_native_acquired_v1"
#define WELCOME_COINS_COMMIT_MAGIC "welcome_coins_native_commit_v1"
#define WELCOME_COINS_HELD_MAGIC "welcome_coins_native_held_v1"
#define WELCOME_COINS_RELEASE_MAGIC "welcome_coins_native_release_v1"

struct __attribute__((packed)) setup_packet {
  char magic[WELCOME_COINS_MAGIC_BYTES];
  uint32_t service_uid;
  uint32_t service_gid;
};

struct __attribute__((packed)) ready_packet {
  char magic[WELCOME_COINS_MAGIC_BYTES];
  uint32_t child_pid;
  uint64_t acquired_dev;
  uint64_t acquired_ino;
  uint64_t authorization_dev;
  uint64_t authorization_ino;
};

struct __attribute__((packed)) frame_packet {
  char magic[WELCOME_COINS_MAGIC_BYTES];
  uint32_t size;
  unsigned char bytes[WELCOME_COINS_FRAME_MAX_BYTES];
};

_Static_assert(sizeof(struct setup_packet) == 48U, "setup packet wire size");
_Static_assert(sizeof(struct ready_packet) == 76U, "ready packet wire size");

static pid_t active_child = -1;

static void write_stderr_best_effort(const char *bytes, size_t size) {
  size_t offset = 0U;

  while (offset < size) {
    ssize_t written = write(STDERR_FILENO, bytes + offset, size - offset);
    if (written < 0 && errno == EINTR) {
      continue;
    }
    if (written <= 0) {
      return;
    }
    offset += (size_t)written;
  }
}

static void emit_result(const char *state, const char *condition) {
  char output[192];
  int length = snprintf(
    output,
    sizeof(output),
    "{\"schemaVersion\":\"1\",\"type\":\"welcome_coins_custody_synthetic\",\"state\":\"%s\",\"condition\":\"%s\"}\n",
    state,
    condition
  );
  if (length > 0 && (size_t)length < sizeof(output)) {
    write_stderr_best_effort(output, (size_t)length);
  }
}

static int wait_fd(int descriptor, short events) {
  struct pollfd item;

  memset(&item, 0, sizeof(item));
  item.fd = descriptor;
  item.events = events;
  for (;;) {
    int result = poll(&item, 1U, WELCOME_COINS_IO_TIMEOUT_MS);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result != 1 || (item.revents & events) == 0) {
      errno = result == 0 ? ETIMEDOUT : EIO;
      return -1;
    }
    return 0;
  }
}

static int write_exact(int descriptor, const void *buffer, size_t size) {
  size_t offset = 0U;
  const unsigned char *bytes = buffer;

  while (offset < size) {
    ssize_t written;
    if (wait_fd(descriptor, POLLOUT) != 0) {
      return -1;
    }
    written = send(
      descriptor,
      bytes + offset,
      size - offset,
      MSG_NOSIGNAL
    );
    if (written < 0 && errno == EINTR) {
      continue;
    }
    if (written <= 0) {
      return -1;
    }
    offset += (size_t)written;
  }
  return 0;
}

static int read_exact(int descriptor, void *buffer, size_t size) {
  size_t offset = 0U;
  unsigned char *bytes = buffer;

  while (offset < size) {
    ssize_t received;
    if (wait_fd(descriptor, POLLIN) != 0) {
      return -1;
    }
    received = recv(descriptor, bytes + offset, size - offset, 0);
    if (received < 0 && errno == EINTR) {
      continue;
    }
    if (received <= 0) {
      return -1;
    }
    offset += (size_t)received;
  }
  return 0;
}

static int exact_magic(const char actual[WELCOME_COINS_MAGIC_BYTES], const char *expected) {
  size_t length = strlen(expected);
  size_t index;

  if (length >= WELCOME_COINS_MAGIC_BYTES || memcmp(actual, expected, length) != 0) {
    return 0;
  }
  for (index = length; index < WELCOME_COINS_MAGIC_BYTES; index += 1U) {
    if (actual[index] != '\0') {
      return 0;
    }
  }
  return 1;
}

static int send_frame(int descriptor, const char *magic, const char *payload) {
  struct frame_packet packet;
  size_t payload_size = strlen(payload);

  if (payload_size < 2U || payload_size > WELCOME_COINS_FRAME_MAX_BYTES
      || payload[payload_size - 1U] != '\n') {
    return -1;
  }
  memset(&packet, 0, sizeof(packet));
  memcpy(packet.magic, magic, strlen(magic));
  packet.size = htonl((uint32_t)payload_size);
  memcpy(packet.bytes, payload, payload_size);
  return write_exact(
    descriptor,
    &packet,
    sizeof(packet.magic) + sizeof(packet.size) + payload_size
  );
}

static int receive_frame(
  int descriptor,
  const char *expected_magic,
  const char *expected_payload
) {
  struct frame_packet packet;
  uint32_t payload_size;
  size_t expected_size = strlen(expected_payload);

  memset(&packet, 0, sizeof(packet));
  if (read_exact(descriptor, &packet.magic, sizeof(packet.magic)) != 0
      || read_exact(descriptor, &packet.size, sizeof(packet.size)) != 0) {
    return -1;
  }
  payload_size = ntohl(packet.size);
  if (payload_size == 0U || payload_size > WELCOME_COINS_FRAME_MAX_BYTES
      || read_exact(descriptor, packet.bytes, payload_size) != 0
      || !exact_magic(packet.magic, expected_magic)
      || payload_size != expected_size
      || memcmp(packet.bytes, expected_payload, expected_size) != 0) {
    return -1;
  }
  return 0;
}

static void kill_and_reap_active_child(void) {
  int status;

  if (active_child <= 0) {
    return;
  }
  if (kill(active_child, SIGKILL) != 0 && errno != ESRCH) {
    /* Reap below even when signalling cannot be confirmed. */
  }
  for (;;) {
    pid_t result = waitpid(active_child, &status, 0);
    if (result == active_child || (result < 0 && errno == ECHILD)) {
      break;
    }
    if (result < 0 && errno == EINTR) {
      continue;
    }
    break;
  }
  active_child = -1;
}

static int exec_fixed_launcher(int controller_descriptor) {
  char *const argv[] = {
    (char *)WELCOME_COINS_SYNTHETIC_LAUNCHER_PATH,
    NULL
  };
  char *const environment[] = {
    "PATH=/usr/bin:/bin",
    "LANG=C",
    "LC_ALL=C",
    NULL
  };

  if (controller_descriptor == WELCOME_COINS_CONTROLLER_FD) {
    if (fcntl(WELCOME_COINS_CONTROLLER_FD, F_SETFD, 0) != 0) {
      return -1;
    }
  } else {
    if (dup3(
      controller_descriptor,
      WELCOME_COINS_CONTROLLER_FD,
      0
    ) != WELCOME_COINS_CONTROLLER_FD) {
      return -1;
    }
    (void)close(controller_descriptor);
  }
  execve(WELCOME_COINS_SYNTHETIC_LAUNCHER_PATH, argv, environment);
  return -1;
}

int main(int argc, char **argv) {
  int controller_pair[2] = {-1, -1};
  struct passwd *service_account;
  struct setup_packet setup;
  struct ready_packet ready;
  int status = 1;
  pid_t child;

  (void)argv;
  memset(&setup, 0, sizeof(setup));
  memset(&ready, 0, sizeof(ready));

  if (argc != 1 || geteuid() != 0 || getegid() != 0) {
    emit_result("blocked", "invoker_not_root");
    return 1;
  }
  service_account = getpwnam("nobody");
  if (service_account == NULL || service_account->pw_uid == 0U
      || service_account->pw_gid == 0U) {
    emit_result("blocked", "synthetic_service_principal_invalid");
    return 1;
  }
  if (socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, controller_pair) != 0) {
    emit_result("blocked", "synthetic_channel_invalid");
    return 1;
  }

  child = fork();
  if (child < 0) {
    emit_result("blocked", "synthetic_spawn_failed");
    goto cleanup;
  }
  if (child == 0) {
    (void)close(controller_pair[0]);
    if (exec_fixed_launcher(controller_pair[1]) != 0) {
      _exit(125);
    }
    _exit(125);
  }
  active_child = child;
  (void)close(controller_pair[1]);
  controller_pair[1] = -1;

  memcpy(setup.magic, WELCOME_COINS_SETUP_MAGIC, strlen(WELCOME_COINS_SETUP_MAGIC));
  setup.service_uid = htonl((uint32_t)service_account->pw_uid);
  setup.service_gid = htonl((uint32_t)service_account->pw_gid);
  if (write_exact(controller_pair[0], &setup, sizeof(setup)) != 0
      || read_exact(controller_pair[0], &ready, sizeof(ready)) != 0
      || !exact_magic(ready.magic, WELCOME_COINS_READY_MAGIC)
      || ntohl(ready.child_pid) == 0U) {
    emit_result("blocked", "synthetic_setup_invalid");
    goto cleanup;
  }
  if (send_frame(
    controller_pair[0],
    WELCOME_COINS_AUTHORIZE_MAGIC,
    "synthetic-capability\n"
  ) != 0 || receive_frame(
    controller_pair[0],
    WELCOME_COINS_ACQUIRED_MAGIC,
    "synthetic-acquired\n"
  ) != 0) {
    emit_result("blocked", "synthetic_acquired_invalid");
    goto cleanup;
  }
  if (send_frame(
    controller_pair[0],
    WELCOME_COINS_COMMIT_MAGIC,
    "synthetic-commit\n"
  ) != 0 || receive_frame(
    controller_pair[0],
    WELCOME_COINS_HELD_MAGIC,
    "synthetic-held\n"
  ) != 0) {
    emit_result("blocked", "synthetic_held_invalid");
    goto cleanup;
  }
  if (send_frame(
    controller_pair[0],
    WELCOME_COINS_RELEASE_MAGIC,
    "synthetic-release\n"
  ) != 0) {
    emit_result("blocked", "synthetic_release_invalid");
    goto cleanup;
  }
  for (;;) {
    pid_t result = waitpid(active_child, &status, 0);
    if (result == active_child) {
      active_child = -1;
      break;
    }
    if (result < 0 && errno == EINTR) {
      continue;
    }
    emit_result("blocked", "synthetic_wait_invalid");
    goto cleanup;
  }
  if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) {
    emit_result("blocked", "synthetic_child_invalid");
    goto cleanup;
  }
  emit_result("verified", "synthetic_protocol_complete");
  status = 0;

cleanup:
  kill_and_reap_active_child();
  if (controller_pair[0] >= 0) {
    (void)close(controller_pair[0]);
  }
  if (controller_pair[1] >= 0) {
    (void)close(controller_pair[1]);
  }
  memset(&setup, 0, sizeof(setup));
  memset(&ready, 0, sizeof(ready));
  return status;
}
