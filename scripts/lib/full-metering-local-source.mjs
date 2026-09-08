import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";
import { createXrayStatsCliUsageSnapshotReader } from "../../server/services/edge/xray-stats-cli-usage-reader.mjs";
import { createFullMeteringHy2SnapshotReader, createFullMeteringTuicConnectionSnapshotReader } from "../../server/services/edge/full-metering-source-readers.mjs";

const UNITS = {xray:"xray-vless-reality.service",hy2:"hysteria2.service",tuic:"mihomo-tuic.service"};
const LIMIT = 4 * 1024 * 1024;
const REF = /^[A-Za-z0-9._:-]{1,128}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sha = value => createHash("sha256").update(value).digest("hex");
function fail(code) { throw Object.assign(new Error(`full_metering_local_${code}`), {code:`full_metering_local_${code}`}); }
function require(value, code) { if (!value) fail(code); }
function path(value) { require(typeof value === "string" && /^\/[A-Za-z0-9_./-]+$/.test(value) && !value.split("/").includes(".."), "path_invalid"); return value; }
function text(value) { require(typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f]/.test(value), "material_invalid"); return value; }
function nativeRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:20_000,maxBuffer:LIMIT,shell:false,windowsHide:true,env:{PATH:"/usr/bin:/bin",LC_ALL:"C",TZ:"UTC"},...options});
  return {exitCode:result.status,stdout:result.stdout,stderr:result.stderr};
}
function timestamp(value, systemd = false) {
  const pattern = systemd ? /^\w{3} (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\.(\d{6}) UTC$/ : /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\.(\d{9}) \+0000$/;
  const match = pattern.exec(value || ""); require(match, "timestamp_invalid");
  const ms = Date.parse(`${match[1]}T${match[2]}Z`);require(Number.isFinite(ms),"timestamp_invalid");
  return BigInt(ms)*1_000_000n + BigInt(match[3].padEnd(9,"0"));
}
function scalar(value) {
  value = value.trim();
  if (value.startsWith('"')) { const decoded=JSON.parse(value);return text(decoded); }
  if (value.startsWith("'")) {require(value.endsWith("'"),"config_invalid");return text(value.slice(1,-1).replaceAll("''","'"));}
  require(!/[{}\[\]&*!|>]/.test(value),"config_invalid");return text(value.replace(/\s+#.*$/,""));
}
function field(lines, name, indent, required = true) {
  const matches=lines.filter(line=>line.startsWith(" ".repeat(indent)+name+":") && line[indent+name.length]===":");
  require(matches.length <= 1 && (!required || matches.length === 1),"config_invalid");
  return matches.length ? matches[0].slice(indent+name.length+1).trim() : null;
}
function block(lines, name, indent) {
  const value=field(lines,name,indent);if(value==="{}")return [];
  require(value==="","config_invalid");
  const start=lines.findIndex(line=>line.startsWith(" ".repeat(indent)+name+":"));
  let end=start+1;while(end<lines.length && (!lines[end].trim() || lines[end].startsWith(" ".repeat(indent+1))))end++;
  return lines.slice(start+1,end);
}
function users(lines, indent) {
  const values=[];
  for(const line of lines.filter(line=>line.trim()&&!line.trimStart().startsWith("#"))){
    const match=/^( *)("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z0-9._:-]+):\s*(.+)$/.exec(line);
    require(match && match[1].length===indent,"config_invalid");values.push([scalar(match[2]),scalar(match[3])]);
  }
  return values;
}
function loopback(authority) {
  const match=/^(127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})$/.exec(authority || "");
  require(match && Number(match[2])<=65535,"source_invalid");
  return {host:match[1],port:Number(match[2]),authority};
}
function generatedYaml(lines,kind) {
  // The runtime adapters emit this small YAML subset. Refuse alternative key
  // syntax/merges rather than parse a different identity view from the daemon.
  for(const line of lines){
    if(!line.trim()||line.trimStart().startsWith("#"))continue;
    require(!/^\s*(?:<<\s*:|[%?!&*]|---(?:\s|$)|\.\.\.(?:\s|$))/.test(line),"config_invalid");
    require(!/^\s*(?:- )?[A-Za-z0-9._-]+\s+:/.test(line),"config_invalid");
    const quoted=/^( *)("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')\s*:/.exec(line);
    if(quoted)require(quoted[1].length===(kind==="hy2"?4:6)&&(kind==="hy2"?REF:UUID).test(scalar(quoted[2])),"config_invalid");
  }
}
function parseConfig(kind, source) {
  const principals=[];let endpoint,secret="";
  const add=(runtimeUser,material)=>{text(runtimeUser);require(!principals.some(v=>v.runtimeUser===runtimeUser),"identity_duplicate");principals.push({runtimeUser,materialFingerprint:sha(JSON.stringify([kind,...material]))});};
  if(kind==="xray"){
    assertNoDuplicateObjectKeys(source);const config=JSON.parse(source);
    require(Array.isArray(config.inbounds) && config.api?.services?.includes("StatsService") && typeof config.api.tag==="string","config_invalid");
    const stats=config.inbounds.filter(inbound=>inbound.tag===config.api.tag || config.routing?.rules?.some(rule=>rule.outboundTag===config.api.tag&&rule.inboundTag?.includes(inbound.tag)));
    require(stats.length===1 && Number.isSafeInteger(stats[0].port),"source_invalid");
    const listen=stats[0].listen==="::1"?"[::1]":stats[0].listen;
    endpoint=loopback(`${listen}:${stats[0].port}`);
    for(const inbound of config.inbounds.filter(value=>value.protocol==="vless")){
      require(Array.isArray(inbound.settings?.clients),"config_invalid");
      for(const client of inbound.settings.clients){
        require(REF.test(client.email || "") && UUID.test(client.id || ""),"identity_invalid");
        const policy=config.policy?.levels?.[client.level ?? 0];require(policy?.statsUserUplink===true&&policy?.statsUserDownlink===true,"stats_policy_invalid");
        add(client.email,[client.id]);
      }
    }
  }else{
    const lines=source.replaceAll("\r\n","\n").split("\n");require(!source.includes("\t"),"config_invalid");generatedYaml(lines,kind);
    if(kind==="hy2"){
      const auth=block(lines,"auth",0);require(scalar(field(auth,"type",2))==="userpass","config_invalid");
      const stats=block(lines,"trafficStats",0);endpoint=loopback(scalar(field(stats,"listen",2)));const raw=field(stats,"secret",2,false);if(raw)secret=scalar(raw);
      for(const [user,password] of users(block(auth,"userpass",2),4)){require(REF.test(user),"identity_invalid");add(user,[password]);}
    }else{
      endpoint=loopback(scalar(field(lines,"external-controller",0)));const raw=field(lines,"secret",0,false);if(raw)secret=scalar(raw);
      const listeners=block(lines,"listeners",0),groups=[];
      for(const line of listeners){if(line.startsWith("  - "))groups.push([]);if(line.trim()){require(groups.length>0,"config_invalid");groups.at(-1).push(line);}}
      require(groups.length>0,"config_invalid");
      for(const group of groups){require(scalar(field(group,"type",4))==="tuic","config_invalid");for(const [uuid,password] of users(block(group,"users",4),6)){require(UUID.test(uuid),"identity_invalid");add(uuid,[uuid,password]);}}
    }
  }
  require(principals.length<=5000,"identity_bound");return {endpoint,secret,runtimeUsers:principals};
}

/** Native Linux read only. Returns private identity evidence; never logs/configures/clears. */
export async function readFullMeteringLocalSource({kind,runtimeUnit,configPath,credentialRefByRuntimeUser,commandRunner=nativeRunner,nowFn=()=>new Date(),fetchFn=globalThis.fetch} = {}) {
  try{
    require(Object.hasOwn(UNITS,kind)&&runtimeUnit===UNITS[kind],"unit_invalid");path(configPath);require(typeof commandRunner==="function","runner_invalid");
    const run=(command,args)=>{
      const result=commandRunner(command,args,{timeout:20_000,maxBuffer:LIMIT,shell:false});require(result?.exitCode===0,"read_failed");
      const output=String(result.stdout || "");require(Buffer.byteLength(output)<=LIMIT,"read_bound");return output;
    };
    const read=target=>run("/usr/bin/cat",["--",target]);
    const fileStat=()=>{
      const raw=run("/usr/bin/stat",["-c","%f|%s|%y|%z|%d|%i","--",configPath]).trim(),parts=raw.split("|");
      require(parts.length===6 && /^[a-f0-9]+$/i.test(parts[0]) && (parseInt(parts[0],16)&0xf000)===0x8000 && /^\d+$/.test(parts[1]) && Number(parts[1])<=LIMIT,"config_file_invalid");
      return {raw,size:Number(parts[1]),mtime:timestamp(parts[2]),ctime:timestamp(parts[3])};
    };
    const capture=()=>{
      const raw=run("/usr/bin/systemctl",["show",runtimeUnit,"--timestamp=us+utc","--property=ActiveState","--property=SubState","--property=MainPID","--property=NRestarts","--property=ExecMainStartTimestamp"]);
      const fields={};for(const line of raw.trim().split("\n")){const i=line.indexOf("="),key=line.slice(0,i);require(i>0&&!Object.hasOwn(fields,key)&&["ActiveState","SubState","MainPID","NRestarts","ExecMainStartTimestamp"].includes(key),"service_invalid");fields[key]=line.slice(i+1).trim();}
      require(fields.ActiveState==="active"&&fields.SubState==="running"&&/^[1-9][0-9]*$/.test(fields.MainPID||"")&&/^\d+$/.test(fields.NRestarts||""),"service_invalid");
      const pid=fields.MainPID,started=timestamp(fields.ExecMainStartTimestamp,true);
      const boot=read("/proc/sys/kernel/random/boot_id").trim();require(UUID.test(boot),"boot_invalid");
      const processStat=read(`/proc/${pid}/stat`);const close=processStat.lastIndexOf(") ");require(close>0,"process_invalid");
      const ticks=processStat.slice(close+2).trim().split(/\s+/)[19];require(/^[1-9][0-9]*$/.test(ticks||""),"process_invalid");
      const args=read(`/proc/${pid}/cmdline`).split("\0").filter(Boolean),paths=[];
      for(let i=1;i<args.length;i++){if(["-c","-config","--config","-f"].includes(args[i]))paths.push(args[++i]);else if(/^(--config|-config)=/.test(args[i]))paths.push(args[i].slice(args[i].indexOf("=")+1));}
      require(paths.length===1&&paths[0]===configPath,"config_origin_invalid");
      const binary=path(run("/usr/bin/readlink",["--",`/proc/${pid}/exe`]).trim());
      const digest=run("/usr/bin/sha256sum",["--",binary]).trim();require(digest.endsWith("  "+binary)&&/^[a-f0-9]{64}  /.test(digest),"binary_invalid");const binaryHash=digest.slice(0,64);
      const before=fileStat(),config=read(configPath),after=fileStat();require(before.raw===after.raw&&Buffer.byteLength(config)===after.size,"config_changed");
      require(started>=after.mtime&&started>=after.ctime,"config_not_loaded");
      return {pid,ticks,binary,config,configDigest:sha(config),fileIdentity:after.raw,generation:sha(JSON.stringify([boot,pid,ticks,binaryHash])),serviceIdentity:raw};
    };
    const ownsSocket=(snapshot,endpoint)=>{
      const rows=run("/usr/bin/ss",["-H","-lntp"]).trim().split("\n").filter(Boolean).filter(line=>line.trim().split(/\s+/)[3]===endpoint.authority);
      require(rows.length===1,"socket_invalid");const pids=[...rows[0].matchAll(/pid=(\d+)(?=,|\))/g)].map(match=>match[1]);require(pids.length>0&&pids.every(pid=>pid===snapshot.pid),"socket_owner_invalid");
    };
    const before=capture(),config=parseConfig(kind,before.config);ownsSocket(before,config.endpoint);
    const supplied=credentialRefByRuntimeUser instanceof Map?credentialRefByRuntimeUser:new Map(Object.entries(credentialRefByRuntimeUser||{})),mapping=new Map(),refs=new Set();
    for(const user of config.runtimeUsers){const ref=supplied.get(user.runtimeUser);require(typeof ref==="string"&&REF.test(ref)&&!refs.has(ref),"identity_mapping_invalid");mapping.set(user.runtimeUser,ref);refs.add(ref);}
    let snapshot,observations;
    if(kind==="xray"){
      snapshot=await createXrayStatsCliUsageSnapshotReader({xrayBinary:before.binary,statsServer:config.endpoint.authority,strictCounters:true,nowFn,commandRunner:(command,args)=>{const stdout=run(command,args);assertNoDuplicateObjectKeys(stdout);return {exitCode:0,stdout};}})();
      observations=snapshot.entries.map(value=>{require(mapping.has(value.edgeCredentialRef),"identity_unknown");return {...value,edgeCredentialRef:mapping.get(value.edgeCredentialRef)};});
    }else{
      const reader=kind==="hy2"?createFullMeteringHy2SnapshotReader:createFullMeteringTuicConnectionSnapshotReader;
      snapshot=await reader({url:`http://${config.endpoint.authority}${kind==="hy2"?"/traffic":"/connections"}`,secret:config.secret,credentialRefByRuntimeUser:mapping,nowFn,fetchFn})();
      observations=kind==="hy2"?snapshot.observations:snapshot.connections;
    }
    const after=capture();require(before.generation===after.generation&&before.configDigest===after.configDigest&&before.fileIdentity===after.fileIdentity&&before.serviceIdentity===after.serviceIdentity,"identity_changed");ownsSocket(after,config.endpoint);
    return {generation:before.generation,observedAt:snapshot.observedAt,observations,runtimeUsers:config.runtimeUsers,configDigest:before.configDigest};
  }catch(error){if(typeof error?.code==="string"&&error.code.startsWith("full_metering_local_"))throw error;fail("read_failed");}
}
