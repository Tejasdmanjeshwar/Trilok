# D13 — Intelligent Enemy Attack Patterns

## Authoritative hit timing
The Rakshasa gains three moves. Crosscut has two actual hits at 1080ms and 1740ms, each with its own legal parry/dodge window. Deceiver shows a false swing at 920ms but deals no damage until the real hit at 2240ms. Delayed Heavy has a conspicuous windup and a single true hit at 2400ms.

Sequences generate their hit cues directly from combat-domain hit offsets. Feints are cosmetic cues only. Every actual hit is resolved through the normal combat reaction domain, which advances the hit cursor and preserves the original one-time Energy cost.

## AI fighting style and learning
A duelist favors flurries, a trickster feints and a brute delays heavy attacks. Bounded history records whether the player actually dodged, parried or ignored incoming attacks, and intelligence scales the resulting utility scores. Low-health aggression adjusts preference without authorizing forbidden moves. Seeded decisions remain reproducible.

## Safety and verification
Intermediate hits keep the same attack phase and choreography, refresh the reaction HUD, and clear stale defense inputs without granting free resources. No fabricated strikes, damage, or RNG are introduced. Tests enforce impact ordering, independent hit reactions, visible feints without HP changes, style scoring and memory reset. Existing 1,000 seeded combat replays and desktop/mobile Chromium runs remain release gates.

Professionally authored animations, unique enemy audio and real-device accessibility testing are future presentation tasks.
