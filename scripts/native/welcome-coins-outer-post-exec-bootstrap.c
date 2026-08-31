#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#define WELCOME_COINS_EXECUTION_ENVELOPE_FD 3
#define WELCOME_COINS_TRANSACTION_CLI_FD 8
#define WELCOME_COINS_OUTER_BOOTSTRAP_FD 9
#define WELCOME_COINS_NODE_FD 10
#define WELCOME_COINS_TRANSACTION_CLI_MAX_BYTES (2U * 1024U * 1024U)
#define WELCOME_COINS_OUTER_WRAPPER_SUFFIX \
  "/node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper"
#define WELCOME_COINS_OUTER_BOOTSTRAP_SUFFIX \
  "/node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so"
#define WELCOME_COINS_TRANSACTION_CLI_SUFFIX \
  "/scripts/control-plane-welcome-coins-activation-transaction-cli.mjs"
#define WELCOME_COINS_NODE_PATH "/usr/bin/node"

extern char **environ;

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

static void bootstrap_fail(void) {
  static const char output[] =
    "{\"schemaVersion\":\"1\",\"type\":\"welcome_coins_outer_post_exec_bootstrap\","
    "\"state\":\"blocked\",\"condition\":\"outer_runtime_invalid\"}\n";
  write_stderr_best_effort(output, sizeof(output) - 1U);
  _exit(126);
}

static int same_file_identity(const struct stat *left, const struct stat *right) {
  return left->st_dev == right->st_dev
    && left->st_ino == right->st_ino
    && left->st_size == right->st_size
    && left->st_mode == right->st_mode
    && left->st_uid == right->st_uid
    && left->st_gid == right->st_gid
    && left->st_nlink == right->st_nlink;
}

static void require_root_credentials(void) {
  uid_t real_uid;
  uid_t effective_uid;
  uid_t saved_uid;
  gid_t real_gid;
  gid_t effective_gid;
  gid_t saved_gid;

  if (getresuid(&real_uid, &effective_uid, &saved_uid) != 0
      || getresgid(&real_gid, &effective_gid, &saved_gid) != 0
      || real_uid != 0U || effective_uid != 0U || saved_uid != 0U
      || real_gid != 0U || effective_gid != 0U || saved_gid != 0U
      || getgroups(0, NULL) != 0) {
    bootstrap_fail();
  }
}

static void require_read_only_descriptor(int descriptor) {
  int flags = fcntl(descriptor, F_GETFL);
  if (flags < 0 || (flags & O_ACCMODE) != O_RDONLY) {
    bootstrap_fail();
  }
}

static void require_descriptor_identity(
  int descriptor,
  const char *path,
  mode_t mode,
  size_t maximum_bytes
) {
  struct stat descriptor_metadata;
  struct stat path_metadata;
  if (fstat(descriptor, &descriptor_metadata) != 0
      || lstat(path, &path_metadata) != 0
      || !same_file_identity(&descriptor_metadata, &path_metadata)
      || !S_ISREG(descriptor_metadata.st_mode)
      || descriptor_metadata.st_uid != 0U
      || descriptor_metadata.st_gid != 0U
      || descriptor_metadata.st_nlink != 1U
      || (descriptor_metadata.st_mode & 07777U) != mode
      || descriptor_metadata.st_size <= 0
      || (uintmax_t)descriptor_metadata.st_size > (uintmax_t)maximum_bytes) {
    bootstrap_fail();
  }
  require_read_only_descriptor(descriptor);
}

static const char *exact_environment_value(const char *name) {
  size_t name_length = strlen(name);
  size_t matches = 0U;
  const char *value = NULL;
  size_t index;
  for (index = 0U; environ[index] != NULL; index += 1U) {
    if (strncmp(environ[index], name, name_length) == 0
        && environ[index][name_length] == '=') {
      matches += 1U;
      value = environ[index] + name_length + 1U;
    }
  }
  return matches == 1U ? value : NULL;
}

static void require_exact_environment(
  char candidate_root[PATH_MAX],
  char wrapper_path[PATH_MAX]
) {
  static const char *const exact_names[] = {
    "PATH",
    "LANG",
    "LC_ALL",
    "LD_PRELOAD",
    "WELCOME_COINS_CANDIDATE_ROOT",
    "WELCOME_COINS_OUTER_WRAPPER"
  };
  const char *path = exact_environment_value("PATH");
  const char *lang = exact_environment_value("LANG");
  const char *locale = exact_environment_value("LC_ALL");
  const char *preload = exact_environment_value("LD_PRELOAD");
  const char *candidate = exact_environment_value("WELCOME_COINS_CANDIDATE_ROOT");
  const char *wrapper = exact_environment_value("WELCOME_COINS_OUTER_WRAPPER");
  size_t environment_count = 0U;
  size_t candidate_length;
  size_t wrapper_length;

  while (environ[environment_count] != NULL) environment_count += 1U;
  if (environment_count != sizeof(exact_names) / sizeof(exact_names[0])
      || path == NULL || strcmp(path, "/usr/bin:/bin") != 0
      || lang == NULL || strcmp(lang, "C") != 0
      || locale == NULL || strcmp(locale, "C") != 0
      || preload == NULL || strcmp(preload, "/proc/self/fd/9") != 0
      || candidate == NULL || candidate[0] != '/'
      || wrapper == NULL || wrapper[0] != '/') {
    bootstrap_fail();
  }
  candidate_length = strlen(candidate);
  wrapper_length = strlen(wrapper);
  if (candidate_length == 0U || candidate_length >= PATH_MAX
      || wrapper_length == 0U || wrapper_length >= PATH_MAX
      || candidate_length + strlen(WELCOME_COINS_OUTER_WRAPPER_SUFFIX) != wrapper_length
      || memcmp(wrapper, candidate, candidate_length) != 0
      || strcmp(wrapper + candidate_length, WELCOME_COINS_OUTER_WRAPPER_SUFFIX) != 0) {
    bootstrap_fail();
  }
  memcpy(candidate_root, candidate, candidate_length + 1U);
  memcpy(wrapper_path, wrapper, wrapper_length + 1U);
}

static void join_candidate_path(
  char output[PATH_MAX],
  const char *candidate_root,
  const char *suffix
) {
  int length = snprintf(output, PATH_MAX, "%s%s", candidate_root, suffix);
  if (length <= 0 || length >= PATH_MAX) {
    bootstrap_fail();
  }
}

static unsigned char *read_descriptor_bytes(int descriptor, size_t *size) {
  struct stat metadata;
  unsigned char *bytes;
  size_t offset = 0U;
  if (fstat(descriptor, &metadata) != 0
      || metadata.st_size <= 0
      || (uintmax_t)metadata.st_size > WELCOME_COINS_TRANSACTION_CLI_MAX_BYTES) {
    bootstrap_fail();
  }
  *size = (size_t)metadata.st_size;
  bytes = malloc(*size);
  if (bytes == NULL) bootstrap_fail();
  while (offset < *size) {
    ssize_t count;
    do {
      count = pread(descriptor, bytes + offset, *size - offset, (off_t)offset);
    } while (count < 0 && errno == EINTR);
    if (count <= 0) bootstrap_fail();
    offset += (size_t)count;
  }
  return bytes;
}

static unsigned char *read_proc_cmdline(size_t maximum, size_t *size) {
  int descriptor = open("/proc/self/cmdline", O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  unsigned char *bytes;
  size_t offset = 0U;
  if (descriptor < 0 || maximum == 0U) bootstrap_fail();
  bytes = malloc(maximum);
  if (bytes == NULL) bootstrap_fail();
  for (;;) {
    ssize_t count;
    if (offset == maximum) bootstrap_fail();
    do {
      count = read(descriptor, bytes + offset, maximum - offset);
    } while (count < 0 && errno == EINTR);
    if (count < 0) bootstrap_fail();
    if (count == 0) break;
    offset += (size_t)count;
  }
  if (close(descriptor) != 0 || offset == 0U) bootstrap_fail();
  *size = offset;
  return bytes;
}

static void require_exact_cmdline(void) {
  static const char first[] = WELCOME_COINS_NODE_PATH;
  static const char second[] = "--input-type=module";
  static const char third[] = "--eval";
  unsigned char *source;
  unsigned char *cmdline;
  size_t source_size;
  size_t cmdline_size;
  size_t expected_size;
  size_t offset = 0U;

  source = read_descriptor_bytes(WELCOME_COINS_TRANSACTION_CLI_FD, &source_size);
  expected_size = sizeof(first) + sizeof(second) + sizeof(third) + source_size + 1U;
  cmdline = read_proc_cmdline(expected_size + 1U, &cmdline_size);
  if (cmdline_size != expected_size
      || memcmp(cmdline + offset, first, sizeof(first)) != 0) {
    bootstrap_fail();
  }
  offset += sizeof(first);
  if (memcmp(cmdline + offset, second, sizeof(second)) != 0) bootstrap_fail();
  offset += sizeof(second);
  if (memcmp(cmdline + offset, third, sizeof(third)) != 0) bootstrap_fail();
  offset += sizeof(third);
  if (memcmp(cmdline + offset, source, source_size) != 0
      || cmdline[offset + source_size] != '\0') {
    bootstrap_fail();
  }
  memset(source, 0, source_size);
  free(source);
  free(cmdline);
}

static void require_node_executable(void) {
  struct stat proc_metadata;
  struct stat node_descriptor_metadata;
  struct stat node_path_metadata;
  if (stat("/proc/self/exe", &proc_metadata) != 0
      || fstat(WELCOME_COINS_NODE_FD, &node_descriptor_metadata) != 0
      || lstat(WELCOME_COINS_NODE_PATH, &node_path_metadata) != 0
      || !same_file_identity(&proc_metadata, &node_descriptor_metadata)
      || !same_file_identity(&node_descriptor_metadata, &node_path_metadata)
      || !S_ISREG(node_descriptor_metadata.st_mode)
      || node_descriptor_metadata.st_uid != 0U
      || node_descriptor_metadata.st_gid != 0U
      || node_descriptor_metadata.st_nlink != 1U
      || (node_descriptor_metadata.st_mode & 07777U) != 0755U) {
    bootstrap_fail();
  }
  require_read_only_descriptor(WELCOME_COINS_NODE_FD);
}

static void require_candidate_working_directory(const char *candidate_root) {
  char current[PATH_MAX];
  struct stat metadata;
  if (getcwd(current, sizeof(current)) == NULL
      || strcmp(current, candidate_root) != 0
      || lstat(current, &metadata) != 0
      || !S_ISDIR(metadata.st_mode)
      || metadata.st_uid != 0U
      || metadata.st_gid != 0U
      || (metadata.st_mode & 07022U) != 0U) {
    bootstrap_fail();
  }
}

static void require_execution_envelope_descriptor(void) {
  struct stat metadata;
  int flags;
  if (fstat(WELCOME_COINS_EXECUTION_ENVELOPE_FD, &metadata) != 0
      || !S_ISREG(metadata.st_mode)
      || metadata.st_uid != 0U
      || metadata.st_gid != 0U
      || metadata.st_nlink != 1U
      || (metadata.st_mode & 07777U) != 0400U
      || metadata.st_size <= 0
      || (uintmax_t)metadata.st_size > 16U * 1024U
      || (flags = fcntl(WELCOME_COINS_EXECUTION_ENVELOPE_FD, F_GETFL)) < 0
      || (flags & O_ACCMODE) != O_RDONLY
      || lseek(WELCOME_COINS_EXECUTION_ENVELOPE_FD, 0, SEEK_CUR) != 0) {
    bootstrap_fail();
  }
}

__attribute__((constructor))
static void welcome_coins_outer_post_exec_bootstrap(void) {
  char candidate_root[PATH_MAX];
  char wrapper_path[PATH_MAX];
  char transaction_cli_path[PATH_MAX];
  char bootstrap_path[PATH_MAX];

  if (prctl(PR_SET_DUMPABLE, 0L, 0L, 0L, 0L) != 0
      || prctl(PR_GET_DUMPABLE, 0L, 0L, 0L, 0L) != 0) {
    bootstrap_fail();
  }
  if (prctl(PR_GET_NO_NEW_PRIVS, 0L, 0L, 0L, 0L) != 1) bootstrap_fail();
  require_root_credentials();
  require_exact_environment(candidate_root, wrapper_path);
  join_candidate_path(
    transaction_cli_path,
    candidate_root,
    WELCOME_COINS_TRANSACTION_CLI_SUFFIX
  );
  join_candidate_path(
    bootstrap_path,
    candidate_root,
    WELCOME_COINS_OUTER_BOOTSTRAP_SUFFIX
  );
  require_descriptor_identity(
    WELCOME_COINS_TRANSACTION_CLI_FD,
    transaction_cli_path,
    0644U,
    WELCOME_COINS_TRANSACTION_CLI_MAX_BYTES
  );
  require_descriptor_identity(
    WELCOME_COINS_OUTER_BOOTSTRAP_FD,
    bootstrap_path,
    0644U,
    8U * 1024U * 1024U
  );
  require_execution_envelope_descriptor();
  require_node_executable();
  require_candidate_working_directory(candidate_root);
  require_exact_cmdline();

  if (unsetenv("LD_PRELOAD") != 0
      || clearenv() != 0
      || setenv("PATH", "/usr/bin:/bin", 1) != 0
      || setenv("LANG", "C", 1) != 0
      || setenv("LC_ALL", "C", 1) != 0
      || setenv("WELCOME_COINS_CANDIDATE_ROOT", candidate_root, 1) != 0
      || setenv("WELCOME_COINS_OUTER_WRAPPER", wrapper_path, 1) != 0
      || setenv("WELCOME_COINS_OUTER_BOOTSTRAPPED", "verified-v1", 1) != 0
      || close(WELCOME_COINS_TRANSACTION_CLI_FD) != 0
      || close(WELCOME_COINS_OUTER_BOOTSTRAP_FD) != 0
      || close(WELCOME_COINS_NODE_FD) != 0
      || getenv("LD_AUDIT") != NULL
      || getenv("LD_LIBRARY_PATH") != NULL
      || getenv("LD_DEBUG") != NULL
      || getenv("NODE_OPTIONS") != NULL
      || getenv("NODE_PATH") != NULL
      || prctl(PR_GET_DUMPABLE, 0L, 0L, 0L, 0L) != 0
      || prctl(PR_GET_NO_NEW_PRIVS, 0L, 0L, 0L, 0L) != 1) {
    bootstrap_fail();
  }
}
