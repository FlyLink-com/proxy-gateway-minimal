import { lstatSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import {
  applyBwhBandwidthSchema, readBwhBandwidth, saveFromAdmin
} from "./bwh-shared-bandwidth.mjs";

// Explicit schema admission. Startup does not call this, and save never
// applies host rules or changes supply.
function fail(code) {
  return Object.assign(new Error("BWH shared bandwidth rejected"), { code });
}

export function openAdmittedBwhBandwidth({ dbPath, admit } = {}) {
  if (admit !== true) throw fail("bwh_bandwidth_admission_required");
  if (typeof dbPath !== "string" || !isAbsolute(dbPath) || dbPath.includes("\0")) throw fail("bwh_bandwidth_invalid");
  let info;
  try { info = lstatSync(dbPath); } catch (error) {
    if (error?.code !== "ENOENT") throw fail("bwh_bandwidth_invalid");
    info = null;
  }
  if (info && (info.isSymbolicLink() || !info.isFile())) throw fail("bwh_bandwidth_invalid");
  if (resolve(dbPath) !== dbPath && process.platform !== "win32") throw fail("bwh_bandwidth_invalid");
  const db = new Database(dbPath);
  try { applyBwhBandwidthSchema(db); } catch (error) { db.close(); throw error; }
  let closed = false;
  return {
    admitted: true,
    read() {
      if (closed) throw fail("bwh_bandwidth_unavailable");
      return readBwhBandwidth(db);
    },
    save(body) {
      if (closed) throw fail("bwh_bandwidth_unavailable");
      return saveFromAdmin(db, body);
    },
    close() {
      if (closed) return;
      closed = true;
      db.close();
    }
  };
}
