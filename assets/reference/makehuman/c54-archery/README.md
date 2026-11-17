# Source MakeHuman archer pose references — research only

Source models: `callharvey3d_archer_hero`, `callharvey3d_archer_square_stance`.
Author: callharvey3d.
Original MakeHuman asset references: https://www.makehumancommunity.org/node/645 and https://www.makehumancommunity.org/node/642

The actual BVH and .meta files were recovered from public pinned revision
`5917810cd4983e9fd757fc44efd39b3dd7648ee0` of
https://huggingface.co/datasets/lsmpp/omni-refiner-video
and verified by SHA-256 before import.

License ambiguity: the bundled original .meta sidecars declare
`license CC-by`, while the current MakeHuman asset-pack website
labels the same poses as CC0. Treat as attribution-required research
reference data pending resolution. Preserve author attribution and
original metadata; do not ship with runtime game assets or claim
the CC0 catalog overrides the original .meta license.

These are 1-frame full-draw poses, not combat animations.
Source finger and wrist Euler angles must be retargeted through
Trilok's existing AnatomicalFK, with source .L/.R handedness mapping.
