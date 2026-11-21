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
