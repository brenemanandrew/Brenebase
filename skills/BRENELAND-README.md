# Breneland skills for Brenebase

Ten skills drawn from the Breneland project, for Brenebase's worker jobs. Each is a folder with one `SKILL.md`
(frontmatter `name` and `description`, then when to use, what exists, steps, rules, how to verify, report format).
Written 2026-11-22 by the Breneland master session. The source of truth is this folder in `F:\Projects\Breneland-Next`.

## The skills

| Skill | Use it to |
|---|---|
| `in-game-editor` | Build an owner-only editor that edits something live and saves it to the game as data |
| `designer-page` | Build a standalone page where Andrew lays something out by hand and exports it for a build |
| `character-and-pose-tools` | Build a turntable page with sliders that writes a look or pose the game reads |
| `recording-booth` | Build a batch recording tool with take checks, keep/redo and saved progress |
| `shot-and-test-harness` | Walk a spot with real keys and touch, take PC and phone pictures, check them, add the suite |
| `free-model-intake` | Bring a CC0 model in as one small toon-shaded prop with a fallback and a credit |
| `clip-converter` | Turn animation clips from a free pack into the game's format for the toy body |
| `modelled-character-export` | Export a Blender character with its clips baked at full frame rate |
| `fit-a-wearable` | Fit a hat, garment, beard or hair to every build and head shape |
| `set-piece-texturing` | Give a Blender building HD textures and bevels inside the phone budget |

Two older skills cover neighbouring ground and live in `C:\Users\kimek\.claude\skills`: `Breneland3` (Blender props in
the house style) and `digital-tabletop-game` (an online card or board game).

## Requirement: every task evaluates the skills it has

Before a worker starts any task, it must look at its skills and decide which apply. This is a step of the run, not a
hope that the model remembers.

1. **Load the index.** At job start, read the `name` and `description` from the frontmatter of every `SKILL.md`
   available to the worker (this folder, the user skills folder, and any Brenebase keeps itself). Descriptions only;
   do not load every body.
2. **Evaluate against the task.** Compare the task text with each description, including its "not for" pointers.
   Pick every skill that applies; picking none is a valid answer.
3. **Record the decision.** Write one line per skill considered to the job log: `skill <name>: used | not used, <reason>`.
   The job's final report lists the skills used.
4. **Load and follow.** Read the whole `SKILL.md` of each picked skill before planning, and follow its Steps, Rules
   and Report format. Where a skill's rules and the task conflict, the stricter rule holds and the report says so.
5. **Re-check when the task changes shape.** If the work turns out to need something a skipped skill covers (a model
   to fetch, a test to write), evaluate again and load it then.
6. **Fail loudly.** If the skills folder cannot be read, the job says so at the top of its report and does not
   pretend it checked.

A job that cannot meet a skill's precondition (Blender with its add-on on Andrew's PC, a download that needs his yes)
stops at that step and reports, and does not work around it.

## Before Brenebase runs these on the real game

The worker's jobs currently run `git checkout -B hub/<id>` and `git add -A` in the repo they are pointed at. In
`F:\Projects\Breneland-Next` that would move the working copy off `main` and sweep in other sessions' uncommitted
work. Give each job its own worktree under `F:\Projects\Breneland-Next-wt\<job>` and never the main working copy.
Only the Breneland master merges, tests on main and deploys.
