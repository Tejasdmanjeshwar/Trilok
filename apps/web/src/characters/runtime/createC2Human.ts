import * as THREE from "three";
import { createAnatomyPreset, validateAnatomicalGraph,
  type AnatomicalGraphV1, type SemanticJointV1, type Vec3 } from "@trilok/character-core";
import { SemanticCharacter } from "./SemanticCharacter";
import { parseHm08HumanOBJ, type HumanTopologyStats } from "../geometry/Hm08Topology";
import { validateSkinnedHuman, type SkinnedHumanValidation } from "../geometry/validateSkinnedHuman";

export interface C2Human {
  readonly character: SemanticCharacter;
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: ReadonlyMap<string,THREE.Bone>;
  readonly topology: HumanTopologyStats;
  readonly validation: SkinnedHumanValidation;
  readonly restGraph: AnatomicalGraphV1;
  dispose(): void;
}
/**
 * Calibrate the semantic A-pose landmarks to the neutral CC0 hm08 body bounds.
 * This changes *local rest translations* before binding; no global/root scaling.
 * Full shape calibration, corrective morphs and detailed hand weights are C3 work.
 */
function calibratedRestGraph():AnatomicalGraphV1 {
  const original=createAnatomyPreset({archetype:"human"});
  const rootHeights:Readonly<Record<string,Vec3>>={
    pelvis:[0,.90,0],spine_lower:[0,.13,0],chest:[0,.23,0],
    neck:[0,.17,0],head:[0,.15,0],jaw:[0,-.09,.045],
    clavicle_left:[-.145,.08,0],clavicle_right:[.145,.08,0],
    shoulder_left:[-.10,0,0],shoulder_right:[.10,0,0],
    elbow_left:[-.12,-.20,0],elbow_right:[.12,-.20,0],
    wrist_left:[-.08,-.16,0],wrist_right:[.08,-.16,0],
    palm_left:[-.042,-.05,0],palm_right:[.042,-.05,0],
    hip_left:[-.12,-.055,0],hip_right:[.12,-.055,0],
    knee_left:[0,-.39,.015],knee_right:[0,-.39,.015],
    ankle_left:[0,-.36,-.015],ankle_right:[0,-.36,-.015],
    foot_left:[0,-.06,.075],foot_right:[0,-.06,.075],
    toe_left:[0,0,.11],toe_right:[0,0,.11],
  };
  const graph:AnatomicalGraphV1={
    ...original,
    joints:original.joints.map(j=>{
      const translation=rootHeights[j.role];
      return translation?{...j,bindTranslation:translation}:j;
    }),
    skinBindings:[{meshId:"hm08_body_c2",maxInfluencesPerVertex:4,
      jointIds:original.joints.filter(j=>j.exported).map(j=>j.id)}],
  };
  validateAnatomicalGraph(graph);
  return graph;
}
function sourcePalette(graph:AnatomicalGraphV1,bones:ReadonlyMap<string,THREE.Bone>):
  ReadonlyMap<string,{index:number,point:THREE.Vector3}> {
  const map=new Map<string,{index:number,point:THREE.Vector3}>();
  graph.joints.forEach((j,index)=>{
    const bone=bones.get(j.id)!;
    map.set(j.role,{index,point:bone.getWorldPosition(new THREE.Vector3())});
  });
  return map;
}
/** Distances in bind-space to anatomical joints; not hardcoded mesh vertex IDs. */
function bindWeights(geometry:THREE.BufferGeometry,graph:AnatomicalGraphV1,
  bones:ReadonlyMap<string,THREE.Bone>):void {
  const palette=sourcePalette(graph,bones);
  const positions=geometry.getAttribute("position");
  const indices=new Uint16Array(positions.count*4);
  const weights=new Float32Array(positions.count*4);
  const left=["clavicle_left","shoulder_left","elbow_left","wrist_left","palm_left"];
  const right=["clavicle_right","shoulder_right","elbow_right","wrist_right","palm_right"];
  const legLeft=["pelvis","hip_left","knee_left","ankle_left","foot_left","toe_left"];
  const legRight=["pelvis","hip_right","knee_right","ankle_right","foot_right","toe_right"];
  const torso=["pelvis","spine_lower","chest","neck","head","clavicle_left","clavicle_right"];
  const head=["head","neck","chest"];
  const point=new THREE.Vector3();
  const smooth=(start:number,end:number,value:number):number=>{
    const t=Math.max(0,Math.min(1,(value-start)/(end-start)));
    return t*t*(3-2*t);
  };
  for(let v=0;v<positions.count;v++) {
    point.fromBufferAttribute(positions,v);
    const ax=Math.abs(point.x);
    // Soft continuous anatomical field masks replace abrupt y/x cutoffs:
    // the previous hard leg/torso and arm/torso boundaries visibly sheared
    // the skin under crouch and shoulder elevation.
    const h=smooth(1.40,1.64,point.y)*(1-smooth(.15,.29,ax));
    const a=smooth(.16,.34,ax)*smooth(.94,1.12,point.y)*
      (1-smooth(1.51,1.69,point.y));
    const l=1-smooth(.77,1.10,point.y);
    const rest=1-h;
    const armMix=rest*a;
    const legMix=rest*(1-a)*l;
    const torsoMix=rest*(1-a)*(1-l);
    const split=smooth(-.09,.09,point.x);
    const groups:readonly {readonly factor:number;readonly roles:readonly string[]}[]=[
      {factor:h,roles:head},
      {factor:armMix,roles:point.x<0?left:right},
      {factor:legMix*(1-split),roles:legLeft},
      {factor:legMix*split,roles:legRight},
      {factor:torsoMix,roles:torso},
    ];
    const blended=new Map<number,number>();
    for(const group of groups) {
      if(group.factor<1e-8)continue;
      const local=group.roles.map(role=>{
        const entry=palette.get(role);
        if(!entry)throw new Error("Missing C2 bone role: "+role);
        const distance=point.distanceTo(entry.point);
        return {index:entry.index,score:1/Math.pow(distance+.055,2.8)};
      });
      const denominator=local.reduce((sum,c)=>sum+c.score,0);
      if(!Number.isFinite(denominator)||denominator<=0)
        throw new Error("Invalid C2 anatomical weight field");
      for(const candidate of local) {
        blended.set(candidate.index,(blended.get(candidate.index)??0)+
          group.factor*candidate.score/denominator);
      }
    }
    const candidates=[...blended].map(([index,score])=>({index,score}))
      .sort((a,b)=>b.score-a.score || a.index-b.index).slice(0,4);
    const total=candidates.reduce((sum,c)=>sum+c.score,0);
    if(!Number.isFinite(total)||total<=0)throw new Error("Invalid skin candidate sum");
    // Truncate to a WebGL2/glTF-compatible four bones, normalize in Float32,
    // and assign the rounding residual to the last *real* influence.
    let allocated=0;
    candidates.forEach((c,i)=>{
      indices[v*4+i]=c.index;
      const w=i===candidates.length-1
        ?Math.max(0,1-allocated):Math.fround(c.score/total);
      weights[v*4+i]=w;
      allocated+=w;
    });
  }
  geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(indices,4));
  geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(weights,4));
}

export function createC2Human(objText:string):C2Human {
  const graph=calibratedRestGraph();
  const {geometry,stats}=parseHm08HumanOBJ(objText);
  const material=new THREE.MeshStandardMaterial({
    color:0xb78b70,roughness:.82,metalness:0,side:THREE.FrontSide,
  });
  const root=new THREE.Group();root.name="C2Human";
  const boneMap=new Map<string,THREE.Bone>();
  try{
    for(const joint of graph.joints) {
      const bone=new THREE.Bone();
      bone.name=joint.id;
      bone.position.set(...joint.bindTranslation);
      bone.quaternion.set(...joint.bindQuaternion);
      const parent=joint.parentId?boneMap.get(joint.parentId):root;
      if(!parent)throw new Error("Missing C2 bone parent: "+joint.parentId);
      parent.add(bone);boneMap.set(joint.id,bone);
    }
    root.updateWorldMatrix(true,true);
    bindWeights(geometry,graph,boneMap);
    const mesh=new THREE.SkinnedMesh(geometry,material);
    mesh.name="C2HumanBody";
    mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;
    root.add(mesh);
    root.updateWorldMatrix(true,true);
    const skeleton=new THREE.Skeleton(graph.joints.map(j=>boneMap.get(j.id)!));
    mesh.bind(skeleton);
    const validation=validateSkinnedHuman(mesh);
    const character=new SemanticCharacter(graph,root,boneMap,{
      ownedResources:[geometry,material,skeleton],detachRootOnDispose:true,
    });
    return {character,mesh,bones:boneMap,restGraph:graph,topology:stats,validation,
      dispose:()=>character.dispose()};
  }catch(error) {
    material.dispose();geometry.dispose();root.removeFromParent();
    throw error;
  }
}
