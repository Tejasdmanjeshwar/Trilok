# Trilok v0.4-D7 — Reticle accuracy, proper arrows and persistent anatomical wounds

## Issue and root cause
The browser's deterministic projectile system contains no random hit roll. Previous aiming selected the **front surface** of an invisible camera hit-volume, while the arrow launched ballistically from a different bow position. A mathematically exact surface-edge target can miss the collision sphere because of parallax, rounding or a slightly moving animated proxy. The renderer's arrow mesh was centered on the trajectory, putting the **arrowhead 0.70m beyond the actual collision coordinate** and making misses look like arrows visibly piercing the body. The legacy prototype arrow omitted feather vanes. The critical-hit effect system spawned blood and retained an arrow but no persistent mark at the wound site.

## Implementation
- `CombatHitVolumes.snapshotCameraAim` still resolves the actual camera-selected region. Once a real collider is selected, it moves the ballistic target slightly **inside that same region** using the collider's world radius and a capped inward offset (0.035–0.14 world units). Empty space remains unaided. The defender's collision check remains a true first swept-hit test; damage is never guaranteed by a mere camera selection.
- `ArrowVisual` builds one shared procedural three-feather arrow asset used by both projectile renderers. Head, shaft, nock and fletching are configured independently and remain with the same projectile through interception and embedding.
- The authoritative trajectory follows the **arrow tip**, so render and hit-test coordinates are in agreement. The shaft sits behind the tip along velocity. Embedding places the tip within the body at the actual contact point, not shaft-center aligned.
- `SurfaceMarks` renders small layered, dark-red wound marks on a rig anchor at the precise hit contact. Parent-relative position and normal follow rig motion, independent of blood particles or the lodged arrow. It caps persistent marks and disposes them on restart. Its data-driven mark styles can support future scorch or frost decals, not gameplay status effects.
- The preview precision arrow authors `{id:"wound_mark",when:"critical"}` in the same policy list as blood and embedding. Other moves are unchanged.
- This is an accuracy correction, **not RNG removal**: no random hit selection existed. Repeatability still depends on identical source positions, animation poses, and target movement.

## Testing
Regression tests cover same reticle + bow + rig producing the same hit/contact tick, off-target misses, three fletching vanes, arrow tip alignment to trajectory, wound attachment following an animated parent, mark lifecycle cap, and future mark style registration.

## Limitations / follow-on
The current renderer uses coarse rig-following collision proxies, not precise skinned-mesh surface collision. Procedural idle and target motion can still change the physical outcome. Reaching exact external skin positions and realistic penetration depth with final character assets will require richer skinned-mesh hit queries and improved attachment anchors. Visual device QA is mandatory.
