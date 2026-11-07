// Step 5 check (SEQ 1/8): hold a step + K1/K2 = parameter lock of the tone macro.
// Run: node tests/plocks.test.mjs  (after node build-sim.mjs)
import fs from "node:fs";
import assert from "node:assert/strict";

const wasm = fs.readFileSync(new URL("../../build/web/simulator.wasm", import.meta.url));
const { exports: c } = new WebAssembly.Instance(new WebAssembly.Module(wasm), {});
c._initialize();
c.sim_boot(1);

const BTN = { OCT_DOWN: 0, OCT_UP: 1, HOME: 8, SEQ: 11 };
const ENC = { SELECT: 0, ALGO: 1, K1: 2, K2: 3, K3: 4, K4: 5 };
const KEY = { CLEAR: 5, UNLOCK: 17 };
const WHITE = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24, 26];
const press = (b) => c.sim_control(0, b, 1);
const release = (b) => c.sim_control(0, b, 0);
const tap = (b) => { press(b); release(b); };
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
const select = (t) => { turn(ENC.SELECT, t - state()[0]); tap(BTN.SEQ); assert.equal(state()[1], 1, "in SEQ"); };
const clearTrack = () => { press(BTN.HOME); key(KEY.CLEAR); release(BTN.HOME); };
const held = (i, fn) => { keyDown(WHITE[i]); const r = fn(); keyUp(WHITE[i]); return r; };
// Read-only look at a held step: leave SEQ 1/8 before releasing, so the release is not a short press.
const peek = (i, fn) => { keyDown(WHITE[i]); const r = fn(); press(BTN.HOME); tap(BTN.OCT_UP); release(BTN.HOME); keyUp(WHITE[i]); press(BTN.HOME); tap(BTN.OCT_DOWN); release(BTN.HOME); return r; };
const locked = (i, col = 0) => peek(i, () => knobs()[col].value.startsWith("L "));

// 303 on track 2.
const T = 1;
select(T);
clearTrack();
assert.equal(steps(T), 0n);
const homeCutoff = knobs()[0].value;

// Hold step 1: K1/K2 = macros (lockable), K3/K4 = VELOCITY/GATE.
keyDown(WHITE[0]);
assert.deepEqual(knobs().map((k) => k.label), ["Cutoff", "Reso", "VELOCITY", "GATE"], "held step layout");
assert.ok(!knobs()[0].value.startsWith("L "), "no lock yet");
turn(ENC.K1, -10);
const lockedCutoff = knobs()[0].value;
assert.ok(lockedCutoff.startsWith("L "), `K1 locks Cutoff on the step (${lockedCutoff})`);
assert.notEqual(lockedCutoff.slice(2), homeCutoff, "locked value differs from the track value");
const vel = knobs()[2].value;
turn(ENC.K3, -20);
assert.notEqual(knobs()[2].value, vel, "K3 edits VELOCITY");
keyUp(WHITE[0]);
assert.ok(on(T, 0), "trig kept after locking");
assert.equal(knobs()[0].value, homeCutoff, "track Cutoff unchanged by the lock");

// The lock is the one shown on SEQ 4/8 LOCKS.
const lockPage = () => { for (let i = 0; i < 3; ++i) { press(BTN.HOME); tap(BTN.OCT_UP); release(BTN.HOME); } const k = knobs(); for (let i = 0; i < 3; ++i) { press(BTN.HOME); tap(BTN.OCT_DOWN); release(BTN.HOME); } return k; };
const page4 = peek(0, lockPage);
assert.equal(page4[1].label, "LOCK");
assert.notEqual(page4[1].value, "OFF", `SEQ 4/8 shows the lock (${page4[1].value} / ${page4[2].value})`);

// K2 on the same step replaces the lock (one parameter per step).
held(0, () => turn(ENC.K2, 5));
assert.ok(locked(0, 1), "K2 now locks Reso");
assert.ok(!locked(0), "Cutoff lock was replaced");

// A#4 unlocks the held step; without a held step it does nothing.
key(KEY.UNLOCK);
held(0, () => key(KEY.UNLOCK));
assert.ok(on(T, 0), "UNLOCK keeps the trig");
assert.ok(!locked(0, 1), "UNLOCK removed the lock");

// Removing a trig frees its lock.
held(0, () => turn(ENC.K1, -3));
assert.ok(locked(0));
key(WHITE[0]);
assert.ok(!on(T, 0), "short press removed the trig");
keyDown(WHITE[0]); assert.ok(!knobs()[0].value.startsWith("L "), "lock went with the trig"); keyUp(WHITE[0]);
assert.ok(on(T, 0));

// 16 locked steps per project: lock steps until the engine refuses.
clearTrack();
let made = 0;
for (let bar = 0; bar < 2 && made < 17; ++bar) {
  turn(ENC.ALGO, bar - Math.floor(c.sim_step_first() / 16));
  for (let i = 0; i < 16; ++i) { held(i, () => turn(ENC.K1, -2)); if (locked(i)) ++made; else break; }
  if (made < 16 * (bar + 1)) break;
}
assert.ok(made > 0 && made <= 16, `at most 16 locks (made ${made})`);
turn(ENC.ALGO, -4);
clearTrack();
assert.equal(steps(T), 0n);
held(0, () => turn(ENC.K1, -2));
assert.ok(locked(0), "clearing the track frees its locks");
console.log(`PASS: 303 p-locks (Cutoff ${homeCutoff} -> ${lockedCutoff}), replace, UNLOCK, free on remove, limit (${made} locks)`);

// 808 (track 8): macros cannot lock, trig still placed.
select(7);
clearTrack();
held(0, () => turn(ENC.K1, 2));
assert.ok(!locked(0), "808 Tone not lockable");
assert.ok(on(7, 0), "808 trig kept");
console.log("PASS: 808 refuses macro locks");
