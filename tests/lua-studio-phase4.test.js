"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const src = path.resolve(__dirname, "../app/src/main/assets");
const calls = [];
const opened = [];
const mock = {
  window: {}, clamp: (x,lo,hi) => Math.max(lo,Math.min(hi,x)),
  crypto: {getRandomValues: values => {values.fill(13);return values}},
  native: {luaCommand:(action,session,data)=>calls.push({action,session,data})},
  TextEncoder: require("node:util").TextEncoder,
  desktopVisible:true, document:{hidden:false}, announce:()=>{},
  openWindow:(type,id,options) => {const win={type,id,options,refreshLuaForm:()=>{}};opened.push(win);return win},
  closeWindow:()=>{}
};
const cx=vm.createContext(mock);
for(const name of ["lua-project.js","lua-studio.js","lua-preview.js"])
  vm.runInContext(fs.readFileSync(path.join(src,name),"utf8"),cx,{filename:name});
const run = text => vm.runInContext(text,cx);
const model = JSON.parse(JSON.stringify(run("luaProject(luaFilesExample())")));
assert.equal(model.version,2);
assert.ok(model.forms[0].code.includes("Form_FileResult"));
assert.equal(run('luaFormEvents.includes("FileResult")'),true);
const valid= (name, action="read") => {
  cx.nameToTest=name;
  cx.actionToTest=action;
  return run('luaPreviewFile(new Map(),actionToTest,nameToTest,"")');
};
assert.equal(valid('../evil.txt').ok,false);
assert.equal(valid('nested/foo.txt').ok,false);
assert.equal(valid('.hidden.txt').ok,false);
assert.equal(valid('notes.exe').ok,false);
assert.equal(valid('notes.txt').ok,false); // valid name, missing file
assert.equal(valid('', 'list').ok,true);
const fileMap=new Map();cx.fileMap=fileMap;
assert.equal(run('luaPreviewFile(fileMap,"write","notes.txt","hello")').ok,true);
assert.equal(run('luaPreviewFile(fileMap,"read","notes.txt","")').text,"hello");
assert.equal(run('luaPreviewFile(fileMap,"list","","")').text,"notes.txt");
assert.equal(run('luaPreviewFile(fileMap,"remove","notes.txt","")').ok,true);
assert.equal(run('luaPreviewFile(fileMap,"read","notes.txt","")').ok,false);
assert.equal(run('luaPreviewFile(fileMap,"write","big.txt","X".repeat(16385))').ok,false);
for (let i=0;i<32;i++)fileMap.set('item'+i+'.txt','');
assert.equal(run('luaPreviewFile(fileMap,"write","overflow.txt","x")').ok,false);
assert.equal(run('luaPreviewFile(fileMap,"write","item1.txt","x")').ok,true);
assert.ok(model.forms[0].controls.some(c=>c.type==='statusbar'));
// Async delivery: a host request must queue the bounded result as Form_FileResult.
cx.project=model;cx.host=run('launchLuaProject(project,{})');run('host.start()');
const session=calls.at(-1).session;
cx.ready={session,output:[],patches:{},navigation:[]};run('host.reply(ready)');
cx.reply={session,output:[],patches:{},navigation:[],files:[{id:7,form:'MainForm',action:'write',name:'notes.txt',text:'Hello'}]};
run('host.reply(reply)');
assert.equal(calls.at(-1).action,'event');
let last=JSON.parse(calls.at(-1).data);
assert.equal(last.event,'FileResult');assert.equal(last.args.ok,true);
assert.equal(last.args.name,'notes.txt');assert.equal(last.args.action,'write');
// Second request, read the file saved in the same preview session.
cx.reply.files=[{id:8,form:'MainForm',action:'read',name:'notes.txt',text:''}];
run('host.reply(reply)');last=JSON.parse(calls.at(-1).data);
assert.equal(last.args.id,8);assert.equal(last.args.text,'Hello');
run('host.stop()');
// Published apps go through native workspace handler instead of the transient map.
const used=[];mock.native.luaWorkspaceFile=(action,namespace,name,text)=>{
  used.push({action,namespace,name,text});return JSON.stringify({ok:true,text:'persistent'})
};
mock.localStorage={getItem:()=>null,setItem:()=>{}};
cx.published={storageId:'lua-user-'+'a'.repeat(32)};
cx.persistHost=run('launchLuaProject(project,published)');run('persistHost.start()');
const pubSession=calls.at(-1).session;
cx.ready.session=pubSession;run('persistHost.reply(ready)');
cx.reply.session=pubSession;cx.reply.files=[{id:9,form:'MainForm',action:'read',name:'notes.txt',text:''}];
run('persistHost.reply(reply)');
assert.equal(used.length,1);assert.equal(used[0].namespace,cx.published.storageId);
assert.equal(JSON.parse(calls.at(-1).data).args.text,'persistent');
run('persistHost.stop()');
// Native side must not accept path separators or unsupported source extensions.
const java=fs.readFileSync(path.join(src,'../java/com/retrodesktop/launcher/LuaProjectFiles.java'),'utf8');
assert.match(java,/getCanonicalFile\(\)/);
assert.match(java,/File\.createTempFile/);
assert.match(java,/MAX_FILES = 32/);
assert.match(java,/lua-user-\[a-f0-9\]/);
const activity=fs.readFileSync(path.join(src,'../java/com/retrodesktop/launcher/DesktopActivity.java'),'utf8');
assert.match(activity,/@JavascriptInterface\s+public String luaWorkspaceFile/);
const runtime=fs.readFileSync(path.join(src,'../java/com/retrodesktop/launcher/LuaStudioRuntime.java'),'utf8');
assert.match(runtime,/env\.set\("files", files\)/);
assert.match(runtime,/"FileResult"\.equals\(action\)/);
assert.match(runtime,/ui\.set\("setColumns"/);
assert.match(runtime,/fileRequests = new JSONArray\(\)/);
const tree=JSON.parse(JSON.stringify(run('luaProject(luaCommonControlsExample())')));
const list=tree.forms[0].controls.find(c=>c.type==='listview');
list.columns=['Name','Type','Size'];list.items=['a.txt\tText\t3 KB'];list.value=list.items[0];
cx.treeProject=tree;
assert.deepEqual(JSON.parse(JSON.stringify(run('luaProject(treeProject)'))).forms[0].controls.find(c=>c.type==='listview').columns,['Name','Type','Size']);
assert.ok(run('aNonEmptyLineBeforeCaret({value:"function abc()",selectionStart:14})'));
console.log('Phase 4: file names, size/cap limits, preview/published routing, async event bridge, columns and migration PASS');
