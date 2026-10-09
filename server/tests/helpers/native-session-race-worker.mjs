import { parentPort, workerData } from "node:worker_threads";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../../services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../../services/platform/user-portal-auth.mjs";

const db = new Database(workerData.dbPath, { fileMustExist: true });
const store = createSqliteSubscriptionControlStore({ database: db, initializeSchema: false });
const auth = createUserPortalAuthService({ controlStore: store, nowFn: () => workerData.now,
  nativeSessionsEnabled: true, totpVerifier: () => false });
parentPort.once("message", () => {
  try {
    auth.refreshNativeSession({ refreshToken: workerData.refreshToken });
    parentPort.postMessage("success");
  } catch (error) {
    parentPort.postMessage(error?.code === "invalid_refresh_grant" ? "invalid_refresh_grant" : "unexpected_failure");
  } finally { db.close(); parentPort.close(); }
});
parentPort.postMessage("ready");
