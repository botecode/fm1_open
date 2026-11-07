// Step 3 check: HOME = FUNC (navigates on release only), OCT-/+ = pattern on OVERVIEW/SEQ,
// HOME+OCT = octave on OVERVIEW, SCL = track length 16/32/48/64.
// Run: node tests/func-pattern-length.test.mjs  (after node build-sim.mjs)
import fs from "node:fs";
import assert from "node:assert/strict";

const wasm = fs.readFileSync(new URL("../../build/web/simulator.wasm", import.meta.url));
const { exports: c } = new WebAssembly.Instance(new WebAssembly.Module(wasm), {});
c._initialize();
c.sim_boot(1);

const BTN = { OCT_DOWN: 0, OCT_UP: 1, SCL: 3, HOME: 8, SEQ: 11 };
const PAGE = { OVERVIEW: 0, STEPS: 1, PRESET_BROWSER: 16 };
const press = (b) => c.sim_control(0, b, 1);
const release = (b) => c.sim_control(0, b, 0);
const tap = (b) => { press(b); release(b); };
const func = (b) => { press(BTN.HOME); tap(b); release(BTN.HOME); };
const state = () => new Uint8Array(c.memory.buffer, c.sim_state(), 8);
const cstr = (ptr) => { const b = new Uint8Array(c.memory.buffer, ptr, 32); return String.fromCharCode(...b.slice(0, b.indexOf(0))); };
const knobs = () => {
  const b = new Uint8Array(c.memory.buffer, c.sim_knobs(), 128);
  const s = (o) => String.fromCharCode(...b.slice(o, o + 16)).replace(/\0.*$/s, "");
  return [0, 1, 2, 3].map((i) => ({ label: s(i * 32), value: s(i * 32 + 16) }));
};

// HOME = FUNC: pressing alone does nothing until release.
tap(BTN.SEQ);
assert.equal(state()[1], PAGE.STEPS);
press(BTN.HOME);
assert.equal(state()[1], PAGE.STEPS, "HOME press alone does not navigate yet");
release(BTN.HOME);
assert.equal(state()[1], PAGE.OVERVIEW, "HOME tap navigates on release");

// OCT on OVERVIEW = next/previous pattern; octave unchanged.
const octave = state()[7];
const name0 = cstr(c.sim_project_name());
tap(BTN.OCT_UP);
const name1 = cstr(c.sim_project_name());
assert.notEqual(name1, name0, `OCT+ loads the next pattern (${name0} -> ${name1})`);
assert.equal(state()[7], octave, "OCT alone no longer changes the octave on OVERVIEW");
tap(BTN.OCT_UP);
const name2 = cstr(c.sim_project_name());
tap(BTN.OCT_DOWN);
assert.equal(cstr(c.sim_project_name()), name1, "OCT- goes back one pattern");

// HOME+OCT on OVERVIEW = octave, and HOME release does not open the preset browser.
func(BTN.OCT_UP);
assert.equal(state()[7], octave + 1, "HOME+OCT+ raises the octave");
assert.equal(state()[1], PAGE.OVERVIEW, "HOME used as FUNC does not navigate on release");
func(BTN.OCT_DOWN);
assert.equal(state()[7], octave);

// OCT inside SEQ switches pattern and stays in SEQ.
tap(BTN.SEQ);
tap(BTN.OCT_UP);
assert.equal(cstr(c.sim_project_name()), name2, "OCT+ in SEQ loads the next pattern");
assert.equal(state()[1], PAGE.STEPS, "pattern change keeps you in SEQ");

// SCL = track length; read it on SEQ 3/8 (RHYTHM/REC, K4 = LENGTH).
const length = () => { func(BTN.OCT_UP); func(BTN.OCT_UP); const v = knobs()[3]; func(BTN.OCT_DOWN); func(BTN.OCT_DOWN); return v; };
const start = Number(length().value);
const seen = [];
for (let i = 0; i < 4; ++i) { tap(BTN.SCL); seen.push(Number(length().value)); }
const cycle = [16, 32, 48, 64];
const at = cycle.indexOf(start);
assert.ok(at >= 0, `start length is a multiple of 16 (${start})`);
assert.deepEqual(seen, [1, 2, 3, 4].map((k) => cycle[(at + k) % 4]), "SCL cycles 16/32/48/64");
assert.equal(state()[1], PAGE.STEPS, "SCL stays in SEQ");

console.log(`PASS: HOME=FUNC, OCT pattern (${name0} -> ${name1} -> ${name2}), HOME+OCT octave, SCL length ${start} -> ${seen.join("/")}`);

// Stock HOME shortcuts still work with HOME held first.
{
  tap(BTN.HOME); // SEQ -> OVERVIEW
  assert.equal(state()[1], PAGE.OVERVIEW);
  tap(BTN.HOME);
  assert.equal(state()[1], PAGE.PRESET_BROWSER, "HOME tap on OVERVIEW opens the preset browser");
  tap(BTN.HOME);
  press(BTN.HOME); c.sim_control(2, 6, 1); c.sim_control(2, 6, 0); release(BTN.HOME);
  assert.equal(state()[1], 11 /* SOURCE */, "HOME+PRESETS opens the source picker");
  tap(BTN.HOME);
  assert.equal(state()[1], PAGE.OVERVIEW, "HOME tap leaves the source picker");
  press(BTN.HOME); tap(BTN.SEQ); release(BTN.HOME);
  assert.equal(state()[1], PAGE.OVERVIEW, "HOME+SEQ (tap tempo) does not navigate on HOME release");
  console.log("PASS: stock HOME shortcuts (browser, HOME+PRESETS, HOME+SEQ)");
}
