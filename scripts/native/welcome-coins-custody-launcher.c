#define _GNU_SOURCE

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <limits.h>
#include <linux/capability.h>
#include <linux/memfd.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/ptrace.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define WELCOME_COINS_CONTROLLER_FD 7
#define WELCOME_COINS_BOOTSTRAP_FD 6
#define WELCOME_COINS_IO_TIMEOUT_MS 30000
#define WELCOME_COINS_CHILD_TIMEOUT_MS 120000
#define WELCOME_COINS_FRAME_MAX_BYTES 8192U
#define WELCOME_COINS_MAGIC_BYTES 40U
#define WELCOME_COINS_SETUP_MAGIC "welcome_coins_native_setup_v1"
#define WELCOME_COINS_READY_MAGIC "welcome_coins_native_ready_v1"
#define WELCOME_COINS_AUTHORIZE_MAGIC "welcome_coins_native_authorize_v1"
#define WELCOME_COINS_ACQUIRED_MAGIC "welcome_coins_native_acquired_v1"
#define WELCOME_COINS_COMMIT_MAGIC "welcome_coins_native_commit_v1"
#define WELCOME_COINS_HELD_MAGIC "welcome_coins_native_held_v1"
#define WELCOME_COINS_RELEASE_MAGIC "welcome_coins_native_release_v1"
#define WELCOME_COINS_HEARTBEAT_MAGIC "welcome_coins_native_heartbeat_v1"
#define WELCOME_COINS_HEARTBEAT_ACK_MAGIC "welcome_coins_native_heartbeat_ack_v1"
#define WELCOME_COINS_RIGHTS_MAGIC "welcome_coins_native_rights_v1"
#define WELCOME_COINS_LAUNCHER_SUFFIX "/node_modules/.gccgw-native/welcome-coins-custody-launcher"
#define WELCOME_COINS_PRELOAD_SUFFIX "/node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so"
#define WELCOME_COINS_CHILD_SUFFIX "/scripts/control-plane-welcome-coins-activation-transaction-custody-cli.mjs"
#define WELCOME_COINS_NODE_PATH "/usr/bin/node"

extern char **environ;

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

_Static_assert(sizeof(WELCOME_COINS_SETUP_MAGIC) <= WELCOME_COINS_MAGIC_BYTES, "setup magic fits");
_Static_assert(sizeof(WELCOME_COINS_READY_MAGIC) <= WELCOME_COINS_MAGIC_BYTES, "ready magic fits");
_Static_assert(sizeof(WELCOME_COINS_AUTHORIZE_MAGIC) <= WELCOME_COINS_MAGIC_BYTES, "authorize magic fits");
_Static_assert(sizeof(WELCOME_COINS_ACQUIRED_MAGIC) <= WELCOME_COINS_MAGIC_BYTES, "acquired magic fits");
_Static_assert(sizeof(WELCOME_COINS_COMMIT_MAGIC) <= WELCOME_COINS_MAGIC_BYTES, "commit magic fits");
_Static_assert(sizeof(WELCOME_COINS_HELD_MAGIC) <= WELCOME_COINS_MAGIC_BYTES, "held magic fits");
_Static_assert(sizeof(WELCOME_COINS_RELEASE_MAGIC) <= WELCOME_COINS_MAGIC_BYTES, "release magic fits");
_Static_assert(sizeof(WELCOME_COINS_HEARTBEAT_MAGIC) <= WELCOME_COINS_MAGIC_BYTES, "heartbeat magic fits");
_Static_assert(sizeof(WELCOME_COINS_HEARTBEAT_ACK_MAGIC) <= WELCOME_COINS_MAGIC_BYTES, "heartbeat ack magic fits");
_Static_assert(sizeof(WELCOME_COINS_RIGHTS_MAGIC) <= WELCOME_COINS_MAGIC_BYTES, "rights magic fits");
_Static_assert(
  sizeof(struct setup_packet) == WELCOME_COINS_MAGIC_BYTES + (2U * sizeof(uint32_t)),
  "setup packet wire size"
);
_Static_assert(
  sizeof(struct ready_packet) == WELCOME_COINS_MAGIC_BYTES + sizeof(uint32_t)
      + (4U * sizeof(uint64_t)),
  "ready packet wire size"
);
_Static_assert(
  sizeof(struct frame_packet) == WELCOME_COINS_MAGIC_BYTES + sizeof(uint32_t)
      + WELCOME_COINS_FRAME_MAX_BYTES,
  "frame packet wire size"
);

static pid_t active_child = -1;
static int active_child_pidfd = -1;

static uint64_t host_to_be64(uint64_t value) {
  uint32_t high = htonl((uint32_t)(value >> 32U));
  uint32_t low = htonl((uint32_t)(value & UINT32_MAX));
  return ((uint64_t)low << 32U) | high;
}

static void write_stderr_best_effort(const char *bytes, size_t size) {
  size_t offset = 0U;
  while (offset < size) {
    ssize_t count = write(STDERR_FILENO, bytes + offset, size - offset);
    if (count < 0 && errno == EINTR) {
      continue;
    }
    if (count <= 0) {
      return;
    }
    offset += (size_t)count;
  }
}

static void emit_blocked(const char *condition) {
  char output[256];
  int length = snprintf(
    output,
    sizeof(output),
    "{\"schemaVersion\":\"1\",\"type\":\"welcome_coins_native_launcher\",\"state\":\"blocked\",\"condition\":\"%s\"}\n",
    condition
  );
  if (length > 0 && (size_t)length < sizeof(output)) {
    write_stderr_best_effort(output, (size_t)length);
  }
}


static void emit_post_exec_security_invalid(const char *synthetic_condition) {
#ifdef WELCOME_COINS_SYNTHETIC_DIAGNOSTIC
  emit_blocked(synthetic_condition);
#else
  (void)synthetic_condition;
  emit_blocked("post_exec_security_invalid");
#endif
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
    result = poll(&item, 1, timeout_ms);
    if (result < 0 && errno == EINTR) {
      continue;
    }
    if (result == 0) {
      errno = ETIMEDOUT;
      return -1;
    }
    if (result != 1 || (item.revents & events) == 0) {
      return -1;
    }
    return 0;
  }
}

static int waitpid_bounded(pid_t child, int *status, int options, int timeout_ms) {
  int64_t deadline = deadline_after_milliseconds(timeout_ms);
  if (deadline < 0) {
    return -1;
  }
  for (;;) {
    pid_t result = waitpid(child, status, options | WNOHANG);
    int remaining;
    if (result == child) {
      return 0;
    }
    if (result < 0 && errno != EINTR) {
      return -1;
    }
    remaining = remaining_milliseconds(deadline);
    if (remaining < 0) {
      return -1;
    }
    (void)poll(NULL, 0, remaining < 10 ? remaining : 10);
  }
}

static int pidfd_open_child(pid_t child) {
  return (int)syscall(SYS_pidfd_open, child, 0U);
}

static int pidfd_send_signal_checked(int pidfd, int signal_number) {
  if (pidfd < 0) {
    errno = EBADF;
    return -1;
  }
  return (int)syscall(SYS_pidfd_send_signal, pidfd, signal_number, NULL, 0U);
}

static int pidfd_child_has_exited(int pidfd) {
  struct pollfd item;
  int result;
  memset(&item, 0, sizeof(item));
  item.fd = pidfd;
  item.events = POLLIN;
  do {
    result = poll(&item, 1U, 0);
  } while (result < 0 && errno == EINTR);
  if (result == 0) return 0;
  if (result != 1) return -1;
  return (item.revents & (POLLIN | POLLHUP | POLLERR | POLLNVAL)) != 0 ? 1 : -1;
}

static void kill_child_and_reap(void) {
  int status;
  if (active_child <= 0) {
    return;
  }
  if (pidfd_send_signal_checked(active_child_pidfd, SIGKILL) != 0 && errno != ESRCH) {
    /* Continue to the bounded reap even if signaling is uncertain. */
  }
  (void)waitpid_bounded(active_child, &status, 0, WELCOME_COINS_IO_TIMEOUT_MS);
  if (active_child_pidfd >= 0) {
    (void)close(active_child_pidfd);
  }
  active_child_pidfd = -1;
  active_child = -1;
}

static void reject_environment_pollution(void) {
  static const char *const forbidden[] = {
    "LD_AUDIT",
    "LD_LIBRARY_PATH",
    "LD_DEBUG",
    "LD_PRELOAD",
    "NODE_OPTIONS",
    "NODE_PATH"
  };
  size_t index;
  for (index = 0; index < sizeof(forbidden) / sizeof(forbidden[0]); index += 1U) {
    if (getenv(forbidden[index]) != NULL) {
      exit(125);
    }
  }
}

static int require_root_stream_peer(int descriptor, pid_t expected_pid) {
  struct ucred peer;
  socklen_t peer_length = (socklen_t)sizeof(peer);
  int socket_domain = 0;
  socklen_t domain_length = (socklen_t)sizeof(socket_domain);
  int socket_type = 0;
  socklen_t type_length = (socklen_t)sizeof(socket_type);

  memset(&peer, 0, sizeof(peer));
  if (getsockopt(descriptor, SOL_SOCKET, SO_DOMAIN, &socket_domain, &domain_length) != 0
      || domain_length != (socklen_t)sizeof(socket_domain)
      || socket_domain != AF_UNIX
      || getsockopt(descriptor, SOL_SOCKET, SO_TYPE, &socket_type, &type_length) != 0
      || type_length != (socklen_t)sizeof(socket_type)
      || socket_type != SOCK_STREAM
      || getsockopt(descriptor, SOL_SOCKET, SO_PEERCRED, &peer, &peer_length) != 0
      || peer_length != (socklen_t)sizeof(peer)
      || peer.uid != 0U
      || peer.gid != 0U
      || peer.pid != expected_pid) {
    return -1;
  }
  return 0;
}

static int receive_exact_bytes(void *buffer, size_t size, int64_t deadline) {
  size_t offset = 0U;
  while (offset < size) {
    struct iovec iov;
    struct msghdr message;
    char control[CMSG_SPACE(sizeof(int))];
    ssize_t received;

    memset(&iov, 0, sizeof(iov));
    memset(&message, 0, sizeof(message));
    memset(control, 0, sizeof(control));
    iov.iov_base = (unsigned char *)buffer + offset;
    iov.iov_len = size - offset;
    message.msg_iov = &iov;
    message.msg_iovlen = 1U;
    message.msg_control = control;
    message.msg_controllen = sizeof(control);
    if (wait_fd_until(WELCOME_COINS_CONTROLLER_FD, POLLIN, deadline) != 0) {
      return -1;
    }
    received = recvmsg(WELCOME_COINS_CONTROLLER_FD, &message, MSG_CMSG_CLOEXEC);
    if (received < 0 && errno == EINTR) {
      continue;
    }
    if (received <= 0
        || (message.msg_flags & (MSG_CTRUNC | MSG_TRUNC)) != 0
        || CMSG_FIRSTHDR(&message) != NULL) {
      return -1;
    }
    offset += (size_t)received;
  }
  return 0;
}

static ssize_t receive_frame_packet_with_timeout(
  struct frame_packet *packet,
  int timeout_ms
) {
  size_t header_size = sizeof(packet->magic) + sizeof(packet->size);
  int64_t deadline = deadline_after_milliseconds(timeout_ms);
  uint32_t payload_size;
  if (deadline < 0 || receive_exact_bytes(packet, header_size, deadline) != 0) {
    return -1;
  }
  payload_size = ntohl(packet->size);
  if (payload_size > WELCOME_COINS_FRAME_MAX_BYTES
      || receive_exact_bytes(packet->bytes, payload_size, deadline) != 0) {
    return -1;
  }
  return (ssize_t)(header_size + payload_size);
}

static ssize_t receive_frame_packet(struct frame_packet *packet) {
  return receive_frame_packet_with_timeout(packet, WELCOME_COINS_IO_TIMEOUT_MS);
}

static int send_packet(const void *buffer, size_t size) {
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);
  size_t offset = 0U;
  if (deadline < 0) {
    return -1;
  }
  while (offset < size) {
    ssize_t written;
    if (wait_fd_until(WELCOME_COINS_CONTROLLER_FD, POLLOUT, deadline) != 0) {
      return -1;
    }
    written = send(
      WELCOME_COINS_CONTROLLER_FD,
      (const unsigned char *)buffer + offset,
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

static int derive_fixed_paths(char preload[PATH_MAX], char child_script[PATH_MAX]) {
  char executable[PATH_MAX];
  size_t executable_length;
  size_t suffix_length = strlen(WELCOME_COINS_LAUNCHER_SUFFIX);
  size_t root_length;

  if (realpath("/proc/self/exe", executable) == NULL) {
    return -1;
  }
  executable_length = strlen(executable);
  if (executable_length <= suffix_length
      || strcmp(executable + executable_length - suffix_length, WELCOME_COINS_LAUNCHER_SUFFIX) != 0) {
    return -1;
  }
  root_length = executable_length - suffix_length;
  if (root_length + strlen(WELCOME_COINS_PRELOAD_SUFFIX) + 1U > PATH_MAX
      || root_length + strlen(WELCOME_COINS_CHILD_SUFFIX) + 1U > PATH_MAX) {
    return -1;
  }
  memcpy(preload, executable, root_length);
  preload[root_length] = '\0';
  strcat(preload, WELCOME_COINS_PRELOAD_SUFFIX);
  memcpy(child_script, executable, root_length);
  child_script[root_length] = '\0';
  strcat(child_script, WELCOME_COINS_CHILD_SUFFIX);
  return 0;
}

static int drop_child_privileges(uid_t service_uid, gid_t service_gid) {
  struct __user_cap_header_struct header;
  struct __user_cap_data_struct data[2];
  int capability;

  if (setgroups(1U, &service_gid) != 0) {
    return -1;
  }
#ifdef PR_CAP_AMBIENT
  if (prctl(PR_CAP_AMBIENT, PR_CAP_AMBIENT_CLEAR_ALL, 0L, 0L, 0L) != 0
      && errno != EINVAL) {
    return -1;
  }
#endif
  for (capability = 0; capability <= 63; capability += 1) {
    if (prctl(PR_CAPBSET_DROP, capability, 0L, 0L, 0L) != 0 && errno != EINVAL) {
      return -1;
    }
  }
  if (setresgid(service_gid, service_gid, service_gid) != 0
      || setresuid(service_uid, service_uid, service_uid) != 0) {
    return -1;
  }
  memset(&header, 0, sizeof(header));
  memset(data, 0, sizeof(data));
  header.version = _LINUX_CAPABILITY_VERSION_3;
  header.pid = 0;
  if (syscall(SYS_capset, &header, data) != 0 /* capset */
      || prctl(PR_SET_NO_NEW_PRIVS, 1L, 0L, 0L, 0L) != 0) {
    return -1;
  }
  return 0;
}

static void exec_custody_child(
  int bootstrap_descriptor,
  uid_t service_uid,
  gid_t service_gid,
  const char *preload,
  const char *child_script
) {
  char *const arguments[] = {
    (char *)WELCOME_COINS_NODE_PATH,
    (char *)child_script,
    NULL
  };
  pid_t expected_parent = getppid();
  int parent_death_signal = 0;

  if (bootstrap_descriptor == WELCOME_COINS_BOOTSTRAP_FD) {
    if (fcntl(WELCOME_COINS_BOOTSTRAP_FD, F_SETFD, 0) != 0) {
      _exit(125);
    }
  } else {
    if (dup3(bootstrap_descriptor, WELCOME_COINS_BOOTSTRAP_FD, 0) != WELCOME_COINS_BOOTSTRAP_FD) {
      _exit(125);
    }
    (void)close(bootstrap_descriptor);
  }
  (void)close(3);
  (void)close(4);
  (void)close(5);
  (void)close(WELCOME_COINS_CONTROLLER_FD);
#ifdef SYS_close_range
  if (syscall(SYS_close_range, 8U, UINT_MAX, 0U) != 0) {
    _exit(125);
  }
#endif
  if (ptrace(PTRACE_TRACEME, 0, NULL, NULL) != 0 || raise(SIGSTOP) != 0) {
    _exit(125);
  }
  if (drop_child_privileges(service_uid, service_gid) != 0) {
    _exit(125);
  }
  if (expected_parent <= 1
      || getppid() != expected_parent
      || prctl(PR_SET_PDEATHSIG, (unsigned long)SIGKILL, 0UL, 0UL, 0UL) != 0
      || prctl(
        PR_GET_PDEATHSIG,
        (unsigned long)(uintptr_t)&parent_death_signal,
        0UL,
        0UL,
        0UL
      ) != 0
      || parent_death_signal != SIGKILL
      || getppid() != expected_parent) {
    _exit(125);
  }
  if (clearenv() != 0
      || setenv("PATH", "/usr/bin:/bin", 1) != 0
      || setenv("LANG", "C", 1) != 0
      || setenv("LC_ALL", "C", 1) != 0
      || setenv("LD_PRELOAD", preload, 1) != 0) {
    _exit(125);
  }
  execve(WELCOME_COINS_NODE_PATH, arguments, environ);
  _exit(125);
}

static int read_small_file(const char *path, char *buffer, size_t capacity) {
  int descriptor;
  ssize_t count;
  size_t total = 0U;

  descriptor = open(path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (descriptor < 0) {
    return -1;
  }
  while (total + 1U < capacity) {
    do {
      count = read(descriptor, buffer + total, capacity - total - 1U);
    } while (count < 0 && errno == EINTR);
    if (count < 0) {
      (void)close(descriptor);
      return -1;
    }
    if (count == 0) {
      break;
    }
    total += (size_t)count;
  }
  (void)close(descriptor);
  if (total == 0U || total + 1U >= capacity) {
    return -1;
  }
  buffer[total] = '\0';
  return 0;
}

static const char *status_value(const char *status, const char *name) {
  size_t length = strlen(name);
  const char *cursor = status;
  while (*cursor != '\0') {
    if ((cursor == status || cursor[-1] == '\n')
        && strncmp(cursor, name, length) == 0
        && cursor[length] == ':') {
      cursor += length + 1U;
      while (*cursor == ' ' || *cursor == '\t') {
        cursor += 1;
      }
      return cursor;
    }
    cursor = strchr(cursor, '\n');
    if (cursor == NULL) {
      break;
    }
    cursor += 1;
  }
  return NULL;
}

static int status_integer_equals(const char *status, const char *name, unsigned long expected) {
  const char *value = status_value(status, name);
  char *end = NULL;
  unsigned long parsed;
  if (value == NULL) {
    return -1;
  }
  errno = 0;
  parsed = strtoul(value, &end, 10);
  if (errno != 0 || end == value || (*end != '\n' && *end != '\0')) {
    return -1;
  }
  return parsed == expected ? 0 : -1;
}

static int status_four_ids_equal(const char *status, const char *name, unsigned long expected) {
  const char *value = status_value(status, name);
  unsigned long values[4];
  char trailing;
  if (value == NULL
      || sscanf(value, "%lu %lu %lu %lu%c", &values[0], &values[1], &values[2], &values[3], &trailing) < 4) {
    return -1;
  }
  return values[0] == expected && values[1] == expected
      && values[2] == expected && values[3] == expected ? 0 : -1;
}

static int status_one_id_equals(const char *status, const char *name, unsigned long expected) {
  const char *value = status_value(status, name);
  char *end = NULL;
  unsigned long parsed;
  if (value == NULL) {
    return -1;
  }
  errno = 0;
  parsed = strtoul(value, &end, 10);
  if (errno != 0 || end == value) {
    return -1;
  }
  while (*end == ' ' || *end == '\t') {
    end += 1;
  }
  return parsed == expected && (*end == '\n' || *end == '\0') ? 0 : -1;
}

static int status_zero_capability(const char *status, const char *name) {
  const char *value = status_value(status, name);
  return value != NULL && strncmp(value, "0000000000000000", 16U) == 0
      && (value[16] == '\n' || value[16] == '\0') ? 0 : -1;
}

static const char *synthetic_post_exec_barrier_condition;

static void record_synthetic_post_exec_stage(const char *synthetic_condition) {
#ifdef WELCOME_COINS_SYNTHETIC_DIAGNOSTIC
  synthetic_post_exec_barrier_condition = synthetic_condition;
#else
  (void)synthetic_condition;
#endif
}


static int verify_child_proc(
  pid_t child,
  uid_t service_uid,
  gid_t service_gid,
  pid_t tracer_pid,
  int require_stopped
) {
  char path[64];
  char status[8192];
  const char *namespace_pid;
  struct stat proc_metadata;

  if (snprintf(path, sizeof(path), "/proc/%ld/status", (long)child) <= 0
      || read_small_file(path, status, sizeof(status)) != 0) {
    record_synthetic_post_exec_stage("synthetic_post_exec_status_read_invalid");
    return -1;
  }
  if (status_four_ids_equal(status, "Uid", (unsigned long)service_uid) != 0
      || status_four_ids_equal(status, "Gid", (unsigned long)service_gid) != 0
      || status_one_id_equals(status, "Groups", (unsigned long)service_gid) != 0) {
    record_synthetic_post_exec_stage("synthetic_post_exec_status_identity_invalid");
    return -1;
  }
  if (status_integer_equals(status, "PPid", (unsigned long)getpid()) != 0
      || status_integer_equals(status, "TracerPid", (unsigned long)tracer_pid) != 0) {
    record_synthetic_post_exec_stage("synthetic_post_exec_status_parent_invalid");
    return -1;
  }
  if (status_integer_equals(status, "NoNewPrivs", 1UL) != 0
      || status_zero_capability(status, "CapInh") != 0
      || status_zero_capability(status, "CapPrm") != 0
      || status_zero_capability(status, "CapEff") != 0
      || status_zero_capability(status, "CapBnd") != 0
      || status_zero_capability(status, "CapAmb") != 0) {
    record_synthetic_post_exec_stage("synthetic_post_exec_status_security_invalid");
    return -1;
  }
  namespace_pid = status_value(status, "NSpid");
  if (namespace_pid == NULL || strtoul(namespace_pid, NULL, 10) != (unsigned long)child
      || strchr(namespace_pid, '\t') != NULL) {
    record_synthetic_post_exec_stage("synthetic_post_exec_status_namespace_invalid");
    return -1;
  }
  if (require_stopped != 0) {
    const char *state = status_value(status, "State");
    if (state == NULL || (*state != 'T' && *state != 't')) {
      record_synthetic_post_exec_stage("synthetic_post_exec_status_stop_invalid");
      return -1;
    }
  }
  if (snprintf(path, sizeof(path), "/proc/%ld", (long)child) <= 0
      || stat(path, &proc_metadata) != 0
      || proc_metadata.st_uid != 0U
      || proc_metadata.st_gid != 0U) {
    record_synthetic_post_exec_stage("synthetic_post_exec_status_proc_invalid");
    return -1;
  }
  return 0;
}

static int verify_stopped_child_liveness(
  pid_t child,
  int child_pidfd,
  uid_t service_uid,
  gid_t service_gid
) {
  return pidfd_child_has_exited(child_pidfd) == 0
      && verify_child_proc(child, service_uid, service_gid, 0, 1) == 0 ? 0 : -1;
}

static int stop_child_for_held_custody(
  pid_t child,
  int child_pidfd,
  uid_t service_uid,
  gid_t service_gid
) {
  int status;
  if (pidfd_send_signal_checked(child_pidfd, SIGSTOP) != 0
      || waitpid_bounded(child, &status, WUNTRACED, WELCOME_COINS_IO_TIMEOUT_MS) != 0
      || !WIFSTOPPED(status)
      || WSTOPSIG(status) != SIGSTOP
      || verify_stopped_child_liveness(child, child_pidfd, service_uid, service_gid) != 0) {
    return -1;
  }
  return 0;
}

static int wait_for_held_controller_io(int child_pidfd, short controller_events) {
  struct pollfd items[2];
  int result;
  memset(items, 0, sizeof(items));
  items[0].fd = WELCOME_COINS_CONTROLLER_FD;
  items[0].events = controller_events;
  items[1].fd = child_pidfd;
  items[1].events = POLLIN;
  for (;;) {
    result = poll(items, 2U, -1);
    if (result < 0 && errno == EINTR) continue;
    if (result <= 0) return -1;
    if ((items[1].revents & (POLLIN | POLLHUP | POLLERR | POLLNVAL)) != 0) return -1;
    if ((items[0].revents & (POLLHUP | POLLERR | POLLNVAL)) != 0) return -1;
    if ((items[0].revents & controller_events) != 0) return 0;
  }
}

static int receive_exact_held_bytes(
  void *buffer,
  size_t size,
  pid_t child,
  int child_pidfd,
  uid_t service_uid,
  gid_t service_gid
) {
  size_t offset = 0U;
  while (offset < size) {
    struct iovec iov;
    struct msghdr message;
    char control[CMSG_SPACE(sizeof(int))];
    ssize_t received;
    if (verify_stopped_child_liveness(
      child,
      child_pidfd,
      service_uid,
      service_gid
    ) != 0 || wait_for_held_controller_io(child_pidfd, POLLIN) != 0) {
      return -1;
    }
    memset(&iov, 0, sizeof(iov));
    memset(&message, 0, sizeof(message));
    memset(control, 0, sizeof(control));
    iov.iov_base = (unsigned char *)buffer + offset;
    iov.iov_len = size - offset;
    message.msg_iov = &iov;
    message.msg_iovlen = 1U;
    message.msg_control = control;
    message.msg_controllen = sizeof(control);
    received = recvmsg(WELCOME_COINS_CONTROLLER_FD, &message, MSG_CMSG_CLOEXEC);
    if (received < 0 && errno == EINTR) continue;
    if (received <= 0
        || (message.msg_flags & (MSG_CTRUNC | MSG_TRUNC)) != 0
        || CMSG_FIRSTHDR(&message) != NULL) {
      return -1;
    }
    offset += (size_t)received;
  }
  return verify_stopped_child_liveness(
    child,
    child_pidfd,
    service_uid,
    service_gid
  );
}

static ssize_t wait_for_held_controller_frame(
  struct frame_packet *packet,
  pid_t child,
  int child_pidfd,
  uid_t service_uid,
  gid_t service_gid
) {
  size_t header_size = sizeof(packet->magic) + sizeof(packet->size);
  uint32_t payload_size;
  if (receive_exact_held_bytes(
    packet,
    header_size,
    child,
    child_pidfd,
    service_uid,
    service_gid
  ) != 0) {
    return -1;
  }
  payload_size = ntohl(packet->size);
  if (payload_size > WELCOME_COINS_FRAME_MAX_BYTES
      || receive_exact_held_bytes(
        packet->bytes,
        payload_size,
        child,
        child_pidfd,
        service_uid,
        service_gid
      ) != 0) {
    return -1;
  }
  return (ssize_t)(header_size + payload_size);
}

static int send_packet_while_child_held(
  const void *buffer,
  size_t size,
  pid_t child,
  int child_pidfd,
  uid_t service_uid,
  gid_t service_gid
) {
  size_t offset = 0U;
  while (offset < size) {
    ssize_t written;
    if (verify_stopped_child_liveness(
      child,
      child_pidfd,
      service_uid,
      service_gid
    ) != 0 || wait_for_held_controller_io(child_pidfd, POLLOUT) != 0) {
      return -1;
    }
    written = send(
      WELCOME_COINS_CONTROLLER_FD,
      (const unsigned char *)buffer + offset,
      size - offset,
      MSG_NOSIGNAL
    );
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) return -1;
    offset += (size_t)written;
  }
  return verify_stopped_child_liveness(
    child,
    child_pidfd,
    service_uid,
    service_gid
  );
}

static int wait_for_detached_stop(pid_t child, uid_t service_uid, gid_t service_gid) {
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);
  if (deadline < 0) {
    return -1;
  }
  for (;;) {
    int remaining;
    if (verify_child_proc(child, service_uid, service_gid, 0, 1) == 0) {
      return 0;
    }
    remaining = remaining_milliseconds(deadline);
    if (remaining < 0) {
      return -1;
    }
    (void)poll(NULL, 0, remaining < 10 ? remaining : 10);
  }
}

static const char *synthetic_post_exec_barrier_condition =
  "synthetic_post_exec_barrier_invalid";

static int post_exec_barrier_failure(const char *synthetic_condition) {
#ifdef WELCOME_COINS_SYNTHETIC_DIAGNOSTIC
  synthetic_post_exec_barrier_condition = synthetic_condition;
#else
  (void)synthetic_condition;
#endif
  return -1;
}

static int establish_exec_barrier(pid_t child, uid_t service_uid, gid_t service_gid) {
  int status;

  if (waitpid_bounded(child, &status, WUNTRACED, WELCOME_COINS_IO_TIMEOUT_MS) != 0) {
    return post_exec_barrier_failure("synthetic_post_exec_initial_stop_wait_invalid");
  }
  if (!WIFSTOPPED(status) || WSTOPSIG(status) != SIGSTOP) {
    return post_exec_barrier_failure("synthetic_post_exec_initial_stop_invalid");
  }
  if (ptrace(PTRACE_SETOPTIONS, child, NULL, (void *)(uintptr_t)PTRACE_O_TRACEEXEC) != 0) {
    return post_exec_barrier_failure("synthetic_post_exec_ptrace_setoptions_invalid");
  }
  if (ptrace(PTRACE_CONT, child, NULL, NULL) != 0) {
    return post_exec_barrier_failure("synthetic_post_exec_ptrace_continue_invalid");
  }
  if (waitpid_bounded(child, &status, WUNTRACED, WELCOME_COINS_IO_TIMEOUT_MS) != 0) {
    return post_exec_barrier_failure("synthetic_post_exec_exec_wait_invalid");
  }
  if (!WIFSTOPPED(status) || WSTOPSIG(status) != SIGTRAP
      || ((unsigned int)status >> 16U) != PTRACE_EVENT_EXEC) {
    return post_exec_barrier_failure("synthetic_post_exec_exec_event_invalid");
  }
  if (ptrace(PTRACE_CONT, child, NULL, NULL) != 0) {
    return post_exec_barrier_failure("synthetic_post_exec_bootstrap_continue_invalid");
  }
  if (waitpid_bounded(child, &status, WUNTRACED, WELCOME_COINS_IO_TIMEOUT_MS) != 0) {
    return post_exec_barrier_failure("synthetic_post_exec_bootstrap_stop_wait_invalid");
  }
  if (!WIFSTOPPED(status) || WSTOPSIG(status) != SIGSTOP) {
    return post_exec_barrier_failure("synthetic_post_exec_bootstrap_stop_invalid");
  }
  record_synthetic_post_exec_stage("synthetic_post_exec_bootstrap_process_invalid");
  if (verify_child_proc(child, service_uid, service_gid, getpid(), 1) != 0) {
    return post_exec_barrier_failure(synthetic_post_exec_barrier_condition);
  }
  if (ptrace(PTRACE_DETACH, child, NULL, (void *)(uintptr_t)SIGSTOP) != 0) {
    return post_exec_barrier_failure("synthetic_post_exec_ptrace_detach_invalid");
  }
  if (wait_for_detached_stop(child, service_uid, service_gid) != 0) {
    return post_exec_barrier_failure("synthetic_post_exec_detached_stop_invalid");
  }
  return 0;
}

static int create_capability_file(const unsigned char *bytes, size_t size) {
  char proc_path[64];
  int writer;
  int reader;
  ssize_t count;
  size_t offset = 0U;

  writer = (int)syscall(
    SYS_memfd_create,
    "welcome-coins-execution-envelope",
    MFD_CLOEXEC | MFD_ALLOW_SEALING
  );
  if (writer < 0 || fchmod(writer, 0400) != 0) {
    if (writer >= 0) {
      (void)close(writer);
    }
    return -1;
  }
  while (offset < size) {
    do {
      count = write(writer, bytes + offset, size - offset);
    } while (count < 0 && errno == EINTR);
    if (count <= 0) {
      (void)close(writer);
      return -1;
    }
    offset += (size_t)count;
  }
  if (fcntl(writer, F_ADD_SEALS, F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL) != 0
      || snprintf(proc_path, sizeof(proc_path), "/proc/self/fd/%d", writer) <= 0) {
    (void)close(writer);
    return -1;
  }
  reader = open(proc_path, O_RDONLY | O_CLOEXEC);
  (void)close(writer);
  return reader;
}

static int send_exact_rights(int socket_descriptor, const int descriptors[3]) {
  char payload[sizeof(WELCOME_COINS_RIGHTS_MAGIC)] = WELCOME_COINS_RIGHTS_MAGIC;
  char control[CMSG_SPACE(sizeof(int) * 3U)];
  struct iovec iov;
  struct msghdr message;
  struct cmsghdr *rights;
  ssize_t sent;
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);

  if (deadline < 0) {
    return -1;
  }

  memset(control, 0, sizeof(control));
  memset(&iov, 0, sizeof(iov));
  memset(&message, 0, sizeof(message));
  iov.iov_base = payload;
  iov.iov_len = sizeof(payload);
  message.msg_iov = &iov;
  message.msg_iovlen = 1U;
  message.msg_control = control;
  message.msg_controllen = sizeof(control);
  rights = CMSG_FIRSTHDR(&message);
  if (rights == NULL) {
    return -1;
  }
  rights->cmsg_level = SOL_SOCKET;
  rights->cmsg_type = SCM_RIGHTS;
  rights->cmsg_len = CMSG_LEN(sizeof(int) * 3U);
  memcpy(CMSG_DATA(rights), descriptors, sizeof(int) * 3U);
  message.msg_controllen = CMSG_SPACE(sizeof(int) * 3U);
  for (;;) {
    if (wait_fd_until(socket_descriptor, POLLOUT, deadline) != 0) {
      return -1;
    }
    sent = sendmsg(socket_descriptor, &message, MSG_NOSIGNAL);
    if (sent < 0 && errno == EINTR) {
      continue;
    }
    break;
  }
  return sent == (ssize_t)sizeof(payload) ? 0 : -1;
}

static int read_canonical_frame(int descriptor, unsigned char *bytes, size_t capacity, size_t *size) {
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);
  size_t total = 0U;
  ssize_t count;

  if (deadline < 0) {
    return -1;
  }
  while (total < capacity) {
    if (wait_fd_until(descriptor, POLLIN, deadline) != 0) {
      return -1;
    }
    count = read(descriptor, bytes + total, capacity - total);
    if (count < 0 && errno == EINTR) {
      continue;
    }
    if (count < 0) {
      return -1;
    }
    if (count == 0) {
      break;
    }
    total += (size_t)count;
    if (memchr(bytes, '\n', total) != NULL) {
      break;
    }
  }
  if (total < 2U || total > capacity || bytes[total - 1U] != '\n'
      || memchr(bytes, '\r', total) != NULL
      || memchr(bytes, '\n', total - 1U) != NULL) {
    return -1;
  }
  *size = total;
  return 0;
}

static int require_canonical_frame_eof(int descriptor) {
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);
  unsigned char byte = 0U;
  ssize_t count;
  if (deadline < 0 || wait_fd_until(descriptor, POLLIN | POLLHUP, deadline) != 0) {
    return -1;
  }
  do {
    count = read(descriptor, &byte, 1U);
  } while (count < 0 && errno == EINTR);
  byte = 0U;
  return count == 0 ? 0 : -1;
}

static int write_all(int descriptor, const unsigned char *bytes, size_t size) {
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);
  size_t offset = 0U;
  ssize_t count;
  if (deadline < 0) {
    return -1;
  }
  while (offset < size) {
    if (wait_fd_until(descriptor, POLLOUT, deadline) != 0) {
      return -1;
    }
    count = write(descriptor, bytes + offset, size - offset);
    if (count < 0 && errno == EINTR) {
      continue;
    }
    if (count <= 0) {
      return -1;
    }
    offset += (size_t)count;
  }
  return 0;
}

static int write_release_while_child_held(
  int descriptor,
  const unsigned char *bytes,
  size_t size,
  pid_t child,
  int child_pidfd,
  uid_t service_uid,
  gid_t service_gid
) {
  int pipe_capacity;
  ssize_t count;

  /* FD5 is empty after the child emitted HELD. Keep the write untimed and
   * smaller than the verified pipe capacity so a live controller cannot lose
   * custody merely because a fixed timer elapsed. */
  pipe_capacity = fcntl(descriptor, F_GETPIPE_SZ);
  if (size == 0U
      || pipe_capacity <= 0
      || size > (size_t)pipe_capacity
      || verify_stopped_child_liveness(
        child,
        child_pidfd,
        service_uid,
        service_gid
      ) != 0
      || wait_for_held_controller_io(child_pidfd, POLLOUT) != 0) {
    return -1;
  }
  do {
    count = write(descriptor, bytes, size);
  } while (count < 0 && errno == EINTR);
  if (count != (ssize_t)size) {
    return -1;
  }
  return verify_stopped_child_liveness(
    child,
    child_pidfd,
    service_uid,
    service_gid
  );
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

int main(int argc, char **argv) {
  struct setup_packet setup;
  struct ready_packet ready;
  struct frame_packet authorize;
  struct frame_packet forwarded;
  struct frame_packet commit;
  struct frame_packet held;
  struct frame_packet release;
  struct frame_packet heartbeat_ack;
  struct stat acquired_metadata;
  struct stat authorization_metadata;
  int bootstrap_pair[2] = {-1, -1};
  int acquired_pipe[2] = {-1, -1};
  int authorization_pipe[2] = {-1, -1};
  int rights[3] = {-1, -1, -1};
  int status;
  int child_exit = 1;
  int64_t setup_deadline;
  char preload[PATH_MAX];
  char child_script[PATH_MAX];
  ssize_t packet_size;
  size_t acquired_size = 0U;
  size_t held_size = 0U;
  pid_t child;
  int child_pidfd = -1;
  uid_t service_uid;
  gid_t service_gid;

  (void)argv;
  memset(&setup, 0, sizeof(setup));
  memset(&ready, 0, sizeof(ready));
  memset(&authorize, 0, sizeof(authorize));
  memset(&forwarded, 0, sizeof(forwarded));
  memset(&commit, 0, sizeof(commit));
  memset(&held, 0, sizeof(held));
  memset(&release, 0, sizeof(release));
  memset(&heartbeat_ack, 0, sizeof(heartbeat_ack));
  if (argc != 1 || geteuid() != 0 || getegid() != 0) {
    emit_blocked("invoker_not_root");
    return 1;
  }
  reject_environment_pollution();
  if (require_root_stream_peer(WELCOME_COINS_CONTROLLER_FD, getppid()) != 0
      || derive_fixed_paths(preload, child_script) != 0) {
    emit_blocked("native_launcher_invalid");
    return 1;
  }
  setup_deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);
  if (setup_deadline < 0
      || receive_exact_bytes(&setup, sizeof(setup), setup_deadline) != 0
      || !exact_magic(setup.magic, WELCOME_COINS_SETUP_MAGIC)) {
    emit_blocked("native_setup_invalid");
    return 1;
  }
  service_uid = (uid_t)ntohl(setup.service_uid);
  service_gid = (gid_t)ntohl(setup.service_gid);
  if (service_uid == 0U || service_gid == 0U) {
    emit_blocked("service_principal_identity_invalid");
    return 1;
  }
  if (socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, bootstrap_pair) != 0
      || pipe2(acquired_pipe, O_CLOEXEC) != 0
      || pipe2(authorization_pipe, O_CLOEXEC) != 0) {
    emit_blocked("native_channel_invalid");
    goto cleanup;
  }

  child = fork();
  if (child < 0) {
    emit_blocked("native_spawn_failed");
    goto cleanup;
  }
  if (child == 0) {
    (void)close(bootstrap_pair[0]);
    (void)close(acquired_pipe[0]);
    (void)close(acquired_pipe[1]);
    (void)close(authorization_pipe[0]);
    (void)close(authorization_pipe[1]);
    exec_custody_child(
      bootstrap_pair[1],
      service_uid,
      service_gid,
      preload,
      child_script
    );
  }
  child_pidfd = pidfd_open_child(child);
  if (child_pidfd < 0) {
    /* The unreaped fork result cannot be PID-reused before this pre-bind reap. */
    (void)kill(child, SIGKILL);
    (void)waitpid_bounded(child, &status, 0, WELCOME_COINS_IO_TIMEOUT_MS);
    emit_blocked("native_spawn_failed");
    goto cleanup;
  }
  active_child = child;
  active_child_pidfd = child_pidfd;
  (void)close(bootstrap_pair[1]);
  bootstrap_pair[1] = -1;
  if (establish_exec_barrier(child, service_uid, service_gid) != 0) {
    emit_post_exec_security_invalid(synthetic_post_exec_barrier_condition);
    goto cleanup;
  }
  if (fstat(acquired_pipe[1], &acquired_metadata) != 0
      || fstat(authorization_pipe[0], &authorization_metadata) != 0) {
    emit_post_exec_security_invalid("synthetic_post_exec_pipe_invalid");
    goto cleanup;
  }
  memcpy(ready.magic, WELCOME_COINS_READY_MAGIC, sizeof(WELCOME_COINS_READY_MAGIC));
  ready.child_pid = htonl((uint32_t)child);
  ready.acquired_dev = host_to_be64((uint64_t)acquired_metadata.st_dev);
  ready.acquired_ino = host_to_be64((uint64_t)acquired_metadata.st_ino);
  ready.authorization_dev = host_to_be64((uint64_t)authorization_metadata.st_dev);
  ready.authorization_ino = host_to_be64((uint64_t)authorization_metadata.st_ino);
  if (send_packet(&ready, sizeof(ready)) != 0) {
    emit_blocked("root_authorization_unavailable");
    goto cleanup;
  }

  packet_size = receive_frame_packet(&authorize);
  if (packet_size < (ssize_t)(sizeof(authorize.magic) + sizeof(authorize.size))
      || !exact_magic(authorize.magic, WELCOME_COINS_AUTHORIZE_MAGIC)) {
    emit_blocked("root_authorization_invalid");
    goto cleanup;
  }
  authorize.size = ntohl(authorize.size);
  if (authorize.size < 2U
      || authorize.size > WELCOME_COINS_FRAME_MAX_BYTES
      || packet_size != (ssize_t)(sizeof(authorize.magic) + sizeof(uint32_t) + authorize.size)
      || authorize.bytes[authorize.size - 1U] != '\n'
      || memchr(authorize.bytes, '\n', authorize.size - 1U) != NULL
      || memchr(authorize.bytes, '\r', authorize.size) != NULL) {
    emit_blocked("root_authorization_invalid");
    goto cleanup;
  }
  rights[0] = create_capability_file(authorize.bytes, authorize.size);
  rights[1] = acquired_pipe[1];
  rights[2] = authorization_pipe[0];
  if (rights[0] < 0
      || send_exact_rights(bootstrap_pair[0], rights) != 0
      || pidfd_send_signal_checked(child_pidfd, SIGCONT) != 0) {
    emit_blocked("capability_delivery_failed");
    goto cleanup;
  }
  (void)close(rights[0]);
  rights[0] = -1;
  (void)close(acquired_pipe[1]);
  acquired_pipe[1] = -1;
  (void)close(authorization_pipe[0]);
  authorization_pipe[0] = -1;
  (void)close(bootstrap_pair[0]);
  bootstrap_pair[0] = -1;

  if (read_canonical_frame(
    acquired_pipe[0],
    forwarded.bytes,
    sizeof(forwarded.bytes),
    &acquired_size
  ) != 0) {
    emit_blocked("custody_acquired_invalid");
    goto cleanup;
  }
  memcpy(forwarded.magic, WELCOME_COINS_ACQUIRED_MAGIC, sizeof(WELCOME_COINS_ACQUIRED_MAGIC));
  forwarded.size = htonl((uint32_t)acquired_size);
  if (send_packet(
    &forwarded,
    sizeof(forwarded.magic) + sizeof(forwarded.size) + acquired_size
  ) != 0) {
    emit_blocked("custody_acquired_invalid");
    goto cleanup;
  }
  packet_size = receive_frame_packet(&commit);
  if (packet_size < (ssize_t)(sizeof(commit.magic) + sizeof(commit.size))
      || !exact_magic(commit.magic, WELCOME_COINS_COMMIT_MAGIC)) {
    emit_blocked("parent_authorization_invalid");
    goto cleanup;
  }
  commit.size = ntohl(commit.size);
  if (commit.size < 2U
      || commit.size > WELCOME_COINS_FRAME_MAX_BYTES
      || packet_size != (ssize_t)(sizeof(commit.magic) + sizeof(uint32_t) + commit.size)
      || commit.bytes[commit.size - 1U] != '\n'
      || memchr(commit.bytes, '\n', commit.size - 1U) != NULL
      || memchr(commit.bytes, '\r', commit.size) != NULL
      || write_all(authorization_pipe[1], commit.bytes, commit.size) != 0) {
    emit_blocked("parent_authorization_invalid");
    goto cleanup;
  }
  if (read_canonical_frame(
    acquired_pipe[0],
    held.bytes,
    sizeof(held.bytes),
    &held_size
  ) != 0 || require_canonical_frame_eof(acquired_pipe[0]) != 0) {
    emit_blocked("custody_held_invalid");
    goto cleanup;
  }
  if (stop_child_for_held_custody(
    child,
    child_pidfd,
    service_uid,
    service_gid
  ) != 0) {
    emit_blocked("custody_held_invalid");
    goto cleanup;
  }
  memcpy(held.magic, WELCOME_COINS_HELD_MAGIC, sizeof(WELCOME_COINS_HELD_MAGIC));
  held.size = htonl((uint32_t)held_size);
  if (send_packet_while_child_held(
    &held,
    sizeof(held.magic) + sizeof(held.size) + held_size,
    child,
    child_pidfd,
    service_uid,
    service_gid
  ) != 0) {
    emit_blocked("custody_held_invalid");
    goto cleanup;
  }
  for (;;) {
    memset(&release, 0, sizeof(release));
    packet_size = wait_for_held_controller_frame(
      &release,
      child,
      child_pidfd,
      service_uid,
      service_gid
    );
    if (packet_size < (ssize_t)(sizeof(release.magic) + sizeof(release.size))) {
      emit_blocked("parent_authorization_invalid");
      goto cleanup;
    }
    release.size = ntohl(release.size);
    if (release.size < 2U
        || release.size > WELCOME_COINS_FRAME_MAX_BYTES
        || packet_size != (ssize_t)(sizeof(release.magic) + sizeof(uint32_t) + release.size)
        || release.bytes[release.size - 1U] != '\n'
        || memchr(release.bytes, '\n', release.size - 1U) != NULL
        || memchr(release.bytes, '\r', release.size) != NULL) {
      emit_blocked("parent_authorization_invalid");
      goto cleanup;
    }
    if (exact_magic(release.magic, WELCOME_COINS_HEARTBEAT_MAGIC)) {
      if (verify_stopped_child_liveness(
        child,
        child_pidfd,
        service_uid,
        service_gid
      ) != 0) {
        emit_blocked("custody_held_invalid");
        goto cleanup;
      }
      memset(&heartbeat_ack, 0, sizeof(heartbeat_ack));
      memcpy(
        heartbeat_ack.magic,
        WELCOME_COINS_HEARTBEAT_ACK_MAGIC,
        sizeof(WELCOME_COINS_HEARTBEAT_ACK_MAGIC)
      );
      heartbeat_ack.size = htonl(release.size);
      memcpy(heartbeat_ack.bytes, release.bytes, release.size);
      if (send_packet_while_child_held(
        &heartbeat_ack,
        sizeof(heartbeat_ack.magic) + sizeof(heartbeat_ack.size) + release.size,
        child,
        child_pidfd,
        service_uid,
        service_gid
      ) != 0) {
        emit_blocked("custody_held_invalid");
        goto cleanup;
      }
      continue;
    }
    if (!exact_magic(release.magic, WELCOME_COINS_RELEASE_MAGIC)
        || verify_stopped_child_liveness(
          child,
          child_pidfd,
          service_uid,
          service_gid
        ) != 0
        || write_release_while_child_held(
          authorization_pipe[1],
          release.bytes,
          release.size,
          child,
          child_pidfd,
          service_uid,
          service_gid
        ) != 0) {
      emit_blocked("parent_authorization_invalid");
      goto cleanup;
    }
    break;
  }
  (void)close(authorization_pipe[1]);
  authorization_pipe[1] = -1;
  if (pidfd_send_signal_checked(child_pidfd, SIGCONT) != 0) {
    emit_blocked("custody_held_invalid");
    goto cleanup;
  }
  if (waitpid_bounded(child, &status, 0, WELCOME_COINS_CHILD_TIMEOUT_MS) != 0) {
    emit_blocked("custody_child_timeout");
    goto cleanup;
  }
  active_child = -1;
  active_child_pidfd = -1;
  (void)close(child_pidfd);
  child_pidfd = -1;
  if (WIFEXITED(status)) {
    child_exit = WEXITSTATUS(status);
  }

cleanup:
  if (active_child > 0) {
    kill_child_and_reap();
    child_pidfd = -1;
  }
  if (child_pidfd >= 0) (void)close(child_pidfd);
  if (bootstrap_pair[0] >= 0) (void)close(bootstrap_pair[0]);
  if (bootstrap_pair[1] >= 0) (void)close(bootstrap_pair[1]);
  if (acquired_pipe[0] >= 0) (void)close(acquired_pipe[0]);
  if (acquired_pipe[1] >= 0) (void)close(acquired_pipe[1]);
  if (authorization_pipe[0] >= 0) (void)close(authorization_pipe[0]);
  if (authorization_pipe[1] >= 0) (void)close(authorization_pipe[1]);
  if (rights[0] >= 0) (void)close(rights[0]);
  memset(&setup, 0, sizeof(setup));
  memset(&authorize, 0, sizeof(authorize));
  memset(&commit, 0, sizeof(commit));
  memset(&held, 0, sizeof(held));
  memset(&release, 0, sizeof(release));
  memset(&heartbeat_ack, 0, sizeof(heartbeat_ack));
  memset(preload, 0, sizeof(preload));
  memset(child_script, 0, sizeof(child_script));
  return child_exit;
}
