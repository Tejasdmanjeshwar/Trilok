import * as THREE from "three";
import { createAnatomyPreset, type AnatomicalGraphV1 } from "@trilok/character-core";
import { SemanticCharacter } from "../runtime/SemanticCharacter";

/**
 * C2 feasibility rig: actual GPU skinned mesh with normalized weights and
 * deterministic ring topology. Surface consists of separate closed diagnostic
 * limb segments, NOT a continuous anatomical human. Never use as final art.
 */
export interface SkinningSpike {
  readonly graph: AnatomicalGraphV1;
  readonly character: SemanticCharacter;
  readonly mesh: THREE.SkinnedMesh;
  readonly skeleton: THREE.Skeleton;
  readonly bones: ReadonlyMap<string, THREE.Bone>;
  /** Optional render-only proximal forearm references; never C1 semantic joints. */
  readonly forearmSkinBones?: ReadonlyMap<"left" | "right", THREE.Bone>;
  /** CC0 shoulder01 presentation-only connector bones (not semantic joints). */
  readonly shoulderSkinBones?: ReadonlyMap<"left" | "right", THREE.Bone>;
  readonly vertexCount: number;
  readonly triangleCount: number;
  dispose(): void;
}
export interface SpikeOptions {
  readonly headFamily?: "primate" | "bear";
  readonly heightScale?: number;
  readonly shoulderScale?: number;
  /** Add non-twisting proximal skin references for official imported weights. */
  readonly forearmSkinning?: boolean;
  /** Preserve the CC0 shoulder01 source-weight region as an intermediate skin reference. */
  readonly shoulderSkinning?: boolean;
}
function finiteScale(value:number|undefined,name:string):number {
  const n=value??1;
  if(!Number.isFinite(n)||n<.85||n>1.15)throw new Error("Invalid "+name);
  return n;
}
export function createSkinningSpike(options:SpikeOptions={}):SkinningSpike {
  const height=finiteScale(options.heightScale,"heightScale");
  const shoulder=finiteScale(options.shoulderScale,"shoulderScale");
  const graph=createAnatomyPreset(options.headFamily ?
    {archetype:"animal_head",animalHeadKind:options.headFamily} :
    {archetype:"human"});
  const root=new THREE.Group();
  root.name="C2_DIAGNOSTIC_ONLY";
  const bones=new Map<string,THREE.Bone>();
  const boneList:THREE.Bone[]=[];
  for(const joint of graph.joints) {
    const bone=new THREE.Bone();
    bone.name=joint.id;
    bone.position.set(...joint.bindTranslation);
    if(joint.role.startsWith("clavicle_"))bone.position.x*=shoulder;
    if(joint.role==="pelvis")bone.position.y*=height;
    else bone.position.y*=height;
    bone.quaternion.set(...joint.bindQuaternion);
    (joint.parentId===null?root:bones.get(joint.parentId)!).add(bone);
    bones.set(joint.id,bone);
    boneList.push(bone);
  }
  // The source lowerarm01 and lowerarm02 have different weighted skin
  // segments. Keep the proximal skin free of axial twist while the original
  // C1 elbow and wrist retain their full, unchanged articulation.
  // Each helper is a sibling of its elbow, not a C1 joint or wrist parent.
  const forearmSkinBones = new Map<"left" | "right", THREE.Bone>();
  if(options.forearmSkinning){
    for(const side of ["left","right"] as const){
      const elbowJoint=graph.joints.find(j=>j.role==="elbow_"+side);
      const elbow=elbowJoint?bones.get(elbowJoint.id):undefined;
      if(!elbow?.parent)throw new Error("Missing C1 forearm skin anchor");
      const helper=new THREE.Bone();
      helper.name="C2_SKIN_PROXIMAL_FOREARM_"+side.toUpperCase();
      helper.position.copy(elbow.position);
      helper.quaternion.copy(elbow.quaternion);
      elbow.parent.add(helper);
      forearmSkinBones.set(side,helper);
      boneList.push(helper);
    }
  }
  // The CC0 shoulder01 source connector sits between clavicle and
  // upperarm01; skinning it directly to the clavicle pins the axilla during
  // elevation. This helper is a sibling of the semantic shoulder, and is
  // NEVER a parent of any semantic joint.
  const shoulderSkinBones=new Map<"left"|"right",THREE.Bone>();
  if(options.shoulderSkinning){
    for(const side of ["left","right"] as const){
      const shoulderJoint=graph.joints.find(j=>j.role==="shoulder_"+side);
      const shoulder=shoulderJoint?bones.get(shoulderJoint.id):undefined;
      if(!shoulder?.parent)throw new Error("Missing C1 shoulder skin anchor");
      const helper=new THREE.Bone();
      helper.name="C2_SKIN_SHOULDER_CONNECTOR_"+side.toUpperCase();
      helper.position.copy(shoulder.position);
      helper.quaternion.copy(shoulder.quaternion);
      shoulder.parent.add(helper);
      shoulderSkinBones.set(side,helper);
      boneList.push(helper);
    }
  }
  root.updateMatrixWorld(true);
  const centers=new Map<string,THREE.Vector3>();
  for(const [id,bone] of bones)centers.set(id,bone.getWorldPosition(new THREE.Vector3()));
  const indices:number[]=[];
  const positions:number[]=[];
  const normals:number[]=[];
  const uvs:number[]=[];
  const skinIndices:number[]=[];
  const skinWeights:number[]=[];
  const segments=graph.segments;
  const jointIndex=new Map(graph.joints.map((j,i)=>[j.id,i]));
  const ringSides=12;
  const rings=7;
  function addDiagnosticSurface(from:THREE.Vector3,to:THREE.Vector3,
    startJoint:number,endJoint:number,radius:number):void {
    const axis=new THREE.Vector3().subVectors(to,from);
    const length=axis.length();
    if(length<.025)return;
    axis.normalize();
    const side=new THREE.Vector3(0,0,1);
    if(Math.abs(axis.dot(side))>.92)side.set(1,0,0);
    const tangent=new THREE.Vector3().crossVectors(axis,side).normalize();
    const bitangent=new THREE.Vector3().crossVectors(axis,tangent).normalize();
    const first=positions.length/3;
    for(let i=0;i<=rings;i++){
      const t=i/rings;
      const center=from.clone().lerp(to,t);
      // Cap end rings to create closed diagnostics. Not a skin-sever seam.
      const taper=(i===0||i===rings)?0.02:Math.sin(Math.PI*t)*.12+.88;
      for(let j=0;j<ringSides;j++){
        const theta=j*2*Math.PI/ringSides;
        const normal=tangent.clone().multiplyScalar(Math.cos(theta))
          .addScaledVector(bitangent,Math.sin(theta));
        const point=center.clone().addScaledVector(normal,radius*taper);
        positions.push(point.x,point.y,point.z);
        normals.push(normal.x,normal.y,normal.z);
        uvs.push(j/ringSides,t);
        const w=t*t*(3-2*t);
        skinIndices.push(startJoint,endJoint,0,0);
        skinWeights.push(1-w,w,0,0);
      }
    }
    for(let i=0;i<rings;i++)for(let j=0;j<ringSides;j++){
      const a=first+i*ringSides+j;
      const b=first+i*ringSides+(j+1)%ringSides;
      const c=a+ringSides,d=b+ringSides;
      indices.push(a,c,b,b,c,d);
    }
    const a=positions.length/3;
    positions.push(from.x,from.y,from.z,to.x,to.y,to.z);
    normals.push(-axis.x,-axis.y,-axis.z,axis.x,axis.y,axis.z);
    uvs.push(.5,0,.5,1);
    skinIndices.push(startJoint,0,0,0,endJoint,0,0,0);
    skinWeights.push(1,0,0,0,1,0,0,0);
    for(let j=0;j<ringSides;j++){
      const next=(j+1)%ringSides;
      indices.push(a,first+j,first+next);
      const top=first+rings*ringSides;
      indices.push(a+1,top+next,top+j);
    }
  }
  for(const seg of segments){
    if(!seg.parentId)continue;
    const parent=segments.find(s=>s.id===seg.parentId)!;
    const from=centers.get(parent.proximalJointId)!;
    const to=centers.get(seg.proximalJointId)!;
    const role=graph.joints.find(j=>j.id===seg.proximalJointId)!.role;
    const radius=role.includes("spine")||role==="chest" ? .14 :
      role.includes("hip")?.105:role.includes("knee")?.082:
      role.includes("shoulder")?.075:role.includes("elbow")?.058:
      role.includes("wrist")?.045:role.includes("neck")?.07:
      role.includes("head")?.095:role.includes("palm")?.038:.016;
    addDiagnosticSurface(from,to,jointIndex.get(parent.proximalJointId)!,
      jointIndex.get(seg.proximalJointId)!,radius*height);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(skinIndices,4));
  geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(skinWeights,4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({color:0xb38b70,roughness:.86,metalness:0,
    side:THREE.DoubleSide});
  const mesh=new THREE.SkinnedMesh(geometry,material);
  mesh.name="C2_SKINNING_DIAGNOSTIC_NOT_CHARACTER_ART";
  mesh.frustumCulled=false;
  root.add(mesh);
  const skeleton=new THREE.Skeleton(boneList);
  mesh.bind(skeleton);
  const character=new SemanticCharacter(graph,root,bones,{
    ownedResources:[geometry,material,skeleton],detachRootOnDispose:true,
  });
  let disposed=false;
  return {graph,character,mesh,skeleton,bones,
    forearmSkinBones:options.forearmSkinning?forearmSkinBones:undefined,
    shoulderSkinBones:options.shoulderSkinning?shoulderSkinBones:undefined,
    vertexCount:positions.length/3,triangleCount:indices.length/3,
    dispose(){if(disposed)return;disposed=true;character.dispose();}};
}
/** Checks exported GPU attributes, without claiming visual/anatomical correctness. */
export function validateSkinningSpike(spike:SkinningSpike):void {
  const g=spike.mesh.geometry;
  const p=g.getAttribute("position"),w=g.getAttribute("skinWeight"),ids=g.getAttribute("skinIndex");
  const uv=g.getAttribute("uv");
  if(!p||!w||!ids||!uv||p.count!==w.count||p.count!==ids.count||p.count!==uv.count)
    throw new Error("Missing or inconsistent skinned attributes");
  const forearmExtra=spike.forearmSkinBones?.size??0;
  const shoulderExtra=spike.shoulderSkinBones?.size??0;
  if(spike.skeleton.bones.length!==spike.graph.joints.length+
      forearmExtra+shoulderExtra ||
    (forearmExtra!==0&&forearmExtra!==2)||
    (shoulderExtra!==0&&shoulderExtra!==2))
    throw new Error("Skeleton joint mismatch");
  for(const [offset,side] of (["left","right"] as const).entries()){
    const helper=spike.forearmSkinBones?.get(side);
    if(!helper)continue;
    const joint=spike.graph.joints.find(j=>j.role==="elbow_"+side);
    const elbow=joint?spike.bones.get(joint.id):undefined;
    if(!elbow||helper.parent!==elbow.parent||
      spike.skeleton.bones[spike.graph.joints.length+offset]!==helper)
      throw new Error("Invalid proximal forearm skin anchor");
  }
  for(const [offset,side] of (["left","right"] as const).entries()){
    const helper=spike.shoulderSkinBones?.get(side);
    if(!helper)continue;
    const joint=spike.graph.joints.find(j=>j.role==="shoulder_"+side);
    const shoulder=joint?spike.bones.get(joint.id):undefined;
    if(!shoulder||helper.parent!==shoulder.parent||
      spike.skeleton.bones[spike.graph.joints.length+forearmExtra+offset]!==helper)
      throw new Error("Invalid shoulder skin connector");
  }
  for(let i=0;i<p.count;i++){
    let total=0;
    for(let j=0;j<4;j++){
      const weight=w.getComponent(i,j),index=ids.getComponent(i,j);
      if(!Number.isFinite(weight)||weight<0||!Number.isSafeInteger(index)||
        index<0||index>=spike.skeleton.bones.length)
        throw new Error("Invalid skin influence "+i);
      total+=weight;
    }
    if(Math.abs(total-1)>1e-5)throw new Error("Unnormalized skin influence "+i);
    for(let j=0;j<3;j++)if(!Number.isFinite(p.getComponent(i,j)))
      throw new Error("Nonfinite position "+i);
    for(let j=0;j<2;j++)if(!Number.isFinite(uv.getComponent(i,j)))
      throw new Error("Nonfinite UV "+i);
  }
  const idx=g.getIndex();
  if(!idx||idx.count%3)throw new Error("Missing triangles");
  for(let i=0;i<idx.count;i+=3){
    const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);
    if(a===b||b===c||a===c)throw new Error("Repeated triangle index");
  }
  for(const inverse of spike.skeleton.boneInverses){
    if(!inverse.elements.every(Number.isFinite))throw new Error("Nonfinite inverse bind matrix");
    if(Math.abs(inverse.determinant())<1e-10)throw new Error("Singular inverse bind matrix");
  }
}
