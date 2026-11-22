// The public better-sqlite3 handle does not reveal the descriptor SQLite opened.
// A path, db.name, database_list, or a descriptor this process opens again is
// not that proof. An exposed method is still not used: ownership would be a guess.
export const OPENED_FILE_PROOFS_REJECTED = Object.freeze([
  "db.name",
  "pragma.database_list",
  "path_stat",
  "reopened_fd"
]);

export function probeSqliteOpenedFile(db) {
  const exposed = !!db && (
    typeof db.fileControl === "function"
    || typeof db.getFileDescriptor === "function"
    || typeof db.getFd === "function"
  );
  return {
    proven: false,
    reason: exposed ? "driver_handle_ununique" : "driver_handle_unexposed",
    rejected: OPENED_FILE_PROOFS_REJECTED
  };
}
