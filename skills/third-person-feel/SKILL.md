---
name: third-person-feel
description: Tune third-person movement so it feels good: camera-relative steering, snappy on-foot control, a weightier mount, a companion that follows, slope-dependent speed, and restrained shove physics. Use when a player says controls feel sticky, floaty, twitchy or bad.
---

# Third-person feel

## Steering
- Stick or keys give a direction relative to the camera: `want = camYaw - atan2(x, y)`. The character turns to face it; stick magnitude is the throttle. Never use tank controls on touch.
- With forward = `(sin yaw, cos yaw)` and a camera looking along it, screen-right is decreasing yaw.

## On foot: snappy
- Reach full speed in about 0.1 s, stop in under 0.1 s, about-face in under 0.2 s (turn rate about 20 rad/s, no easing).
- The camera must not swing behind the player on foot. Follow position tightly (lerp 16/s), drift yaw only slowly while walking away from the camera, never while walking toward it. Give drag-to-look on the right half and Q/E keys, and pause the drift for 1.5 s after a drag.
- Full stick deflection at about 34 px.

## Mounted: weight
- Lower acceleration, turn rate about 3 to 4 rad/s with eased yaw rate, lean into turns, follow camera at about 2/s, wider FOV at speed.

## Companion that follows
- Target a point beside the player (right 2.3 m), not behind, or it blocks the camera. Speed proportional to distance, capped; idle and align when close. Mount by snapping the player onto it; dismount to its side.

## Slopes
- `grade = (H(ahead) - H(behind)) / distance`; `vmax *= clamp(1 - grade*1.6, 0.65, 1.3)`.

## Physics within reason
- Circles in 2D plus a vertical jump (v 8.4, g 26).
- Loose props: per-prop impulse scale and speed cap (barrel 2.2 m/s, sack 1.4), high damping, a home position with a spring past 4 m and a hard stop at 6.5 m. Large props are static colliders.
- NPCs: small capped knockback (about 0.3 m), brief stun, then walk back to their post. Pairwise separation so they do not overlap.
- Skip prop and NPC collision while the player is above about 0.9 m so jumps clear them.

## Process
- When feedback is vague ("turning feels bad"), change the most likely cause, state the guess, and ask which of turning, speed, camera or stick is still wrong.
- Measure response times in a headless test and report the numbers.
