import type { OffenseGrade, OffensiveTimingSpec } from "./encounter-types";

export function validateOffensiveTiming(
  policy: OffensiveTimingSpec, impactOffsetTicks: number,
): void {
  const integer=(n:number)=>Number.isSafeInteger(n);
  if (!integer(policy.targetOffsetTicks) || policy.targetOffsetTicks<=0 ||
      policy.targetOffsetTicks>=impactOffsetTicks ||
      !integer(policy.goodWindowTicks) || policy.goodWindowTicks<30 ||
      policy.goodWindowTicks>260 ||
      !integer(policy.perfectWindowTicks) || policy.perfectWindowTicks<15 ||
      policy.perfectWindowTicks>=policy.goodWindowTicks ||
      policy.targetOffsetTicks-policy.goodWindowTicks<0 ||
      policy.targetOffsetTicks+policy.goodWindowTicks>=impactOffsetTicks ||
      !Number.isFinite(policy.goodBonus) || policy.goodBonus<0 || policy.goodBonus>.2 ||
      !Number.isFinite(policy.perfectBonus) || policy.perfectBonus<policy.goodBonus ||
      policy.perfectBonus>.3 ||
      !Number.isFinite(policy.chainBonusPerHit) || policy.chainBonusPerHit<0 ||
      policy.chainBonusPerHit>.08 ||
      !integer(policy.maxChain) || policy.maxChain<1 || policy.maxChain>5 ||
      1+policy.perfectBonus+policy.maxChain*policy.chainBonusPerHit>1.5) {
    throw new Error("Invalid offensive timing policy.");
  }
}
export function gradeOffense(offsetTicks:number, policy:OffensiveTimingSpec):OffenseGrade {
  if(!Number.isFinite(offsetTicks))return "miss";
  const distance=Math.abs(offsetTicks);
  if(distance<=policy.perfectWindowTicks)return "perfect";
  if(distance<=policy.goodWindowTicks)return "good";
  return "miss";
}
/** Skipping or missing a timed input preserves ordinary baseline damage. */
export function offensiveMultiplier(
  grade:OffenseGrade|null,chain:number,policy:OffensiveTimingSpec,
):number {
  if(grade===null||grade==="miss")return 1;
  if(!Number.isSafeInteger(chain)||chain<0)throw new Error("Invalid rhythm chain.");
  return 1+(grade==="perfect"?policy.perfectBonus:policy.goodBonus)+
    Math.min(chain,policy.maxChain)*policy.chainBonusPerHit;
}
export const STANDARD_RHYTHM:Readonly<Omit<OffensiveTimingSpec,"targetOffsetTicks">>=
  Object.freeze({
    goodWindowTicks:115,perfectWindowTicks:48,
    goodBonus:.08,perfectBonus:.16,
    chainBonusPerHit:.035,maxChain:3,
  });
