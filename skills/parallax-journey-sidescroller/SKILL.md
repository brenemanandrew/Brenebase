---
name: parallax-journey-sidescroller
description: Build a slow side-scrolling journey ("Oregon Trail" style) on a 2D canvas: layered parallax landscape that blends between regions, day and night, weather, a gait-animated rider, pace and stamina, landmark stops with story cards, and saved progress. Use for travel sims, trail games or scrolling landscape pieces.
---

# Parallax journey side-scroller

## Canvas setup
- Draw in virtual units: fixed virtual height (620), `ctx.setTransform(dpr*scale,...)` with `scale = innerHeight/620`; virtual width follows the aspect, so portrait phones just see less width.

## Regions
- A list of biomes along the route: `{name, at (league), skyTop, skyBottom, mountain colors, amp, jag, snow, hill, ground, road, foreground, props[], farProps[], particle type, music}`.
- Blend numeric fields with a smoothstep 6 leagues either side of each border. All layers use the blend at the camera, so the whole scene shifts together.

## Layers, back to front
- Sky gradient, stars, sun or moon on an arc, clouds (parallax 0.03)
- Two mountain ridges (0.05, 0.1) with a clipped snow line, hills (0.22), far ground with small props (0.5), road ground with props (1.0), rider, foreground grass (1.5), weather particles.
- Ridge height = `base - amp*(0.5+0.5*noise(x*freq))` minus a ridged term scaled by `jag`. Noise is a sum of three sines: cheap and continuous.
- Fog each layer toward the horizon color by depth; multiply land colors by a time-of-day tint (white by day, warm at dusk, blue at night).

## Props without popping
- Deterministic scatter: hash each grid cell per layer; decide the prop's biome from the camera position at which that prop will be centred, `(wx - W/2)/parallax`. Skip cells near landmarks.

## Rider
- Path-drawn mount and rider: two-segment legs driven by a gait phase (walk, trot, gallop speeds), body bob, tail sway, scarf and ponytail waving with speed, dust puffs at speed.

## Game layer
- Pace buttons (Rest, Walk, Trot, Gallop); gallop drains stamina and drops to walk at zero; resting runs the clock faster and shows a campfire.
- Landmarks at fixed leagues pause the ride and show a card (title, text, Ride on / Rest until morning / enter the place). Random trail notes per biome fade in between.
- Progress bar with landmark ticks; save `{dist, time, day}` to `localStorage` under a versioned key and offer Continue.

## Testing
- Fast-forward by calling `update(1/20)` until each card appears, click through, and screenshot each region. Check all stops fire in order and the ending is reached.
