// D1 Stage 2A: offline synthetic staging-inbox transfer, NOT a business
// database importer. This file is not imported by the deployed Worker.
// Never send production rows or credentials to this tool. Source BWH stays
// the sole production writer, even if a local fixture uses D1_ACTIVE.
import { WriterAuthorityRepository } from "../../src/writer-authority.mjs";
import { createEpochFencedD1 } from "../../src/epoch-fenced-d1.mjs";

export class Stage2MigrationError extends Error {
  constructor(code) { super(code); this.name = "Stage2MigrationError"; this.code = code; }
}
const bad=(code)=>{throw new Stage2MigrationError(code);};
const HASH=/^[0-9a-f]{64}$/;
const REF=/^synth-[A-Za-z0-9_-]{3,120}$/;
const TABLES=Object.freeze({
  platform_accounts: Object.freeze(["id","status","created_at","updated_at"]),
  platform_entitlements: Object.freeze(["id","account_id","plan","status","valid_from","valid_until"]),
});
export const STAGE2_SYNTHETIC_TABLES=Object.freeze(Object.keys(TABLES));

function exact(value,keys) {
  return value && typeof value==="object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function canonical(value) {
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
}
export async function stage2Digest(value) {
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

export async function stage2ApprovedMappingDigest() {
  return stage2Digest(TABLES);
}

// This hash binds the run to the actual installed *synthetic inbox*
// schema, not to a caller-supplied unverified DDL version. E4 has a
// separate target schema gate that this offline module does not satisfy.
export async function stage2TargetSchemaDigest(db) {
  const r=await db.prepare(
    "SELECT type,name,sql FROM sqlite_master "+
    "WHERE name LIKE 'stage2_rehearsal_%' AND type IN ('table','trigger') ORDER BY type,name"
  ).all();
  const objects=r?.results||[];
  if(objects.length!==8 || objects.some(x=>typeof x.sql!=="string"||!x.sql))
    bad("stage2_target_schema_unavailable");
  return stage2Digest(objects);
}
function validateManifest(m) {
  if(!exact(m,["runId","sourceSnapshotId","sourceSchemaSha256","mappingSha256","targetSchemaSha256","tables"]) ||
    !REF.test(m.runId)||!REF.test(m.sourceSnapshotId)||
    !HASH.test(m.sourceSchemaSha256)||!HASH.test(m.mappingSha256)||
    !HASH.test(m.targetSchemaSha256)||
    !Array.isArray(m.tables)||m.tables.length===0||
    !m.tables.every(x=>Object.hasOwn(TABLES,x))||new Set(m.tables).size!==m.tables.length||
    m.tables.some((x,i)=>i&&m.tables[i-1]>=x))bad("stage2_manifest_invalid");
}
function validateProjection(table,pk,row) {
  const allowed=TABLES[table];
  if(!exact(row,allowed)||row.id!==pk||!REF.test(pk))bad("stage2_projection_denied");
  for(const [key,value] of Object.entries(row)){
    if(typeof value!=="string"||value.length>160||/[<>@]/u.test(value))
      bad("stage2_projection_denied");
    if((key.endsWith("_id")||key==="id")&&!REF.test(value))
      bad("stage2_projection_denied");
    if(key==="status"&&!["active","suspended","disabled"].includes(value))
      bad("stage2_projection_denied");
    if(["created_at","updated_at","valid_from","valid_until"].includes(key)&&
      !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ$/u.test(value))
      bad("stage2_projection_denied");
    if(key==="plan"&&!["synth-monthly","synth-yearly"].includes(value))
      bad("stage2_projection_denied");
  }
}
function validateBatch(b) {
  if(!exact(b,["runId","table","sequence","startAfterPk","changes","payloadSha256"])||
    !REF.test(b.runId)||!Object.hasOwn(TABLES,b.table)||
    !Number.isSafeInteger(b.sequence)||b.sequence<1||
    !(b.startAfterPk===null||REF.test(b.startAfterPk))||
    !Array.isArray(b.changes)||b.changes.length<1||b.changes.length>25||
    !HASH.test(b.payloadSha256))bad("stage2_batch_invalid");
  let last=b.startAfterPk;
  for(const c of b.changes) {
    if(!exact(c,["op","pk","previousFingerprint","projection"])||
      !REF.test(c.pk)|| (last!==null&&c.pk<=last) ||
      !["upsert","delete"].includes(c.op) ||
      !(c.previousFingerprint===null||HASH.test(c.previousFingerprint)))bad("stage2_batch_invalid");
    if(c.op==="upsert")validateProjection(b.table,c.pk,c.projection);
    else if(c.projection!==null||c.previousFingerprint===null)bad("stage2_batch_invalid");
    last=c.pk;
  }
}
function getDb(db,epoch){return createEpochFencedD1(db,epoch);}
async function requireRun(db,runId){
  const r=await db.prepare("SELECT manifest_json FROM stage2_rehearsal_runs WHERE run_id=?").bind(runId).first();
  if(!r)bad("stage2_run_missing");
  return JSON.parse(r.manifest_json);
}

export async function beginStage2Run(db,{epoch,manifest}={}){
  validateManifest(manifest);
  if(manifest.mappingSha256!==await stage2ApprovedMappingDigest())
    bad("stage2_mapping_mismatch");
  if(manifest.targetSchemaSha256!==await stage2TargetSchemaDigest(db))
    bad("stage2_target_schema_mismatch");
  await new WriterAuthorityRepository(db).assertWritable(epoch);
  const f=getDb(db,epoch),serialized=canonical(manifest);
  const existing=await f.prepare("SELECT manifest_json FROM stage2_rehearsal_runs WHERE run_id=?").bind(manifest.runId).first();
  if(existing){
    if(existing.manifest_json!==serialized)bad("stage2_run_conflict");
    return {created:false};
  }
  const stmts=[f.prepare(
    "INSERT INTO stage2_rehearsal_runs(run_id,manifest_json) VALUES(?,?)"
  ).bind(manifest.runId,serialized)];
  for(const table of manifest.tables){
    stmts.push(f.prepare(
      "INSERT INTO stage2_rehearsal_checkpoints(run_id,table_name,last_sequence,last_pk) VALUES(?,?,0,NULL)"
    ).bind(manifest.runId,table));
  }
  try{await f.batch(stmts);}catch(e){if(e instanceof Stage2MigrationError)throw e;throw e;}
  return {created:true};
}

export async function applyStage2Batch(db,{epoch,batch}={}){
  validateBatch(batch);
  await new WriterAuthorityRepository(db).assertWritable(epoch);
  const f=getDb(db,epoch);
  const manifest=await requireRun(f,batch.runId);
  if(!manifest.tables.includes(batch.table))bad("stage2_table_not_mapped");
  const {payloadSha256,...unsigned}=batch;
  if(await stage2Digest(unsigned)!==payloadSha256)bad("stage2_payload_mismatch");
  const existing=await f.prepare(
    "SELECT payload_sha256 FROM stage2_rehearsal_batches WHERE run_id=? AND table_name=? AND sequence=?"
  ).bind(batch.runId,batch.table,batch.sequence).first();
  if(existing){
    if(existing.payload_sha256!==payloadSha256)bad("stage2_replay_conflict");
    return {replayed:true,rows:0};
  }
  const lastPk=batch.changes.at(-1).pk;
  const stmts=[
    f.prepare(
      "INSERT INTO stage2_rehearsal_batches(run_id,table_name,sequence,start_after_pk,last_pk,payload_sha256) "+
      "VALUES(?,?,?,?,?,?)"
    ).bind(batch.runId,batch.table,batch.sequence,batch.startAfterPk,lastPk,payloadSha256),
  ];
  for(const c of batch.changes){
    const fingerprint=c.op==="delete"?null:await stage2Digest(c.projection);
    const projectionJson=c.op==="delete"?null:canonical(c.projection);
    stmts.push(f.prepare(
      "INSERT INTO stage2_rehearsal_operations(run_id,table_name,sequence,pk,operation,previous_fingerprint,fingerprint) "+
      "VALUES(?,?,?,?,?,?,?)"
    ).bind(batch.runId,batch.table,batch.sequence,c.pk,c.op,c.previousFingerprint,fingerprint));
    if(c.op==="delete"){
      stmts.push(f.prepare(
        "DELETE FROM stage2_rehearsal_rows WHERE table_name=? AND pk=?"
      ).bind(batch.table,c.pk));
    }else{
      stmts.push(f.prepare(
        "INSERT INTO stage2_rehearsal_rows(table_name,pk,fingerprint,projection_json) VALUES(?,?,?,?) "+
        "ON CONFLICT(table_name,pk) DO UPDATE SET fingerprint=excluded.fingerprint,projection_json=excluded.projection_json"
      ).bind(batch.table,c.pk,fingerprint,projectionJson));
    }
  }
  stmts.push(f.prepare(
    "UPDATE stage2_rehearsal_checkpoints SET last_sequence=?,last_pk=? "+
    "WHERE run_id=? AND table_name=? AND last_sequence=?"
  ).bind(batch.sequence,lastPk,batch.runId,batch.table,batch.sequence-1));
  try{await f.batch(stmts);}
  catch(error){
    if(String(error?.message||"").includes("stage2_checkpoint_conflict"))bad("stage2_checkpoint_conflict");
    if(String(error?.message||"").includes("stage2_previous_fingerprint_conflict"))bad("stage2_previous_fingerprint_conflict");
    throw error;
  }
  return {replayed:false,rows:batch.changes.length,sequence:batch.sequence,lastPk};
}

// The caller supplies metadata-only expected PK/fingerprints from a *complete*
// source snapshot. No source row material is accepted by this API.
export async function reconcileStage2Snapshot(db,{runId,expected}={}){
  if(!REF.test(runId)||!expected||typeof expected!=="object"||Array.isArray(expected))bad("stage2_reconciliation_invalid");
  const manifest=await requireRun(db,runId);
  if(Object.keys(expected).sort().join(",")!==[...manifest.tables].sort().join(","))bad("stage2_reconciliation_invalid");
  const tables=[];
  for(const table of manifest.tables){
    const entries=expected[table];
    if(!Array.isArray(entries)||entries.some(x=>!exact(x,["pk","fingerprint"])||!REF.test(x.pk)||!HASH.test(x.fingerprint)) ||
      new Set(entries.map(x=>x.pk)).size!==entries.length)bad("stage2_reconciliation_invalid");
    const r=await db.prepare(
      "SELECT pk,fingerprint FROM stage2_rehearsal_rows WHERE table_name=? ORDER BY pk"
    ).bind(table).all();
    const actual=(r.results||[]).map(x=>({pk:x.pk,fingerprint:x.fingerprint}));
    const desired=[...entries].sort((a,b)=>a.pk.localeCompare(b.pk));
    if(canonical(actual)!==canonical(desired))bad("stage2_reconciliation_mismatch");
    tables.push({table,count:actual.length,digest:await stage2Digest(actual)});
  }
  return {runId,sourceSnapshotId:manifest.sourceSnapshotId,tables,digest:await stage2Digest(tables)};
}
