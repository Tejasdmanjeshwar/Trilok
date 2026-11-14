# Character Studio C4.5 — camera, pose and anatomical inspection

Tracking: Issue #65. Scope: human previews only; in-memory editor state.

## Implementation

- Explicit region Focus uses the current semantic bone world positions and leaves manual orbit/pan/zoom alone until Focus is requested. Double-tap (touch/pen) or double-click (mouse) on the actual rendered skinned surface uses the hit triangle's authoritative rig skin weights to select an anatomical region and frames the touched surface point. Gestures are filtered for time, movement and multi-touch to avoid inadvertent Focus during orbit/pinch.
- A single previous camera snapshot is retained for Return. Front/side/rear/three-quarter camera presets rotate **around the current focused target at the same distance**, including when a previous Focus transition is still in flight; they do not clear Focus or the Return action. Only explicit Return or Reset clears Focus. Reduced-motion mode moves instantly; otherwise the camera uses a bounded eased transition. Manual orbit cancels the transition.
- Existing front/side/rear/three-quarter presets continue to work. Orthographic projection shares the camera target and approximates the current framing; switching back restores perspective. Portrait and close-up views use semantic neck/head/face targets. Body edits never invoke Focus or change camera position.
- Supported poses resolve through the **existing** `AnatomicalPoseMatrix` and `AnatomicalFK` evaluator with the imported MakeHuman rig, forearm/shoulder helper bones, calibrated jaw direction and opt-in `HumanPoseCorrectives`. No duplicate bone rotations, simulation changes or new animations. Rebuilds reapply the selected pose.
- Temporary facial expressions use source MakeHuman expression targets, without writing to the morphology recipe or history. Jaw overlap between mouth-opening expressions and FK follows the existing `coordinateFacialJawPose` contract. Clearing the preview restores the exact recipe values.
- Skeleton, wireframe and joint markers are optional and isolated in the Inspect panel. Owned overlay GPU resources and pose correctives are disposed with each regenerated model. All inspection states are ephemeral and do not affect undo/redo, character persistence or gameplay.
- UI presents only player-facing labels. Touch and keyboard can operate all explicit camera/pose/inspection controls.

## Verification

`tests/character-studio-inspection.test.ts` verifies supported poses, non-destructive expression preview, and focus on real semantic joints. `e2e/studio-inspection.spec.ts` exercises front/side/rear, focus-return, orthographic, jaw/shoulder/knee/finger previews, toggles, body editing and desktop/touch captures. CI Verify covers strict TypeScript, Vitest + deterministic combat replay, and the production build. Desktop/touch rendered review and deployed Cloudflare SHA remain separate acceptance gates.

## Out of scope

C4.6/C4.7 polish/generation; weapon, injury, equipment, Save/Load and baking. The existing FK pose matrix is for preview and deformation inspection, **not** an animation authoring or IK system.
