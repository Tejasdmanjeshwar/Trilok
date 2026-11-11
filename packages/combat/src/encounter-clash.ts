import type {
  CombatCatalog, PendingAttack, DefenseSpec, ReactionGradeV2,
  ProjectileClash, PendingProjectileContinuation, AttackSpec,
} from "./encounter-types";

const DEFAULT_GRADE_POWER: Record<ReactionGradeV2, number> = {
  perfect: 1, good: .72, partial: .38, miss: 0,
};

/**
 * A projectile clash does not create another attack. Both launched objects
 * have stable IDs, and any survivor retains that exact identity.
 *
 * The authored grade determines power. The incoming attack's counter policy
 * may suppress follow-through or override its damage, but never respawn it.
 */
export function calculateProjectileClash(
  pending: PendingAttack,
  attack: AttackSpec,
  defense: DefenseSpec,
  grade: ReactionGradeV2,
  catalog: CombatCatalog,
  clashTick: number,
): ProjectileClash {
  const spec = defense.projectileInterception;
  if (!spec || defense.technique !== "projectile_intercept" ||
      attack.delivery !== "ranged_projectile") {
    throw new Error("Projectile clash requires a ranged attack and an interceptor move.");
  }
  const hit = pending.hits[pending.hitIndex]!;
  const incomingPower = attack.projectilePower ?? 10;
  const interceptorPower = spec.power *
    (spec.gradePower?.[grade] ?? DEFAULT_GRADE_POWER[grade]);
  const difference = interceptorPower - incomingPower;
  const deadband = spec.deadband ?? .75;
  const verdict = difference > deadband
    ? "interceptor_survives" as const
    : difference < -deadband
      ? "incoming_survives" as const
      : "mutual_destruction" as const;
  const incomingProjectileId = "attack:" + pending.attackerId + ":" +
    pending.startedTick + ":" + hit.id;
  const interceptorProjectileId = "intercept:" + pending.defenderId + ":" +
    pending.startedTick + ":" + hit.id;
  const survivingProjectileId = verdict === "incoming_survives" ? incomingProjectileId :
    verdict === "interceptor_survives" ? interceptorProjectileId : null;
  const remainingPower = verdict === "mutual_destruction" ? 0 : Math.abs(difference);
  let continuation: PendingProjectileContinuation | null = null;
  if (verdict === "incoming_survives") {
    continuation = {
      projectileId: incomingProjectileId,
      source: "incoming",
      attackerId: pending.attackerId,
      defenderId: pending.defenderId,
      moveId: pending.moveId,
      startedTick: pending.startedTick,
      impactTick: hit.impactTick,
      damage: Math.max(1, Math.round(attack.damage * hit.damageMultiplier *
        Math.min(1, remainingPower / incomingPower))),
      damageType: pending.damageType,
      targeting: pending.targeting,
      intendedRegionId: pending.intendedRegionId,
    };
  } else if (verdict === "interceptor_survives" &&
      attack.counterPolicy?.mode !== "deny") {
    const override = attack.counterPolicy?.mode === "override"
      ? catalog.counters?.[attack.counterPolicy.counterId!] : undefined;
    if (override && override.delivery !== "ranged_projectile") {
      throw new Error("Ranged clash continuation override must be a ranged counter.");
    }
    continuation = {
      projectileId: interceptorProjectileId,
      source: "interceptor",
      attackerId: pending.defenderId,
      defenderId: pending.attackerId,
      moveId: defense.id,
      startedTick: clashTick,
      impactTick: clashTick + spec.continuationTicks,
      damage: Math.max(1, Math.round((override?.damage ?? spec.continuationDamage) *
        (.65 + .35 * Math.min(1.5, remainingPower / incomingPower)))),
      damageType: override?.damageType ?? "pierce",
      targeting: { mode: "actor" },
      intendedRegionId: null,
    };
  }
  return {
    incomingProjectileId, interceptorProjectileId,
    attackerId: pending.attackerId,
    interceptorId: pending.defenderId,
    incomingMoveId: pending.moveId,
    defenseMoveId: defense.id,
    clashTick, incomingPower, interceptorPower, remainingPower,
    verdict, survivingProjectileId, continuation,
  };
}
