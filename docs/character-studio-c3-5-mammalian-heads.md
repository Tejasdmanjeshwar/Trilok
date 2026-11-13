# C3.5 — Primate and bear head-family morphology

**Scope:** Entire C3.5 subphase, primate and bear both required. C3.6 avian
geometry and C4 Studio are excluded. C1/C2 contracts and the deterministic
combat domain remain unchanged.

## Head-family identity and source provenance

The existing C1 `animal_head` anatomical preset supplies canonical
`head_primate_v1` and `head_bear_v1` head-family identifiers. The
`createSkinningSpike` and `bindTemplateToSemanticRig` adapters now accept
an optional primate/bear family, so both `spike.graph` and the shared
`SemanticCharacter.graph` agree on the family without changing any canonical
joint IDs, socket IDs, binding positions, physics rules, or combat regions.
All remaining humanoid bones and family-independent gameplay definitions are
shared.

**Critical topology limitation:** The current C3.5 first-generation profiles
are *continuous source-derived deformations of the same pinned MakeHuman CC0
base body surface*, not new independently retopologized primate/bear scanned
meshes. Their head-family IDs represent versioned **morphology compatibility
families**, while the actual underlying indexed connectivity/UV correspondence
remains shared. Do not describe them as independent zoological topology, with
new ear loops or independently controlled muzzle bones. This explicit
compatibility choice avoids unsafe source-index loss and preserves C2 skin
quality until a validated topological replacement is available.

## Species-specific parametric shaping

Pure `@trilok/character-core` generators
`c3.5-primate-head-v1` and `c3.5-bear-head-v1` share the existing eight
bounded C3.2 body and nine C3.4 human cranium/face channels. Six additional
species-independent controls cover muzzle projection (0.85–1.15), muzzle
width (0.88–1.12), muzzle height (0.90–1.10), ear size (0.85–1.15),
brow mass (0.88–1.12), and jaw mass (0.88–1.12). Default 1.0 is a
*family-specific* primate or bear profile, **not** a return to human anatomy.
Generation and fingerprinting reject unknown keys, invalid anatomy family,
unsupported archetype/generator strings, bad seed and nonfinite/out-of-range
parameters before geometry changes.

`MammalianHeadDeformation` reuses the C3.4 CC0 source-calibrated cranial
landmarks and adds separate continuous species-specific soft fields around
the central muzzle/nasal bridge, mandible and cheeks, brows and actual
CC0 lateral ear surface patch. Bear proportions have a broader and deeper
muzzle, heavier jaw, elevated ear treatment and fuller upper skull relative
to the primate profile; primates use a shorter muzzle and distinct ear/brow
distribution. No floating primitives, severed surfaces, rescaled character
root, source-index remap or extra gameplay joints. The head and jaw continue
to follow C1 FK; both families expose deterministic mouth, ear and orbital
reference points and preserve the C3.3 socket/IK rest alignment.

## Laboratory and verification

The isolated `/c2-lab.html` page adds **Human / Primate / Bear** family
selection, four calibrated mammalian shaping presets plus stress and six
bounded sliders. Switches regenerate owned source geometry and dispose the
previous preview, with existing C3.4 **user orbit/pan/zoom preservation**.
The source, family descriptor, default/modified profile, pose and camera
remain distinct controls. The original CC0 human remains the default.

New pinned-CC0 unit tests cover both graph families, strict versioned
recipes, deterministic hashes, representative coupled head/body extremes,
UV seam/source correspondence, C1/C2 IDs and weights, finite skinning,
reference landmarks following FK, jaw opening downward, pose/rest recovery,
mismatched-family rejection, and idempotent disposal. A phase-gated
Playwright scenario captures primate and bear front/side/jaw views and
checks camera continuity/family switching. Fast Verify runs TypeScript,
all Vitest including 1,000 seeded combat replays, production build and
exact build identity; phase-gated Chromium is deferred to C3.7 unless
needed to diagnose a regression.

**Quality gate still requiring owner review:** inspect both species from
front/side/rear, neutral and jaw-open, including mouth, muzzle, eyebrows,
ears, skull-to-neck and body transition. A successful headless geometry test
does **not** prove animal anatomy fidelity or visually acceptable ear
silhouettes. Premium sculpt fidelity, full eyelids/teeth/tongue, fur, facial
expressions, skull-specific retopology and mobile performance proof remain
unverified. Do not mark C3.5 owner-accepted or start C3.6 based on CI alone.
