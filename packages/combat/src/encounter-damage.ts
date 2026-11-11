import type {
  AnatomySpec, ArmorSpec, CombatCatalog, DamageBreakdown, DamageType,
  EncounterActor, RegionExposure, TargetRegionSpec, TargetingSpec, OffenseGrade,
} from "./encounter-types";

const DAMAGE_TYPES: readonly DamageType[] = ["pierce","slash","blunt","divine"];
function fraction(x: number): boolean { return Number.isFinite(x) && x >= 0 && x <= 1; }
function multiplier(x: number): boolean { return Number.isFinite(x) && x > 0 && x <= 10; }
function idExists(id: string): boolean { return id.length > 0; }

export function validateTargetCatalog(catalog: CombatCatalog): void {
  for (const [id, anatomy] of Object.entries(catalog.anatomies ?? {})) {
    if (!idExists(id) || anatomy.id !== id || !anatomy.regions[anatomy.defaultRegionId]) {
      throw new Error("Invalid anatomy or default region: " + id);
    }
    for (const [regionId, region] of Object.entries(anatomy.regions)) {
      if (!idExists(regionId) || region.id !== regionId ||
          !multiplier(region.vulnerabilityMultiplier) ||
          (region.staggerMultiplier !== undefined && !fraction(region.staggerMultiplier))) {
        throw new Error("Invalid target region: " + regionId);
      }
    }
  }
  for (const [id, armor] of Object.entries(catalog.armor ?? {})) {
    if (!idExists(id) || armor.id !== id || !armor.label) throw new Error("Invalid armor: " + id);
    const seen = new Set<string>();
    for (const cover of armor.coverage) {
      if (!idExists(cover.regionId) || seen.has(cover.regionId) || !fraction(cover.protection)) {
        throw new Error("Invalid or duplicate armor coverage in " + id);
      }
      seen.add(cover.regionId);
      for (const [type, mod] of Object.entries(cover.damageTypeModifiers ?? {})) {
        if (!DAMAGE_TYPES.includes(type as DamageType) || !Number.isFinite(mod) || mod < 0 || mod > 2) {
          throw new Error("Invalid armor damage-type modifier: " + type);
        }
      }
    }
  }
  for (const attack of Object.values(catalog.attacks)) {
    if (attack.damageType !== undefined && !DAMAGE_TYPES.includes(attack.damageType)) {
      throw new Error("Unknown attack damage type.");
    }
    const targeting = attack.targeting;
    if (targeting && !["actor","free_aim"].includes(targeting.mode)) {
      throw new Error("Invalid targeting mode.");
    }
    if (targeting?.precisionCriticalMultiplier !== undefined &&
        (!multiplier(targeting.precisionCriticalMultiplier) ||
         targeting.mode !== "free_aim")) {
      throw new Error("Precision criticals require free aim and a valid multiplier.");
    }
  }
}

/** No mutation: validates region/armor references without requiring humanoid anatomy. */
export function validateActorTargets(actor: EncounterActor, catalog: CombatCatalog): void {
  if (actor.anatomyId === undefined) {
    if (actor.equippedArmorIds?.length || Object.keys(actor.regionExposure ?? {}).length) {
      throw new Error("Regional armor/exposure requires an anatomy.");
    }
    return;
  }
  const anatomy = catalog.anatomies?.[actor.anatomyId];
  if (!anatomy) throw new Error("Unknown actor anatomy: " + actor.anatomyId);
  const usedArmor = new Set<string>();
  for (const id of actor.equippedArmorIds ?? []) {
    if (usedArmor.has(id)) throw new Error("Duplicate equipped armor.");
    usedArmor.add(id);
    const armor = catalog.armor?.[id];
    if (!armor) throw new Error("Unknown equipped armor: " + id);
    for (const cover of armor.coverage) {
      if (!anatomy.regions[cover.regionId]) throw new Error("Armor covers unknown region: " + cover.regionId);
    }
  }
  for (const [id, exposure] of Object.entries(actor.regionExposure ?? {})) {
    if (!anatomy.regions[id] || !["exposed","protected","hidden"].includes(exposure)) {
      throw new Error("Unknown region or exposure state.");
    }
  }
}

export function resolveDefaultRegion(
  actor: EncounterActor, catalog: CombatCatalog,
): string | null {
  return actor.anatomyId ? catalog.anatomies![actor.anatomyId]!.defaultRegionId : null;
}

export interface DamageInput {
  readonly attackerId: string;
  readonly defender: EncounterActor;
  readonly moveId: string;
  readonly hitId: string;
  readonly baseDamage: number;
  readonly damageType: DamageType;
  readonly targeting: TargetingSpec;
  readonly intendedRegionId: string | null;
  /** null means a spatial miss if a regioned target was expected. */
  readonly actualRegionId: string | null;
  readonly reactionMultiplier: number;
  readonly offenseMultiplier?: number;
  readonly offenseGrade?: OffenseGrade;
  readonly inReach: boolean;
  readonly contact?: boolean;
}

/**
 * One authoritative damage calculation. Sequence:
 * contact -> reaction -> region vulnerability -> armor -> eligible precision crit
 * -> deterministic rounding -> HP cap. No renderer references or random rolls.
 */
export function resolveRegionDamage(input: DamageInput, catalog: CombatCatalog): DamageBreakdown {
  const { defender } = input;
  const reasons: string[] = [];
  const anatomy: AnatomySpec | undefined = defender.anatomyId
    ? catalog.anatomies?.[defender.anatomyId] : undefined;
  if (input.intendedRegionId !== null) {
    if (input.targeting.mode !== "free_aim" || !anatomy?.regions[input.intendedRegionId]) {
      throw new Error("Invalid intended target region.");
    }
    const exposed = defender.regionExposure?.[input.intendedRegionId] ?? "exposed";
    if (exposed === "hidden") throw new Error("Cannot aim at a hidden target region.");
  }
  let region: TargetRegionSpec | undefined;
  if (input.actualRegionId !== null) {
    if (!anatomy?.regions[input.actualRegionId]) throw new Error("Unknown actual impacted region.");
    region = anatomy.regions[input.actualRegionId];
    if ((defender.regionExposure?.[input.actualRegionId] ?? "exposed") === "hidden") {
      throw new Error("Spatial adapter cannot report a hidden impacted region.");
    }
  } else if (anatomy && input.inReach && input.contact !== false) {
    reasons.push("region_miss");
  }
  const contacted = input.inReach && input.contact !== false && (!anatomy || region !== undefined);
  if (!input.inReach) reasons.push("out_of_reach");
  if (input.inReach && input.contact === false) reasons.push("spatial_miss");
  if (contacted && !anatomy) reasons.push("legacy_unregional_hit");
  if (!multiplier(Math.max(input.reactionMultiplier, .000001)) || !Number.isFinite(input.baseDamage) ||
      input.baseDamage < 0) throw new Error("Invalid damage modifiers.");
  const baseDamage = input.baseDamage;
  const offenseBonus=input.offenseMultiplier??1;
  if(!Number.isFinite(offenseBonus)||offenseBonus<1||offenseBonus>1.5)
    throw new Error("Invalid offensive damage multiplier.");
  if(input.offenseGrade && input.offenseGrade!=="miss" && contacted && input.reactionMultiplier>0)
    reasons.push("offensive_"+input.offenseGrade);
  const vulnerabilityMultiplier = region?.vulnerabilityMultiplier ?? 1;
  let armorMultiplier = 1;
  let suppressCritical = false;
  for (const id of defender.equippedArmorIds ?? []) {
    const armor: ArmorSpec | undefined = catalog.armor?.[id];
    const piece = armor?.coverage.find(cover => cover.regionId === input.actualRegionId);
    if (!piece) continue;
    const modifiedProtection = Math.min(1, Math.max(0,
      piece.protection * (piece.damageTypeModifiers?.[input.damageType] ?? 1),
    ));
    armorMultiplier *= 1 - modifiedProtection;
    suppressCritical ||= piece.suppressesCritical === true && modifiedProtection > 0;
    reasons.push("armor:" + id);
  }
  const exposure: RegionExposure = input.actualRegionId
    ? (defender.regionExposure?.[input.actualRegionId] ?? "exposed")
    : "exposed";
  if (exposure === "protected") {
    // Protected weak points do not grant vulnerability or precision critical.
    reasons.push("weak_point_protected");
  }
  const weakness = exposure === "protected" ? 1 : vulnerabilityMultiplier;
  if (contacted && weakness !== 1) reasons.push("weak_point");
  const critical = contacted && input.reactionMultiplier > 0 &&
    input.targeting.mode === "free_aim" &&
    input.intendedRegionId !== null &&
    input.intendedRegionId === input.actualRegionId &&
    region?.criticalEligible === true &&
    exposure === "exposed" && !suppressCritical &&
    (input.targeting.precisionCriticalMultiplier ?? 1) > 1;
  const criticalMultiplier = critical ? input.targeting.precisionCriticalMultiplier! : 1;
  if (critical) reasons.push("precision_critical");
  if (suppressCritical) reasons.push("critical_suppressed");
  if (input.reactionMultiplier === 0) reasons.push("defense_countered");
  const armorAbsorbed = contacted
    ? Math.max(0, baseDamage * input.reactionMultiplier * offenseBonus * weakness * (1 - armorMultiplier)) : 0;
  const raw = contacted ? baseDamage * input.reactionMultiplier * offenseBonus * weakness *
    armorMultiplier * criticalMultiplier : 0;
  const finalDamage = Math.min(defender.hp, Math.max(0, Math.round(raw)));
  const stagger = contacted && region ? Math.round(finalDamage * (region.staggerMultiplier ?? 0)) : 0;
  return {
    attackerId: input.attackerId, defenderId: defender.id, moveId: input.moveId,
    hitId: input.hitId, intendedRegionId: input.intendedRegionId,
    actualRegionId: input.actualRegionId, damageType: input.damageType, baseDamage,
    reactionMultiplier: input.reactionMultiplier, vulnerabilityMultiplier: weakness,
    armorMultiplier, armorAbsorbed: Math.round(armorAbsorbed * 100) / 100,
    critical, criticalMultiplier, stagger, finalDamage,
    ...(input.offenseGrade!==undefined ? {offenseGrade:input.offenseGrade,offenseMultiplier:offenseBonus}:{}),
    reasons,
  };
}
