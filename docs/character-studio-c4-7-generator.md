# C4.7 — Meaningful seeded human character generator

Tracking: [Issue #65](https://github.com/Tejasdmanjeshwar/Trilok/issues/65).

## Implemented architecture

- `StudioGenerator.ts` is a pure, deterministic, versioned sampling function. The existing in-memory recipe's `generatorVersion: "studio-human-v1"` and unsigned 32-bit `seed` are authoritative. It has no global RNG, network access, storage, or reliance on time. Web Crypto is used **only** to choose a new seed when the player asks for a new variation; reproducing that seed is deterministic.
- Profiles are *distributions*, not meshes: Balanced, Warrior, Scout and Guardian affect bounded body mass/muscle/stature/proportions. A handful of source-native torso/hip/arm/hand targets share those underlying traits, with gentle symmetric face controls and correlated nose, cheek, jaw, eye and head features. Each result passes the existing body, face, head and appearance validators before entering history. Individual target application uses at most five shrinking candidate deltas before safe neutral fallback; there is no unbounded retry loop.
- Age defaults to adult-range source values (.31–.69). When age is locked, it remains exactly unchanged; tiny child/infant age values attenuate other generated anatomy to avoid stress combinations. No hidden clamping of manually supported extreme controls: locked features retain their exact values.
- `macro/sex` and the three ancestry source channels are never sampled from play-style categories and are always retained unchanged. No ancestry-based appearance or style inference. Skin tone and roughness use an independent seeded stream, bounded by the existing appearance catalog.
- Locks: Body, Face, Age, Appearance, and any source-supported Body/Face/head-shape control. A group lock preserves all values in its category, including shape values, even if the rest of the character is generated. Nonlocked channels regenerate from a neutral foundation. Seeded streams are separate by trait group to avoid accidental random-sequence drift when locking unrelated categories. Preexisting source control catalog metadata remains the only bounds/validation authority.
- `StudioRecipe.ts` gains an atomic `generate` command in the same immutable recipe/history reducer; one generation is one undo/redo step. Failed/stale preview callbacks use the existing latest-request cancellation and last-good-recipe rollback in `StudioMorphEditor` and `StudioViewport`. Body, Face, Appearance, character Lab, camera Focus, and pose previews use the same shared runtime.
- The panel is accessible and responsive, with supported styles, seed input, variation slider, lock toggles, selected-feature locks, Generate and New variation actions, and screen-reader status. The player UI does not display internal generator version, phase, commits or diagnostics.

## Explicit limits

The generator only supports the existing skinned human. No hair, armor, garments, extra-limb archetypes, Save/Load, exported recipe files, or baking. Generated designs are intentionally conservative and need actual rendered inspection to claim anatomical quality. A valid numeric recipe does not guarantee that every combination is artistically pleasing. The generator is versioned to allow future algorithm revisions without silently changing a chosen recipe's behavior.

## Verification

- `tests/character-studio-generator.test.ts`: fixed-seed body snapshot, repeated-seed exactness, diverse styles/seed property sampling, numeric/source range validity, infant and advanced feature locks, unchanged ancestry and sex channels, invalid-input rejection, and one-step undo/redo with stale-result protection.
- `e2e/studio-generator.spec.ts`: desktop and touch Generate navigation, styles, seed/locks, history, manual refinements, viewport Focus, invalid inputs, accessibility labels and rendered screenshot artifacts.
- C4.7 requires **exact PR-head Verify** (strict TypeScript, full Vitest and deterministic combat replay, production bundle/build identity), then manual **Phase Acceptance** on the exact merged `main` SHA with full desktop/touch Chromium screenshots, visual owner acceptance, and independent deployed Cloudflare `/studio/` and `/build-info.json` SHA evidence. GitHub build success does not imply that Cloudflare deployment or visual acceptance has passed.
