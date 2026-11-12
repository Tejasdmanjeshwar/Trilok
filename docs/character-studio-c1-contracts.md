# C1 — Canonical character contracts and test-only runtime bridge

**Status:** implemented C1 metadata and semantic runtime code; acceptance depends on the branch's GitHub Verify workflow. **No character geometry, Studio route, live combat integration, baking, cutting, or production art** is included. This is the smallest C1 slice identified in [C0 architecture](character-studio-c0-architecture.md).

## Added modules and APIs

- `packages/character-core/src/schema.ts`: version-1 typed serializable anatomy modules, segments, semantic joints, socket metadata, skin binding influence references, sever-zone metadata, recipes and separate per-instance injury state.
- `ids.ts`: stable `root/<module[instance]>/<role>` identifiers; paths encode extension side/index without depending on array or scene traversal order.
- `validate.ts`: strict graph validation, no cycles, unique IDs, no lost parent/owner, root constraints, finite normalized unit quaternions, finite translations, no skeleton scale, socket ownership/capability metadata, optional combat-region catalog check, influence limits and sever-zone metadata; validates injury/recipe and derives remaining *visual* capabilities without modifying gameplay.
- `presets.ts`: deterministic **structural descriptors** for human, Rakshasa, Vanara, Jatayu (avian-headed humanoid with paired independent wings), custom animal head topology family, and configurable paired additional arms/legs/heads. The descriptive family identifiers do not imply generated head geometry or a certified art asset. All descriptors use Y-up, +Z forward and neutral local rotations.
- `SemanticCharacter`: Three.js runtime *lookup layer* for a supplied rig root with explicitly mapped bones, live socket world transforms, optional immutable injury capability projection and idempotent disposal of **explicitly owned** resources. C1 does not create a SkinnedMesh or skin weights.
- `LegacyWarriorAdapter`: **test-only**, delegates unchanged D14 `AnimatedWarrior` motions, weapon origin, equipment and disposal. Maps known legacy scene groups to foundation semantic roles and explicitly rejects unsupported joints. It does not substitute for continuous anatomy, and is **not** registered in `main.ts`.

## Safety and boundaries

The current D14 `main.ts`, `AnimatedWarrior.ts`, `CombatHitVolumes.ts`, persistent wound and projectile modules, `packages/combat`, `packages/combat-ai`, choreography, boss phases and web build versions are unchanged. No runtime combat behavior is routed through C1; no authority, damage, projectile timing, defense window, AI decision, or phase threshold can change from these additions.

C1 metadata **does not imply fully functional dismemberment**: `SeverZoneV1` merely reserves zone IDs and cut metadata. Actual cap loops/mesh ownership, skinned anchors, attachment transfer and combat effects are C2/C8 work. `SkinBindingV1` describes prospective joint limits but cannot validate per-vertex normalized weights before geometry exists. Bone inverses and skin deformation must be checked during the C2 `SkinnedMesh` build; C1 has rigid bone TRS only.

The recipe fingerprint is deterministic, **not cryptographically secure** and is not a GLB integrity hash. Future recipes must include generator/template bytes in a separately versioned bake manifest and migrate explicitly. The legacy renderer still uses coarse groups and its existing local scaling; new skeletons do not introduce root scaling.

## Verification

`tests/character-core.test.ts` validates deterministic presets, multi-arm/leg/head and wing references, unique IDs, invalid/cyclic graphs, parents, quaternions, socket ownership, influence references, injury projection, and recipe reparse/fingerprints. `tests/character-runtime.test.ts` validates bone and socket transforms, missing mappings, owner-only disposal, and facade weapon-origin parity. GitHub Verify runs `pnpm typecheck`, all Vitest including 1,000 seeded encounters, `pnpm build`, desktop/touch Chromium and build manifest checks.

**Next:** C2 must source a clearly licensed continuous anatomical human topology (or pass a no-sculpt procedural surface research gate), implement actual `SkinnedMesh` geometry, morph/skin weight validation, visual deformation pose fixtures and explicit cut-loop geometry; no unverified asset is bundled here.
