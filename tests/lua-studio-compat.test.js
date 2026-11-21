"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assets = path.join(__dirname, '../app/src/main/assets');
const context = vm.createContext({window: {}, clamp: (x, min, max) => Math.max(min, Math.min(max, x))});
const evaluate = text => vm.runInContext(text, context);
for (const name of ['lua-project.js', 'lua-studio.js']) {
  // lua-studio.js has browser callbacks inside functions; definitions can be loaded safely in Node.
  vm.runInContext(fs.readFileSync(path.join(assets, name), 'utf8'), context, {filename: name});
}
const copy = data => JSON.parse(JSON.stringify(data));
assert.deepEqual(copy(evaluate('luaEventsForType("text")')), ['Change','Click','DblClick','MouseDown','MouseUp','GotFocus','LostFocus','KeyDown','KeyUp']);
assert.deepEqual(copy(evaluate('luaEventsForType("timer")')), ['Timer']);
assert.ok(copy(evaluate('luaFormEvents')).includes('DblClick'));
const eventSample = copy(evaluate('luaProject(luaExample("events"))'));
assert.equal(eventSample.version, 2);
assert.equal(eventSample.forms[0].controls.length, 4);
assert.match(eventSample.forms[0].code, /function Text1_KeyDown\(event\)/);
assert.match(eventSample.forms[0].code, /function Command1_DblClick\(event\)/);
const two = copy(evaluate('luaProject(luaTwoFormExample())'));
assert.equal(two.forms.length, 2);
assert.equal(two.modules.length, 1);
const old = copy(evaluate('luaExample("counter")'));
const migrated = copy(evaluate('luaProject(luaExample("counter"))'));
assert.equal(migrated.version, 2);
assert.equal(migrated.forms[0].controls[1].name, 'Command1');
// Neither extended events nor designer changes alter the v1->v2 saved schema.
assert.deepEqual(copy(evaluate(`luaProject(${JSON.stringify(migrated)})`)), migrated);
assert.throws(() => evaluate('luaProject({format:luaProjectFormat,version:2,name:"x",forms:[],modules:[]})'));
const src = fs.readFileSync(path.join(assets, 'lua-studio.js'), 'utf8');
assert.match(src,/function travelHistory\(direction\)/);
assert.match(src,/function pasteControls\(\)/);
assert.match(src,/const eventKinds = element\("select"/);

// Exercise the real preview event queue without Android. Rapid text edits must
// preserve the latest value without flooding the Lua service with duplicates.
const calls = [];
const opened = [];
context.crypto = {getRandomValues: array => {array.fill(7); return array;}};
context.native = {luaCommand: (action, session, data) => calls.push({action, session, data})};
context.openWindow = (kind, id, options) => {
  const win = {id, options, refreshLuaForm() {}};
  opened.push(win);
  return win;
};
context.announce = () => {};
context.closeWindow = () => {};
context.desktopVisible = true;
context.document = {hidden: false};
vm.runInContext(fs.readFileSync(path.join(assets, 'lua-preview.js'), 'utf8'), context,
  {filename:'lua-preview.js'});
context.sample = evaluate('luaProject(luaExample("events"))');
context.host = evaluate('launchLuaProject(sample, {})');
evaluate('host.start()');
assert.equal(calls[0].action, 'start');
const session = calls[0].session;
// Finish initial Form_Load (the WebView would normally receive this reply).
context.initialReply = {session, output: [], patches: {}, navigation: []};
evaluate('host.reply(initialReply)');
const events = opened[0].options;
events.writeInput('Form1', 'Text1', 'a');
events.sendEvent('Form1', 'Text1', 'Change');
assert.equal(calls.filter(c => c.action === 'event').length, 1);
events.writeInput('Form1', 'Text1', 'ab');
events.sendEvent('Form1', 'Text1', 'Change');
events.writeInput('Form1', 'Text1', 'abc');
events.sendEvent('Form1', 'Text1', 'Change');
context.eventReply = {session, output: [], patches: {}, navigation: []};
evaluate('host.reply(eventReply)');
assert.equal(calls.filter(c => c.action === 'event').length, 2);
const last = JSON.parse(calls.at(-1).data);
assert.equal(last.event, 'Change');
assert.equal(last.updates.Text1, 'abc');
evaluate('host.stop()');

console.log('Lua Studio model, input event coalescing, migration, and editor hooks: PASS');

// Phase 2: Control arrays add an optional shared handler without losing the
// stable per-instance object names used by existing projects and ui.get/ui.set.
const arrayProject = copy(evaluate('luaProject(luaControlArrayExample())'));
assert.equal(arrayProject.version, 2);
assert.deepEqual(arrayProject.forms[0].controls.slice(0, 3).map(c => [c.name,c.arrayName,c.arrayIndex]),
  [['Button1','Buttons',0],['Button2','Buttons',1],['Button3','Buttons',2]]);
assert.equal(arrayProject.forms[0].controls[3].arrayName, '');
assert.deepEqual(copy(evaluate(`luaProject(${JSON.stringify(arrayProject)})`)), arrayProject);
const sig = entry => evaluate(`luaHandlerSignature(${JSON.stringify(entry)}, "Click")`);
assert.equal(sig({arrayName:'Buttons'}), 'index, event');
assert.equal(sig({arrayName:''}), 'event');
assert.equal(evaluate('luaHandlerSignature({arrayName:"Buttons"}, "Change")'), 'index, value');
assert.equal(evaluate('luaHandlerSignature({arrayName:"Buttons"}, "Timer")'), 'index');
assert.equal(evaluate('luaHandlerSignature(null, "Click")'), 'event');
function projectReject(mutator) {
  const target = copy(arrayProject);
  mutator(target.forms[0].controls);
  context.toValidate = target;
  assert.throws(() => evaluate('luaProject(toValidate)'));
}
projectReject(controls => { controls[1].arrayIndex = controls[0].arrayIndex; });
projectReject(controls => { controls[1].type = 'label'; });
projectReject(controls => { controls[1].arrayIndex = 256; });
projectReject(controls => { controls[1].arrayIndex = -1; });
projectReject(controls => { controls[1].arrayIndex = 0.1; });
projectReject(controls => { controls[1].arrayName = 'Button1'; });
projectReject(controls => { controls[1].arrayName = 'Form'; });
projectReject(controls => { controls[1].arrayName = 'bad name'; });
const single = copy(evaluate('luaProject(luaExample("counter"))'));
assert.equal(single.forms[0].controls[0].arrayName, '');
assert.equal(single.forms[0].controls[0].arrayIndex, 0);
const modal = copy(evaluate('luaProject(luaModalExample())'));
assert.equal(modal.forms.length, 2);
assert.match(modal.forms[0].code, /ui\.showModal\("SettingsForm"\)/);
assert.match(modal.forms[1].code, /ui\.hide\(\)/);
const javaRuntime = fs.readFileSync(path.join(__dirname, '../app/src/main/java/com/retrodesktop/launcher/LuaStudioRuntime.java'),'utf8');
assert.match(javaRuntime, /ui\.set\("getAt", new VarArgFunction/);
assert.match(javaRuntime, /ui\.set\("setAt", new VarArgFunction/);
assert.match(javaRuntime, /invokeArray\(control\.arrayName \+ "_" \+ action, control\.arrayIndex, value\)/);
assert.match(javaRuntime, /modalStack\.peekLast\(\) != receiver/);
assert.match(javaRuntime, /"showModal"/);

// Phase 2 window policy: a modal form disables background forms until hidden.
context.modalProject = modal;
context.modalHost = evaluate('launchLuaProject(modalProject, {})');
const started = calls.length;
evaluate('modalHost.start()');
const modalSession = calls[started].session;
context.replyModal = {session:modalSession,output:[],patches:{},navigation:[]};
evaluate('modalHost.reply(replyModal)');
const mainWin = opened.at(-1);
mainWin.options.sendEvent('MainForm','OpenDialog','Click');
assert.equal(calls.at(-1).action, 'event');
context.replyModal.navigation = [{form:'SettingsForm',action:'modal'}];
evaluate('modalHost.reply(replyModal)');
const modalWin = opened.at(-1);
const afterOpen = calls.length;
mainWin.options.sendEvent('MainForm','OpenDialog','Click');
assert.equal(calls.length, afterOpen, 'background form blocked while modal');
modalWin.options.sendEvent('SettingsForm','Done','Click');
assert.equal(calls.length, afterOpen+1, 'modal form still accepts input');
context.replyModal.navigation = [{form:'SettingsForm',action:'hide'}];
evaluate('modalHost.reply(replyModal)');
mainWin.options.sendEvent('MainForm','OpenDialog','Click');
assert.equal(calls.length, afterOpen+2, 'background form unblocked after hide');
evaluate('modalHost.stop()');

console.log('Phase 2 control arrays, model migration, runtime API markers, and modal gating: PASS');
