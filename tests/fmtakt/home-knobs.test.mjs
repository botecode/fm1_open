// Step 2 check: home-page K1-K4 = tone macro / tone macro / delay send / reverb send,
// and holding a page button while turning K1-K4 returns home on release.
// Run: node tests/home-knobs.test.mjs  (after node build-sim.mjs)
import fs from "node:fs";
import assert from "node:assert/strict";

const wasm = fs.readFileSync(new URL("../../build/web/simulator.wasm", import.meta.url));
const { exports: c } = new WebAssembly.Instance(new WebAssembly.Module(wasm), {});
c._initialize();
c.sim_boot(1);

const BTN = { FX: 2, ENV: 4, SEQ: 11, HOME: 8 };
const ENC = { SELECT: 0, K1: 2, K2: 3, K3: 4, K4: 5, PRESETS: 6 };
const PAGE = { OVERVIEW: 0, STEPS: 1, FM_ENV: 3, EFFECTS: 10 };
const press = (b) => c.sim_control(0, b, 1);
const release = (b) => c.sim_control(0, b, 0);
const tap = (b) => { press(b); release(b); };
const turn = (e, d) => { c.sim_control(2, e, d); c.sim_control(2, e, 0); };
const state = () => new Uint8Array(c.memory.buffer, c.sim_state(), 8);
const knobs = () => {
  const b = new Uint8Array(c.memory.buffer, c.sim_knobs(), 128);
  const s = (o) => String.fromCharCode(...b.slice(o, o + 16)).replace(/\0.*$/s, "");
  return [0, 1, 2, 3].map((i) => ({ label: s(i * 32), value: s(i * 32 + 16) }));
};
const selectTrack = (t) => turn(ENC.SELECT, t - state()[0]);

// Expected macros per engine in the factory project (tracks 1..8).
const expected = [
  ["FDBACK", ""], ["Cutoff", "Reso"], ["NOISE", "RELEASE"], ["BRIGHT", "DECAY"],
  ["Vel LPF", "Length"], ["FDBACK", ""], ["Cutoff", "Reso"], ["Tone", "Decay"],
];
for (let t = 0; t < 8; ++t) {
  selectTrack(t);
  const k = knobs();
  assert.deepEqual([k[0].label, k[1].label, k[2].label, k[3].label],
    [...expected[t], "DLY SEND", "REV SEND"], `track ${t + 1} home labels`);
}

// Edits land on the 303 (track 2): cutoff, reso, delay, reverb.
selectTrack(1);
const before = knobs();
turn(ENC.K1, -4); turn(ENC.K2, 3); turn(ENC.K3, 5); turn(ENC.K4, 15);
const after = knobs();
assert.ok(Number(after[0].value) < Number(before[0].value), "K1 lowers 303 cutoff");
assert.ok(Number(after[1].value) > Number(before[1].value), "K2 raises 303 reso");
assert.equal(after[2].value, "33%", "K3 = delay send 5/15");
assert.equal(after[3].value, "100%", "K4 = reverb send 15/15 (clamped)");

// Same knobs on SEQ 1/8.
tap(BTN.SEQ);
assert.equal(state()[1], PAGE.STEPS);
assert.equal(knobs()[2].label, "DLY SEND", "SEQ 1/8 uses home knobs");

// Peek: hold FX, turn K1, release -> back to SEQ.
press(BTN.FX);
assert.equal(state()[1], PAGE.EFFECTS, "FX opens the FX page while held");
turn(ENC.K1, 1);
release(BTN.FX);
assert.equal(state()[1], PAGE.STEPS, "releasing FX after a knob turn returns to SEQ");

// Tap without turning: page stays open (original behavior).
tap(BTN.ENV);
assert.equal(state()[1], PAGE.FM_ENV, "a plain tap of ENV still opens ENV");
tap(BTN.HOME);
assert.equal(state()[1], PAGE.OVERVIEW);

// Peek from OVERVIEW too.
press(BTN.ENV); turn(ENC.K2, 1); release(BTN.ENV);
assert.equal(state()[1], PAGE.OVERVIEW, "ENV peek returns to OVERVIEW");

// Drum track in SEQ: PRESETS picks the pad (K1 follows it).
selectTrack(7);
tap(BTN.SEQ);
const pad0 = knobs()[0].label;
turn(ENC.PRESETS, 1);
assert.equal(state()[3], 1, "PRESETS selects pad 2 on the 808");
assert.notEqual(knobs()[0].label + knobs()[1].label, "", "macro follows the selected pad");
console.log(`PASS: home knobs on 8 tracks, 303 edits, FX/ENV peek, 808 pad select (pad1 K1=${pad0}, pad2 K1=${knobs()[0].label || "-"})`);
