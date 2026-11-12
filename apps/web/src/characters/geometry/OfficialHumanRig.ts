import * as THREE from "three";
import type { AnatomicalGraphV1 } from "@trilok/character-core";
import type { AnatomicalTemplate } from "./AnatomicalTemplate";

/**
 * Adapter for the official CC0 MakeHuman default rig/weights DATA, not its
 * AGPL/GPL application code. Source numbers are original OBJ 'v' indices.
 * Calibrated positions belong to this geometry adapter, never the C1 schema.
 */
export interface SourceRig {
  readonly bones: Readonly<Record<string, { readonly parent: string | null;
    readonly head: string; readonly tail: string }>>;
  readonly joints: Readonly<Record<string, readonly number[]>>;
  readonly license: string;
}
export interface SourceWeights {
  readonly weights: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  readonly license: string;
}
export interface RigDiagnostics {
  readonly mappedBones: number;
  readonly unmappedBones: readonly string[];
  readonly unweightedVertices: number;
  readonly usedSourceVertices: number;
  readonly maxBindDisplacementMeters: number;
}
const digits = ["thumb", "index", "middle", "ring", "little"] as const;
type Side = "left" | "right";
const suffix = (side: Side) => side === "right" ? ".L" : ".R";
const sideNames: readonly Side[] = ["left", "right"];

/** Roles are a human-template mapping, not a fixed requirement of C1 anatomy. */
export function sourceBoneForRole(role: string, jointId = ""): string | undefined {
  const bases: Record<string,string> = {
    pelvis:"spine05", spine_lower:"spine03", chest:"spine01", neck:"neck01",
    head:"head", jaw:"jaw",
  };
  if (bases[role]) return bases[role];
  for (const side of sideNames) {
    const s=suffix(side);
    const named: Record<string,string> = {
      ["clavicle_"+side]:"clavicle"+s,
      ["shoulder_"+side]:"upperarm01"+s,
      ["elbow_"+side]:"lowerarm01"+s,
      ["wrist_"+side]:"wrist"+s,
      ["palm_"+side]:"metacarpal1"+s,
      ["hip_"+side]:"upperleg01"+s,
      ["knee_"+side]:"lowerleg01"+s,
      ["ankle_"+side]:"foot"+s,
      ["foot_"+side]:"toe1-1"+s,
      ["toe_"+side]:"toe1-2"+s,
    };
    if (named[role]) return named[role];
    for(let d=0;d<digits.length;d++)for(let n=0;n<(d===0?2:3);n++){
      if(role==="finger_"+digits[d]+"_"+n && jointId.includes("arm["+side+","))
        return "finger"+(d+1)+"-"+(n+1)+s;
    }
  }
  return undefined;
}
function average(source:SourceRig, positions:THREE.BufferAttribute,
  ids:readonly number[]):THREE.Vector3 {
  if(!ids.length)throw new Error("Empty MakeHuman landmark");
  const p=new THREE.Vector3();
  for(const id of ids){
    if(!Number.isSafeInteger(id)||id<0||id>=positions.count)
      throw new Error("Invalid source landmark vertex "+id);
    p.add(new THREE.Vector3().fromBufferAttribute(positions,id));
  }
  return p.multiplyScalar(1/ids.length);
}
/**
 * Landmark coordinates come from the source rig's documented vertex index
 * lists and the same normalization used by the mesh importer. No root scale.
 */
export function makeSourceLandmarks(source:SourceRig, template:AnatomicalTemplate,
  sourcePositions:THREE.BufferAttribute):ReadonlyMap<string,THREE.Vector3> {
  if(source.license!=="CC0")throw new Error("Source skeleton is not CC0");
  const origin=template.sourceOrigin;
  const result=new Map<string,THREE.Vector3>();
  for(const [name,bone] of Object.entries(source.bones)){
    const ids=source.joints[bone.head];
    if(!ids)throw new Error("Missing source landmark "+bone.head);
    const v=average(source,sourcePositions,ids);
    result.set(name,v.sub(new THREE.Vector3(...origin))
      .multiplyScalar(template.conversionMetersPerSourceUnit));
  }
  return result;
}
/**
 * Repositions the C1 runtime bones from measured MakeHuman landmarks. Every
 * joint ID and parent link remains unchanged. Bone inverses are recalculated
 * after calibration and before any poses are applied.
 */
export function calibrateHumanBones(
  graph:AnatomicalGraphV1, bones:ReadonlyMap<string,THREE.Bone>,
  skeleton:THREE.Skeleton, root:THREE.Object3D,
  landmarks:ReadonlyMap<string,THREE.Vector3>,
):number {
  let largest=0;
  root.updateMatrixWorld(true);
  for(const joint of graph.joints){
    const bone=bones.get(joint.id);
    const sourceName=sourceBoneForRole(joint.role,joint.id);
    const world=sourceName?landmarks.get(sourceName):undefined;
    if(!bone||!world)continue;
    const before=bone.getWorldPosition(new THREE.Vector3());
    largest=Math.max(largest,before.distanceTo(world));
    const parent=bone.parent;
    if(!parent)throw new Error("Unparented C1 bone");
    parent.updateWorldMatrix(true,false);
    bone.position.copy(parent.worldToLocal(world.clone()));
    bone.updateMatrixWorld(true);
  }
  root.updateMatrixWorld(true);
  skeleton.calculateInverses();
  return largest;
}
function semanticRoles(graph:AnatomicalGraphV1):Map<string,number> {
  const roles=new Map<string,number>();
  for(let i=0;i<graph.joints.length;i++){
    const role=graph.joints[i]!.role;
    if(role.startsWith("finger_")){
      const side=/arm\\[(left|right),/.exec(graph.joints[i]!.id)?.[1];
      if(side)roles.set(role+"_"+side,i);
    }else if(!roles.has(role))roles.set(role,i);
  }
  return roles;
}
/** MakeHuman's proximal weighted bones have extra twist chains; these are
 * collapsed to C1 roles, which remain stable for future semantic extensions. */
export function sourceWeightRole(sourceName:string):string|undefined {
  const center:Record<string,string>={
    root:"pelvis","spine05":"pelvis","spine04":"spine_lower",
    "spine03":"spine_lower","spine02":"chest","spine01":"chest",
    neck01:"neck",neck02:"neck",neck03:"neck",head:"head",jaw:"jaw",
  };
  if(center[sourceName])return center[sourceName];
  const match=/^(.*)\.(L|R)$/.exec(sourceName);
  if(!match)return undefined;
  const part=match[1]!,side=match[2]==="L"?"right":"left";
  if(part==="pelvis")return "pelvis";
  if(part==="breast")return "chest";
  const basic:Record<string,string>={
    clavicle:"clavicle",shoulder01:"shoulder",upperarm01:"shoulder",
    upperarm02:"shoulder",lowerarm01:"elbow",lowerarm02:"elbow",
    wrist:"wrist",upperleg01:"hip",upperleg02:"hip",
    lowerleg01:"knee",lowerleg02:"ankle",foot:"foot",
  };
  if(basic[part])return basic[part]+"_"+side;
  if(/^metacarpal[1-4]$/.test(part))return "palm_"+side;
  const finger=/^finger([1-5])-([1-3])$/.exec(part);
  if(finger){
    const digit=Number(finger[1])-1;
    // C1 thumb has two phalanges; its distal third shares the second.
    const n=Math.min(Number(finger[2])-1,digit===0?1:2);
    return "finger_"+digits[digit]+"_"+n+"_"+side;
  }
  if(/^toe[1-5]-[1-3]$/.test(part))return "toe_"+side;
  return undefined;
}
export function applyOfficialSkinWeights(template:AnatomicalTemplate,
  graph:AnatomicalGraphV1, rig:SourceRig, data:SourceWeights):RigDiagnostics {
  if(rig.license!=="CC0"||data.license!=="CC0")
    throw new Error("Source skin data must be CC0");
  const roles=semanticRoles(graph);
  const resolved=new Map<string,number>();
  const unmapped:string[]=[];
  for(const name of Object.keys(data.weights).sort()){
    let current:string|null=name;
    const seen=new Set<string>();
    let target:number|undefined;
    while(current&&!seen.has(current)){
      seen.add(current);
      const role=sourceWeightRole(current);
      if(role!==undefined)target=roles.get(role);
      if(target!==undefined)break;
      current=rig.bones[current]?.parent??null;
    }
    if(target===undefined){unmapped.push(name);continue;}
    resolved.set(name,target);
  }
  // Exact source-index lookup guarantees UV duplicates and future morph deltas
  // have identical weights. No global nearest-segment cross-limb assignment.
  const perSource=new Map<number,Map<number,number>>();
  for(const [name,entries] of Object.entries(data.weights)){
    const index=resolved.get(name);
    if(index===undefined)continue;
    for(const [id,weight] of entries){
      if(!Number.isSafeInteger(id)||id<0||id>=template.sourceVertexCount||
        !Number.isFinite(weight)||weight<0||weight>1)
        throw new Error("Invalid official MakeHuman skin weight");
      if(weight===0)continue;
      let bucket=perSource.get(id);
      if(!bucket){bucket=new Map();perSource.set(id,bucket);}
      bucket.set(index,(bucket.get(index)??0)+weight);
    }
  }
  const indices:number[]=[],weights:number[]=[];
  let unweighted=0;
  const fallback=roles.get("pelvis");
  if(fallback===undefined)throw new Error("Missing pelvis role");
  for(const sourceId of template.sourceVertexIds){
    const influences=perSource.get(sourceId);
    const ordered=[...(influences??new Map<number,number>())]
      .sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4);
    if(!ordered.length){unweighted++;ordered.push([fallback,1]);}
    const total=ordered.reduce((sum,item)=>sum+item[1],0);
    if(!Number.isFinite(total)||total<=0)throw new Error("Invalid summed skin weights");
    let used=0;
    for(let k=0;k<4;k++){
      indices.push(ordered[k]?.[0]??fallback);
      const w=k===ordered.length-1?Math.max(0,1-used):
        (ordered[k]?.[1]??0)/total;
      weights.push(w);used+=w;
    }
  }
  template.geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(indices,4));
  template.geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(weights,4));
  return {mappedBones:resolved.size,unmappedBones:unmapped,unweightedVertices:unweighted,
    usedSourceVertices:perSource.size,maxBindDisplacementMeters:0};
}
