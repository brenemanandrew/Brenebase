---
name: recording-booth
description: Build or extend a batch recording tool in the pattern of Andrew's voice booth in Breneland: a scripted list of prompts recorded one take at a time in the browser, each take checked, kept or redone, stored on the server with progress that resumes on any device, and pulled down later for training or use. Use when asked for "a way to record my voice / lines / sounds in batches", "add a new set of lines to the booth", "a recording page for X", or "export the takes". Not for playing or auditioning existing sounds (that is the Music & SFX page).
---

# Recording booth

The booth is a production line: a fixed script, one prompt on screen, record, automatic checks, Keep or Redo, next.
The server owns the script and the files. It records and stores; it does not train or synthesise.

## When to use

- Many short recordings are needed against a known list (voice lines, sound effects, pronunciations).
- A new set or style is being added to the existing voice booth.
- The takes need exporting to this PC for a model or for the game.

## When not to use

- One or two recordings. Ask Andrew for the files.
- Live voice chat. That is `lib/voice.js`.

## What already exists

- **Page**: `public/voice-booth.html`, `public/js/voice-booth.js` (the flow), `voice-booth-dsp.js` (resample, trim,
  WAV, the checks: `analyse`, `LIMITS`), `voice-booth-worklet.js` (raw samples from the mic). In the owner's menu as
  the Voice booth tile (`public/js/tools-menu.js` `TILES`).
- **Script**: `lib/voice-booth-script.js` (600 prompts, 30 batches of 20, one style per batch, ids `<style>-<nnn>`)
  and `lib/voice-booth-set2.js` (set 2: batches 31 to 40, ids `<style>2-<nnn>`). A line with digits carries a `say`
  line (what is read aloud).
- **Server**: `lib/voice-booth.js`, registered through `api.http('/api/voice-booth/', ...)`. Routes (full list in
  its header): `GET /state`, `POST /take?id=<prompt id>` (the WAV as the body, notes in `x-take-meta`),
  `POST /take/<id>/delete`, `POST /cursor`, `POST /code`, `POST /pull`, `GET /manifest`, `GET /wav/<id>.wav`.
- **Storage**: `DATA_DIR/voice-booth/wavs/<id>.wav` (one kept take per prompt; a new Keep replaces it) and
  `manifest.json` (`{ v, takes, cursor, mic }`, written whole then renamed).
- **Format**: 24 kHz, mono, 16-bit PCM WAV, trimmed with a little air kept and 5 ms fades.
- **Caps**: a take 0.3 s to 30 s, the booth under 400 MB with a warning from 300 MB (the Fly volume is 1 GB),
  40 takes a minute. Tests change them with `VOICE_BOOTH_CAPS` (ignored on Fly).
- **Owner only**: every request carries the session token in `x-breneland-token`; the server answers 401 without a
  session and 403 for anyone but the owner (`api.accounts.auth(token).owner`, list `OWNER_KEYS` in
  `lib/accounts.js`). Others see "This is Andrew's booth".
- **Export**: `tools/voice-pull.mjs` downloads to `F:\Projects\Breneland-Voice\takes\` (`wavs/`, `metadata.csv` as
  `id|text|style`, `manifest.json`), skipping files whose sha1 matches. It signs in with a one-time code shown on the
  booth's Progress page (8 letters, 15 minutes, used once, exchanged for a 2 hour pull token) or the owner's session.
- **Docs**: `docs/CONTRACTS.md` "Changes by voice-booth" and "voice-set2"; brief `docs/briefs/voice-booth.md`; notes
  for Andrew `docs/voice-booth.md`. Wave log row 11b in `docs/briefs/breneland2-progress.md`.
- **Test**: `tools/voice-booth-test.mjs` (in run-all; uses port + 1 for a small-caps server and fake mic files),
  `--shots` for pictures, `tools/voice-booth-sheet.py` for the sheet.

## Steps

**A new set of lines for the existing booth**

1. Write the lines in a new file beside the script (as `voice-booth-set2.js` does): original text, one style per
   batch, 20 a batch. No `|` and no line breaks in a line (the export is pipe-separated; the test checks).
2. Give ids a new prefix or suffix so no existing id changes. **Append only. Never renumber or reorder ids**: kept
   takes are filed by id.
3. Register the set so `GET /state` reports it in `sets` and `totals.sets`, and the Progress page shows it.
4. Extend `tools/voice-booth-test.mjs` for the new counts and rerun it.

**A new booth for something else**

5. Copy the three layers and keep them separate: a script module on the server, a server module with caps and atomic
   writes, a page that records. The text and labels of a take always come from the server's script, never from the
   client.
6. Recording: ask for the mic only after a tap. `getUserMedia` with echo cancellation, noise suppression and auto
   gain all off. An AudioWorklet hands over raw Float32; resample and encode in page code so the server receives one
   known format and rejects anything else (400), anything too long or large (413), and a full booth (507).
7. Checks before Keep is offered: nothing heard, too quiet, clipped (count full-scale samples before resampling), cut
   short for the words, background noise, bad trim. A silent take cannot be kept. Say the problem in a few plain
   words next to Redo.
8. Flow: a mic check the first time on a device; then one prompt at a time; Record or Space; auto-stop after a pause
   (0.8 s default, adjustable); playback; Keep (Enter) or Redo (R); arrows to move. Progress by batch and overall.
9. Resume anywhere: store the cursor (the batch he is on) and the last mic on the server; device settings in
   `localStorage`.
10. Export: a pull tool on the PC that needs no secret typed into a file, using a short-lived one-time code from the
    page with a retry limit per address. Write a manifest and a metadata file with the spoken text.
11. Add a tile to the owner's menu, a "Changes by" section in `docs/CONTRACTS.md`, and a short how-to for Andrew in
    `docs/`.

## Rules that must hold

- **His kept takes are never replaced by a job.** Only his own Keep replaces a take. A job never POSTs to the live
  booth and never deletes from it; it reads the live site only if asked, with a code he generates.
- Owner decided on the server. No PIN, session token, pull code or key in code, tests, docs or logs. The pull tool
  writes nothing secret to disk.
- **No sound in tests, ever.** Muted headless Chrome with fake mic files; never the app's own browser pane; never
  play a take back during a test run.
- Never ask for the microphone before a tap. Never send audio anywhere but the booth's own route.
- Mind the volume: caps enforced on the server, a warning before full, and the report states the size added.
- Atomic writes (temp file then rename) for the manifest.
- Phone first: 44 px buttons, Record reachable by thumb, icons over words; the booth works on his phone and PC.
- Original prompt text only. No em dashes in on-screen text. No git force flags.

## How to verify

- `node --experimental-vm-modules tools/check.mjs`, then `node tools/run-all.mjs --base <yours> --only voice-booth-test,tools-menu-test,smoke`.
- The suite must prove: 401 without a session, 403 for a non-owner; a good take is kept and listed; wrong format,
  too long, too many and booth-full are refused with the right codes; Redo replaces; the cursor resumes on a second
  page; the one-time code works once and expires; the export skips unchanged files; no page errors; the mic is not
  requested before a tap.
- Pictures (`--shots`): the mic check, a prompt, a failed check with its message, the Progress page, on a PC and at
  390 px wide. Open them.

## Report format

What can be recorded and how many prompts in how many batches; ids and how they stay stable; format and caps; where
takes are stored and how to pull them; suites with counts; picture paths; then what is rough or unverified (for
example "never tried with a real microphone in this job", "levels measured, not listened to").
