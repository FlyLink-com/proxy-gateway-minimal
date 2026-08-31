#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <linux/capability.h>
#include <poll.h>
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define WELCOME_COINS_BOOTSTRAP_FD 6
#define WELCOME_COINS_IO_TIMEOUT_MS 30000
#define WELCOME_COINS_RIGHTS_MAGIC "welcome_coins_native_rights_v1"

extern char **environ;

static void bootstrap_fail(void) {
  _exit(126);
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

static int wait_readable_until(int descriptor, int64_t deadline) {
  struct pollfd item;

  memset(&item, 0, sizeof(item));
  item.fd = descriptor;
  item.events = POLLIN;
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
    if (result != 1 || (item.revents & POLLIN) == 0) {
      return -1;
    }
    return 0;
  }
}

static void reject_environment_pollution(void) {
  static const char *const forbidden[] = {
    "LD_AUDIT",
    "LD_LIBRARY_PATH",
    "LD_DEBUG",
    "NODE_OPTIONS",
    "NODE_PATH"
  };
  size_t index;
  const char *preload;

  for (index = 0; index < sizeof(forbidden) / sizeof(forbidden[0]); index += 1U) {
    if (getenv(forbidden[index]) != NULL) {
      bootstrap_fail();
    }
  }
  preload = getenv("LD_PRELOAD");
  if (preload == NULL
      || strstr(preload, "welcome-coins-post-exec-bootstrap.so") == NULL
      || strchr(preload, ':') != NULL
      || strchr(preload, ' ') != NULL) {
    bootstrap_fail();
  }
}

static void require_closed_descriptor(int descriptor) {
  errno = 0;
  if (fcntl(descriptor, F_GETFD) != -1 || errno != EBADF) {
    bootstrap_fail();
  }
}

static void require_zero_capabilities(void) {
  struct __user_cap_header_struct header;
  struct __user_cap_data_struct data[2];
  int capability;

  memset(&header, 0, sizeof(header));
  memset(data, 0, sizeof(data));
  header.version = _LINUX_CAPABILITY_VERSION_3;
  header.pid = 0;
  if (syscall(SYS_capget, &header, data) != 0) {
    bootstrap_fail();
  }
  if (data[0].effective != 0U || data[0].permitted != 0U || data[0].inheritable != 0U
      || data[1].effective != 0U || data[1].permitted != 0U || data[1].inheritable != 0U) {
    bootstrap_fail();
  }
  for (capability = 0; capability <= 63; capability += 1) {
    int bounded = prctl(PR_CAPBSET_READ, capability, 0L, 0L, 0L);
    if (bounded > 0) {
      bootstrap_fail();
    }
    if (bounded < 0 && errno != EINVAL) {
      bootstrap_fail();
    }
#ifdef PR_CAP_AMBIENT
    {
      int ambient = prctl(PR_CAP_AMBIENT, PR_CAP_AMBIENT_IS_SET, capability, 0L, 0L);
      if (ambient > 0) {
        bootstrap_fail();
      }
      if (ambient < 0 && errno != EINVAL) {
        bootstrap_fail();
      }
    }
#endif
  }
}

static void require_service_credentials(void) {
  uid_t real_uid;
  uid_t effective_uid;
  uid_t saved_uid;
  gid_t real_gid;
  gid_t effective_gid;
  gid_t saved_gid;
  gid_t supplementary_groups[1];

  if (getresuid(&real_uid, &effective_uid, &saved_uid) != 0
      || getresgid(&real_gid, &effective_gid, &saved_gid) != 0
      || real_uid == 0U
      || real_gid == 0U
      || real_uid != effective_uid
      || real_uid != saved_uid
      || real_gid != effective_gid
      || real_gid != saved_gid
      || getgroups(1, supplementary_groups) != 1
      || supplementary_groups[0] != real_gid) {
    bootstrap_fail();
  }
}

static void require_root_peer(int descriptor) {
  struct ucred peer;
  socklen_t peer_length = (socklen_t)sizeof(peer);
  int socket_type = 0;
  socklen_t type_length = (socklen_t)sizeof(socket_type);

  memset(&peer, 0, sizeof(peer));
  if (getsockopt(descriptor, SOL_SOCKET, SO_TYPE, &socket_type, &type_length) != 0
      || socket_type != SOCK_SEQPACKET
      || getsockopt(descriptor, SOL_SOCKET, SO_PEERCRED, &peer, &peer_length) != 0
      || peer_length != (socklen_t)sizeof(peer)
      || peer.uid != 0U
      || peer.gid != 0U
      || peer.pid != getppid()) {
    bootstrap_fail();
  }
}

static void require_access_mode(int descriptor, int expected) {
  int flags = fcntl(descriptor, F_GETFL);
  if (flags < 0 || (flags & O_ACCMODE) != expected) {
    bootstrap_fail();
  }
}

static void require_received_descriptors(const int descriptors[3]) {
  struct stat metadata;

  if (fstat(descriptors[0], &metadata) != 0
      || !S_ISREG(metadata.st_mode)
      || metadata.st_uid != 0U
      || metadata.st_gid != 0U
      || metadata.st_nlink != 0U
      || (metadata.st_mode & 0777U) != 0400U) {
    bootstrap_fail();
  }
  require_access_mode(descriptors[0], O_RDONLY);

  if (fstat(descriptors[1], &metadata) != 0 || !S_ISFIFO(metadata.st_mode)) {
    bootstrap_fail();
  }
  require_access_mode(descriptors[1], O_WRONLY);

  if (fstat(descriptors[2], &metadata) != 0 || !S_ISFIFO(metadata.st_mode)) {
    bootstrap_fail();
  }
  require_access_mode(descriptors[2], O_RDONLY);
}

static void receive_exact_rights(int descriptors[3]) {
  char payload[sizeof(WELCOME_COINS_RIGHTS_MAGIC)];
  char control[CMSG_SPACE(sizeof(int) * 3U)];
  struct iovec iov;
  struct msghdr message;
  struct cmsghdr *rights;
  ssize_t received;
  int64_t deadline = deadline_after_milliseconds(WELCOME_COINS_IO_TIMEOUT_MS);

  if (deadline < 0) {
    bootstrap_fail();
  }

  memset(payload, 0, sizeof(payload));
  memset(control, 0, sizeof(control));
  memset(&iov, 0, sizeof(iov));
  memset(&message, 0, sizeof(message));
  iov.iov_base = payload;
  iov.iov_len = sizeof(payload);
  message.msg_iov = &iov;
  message.msg_iovlen = 1U;
  message.msg_control = control;
  message.msg_controllen = sizeof(control);

  for (;;) {
    if (wait_readable_until(WELCOME_COINS_BOOTSTRAP_FD, deadline) != 0) {
      bootstrap_fail();
    }
    memset(control, 0, sizeof(control));
    message.msg_controllen = sizeof(control);
    message.msg_flags = 0;
    received = recvmsg(WELCOME_COINS_BOOTSTRAP_FD, &message, MSG_CMSG_CLOEXEC);
    if (received < 0 && errno == EINTR) {
      continue;
    }
    break;
  }
  if (received != (ssize_t)sizeof(payload)
      || (message.msg_flags & (MSG_CTRUNC | MSG_TRUNC)) != 0
      || memcmp(payload, WELCOME_COINS_RIGHTS_MAGIC, sizeof(payload)) != 0) {
    bootstrap_fail();
  }
  rights = CMSG_FIRSTHDR(&message);
  if (rights == NULL
      || rights->cmsg_level != SOL_SOCKET
      || rights->cmsg_type != SCM_RIGHTS
      || rights->cmsg_len != CMSG_LEN(sizeof(int) * 3U)
      || CMSG_NXTHDR(&message, rights) != NULL) {
    bootstrap_fail();
  }
  memcpy(descriptors, CMSG_DATA(rights), sizeof(int) * 3U);
}

static void install_final_descriptors(const int received[3]) {
  int retained[3];
  size_t index;

  for (index = 0; index < 3U; index += 1U) {
    retained[index] = fcntl(received[index], F_DUPFD_CLOEXEC, 10);
    if (retained[index] < 10) {
      bootstrap_fail();
    }
  }
  for (index = 0; index < 3U; index += 1U) {
    (void)close(received[index]);
  }
  if (dup3(retained[0], 3, 0) != 3
      || dup3(retained[1], 4, 0) != 4
      || dup3(retained[2], 5, 0) != 5) {
    bootstrap_fail();
  }
  for (index = 0; index < 3U; index += 1U) {
    (void)close(retained[index]);
  }
}

__attribute__((constructor)) __attribute__((visibility("default")))
static void welcome_coins_post_exec_bootstrap(void) {
  int descriptors[3] = {-1, -1, -1};
  int post_exec_parent_death_signal = 0;

  if (prctl(PR_SET_DUMPABLE, 0L, 0L, 0L, 0L) != 0
      || prctl(PR_GET_DUMPABLE, 0L, 0L, 0L, 0L) != 0
      || prctl(PR_GET_NO_NEW_PRIVS, 0L, 0L, 0L, 0L) != 1
      || prctl(
        PR_GET_PDEATHSIG,
        (unsigned long)(uintptr_t)&post_exec_parent_death_signal,
        0UL,
        0UL,
        0UL
      ) != 0
      || post_exec_parent_death_signal != SIGKILL) {
    bootstrap_fail();
  }
  reject_environment_pollution();
  require_service_credentials();
  require_zero_capabilities();
  require_closed_descriptor(3);
  require_closed_descriptor(4);
  require_closed_descriptor(5);
  require_root_peer(WELCOME_COINS_BOOTSTRAP_FD);

  if (raise(SIGSTOP) != 0) {
    bootstrap_fail();
  }
  if (prctl(PR_GET_DUMPABLE, 0L, 0L, 0L, 0L) != 0
      || prctl(PR_GET_NO_NEW_PRIVS, 0L, 0L, 0L, 0L) != 1) {
    bootstrap_fail();
  }
  receive_exact_rights(descriptors);
  require_received_descriptors(descriptors);
  install_final_descriptors(descriptors);
  if (close(WELCOME_COINS_BOOTSTRAP_FD) != 0
      || unsetenv("LD_PRELOAD") != 0
      || getenv("LD_AUDIT") != NULL
      || getenv("LD_LIBRARY_PATH") != NULL
      || getenv("LD_DEBUG") != NULL
      || getenv("NODE_OPTIONS") != NULL
      || getenv("NODE_PATH") != NULL
      || prctl(PR_GET_DUMPABLE, 0L, 0L, 0L, 0L) != 0) {
    bootstrap_fail();
  }
}
