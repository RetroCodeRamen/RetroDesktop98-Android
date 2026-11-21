"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../app/src/main/assets");
const activity = fs.readFileSync(path.join(root, "../java/com/retrodesktop/launcher/LuaStudioRuntime.java"), "utf8");
const catalog = fs.readFileSync(path.join(root, "../java/com/retrodesktop/launcher/LuaProgramStore.java"), "utf8");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const css = fs.readFileSync(path.join(root,"desktop.css"),"utf8");
const sent=[], opened=[], listed=[];
const mock={
  window:{}, clamp:(x,lo,hi)=>Math.max(lo,Math.min(hi,x)),
  crypto:{getRandomValues(values){values.fill(3);return values;}},
  native:{luaCommand:(action,session,data)=>sent.push({action,session,data}),
    luaWorkspaceFile:(action,id,name,text)=> {listed.push({action,id,name,text});return JSON.stringify({ok:true,text:"notes.txt\n../evil.txt\nconfig.json\ninvalid.exe"});}},
  TextEncoder:require("node:util").TextEncoder,
  desktopVisible:true,document:{hidden:false},announce(){},
  localStorage:{getItem(){return null;},setItem(){}},
  openWindow:(kind,id,options)=>{const win={kind,id,options,refreshLuaForm(){}};opened.push(win);return win;},
  closeWindow(){}
};
const cx=vm.createContext(mock);
for (const file of ["lua-editor-tools.js","lua-project.js","lua-studio.js","lua-preview.js"])
  vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),cx,{filename:file});
const evalCode=script=>vm.runInContext(script,cx);
cx.sourceToTest = 'function test() -- <bad>\n return 32 "<tag>"\nend';
const highlight = evalCode("luaHighlightSource(sourceToTest)");
assert.ok(highlight.includes('lua-syn-keyword'));
assert.ok(highlight.includes('&lt;bad&gt;'));
assert.ok(highlight.includes('&lt;tag&gt;'));
assert.ok(!highlight.includes('<tag>'));
assert.ok(!highlight.includes('<bad>'));
assert.equal(evalCode('luaSourceFunctions("function Hello()\\nend\\nlocal function Other()\\nend")').length,2);
const complete=JSON.parse(JSON.stringify(evalCode('luaCompleteAt("ui.se",5)')));
assert.equal(complete.start,0);
assert.ok(complete.items.some(item=>item.insert==="ui.set("));
assert.ok(evalCode('luaSourceDiagnostics("print(1")').length>0);
assert.equal(evalCode('luaSourceDiagnostics("print(1) -- [ignored\\nlocal a = \\\"(\\\"")').length,0);
assert.ok(evalCode('luaSourceDiagnostics("local a = \\\"broken")').length>0);
const migrated=JSON.parse(JSON.stringify(evalCode('luaProject(luaExample("counter"))')));
assert.equal(migrated.meta.version,"1.0.0");
assert.equal(migrated.modules.length,0);
const classDemo=JSON.parse(JSON.stringify(evalCode('luaProject(luaClassExample())')));
assert.equal(classDemo.modules[0].kind,"class");
assert.match(classDemo.modules[0].code,/function Counter_new\(initial\)/);
assert.match(classDemo.forms[0].code,/shared.counter:increment/);
cx.bad=classDemo;
assert.throws(()=>evalCode('luaProject({...bad,meta:{version:"3!",description:""}})'),/version/);
assert.equal(evalCode('luaProject({...bad,meta:{version:"1.2.3",description:"Demo"}}).meta.version'),"1.2.3");
assert.ok(html.indexOf('lua-editor-tools.js')<html.indexOf('lua-project.js'));
assert.match(css,/lua-code-input\.lua-highlight-enabled/);
assert.match(activity, /"open"\.equals\(kind\) \|\| "save"\.equals\(kind\)/);
assert.match(catalog, /Invalid application version or description/);
// A published Lua app can list only its own bounded file names for a picker.
cx.project=classDemo;
cx.options={storageId:"lua-user-"+"a".repeat(32)};
cx.host=evalCode("launchLuaProject(project,options)");
evalCode("host.start()");
const session=sent.at(-1).session;
cx.ready={session,output:[],patches:{},navigation:[]};
evalCode("host.reply(ready)");
cx.reply={session,output:[],patches:{},navigation:[],dialogs:[{id:1,kind:"open",form:"MainForm",title:"Open",message:"Choose",defaultValue:""}]};
evalCode("host.reply(reply)");
const picker=opened.at(-1);
assert.equal(picker.kind,"lua-common-dialog");
assert.deepEqual(JSON.parse(JSON.stringify(picker.options.luaCommonDialog.fileNames)),["notes.txt","config.json"]);
assert.equal(listed[0].action,"list");
assert.equal(listed[0].id,cx.options.storageId);
picker.options.onResult(true,"notes.txt");
assert.equal(sent.at(-1).action,"event");
assert.equal(JSON.parse(sent.at(-1).data).args.value,"notes.txt");
evalCode("host.stop()");
console.log("Phase 5: editor lexer, safe highlighting, navigation, completion, class templates, metadata, sandboxed picker PASS");
