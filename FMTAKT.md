# fmtakt control mapping (draft v1)

Goal: a Syntakt-style workflow on the M-Vave FM1, as a mod of FM1 Open V14 (`app/screen.c`).

## FM1 hardware (from the V14 source)

| Control | Count | Source reference |
|---|---|---|
| Panel buttons | 14: OCT−, OCT+, FX, SCL, ENV, LFO, EDIT, GLO, HOME, SAVE, ARP, SEQ, PLAY, REC | `app/screen.c:151` |
| Keys | 27 (F3–G5): 16 white + 11 black, every key has an LED | `sdk/include/fm1.h:112,119` |
| Encoders | 7: `0` SELECT, `1` ALGORITHM, `2–5` K1–K4, `6` PRESETS | `sdk/Simulator.js:678` |
| MASTER | 1 analog pot (volume) | `app/board/panel.c` |
| Tracks / steps | 8 tracks, 64 steps (4 pages × 16) | `app/screen.c:148` |

## Decided

| Control | Function |
|---|---|
| SELECT | Choose the active track (1–8) |
| PRESETS | Change the sound/sample on the active track |
| K1–K4 | Filter and effects |
| ALGORITHM | Scroll through the timeline in bars (page 1–4 of 64 steps) |
| 16 white keys | Steps of the current bar; LEDs show trigs |

## Proposed

### Panel buttons

| Button | Syntakt equivalent | Function |
|---|---|---|
| PLAY | PLAY/STOP | Start/stop (unchanged) |
| REC | RECORD | Grid recording on/off; REC+PLAY = live recording |
| SEQ | — | Switch keys between **step mode** (white = steps) and **live mode** (keys play notes) |
| HOME | FUNC | Modifier (already a modifier in V14: HOME+SEQ = tap tempo) |
| EDIT | SRC page | Hold: K1–K4 control the engine/sound parameters |
| ENV | AMP page | Hold: K1–K4 = attack / decay / sustain / release |
| LFO | MOD/LFO page | Hold: K1–K4 = LFO speed / depth / destination / waveform |
| FX | FX page | Hold: K1–K4 = delay/reverb sends and settings |
| SCL | SCALE | Pattern length and speed for the track |
| OCT− / OCT+ | PTN − / + | Previous/next pattern (ALGO now handles bars) |
| ARP | MUTE | Mute mode: white keys 1–8 mute/unmute tracks |
| GLO | — | Global settings / MIDI (unchanged) |
| SAVE | — | Save project; HOME+SAVE = save sound to the track |

**K1–K4 rule:** filter + FX by default. Holding a page button (EDIT/ENV/LFO/FX)
gives K1–K4 to that page for as long as it's held; releasing it returns to filter + FX.

### Black keys (the row above the step lane)

| Key | Function |
|---|---|
| F#3 G#3 A#3 | COPY · PASTE · CLEAR (step; with HOME = whole bar/track) |
| C#4 D#4 | Trig condition (probability, 1:2, FILL…) · RETRIG |
| F#4 G#4 A#4 | Trig parameters: NOTE · VELOCITY · LENGTH (hold step + key + K1) |
| C#5 D#5 | MICRO TIMING · SLIDE/ACCENT |
| F#5 | FILL (hold) |

### Parameter locks
Hold a white step + turn K1–K4 = p-lock for that step. V14 already has a basis
for this: holding a step and turning K1–K4 edits that step's settings (`app/screen.c:619–627`).

## Status
Draft v1 approved (2026-11-07): black keys = functions, page buttons = hold (momentary).

## Implemented
- **Step 1 – ALGO = bars** (`tests/algo-bars.test.mjs`). In SEQ, OCT−/+ temporarily select the SEQ settings pages 1/8–8/8.
- **Step 2 – home knobs** (`tests/home-knobs.test.mjs`). On OVERVIEW and SEQ 1/8:

  | Engine | K1 | K2 |
  |---|---|---|
  | 303 | Cutoff | Reso |
  | Pluck | BRIGHT | DECAY |
  | PSG | NOISE | RELEASE |
  | Sampler (pad) | Vel LPF | Length |
  | 808 (pad) | Tone (BD/SD only) | Decay |
  | DX7 | FEEDBACK (no filter) | — |

  K3 = delay send, K4 = reverb send (0–15, all tracks). The FM1 engine has no
  shared filter, so K1/K2 are per-engine tone macros (decided 2026-11-07).
  Page buttons FX/ENV/LFO/EDIT: hold + turn K1–K4 = peek, release returns home; a plain tap opens the page as before.
  On drum/sampler tracks in SEQ 1/8, PRESETS selects the pad.

  Moved from the old home knobs: LEVEL → GLO (MIX) or FX page; BPM → SEQ 5/8 or tap tempo;
  NOTE of a step → SEQ 2/8; overview SOURCE → ALGO or HOME+PRESETS.
- **Step 3 – buttons** (`tests/func-pattern-length.test.mjs`).
  - HOME = FUNC: navigates on release, only when not combined with another button, key or knob. Stock HOME shortcuts still work.
  - OCT−/+ on OVERVIEW and SEQ = previous/next pattern. FM1 has no patterns inside a project, so a "pattern" is one of the 16 project slots. It loads instantly, like stock OVERVIEW+PRESETS, and **unsaved changes are lost**.
  - HOME+OCT = keyboard octave on OVERVIEW, SEQ settings page 1/8–8/8 inside SEQ.
  - SCL on OVERVIEW/SEQ = track length 16 → 32 → 48 → 64 → 16. On FM pages SCL keeps its stock function (DX7 scaling).
  - **Changed from the plan:** ARP stays the arpeggiator. Mute mode already exists on GLO (stock MIX page: white keys 1–8 mute, 9–16 solo; hold GLO + key = quick mute).
- **Step 4 – trig keys + black keys** (`tests/trig-keys.test.mjs`), on SEQ 1/8:
  - White key press = place trig at once. Hold + K1–K4: see step 5 (HOME + hold = VELOCITY / GATE / PROB / CHORD). Short press on an existing trig = remove (on release). Changed from stock, where every press toggled.
  - Black keys: F#3 COPY · G#3 PASTE · A#3 CLEAR (held step, else current bar; with HOME = whole track) · C#4 UNDO · D#4 TIE · F#4 NOTE−1 · G#4 NOTE+1 (held step). PASTE pastes whatever size was copied.
  - Free: C#5, D#5, F#5 (A#4 = UNLOCK since step 5).
  - **Not possible on the device:** trig conditions, retrig and micro timing. On hardware the sequencer runs in the closed `libfm1_engine.a`, and steps have no fields for them. ALT tuning has no public API in the SDK headers.
- **Step 5 – parameter locks** (`tests/plocks.test.mjs`), on SEQ 1/8:
  - Hold step + K1/K2 = lock that tone macro on the step (value shows `L 24`). K3 = VELOCITY, K4 = GATE (PROB on pad tracks).
  - HOME + hold step + K1–K4 = VELOCITY / GATE / PROB / CHORD (the old step-4 layout).
  - A#4 = UNLOCK the held step. Removing a trig (short press) also frees its lock; CLEAR frees locks too.
  - Lockable: 303 Cutoff/Reso, PSG NOISE/RELEASE, Pluck BRIGHT/DECAY, Sampler Vel LPF/Length (per pad), DX7 FEEDBACK. **808: none** (engine locks only VOLUME there).
  - **Engine limits:** one locked parameter per step (locking K2 replaces a K1 lock, notice `REPLACED`), 16 locked steps per project shared by all tracks (notice `LOCKS n/16`, then `LOCKS FULL 16/16`). Sends cannot be locked.
  - Locks on other pages (hold step + EDIT/ENV page knobs) not done yet; SEQ 4/8 LOCKS still reaches every lockable parameter.
