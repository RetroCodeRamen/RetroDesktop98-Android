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
console.log('Lua Studio format compatibility, event definitions, example projects and editor hooks: PASS');
