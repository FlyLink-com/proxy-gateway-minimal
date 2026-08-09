#include <node_api.h>

static napi_value unavailable_operation(napi_env env, napi_callback_info info) {
  (void)info;
  napi_throw_error(env, NULL, "native_operation_not_implemented");
  return NULL;
}

#define FOUNDATION_OPERATION(name) { name, NULL, unavailable_operation, NULL, NULL, NULL, napi_default, NULL }

NAPI_MODULE_INIT() {
  napi_property_descriptor operations[] = {
    FOUNDATION_OPERATION("createBoundedCapture"),
    FOUNDATION_OPERATION("createDatabaseIdentityLease"),
    FOUNDATION_OPERATION("createSealedMemfd"),
    FOUNDATION_OPERATION("durableCompareAndSwap"),
    FOUNDATION_OPERATION("durablePublishNoReplace"),
    FOUNDATION_OPERATION("durableReadLogical"),
    FOUNDATION_OPERATION("durableSwapSymlink"),
    FOUNDATION_OPERATION("durableUnlink"),
    FOUNDATION_OPERATION("durableUnlinkVerified"),
    FOUNDATION_OPERATION("durableWriteFile"),
    FOUNDATION_OPERATION("inspectSqliteMainHandle"),
    FOUNDATION_OPERATION("probeLinuxCapabilities"),
    FOUNDATION_OPERATION("receiveDatabaseCapability"),
    FOUNDATION_OPERATION("sendDatabaseCapability"),
    FOUNDATION_OPERATION("spawnWithExactFileDescriptors")
  };

  napi_status status = napi_define_properties(
    env,
    exports,
    sizeof(operations) / sizeof(operations[0]),
    operations
  );
  if (status != napi_ok) {
    napi_throw_error(env, NULL, "native_operation_registration_failed");
    return NULL;
  }
  return exports;
}
