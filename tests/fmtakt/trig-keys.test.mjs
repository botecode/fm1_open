// Step 4 check (SEQ 1/8): Elektron-style trig keys + black-key functions.
// Run: node tests/trig-keys.test.mjs  (after node build-sim.mjs)
import fs from "node:fs";
import assert from "node:assert/strict";

const wasm = fs.readFileSync(new URL("../../build/web/simulator.wasm", import.meta.url));
const { exports: c } = new WebAssembly.Instance(new WebAssembly.Module(wasm), {});
c._initialize();
c.sim_boot(1);

const BTN = { OCT_DOWN: 0, OCT_UP: 1, HOME: 8, SEQ: 11 };
const ENC = { SELECT: 0, ALGO: 1, K1: 2, K3: 4 };
const KEY = { STEP1: 0, STEP2: 2, COPY: 1, PASTE: 3, CLEAR: 5, UNDO: 8, TIE: 10, NOTE_DOWN: 13, NOTE_UP: 15 };
const press = (b) => c.sim_control(0, b, 1);
const release = (b) => c.sim_control(0, b, 0);
const tap = (b) => { press(b); release(b); };
const func = (b) => { press(BTN.HOME); tap(b); release(BTN.HOME); };
const keyDown = (k) => c.sim_control(1, k, 1);
const keyUp = (k) => c.sim_control(1, k, 0);
const key = (k) => { keyDown(k); keyUp(k); };
const turn = (e, d) => { c.sim_control(2, e, d); c.sim_control(2, e, 0); };
const state = () => new Uint8Array(c.memory.buffer, c.sim_state(), 240);
const steps = (t) => new DataView(c.memory.buffer, c.sim_state() + 8 + t * 20 + 12, 8).getBigUint64(0, true);
const on = (t, s) => ((steps(t) >> BigInt(s)) & 1n) === 1n;
const knobs = () => {
  const b = new Uint8Array(c.memory.buffer, c.sim_knobs(), 128);
  const s = (o) => String.fromCharCode(...b.slice(o, o + 16)).replace(/\0.*$/s, "");
  return [0, 1, 2, 3].map((i) => ({ label: s(i * 32), value: s(i * 32 + 16) }));
};

const T = 1; // track 2, the 303 (melodic)
turn(ENC.SELECT, T - state()[0]);
tap(BTN.SEQ);
assert.equal(state()[1], 1, "in SEQ");

// HOME + A#3 clears the whole track.
press(BTN.HOME); key(KEY.CLEAR); release(BTN.HOME);
assert.equal(steps(T), 0n, "HOME+CLEAR empties the track");
assert.equal(state()[1], 1, "still in SEQ (HOME used as FUNC)");

// Press places the trig immediately; hold + K edits the step; release keeps it.
keyDown(KEY.STEP1);
assert.ok(on(T, 0), "press places a trig at once");
press(BTN.HOME); // step 5: HOME + held step = full TRIG layout
assert.deepEqual(knobs().map((k) => k.label), ["VELOCITY", "GATE", "PROB", "CHORD"], "HOME + held step shows TRIG knobs");
const prob = knobs()[2].value;
turn(ENC.K3, 2);
assert.notEqual(knobs()[2].value, prob, `K3 edits PROB of the held step (${prob} -> ${knobs()[2].value})`);
release(BTN.HOME);
assert.equal(state()[1], 1, "HOME used as FUNC: still in SEQ");
keyUp(KEY.STEP1);
assert.ok(on(T, 0), "releasing after an edit keeps the trig");
assert.equal(knobs()[2].label, "DLY SEND", "knobs return to home layout on release");

// Short press on an existing trig removes it (on release).
keyDown(KEY.STEP1);
assert.ok(on(T, 0), "still on while held");
keyUp(KEY.STEP1);
assert.ok(!on(T, 0), "short press removes the trig");

// Copy bar 1 -> paste into bar 2 -> undo.
key(KEY.STEP1); key(KEY.STEP2);
assert.ok(on(T, 0) && on(T, 1), "steps 1 and 2 placed");
key(KEY.COPY);
turn(ENC.ALGO, 1);
assert.equal(c.sim_step_first(), 16, "bar 2");
key(KEY.PASTE);
assert.ok(on(T, 16) && on(T, 17), "bar pasted into steps 17-18");
key(KEY.UNDO);
assert.ok(!on(T, 16) && !on(T, 17), "UNDO removes the paste");
assert.ok(on(T, 0) && on(T, 1), "bar 1 untouched");

// Clear bar (no step held).
key(KEY.STEP1);
assert.ok(on(T, 16));
key(KEY.CLEAR);
assert.ok(!on(T, 16), "CLEAR with no held step clears the current bar");
assert.ok(on(T, 0), "other bars untouched");
turn(ENC.ALGO, -1);

// Hold step 1 + D#4 = TIE, + G#4 = NOTE +1; the trig survives the release.
const lockPage = () => { func(BTN.OCT_UP); func(BTN.OCT_UP); func(BTN.OCT_UP); const k = knobs(); func(BTN.OCT_DOWN); func(BTN.OCT_DOWN); func(BTN.OCT_DOWN); return k; };
assert.ok(on(T, 0), "step 1 is on");
// Holding the step points the cursor at it; leaving SEQ 1/8 drops the hold without toggling.
keyDown(KEY.STEP1); const before = lockPage(); keyUp(KEY.STEP1);
assert.ok(on(T, 0), "reading step details does not remove the trig");
keyDown(KEY.STEP1);
key(KEY.TIE);
key(KEY.NOTE_UP);
keyUp(KEY.STEP1);
assert.ok(on(T, 0), "black-key edits count as use: release keeps the trig");
keyDown(KEY.STEP1); const after = lockPage(); keyUp(KEY.STEP1);
assert.equal(before[0].label, "TIE");
assert.notEqual(after[0].value, before[0].value, `TIE toggled (${before[0].value} -> ${after[0].value})`);
assert.notEqual(after[3].value, before[3].value, `NOTE +1 (${before[3].value} -> ${after[3].value})`);

console.log(`PASS: trig keys (place/hold/remove), K3 PROB ${prob}->edited, bar COPY/PASTE/UNDO/CLEAR, TIE ${before[0].value}->${after[0].value}, NOTE ${before[3].value}->${after[3].value}`);

// Drum track (808, track 8): same place/remove behavior on the selected pad.
{
  const D = 7;
  turn(ENC.SELECT, D - state()[0]);
  tap(BTN.SEQ);
  press(BTN.HOME); key(KEY.CLEAR); release(BTN.HOME);
  assert.equal(steps(D), 0n, "808 track cleared");
  keyDown(KEY.STEP1);
  assert.ok(on(D, 0), "808: press places the pad trig");
  keyUp(KEY.STEP1);
  assert.ok(on(D, 0), "808: first release keeps it");
  key(KEY.STEP1);
  assert.ok(!on(D, 0), "808: short press removes it");
  console.log("PASS: 808 trig keys");
}
