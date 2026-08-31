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
#include <sys/syscall.h>
#include <sys/types.h>
#include <unistd.h>

#define WELCOME_COINS_EXECUTION_ENVELOPE_FD 3
#define WELCOME_COINS_TRANSACTION_CLI_FD 8
#define WELCOME_COINS_OUTER_BOOTSTRAP_FD 9
#define WELCOME_COINS_NODE_FD 10
#define WELCOME_COINS_EXECUTION_ENVELOPE_MAX_BYTES (16U * 1024U)
#define WELCOME_COINS_TRANSACTION_CLI_MAX_BYTES (2U * 1024U * 1024U)
#define WELCOME_COINS_NATIVE_MAX_BYTES (8U * 1024U * 1024U)
#define WELCOME_COINS_OUTER_WRAPPER_SUFFIX \
  "/node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper"
#define WELCOME_COINS_OUTER_BOOTSTRAP_SUFFIX \
  "/node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so"
#define WELCOME_COINS_TRANSACTION_CLI_SUFFIX \
  "/scripts/control-plane-welcome-coins-activation-transaction-cli.mjs"
#define WELCOME_COINS_NODE_PATH "/usr/bin/node"

extern char **environ;

struct sha256_context {
  uint8_t block[64];
  uint32_t state[8];
  uint64_t transformed_bits;
  size_t block_length;
};

static const uint32_t sha256_constants[64] = {
  0x428a2f98U, 0x71374491U, 0xb5c0fbcfU, 0xe9b5dba5U,
  0x3956c25bU, 0x59f111f1U, 0x923f82a4U, 0xab1c5ed5U,
  0xd807aa98U, 0x12835b01U, 0x243185beU, 0x550c7dc3U,
  0x72be5d74U, 0x80deb1feU, 0x9bdc06a7U, 0xc19bf174U,
  0xe49b69c1U, 0xefbe4786U, 0x0fc19dc6U, 0x240ca1ccU,
  0x2de92c6fU, 0x4a7484aaU, 0x5cb0a9dcU, 0x76f988daU,
  0x983e5152U, 0xa831c66dU, 0xb00327c8U, 0xbf597fc7U,
  0xc6e00bf3U, 0xd5a79147U, 0x06ca6351U, 0x14292967U,
  0x27b70a85U, 0x2e1b2138U, 0x4d2c6dfcU, 0x53380d13U,
  0x650a7354U, 0x766a0abbU, 0x81c2c92eU, 0x92722c85U,
  0xa2bfe8a1U, 0xa81a664bU, 0xc24b8b70U, 0xc76c51a3U,
  0xd192e819U, 0xd6990624U, 0xf40e3585U, 0x106aa070U,
  0x19a4c116U, 0x1e376c08U, 0x2748774cU, 0x34b0bcb5U,
  0x391c0cb3U, 0x4ed8aa4aU, 0x5b9cca4fU, 0x682e6ff3U,
  0x748f82eeU, 0x78a5636fU, 0x84c87814U, 0x8cc70208U,
  0x90befffaU, 0xa4506cebU, 0xbef9a3f7U, 0xc67178f2U
};

static uint32_t rotate_right(uint32_t value, unsigned int count) {
  return (value >> count) | (value << (32U - count));
}

static void sha256_transform(struct sha256_context *context) {
  uint32_t words[64];
  uint32_t a;
  uint32_t b;
  uint32_t c;
  uint32_t d;
  uint32_t e;
  uint32_t f;
  uint32_t g;
  uint32_t h;
  size_t index;

  for (index = 0U; index < 16U; index += 1U) {
    size_t offset = index * 4U;
    words[index] = ((uint32_t)context->block[offset] << 24U)
      | ((uint32_t)context->block[offset + 1U] << 16U)
      | ((uint32_t)context->block[offset + 2U] << 8U)
      | (uint32_t)context->block[offset + 3U];
  }
  for (index = 16U; index < 64U; index += 1U) {
    uint32_t left = words[index - 15U];
    uint32_t right = words[index - 2U];
    uint32_t sigma_zero = rotate_right(left, 7U) ^ rotate_right(left, 18U) ^ (left >> 3U);
    uint32_t sigma_one = rotate_right(right, 17U) ^ rotate_right(right, 19U) ^ (right >> 10U);
    words[index] = words[index - 16U] + sigma_zero + words[index - 7U] + sigma_one;
  }

  a = context->state[0];
  b = context->state[1];
  c = context->state[2];
  d = context->state[3];
  e = context->state[4];
  f = context->state[5];
  g = context->state[6];
  h = context->state[7];
  for (index = 0U; index < 64U; index += 1U) {
    uint32_t sum_one = rotate_right(e, 6U) ^ rotate_right(e, 11U) ^ rotate_right(e, 25U);
    uint32_t choice = (e & f) ^ ((~e) & g);
    uint32_t temporary_one = h + sum_one + choice + sha256_constants[index] + words[index];
    uint32_t sum_zero = rotate_right(a, 2U) ^ rotate_right(a, 13U) ^ rotate_right(a, 22U);
    uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
    uint32_t temporary_two = sum_zero + majority;
    h = g;
    g = f;
    f = e;
    e = d + temporary_one;
    d = c;
    c = b;
    b = a;
    a = temporary_one + temporary_two;
  }
  context->state[0] += a;
  context->state[1] += b;
  context->state[2] += c;
  context->state[3] += d;
  context->state[4] += e;
  context->state[5] += f;
  context->state[6] += g;
  context->state[7] += h;
  context->transformed_bits += 512U;
}

static void sha256_initialize(struct sha256_context *context) {
  memset(context, 0, sizeof(*context));
  context->state[0] = 0x6a09e667U;
  context->state[1] = 0xbb67ae85U;
  context->state[2] = 0x3c6ef372U;
  context->state[3] = 0xa54ff53aU;
  context->state[4] = 0x510e527fU;
  context->state[5] = 0x9b05688cU;
  context->state[6] = 0x1f83d9abU;
  context->state[7] = 0x5be0cd19U;
}

static void sha256_update(
  struct sha256_context *context,
  const unsigned char *bytes,
  size_t size
) {
  size_t index;
  for (index = 0U; index < size; index += 1U) {
    context->block[context->block_length] = bytes[index];
    context->block_length += 1U;
    if (context->block_length == sizeof(context->block)) {
      sha256_transform(context);
      context->block_length = 0U;
    }
  }
}

static void sha256_finish(struct sha256_context *context, unsigned char digest[32]) {
  uint64_t total_bits = context->transformed_bits + ((uint64_t)context->block_length * 8U);
  size_t index = context->block_length;

  context->block[index] = 0x80U;
  index += 1U;
  if (index > 56U) {
    while (index < sizeof(context->block)) {
      context->block[index] = 0U;
      index += 1U;
    }
    sha256_transform(context);
    index = 0U;
  }
  while (index < 56U) {
    context->block[index] = 0U;
    index += 1U;
  }
  for (index = 0U; index < 8U; index += 1U) {
    context->block[63U - index] = (uint8_t)(total_bits & 0xffU);
    total_bits >>= 8U;
  }
  sha256_transform(context);
  for (index = 0U; index < 8U; index += 1U) {
    digest[index * 4U] = (uint8_t)(context->state[index] >> 24U);
    digest[index * 4U + 1U] = (uint8_t)(context->state[index] >> 16U);
    digest[index * 4U + 2U] = (uint8_t)(context->state[index] >> 8U);
    digest[index * 4U + 3U] = (uint8_t)context->state[index];
  }
  memset(context, 0, sizeof(*context));
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

static void emit_blocked(void) {
  static const char output[] =
    "{\"schemaVersion\":\"1\",\"type\":\"control_plane_welcome_coins_production_transaction\","
    "\"state\":\"blocked\",\"condition\":\"outer_runtime_invalid\"}\n";
  write_stderr_best_effort(output, sizeof(output) - 1U);
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
  for (index = 0U; index < sizeof(forbidden) / sizeof(forbidden[0]); index += 1U) {
    if (getenv(forbidden[index]) != NULL) {
      emit_blocked();
      exit(125);
    }
  }
}

static int require_root_credentials(void) {
  uid_t real_uid;
  uid_t effective_uid;
  uid_t saved_uid;
  gid_t real_gid;
  gid_t effective_gid;
  gid_t saved_gid;
  int group_count;
  gid_t *groups = NULL;
  int index;

  if (getresuid(&real_uid, &effective_uid, &saved_uid) != 0
      || getresgid(&real_gid, &effective_gid, &saved_gid) != 0
      || real_uid != 0U || effective_uid != 0U || saved_uid != 0U
      || real_gid != 0U || effective_gid != 0U || saved_gid != 0U) {
    return -1;
  }
  group_count = getgroups(0, NULL);
  if (group_count < 0 || group_count > 1024) {
    return -1;
  }
  if (group_count > 0) {
    groups = calloc((size_t)group_count, sizeof(*groups));
    if (groups == NULL || getgroups(group_count, groups) != group_count) {
      free(groups);
      return -1;
    }
    for (index = 0; index < group_count; index += 1) {
      if (groups[index] != 0U) {
        free(groups);
        return -1;
      }
    }
  }
  free(groups);
  if (setgroups(0U, NULL) != 0 || getgroups(0, NULL) != 0) {
    return -1;
  }
  return 0;
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

static int require_regular_metadata(
  const struct stat *metadata,
  mode_t mode,
  size_t maximum_bytes
) {
  return S_ISREG(metadata->st_mode)
    && metadata->st_uid == 0U
    && metadata->st_gid == 0U
    && metadata->st_nlink == 1U
    && (metadata->st_mode & 07777U) == mode
    && metadata->st_size > 0
    && (uintmax_t)metadata->st_size <= (uintmax_t)maximum_bytes
      ? 0 : -1;
}

static int hash_descriptor(
  int descriptor,
  const struct stat *before,
  unsigned char digest[32]
) {
  unsigned char buffer[64U * 1024U];
  struct sha256_context context;
  struct stat after;
  off_t offset = 0;

  sha256_initialize(&context);
  while (offset < before->st_size) {
    size_t remaining = (size_t)(before->st_size - offset);
    size_t requested = remaining < sizeof(buffer) ? remaining : sizeof(buffer);
    ssize_t count;
    do {
      count = pread(descriptor, buffer, requested, offset);
    } while (count < 0 && errno == EINTR);
    if (count <= 0) {
      memset(&context, 0, sizeof(context));
      return -1;
    }
    sha256_update(&context, buffer, (size_t)count);
    offset += count;
  }
  if (fstat(descriptor, &after) != 0 || !same_file_identity(before, &after)) {
    memset(&context, 0, sizeof(context));
    return -1;
  }
  sha256_finish(&context, digest);
  return 0;
}

static int open_verified_path(
  const char *path,
  mode_t mode,
  size_t maximum_bytes,
  int *descriptor,
  struct stat *metadata,
  unsigned char digest[32]
) {
  struct stat path_before;
  struct stat path_after;
  int opened;

  if (lstat(path, &path_before) != 0
      || require_regular_metadata(&path_before, mode, maximum_bytes) != 0) {
    return -1;
  }
  opened = open(path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (opened < 0
      || fstat(opened, metadata) != 0
      || !same_file_identity(&path_before, metadata)
      || hash_descriptor(opened, metadata, digest) != 0
      || lstat(path, &path_after) != 0
      || !same_file_identity(metadata, &path_after)) {
    if (opened >= 0) {
      (void)close(opened);
    }
    return -1;
  }
  *descriptor = opened;
  return 0;
}

static int digest_matches_hex(const unsigned char digest[32], const char expected[65]) {
  static const char hex[] = "0123456789abcdef";
  size_t index;
  unsigned char difference = 0U;
  for (index = 0U; index < 32U; index += 1U) {
    difference |= (unsigned char)(expected[index * 2U]
      ^ hex[(digest[index] >> 4U) & 0x0fU]);
    difference |= (unsigned char)(expected[index * 2U + 1U]
      ^ hex[digest[index] & 0x0fU]);
  }
  return difference == 0U && expected[64] == '\0' ? 0 : -1;
}

static int read_exact_descriptor(
  int descriptor,
  const struct stat *metadata,
  unsigned char **bytes
) {
  size_t size = (size_t)metadata->st_size;
  unsigned char *buffer = malloc(size + 1U);
  size_t offset = 0U;
  struct stat after;

  if (buffer == NULL) {
    return -1;
  }
  while (offset < size) {
    ssize_t count;
    do {
      count = pread(descriptor, buffer + offset, size - offset, (off_t)offset);
    } while (count < 0 && errno == EINTR);
    if (count <= 0) {
      free(buffer);
      return -1;
    }
    offset += (size_t)count;
  }
  if (fstat(descriptor, &after) != 0 || !same_file_identity(metadata, &after)
      || memchr(buffer, '\0', size) != NULL) {
    free(buffer);
    return -1;
  }
  buffer[size] = '\0';
  *bytes = buffer;
  return 0;
}

static int derive_candidate_paths(
  char root[PATH_MAX],
  char wrapper[PATH_MAX],
  char bootstrap[PATH_MAX],
  char transaction_cli[PATH_MAX]
) {
  char executable[PATH_MAX];
  size_t executable_length;
  size_t suffix_length = strlen(WELCOME_COINS_OUTER_WRAPPER_SUFFIX);
  size_t root_length;
  ssize_t count = readlink("/proc/self/exe", executable, sizeof(executable) - 1U);

  if (count <= 0 || (size_t)count >= sizeof(executable) - 1U) {
    return -1;
  }
  executable[(size_t)count] = '\0';
  executable_length = (size_t)count;
  if (executable[0] != '/'
      || executable_length <= suffix_length
      || strcmp(
        executable + executable_length - suffix_length,
        WELCOME_COINS_OUTER_WRAPPER_SUFFIX
      ) != 0) {
    return -1;
  }
  root_length = executable_length - suffix_length;
  if (root_length == 0U || root_length >= PATH_MAX
      || root_length + strlen(WELCOME_COINS_OUTER_WRAPPER_SUFFIX) + 1U > PATH_MAX
      || root_length + strlen(WELCOME_COINS_OUTER_BOOTSTRAP_SUFFIX) + 1U > PATH_MAX
      || root_length + strlen(WELCOME_COINS_TRANSACTION_CLI_SUFFIX) + 1U > PATH_MAX) {
    return -1;
  }
  memcpy(root, executable, root_length);
  root[root_length] = '\0';
  if (snprintf(wrapper, PATH_MAX, "%s%s", root, WELCOME_COINS_OUTER_WRAPPER_SUFFIX) <= 0
      || snprintf(bootstrap, PATH_MAX, "%s%s", root, WELCOME_COINS_OUTER_BOOTSTRAP_SUFFIX) <= 0
      || snprintf(transaction_cli, PATH_MAX, "%s%s", root, WELCOME_COINS_TRANSACTION_CLI_SUFFIX) <= 0
      || strcmp(wrapper, executable) != 0) {
    return -1;
  }
  return 0;
}

static int read_execution_envelope(unsigned char **bytes, size_t *size) {
  struct stat metadata;
  off_t current;
  int flags;

  if (fstat(WELCOME_COINS_EXECUTION_ENVELOPE_FD, &metadata) != 0
      || require_regular_metadata(
        &metadata,
        0400U,
        WELCOME_COINS_EXECUTION_ENVELOPE_MAX_BYTES
      ) != 0
      || (flags = fcntl(WELCOME_COINS_EXECUTION_ENVELOPE_FD, F_GETFL)) < 0
      || (flags & O_ACCMODE) != O_RDONLY
      || (current = lseek(WELCOME_COINS_EXECUTION_ENVELOPE_FD, 0, SEEK_CUR)) != 0
      || read_exact_descriptor(WELCOME_COINS_EXECUTION_ENVELOPE_FD, &metadata, bytes) != 0) {
    return -1;
  }
  *size = (size_t)metadata.st_size;
  if ((*bytes)[*size - 1U] != '\n'
      || memchr(*bytes, '\r', *size) != NULL
      || memchr(*bytes, '\n', *size - 1U) != NULL
      || lseek(WELCOME_COINS_EXECUTION_ENVELOPE_FD, current, SEEK_SET) != current) {
    free(*bytes);
    *bytes = NULL;
    return -1;
  }
  return 0;
}

static int is_lower_hex(unsigned char value) {
  return (value >= (unsigned char)'0' && value <= (unsigned char)'9')
    || (value >= (unsigned char)'a' && value <= (unsigned char)'f');
}

static int parse_artifact_hashes(
  const unsigned char *envelope,
  size_t envelope_size,
  char transaction_cli_hash[65],
  char outer_wrapper_hash[65],
  char outer_bootstrap_hash[65],
  char node_hash[65]
) {
  static const char *const keys[] = {
    "candidateRootSha256",
    "transactionCliSha256",
    "activationLibrarySha256",
    "snapshotLibrarySha256",
    "holderObserverSha256",
    "welcomeBonusMigrationsSha256",
    "coinWalletMigrationsSha256",
    "custodyCliSha256",
    "outerWrapperSha256",
    "nativeLauncherSha256",
    "postExecBootstrapSha256",
    "outerPostExecBootstrapSha256",
    "nativeBuildReceiptSha256",
    "nodeModulesTreeSha256",
    "nodeSha256"
  };
  static const char artifacts_prefix[] = "\"artifacts\":{";
  const unsigned char *start = memmem(
    envelope,
    envelope_size,
    artifacts_prefix,
    sizeof(artifacts_prefix) - 1U
  );
  const unsigned char *cursor;
  const unsigned char *end = envelope + envelope_size;
  size_t key_index;

  if (start == NULL
      || memmem(
        start + 1,
        (size_t)(end - (start + 1)),
        artifacts_prefix,
        sizeof(artifacts_prefix) - 1U
      ) != NULL) {
    return -1;
  }
  cursor = start + sizeof(artifacts_prefix) - 1U;
  for (key_index = 0U; key_index < sizeof(keys) / sizeof(keys[0]); key_index += 1U) {
    char prefix[96];
    int prefix_length = snprintf(prefix, sizeof(prefix), "\"%s\":\"", keys[key_index]);
    size_t hash_index;
    char *target = NULL;
    if (prefix_length <= 0
        || (size_t)prefix_length >= sizeof(prefix)
        || (size_t)(end - cursor) < (size_t)prefix_length + 65U
        || memcmp(cursor, prefix, (size_t)prefix_length) != 0) {
      return -1;
    }
    cursor += (size_t)prefix_length;
    if (key_index == 1U) target = transaction_cli_hash;
    if (key_index == 8U) target = outer_wrapper_hash;
    if (key_index == 11U) target = outer_bootstrap_hash;
    if (key_index == 14U) target = node_hash;
    for (hash_index = 0U; hash_index < 64U; hash_index += 1U) {
      if (!is_lower_hex(cursor[hash_index])) {
        return -1;
      }
      if (target != NULL) target[hash_index] = (char)cursor[hash_index];
    }
    cursor += 64U;
    if (*cursor != (unsigned char)'\"') {
      return -1;
    }
    cursor += 1;
    if (target != NULL) target[64] = '\0';
    if (key_index + 1U < sizeof(keys) / sizeof(keys[0])) {
      if (*cursor != (unsigned char)',') return -1;
      cursor += 1;
    }
  }
  return cursor < end && *cursor == (unsigned char)'}' ? 0 : -1;
}

static int install_descriptor(int opened, int target) {
  if (opened == target) {
    int flags = fcntl(opened, F_GETFD);
    return flags >= 0 && fcntl(opened, F_SETFD, flags & ~FD_CLOEXEC) == 0 ? 0 : -1;
  }
  if (dup3(opened, target, 0) != target) {
    return -1;
  }
  return close(opened);
}

static int enter_candidate_root(const char *candidate_root) {
  char resolved[PATH_MAX];
  char current[PATH_MAX];
  struct stat lexical;
  struct stat opened;
  int descriptor;
  if (lstat(candidate_root, &lexical) != 0
      || !S_ISDIR(lexical.st_mode)
      || lexical.st_uid != 0U
      || lexical.st_gid != 0U
      || (lexical.st_mode & 07022U) != 0U
      || realpath(candidate_root, resolved) == NULL
      || strcmp(resolved, candidate_root) != 0) {
    return -1;
  }
  descriptor = open(candidate_root, O_RDONLY | O_CLOEXEC | O_DIRECTORY | O_NOFOLLOW);
  if (descriptor < 0
      || fstat(descriptor, &opened) != 0
      || !same_file_identity(&lexical, &opened)
      || fchdir(descriptor) != 0
      || getcwd(current, sizeof(current)) == NULL
      || strcmp(current, candidate_root) != 0
      || close(descriptor) != 0) {
    if (descriptor >= 0) (void)close(descriptor);
    return -1;
  }
  return 0;
}

static int close_untrusted_descriptors(void) {
#ifdef SYS_close_range
  if (syscall(SYS_close_range, 4U, 7U, 0U) != 0
      || syscall(SYS_close_range, 11U, UINT_MAX, 0U) != 0) {
    return -1;
  }
#else
  int descriptor;
  for (descriptor = 4; descriptor <= 7; descriptor += 1) {
    (void)close(descriptor);
  }
  for (descriptor = 11; descriptor < 1024; descriptor += 1) {
    (void)close(descriptor);
  }
#endif
  return 0;
}

int main(int argc, char **argv) {
  char candidate_root[PATH_MAX];
  char wrapper_path[PATH_MAX];
  char bootstrap_path[PATH_MAX];
  char transaction_cli_path[PATH_MAX];
  char candidate_environment[PATH_MAX + 32U];
  char wrapper_environment[PATH_MAX + 32U];
  char transaction_cli_hash[65];
  char outer_wrapper_hash[65];
  char outer_bootstrap_hash[65];
  char node_hash[65];
  unsigned char digest[32];
  unsigned char *envelope = NULL;
  unsigned char *transaction_cli = NULL;
  size_t envelope_size = 0U;
  struct stat metadata;
  int wrapper_descriptor = -1;
  int transaction_cli_descriptor = -1;
  int bootstrap_descriptor = -1;
  int node_descriptor = -1;
  char *arguments[5];
  char *clean_environment[7];
  int result = 1;

  (void)argv;
  if (argc != 1
      || require_root_credentials() != 0
      || prctl(PR_SET_DUMPABLE, 0L, 0L, 0L, 0L) != 0
      || prctl(PR_GET_DUMPABLE, 0L, 0L, 0L, 0L) != 0
      || prctl(PR_SET_NO_NEW_PRIVS, 1L, 0L, 0L, 0L) != 0
      || prctl(PR_GET_NO_NEW_PRIVS, 0L, 0L, 0L, 0L) != 1) {
    goto cleanup;
  }
  reject_environment_pollution();
  if (derive_candidate_paths(
    candidate_root,
    wrapper_path,
    bootstrap_path,
    transaction_cli_path
  ) != 0
      || read_execution_envelope(&envelope, &envelope_size) != 0
      || parse_artifact_hashes(
        envelope,
        envelope_size,
        transaction_cli_hash,
        outer_wrapper_hash,
        outer_bootstrap_hash,
        node_hash
      ) != 0) {
    goto cleanup;
  }
  if (open_verified_path(
    wrapper_path,
    0755U,
    WELCOME_COINS_NATIVE_MAX_BYTES,
    &wrapper_descriptor,
    &metadata,
    digest
  ) != 0
      || digest_matches_hex(digest, outer_wrapper_hash) != 0
      || open_verified_path(
        transaction_cli_path,
        0644U,
        WELCOME_COINS_TRANSACTION_CLI_MAX_BYTES,
        &transaction_cli_descriptor,
        &metadata,
        digest
      ) != 0
      || digest_matches_hex(digest, transaction_cli_hash) != 0
      || read_exact_descriptor(transaction_cli_descriptor, &metadata, &transaction_cli) != 0
      || open_verified_path(
        bootstrap_path,
        0644U,
        WELCOME_COINS_NATIVE_MAX_BYTES,
        &bootstrap_descriptor,
        &metadata,
        digest
      ) != 0
      || digest_matches_hex(digest, outer_bootstrap_hash) != 0
      || open_verified_path(
        WELCOME_COINS_NODE_PATH,
        0755U,
        128U * 1024U * 1024U,
        &node_descriptor,
        &metadata,
        digest
      ) != 0
      || digest_matches_hex(digest, node_hash) != 0) {
    goto cleanup;
  }
  {
    struct stat wrapper_metadata;
    struct stat executable_metadata;
    if (fstat(wrapper_descriptor, &wrapper_metadata) != 0
        || stat("/proc/self/exe", &executable_metadata) != 0
        || !same_file_identity(&wrapper_metadata, &executable_metadata)) {
      goto cleanup;
    }
  }
  (void)close(wrapper_descriptor);
  wrapper_descriptor = -1;
  if (install_descriptor(transaction_cli_descriptor, WELCOME_COINS_TRANSACTION_CLI_FD) != 0) {
    goto cleanup;
  }
  transaction_cli_descriptor = -1;
  if (install_descriptor(bootstrap_descriptor, WELCOME_COINS_OUTER_BOOTSTRAP_FD) != 0) {
    goto cleanup;
  }
  bootstrap_descriptor = -1;
  if (install_descriptor(node_descriptor, WELCOME_COINS_NODE_FD) != 0
      || enter_candidate_root(candidate_root) != 0
      || close_untrusted_descriptors() != 0
      || lseek(WELCOME_COINS_EXECUTION_ENVELOPE_FD, 0, SEEK_CUR) != 0
      || snprintf(
        candidate_environment,
        sizeof(candidate_environment),
        "WELCOME_COINS_CANDIDATE_ROOT=%s",
        candidate_root
      ) <= 0
      || snprintf(
        wrapper_environment,
        sizeof(wrapper_environment),
        "WELCOME_COINS_OUTER_WRAPPER=%s",
        wrapper_path
      ) <= 0) {
    goto cleanup;
  }
  node_descriptor = -1;
  if (clearenv() != 0) {
    goto cleanup;
  }
  arguments[0] = (char *)WELCOME_COINS_NODE_PATH;
  arguments[1] = (char *)"--input-type=module";
  arguments[2] = (char *)"--eval";
  arguments[3] = (char *)transaction_cli;
  arguments[4] = NULL;
  clean_environment[0] = (char *)"PATH=/usr/bin:/bin";
  clean_environment[1] = (char *)"LANG=C";
  clean_environment[2] = (char *)"LC_ALL=C";
  clean_environment[3] = (char *)"LD_PRELOAD=/proc/self/fd/9";
  clean_environment[4] = candidate_environment;
  clean_environment[5] = wrapper_environment;
  clean_environment[6] = NULL;
#ifdef SYS_execveat
  (void)syscall(
    SYS_execveat,
    WELCOME_COINS_NODE_FD,
    "",
    arguments,
    clean_environment,
    AT_EMPTY_PATH
  );
#else
  errno = ENOSYS;
#endif

cleanup:
  if (wrapper_descriptor >= 0) (void)close(wrapper_descriptor);
  if (transaction_cli_descriptor >= 0) (void)close(transaction_cli_descriptor);
  if (bootstrap_descriptor >= 0) (void)close(bootstrap_descriptor);
  if (node_descriptor >= 0) (void)close(node_descriptor);
  if (envelope != NULL) {
    memset(envelope, 0, envelope_size);
    free(envelope);
  }
  if (transaction_cli != NULL) {
    free(transaction_cli);
  }
  memset(digest, 0, sizeof(digest));
  emit_blocked();
  return result;
}
