---
name: cel-shaded-outdoor-scene
description: Give a Three.js outdoor scene a vibrant cel-shaded look: toon ramps, cast shadows, wind-blown instanced grass that parts around the player, reflective toon water, wind on trees and flags, drifting motes, and rolling terrain that everything follows. Use for a "beauty pass" on a low-poly 3D scene.
---

# Cel-shaded outdoor scene (three r128)

## Toon base
- One 4-step gradient `DataTexture` (NearestFilter), e.g. 112,176,228,255. `MeshToonMaterial({gradientMap, map, color, skinning})` for everything.
- Shadows: `renderer.shadowMap.enabled`, `PCFShadowMap`, one directional light, ortho box about 46 m that follows the player (`sun.position = player + dir*200`, target = player), map 2048 (1024 on touch devices). Ground and flat decals receive only.
- Keep light sums under 1 for bright colors (hemisphere about 0.45, sun about 0.65) or pale ground clips to white.
- Boost saturation of sky, ground and road colors in HSL (x1.15 to x1.35). Add a sun disc and fog-less cloud blobs.
- Every point light costs all fragments: three is fine, six with shadows is too heavy.

## Grass
- One `InstancedMesh` of tufts (6 curved blades, 3 triangles each, normals straight up, vertex color ramp dark root to light tip). 86 x 86 instances recycled on a 1.05 m grid around the player; recompute matrices only when the player crosses a cell. Position by hashing the world cell so tufts are stable.
- A 1 m mask grid built once (street, square, water, colliders) hides tufts.
- Replace `#include <project_vertex>` so wind is applied in world space after `instanceMatrix`: two sine gusts scaled by `position.y^2`, plus a push away from `uP` (player position) within 1.5 m that also flattens the blade.
- `instanceColor` lerps between two biome greens; about 4 percent become flower colors.

## Water
- `THREE.Reflector` with a custom shader (needs uniforms `color`, `tDiffuse`, `textureMatrix`). Fragment: ripple-offset `texture2DProj`, posterize the reflection, mix with a banded shallow-to-deep color by distance from shore, add `step()` glint streaks and two or three moving foam lines, then manual fog.
- Hide grass and particles inside `onBeforeRender` of the reflector. Dispose its render target on scene change. Fall back to the same shader with a 1 px sky texture if the script fails.

## Wind everywhere
- One gust value (`0.75 + sines`) drives grass, a tree material (`onBeforeCompile`, sway by local height squared, phase from `modelMatrix[3]`), flag and banner rotation, cloud drift and a `Points` cloud of motes wrapped around the player.

## Terrain
- A single height function `TH(x,z)`: road profile along x, rolling noise scaled by distance from the road, flat square, far rise, beach lerp to water level. Warp a plane grid (`x = 700*(.25u+.75u^3)`) so cells are 2 m near the centre.
- Then make everything call it: `put()` for props, characters, shadows, grass matrices, decals (subdivide and drape the road), camera height, speech balloons, markers. Piers and stilt houses stay at water level.
