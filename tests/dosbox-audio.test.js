// Run: node tests/dosbox-audio.test.js
// Tests the unchanged Android-facing web player without network or SDK.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'app/src/main/assets/dosbox');
const js = fs.readFileSync(path.join(root, 'player.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'player.css'), 'utf8');
const a = js.indexOf('function configureSoundBlaster(');
const b = js.indexOf('\nasync function start()', a);
assert.ok(a >= 0 && b > a);
const configure = vm.runInNewContext(js.slice(a,b) + '\nconfigureSoundBlaster');

function configGroups(s) {
  const groups = {};
  let name = '';
  for (const line of s.split(/\r?\n/)) {
    const m = line.match(/^\[([^\]]+)\]/);
    if (m) { name = m[1].toLowerCase(); groups[name] = {}; }
    const kv = line.match(/^\s*([a-z0-9]+)\s*=\s*(.*)$/i);
    if (kv && name) groups[name][kv[1].toLowerCase()] = kv[2].trim();
  }
  return groups;
}
const input = [
  '[autoexec]\nsetup.exe\n',
  '[mixer]\nnosound=true\nrate=22050\n[sblaster]\nsbtype=none\nirq=5\n[autoexec]\nplay.bat',
  '[mixer]\nnosound=false\nrate=44100\n[sblaster]\nsbtype=sb16\nirq=7\n[autoexec]\ncall good.bat',
  '[midi]\nmpu401=intelligent\n[autoexec]\necho Hello',
];
for (const item of input) {
  const output = configure(item);
  const groups = configGroups(output);
  assert.equal(groups.mixer.nosound, 'false');
  assert.equal(groups.mixer.rate, '44100');
  assert.deepEqual(JSON.parse(JSON.stringify(groups.sblaster)), {
    oplrate:'44100',oplemu:'default',oplmode:'auto',sbmixer:'true',
    hdma:'5',dma:'1',irq:'7',sbbase:'220',sbtype:'sb16'
  });
  assert.equal(output.match(/\[autoexec\]/g)?.length, 1);
  const lastOriginalLine = item.split(/\r?\n/).at(-1);
  assert.ok(output.endsWith(lastOriginalLine), 'Preserved autoexec command');
}
const directions = [
  ['up',265,'▲'], ['left',263,'◀'], ['down',264,'▼'], ['right',262,'▶']
];
for (const [dir,key,arrow] of directions) {
  assert.ok(html.includes(`data-key="${key}" class="${dir}" aria-label="${dir[0].toUpperCase()+dir.slice(1)}">${arrow}</button>`));
  assert.ok(css.includes(`#direction-pad .${dir} { grid-area:${dir}; }`));
}
assert.match(css, /grid-template-areas:"\. up \." "left \. right" "\. down \."/);
assert.ok(html.includes('id="test-audio"'));
assert.ok(js.includes('if (!audioEnabled && !audioOptOut && !audioUnlockPromise)'));
assert.ok(js.includes('sound.createOscillator()'));
assert.ok(js.includes('track.start(soundAt)'));
console.log('PASS 4 Sound Blaster configurations, 4 D-pad buttons, speaker test and audio gating');
