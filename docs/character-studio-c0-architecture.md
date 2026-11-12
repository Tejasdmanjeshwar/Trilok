# C0 ADR — Character Studio architecture, anatomy contracts and feasibility

**Status:** C0 specification for review; no character generator, asset adoption, runtime change or new combat behavior in this PR.  
**Baseline audited:** main `cc4203a5c585da3e4500d35c50f713b34cd516c4` (D14 + merged planning PR #10).  
**Related:** [C0–C9 roadmap](character-studio-roadmap.md), [C0 handoff](character-studio-c0-handoff.md), [architecture](architecture.md), [D14](combat-v0.4D14-boss-phases.md), [build verification](build-verification.md).

## 1. Evidence from the current implementation

| Source | Observed contract | C0 implication |
| --- | --- | --- |
| `apps/web/src/actors/warrior.ts` | `createWarrior("archer" \| "rakshasa")` builds independent Cylinder/Sphere/Box/Cone meshes under named `Torso`, `LeftArm`, `RightArm`, `LeftLeg`, `RightLeg` groups. Rakshasa `body.scale.setScalar(1.21)`; characters face target by rotating root about Y. Bow/sword attach at hand-approximation group offsets. | No continuous body, skin weights, Skeleton, anatomy mesh, true hands/fingers, retargetable hierarchy, or safe sever geometry. The scaling is a **legacy-only approximation**, not a new rig rule. |
| `apps/web/src/actors/AnimatedWarrior.ts` | Public `root/play/update/socketWorld/face/equip/setLocomotion/dispose` contract. AnimationMixer quaternion tracks address `LeftArm`, `RightArm`, `Torso`; legs have procedural gait. `socketWorld` returns the selected arm's fixed local offset `(0,-.78,.28)`. `Motion` includes D8–D14 rapid/heavy/flurry/feint/delayed and reactions. | Maintain this facade and animation timing; translate semantic roles to instance-specific bones and sockets inside an adapter, not by renaming combat-domain regions. |
| `apps/web/src/combat/CombatHitVolumes.ts` | Sphere proxies on layer 13 parented to named groups, with `head/neck/torso/left_arm/right_arm/left_leg/right_leg/body/horn/tail` fallback anchors. First trajectory contact uses swept samples at ≤12-tick intervals and returns `actualRegionId`, point, normal, contact tick, velocity and parent attachment; no surface triangle anchor. | Keep selection, inset, first contact, melee reach and deterministic collision behavior unchanged until a gated replacement. Existing fallback `Torso` for unknown regions must become explicit metadata for new rigs, not silent aim drift. |
| `packages/combat/src/encounter-types.ts`, `encounter-damage.ts` | `AnatomySpec` and `TargetRegionSpec` use catalog-owned string IDs; actor `anatomyId`, `regionExposure` and armor coverage determine damage. `DamageBreakdown` has intended/actual region, critical, resolved damage. | Do not rename region IDs or add gameplay capabilities to C0. A separate versioned mapping from anatomy segment instance → existing catalog region IDs is needed. |
| `apps/web/src/effects/ProjectileClashEffects.ts`, `ArrowWoundLifetime.ts` | Two pooled flight identities; `embed` re-parents the **original arrow mesh** with `Object3D.attach`, preserves owner and turn expiry; at most 16 lodged arrows. Minor/deep expire after 2/3 turns; severe persists to reset. | An injury bridge must retain original projectile IDs and lifetime when a segment detaches, and avoid cloning arrows. Need stable skinned-surface anchors rather than only parent transform. |
| `apps/web/src/effects/SurfaceMarks.ts` | Circles with bounded max 12 are attached to proxy parent groups using world-contact point/normal; no skinned triangle coordinates, morph update or texture-space deformation. | Introduce skinned-surface barycentric attachment **later**, with fallback to current group attachment until parity proven. |
| `apps/web/src/combat/sequences.ts`, `attack-presentation.ts`, `packages/choreography/src/index.ts` | Timestamped cues and immutable combat attack specs; `presentationForAttack` throws if any impact cue differs from authoritative hit offsets; D14 phase transitions sit outside pending attacks. | Keep move impact offsets, multiple hit cues, defensive windows, core AI and boss phase progression immutable during rig migration. |
| `apps/web/src/main.ts` | ~1,580-line single combat/browser bootstrap directly creates both actors, hit volumes, effects and DOM/UI; no router or Studio route exists. `apps/web/index.html` and Vite use one app entry. | Introduce route detection / lazy import without loading combat scene for `/studio`; do not put procedural modeling or editor state into `main.ts`. |
| `package.json`, `.github/workflows/ci.yml`, `e2e/combat.spec.ts` | pnpm 10.20, TS 5.8, Three 0.180, Vite 6, Vitest 3, Playwright Chromium; Verify workflow runs install, typecheck, tests (including 1,000-seed replay), build, Chromium desktop/mobile, build-ID check. | C0 can remain docs-only. No executable contract or dependency introduced; run the **existing** full CI on this PR. Browser screenshots/pose-quality profiling cannot be inferred from CI. |

**Audit constraints:** existing `body.scale` and proxy offsets are authored for the placeholder, not global specifications. Existing visual `root` coordinates and projectile trajectories must remain stable during the C1 adapter. Different historical presentation clock and domain clock units must not be conflated.

## 2. Canonical space, skeleton and naming — decision ADR-C0-01

- **World and authored rest space:** right-handed Three.js system, `+Y` up, `+Z` local character forward, `+X` character right; meters; **1 unit = 1 meter**. The current left arm is at negative X, right arm at positive X. Quaternion `[x,y,z,w]`, normalized. External source import must use a deliberate conversion transform once during ingest, not runtime global scaling.
- **Root transform:** entity root at floor-center ground projection; `motion_root` is the sole gameplay-provided translation/yaw, `pelvis` is an anatomical child whose motion is pose-only. Root-motion proposals never move a combat actor independently; render pose tracks authority/locomotion.
- **Reference body:** provisional baseline **1.75 m** neutral upright height, feet on `y=0`, with explicit anatomical landmarks derived from template, not hardcoded offsets. A **relaxed A-pose** (palms oriented to thighs, ~35° arm abduction) is canonical bind pose, zero local rest rotation relative to a stored joint basis; left/right mirrored in X. T-pose is a *diagnostic pose*, never an implicit bind. Reference measurements are **provisional bounds**, not medically validated assets.
- **Transforms:** `bindLocal` = typed finite TRS plus normalized quaternion for each joint; compose parent-before-child to `bindWorld`, and `inverseBindMatrix = inverse(bindWorld)` in mesh bind space (accounting for skinned mesh bind transform). Require invertible nonzero-scale transforms; **joint scale is (1,1,1)** in exported skeleton, body proportions are baked into landmark positions/geometry and bone lengths. Do not permanently scale character root or Skeleton after binding. Define GLB coordinate conversion and handedness in metadata.
- **Joint IDs:** stable semantic joint role + unique segment path + per-extension instance, **never** the Three Object3D display name. ASCII path grammar `root/<module>[<instance>]/<role>`, e.g. `root/humanoid[0]/spine/chest`, `root/humanoid[0]/arm[left,0]/elbow`, `root/humanoid[0]/arm[right,1]/wrist`, `root/wing[left,0]/carpal`; roles use snake_case. ID generation deterministic from module and indices, not random UUID ordering. Actual Three bone.name may be generated from unique IDs; diagnostic display names are separate. IDs cannot be reused across detached/replaced segments in an injury save.
- **Minimum semantic foundation (role classes, not required exact joint count):** motion root → pelvis → lower/mid/upper spine → neck → head → jaw/eyes (optional by topology family); left/right clavicle → shoulder → upper-arm twist (optional) → elbow → forearm twist (optional) → wrist → palm → thumb + four finger chains as capability permits; left/right hip → knee → ankle → ball/foot → toe. Twist joints must not be treated as separate combat regions; virtual control joints are marked `exported:false`.
- **Limits:** author rest joint axis/basis and per-DOF limit constraints in local joint space; retarget from semantic roles and rest-frame alignment, never from ordinal bone indices. Positive/negative mirrored joint axes and handedness validated under both arm sides.

## 3. Extensible anatomical graph — ADR-C0-02

Data graph (pure TS; a scene graph is an **output**, not the authoritative graph):

```ts
type SegmentId = string; type JointId = string; type ModuleId = string;
type RegionId = string; // existing combat catalog ID, not a segment ID
type AnatomyModuleKind = 'humanoid'|'extra_arm'|'extra_leg'|'head'|'tail'|'wing';
interface AnatomyModule {
  readonly id: ModuleId; readonly kind: AnatomyModuleKind;
  readonly attachedToSegment: SegmentId | null;
  readonly segmentIds: readonly SegmentId[];
  readonly jointIds: readonly JointId[];
}
interface AnatomySegment {
  readonly id: SegmentId; readonly parentId: SegmentId | null;
  readonly moduleId: ModuleId; readonly proximalJointId: JointId;
  readonly distalJointIds: readonly JointId[];
  readonly combatRegionIds: readonly RegionId[];
  readonly capabilityIds: readonly string[];
  readonly severZoneIds: readonly string[];
}
interface AnatomicalGraphV1 {
  readonly schemaVersion: 1; readonly modules: readonly AnatomyModule[];
  readonly segments: readonly AnatomySegment[];
  readonly joints: readonly SemanticJointV1[];
  readonly sockets: readonly SemanticSocketV1[];
}
```

**Invariants:** exact one structural root; all IDs unique within each namespace, resolvable references, no cycles, no multi-parent segments, deterministic traversal sorted by canonical module order then path, explicit mirrored side and ordinal index; all combat regions known to selected catalog; segment ownership unambiguous; every socket declares a segment/joint owner. `head[0]` is not assumed sole head. A multi-head humanoid can own `head[0]`, `head[1]` independently; a winged humanoid retains humanoid arms and legs.

**Example extensions:** `root/head[1]/neck`, `root/arm[left,1]/shoulder`, `root/leg[right,1]/hip`; `root/wing[left,0]/scapula → humerus → radius_ulna → carpal → digit_1..n` plus independently controlled feather spread joints as LOD permits. Jatayu is **avian-headed humanoid with both arms and independent paired wings**. Rakshasa horn and Vanara tail are optional separate segments; animal-headed family replaces head *topology*, not the shared neck and combat contract. Extensions may use authored attachment points with extra skeleton joints; no fixed two-arm/two-leg/one-head array dimensions in public APIs.

**Capabilities:** data-defined `grip_left[0]`, `grip_right[1]`, `bow_draw`, `bipedal_step`, `wing_flap[left,0]`, `look[head,1]` derived from valid joints and *present* segment state. Static recipe capabilities and runtime remaining capabilities are separate; a missing segment disables presentation sockets and collision proxies immediately, but **gameplay consequences remain disabled until reviewed C8 domain rules**.

**Combat mapping:** one or more physical segments can map to one catalog `regionId` (e.g. an extra arm may map to `left_arm` in a legacy encounter) only via explicit versioned, tested map. Never silently generate an `AnatomySpec` region or alter armor/crit semantics; future archetype catalogs may add dedicated regions in their own combat PR.

## 4. Geometry without external sculpting — ADR-C0-03

**Decision:** first evaluate a **pre-licensed, continuous indexed neutral human topology bundled as source data** (not an editor/tool). A credible base needs loop flow around shoulders/axillae, elbow/knee flexures, pelvis/groin, neck, face, hands/fingers, joints, UV seams, reliable landmarks, and license/provenance. A single primitive or skin-wrapped capsules/voxel marching-cubes mesh is **not acceptable as production character geometry**.

If no legally and technically suitable base can be obtained, implement a **fully automated parametrically generated subdivision/cage surface**: anatomy-informed cross-section loops and elliptical/Bezier cross-sections blended through shoulder/hip junctions; deterministic remeshing and UV atlas generation; append watertight finger/face topology families; add procedural muscle/fat/face deformation fields guided by skeletal landmarks. Explicitly treat this as **high-risk C2 research**: making watertight junctions and quality loops is difficult; no quality claims until UV, skinning, deformation and screenshot gates pass. Anatomical credibility cannot be guaranteed by algorithm alone. A generated *guide cage* may help construct a seamless mesh but must not be shipped as the final visible shape without validation.

**Template acquisition gate:** before source data is committed, record creator, original upstream URL, actual license at asset level, redistribution/modification permissions, attribution requirements, checksum, coordinate conventions, topology/UV vertex order, bone/morph data, file size, authoring modifications, and restrictions on embedded textures. Verify provenance directly (do not infer CC0 from project name, GitHub repository code license or third-party mirrors). Reject missing provenance, nonredistributable content, unclear genital/face licensing, incompatible topology, or excessive weight. **No asset is approved or included at C0.**

**Topology families:** `humanoid_biped_v1`, `humanoid_multi_shoulder_v1`, `head_human_v1`, `head_primate_v1`, `head_avian_v1`, `head_custom_mammal_v1`, `wing_feathered_v1`; stable index and UV layout *within* family, modular attachment seam pairing across families (with normals and tangent continuity). An animal head with incompatible vertex layout is a separately stitched module, not a morph target of the human head. Branching morphs from two to four arms changes topology family; not legal via continuous blendshape alone.

**Authoritative shape recipe:** bounded dimensionless parameters and calibrated landmark measurements (height, shoulder width, chest depth, waist/hip circumference, torso-to-leg ratio, musculature, adiposity, asymmetry, jaw/brow/nose/eyes where relevant). Validate per-family intervals and correlated constraints rather than independently extrapolating each slider. Author in bind space; evaluate template base → coupled bone-length/landmark offsets → compatible primary morphs → corrective morphs (pose/shape-driven) → skinning → normal/tangent refresh and proxy/socket recalibration. Morph deltas must match vertex ordering exactly and remain finite; control parameters must not permit negative bone lengths or implausible joint inversion.

**Skinning:** indexed BufferGeometry, deterministic triangulation/UVs, normalized 4-weights per vertex at baseline glTF compatibility (joint indices integer in range, positive influence total, normalized to tolerance); define fallback for influence pruning and retesting. Pose-space correctives for shoulder elevation, forearm pronation, elbow/knee flexion and hip abduction; seam normal/tangent validation, no contradictory skin transforms at sever boundaries. Additional influences and dual quaternion skinning are future performance/compatibility decisions, not C0 assumptions.

## 5. Libraries and asset candidates — ADR-C0-04

**These are research decisions, not dependency installations.** Version/license and compatibility must be rechecked against exact released artifact and current security audit in C2/C9. No candidate is evidence that complete anatomical modeling is solved.

| Candidate | License / primary reference | Fit | Cost, limitation, decision |
| --- | --- | --- | --- |
| Three.js `SkinnedMesh`, `Skeleton`, `Bone`, morph targets | MIT, https://github.com/mrdoob/three.js | **Adopt existing dependency** as core skinned runtime | Provides rendering, not source anatomy, automatic weights, anatomically correct morphs or injury surfaces. Test WebGL2 texture/joint limits and skinning on mobile. |
| Three.js `GLTFExporter` / `GLTFLoader` | MIT (Three examples) | **Use during C9 prototype** for browser GLB roundtrip | Verify supported morph, skinning, animation and metadata export; custom Trilok sidecar mandatory. GLB export is not itself validation. |
| `three-mesh-bvh` | MIT, https://github.com/gkjohnson/three-mesh-bvh | **Conditional later**, for accelerated static/updated geometry queries | BVH rebuild/refit and skinned deformation need explicit measured strategy. Existing sphere proxies cheaper in D14; do not swap current contact resolver. |
| `@gltf-transform/core` and functions | MIT, https://github.com/donmccurdy/glTF-Transform | **Evaluate C9 offline-in-browser optimization** | Adds bundle/worker size and platform/codec support concerns; topology-changing compression requires exact segment/anchor ID metadata remap. |
| `manifold-3d` WASM | Apache-2.0, https://github.com/elalish/manifold | **Research only for controlled offline mesh operations** | Boolean topology does **not** preserve rig weights, morph vertex correspondence, animation or UV/segment ownership automatically; WASM memory/startup cost. Not runtime dismemberment solution. |
| Khronos `glTF-Validator` | Apache-2.0, https://github.com/KhronosGroup/glTF-Validator | **Evaluate for C9 browser bake validation** | GLB conformance catches container/accessor issues, not anatomy quality, socket semantics or injury invariants. WASM/runtime cost must be measured. |
| `humanoid-kit` (name in handoff) | **Unverified package identity, version, maintainer and asset-license provenance** | **Do not depend or adopt** until repository, license and capabilities verified | A humanoid utilities package is not proof of topology, facial rigs or CC0 art; avoid speculative dependency. |
| MakeHuman/MPFB-related human meshes | Project and asset licenses vary; https://www.makehumancommunity.org/ | **Candidate asset provenance audit only** | Do not infer CC0: source topology, outputs, texture/target licenses and derivatives may differ; source license/redistribution evidence needed. External app is not part of workflow. |
| MB-Lab / assorted marketplace “base human” | Varying code/asset licenses and unclear source provenance | **Reject absent direct asset-specific evidence** | GitHub source license is not sufficient for bundled anatomy; never use community uploads without a verified redistribution chain. |

**No human base-template source has yet cleared the legal, anatomical, or visual validation gates.** Three's renderer and a glTF serializer cannot substitute for vetted anatomical geometry.

## 6. Segment severing, marks and persistent injury — ADR-C0-05

```ts
interface SeverZoneV1 {
  readonly id: string; readonly segmentId: string;
  readonly seamLoopId: string; readonly capAssetId: string;
  readonly childSide: 'distal'; readonly allowed: boolean;
}
interface SurfaceAnchorV1 {
  readonly topologyFamilyId: string; readonly topologyHash: string;
  readonly segmentId: string; readonly triangleId: number;
  readonly barycentric: readonly [number,number,number];
  readonly tangentRotation: readonly [number,number,number,number];
}
interface AttachedInjuryV1 {
  readonly id: string; readonly ownerActorId: string;
  readonly segmentId: string; readonly kind: 'mark'|'projectile';
  readonly surface: SurfaceAnchorV1;
  readonly originalProjectileId?: string;
  readonly expiresAtTurn?: number|null;
}
interface CharacterInjuryStateV1 {
  readonly schemaVersion: 1; readonly characterInstanceId: string;
  readonly missingSegmentIds: readonly string[];
  readonly severEvents: readonly {id:string;zoneId:string;turn:number}[];
  readonly disfigurement: Readonly<Record<string,number>>;
  readonly attachments: readonly AttachedInjuryV1[];
}
```

**Prevalidated seams only:** cap topology/material is generated and tested at bake time, aligned to a specific vertex loop in neutral/rest state; every sever boundary is associated with an owned segment and clean dependency subtree (e.g. wrist detaches hand and carried equipment; wing root detaches feathers; neck detaches head). Simulate pose before detaching, compute posed world transforms and boundary cap normals, then transfer the exact child segment graph and original projectile meshes to an independent detached runtime entity. Parent body receives its matching cap; cut state can hide/replace geometry in the remaining skinned component without broken skin indices or visible cracks. Destructive geometry slicing at arbitrary world planes is out of scope. Materials/geometry refcounting prevents double disposal when two detached pieces share buffers.

**Anchor lifecycle:** Barycentric anchor is resolved from stable triangle vertex IDs **after skinning and morphing** each frame (or at bounded update rate); normal/tangent frame follows the deformed surface. If LOD remaps indices, bake an explicit per-LOD anchor mapping, never silently reuse a triangle index. Persistent arrow depth/orientation uses original velocity at contact while adapting to surface pose; arrow identity, owner, 2/3-turn/encounter duration and max 16 lodged visual cap remain unchanged until C8. Surface marks retain their existing cap of 12 until deliberate policy change. On detach, reparent attachments to segment owner; if invalid anchor, report an explicit diagnostic/fallback, do not lose history invisibly.

**Authority:** C8 domain events specify actual severing and capabilities. The renderer may preview cuts in Studio but may not mutate HP, armor, melee legality, defensive timing, AI, boss phase or projectile outcomes. Add `missingSegmentIds` as explicit runtime state; never mutate the immutable original baked asset/recipe. Injuries and baked geometry use versioned migration/validation, not unsafe string substitutions.

## 7. Socket, animation, retarget and IK contract — ADR-C0-06

```ts
interface SemanticJointV1 {
  readonly id: JointId; readonly parentId: JointId|null;
  readonly segmentId: SegmentId; readonly role: string;
  readonly bindTranslation: readonly [number,number,number];
  readonly bindQuaternion: readonly [number,number,number,number];
  readonly exported: boolean;
}
interface SemanticSocketV1 {
  readonly id: string; readonly ownerSegmentId: SegmentId;
  readonly parentJointId: JointId; readonly purpose:
    'primary_grip'|'secondary_grip'|'shield'|'bow_nock'|'bow_string'|
    'projectile_origin'|'back'|'hip'|'effect'|'ik_target';
  readonly localTranslation: readonly [number,number,number];
  readonly localQuaternion: readonly [number,number,number,number];
  readonly requiredCapabilityIds: readonly string[];
}
interface PoseRequestV1 {
  readonly motionId: string; readonly elapsedTicks: number;
  readonly actionId?: string; readonly lookTargetWorld?: readonly [number,number,number];
}
```

Runtime skeleton implements role lookup `findJoints(role, moduleSelector)`, socket lookup `resolveSocket(id)`, `capabilities()` and explicit disposal. Animations operate on **semantic joint targets and calibrated phases**, not `LeftArm` object-name binding or fixed bone ordinal. Root-motion is requested from authority, never inferred from animation. Pose space combines base authored clip, normalized semantic retarget, masked procedural layers, foot/hand IK and pose-correctives in a documented deterministic order. IK takes target transforms from gameplay/weapon constraints; per-character limb lengths and joint limits drive solver. Missing grip capability prevents visual attachment; C8 separately resolves gameplay action legality.

Sockets: left/right/extra-arm primary grip, bow-grip, offhand arrow nock/string draw, secondary two-handed grip, shield, hip/back equipment and VFX origins use full rigid transform; dual-hand solves must converge without hand drift, impossible reach or mesh clipping. Hand/finger meshes and grip presets validated against bows and swords; dual-wield or many-armed grips select explicit capability/instance. An `AnimatedWarrior` facade adapter maps current `Motion` to semantic clips, keeps `socketWorld` single primary projectile point matching D14, and forwards equip/face/update/dispose while old placeholder remains the default behind feature flag. No adapter reaches into `@trilok/combat` to change attack results.

## 8. Versioned recipes and deterministic build — ADR-C0-07

```ts
interface CharacterRecipeV1 {
  readonly schemaVersion: 1; readonly generatorVersion: string;
  readonly seed: number; readonly archetypeId: string;
  readonly topologyFamilyId: string;
  readonly modules: readonly {id:string;familyId:string;attachTo:string|null}[];
  readonly parameters: Readonly<Record<string,number>>;
  readonly materialPresetIds: readonly string[];
}
interface BakedCharacterManifestV1 {
  readonly schemaVersion: 1; readonly recipeHash: string;
  readonly generatorVersion: string; readonly assetHash: string;
  readonly topologyFamilyId: string; readonly coordinateSystem: 'trilok-y-up-z-forward-meters';
  readonly anatomyGraphHash: string; readonly skeletonHash: string;
  readonly socketIds: readonly string[]; readonly severZoneIds: readonly string[];
  readonly regionMappingVersion: string;
}
```

**Regeneration:** canonical validate → reject unknown fields/incompatible topology → numeric quantization strategy documented per generator → stable lexicographic key ordering and canonical JSON → deterministic hash (include generator + template content hashes + parameter schema) → seeded PRNG without `Math.random` → CPU geometry and skeleton. Same recipe and versions must yield bit-identical canonical buffers on same supported implementation; cross-engine floating-point difference tolerance and deterministic quantization validated before promising cross-browser byte-identical GLB. A changed template/algorithm demands generator-version bump; migrate recipes explicitly, retaining old generator or an authored migration with golden tests. Runtime injury state references instance and base-asset hash but is **not baked into the pristine recipe**.

**Export:** immutable recipe snapshot → generator worker (when supported) → validated skinned geometry/morph/weights/skeleton/UVs/caps/rig/collision sockets → LOD/lightweight materials → `GLTFExporter` GLB + versioned `.trilok-character.json` sidecar (combat mapping, sever topology, recipe, hash, anchors, capabilities). Import GLB and sidecar with schema validation and checksum, rebind skeleton and sockets, then compare hierarchy, bounds, morph counts, normal/weight tolerances and representative animation poses. GLB alone is not a full portable gameplay-character save. Reject invalid or stale bake before offering game-ready export.

## 9. Application modules, route and ownership — ADR-C0-08

**Stage packages only as required by phase; no empty packages in C0.**

| Phase | Proposed module | Ownership |
| --- | --- | --- |
| C1 | `packages/character-core/src/{ids,schemas,validate,humanoid,migrate}.ts` | Pure TS versioned character graph, recipes, sockets, deterministic IDs and validators; no DOM/Three imports |
| C1 | `apps/web/src/characters/runtime/{CharacterInstance,semantic-lookup}.ts` | Three runtime representation and resource disposal; no combat simulation |
| C1 adapter only | `apps/web/src/characters/combat/LegacyWarriorAdapter.ts` | Existing `AnimatedWarrior` API remains unchanged and default renderer unchanged |
| C2–C3 | `packages/character-geometry/src/{template,shaping,weights,landmarks}.ts` | Template import/geometry generation/morphs/correctives, only after proven asset/cage plan |
| C4 | `apps/web/src/studio/{entry,state,preview,workers,ui}.ts` | Lazy Studio route, accessible controls, preview, undo/redo, generation lifecycle |
| C5–C8 | `apps/web/src/characters/{animation,combat,injuries}.ts` | Retarget/IK and visual combat bridge. Domain changes require separate reviewed combat PR |
| C9 | `apps/web/src/characters/baking/{validate,export,import}.ts` | GLB + sidecar and roundtrip validation |

**Routing:** use an explicit small entry dispatcher in a future dedicated PR: `location.pathname === '/studio'` dynamically imports `./studio/entry`; other supported paths dynamically import current combat entry. Vite/Cloudflare SPA fallback must be tested by direct reload of `/studio` and browser Back/Forward. Studio must not construct an EncounterSession, CombatHitVolumes, opponent AI, camera director, or preload combat effects. Reuse the same `CharacterInstance` constructor/runtime in Studio and battle; no duplicate “editor-only rig”.

**Editor:** immutable recipe commits, command-diff undo/redo with bounded history, stable explicit seed, field validation, progressive live preview. Debounce and allocate monotonically increasing generation request ID; terminate/cancel worker tasks if safe, otherwise discard late responses; only latest valid result swaps into scene. Dispose old geometries/materials/texture/mixers/render targets and release worker buffers; preserve last valid preview on error. Support mobile, touch, keyboard, labels, reduced motion, zoom/orbit/orthographic views, diagnostics, material and skeleton overlays. Worker generation uses transferables and must not use WebGL/Three renderer off main thread unless separately proved compatible.

## 10. Migration boundaries and parity matrix — ADR-C0-09

1. **C1:** introduce pure schemas and a separately tested semantic runtime instance; keep `createAnimatedWarrior` default source and D14 call sites unchanged. Legacy adapter constructed in unit test only; no combat routing changes.
2. **C2/C3:** implement and profile standalone skinned humanoid and morphs; inspect poses/screenshots before integration. Preserve actor world origin/forward, approximate projectile reach and actor bounding dimensions, and all combat IDs.
3. **C4/C5:** build Studio and validated sockets; add opt-in feature flag to render *same runtime instance* in preview and in a combat parity fixture. No combat damage integration.
4. **C6–C7:** animation retarget and variants under flag; compare all D14 hit cue offsets, defensive windows, face/locomotion, socket origins and both weapon grips.
5. **C8:** one audited proxy-surface region at a time, keeping old `CombatHitVolumes` behavior as regression oracle; require deterministic contact/miss/normal/time equality or explicitly reviewed allowed geometric variance. Move wound anchors and actual severing only with explicit domain rules + replay changes.
6. **C9:** export/import and perf hardening; only remove legacy branches after all parity checks and a stable staged rollout.

**Nonregression fixtures:** D7 repeated exact aim with spatial miss outside proxy; D8 free rapid and one switch; D9 2/3/encounter arrow persistence + 16 cap; D10 first enemy melee and runtime watchdog; D11/D12 cue alignment and hit-stop isolation; D13 two-hit + feint windows; D14 thresholds and phase postponement. Do not modify `packages/combat`, `packages/combat-ai`, `main.ts`, or battle assets in C0. **New hit-volume tests must compare explicit intended/actual region and collision point; never force a hit because a rendered mesh overlaps the cursor.**

## 11. Budgets, validation and visual gates — ADR-C0-10

**Planning targets only, not measured:** standard humanoid desktop 30–60k tris at hero LOD0 and 80–140 weighted joints, mobile 10–25k visible tris and 60–100 joints at selected LOD; limit to 4 influences/vertex until profiled. 2K desktop/1K mobile typical compressed texture set; investigate 60 FPS desktop and 30 FPS midrange mobile battle targets. Winged, multi-armed and multi-headed characters have *separate* sum-of-parts budgets: do not force them through human LOD counts; target draw calls, GPU skinning time, memory and context-loss recovery via **measured** device traces before thresholds become release requirements. C1 goal is low-overhead metadata validation and no shipped additional web bundle except tests.

**Automated:** unique IDs, no cycles, parent ownership, normalized finite quaternions, invertible bind matrices, stable skinned-space inverses, every socket owner/capability, no phantom sever zones, deterministic seed/hash, max cardinalities, malformed recipe rejection, semantically equivalent humanoid/extra-arm/wing/head variant graphs, JSON roundtrip/migrations, no mutation of inputs. C2+: zero-degenerate triangles, watertight cut seam, normals/UV/tangent finite, skin weights sum ≈1, max 4 influences and valid bones, memory leak test after many regenerations, stable anchor IDs through LOD, same poses across export/import.

**Rendered visual gate (must be captured and reviewed, not asserted):** A-pose, T-pose, arms overhead, shoulder 90° elevation, forearm 180° pronation, elbow 135° flexion, deep crouch, maximal safe hip abduction, neck look up/down, asymmetrical face shape, two-hand bow draw/string arrow release, sword swing/grip, wing fully spread and folded, 4-arm overlap, custom-head neck seam, wrist/shoulder/head/wing detach with capped geometry, arrows and scars following severe deformation. Compare neutral vs extreme parameter grids under studio lighting presets. Check shoulder skin collapse, elbow candy-wrapper, groin tearing, finger distortion, bone pivot drift, surface mark swimming, equipment intersection and clipping. Reduced-motion and touch navigation tested independently.

**CI:** `pnpm typecheck`, `pnpm test` including 1,000-seed `combat-replay`, `pnpm build`, `pnpm test:e2e` on Chromium desktop/touch and emitted build manifest identity. On C0 docs-only PR, these run on GitHub Actions; no claim of local execution if local checkout absent. Later C2/C4 add screenshots and fixture comparisons but do not confuse them with manual visual acceptance. Preserve every D14 test; build-ID and deployment SHA are separate checks. Inspect `/build-info.json` after a release only; Cloudflare preview success is not proof production URL updated.

**Risk register:** (high) quality/provenance of continuous topology → legal audit + deformation spike before asset inclusion; (high) shoulder/groin joint topology with arbitrary module counts → topology-family constraints and authored attachment loops; (high) skinned surface anchors and LOD remaps → stable triangle hashes, remap validation; (high) caps/severing with morphs → prevalidated loops/caps and world-pose fixture; (high) D14 spatial hit parity → feature-flagged region-by-region replay fixtures; (medium) workers/WASM/GLB mobile memory → generation cancellation and device profiling; (medium) extra wings/head performance → per-archetype LOD budgets; (medium) license risk → source provenance registry, reject unverified input. Each high risk is a hard gate, not a future polish wish.

## 12. C1 implementation plan — separate PR, smallest slice

**Goal:** canonical metadata + deterministic validation + test-only legacy compatibility bridge; **no human mesh, no /studio page, no live combat actor replacement.** Proposed exact additions:

1. `packages/character-core/package.json`, `src/index.ts`, `src/schema.ts`, `src/ids.ts`, `src/validate.ts`, `src/presets.ts`: publish readonly `AnatomicalGraphV1`, `SemanticJointV1`, `SemanticSocketV1`, `CharacterRecipeV1` and inventory/missing-segment metadata. Export canonical humanoid skeleton descriptor with two arms/two legs/one head and separate extra-arm + Jatayu-wing graph fixtures; no Three dependency.
2. `apps/web/src/characters/runtime/SemanticCharacter.ts`: a small wrapper exposing joint/socket lookups, semantic ID map and `dispose` for a provided Three root/Bone graph; no geometry generator. Defer full `SkinnedMesh` builder to C2.
3. `apps/web/src/characters/combat/LegacyWarriorAdapter.ts`: test-only mapping `Torso`, `LeftArm`, etc. and known `Motion`/socket equivalence; emit clear unsupported/missing-role errors. Do **not** change `createAnimatedWarrior` or `main.ts` registration in C1.
4. `tests/character-core.test.ts`, `tests/character-runtime.test.ts`: deterministic IDs and stable serialize/reparse/hash, invalid duplicate/cycle/missing parent/bad quaternion/noninvertible binding/reused socket/invalid sever zone rejection; validate human, Rakshasa descriptor, winged avian head, four-arm and extra-head graphs; mirrored coordinate/forward/scale checks, socket world-transform parity, missing limb → disabled capability without modifying combat domain. Add a no-leak disposal test for owned temporary resources, distinguishing shared buffer owners.
5. Update `README.md` and C1 roadmap subsection with the actual implemented APIs and limitations; run all existing type/unit/replay/build/desktop+touch Chromium checks. Refuse C1 merge on regressions.

**C1 acceptance:** strict TypeScript passes, graph and socket fixture determinism established, legacy `AnimatedWarrior` integration unchanged in battle, D14 1,000-seed replay & browser smoke green, no unlicensed meshes/dependencies, no primitive-only “production character” claim. Begin C2 only once C1 contracts are reviewed.

## C0 disposition

Chosen: data-driven semantic graph, versioned recipe/injury/asset identities, continuous-topology feasibility gate, Three SkinnedMesh as existing runtime, no dependencies/assets or core changes in C0. Deferred: actual topology supplier, quantitative runtime budgets, pose quality, real severing, full GLB pipeline, route/UI, animation authoring and Cloudflare deployment. This ADR is an actionable design commitment, **not** an implementation or art quality certification.
