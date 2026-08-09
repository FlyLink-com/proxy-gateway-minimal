import { createRequire } from "node:module";

import { FOUNDATION_NATIVE_EXPORTS } from "../../../server/services/deployment/foundation-contract.mjs";

const require = createRequire(import.meta.url);
const ADDON_PATH = "./build/Release/control_plane_native.node";

let addon;

function loadLinuxAddon() {
  if (process.platform !== "linux") {
    throw new Error("native_linux_required");
  }

  if (!addon) {
    try {
      addon = require(ADDON_PATH);
    } catch (error) {
      const unavailable = new Error("native_addon_unavailable");
      unavailable.cause = error;
      throw unavailable;
    }

    const exported = Object.keys(addon).sort();
    if (exported.length !== FOUNDATION_NATIVE_EXPORTS.length
        || exported.some((name, index) => name !== FOUNDATION_NATIVE_EXPORTS[index])
        || FOUNDATION_NATIVE_EXPORTS.some((name) => typeof addon[name] !== "function")) {
      throw new Error("native_addon_export_contract_invalid");
    }
  }

  return addon;
}

function invoke(operation) {
  return (...arguments_) => loadLinuxAddon()[operation](...arguments_);
}

export const createBoundedCapture = invoke("createBoundedCapture");
export const createDatabaseIdentityLease = invoke("createDatabaseIdentityLease");
export const createSealedMemfd = invoke("createSealedMemfd");
export const durableCompareAndSwap = invoke("durableCompareAndSwap");
export const durablePublishNoReplace = invoke("durablePublishNoReplace");
export const durableReadLogical = invoke("durableReadLogical");
export const durableSwapSymlink = invoke("durableSwapSymlink");
export const durableUnlink = invoke("durableUnlink");
export const durableUnlinkVerified = invoke("durableUnlinkVerified");
export const durableWriteFile = invoke("durableWriteFile");
export const inspectSqliteMainHandle = invoke("inspectSqliteMainHandle");
export const probeLinuxCapabilities = invoke("probeLinuxCapabilities");
export const receiveDatabaseCapability = invoke("receiveDatabaseCapability");
export const sendDatabaseCapability = invoke("sendDatabaseCapability");
export const spawnWithExactFileDescriptors = invoke("spawnWithExactFileDescriptors");
