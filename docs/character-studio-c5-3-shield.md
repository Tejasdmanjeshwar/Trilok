# Character Studio C5.3 — Independent sword and shield

## Implementation candidate

This branch adds `StudioShieldGrip.ts`, a versioned shield descriptor, skinned
forearm/hand source sampling, constrained arm pose fitting using the existing
`fitConstrainedIK` and `StudioBodyCollision`, and a shield preview with its
own semantic palm socket and disposal lifecycle. Both mirrored equipment choices
retain the accepted C5.1 `StudioSwordPreview` sword and reuse its finger
articulation and five-digit contact fitting; C5.2 longsword and staff handling
are unchanged.

The shield contact frame is calibrated from the actual current source
elbow/wrist/palm/knuckle landmarks. A conservative maximum projected posed
skin depth establishes the rear face of the shield board, so the palm and fingers
remain behind the plate rather than punching through the center. The rear handle
is oriented using the source knuckle line. Forearm straps are fitted against the
currently skinned source forearm radius and attached relative to the same
shield frame. These are editable reference geometry and metadata, not combat
block, parry or damage functionality.

Studio's Equipment menu adds mirrored Sword and Shield combinations, separate
guard/attack-ready/parry presentation stances, and a focus button for the shield
hand. Equipment remains presentation-only and in-memory; no changes to combat
simulation, character Save/Load or build authority.

## Validation and limits

- `tests/character-studio-shield-contact.test.ts` uses the pinned source OBJ,
  rig and skin weights and representative native height/weight/muscle extremes.
  It measures post-skin source clearance, mirrored socket ownership,
  repeatable FK commands, root movement and disposal.
- `e2e/studio-shield.spec.ts` covers desktop/touch mirrored equipment,
  stance switching and full-body/shield-hand screenshots under the repository's
  manual browser test workflow.
- **Do not merge yet.** The owner must inspect the actual feature-preview
  render and confirm rear-handle/strap placement, thumb contact, stance and
  shield silhouette. Passing numeric IK tests does not prove physically
  correct skinned contact. Vertex sampling is not continuous triangle collision
  detection, and current reference art is not production shield artwork.
- A verified Cloudflare preview URL and exact deployed build SHA are required
  before visual acceptance. C5 overall Phase Acceptance is reserved for C5.5.
