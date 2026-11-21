"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "../app/src/main/assets");
const java = path.resolve(root, "../java/com/retrodesktop/launcher");
const source = name => fs.readFileSync(path.join(root,name),"utf8");
const jsrc = name => fs.readFileSync(path.join(java,name),"utf8");
const db = jsrc("LuaProjectDatabase.java");
const rt = jsrc("LuaStudioRuntime.java");
const host = jsrc("DesktopActivity.java");
assert.match(db,/SQLiteDatabase\.create\(null\)/);
assert.match(db,/LuaProgramStore\.valid\(program\)/);
assert.match(db,/setMaximumSize\(MAX_DB_BYTES\)/);
assert.match(db,/rawQuery\(statement, binds\)/);
assert.match(db,/execSQL\(statement, binds\)/);
assert.match(db,/Only one SQL statement is allowed/);
assert.match(rt,/env\.set\("db", db\)/);
assert.match(rt,/"DatabaseResult"\.equals\(action\)/);
assert.match(rt,/"database", databaseRequests/);
assert.match(host,/public String luaDatabase\(/);
const gradle=fs.readFileSync(path.join(__dirname,"../app/build.gradle"),"utf8");
assert.match(gradle,/applicationId 'com\.retrodesktop\.launcher\.resizable'/);
assert.match(gradle,/versionName '2\.8-lua-rc1'/);
const sent=[],calls=[],closed=[];
const context={window:{},clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),
 crypto:{getRandomValues(array){array.fill(7);return array;}},
 native:{luaCommand:(action,session,data)=>sent.push({action,session,data}),
 luaDatabase:(session,id,action,sql,params)=>{
 calls.push({session,id,action,sql,params:JSON.parse(params)});
 return JSON.stringify(action==="query"?{ok:true,text:"Ada\nGrace",columns:"Name",count:2}:{ok:true,text:""});
 },luaDatabaseClose:s=>closed.push(s)},
 TextEncoder:require("node:util").TextEncoder,
 desktopVisible:true,document:{hidden:false},announce(){},
 localStorage:{getItem(){return null;},setItem(){}},
 openWindow:(kind,id,options)=>({kind,id,options,refreshLuaForm(){}}),
 closeWindow(){}};
const sandbox=vm.createContext(context);
for(const file of ["lua-editor-tools.js","lua-project.js","lua-studio.js","lua-preview.js"])
 vm.runInContext(source(file),sandbox,{filename:file});
const ev=code=>vm.runInContext(code,sandbox);
const project=JSON.parse(JSON.stringify(ev("luaDatabaseExample()")));
assert.ok(project.forms[0].controls.some(c=>c.type==="listview"));
assert.match(project.forms[0].code,/VALUES \(\?\)", name/);
assert.ok(ev('luaFormEvents.includes("DatabaseResult")'));
context.project=project;context.settings={};
context.preview=ev("launchLuaProject(project, settings)");
ev("preview.start()");
const session=sent.at(-1).session;
context.initial={session,output:[],patches:{},navigation:[]};ev("preview.reply(initial)");
context.payload={session,output:[],patches:{},navigation:[],database:[
 {id:1,form:"MainForm",action:"exec",sql:"INSERT INTO contacts(name) VALUES (?)",params:["O'Malley"]},
 {id:2,form:"MainForm",action:"query",sql:"SELECT name FROM contacts",params:[]},
 {id:3,form:"Missing",action:"query",sql:"SELECT 1",params:[]}
]};
ev("preview.reply(payload)");
assert.equal(calls.length,2);
assert.deepEqual(calls[0].params,["O'Malley"]);
assert.equal(calls[0].id,"");
assert.equal(JSON.parse(sent.at(-1).data).event,"DatabaseResult");
context.idle={session,output:[],patches:{},navigation:[]};ev("preview.reply(idle)");
const answer=JSON.parse(sent.at(-1).data);
assert.equal(answer.args.columns,"Name");assert.equal(answer.args.text,"Ada\nGrace");
assert.equal(answer.args.count,2);
ev("preview.stop()");assert.deepEqual(closed,[session]);
console.log("Phase 6: native SQLite contract, bound args, isolated preview, event bridge PASS");
