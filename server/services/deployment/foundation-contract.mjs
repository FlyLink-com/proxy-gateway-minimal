export const ATOMIC_LOGICAL_RECORD_EXPORTS = Object.freeze([
  "durableReadLogical",
  "durablePublishNoReplace",
  "durableCompareAndSwap",
  "durableUnlinkVerified"
]);

export const FOUNDATION_NATIVE_EXPORTS = Object.freeze([
  "createBoundedCapture",
  "createDatabaseIdentityLease",
  "createSealedMemfd",
  "durableCompareAndSwap",
  "durablePublishNoReplace",
  "durableReadLogical",
  "durableSwapSymlink",
  "durableUnlink",
  "durableUnlinkVerified",
  "durableWriteFile",
  "inspectSqliteMainHandle",
  "probeLinuxCapabilities",
  "receiveDatabaseCapability",
  "sendDatabaseCapability",
  "spawnWithExactFileDescriptors"
]);

export const HARDENED_C17_PIE_V1_FLAGS = Object.freeze([
  "-std=c17",
  "-O2",
  "-fPIE",
  "-pie",
  "-fstack-protector-strong",
  "-Wl,-z,relro,-z,now",
  "-Wall",
  "-Wextra",
  "-Werror"
]);

export const REQUIRED_LINUX_FEATURES = Object.freeze([
  "memfdOwnerMode0600",
  "memfdFullSeals",
  "sealedOpenSshDescriptorHandoff",
  "exactDescriptorInheritance",
  "atomicLogicalStateTransitions",
  "openat2BeneathNoFollow",
  "ofdIdentityLease",
  "reviewedSpawnProfileRegistry",
  "scmRightsPeerBound",
  "sqliteActualMainHandle",
  "directoryFsyncDurability",
  "systemdTemplateIsolation",
  "systemdPersistentTimer",
  "cgroupKillReadback"
]);
