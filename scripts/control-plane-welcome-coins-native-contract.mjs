// Import-only, side-effect-free constants shared by the native producer and
// dependency-artifact consumers. Keep this module free of filesystem, process,
// child-process, environment, clock, and network access so production bootstrap
// can hash and bind the complete static import closure before execution.

export const WELCOME_COINS_NATIVE_OUTPUTS = Object.freeze({
  outerWrapper: "node_modules/.gccgw-native/welcome-coins-activation-outer-wrapper",
  outerPostExecBootstrap:
    "node_modules/.gccgw-native/welcome-coins-outer-post-exec-bootstrap.so",
  launcher: "node_modules/.gccgw-native/welcome-coins-custody-launcher",
  postExecBootstrap: "node_modules/.gccgw-native/welcome-coins-post-exec-bootstrap.so",
  receipt: "node_modules/.gccgw-native/welcome-coins-native-build.json"
});

export const WELCOME_COINS_NATIVE_COMMON_FLAGS = Object.freeze([
  "-std=c17",
  "-O2",
  "-pipe",
  "-fno-ident",
  "-fno-common",
  "-fno-plt",
  "-fstack-protector-strong",
  "-D_FORTIFY_SOURCE=3",
  "-Wall",
  "-Wextra",
  "-Werror",
  "-Wformat=2",
  "-Wconversion",
  "-Wshadow",
  "-Wstrict-prototypes",
  "-Wl,-z,defs",
  "-Wl,-z,relro",
  "-Wl,-z,now",
  "-Wl,-z,noexecstack",
  "-Wl,--build-id=none"
]);
export const WELCOME_COINS_NATIVE_LAUNCHER_FLAGS = Object.freeze(["-fPIE", "-pie"]);
export const WELCOME_COINS_NATIVE_POST_EXEC_FLAGS = Object.freeze([
  "-fPIC",
  "-shared",
  "-fvisibility=hidden"
]);
export const WELCOME_COINS_NATIVE_OUTER_WRAPPER_FLAGS = Object.freeze([
  "-fPIE",
  "-static-pie"
]);
export const WELCOME_COINS_NATIVE_OUTER_POST_EXEC_FLAGS = Object.freeze([
  "-fPIC",
  "-shared",
  "-fvisibility=hidden",
  "-Wl,-z,initfirst"
]);
export const WELCOME_COINS_NATIVE_SOURCE_PATHS = Object.freeze({
  outerWrapper: "scripts/native/welcome-coins-activation-outer-wrapper.c",
  outerPostExecBootstrap: "scripts/native/welcome-coins-outer-post-exec-bootstrap.c",
  launcher: "scripts/native/welcome-coins-custody-launcher.c",
  postExecBootstrap: "scripts/native/welcome-coins-post-exec-bootstrap.c"
});

export const WELCOME_COINS_NATIVE_BUILD_PROFILE = Object.freeze({
  id: "hardened-linux-x86_64-gcc-v2",
  compiler: "/usr/bin/gcc",
  inspector: "/usr/bin/readelf",
  commonFlags: WELCOME_COINS_NATIVE_COMMON_FLAGS,
  outerWrapperFlags: WELCOME_COINS_NATIVE_OUTER_WRAPPER_FLAGS,
  outerPostExecBootstrapFlags: WELCOME_COINS_NATIVE_OUTER_POST_EXEC_FLAGS,
  launcherFlags: WELCOME_COINS_NATIVE_LAUNCHER_FLAGS,
  postExecBootstrapFlags: WELCOME_COINS_NATIVE_POST_EXEC_FLAGS
});
