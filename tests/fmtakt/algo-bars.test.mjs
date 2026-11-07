// Step 1 check: in SEQ, ALGORITHM scrolls bars and HOME+OCT-/+ change the settings page (step 3).
// Run: node tests/algo-bars.test.mjs  (after node build-sim.mjs)
import fs from "node:fs";
import assert from "node:assert/strict";

const wasm = fs.readFileSync(new URL("../../build/web/simulator.wasm", import.meta.url));
const { exports: c } = new WebAssembly.Instance(new WebAssembly.Module(wasm), {});
c._initialize();
c.sim_boot(1);

const BTN = { OCT_DOWN: 0, OCT_UP: 1, HOME: 8, SEQ: 11, PLAY: 12 };
const func = (b) => { c.sim_control(0, BTN.HOME, 1); tap(b); c.sim_control(0, BTN.HOME, 0); };
const ENC = { SELECT: 0, ALGO: 1, PRESETS: 6 };
const tap = (b) => { c.sim_control(0, b, 1); c.sim_control(0, b, 0); };
const turn = (e, d) => { c.sim_control(2, e, d); c.sim_control(2, e, 0); };
const page = () => new Uint8Array(c.memory.buffer, c.sim_state(), 8)[1];
const knobs = () => {
  const b = new Uint8Array(c.memory.buffer, c.sim_knobs(), 128);
  return [0, 1, 2, 3].map((i) => String.fromCharCode(...b.slice(i * 32, i * 32 + 16)).replace(/\0.*$/s, ""));
};
const STEPS = 1;

tap(BTN.SEQ);
assert.equal(page(), STEPS, "SEQ opens the step page");
assert.equal(c.sim_step_first(), 0, "starts on bar 1");
const basicKnobs = knobs().join("|");

turn(ENC.ALGO, 1);
assert.equal(c.sim_step_first(), 16, "ALGO +1 -> bar 2");
turn(ENC.ALGO, 2);
assert.equal(c.sim_step_first(), 48, "ALGO +2 -> bar 4");
turn(ENC.ALGO, 5);
assert.equal(c.sim_step_first(), 48, "clamps at the last bar");
turn(ENC.ALGO, -3);
assert.equal(c.sim_step_first(), 0, "ALGO back to bar 1");
assert.equal(knobs().join("|"), basicKnobs, "ALGO no longer changes the settings page");

func(BTN.OCT_UP);
assert.equal(page(), STEPS, "HOME+OCT stays in SEQ (HOME release does not navigate)");
assert.equal(c.sim_step_first(), 0, "HOME+OCT+ does not move bars");
assert.notEqual(knobs().join("|"), basicKnobs, "HOME+OCT+ moves to the next settings page");
func(BTN.OCT_DOWN);
assert.equal(knobs().join("|"), basicKnobs, "HOME+OCT- returns to 1/8 BASIC");

console.log("PASS: ALGO scrolls bars, HOME+OCT changes settings page");
