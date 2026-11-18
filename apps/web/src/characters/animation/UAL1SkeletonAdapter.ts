import type { AnatomicalGraphV1 } from "@trilok/character-core";
import type { RetargetJointMappingV1 } from "@trilok/character-core";

/**
 * Explicit UAL1 Standard source-family adapter. Not retargeting mathematics.
 * The upstream Standard rig's suffixes describe its *own* geometry; measured
 * C1 MakeHuman left (-X) corresponds to UAL1 _r. Never infer this from a
 * bare role, because C1 finger roles do not encode their anatomical side.
 */
export function mapUAL1StandardJoints(graph: AnatomicalGraphV1,
  sourceNames: readonly string[]): readonly RetargetJointMappingV1[] {
  const source=new Set<string>(sourceNames);
  if(source.size!==sourceNames.length)
    throw new Error("Duplicate UAL1 source node identifier");
  const map=new Map<string,string>([
    ["pelvis","pelvis"],["spine_lower","spine_01"],
    ["chest","spine_03"],["neck","neck_01"],["head","Head"],
  ]);
  const primary:readonly (readonly [string,string])[]=[
    ["clavicle","clavicle"],["shoulder","upperarm"],["elbow","lowerarm"],
    ["wrist","hand"],["hip","thigh"],["knee","calf"],
    ["ankle","foot"],["toe","ball"],
  ];
  for(const side of ["left","right"] as const) {
    const suffix=side==="left"?"r":"l";
    for(const [target,src] of primary)
      map.set(target+"_"+side,src+"_"+suffix);
    for(const digit of ["thumb","index","middle","ring","little"] as const){
      const name=digit==="little"?"pinky":digit;
      for(let n=0;n<(digit==="thumb"?2:3);n++)
        map.set(`finger_${digit}_${n}_${side}`,
          `${name}_0${n+1}_${suffix}`);
    }
  }
  const used=new Set<string>(), mappings:RetargetJointMappingV1[]=[];
  for(const joint of graph.joints){
    const side=/arm\\[(left|right),/.exec(joint.id)?.[1];
    const key=joint.role.startsWith("finger_") ?
      joint.role+"_"+side:joint.role;
    // Other anatomical modules can share roles: do not silently use the
    // foundation mapping for an extra arm or anatomical extension.
    if(joint.role.startsWith("finger_") && (!side || !/arm\\[(left|right),0\\]/.test(joint.id)))
      continue;
    if(joint.id.includes("arm[") && !/arm\\[(left|right),0\\]/.test(joint.id))
      continue;
    const sourceId=map.get(key);
    if(!sourceId)continue; // explicit unmapped target policy belongs to profile
    if(!source.has(sourceId))
      throw new Error("Missing UAL1 mapped source bone "+sourceId+" for "+joint.id);
    if(used.has(sourceId))
      throw new Error("Ambiguous UAL1 source mapping "+sourceId);
    used.add(sourceId);
    mappings.push({sourceId,targetId:joint.id});
  }
  for(const name of ["pelvis","upperarm_r","upperarm_l","hand_r","hand_l",
    "index_01_r","index_01_l","pinky_03_r","pinky_03_l"]){
    if(!used.has(name))throw new Error("Incomplete UAL1 correspondence "+name);
  }
  return mappings;
}
