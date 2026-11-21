// Stage 2A synthetic-only keyset source page adapter. This is NOT a BWH
// production exporter and does not promise snapshot isolation. The caller
// must hold a separately proven immutable source snapshot/freeze receipt.
// Only explicitly approved non-sensitive test projections are returned.
import { Stage2MigrationError, stage2Digest } from "./stage2-offline-migration.mjs";

const ALLOW=Object.freeze({
  platform_accounts:["id","status","created_at","updated_at"],
  platform_entitlements:["id","account_id","plan","status","valid_from","valid_until"],
});
const REF=/^synth-[A-Za-z0-9_-]{3,120}$/;
function deny(code){throw new Stage2MigrationError(code);}
function validateRow(table,row){
  const fields=ALLOW[table];
  if(!row||typeof row!=="object"||Array.isArray(row)||
    Object.keys(row).sort().join(",")!==[...fields].sort().join(",")||
    !REF.test(row.id))deny("stage2_source_projection_denied");
  for(const [key,value] of Object.entries(row)){
    if(typeof value!=="string"||value.length>160||/[<>@]/.test(value))
      deny("stage2_source_projection_denied");
    if((key==="account_id")&&!REF.test(value))
      deny("stage2_source_projection_denied");
  }
}
export async function readStage2SyntheticPage(db,{
  table="platform_accounts",afterPk=null,limit=25,
}={}){
  if(!Object.hasOwn(ALLOW,table)||!(afterPk===null||REF.test(afterPk))||
    !Number.isInteger(limit)||limit<1||limit>25)deny("stage2_source_page_invalid");
  const fields=ALLOW[table].join(",");
  const sql=`SELECT ${fields} FROM ${table} ${afterPk===null?"":"WHERE id > ?"} ORDER BY id LIMIT ?`;
  const prepared=db.prepare(sql);
  const result=afterPk===null
    ?await prepared.bind(limit+1).all()
    :await prepared.bind(afterPk,limit+1).all();
  const rows=result?.results||[];
  for(const row of rows)validateRow(table,row);
  const items=rows.slice(0,limit);
  const hasMore=rows.length>limit;
  return {
    table,afterPk,
    items,
    nextAfterPk:items.length?items.at(-1).id:afterPk,
    hasMore,
  };
}

// Convert an immutable synthetic source page into the exact transport
// format accepted by applyStage2Batch(). Never interpolate source row SQL.
// Existing-target delta preconditions are supplied by a separate reviewed
// source checkpoint contract, NOT inferred from this initial-snapshot page.
export async function syntheticPageToStage2Batch(page,{runId,sequence}={}){
  if(!page||typeof page!=="object"||!Object.hasOwn(ALLOW,page.table)||
    !REF.test(runId)||!Number.isSafeInteger(sequence)||sequence<1||
    !Array.isArray(page.items)||page.items.length<1||page.items.length>25||
    !(page.afterPk===null||REF.test(page.afterPk))||
    page.nextAfterPk!==page.items.at(-1)?.id)deny("stage2_source_page_invalid");
  let previous=page.afterPk;
  for(const row of page.items){
    validateRow(page.table,row);
    if(previous!==null&&row.id<=previous)deny("stage2_source_page_invalid");
    previous=row.id;
  }
  const unsigned={
    runId,table:page.table,sequence,startAfterPk:page.afterPk,
    changes:page.items.map(row=>({
      op:"upsert",pk:row.id,previousFingerprint:null,projection:row
    }))
  };
  return {...unsigned,payloadSha256:await stage2Digest(unsigned)};
}
