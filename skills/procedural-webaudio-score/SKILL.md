---
name: procedural-webaudio-score
description: Generate background music and simple sound effects in the browser with the Web Audio API and no audio files: per-region key, tempo and mood, plucked arpeggio, flute lead, pad, bass, reverb, wind and hoofbeats. Use when a web game or page needs music but cannot ship or fetch audio.
---

# Procedural Web Audio score

## Setup (inside a click handler)
- `AudioContext`, master gain -> compressor -> destination. Reverb: a `ConvolverNode` whose impulse is 2.8 s of noise times `(1-t)^2.6`. A music bus feeds both master and reverb.
- Call `ctx.resume()` on later clicks. Offer one Sound on/off button that sets master gain.

## Music model
- Per region: `{root (MIDI), scale (7 intervals), prog (4 scale degrees), bpm, dens, mel}`. Examples: bright major I-IV-I-V at 76; mixolydian I-V-vi-IV at 82; dorian at 68; minor at 60; phrygian at 54 for dread.
- `deg(d) = root + 12*floor(d/7) + scale[d mod 7]`; chord on degree c is c, c+2, c+4.
- Scheduler: `setInterval(60 ms)`, schedule eighth notes while `next < now + 0.3`. Latch the region at each bar start so key changes land on bar lines.
- Voices (oscillator + gain envelope, optional lowpass):
  - pad: two detuned saws through a 520 Hz lowpass, slow attack, one bar
  - bass: sine an octave down
  - pluck: triangle + quiet octave sine, 5 ms attack, exponential decay; arpeggio offsets `[0,2,4,7,4,2,4,2]`, played with probability `dens`
  - lead: sine with delayed 5 Hz vibrato; a random walk in scale degrees 7 to 16 that snaps to a chord tone on beat 1
- Thin the texture when the player is resting or in a menu.

## Effects
- Hoof or footstep: a slice of a noise buffer through a bandpass (500 to 1000 Hz) with an 80 ms decay, triggered from the gait phase.
- Wind: looped noise through a 420 Hz lowpass with a slow LFO on gain.

## Testing
- You cannot hear it. Verify `ctx.state==='running'`, count scheduled notes, and read RMS and peak from an `AnalyserNode` (healthy: RMS about 0.15, peak under 0.5). Say plainly that the sound itself is unjudged.
- Launch Chromium with `--autoplay-policy=no-user-gesture-required` for the test.
