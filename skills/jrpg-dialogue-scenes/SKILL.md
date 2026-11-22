---
name: jrpg-dialogue-scenes
description: Add two tiers of NPC talk to a 3D game: word balloons over gossip NPCs, and an over-the-shoulder dialogue scene with a JRPG text box for important characters. Use when asked for villager chatter, speech bubbles, cutscene-style conversations or typewriter dialogue.
---

# NPC talk: balloons and dialogue scenes

## Gossip balloon
- A DOM element positioned every frame by projecting the head position: `v.set(x, headY, z).project(camera)`, then `left=(v.x*.5+.5)*W`, `top=(-v.y*.5+.5)*H`. Hide when `v.z>1`, after about 4.5 s, or when the player walks away. The player keeps control.

## Important characters
- Data: `{name, model, look, position, lines:[['n','their line'],['g','player reply'], ...]}`. Mark them with a floating gold diamond. Give them priority in nearest-NPC selection (subtract about 1.4 m from their distance).
- On talk: dismount, place the player 2.6 m in front of the NPC, face each other, lock input, park the companion behind the camera, push bystanders out to 5.5 m.

## Over-the-left-shoulder framing
- Let f = unit vector player -> NPC, r = right. Camera = player - f*b - r*l with l about 1.4 and b from 1.6 upward.
- The angle between the two subjects is `atan(l/b) - atan(l/(b+d))`. Increase b until that is at most `min(0.4, halfHorizontalFov*1.15)`.
- Aim the camera so the NPC sits 0.4 of the half-width left of centre: `axis = atan(l/(b+d)) + half*0.4`; look along `f*cos(axis) + r*sin(axis)`.
- Use vertical FOV 42 in landscape and 60 in portrait; compute the horizontal half-angle from the aspect. Lerp position, look target and FOV in and out over about 0.4 s.
- Chibi heads are big: a camera closer than about 1.5 m behind the player just shows hair.

## Text box
- Bottom panel with a name tag (different color for the player), typewriter at about 55 chars/s. Tap or Enter: first completes the line, then advances. A full-screen transparent catcher div takes the taps. Hide all other controls with one class on the HUD root.

## Gotchas
- Disable frustum culling on skinned meshes or the foreground character disappears.
- Test by calling `talk()` and `advance()` from the debug API, and check the name tag switches for player lines.
