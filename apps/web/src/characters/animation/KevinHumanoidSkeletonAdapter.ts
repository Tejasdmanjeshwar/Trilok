import type { AnatomicalGraphV1, RetargetJointMappingV1, Vec3 } from "@trilok/character-core";

/**
 * C6.3 Kevin Iglesias regular-FBX-7700 male rig source adapter.
 * Source .L is positive world-X; C1 MakeHuman's "left" is negative world-X.
 * This anatomical reversal is measured in the original FBX bind matrices;
 * never infer the mapping from a clip or apply an animation-specific offset.
 *
 * This file contains no Kevin animation keys or distributable source assets.
 * It is a source-family mapping, NOT a separate retargeter.
 */
const BODY: Readonly<Record<string, string>> = {
  pelvis: "B-hips", spine_lower: "B-spine", chest: "B-chest",
  neck: "B-neck", head: "B-head",
};
const LIMBS = [
  ["clavicle", "shoulder"], ["shoulder", "upperArm"],
  ["elbow", "forearm"], ["wrist", "hand"],
  ["hip", "thigh"], ["knee", "shin"],
  ["ankle", "foot"], ["toe", "toe"],
] as const;
const DIGITS = ["thumb", "index", "middle", "ring", "little"] as const;
const SOURCE_DIGIT: Readonly<Record<string,string>> = {
  thumb: "thumb", index: "indexFinger", middle: "middleFinger",
  ring: "ringFinger", little: "pinky",
};
const SOURCE_ONLY = [
  "B-root", "B-spineProxy", "B-jaw",
  "B-handProp.L", "B-handProp.R", "B-thumb03.L", "B-thumb03.R",
] as const;

/** Metadata from the owner's exact regular ZIP. These are not clip hashes. */
export const KEVIN_BASIC_MOTIONS_MALE_SOURCE = Object.freeze({
  archiveSha256: "063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd",
  fbxVersion: 7700,
  sourceBoneCount: 56,
  mappedC1JointCount: 49,
  clips: Object.freeze([
    "Animations/Male/Idles/HumanM@Idle01.fbx",
    "Animations/Male/Movement/Walk/HumanM@Walk01_Forward.fbx",
    "Animations/Male/Movement/Run/HumanM@Run01_Forward.fbx",
  ]),
});

export const KEVIN_SOURCE_ONLY_BONES: readonly string[] = SOURCE_ONLY;

function mappingTable(): ReadonlyMap<string,string> {
  const map = new Map<string,string>(Object.entries(BODY));
  for (const side of ["left","right"] as const) {
    // C1 -X left corresponds to source .R (-X), and conversely.
    const suffix = side === "left" ? "R" : "L";
    for (const [role,source] of LIMBS)
      map.set(role+"_"+side,"B-"+source+"."+suffix);
    for (const digit of DIGITS)
      for (let index=0;index<(digit==="thumb"?2:3);index++)
        map.set(`finger_${digit}_${index}_${side}`,
          `B-${SOURCE_DIGIT[digit]}${String(index+1).padStart(2,"0")}.${suffix}`);
  }
  return map;
}
const correspondence = mappingTable();

export const KEVIN_MALE_REQUIRED_SOURCE_BONES: readonly string[] =
  Object.freeze([...correspondence.values(), ...SOURCE_ONLY]);

/**
 * Exact semantic source-to-C1 map, including individual finger joints.
 * Only the seven explicitly documented source-only nodes may be omitted.
 * The third thumb phalanx has no independently controlled C1 counterpart.
 * C1 palm and foot-proxy helpers inherit the target rest policy.
 */
export function mapKevinMaleHumanoidJoints(
  graph: AnatomicalGraphV1, sourceNames: readonly string[],
): readonly RetargetJointMappingV1[] {
  const names = new Set(sourceNames);
  if(names.size!==sourceNames.length)
    throw new Error("Duplicate Kevin source bone");
  if(names.size!==KEVIN_BASIC_MOTIONS_MALE_SOURCE.sourceBoneCount ||
    names.size!==KEVIN_MALE_REQUIRED_SOURCE_BONES.length ||
    KEVIN_MALE_REQUIRED_SOURCE_BONES.some(name=>!names.has(name)) ||
    sourceNames.some(name=>!KEVIN_MALE_REQUIRED_SOURCE_BONES.includes(name)))
    throw new Error("Kevin FBX topology differs from audited 56-bone male rig");
  const mapped:RetargetJointMappingV1[]=[];
  const used = new Set<string>();
  for(const joint of graph.joints) {
    const finger=/^finger_(thumb|index|middle|ring|little)_([0-2])$/.test(joint.role);
    const side= finger
      ? /arm\[(left|right),0\]/.exec(joint.id)?.[1]
      : /_(left|right)$/.exec(joint.role)?.[1];
    if(joint.id.includes("arm[") && !/arm\[(left|right),0\]/.test(joint.id))
      continue;
    const key=finger ? joint.role+"_"+side : joint.role;
    const sourceId=correspondence.get(key);
    if(!sourceId) continue;
    if(used.has(sourceId))throw new Error("Ambiguous Kevin source correspondence "+sourceId);
    used.add(sourceId);
    mapped.push({sourceId,targetId:joint.id});
  }
  if(mapped.length!==KEVIN_BASIC_MOTIONS_MALE_SOURCE.mappedC1JointCount ||
    [...correspondence.values()].some(id=>!used.has(id)))
    throw new Error("Missing C1 Kevin humanoid correspondence");
  return mapped;
}

export interface KevinWorldRestLandmark {
  readonly id: string;
  readonly worldPosition: Vec3;
}

/** Check physical handedness AFTER FBX Z-up -> C1 Y-up axis normalization. */
export function validateKevinMaleRestLaterality(
  samples: readonly KevinWorldRestLandmark[],
): void {
  const byId=new Map(samples.map(s=>[s.id,s.worldPosition]));
  if(byId.size!==samples.length)throw Error("Duplicate Kevin rest landmark");
  for(const role of ["hand","thigh","foot","indexFinger01","pinky01"]) {
    const right=byId.get("B-"+role+".R");
    const left=byId.get("B-"+role+".L");
    if(!right||!left || [...right,...left].some(v=>!Number.isFinite(v)) ||
      !(right[0]<-1e-5 && left[0]>1e-5) ||
      Math.abs(right[0]+left[0])>.2*Math.max(Math.abs(right[0]),Math.abs(left[0])))
      throw Error("Kevin source right/left orientation not measured: "+role);
  }
}
