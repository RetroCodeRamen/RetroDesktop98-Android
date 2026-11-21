"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const assets = path.resolve(__dirname, "../app/src/main/assets");
const java = path.resolve(assets, "../java/com/retrodesktop/launcher");
const source = name => fs.readFileSync(path.join(assets, name), "utf8");
const jsource = name => fs.readFileSync(path.join(java, name), "utf8");
const nativeSQL = jsource("LuaProjectDatabase.java");
const runtime = jsource("LuaStudioRuntime.java");
const bridge = jsource("DesktopActivity.java");
const build = fs.readFileSync(path.join(__dirname, "../build-apk.sh"), "utf8");
const manifest = fs.readFileSync(path.join(__dirname, "../app/src/main/AndroidManifest.xml"), "utf8");
const gradle = fs.readFileSync(path.join(__dirname, "../app/build.gradle"), "utf8");

// Verifies the release replaces the user's disposable v2.7 install after uninstall,
// rather than installing another unintentionally isolated beta package.
assert.match(gradle, /applicationId 'com\.retrodesktop\.launcher\.resizable'/);
assert.match(build, /package="com\.retrodesktop\.launcher\.resizable"/);
assert.doesNotMatch(manifest, /resizable\.beta/);
assert.match(gradle, /versionName '2\.9-dos-deluxe-dev'/);

// Calls to SQLite must cross the isolated process boundary. No direct SQL,
// Java reflection, or filesystem APIs are exposed to Lua source code.
assert.match(runtime, /env\.set\("db", db\)/);
assert.match(runtime, /"DatabaseResult"\.equals\(action\)/);
assert.match(runtime, /"database", databaseRequests/);
assert.match(runtime, /databaseRequests\.length\(\) >= 4/);
assert.match(runtime, /args\.narg\(\) > 5/);
assert.match(runtime, /\.put\("params", parameters\)/);
assert.match(bridge, /@JavascriptInterface\s+public String luaDatabase\(/);
assert.match(bridge, /LuaProjectDatabase\.operate\(/);
assert.match(nativeSQL, /SQLiteDatabase\.create\(null\)/);
assert.match(nativeSQL, /LuaProgramStore\.valid\(program\)/);
assert.match(nativeSQL, /database\.setMaximumSize\(MAX_DB_BYTES\)/);
assert.match(nativeSQL, /rawQuery\(normalized, binds\)/);
assert.match(nativeSQL, /execSQL\(normalized, binds\)/);
assert.match(nativeSQL, /private static final int MAX_ROWS = 24/);
assert.match(nativeSQL, /"exec"\.equals\(action\)/);
assert.match(nativeSQL, /"query"\.equals\(action\)/);
assert.match(nativeSQL, /Only one SQL statement is allowed/);
assert.match(nativeSQL, /SQL comments are not supported/);

const sent=[], opened=[], dbcalls=[], closed=[];
const ctx={
  window:{}, clamp:(x,lo,hi)=>Math.max(lo,Math.min(hi,x)),
  crypto:{getRandomValues(a){a.fill(7);return a;}},
  native:{luaCommand:(action,session,data)=>sent.push({action,session,data}),
    luaDatabase:(session,id,action,sql,params)=>{
      dbcalls.push({session,id,action,sql,params:JSON.parse(params)});
      return JSON.stringify(action === "query" ? {ok:true,text:"Ada\nGrace",columns:"Name",count:2} : {ok:true,text:""});
    }, luaDatabaseClose:session=>closed.push(session)},
  TextEncoder:require("node:util").TextEncoder,
  desktopVisible:true,document:{hidden:false},announce(){},
  localStorage:{getItem(){return null;},setItem(){}},
  openWindow:(kind,id,options)=>{const w={kind,id,options,refreshLuaForm(){}};opened.push(w);return w;},
  closeWindow(){}
};
const sandbox=vm.createContext(ctx);
for(const name of ["lua-editor-tools.js","lua-project.js","lua-studio.js","lua-preview.js"])
  vm.runInContext(source(name),sandbox,{filename:name});
const evalJs=script=>vm.runInContext(script,sandbox);
const demo=JSON.parse(JSON.stringify(evalJs("luaDatabaseExample()")));
assert.equal(demo.name,"SQLite Address Book");
assert.ok(demo.forms[0].controls.some(c=>c.type==="listview"));
assert.match(demo.forms[0].code, /db\.exec\("INSERT INTO contacts\(name\) VALUES \(\?\)", name\)/);
assert.match(demo.forms[0].code, /ui\.setItems\("Contacts", event\.text\)/);
assert.ok(evalJs('luaFormEvents.includes("DatabaseResult")'));
ctx.project=demo;
ctx.callbacks={};
ctx.host=evalJs("launchLuaProject(project, callbacks)");
evalJs("host.start()");
const sid=sent.at(-1).session;
ctx.init={session:sid,output:[],patches:{},navigation:[]};
evalJs("host.reply(init)");
ctx.response={session:sid,output:[],patches:{},navigation:[],database:[
  {id:1,form:"MainForm",action:"exec",sql:"INSERT INTO contacts(name) VALUES (?)",params:["O'Malley"]},
  {id:2,form:"MainForm",action:"query",sql:"SELECT name FROM contacts",params:[]},
  {id:3,form:"MainForm",action:"delete",sql:"SELECT 1",params:[]},
  {id:4,form:"OtherForm",action:"query",sql:"SELECT 1",params:[]}
]};
evalJs("host.reply(response)");
assert.equal(dbcalls.length,2);
assert.deepEqual(dbcalls[0].params,["O'Malley"]);
assert.equal(dbcalls[0].id,""); // preview database must be temporary
assert.equal(sent.at(-1).action,"event");
const first=JSON.parse(sent.at(-1).data);
assert.equal(first.event,"DatabaseResult");
assert.equal(first.args.action,"exec");
ctx.idle={session:sid,output:[],patches:{},navigation:[]};
evalJs("host.reply(idle)");
const second=JSON.parse(sent.at(-1).data);
assert.equal(second.event,"DatabaseResult");
assert.equal(second.args.columns,"Name");
assert.equal(second.args.text,"Ada\nGrace");
assert.equal(second.args.count,2);
evalJs("host.stop()");
assert.deepEqual(closed,[sid]);
console.log("Phase 6: SQLite host binding, isolated preview database, bound args, event flow and normal package ID PASS");
