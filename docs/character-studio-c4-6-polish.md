# C4.6 — Studio UX, accessibility and performance polish

Tracking: [Issue #65](https://github.com/Tejasdmanjeshwar/Trilok/issues/65).
Scope: existing human Studio experience only. C4.7 generation, persistence, baking and combat are unchanged.

## Implementation

- The skinned viewport is now keyboard-focusable. Arrow keys orbit in deliberate increments and plus/minus zoom; this is an alternative to pointer gestures and respects the current body-part Focus. The dedicated Focus selector remains accessible without a mouse. Visible focus outlines and touch target minimums were strengthened. Navigation remains native buttons with explicit selected state.
- Body and Face keep separate search, category and advanced-control choices during navigation; returning to a section no longer unexpectedly resets filters. The control count announces changed results to assistive technology, without echoing every slider move.
- The viewport suspends render submissions when the document becomes hidden and resumes when visible, preventing background-frame work. The context-loss path suspends its sampling and requests a new frame only after restoration.
- Pose changes no longer recreate unchanged skeleton or joint helper geometry. Joint markers share a single geometry/material pair, disposed once when inspection closes or the model changes. Character mesh and authoritative FK remain unchanged.
- An **on-demand engineering-only** `trilok:studio:request-metrics` event emits a `trilok:studio:metrics` CustomEvent with bounded samples (180) of initial-load milliseconds, completed preview edit milliseconds, visible-frame submission intervals (median and p95), and `WebGLRenderer.info.memory` geometry/texture counters. It does **not** claim GPU execution time, total GPU bytes, leak freedom, measured FPS on physical mobile devices, or fixed performance guarantees. It is never shown in the player UI. Hidden-tab gaps are explicitly excluded.

## Verification and acceptance

- Unit: `tests/character-studio-performance.test.ts` ensures bounded samples, quantile calculations, suspension, and invalid input rejection; existing history, morphology, deterministic combat replay and skinning tests remain mandatory.
- Browser: `e2e/studio-polish.spec.ts` checks a designer journey across Face/Body, filter restoration, keyboard camera, regional Focus and runtime counters, with desktop/touch screenshot artifact paths. The existing Studio / Lab / combat browser coverage must still pass.
- The repository intentionally reserves Chromium installation and full browser checks for the manually dispatched **Phase Acceptance** workflow. A green Verify run is not substitute evidence for actual screenshots. Desktop/mobile, portrait/landscape and reduced-motion rendering must be checked against exact candidate SHA, and actual device budgets should be derived from measured runs rather than guessed thresholds.
- Review repeated Studio navigation, orthographic/pose transitions, appearance undo, infant age morphology, facial asymmetry, native stress extremes, context-loss/retry, and changing controls while a slow preview rebuild is pending.
- Final acceptance still requires exact-`main` Phase Acceptance, screenshot review, real Cloudflare `/studio/` and `/build-info.json` identity verification, and owner sign-off.

## Boundaries

No generator, external editors, unsupported equipment, new character topology, persistence, or baking. Source MakeHuman body/face evaluators and deterministic combat systems are untouched. WebGL resource counters help detect regressions but are insufficient alone to prove absence of memory leaks.
