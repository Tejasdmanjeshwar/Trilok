# D10 Combat Reliability Foundation

## Scope
D10 makes the existing combat prototype resilient and debuggable without adding damage rules, weapons or new attack skills. Production systems should not fail silently: if the combat presentation loop throws or reaches an implausible phase deadline, show an HTML recovery UI with restart and a locally copyable diagnostic report.

## Domain and presentation boundaries
- `EncounterSession` remains the only browser-facing adapter that commits attacks, defenses, Energy and hit outcomes. Neither the runtime guard nor buffer can award damage or bypass domain legality.
- `BufferedDefense` stores at most one intent per pending hit, scoped to attacker/start tick/hit index and hit ID. Inputs up to 110ms before the real opening may queue. On the first actual legal frame, the existing `captureDefense` validates current timing and feasibility. A stalled frame beyond the actual late boundary discards the intent. Changing phase, hit, reset or failure clears the buffer.
- `CombatRuntimeGuard` keeps a bounded 96-event in-memory ring and frame-cadence stats. Phase-specific deadlines detect lost transitions; long tab-suspension gaps get a temporary grace interval.
- `guardedFrame` catches presentation exceptions, cancels choreography, freezes unsafe simulation updates and opens an accessible HTML overlay. Restart rebuilds a clean encounter; reports include build identity, phase, outstanding impact markers and the last recorded operations, but are not uploaded automatically.
- Impact/phase/attack tracing is observational. It must not read or alter projectile collision, AI decisions or damage math.

## Verification
- `pnpm typecheck && pnpm test && pnpm build`.
- Seeded replay tests run 1,000 complete headless encounters, validate legal decision/reaction phases and HP/Energy/action bounds, enforce completion within a finite action budget and compare deterministic traces for equal seeds.
- Playwright Chromium smoke tests run against the compiled Vite preview in desktop and mobile emulation; they check startup, an actual opponent turn, restart, input controls, absence of browser exceptions and build identity.
- Tests cover early/late buffer boundaries, one-shot input, stale hit invalidation, tab resume grace, phase deadlines and diagnostics reset.

## Remaining before production
Real mobile hardware profiling, comprehensive screen reader and input latency accessibility QA, visual baseline screenshots, automated chaos simulation with app-level frame fault injection, telemetry opt-in design, and multi-character save-game replay are separate later milestones. The 1,000-seed target is a regression quality gate, not statistical proof of zero possible bugs.
