#define _GNU_SOURCE

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <pwd.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/poll.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#ifndef WELCOME_COINS_SYNTHETIC_LAUNCHER_PATH
#error "WELCOME_COINS_SYNTHETIC_LAUNCHER_PATH must bind an isolated synthetic candidate"
#endif

#define WELCOME_COINS_CONTROLLER_FD 7
#ifndef WELCOME_COINS_IO_TIMEOUT_MS
#define WELCOME_COINS_IO_TIMEOUT_MS 30000
#endif
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
static int active_child_process_group = 0;

static int ensure_standard_descriptors(void) {
  int descriptor;

  for (descriptor = STDIN_FILENO; descriptor <= STDERR_FILENO; descriptor += 1) {
    int opened;
    int flags;

    if (fcntl(descriptor, F_GETFD) >= 0) {
      continue;
    }
    if (errno != EBADF) {
      return -1;
    }
    flags = descriptor == STDIN_FILENO ? O_RDONLY : O_WRONLY;
    opened = open("/dev/null", flags);
    if (opened != descriptor) {
      if (opened >= 0) {
        (void)close(opened);
      }
      errno = EIO;
      return -1;
    }
  }
  return 0;
}

static int configure_runner_signals(void) {
  struct sigaction action;

  memset(&action, 0, sizeof(action));
  action.sa_handler = SIG_DFL;
  if (sigemptyset(&action.sa_mask) != 0
      || sigaction(SIGCHLD, &action, NULL) != 0) {
    return -1;
  }
  action.sa_handler = SIG_IGN;
  return sigaction(SIGPIPE, &action, NULL);
}

static int close_descriptor_interval(unsigned int first, unsigned int last) {
#ifdef SYS_close_range
  if (syscall(SYS_close_range, first, last, 0U) == 0) {
    return 0;
  }
  if (errno != ENOSYS && errno != EINVAL) {
    return -1;
  }
#endif
  {
    long open_max = sysconf(_SC_OPEN_MAX);
    unsigned int final_descriptor;
    unsigned int descriptor;

    if (open_max <= 0) {
      return -1;
    }
    final_descriptor = last == UINT_MAX || (unsigned long)last >= (unsigned long)open_max
      ? (unsigned int)(open_max - 1L)
      : last;
    for (descriptor = first; descriptor <= final_descriptor; descriptor += 1U) {
      (void)close((int)descriptor);
    }
  }
  return 0;
}

static int prepare_launcher_process(pid_t expected_parent) {
  struct sigaction action;
  sigset_t signal_mask;

  if (expected_parent <= 1
      || prctl(PR_SET_PDEATHSIG, (unsigned long)SIGKILL, 0UL, 0UL, 0UL) != 0
      || getppid() != expected_parent
      || setpgid(0, 0) != 0) {
    return -1;
  }
  memset(&action, 0, sizeof(action));
  action.sa_handler = SIG_DFL;
  if (sigemptyset(&action.sa_mask) != 0
      || sigaction(SIGCHLD, &action, NULL) != 0
      || sigaction(SIGPIPE, &action, NULL) != 0
      || sigemptyset(&signal_mask) != 0
      || sigprocmask(SIG_SETMASK, &signal_mask, NULL) != 0) {
    return -1;
  }
  return getppid() == expected_parent ? 0 : -1;
}

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

static int64_t monotonic_milliseconds(void) {
  struct timespec now;

  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) {
    return -1;
  }
  return (int64_t)now.tv_sec * 1000 + (int64_t)(now.tv_nsec / 1000000L);
}

static int64_t deadline_after_milliseconds(int timeout_ms) {
  int64_t now = monotonic_milliseconds();

  if (now < 0 || timeout_ms < 0 || now > INT64_MAX - (int64_t)timeout_ms) {
    errno = EOVERFLOW;
    return -1;
  }
  return now + (int64_t)timeout_ms;
}

static int remaining_milliseconds(int64_t deadline) {
  int64_t now = monotonic_milliseconds();
  int64_t remaining;

  if (now < 0) {
    return -1;
  }
  if (now >= deadline) {
    errno = ETIMEDOUT;
    return -1;
  }
  remaining = deadline - now;
  return remaining > INT_MAX ? INT_MAX : (int)remaining;
}

static int wait_fd_until(int descriptor, short events, int64_t deadline) {
  struct pollfd item;

  memset(&item, 0, sizeof(item));
  item.fd = descriptor;
  item.events = events;
  for (;;) {
    int timeout_ms = remaining_milliseconds(deadline);
    int result;
    if (timeout_ms < 0) {
      return -1;
    }
    result = poll(&item, 1U, timeout_ms);
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
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);
  size_t offset = 0U;
  const unsigned char *bytes = buffer;

  if (deadline < 0) {
    return -1;
  }
  while (offset < size) {
    ssize_t written;
    if (wait_fd_until(descriptor, POLLOUT, deadline) != 0) {
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

static int read_exact_until(
  int descriptor,
  void *buffer,
  size_t size,
  int64_t deadline
) {
  size_t offset = 0U;
  unsigned char *bytes = buffer;

  while (offset < size) {
    ssize_t received;
    if (wait_fd_until(descriptor, POLLIN, deadline) != 0) {
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

static int read_exact(int descriptor, void *buffer, size_t size) {
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);
  return deadline < 0 ? -1 : read_exact_until(descriptor, buffer, size, deadline);
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
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);
  uint32_t payload_size;
  size_t expected_size = strlen(expected_payload);

  memset(&packet, 0, sizeof(packet));
  if (deadline < 0
      || read_exact_until(descriptor, &packet.magic, sizeof(packet.magic), deadline) != 0
      || read_exact_until(descriptor, &packet.size, sizeof(packet.size), deadline) != 0) {
    return -1;
  }
  payload_size = ntohl(packet.size);
  if (payload_size == 0U || payload_size > WELCOME_COINS_FRAME_MAX_BYTES
      || read_exact_until(descriptor, packet.bytes, payload_size, deadline) != 0
      || !exact_magic(packet.magic, expected_magic)
      || payload_size != expected_size
      || memcmp(packet.bytes, expected_payload, expected_size) != 0) {
    return -1;
  }
  return 0;
}

static int waitpid_bounded(pid_t child, int *status) {
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);

  if (deadline < 0) {
    return -1;
  }
  for (;;) {
    pid_t result = waitpid(child, status, WNOHANG);
    if (result == child) {
      return 0;
    }
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result < 0) {
      return -1;
    }
    {
      int remaining = remaining_milliseconds(deadline);
      struct timespec pause;
      if (remaining < 0) {
        return -1;
      }
      pause.tv_sec = 0;
      pause.tv_nsec = (long)(remaining > 10 ? 10 : remaining) * 1000000L;
      while (nanosleep(&pause, &pause) != 0) {
        if (errno != EINTR) {
          return -1;
        }
      }
    }
  }
}

static int process_group_is_empty(pid_t process_group) {
  if (process_group <= 1) {
    errno = EINVAL;
    return -1;
  }
  if (kill(-process_group, 0) == 0) {
    return 0;
  }
  return errno == ESRCH ? 1 : -1;
}

static void kill_and_reap_active_child(void) {
  int child_status;
  pid_t signal_target;

  if (active_child <= 0) {
    return;
  }
  signal_target = active_child_process_group != 0 ? -active_child : active_child;
  if (kill(signal_target, SIGKILL) != 0 && errno != ESRCH) {
    /* Reap below even when signalling cannot be confirmed. */
  }
  (void)waitpid_bounded(active_child, &child_status);
  active_child = -1;
  active_child_process_group = 0;
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
  if (close_descriptor_interval(3U, 6U) != 0
      || close_descriptor_interval(8U, UINT_MAX) != 0) {
    return -1;
  }
  execve(WELCOME_COINS_SYNTHETIC_LAUNCHER_PATH, argv, environment);
  return -1;
}

int main(int argc, char **argv) {
  int controller_pair[2] = {-1, -1};
  struct passwd *service_account;
  struct setup_packet setup;
  struct ready_packet ready;
  int child_status;
  int exit_code = 1;
  pid_t child;

  (void)argv;
  memset(&setup, 0, sizeof(setup));
  memset(&ready, 0, sizeof(ready));

  if (ensure_standard_descriptors() != 0 || configure_runner_signals() != 0) {
    return 1;
  }
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
    pid_t expected_parent = getppid();
    (void)close(controller_pair[0]);
    if (prepare_launcher_process(expected_parent) != 0
        || exec_fixed_launcher(controller_pair[1]) != 0) {
      _exit(125);
    }
    _exit(125);
  }
  active_child = child;
  if ((setpgid(child, child) != 0 && errno != EACCES)
      || getpgid(child) != child) {
    emit_result("blocked", "synthetic_process_group_invalid");
    goto cleanup;
  }
  active_child_process_group = 1;
  (void)close(controller_pair[1]);
  controller_pair[1] = -1;

  memcpy(setup.magic, WELCOME_COINS_SETUP_MAGIC, strlen(WELCOME_COINS_SETUP_MAGIC));
  setup.service_uid = htonl((uint32_t)service_account->pw_uid);
  setup.service_gid = htonl((uint32_t)service_account->pw_gid);
  if (write_exact(controller_pair[0], &setup, sizeof(setup)) != 0
      || read_exact(controller_pair[0], &ready, sizeof(ready)) != 0
      || !exact_magic(ready.magic, WELCOME_COINS_READY_MAGIC)
      || ntohl(ready.child_pid) <= 1U
      || ready.acquired_dev == 0U
      || ready.acquired_ino == 0U
      || ready.authorization_dev == 0U
      || ready.authorization_ino == 0U
      || ready.acquired_dev != ready.authorization_dev
      || ready.acquired_ino == ready.authorization_ino) {
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
  if (waitpid_bounded(active_child, &child_status) != 0) {
    emit_result("blocked", "synthetic_wait_invalid");
    goto cleanup;
  }
  if (!WIFEXITED(child_status) || WEXITSTATUS(child_status) != 0) {
    emit_result("blocked", "synthetic_child_invalid");
    goto cleanup;
  }
  if (process_group_is_empty(active_child) != 1) {
    emit_result("blocked", "synthetic_descendant_invalid");
    goto cleanup;
  }
  active_child = -1;
  active_child_process_group = 0;
  emit_result("verified", "synthetic_protocol_complete");
  exit_code = 0;

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
  return exit_code;
}
