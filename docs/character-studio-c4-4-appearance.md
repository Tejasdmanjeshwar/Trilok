# Character Studio — Appearance and modular capability foundations (C4.4)

Tracking: [Issue #65](https://github.com/Tejasdmanjeshwar/Trilok/issues/65). Scope is the existing CC0 MakeHuman **human** with its existing, single owned Three.js `MeshStandardMaterial`.

## Implemented

- Real skin-tone control: eight named, deterministic material-color swatches. The UI swatch uses the exact same sRGB hex as the Three.js material; no generated photo previews, textures, race selectors or new geometry.
- Real physical finish control: roughness 0.48–0.95 (Three.js PBR material uniform), three meaningful finish presets, continuous fine adjustment and numeric readout. Metalness is explicitly 0 for skin. Existing camera, lights, skinning and geometry are unchanged.
- Appearance lives in the validated, immutable, versioned **in-memory** Studio recipe. Commands `appearance-tone`, `appearance-finish`, `appearance-roughness`, `reset-appearance` use the existing reducer, 48-entry bounded history, semantic drag grouping, undo/redo, and Start over. Body and face values are not affected by an appearance-only reset. Material-only changes reuse the live skinned human; rebuilds apply the same appearance to the replacement model before committing it.
- Capability manifest `STUDIO_MODULES` defines module identifiers, prerequisites and available controls. The Studio navigation renders **only ready modules**. Descriptors exist for hair, garments, armor, equipment and anatomy extensions but have `deferred` status and no pretend controls or UI. These are contracts for later system integration, not implementations.

## Boundaries and limitations

The current human does **not** have texture-driven subsurface scattering, pigment/albedo texture atlases, normal maps, PBR skin microdetail, hair assets or fitted wardrobe. The appearance controls are honest flat-albedo skin and roughness adjustments; they must not be described as AAA dermatological skin rendering. Color perception depends on lighting/tone mapping. The default neutral color matches the prior Studio viewport setting (`0xc7a38b`). No media/image thumbnails that misrepresent assets.

No Save/Load, baking, face Focus (C4.5), pose, equipment or generator were added. Internal recipe revision remains `schemaVersion:1` because C4 has no persisted or portable recipes yet; this adds an appearance component to the ephemeral contract. Versioned persistence/migration is deferred to C9.

## Verification gates

- `tests/character-studio-appearance.test.ts` validates material mutation, real color values, bounds, deferred capability gating, recipe validation, undo/redo and gesture history. Existing strict TypeScript, 1000-seed deterministic combat replay and character tests must pass.
- `e2e/studio-appearance.spec.ts` exercises real canvas color changes, presets, undo/redo, section separation, reset, desktop/touch fit and screenshot captures. The full browser acceptance workflow is intentionally manual according to `docs/ci-phase-acceptance.md`; CI Verify does not automatically run Chromium.
- Require exact PR-head Verify (TypeScript, all unit/replays, production build, build identity). Review rendered screenshots before claiming visual acceptance. Confirm merged main SHA and Cloudflare deployed identity **separately**; CI success does not establish visual or deployment success.
