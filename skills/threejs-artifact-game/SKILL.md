---
name: threejs-artifact-game
description: Build and ship a playable Three.js game as a Claude artifact (single HTML page plus optional data files), and test it headlessly. Use when asked for a browser game prototype, 3D scene or interactive toy delivered as an artifact link.
---

# Three.js game as a Claude artifact

## Page rules that bite
- One HTML file. Scripts only from cdnjs, jsdelivr (npm), unpkg. No remote images, no fetch to other hosts.
- Use the UMD build: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`. Extras (GLTFLoader, SkeletonUtils, Reflector) come from `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/...`.
- Big data goes in a sibling `.js` file that sets a global (`window.KK={...}` with base64 inside). Publish it with `publish_files` next to `index.html` and load it lazily with an injected `<script src="models.js">`. `.js` is always served; do not rely on `.glb` or `.bin` extensions.
- Size html/body with `height:100%`, not `100vh`. Audio, fullscreen and clipboard only from a click handler. `localStorage` in try/catch.
- r128 facts: `MeshLambertMaterial` has no `flatShading`; skinned materials need `skinning:true`; default output is linear, so leave texture `encoding` at Linear to keep authored colors.

## Structure
- One IIFE. State objects, `update(dt)`, `draw/render`, one `requestAnimationFrame` loop with `dt=min(.05,...)`.
- Expose a debug handle: `window.__game={state, step:update, ...}` plus a `noRender` flag. Tests drive the game by calling `step(1/30)` in a loop instead of waiting on real time.
- Touch and keyboard both: floating thumb stick on the left half (pointer events, `setPointerCapture`), round buttons on the right, WASD and keys.
- Always keep a fallback path (simple shapes) if an optional asset or script fails to load.

## Headless test recipe (Playwright is preinstalled)
```js
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
await p.route('**/three.min.js',r=>r.fulfill({body:fs.readFileSync(local),contentType:'application/javascript'}));
p.on('pageerror',e=>errs.push(e.message));
await p.evaluate(()=>{const g=window.__game;g.noRender=true;for(let i=0;i<600;i++)g.step(1/30);g.noRender=false});
await p.screenshot({path:'shot.png'});
```
- Software rendering is slow: never render every physics step in a test, keep each run under about 2 minutes, one town or level per run, smaller viewport for heavy scenes.
- Measure feel with numbers (ms to full speed, turn time, distance shoved) and report them.
- An autopilot input (`api.auto=[steer,throttle]`) lets a test play the whole game end to end.

## Reporting
Say what was run headlessly, what was only seen in one screenshot, and what was never tested (real phone, frame rate, touch).
