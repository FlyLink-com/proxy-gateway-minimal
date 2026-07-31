import { createHash } from "node:crypto";

export const REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID =
  "20260730_001_coin_wallet_reference_indexes";

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create index platform_coin_hold_allocations_lot_ref_idx
      on platform_coin_hold_allocations(lot_ref)
  `,
  `
    create index platform_coin_ledger_entries_lot_ref_idx
      on platform_coin_ledger_entries(lot_ref)
  `,
  `
    create index platform_coin_ledger_entries_hold_ref_idx
      on platform_coin_ledger_entries(hold_ref)
  `
]);

function normalizeSql(sql) {
  const source = String(sql);
  const literals = [];
  let protectedSql = "";
  for (let index = 0; index < source.length;) {
    if (source[index] !== "'") {
      protectedSql += source[index];
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] !== "'") {
        index += 1;
        continue;
      }
      if (source[index + 1] === "'") {
        index += 2;
        continue;
      }
      index += 1;
      break;
    }
    const token = `\0${literals.length}\0`;
    literals.push(source.slice(start, index));
    protectedSql += token;
  }
  return protectedSql
    .trim()
    .replace(/;\s*$/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),=+>])\s*/g, "$1")
    .toLowerCase()
    .replace(/\0(\d+)\0/g, (_match, index) => literals[Number(index)]);
}

const DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:COIN_WALLET_REFERENCE_INDEX_DDL:v1\0${
      MIGRATION_STATEMENTS.map(normalizeSql).join("\0")
    }`,
    "utf8"
  )
  .digest("hex");

export const COIN_WALLET_REFERENCE_INDEX_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM
  })
]);
