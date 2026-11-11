# Trilok v0.4-B1 — Playable HFSM + Utility enemy combat AI

## Version
**Playable:** v0.4.0-preview.2 · **Combat core:** v0.4-B1 · **Channel:** preview.

## Architecture
- `packages/combat-ai` contains `EnemyCombatBrain` with seeded decisions and a small event-driven tactical HFSM (`observe`, `decide`, `commit`, `react`, `recover`, `defeated`).
- Utility scoring **ranks only legal candidates** from the `@trilok/combat` queries. It considers attack damage and reach, target distance, Energy cost and conservation, action budget, repetition, lethal opportunity, weapon class and switching cost. It does not edit HP or resource values.
- `getLegalEquipmentSwitches()` is the shared authoritative switch query for both AI and player controllers. Switches are once per actor turn and cost Energy.
- Defenses are based on the shared legal reaction query and effective per-hit timing profiles. An AI with reasonable awareness *may* react; seeded imprecision and reaction timing limits allow mistakes. Perfect parries and projectile interceptions use the existing combat domain refund/cooldown rules.
- Profiles `novice`, `capable` (default) and `elite` define awareness, timing variance, perception, aggression, conservation, switching preference, and bounded decision noise.
- GOAP is deliberately **not implemented**; this encounter doesn't require multistep goal planning. The policy is pure TS, testable without Three.js.

## Browser changes
- The rakshasa can equip a visible sword or bow during its own decision turn, select a melee/ranged attack, recover Energy, or end the turn.
- Its quick melee and ranged attacks may continue while actions/Energy remain; a heavy or overhead move ends the turn.
- During player attacks, it may dodge, parry with a sword, or intercept an arrow with a bow; no counter is automatically granted. An attempted reaction is scheduled from the attack telegraph and processed through `EncounterSession.captureDefense` and the same `resolveReaction` path as player input.
- Enemy equipment, Energy and current tactical intent appear near the opponent health bar.
- AI has a short human-readable decision pause and resettable seed. Source code/build information is still visible through the BUILD badge.

## Verification checklist
1. Header reads **v0.4.0-preview.2**; BUILD commit/time changes.
2. Make repeated shots: the enemy occasionally deflects/dodges and sometimes takes normal or partial damage. No always-perfect AI.
3. Move through several rounds: observe an enemy switch between sword and bow, with a visual change and reduced Energy.
4. With enemy bow equipped, ranged attacks can be intercepted; melee attacks cannot be countershot-parried, only dodged.
5. Enemy ranged shots use the tight ranged reaction timing profile, whereas enemy melee moves use the melee profile. Player sword parry is unavailable against unblockable heavy crush.
6. Enemy offensive chains observe the action budget. Recovery moves restore Energy and end the turn.
7. Restart resets HP, Energy, equipment, visible intent, reaction schedules, and deterministic AI seed.
8. Mobile/high quality presets, controls, camera, animation, and FPS remain usable.

## Known limitations
- Current reaction presentation uses reusable placeholder parry/dodge clips for both actors; contact VFX and mirrored camera choreography need dedicated v0.4-C polish.
- No actual per-body-part spatial raycasts yet, so shots hit the default torso region (not fantasy headshot crits).
- The AI chooses attacks and weapons using coarse visible combat context; it is not a navigation planner or GOAP system. It doesn't yet predict moving targets or learn the player's history across encounters.
- This is a preview; browser animation, interaction and mobile performance require hands-on manual validation beyond GitHub CI.
