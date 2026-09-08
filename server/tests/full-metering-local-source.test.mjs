import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFullMeteringLocalSource } from "../../scripts/lib/full-metering-local-source.mjs";

const sha=value=>createHash("sha256").update(value).digest("hex");
const UUID="11111111-1111-4111-8111-111111111111";
const REF="edgecred_synthetic";
const unit={xray:"xray-vless-reality.service",hy2:"hysteria2.service",tuic:"mihomo-tuic.service"};
function fixture(kind){
  const path="/etc/synthetic/config",binary="/opt/synthetic/runtime";
  const config=kind==="xray"?JSON.stringify({api:{tag:"api",services:["StatsService"]},policy:{levels:{0:{statsUserUplink:true,statsUserDownlink:true}}},inbounds:[{tag:"client",protocol:"vless",settings:{clients:[{email:REF,id:UUID}]}},{tag:"api",listen:"127.0.0.1",port:12345,protocol:"dokodemo-door"}]}):kind==="hy2"?`auth:\n  type: userpass\n  userpass:\n    ${REF}: "synthetic-password"\ntrafficStats:\n  listen: "127.0.0.1:12345"\n  secret: "synthetic-stats-secret"\n`:`external-controller: "127.0.0.1:12345"\nsecret: "synthetic-stats-secret"\nlisteners:\n  - name: "synthetic"\n    type: tuic\n    users:\n      "${UUID}": "synthetic-password"\n`;
  const state={config,pid:"101",ticks:"123456",calls:[],requests:[],owner:"101",start:"Tue 2026-09-08 00:00:01.000000 UTC",binaryHash:"a".repeat(64),afterRead:null,failRead:false,cmdConfig:path,authority:"127.0.0.1:12345",counterUser:kind==="tuic"?UUID:REF};
  const reader=()=>new Response(kind==="hy2"?JSON.stringify({[state.counterUser]:{tx:10,rx:20}}):JSON.stringify({connections:[{id:"synthetic-connection",metadata:{inboundUser:state.counterUser},upload:10,download:20}]}),{status:200,headers:{"Content-Type":"application/json"}});
  const options={kind,runtimeUnit:unit[kind],configPath:path,credentialRefByRuntimeUser:{[kind==="tuic"?UUID:REF]:REF},nowFn:()=>new Date("2026-09-08T00:00:02.000Z"),
    fetchFn:async(url,opts)=>{state.requests.push([url,opts]);state.afterRead?.();return reader();},
    commandRunner(command,args){state.calls.push([command,...args]);
      if(state.failRead)return {exitCode:1,stderr:"synthetic-secret-must-not-leak"};
      if(command.endsWith("systemctl"))return {exitCode:0,stdout:`ActiveState=active\nSubState=running\nMainPID=${state.pid}\nNRestarts=0\nExecMainStartTimestamp=${state.start}\n`};
      if(command.endsWith("readlink"))return {exitCode:0,stdout:binary+"\n"};
      if(command.endsWith("sha256sum"))return {exitCode:0,stdout:state.binaryHash+"  "+binary+"\n"};
      if(command.endsWith("stat"))return {exitCode:0,stdout:`8180|${Buffer.byteLength(state.config)}|2026-09-08 00:00:00.000000000 +0000|2026-09-08 00:00:00.000000000 +0000|1|123\n`};
      if(command.endsWith("ss"))return {exitCode:0,stdout:`LISTEN 0 4096 ${state.authority} 0.0.0.0:* users:(("synthetic",pid=${state.owner},fd=3))\n`};
      if(command===binary){state.afterRead?.();return {exitCode:0,stdout:JSON.stringify({stat:[{name:`user>>>${state.counterUser}>>>traffic>>>uplink`,value:10},{name:`user>>>${state.counterUser}>>>traffic>>>downlink`,value:20}]})};}
      if(command.endsWith("cat")){
        const target=args.at(-1);
        if(target.endsWith("/boot_id"))return {exitCode:0,stdout:"22222222-2222-4222-8222-222222222222\n"};
        if(target.endsWith("/cmdline"))return {exitCode:0,stdout:`${binary}\0-c\0${state.cmdConfig}\0`};
        if(target.endsWith("/stat"))return {exitCode:0,stdout:`101 (synthetic) S ${Array(18).fill("0").join(" ")} ${state.ticks} 0\n`};
        return {exitCode:0,stdout:state.config};
      }
      throw Error("unexpected synthetic command");
    }};
  return {state,options};
}

for(const kind of ["xray","hy2","tuic"]){
  test(`local ${kind} proves all 31 principals even when one has counters`,async()=>{
    const {state,options}=fixture(kind);
    const principals=Array.from({length:31},(_,i)=>({uuid:`${String(i+1).padStart(8,"0")}-1111-4111-8111-111111111111`,user:`edgecred_${i+1}`}));
    options.credentialRefByRuntimeUser=Object.fromEntries(principals.map(v=>[kind==="tuic"?v.uuid:v.user,v.user]));
    state.counterUser=kind==="tuic"?principals[0].uuid:principals[0].user;
    if(kind==="xray"){
      const config=JSON.parse(state.config);config.inbounds[0].settings.clients=principals.map(v=>({email:v.user,id:v.uuid}));state.config=JSON.stringify(config);
    }else if(kind==="hy2"){
      state.config=state.config.replace(`    ${REF}: "synthetic-password"`,principals.map(v=>`    ${v.user}: "synthetic-password"`).join("\n"));
    }else{
      state.config=state.config.replace(`      "${UUID}": "synthetic-password"`,principals.map(v=>`      "${v.uuid}": "synthetic-password"`).join("\n"));
    }
    const result=await readFullMeteringLocalSource(options);
    assert.equal(result.runtimeUsers.length,31);assert.equal(result.observations.length,1);
    assert.equal(new Set(result.runtimeUsers.map(v=>v.runtimeUser)).size,31);
  });
  for(const invalid of ["duplicate-user","half-material","non-loopback","missing-source","unknown-counter"]){
    test(`local ${kind} rejects ${invalid} without disclosing materials`,async()=>{
      const {state,options}=fixture(kind);
      if(invalid==="unknown-counter")state.counterUser="unmapped-counter-user";
      else if(kind==="xray"){
        const config=JSON.parse(state.config);
        if(invalid==="duplicate-user")config.inbounds[0].settings.clients.push({...config.inbounds[0].settings.clients[0]});
        if(invalid==="half-material")delete config.inbounds[0].settings.clients[0].id;
        if(invalid==="non-loopback")config.inbounds[1].listen="0.0.0.0";
        if(invalid==="missing-source")delete config.inbounds[1].listen;
        state.config=JSON.stringify(config);
      }else{
        const line=kind==="hy2"?`    ${REF}: "synthetic-password"`:`      "${UUID}": "synthetic-password"`;
        if(invalid==="duplicate-user")state.config=state.config.replace(line,`${line}\n${line}`);
        if(invalid==="half-material")state.config=state.config.replace('"synthetic-password"','""');
        if(invalid==="non-loopback")state.config=state.config.replace("127.0.0.1","0.0.0.0");
        if(invalid==="missing-source")state.config=state.config.replace("127.0.0.1:12345","");
      }
      await assert.rejects(readFullMeteringLocalSource(options),e=>e.code?.startsWith("full_metering_local_")&&!e.message.includes("synthetic-"));
      if(invalid!=="unknown-counter"){assert.equal(state.requests.length,0);assert(!state.calls.some(c=>c[0]==="/opt/synthetic/runtime"));}
    });
  }
}

test("local xray accepts explicit IPv6 loopback without guessing the source",async()=>{
  const {state,options}=fixture("xray"),config=JSON.parse(state.config);
  config.inbounds[1].listen="::1";state.config=JSON.stringify(config);state.authority="[::1]:12345";
  const result=await readFullMeteringLocalSource(options);assert.equal(result.observations.length,1);
  assert(state.calls.some(c=>c.includes("--server=[::1]:12345")));
});

test("local xray rejects duplicate JSON keys before reading counters",async()=>{
  const {state,options}=fixture("xray");state.config=state.config.replace('"api":','"api":{},"api":');
  await assert.rejects(readFullMeteringLocalSource(options));assert(!state.calls.some(c=>c[0]==="/opt/synthetic/runtime"));
});

for(const kind of ["hy2","tuic"]){
  test(`local ${kind} rejects duplicate endpoint keys`,async()=>{
    const {state,options}=fixture(kind),line=kind==="hy2"?'  listen: "127.0.0.1:12345"':'external-controller: "127.0.0.1:12345"';
    state.config=state.config.replace(line,`${line}\n${line}`);
    await assert.rejects(readFullMeteringLocalSource(options));assert.equal(state.requests.length,0);
  });
  for(const syntax of ["quoted-source-key","spaced-source-key","merge-key","tagged-key","anchored-key","alias-key"]){
    test(`local ${kind} rejects unsupported YAML ${syntax} before source reads`,async()=>{
      const {state,options}=fixture(kind);
      const key=kind==="hy2"?"trafficStats":"external-controller";
      if(syntax==="quoted-source-key")state.config+=`"${key}": {}\n`;
      if(syntax==="spaced-source-key")state.config+=`${key} : {}\n`;
      if(syntax==="merge-key")state.config+="<<: {}\n";
      if(syntax==="tagged-key")state.config+=`!!str ${key}: {}\n`;
      if(syntax==="anchored-key")state.config+=`&synthetic ${key}: {}\n`;
      if(syntax==="alias-key")state.config+="*synthetic: {}\n";
      await assert.rejects(readFullMeteringLocalSource(options));assert.equal(state.requests.length,0);
    });
  }
}

for(const kind of ["xray","hy2","tuic"]){
  test(`local ${kind} reads actual loopback source with stable private material proof`,async()=>{
    const {state,options}=fixture(kind),result=await readFullMeteringLocalSource(options);
    assert.match(result.generation,/^[a-f0-9]{64}$/);assert.equal(result.configDigest,sha(state.config));
    assert.equal(result.observedAt,"2026-09-08T00:00:02.000Z");assert.equal(result.observations.length,1);
    assert.deepEqual(result.runtimeUsers,[{runtimeUser:kind==="tuic"?UUID:REF,materialFingerprint:sha(JSON.stringify(kind==="xray"?[kind,UUID]:kind==="hy2"?[kind,"synthetic-password"]:[kind,UUID,"synthetic-password"]))}]);
    assert.equal(result.observations[0].uploadBytes,10);assert.equal(result.observations[0].downloadBytes,20);
    assert.doesNotMatch(JSON.stringify(result),/synthetic-password|synthetic-stats-secret/);
    assert(!state.calls.some(c=>c.some(v=>/^(restart|start|stop|enable|reset)$/.test(v))));
    for(const [url,request] of state.requests){assert.equal(request.method,"GET");assert(!url.includes("clear"));assert(url.endsWith(kind==="hy2"?"/traffic":"/connections"));}
  });
  for(const change of ["pid","ticks","config","binary"]){
    test(`local ${kind} rejects ${change} drift across counter read`,async()=>{
      const {state,options}=fixture(kind);state.afterRead=()=>{if(change==="pid")state.pid="102";if(change==="ticks")state.ticks="123457";if(change==="config")state.config+="\n";if(change==="binary")state.binaryHash="b".repeat(64);};
      await assert.rejects(readFullMeteringLocalSource(options),e=>e.code?.startsWith("full_metering_local_"));
    });
  }
  for(const invalid of ["wrong-unit","wrong-config","wrong-owner","missing-map","not-loaded","read-error"]){
    test(`local ${kind} rejects ${invalid} before reading counters`,async()=>{
      const {state,options}=fixture(kind);if(invalid==="wrong-unit")options.runtimeUnit="other.service";if(invalid==="wrong-config")state.cmdConfig="/etc/other";if(invalid==="wrong-owner")state.owner="999";if(invalid==="missing-map")options.credentialRefByRuntimeUser={};if(invalid==="not-loaded")state.start="Mon 2026-09-07 00:00:00.000000 UTC";if(invalid==="read-error")state.failRead=true;
      await assert.rejects(readFullMeteringLocalSource(options),e=>e.code?.startsWith("full_metering_local_")&&!e.message.includes("synthetic-secret"));
      assert.equal(state.requests.length,0);assert(!state.calls.some(c=>c[0]==="/opt/synthetic/runtime"));
    });
  }
}
