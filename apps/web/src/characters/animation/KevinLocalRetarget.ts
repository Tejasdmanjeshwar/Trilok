/**
 * C6.3 — Kevin Iglesias local-only source adapter.
 * One source-family profile covers every FBX with the same verified rest rig.
 * The owner's licensed FBX remains in browser memory; only a caller-owned
 * AnimationClipV1 reaches existing Studio playback. No runtime skeleton fork.
 */
import * as THREE from "three";
import {
  canonicalRigIdentity, createHumanRestDescriptor, createRetargetProfile,
  retargetWorldPose, serializeAnimationClip, parseAnimationClip,
  type AnatomicalGraphV1, type AnimationClipV1,
  type RetargetJointMappingV1, type Quat, type Vec3,
} from "@trilok/character-core";
import {
  mapKevinMaleHumanoidJoints, validateKevinMaleRestLaterality,
} from "./KevinHumanoidSkeletonAdapter";
import {
  importOwnedKevinZip, kevinHex, KEVIN_INITIAL_FBX,
} from "./KevinLocalZip";

const encoder=new TextEncoder();
const MAX_TRACK_SAMPLES=8192;
const SOURCE_REVISION="human-basic-motions-free-fbx7700";
const SOURCE_ORIGIN="https://assetstore.unity.com/packages/3d/animations/human-basic-motions-free-154271";
const SOURCE_REST_EPS=1e-4;
const vec=(v:THREE.Vector3):Vec3=>[v.x,v.y,v.z];
const quat=(q:THREE.Quaternion):Quat=>[q.x,q.y,q.z,q.w];
const pos=(o:THREE.Object3D)=>vec(o.getWorldPosition(new THREE.Vector3()));
const rot=(o:THREE.Object3D)=>quat(o.getWorldQuaternion(new THREE.Quaternion()));
const digest=async(v:unknown)=>kevinHex(encoder.encode(JSON.stringify(v)).buffer);
const clampDot=(a:readonly number[],b:readonly number[])=>Math.min(1,Math.abs(a.reduce((n,v,i)=>n+v*b[i]!,0)));
const canonicalName=(node:THREE.Bone):string=>{
  const name=node.userData.originalName??node.name;
  if(typeof name!=="string"||!name.startsWith("B-"))
    throw Error("Unrecognized Kevin source bone name");
  return name.replace(/^(B-.*?)[_.]([LR])$/,"$1.$2");
};
const sourceBones=(scene:THREE.Group):Map<string,THREE.Bone>=>{
  const bones=new Map<string,THREE.Bone>();
  scene.traverse(o=>{
    if(!(o instanceof THREE.Bone))return;
    const name=canonicalName(o);
    if(bones.has(name))throw Error("Duplicate FBX bone: "+name);
    bones.set(name,o);
  });
  if(bones.size!==56)throw Error("Expected 56 Kevin source bones, found "+bones.size);
  return bones;
};
/** Normalize FBX declared Z-up and centimeters once at source scene root. */
function normalizeSource(scene:THREE.Group):Map<string,THREE.Bone> {
  if(scene.quaternion.angleTo(new THREE.Quaternion())>1e-5 ||
    scene.scale.distanceTo(new THREE.Vector3(1,1,1))>1e-5)
    throw Error("Unexpected FBXLoader root transform. Check FBX axis/unit conversion.");
  scene.rotateX(-Math.PI/2);
  scene.scale.setScalar(.01);
  scene.updateMatrixWorld(true);
  const bones=sourceBones(scene);
  const hip=bones.get("B-hips")?.getWorldPosition(new THREE.Vector3());
  const head=bones.get("B-head")?.getWorldPosition(new THREE.Vector3());
  const handL=bones.get("B-hand.L")?.getWorldPosition(new THREE.Vector3());
  const handR=bones.get("B-hand.R")?.getWorldPosition(new THREE.Vector3());
  if(!hip||!head||!handL||!handR||
    hip.y<.7||hip.y>1.3||head.y<hip.y+.3||
    handL.x<.4||handR.x>-.4)
    throw Error("Kevin FBX rest axes/scale did not match audited source geometry");
  return bones;
}
function sourceRestRecord(bones:ReadonlyMap<string,THREE.Bone>) {
  return [...bones].map(([id,bone])=>({
    id,parent:bone.parent instanceof THREE.Bone?canonicalName(bone.parent):null,
    position:pos(bone),rotation:rot(bone),
  })).sort((a,b)=>a.id.localeCompare(b.id));
}
function assertRestMatch(reference:ReturnType<typeof sourceRestRecord>,
  candidate:ReturnType<typeof sourceRestRecord>):void {
  if(reference.length!==candidate.length)throw Error("Kevin male source rig size mismatch");
  for(let i=0;i<reference.length;i++){
    const a=reference[i]!,b=candidate[i]!;
    if(a.id!==b.id||a.parent!==b.parent||
      Math.max(...a.position.map((v,j)=>Math.abs(v-b.position[j]!)))>SOURCE_REST_EPS||
      1-clampDot(a.rotation,b.rotation)>1e-8)
      throw Error("Kevin FBX bind/rest differs: "+a.id+"; shared profile invalid");
  }
}
function freezeProfile<T>(object:T):T {
  if(object!==null&&typeof object==="object"&&!Object.isFrozen(object)){
    Object.values(object).forEach(freezeProfile);
    Object.freeze(object);
  }
  return object;
}
function selectedTimes(clip:THREE.AnimationClip):number[] {
  const duration=clip.duration;
  if(!Number.isFinite(duration)||duration<=0||duration>120)
    throw Error("Invalid Kevin animation duration");
  const keys=[0,duration,...clip.tracks.flatMap(t=>Array.from(t.times,
    v=>Math.max(0,Math.min(duration,Math.round(v*1e7)/1e7))))];
  const unique=[...new Set(keys)].sort((a,b)=>a-b);
  if(unique.length<2||unique.length*49>MAX_TRACK_SAMPLES)
    throw Error("Kevin clip exceeds canonical sampling budget");
  return unique;
}
export interface KevinLocalCandidate {
  readonly id:string;
  readonly label:string;
  readonly sourceSha256:string;
  readonly clip:AnimationClipV1;
  readonly maxLoopSeamDegrees:number;
  readonly keyCount:number;
}
export interface KevinLocalResult {
  readonly archiveSha256:string;
  readonly sourceRigSha256:string;
  readonly targetRigSha256:string;
  readonly profileSha256:string;
  readonly candidates:readonly KevinLocalCandidate[];
}
export type KevinRequestedAnimation = readonly [id:string,path:string];
/**
 * Accepts any explicit set of compatible male FBX files from the same
 * licensed archive; the first three are defaults only. New source clips
 * require NO retargeting code or per-clip orientation adjustments.
 */
export async function retargetOwnedKevinAnimations(
  file:File,
  graph:AnatomicalGraphV1,
  targetBones:ReadonlyMap<string,THREE.Bone>,
  selectedClips:readonly KevinRequestedAnimation[]=KEVIN_INITIAL_FBX,
):Promise<KevinLocalResult> {
  if(selectedClips.length<1||selectedClips.length>12||
    new Set(selectedClips.map(c=>c[0])).size!==selectedClips.length ||
    selectedClips.some(c=>!/^[a-z][a-z0-9-]{0,60}$/.test(c[0])))
    throw Error("Invalid Kevin animation selection or duplicate ID");
  // Only data from this exact owner's ZIP; all processing is in memory.
  const archive=await importOwnedKevinZip(file,selectedClips.map(c=>c[1]));
  const {FBXLoader}=await import("three/addons/loaders/FBXLoader.js");
  const inputs: {
    readonly id:string;readonly label:string;
    readonly bytes:ArrayBuffer;readonly scene:THREE.Group;
    readonly bones:Map<string,THREE.Bone>;readonly clip:THREE.AnimationClip;
    readonly rest:ReturnType<typeof sourceRestRecord>;
  }[]=[];
  const loader=new FBXLoader();
  for(const [id,path] of selectedClips) {
    const bytes=archive.members.get(path);
    if(!bytes)throw Error("Verified Kevin ZIP lacks "+path);
    const scene=loader.parse(bytes,"");
    const bones=normalizeSource(scene);
    if(scene.animations.length!==1)throw Error("Expected one FBX animation stack in "+path);
    const clip=scene.animations[0]!;
    const rest=sourceRestRecord(bones);
    if(inputs.length)assertRestMatch(inputs[0]!.rest,rest);
    inputs.push({id,label:path.split("/").at(-1)!.replace(/\.fbx$/,""),
      bytes,scene,bones,clip,rest});
  }
  const source=inputs[0]!;
  const mappings=mapKevinMaleHumanoidJoints(graph,[...source.bones.keys()]);
  validateKevinMaleRestLaterality([...source.bones].map(([id,bone])=>({
    id,worldPosition:pos(bone),
  })));
  for(const j of graph.joints)
    if(!targetBones.has(j.id))throw Error("Incomplete live C1 MakeHuman skeleton: "+j.id);
  const targetRest=graph.joints.map(j=>{
    const bone=targetBones.get(j.id)!;
    bone.updateWorldMatrix(true,false);
    return {targetJointId:j.id,nodeId:j.id,
      worldPosition:pos(bone),worldRotation:rot(bone)};
  });
  const sourceSha=await digest(source.rest);
  const targetSha=await digest(targetRest);
  const sourceRig=createHumanRestDescriptor(graph,sourceSha,mappings.map(m=>({
    targetJointId:m.targetId,nodeId:m.sourceId,
    worldPosition:pos(source.bones.get(m.sourceId)!),
    worldRotation:rot(source.bones.get(m.sourceId)!),
  })),{sourceMapping:mappings});
  const targetRig=createHumanRestDescriptor(graph,targetSha,targetRest);
  const profile=freezeProfile(createRetargetProfile(sourceRig,targetRig,mappings));
  const profileSha=await digest(profile);
  const rig=canonicalRigIdentity(graph);
  const candidates:KevinLocalCandidate[]=[];
  for(const input of inputs){
    const sourceHash=await kevinHex(input.bytes);
    const times=selectedTimes(input.clip);
    const mixer=new THREE.AnimationMixer(input.scene);
    const action=mixer.clipAction(input.clip);
    action.setLoop(THREE.LoopOnce,1);
    action.clampWhenFinished=true;
    action.play();
    const channelValues=new Map(mappings.map(m=>[m.targetId,[] as Quat[]]));
    const pelvisPositions:Vec3[]=[];
    for(const time of times){
      mixer.setTime(time);
      input.scene.updateMatrixWorld(true);
      const rotationMap=new Map(mappings.map(m=>
        [m.sourceId,rot(input.bones.get(m.sourceId)!)]));
      const pose=retargetWorldPose(profile,targetRig,rotationMap,
        sourceRig.identitySha256,"source-anatomical");
      for(const sample of pose)channelValues.get(sample.jointId)!.push(sample.rotation);
      pelvisPositions.push(pos(input.bones.get("B-hips")!));
    }
    action.stop();
    mixer.uncacheRoot(input.scene);
    const tracks:AnimationClipV1["tracks"][number][]=[];
    let maxSeam=0;
    for(const mapping of mappings){
      const raw=channelValues.get(mapping.targetId)!;
      const values=raw.map(q=>[...q] as Quat);
      for(let i=1;i<values.length;i++)
        if(values[i-1]!.reduce((sum,v,j)=>sum+v*values[i]![j]!,0)<0)
          values[i]=values[i]!.map(v=>-v) as unknown as Quat;
      const seam=2*Math.acos(clampDot(values[0]!,values.at(-1)!))*180/Math.PI;
      maxSeam=Math.max(maxSeam,seam);
      tracks.push({jointId:mapping.targetId,channel:"rotation",timesSeconds:times,values});
    }
    const locked=input.id==="human-kevin-idle";
    if(!locked){
      const origin=pelvisPositions[0]!;
      const offsets:Vec3[]=pelvisPositions.map(v=>[v[0]-origin[0],v[1]-origin[1],0]);
      if(offsets.some(v=>v.some(x=>Math.abs(x)>.25)))
        throw Error("Kevin visual pelvis drift exceeds safe C1 offset");
      tracks.push({jointId:rig.rootJointId,channel:"translation",timesSeconds:times,
        values:offsets});
    }
    const result:AnimationClipV1={
      schemaVersion:1,id:input.id,rig,durationSeconds:input.clip.duration,
      source:{kind:"external",creator:"kevin-iglesias",revision:SOURCE_REVISION,
        license:"Unity Asset Store EULA",sha256:sourceHash,origin:SOURCE_ORIGIN},
      rootMotion:locked?"locked":"visual_only",
      layer:{mode:"base",jointMask:mappings.map(m=>m.targetId)},
      retarget:{mode:"rest_delta",authoredBindPoseId:rig.bindPoseId},
      tracks,contacts:[],
    };
    // Same validation and sampler as approved UAL1 playback.
    const canonical=parseAnimationClip(serializeAnimationClip(result,graph),graph);
    candidates.push({id:input.id,label:input.label,sourceSha256:sourceHash,
      clip:canonical,maxLoopSeamDegrees:maxSeam,keyCount:times.length});
  }
  return {archiveSha256:archive.archiveSha256,sourceRigSha256:sourceSha,
    targetRigSha256:targetSha,profileSha256:profileSha,candidates};
}
