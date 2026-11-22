# Skill: make and edit a Brenebase doll

A doll is the cartoon character drawn by `public/companion-avatar.js`: flat colours, black ink outlines, a full body
(head, hair, top, bottom, shoes) in a 200 x 480 drawing. Brenebase's companion is one doll. Other dolls are saved looks.
This skill is read by the PC model inside Brenebase. It answers with JSON only; Brenebase checks the JSON, shows the
doll, and keeps it only when Andrew taps Save. No cloud model is involved.

## What a doll is made of (the "look")

Colours: every one is a hex colour like "#a83c4b".
- skin, hair, iris (eye colour), lip
- top (main colour of the top or dress), shirt (the inner shirt that shows in a hoodie's opening)
- bottom (jeans, leggings, skirt or shorts), shoes
- bg1 (background light), bg2 (background shadow)

Styles: exactly one of the listed words.
- hairStyle: long, wavy, bob, ponytail, twintails, bun, pixie
- topStyle: hoodie, tee, tank, sweater, blouse, crop, dress (a dress also replaces the bottom)
- bottomStyle: jeans, leggings, skirt, shorts
- shoeStyle: boots, sneakers, flats
- glasses: true or false

Body shape: numbers from 0 to 1. 0.5 is average.
- shoulders, arms (thickness), bust, waist, hips, thighs, legs (length)
- bounce: how much her chest and hair follow her movement (0 = none, 1 = a lot)

## Reactions (optional)

What she does when a part of her is tapped in the full view. Parts: hair, face, nose, shoulders, arms, hands, chest,
belly, hips, legs, feet. Each part can have:
- face: happy, joy, playful, blush, surprised, suspicious, grumpy, angry, sad, anxious, excited, tired, chill, eyeroll, thinking, flinch, dizzy, neutral
- move: wave, fingerwave, cheer, stretch, crossarms, hips, shrug, clap, peace, kiss, facepalm, dance, hair, nod, shake, jolt, bounce, jump, laugh, tilt, flip, lookaway, lookdown, shift, cringe, bow
- say: a short line shown in a speech bubble
- send: an action sent to her as Andrew's message, so she answers it in chat

## How to answer

Reply with ONE JSON object and nothing else:
{"name": "...", "look": { only the fields that change }, "reactions": { only the parts that change }, "note": "one short line saying what you changed"}

- For an edit, put only what changes. Leave everything else out.
- For a new doll, give a name and a full look (all colours, all four styles, the body numbers).
- Turn words into values: "red hair" -> hair "#b3352b"; "tall" -> legs 0.8; "curvy" -> bust 0.7, waist 0.35, hips 0.75, thighs 0.65; "athletic" -> shoulders 0.65, arms 0.6, waist 0.4; "petite" -> shoulders 0.35, legs 0.3, bust 0.35, hips 0.4.
- Use only the words and ranges above. If something asked for does not exist (a hat, a jacket over a dress, a nose ring), say so in "note" and use the closest thing that does exist.
- The doll is always dressed: the styles above are the only clothes there are.
- Never use em dashes.

## Examples

Request: "give her red hair in a ponytail and a sundress"
{"look": {"hair": "#b3352b", "hairStyle": "ponytail", "topStyle": "dress", "top": "#f2c94c"}, "note": "Red ponytail and a yellow sundress."}

Request: "make a new doll: a tall goth girl with a bob, black sweater, plaid skirt, boots, glasses"
{"name": "Goth", "look": {"skin": "#f1e6ea", "hair": "#111014", "iris": "#4b2d5e", "lip": "#3a1530", "top": "#1b1a20", "shirt": "#d9d0d6", "bottom": "#5a2236", "shoes": "#111014", "bg1": "#6b4a8a", "bg2": "#1e1430", "hairStyle": "bob", "topStyle": "sweater", "bottomStyle": "skirt", "shoeStyle": "boots", "glasses": true, "shoulders": 0.45, "arms": 0.45, "bust": 0.5, "waist": 0.45, "hips": 0.5, "thighs": 0.5, "legs": 0.8, "bounce": 0.5}, "note": "New doll: tall, black bob, sweater, dark red skirt (plaid is drawn as a plain colour), boots, glasses."}

Request: "when I tap her nose she should giggle and say boop"
{"reactions": {"nose": {"face": "joy", "move": "laugh", "say": "Boop!"}}, "note": "Nose tap: giggles and says Boop."}
