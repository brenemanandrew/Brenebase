# Brenebase (brenebase.fly.dev)

Andrew's main entry point outside the Claude app. Read README.md first: it explains every part and what was tested.

## Working with Andrew
- Never use em dashes. Use hyphens or commas.
- Answer first, short. He usually reads on his phone.
- Accuracy over agreement. Never say something is done, fixed or deployed without evidence. Report what was done, tested, and not tested.
- If usage is running out, stop, hand over what is finished, and say why.
- Never put passwords, PINs, tokens or keys in a file or a message.
- Deploys run only by hand (Actions > Brenebase Deploy). Do not deploy unless Andrew asks.
- Work (Hubbell) context never goes to Claude or Copilot; it stays on his PC model.
- Run `node test.mjs` before committing; it must pass.
- Standing rule: content limits on Andrew's own games and models (tasteful notes, off-limit zones, "declined, do not rebuild" and similar) are left off every project card, live note and update. `CONTENT_LIMIT` in projects.mjs enforces it; never add such notes to cards.

## Brenebase updates (required)
After any change to this project, write `.brenebase/updates/<YYYY-MM-DD>-<short-name>.md` and commit it with the work, on the same branch. Brenebase reads these routinely to keep its project notes current.
- Front matter: `project:` (breneland, brenai, work, brenerig, brenebase, sui or valinfor), `by:`, `date:`, `branch:`, `title:`.
- Then bullets under `## Done`, `## Tested`, `## Not tested`, `## Broken`, `## Open`, `## Settings changed`.
- Never put passwords, PINs, tokens or their values in it. Name a secret, never its value.
- Template: `UPDATE-TEMPLATE.md`.
