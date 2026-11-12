# C3.1 — Bounded human morphology foundation

**Status:** First C3 increment, not C3 acceptance or C4 editing.
**C2 accepted baseline:** main `7d2b888afd8ffa3fe26a5fd1b611b55fe9c81ac5`; exact-SHA C2 [Phase Acceptance 43289499861](https://github.com/Tejasdmanjeshwar/Trilok/actions/runs/43289499861) passed. The owner has accepted the deployed Cloudflare site and Character Lab. C2 Issue #15 records screenshot and device limitations and is closed as an accepted anatomical foundation, not a final art-quality certification.

## Implementation contract

- `packages/character-core/src/morphology.ts` adds **opt-in**, generator-versioned, bounded two-parameter human shaping recipes with deterministic canonical fingerprints. Only `human` / `humanoid_biped_v1` and zero optional anatomy modules are accepted in this slice. Recipes do not contain runtime injury data.
- `HumanMorphology.applyHumanMorphology()` deforms the **actual pinned CC0 body mesh** and calibrated bone rest positions, including skin-only helper bones, by the same positive rest-space affine proportions; recomputes inverse binds, normal direction and bounds; preserves indexed topology, UV seams, original source numbering, four original normalized influences, C1 semantic IDs and unit Object3D scales.
- The API is intentionally **opt-in and one-shot** on a newly constructed, neutral `AnatomicalHuman`. To change parameters, rebuild a new source-backed instance; never deform a posed rig in place. C2 Character Lab and combat are unchanged. Do not misrepresent this as a completed standalone Studio UI or arbitrary topology editing.
- `body.stature`: 0.92–1.08; `body.breadth`: 0.90–1.10. Both 1.0 reproduce the unmodified rest geometry. These first bounded *global* body proportions are a deterministic engineering baseline, **not** anatomically sophisticated localized proportions or artistic corrective morphs. Face, neck and fingers are not yet independently editable.
- The original `sourcePositions`, source origin and original-source conversion remain immutable source-provenance data; deformed rest vertex coordinates reside in the owned geometry. C3 downstream landmark consumers must apply the same deformation rather than re-read the unshaped source as the shaped asset.
- Anatomy/combat sockets remain canonical C1 descriptors; no claims of calibrated weapon grip contact, proxy reach or movement semantics. No C4, C8, or dismemberment behavior.

## Risks / next slice

1. Add body-region-specific, smooth deformers driven by calibrated landmarks rather than global anisotropic proportions. Verify high-stress joint volume and UV seam correspondence.
2. Add evaluated **derived** socket and hit-proxy dimensions without changing authoritative combat rules.
3. Add compatible head-family generation and corrective shapes with explicit topology-family identification.
4. Provide a non-destructive regeneration API and proper mutable recipe-to-asset lifecycle before C4 UI; benchmark real browser edits separately.

**Validation:** Real CC0 template tests include bounded extremes, indexed topology, UV/source correspondence, neutral CPU skin, C1 joint movement, FK/neutral recovery, double-apply failure, pose rejection, and recipe hashing. Fast CI must pass TypeScript, all Vitest including seeded combat replay, production build and identity verification. Phase Acceptance Chromium matrix is reserved for C3 phase closure, not this intermediate slice. Actual visual morphing acceptance is **not yet claimed**.
