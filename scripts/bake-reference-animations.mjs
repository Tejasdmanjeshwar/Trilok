/**
 * C6.2 deterministic, source-backed rest-aware UAL1 -> C1 retargeter.
 * Input is a curated, hashed source skeleton + three original glTF clips,
 * extracted offline with scripts/extract-quaternius-ual1.mjs.
 * Never requires GLB, Blender, Quaternius mannequin or a second runtime rig.
 */
import * as THREE from "three";
import {createServer} from "vite";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const sha256=value=>createHash("sha256").update(value).digest("hex");
const sourceFile=resolve(root,"assets/animations/sources/ual1-standard-locomotion-v1.json");
const output=resolve(root,"assets/animations/reference-v1");
const write=process.argv.includes("--write");
const emit=process.argv.includes("--emit");
const sourceBytes=await readFile(sourceFile,"utf8");
const source=JSON.parse(sourceBytes);
const expectedArchive="cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724";
if(source.schemaVersion!==1||source.license!=="CC0-1.0"||
  source.sourceArchiveSha256!==expectedArchive||
  !/^[a-f0-9]{64}$/.test(source.sourceGlbSha256)||
  source.clips?.length!==3||source.nodes?.length<60)
  throw new Error("Invalid or unverified UAL1 source metadata");
const nodeNames=new Map();
for(let i=0;i<source.nodes.length;i++){
  const node=source.nodes[i];
  if(nodeNames.has(node.name))throw new Error("Duplicate source name "+node.name);
  nodeNames.set(node.name,i);
}
const joints=source.nodes.map(node=>{
  const obj=new THREE.Object3D();
  obj.name=node.name;
  obj.position.fromArray(node.translation);
  obj.quaternion.fromArray(node.rotation);
  obj.scale.fromArray(node.scale);
  return obj;
});
const sourceScene=new THREE.Group();
source.nodes.forEach((node,i)=>(node.parent===null?sourceScene:joints[node.parent]).add(joints[i]));
sourceScene.updateMatrixWorld(true);
const restRot=joints.map(obj=>obj.getWorldQuaternion(new THREE.Quaternion()));
// Original glTF source conventions are never assumed to match canonical
// bone-local axes. All source motion is first evaluated in shared world space.
const roles=new Map([
  ["pelvis","pelvis"],["spine_lower","spine_01"],["chest","spine_03"],
  ["neck","neck_01"],["head","Head"],
]);
for(const side of ["left","right"]){
  // Quaternius _l lies on the positive world X side; C1 left is -X.
  // Match measured world-side placement, not suffix spelling.
  const src=side==="left"?"r":"l";
  for(const [role,name] of [
    ["clavicle","clavicle"],["shoulder","upperarm"],
    ["elbow","lowerarm"],["wrist","hand"],
    ["hip","thigh"],["knee","calf"],["ankle","foot"],["toe","ball"],
  ])roles.set(role+"_"+side,name+"_"+src);
  for(const digit of ["thumb","index","middle","ring","little"]){
    const key=digit==="little"?"pinky":digit;
    for(let n=0;n<(digit==="thumb"?2:3);n++)
      roles.set("finger_"+digit+"_"+n+"_"+side,key+"_0"+(n+1)+"_"+src);
  }
}
const server=await createServer({root,server:{middlewareMode:true},
  appType:"custom",logLevel:"error",configFile:false});
try{
  const {createAnatomyPreset}=await server.ssrLoadModule("/packages/character-core/src/presets.ts");
  const {canonicalRigIdentity,serializeAnimationClip,parseAnimationClip}=
    await server.ssrLoadModule("/packages/character-core/src/animation.ts");
  const graph=createAnatomyPreset({archetype:"human"});
  const rig=canonicalRigIdentity(graph);
  // C1 graph is the reference hierarchy; not a second presentation skeleton.
  const target=new Map();
  const targetScene=new THREE.Group();
  for(const joint of graph.joints){
    const obj=new THREE.Object3D();
    obj.position.fromArray(joint.bindTranslation);
    obj.quaternion.fromArray(joint.bindQuaternion);
    (joint.parentId?target.get(joint.parentId):targetScene).add(obj);
    target.set(joint.id,obj);
  }
  targetScene.updateMatrixWorld(true);
  const targetRest=new Map(graph.joints.map(j=>[
    j.id,target.get(j.id).getWorldQuaternion(new THREE.Quaternion())]));
  /**
   * Quaternius is T-posed: upperarm_r's REST segment points almost entirely
   * toward -X; MakeHuman's corresponding C1 arm points down/sideways.
   * Transferring only world-rest quaternion deltas rotates a DOWNWARD arm
   * by the 90-degree T-pose recovery, folding it across the abdomen.
   *
   * Instead align the target's measured local bone-to-child anatomical axis
   * to the source's actual local bone-to-child axis. Applying source ABSOLUTE
   * animated world orientations through that fixed rest-basis conversion
   * reproduces its physical segment direction without guessing any poses.
   * Missing minor segments conservatively retain the old delta behavior.
   */
  const sourceChildFallback=new Map([
    ["spine_01","spine_02"],
    ["hand_l","middle_01_l"],["hand_r","middle_01_r"],
    ["foot_l","ball_l"],["foot_r","ball_r"],
  ]);
  const localRetargetBasis=new Map();
  for(const joint of graph.joints){
    const srcName=roles.get(joint.role);
    if(!srcName)continue;
    const srcIndex=nodeNames.get(srcName);
    if(srcIndex===undefined)throw new Error("Unknown source joint "+srcName);
    const candidates=graph.joints.filter(j=>j.parentId===joint.id);
    const targetChild=candidates.find(j=>roles.has(j.role))??candidates[0];
    if(!targetChild)continue;
    const preferredName=roles.get(targetChild.role);
    let childIndex=preferredName===undefined?undefined:nodeNames.get(preferredName);
    if(childIndex===undefined||source.nodes[childIndex].parent!==srcIndex){
      const fallback=sourceChildFallback.get(srcName);
      childIndex=fallback===undefined?undefined:nodeNames.get(fallback);
    }
    if(childIndex===undefined||source.nodes[childIndex].parent!==srcIndex)continue;
    const targetDir=new THREE.Vector3(...targetChild.bindTranslation);
    const sourceDir=new THREE.Vector3(...source.nodes[childIndex].translation);
    if(targetDir.lengthSq()<1e-8||sourceDir.lengthSq()<1e-8)
      throw new Error("Collapsed anatomical retarget segment "+joint.role);
    const correction=new THREE.Quaternion().setFromUnitVectors(
      targetDir.normalize(),sourceDir.normalize());
    localRetargetBasis.set(joint.id,correction);
  }
  for(const role of ["pelvis","spine_lower","chest","neck",
    "clavicle_left","clavicle_right","shoulder_left","shoulder_right",
    "elbow_left","elbow_right","wrist_left","wrist_right",
    "hip_left","hip_right","knee_left","knee_right","ankle_left","ankle_right"]){
    const joint=graph.joints.find(j=>j.role===role);
    if(!joint||!localRetargetBasis.has(joint.id))
      throw new Error("Missing primary anatomical segment retarget basis "+role);
  }
  const files={};
  const entries=[];
  const coverage=new Set(["pelvis","spine_lower","chest","neck","head",
    "shoulder_left","shoulder_right","elbow_left","elbow_right",
    "wrist_left","wrist_right","hip_left","hip_right",
    "knee_left","knee_right","ankle_left","ankle_right"]);
  for(const clipSource of source.clips){
    const {id,durationSeconds,timesSeconds,tracks}=clipSource;
    if(!["human-idle","human-walk","human-run"].includes(id)||
      timesSeconds.length<2||durationSeconds>10||
      timesSeconds[0]!==0||timesSeconds.at(-1)!==durationSeconds)
      throw new Error("Invalid selected source clip");
    const frames=new Map();
    let firstPelvis;
    let maximumPelvisOffset=0;
    for(let frame=0;frame<timesSeconds.length;frame++){
      for(let i=0;i<joints.length;i++){
        const node=source.nodes[i],track=tracks[node.name];
        joints[i].quaternion.fromArray(track?.rotation?.[frame]??node.rotation);
        joints[i].position.fromArray(track?.translation?.[frame]??node.translation);
      }
      sourceScene.updateMatrixWorld(true);
      const pelvis=joints[nodeNames.get("pelvis")].getWorldPosition(new THREE.Vector3());
      if(!firstPelvis)firstPelvis=pelvis.clone();
      const delta=pelvis.sub(firstPelvis);
      // Preserve presentation-only vertical/lateral hip motion. World movement
      // forward stays with game authority, not the animated skeleton.
      const offset=[delta.x,delta.y,0];
      maximumPelvisOffset=Math.max(maximumPelvisOffset,...offset.map(Math.abs));
      const desiredWorld=new Map();
      for(const joint of graph.joints){
        const srcName=roles.get(joint.role);
        const srcIndex=srcName===undefined?undefined:nodeNames.get(srcName);
        if(coverage.has(joint.role)&&srcIndex===undefined)
          throw new Error("Missing required source bone "+joint.role);
        const base=targetRest.get(joint.id);
        let world;
        if(srcIndex===undefined){
          // Unmapped passive skeletal joints inherit parent motion naturally.
          const localRest=new THREE.Quaternion(...joint.bindQuaternion);
          world=joint.parentId?
            desiredWorld.get(joint.parentId).clone().multiply(localRest):localRest;
        }else{
          const now=joints[srcIndex].getWorldQuaternion(new THREE.Quaternion());
          // Source T-pose and C1 MakeHuman bind limbs have DIFFERENT segment
          // directions. Match source animated physical bone orientation using
          // measured child axes; a generic world-rest delta overrotates arms.
          const anatomicalBasis=localRetargetBasis.get(joint.id);
          world=anatomicalBasis?
            now.multiply(anatomicalBasis).normalize():
            now.multiply(restRot[srcIndex].clone().invert()).multiply(base).normalize();
        }
        const parentWorld=joint.parentId?desiredWorld.get(joint.parentId):new THREE.Quaternion();
        const local=parentWorld.clone().invert().multiply(world).normalize();
        const restLocal=new THREE.Quaternion(...joint.bindQuaternion);
        const localDelta=restLocal.invert().multiply(local).normalize();
        const key=joint.id;
        const values=frames.get(key)??[];
        values.push([localDelta.x,localDelta.y,localDelta.z,localDelta.w]);
        frames.set(key,values);
        desiredWorld.set(key,world);
      }
      frames.set("__offset", [...(frames.get("__offset")??[]),offset]);
    }
    if(maximumPelvisOffset>.25)
      throw new Error("Unbounded source pelvis motion "+id+": "+maximumPelvisOffset);
    const tracksOut=[];
    for(const joint of graph.joints){
      if(!roles.has(joint.role))continue;
      const values=frames.get(joint.id);
      if(!values)throw new Error("Retarget missing "+joint.role);
      const quats=values.map(q=>[...q]);
      for(let i=1;i<quats.length;i++){
        const a=quats[i-1],b=quats[i];
        if(a.reduce((n,v,k)=>n+v*b[k],0)<0)
          quats[i]=b.map(v=>-v);
      }
      const first=quats[0],last=quats.at(-1);
      const dot=Math.abs(first.reduce((n,v,k)=>n+v*last[k],0));
      if(dot<.995)throw new Error("Source motion fails loop continuity "+id+"/"+joint.role+": "+dot);
      quats[quats.length-1]=[...first];
      tracksOut.push({jointId:joint.id,channel:"rotation",
        timesSeconds:[...timesSeconds],values:quats});
    }
    if(id!=="human-idle"){
      const offsets=frames.get("__offset").map(v=>[...v]);
      offsets[offsets.length-1]=[...offsets[0]];
      tracksOut.push({jointId:rig.rootJointId,channel:"translation",
        timesSeconds:[...timesSeconds],values:offsets});
    }
    const clip={schemaVersion:1,id,rig,durationSeconds,
      source:{kind:"external",creator:"quaternius",revision:"ual1-standard-v1",
        license:"CC0-1.0",origin:source.origin,sha256:source.sourceArchiveSha256},
      rootMotion:id==="human-idle"?"locked":"visual_only",
      layer:{mode:"base",jointMask:[...new Set(tracksOut.map(t=>t.jointId))]},
      retarget:{mode:"rest_delta",authoredBindPoseId:rig.bindPoseId},
      tracks:tracksOut,contacts:[]};
    const serialized=serializeAnimationClip(clip,graph)+"\n";
    parseAnimationClip(serialized,graph);
    const filename=id+".clip.json";
    files[filename]=serialized;
    entries.push({id,label:id==="human-idle"?"Idle · Quaternius UAL1":
      id==="human-walk"?"Walk · Quaternius UAL1":"Run · Quaternius UAL1",
      sourceClip:clipSource.sourceName,filename,
      sourceSha256:sha256(sourceBytes),
      artifactSha256:sha256(serialized),bytes:Buffer.byteLength(serialized)});
  }
  if(entries.length!==3)throw new Error("Missing three retargeted outputs");
  const manifest=JSON.stringify({schemaVersion:1,creator:source.creator,
    license:source.license,origin:source.origin,
    sourceArchiveSha256:source.sourceArchiveSha256,
    sourceGlbSha256:source.sourceGlbSha256,sourceInputSha256:sha256(sourceBytes),
    importer:source.importer,retargeter:"scripts/bake-reference-animations.mjs@ual1-measured-segment-v2",
    generatorRevision:"c6.2-ual1-segment-basis-v2",
    normalization:"source glTF absolute world motion via measured child-axis basis to canonical local rest deltas",
    entries},null,2)+"\n";
  files["manifest.json"]=manifest;
  if(write){
    await mkdir(output,{recursive:true});
    for(const [filename,content] of Object.entries(files))
      await writeFile(resolve(output,filename),content);
  }else if(!emit){
    for(const [filename,content] of Object.entries(files)){
      const existing=await readFile(resolve(output,filename),"utf8");
      if(existing!==content)throw new Error("Animation bake drift: "+filename);
    }
  }
  for(const entry of entries)console.log(entry.id,entry.bytes,entry.artifactSha256);
  if(emit)console.log("C6_2_BAKE_BEGIN"+JSON.stringify(files)+"C6_2_BAKE_END");
}finally{await server.close();}
