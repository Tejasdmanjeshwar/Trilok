/**
 * C6.2 candidate baker: calibrated source family -> canonical AnimationClipV1.
 * Separate from the previously rejected production reference clips until
 * user-reviewed multi-angle geometry validates the replacement.
 *
 * Usage:
 *  node scripts/bake-c62-calibrated.mjs --source <extracted-ual1.json> --output <directory> --write
 * The source has to include the glTF sourceSkin inverse bind matrices, produced
 * by extract-quaternius-ual1.mjs --include-bind [--include-sprint].
 */
import * as THREE from "three";
import { createServer } from "vite";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
function flag(name,defaultValue){
  const i=process.argv.indexOf(name);
  return i<0?defaultValue:process.argv[i+1]??(()=>{throw Error("Missing "+name)})();
}
const sourcePath=resolve(root,flag("--source",
  "assets/animations/sources/ual1-standard-locomotion-v1.json"));
const output=resolve(root,flag("--output","assets/animations/candidate-c62-v1"));
const write=process.argv.includes("--write");
const emit=process.argv.includes("--emit");
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const [sourceBytes,objBytes,rigBytes]=await Promise.all([
  readFile(sourcePath),readFile(resolve(root,"apps/web/public/anatomy/makehuman-base.obj")),
  readFile(resolve(root,"apps/web/public/anatomy/makehuman-default.mhskel")),
]);
const source=JSON.parse(sourceBytes.toString("utf8"));
const expectedArchive="cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724";
if(source.schemaVersion!==1 || source.license!=="CC0-1.0" ||
  source.sourceArchiveSha256!==expectedArchive ||
  !/^[a-f0-9]{64}$/.test(source.sourceGlbSha256) ||
  !Array.isArray(source.nodes)||source.nodes.length<60||
  !Array.isArray(source.clips)||source.clips.length<3)
  throw Error("Unverified UAL1 source metadata");
if(!source.sourceSkin?.inverseBindMatrices)
  throw Error("Real source inverse-bind metadata required; re-extract GLB with --include-bind");

const scene=new THREE.Group();
const objects=source.nodes.map(n=>{
  const obj=new THREE.Object3D();
  obj.name=n.name;
  obj.position.fromArray(n.translation);
  obj.quaternion.fromArray(n.rotation);
  obj.scale.fromArray(n.scale);
  return obj;
});
const sourceIndices=new Map();
source.nodes.forEach((n,i)=>{
  if(sourceIndices.has(n.name))throw Error("Duplicate source node "+n.name);
  sourceIndices.set(n.name,i);
  if(n.parent!==null && (n.parent<0||n.parent>=source.nodes.length))
    throw Error("Invalid parent "+n.name);
  (n.parent===null?scene:objects[n.parent]).add(objects[i]);
});
scene.updateMatrixWorld(true);
// glTF inverse bind matrices define joint/world inverse in common mesh bind
// space. Therefore J_world * IBM must agree for every source skin joint.
// This checks actual source bind data without assuming mesh bind is identity.
let baseBind;
let maxBindResidual=0;
for(const [i,name] of source.sourceSkin.jointNames.entries()){
  const index=sourceIndices.get(name);
  const elements=source.sourceSkin.inverseBindMatrices[i];
  if(index===undefined||!Array.isArray(elements)||elements.length!==16||
    elements.some(x=>!Number.isFinite(x)))throw Error("Invalid source IBM for "+name);
  const inverse=new THREE.Matrix4().fromArray(elements);
  if(Math.abs(inverse.determinant())<1e-9)throw Error("Singular source IBM "+name);
  const rest=objects[index].matrixWorld.clone().multiply(inverse);
  if(!baseBind)baseBind=rest;
  for(let k=0;k<16;k++)
    maxBindResidual=Math.max(maxBindResidual,
      Math.abs(rest.elements[k]-baseBind.elements[k]));
}
if(maxBindResidual>1e-3)
  throw Error("glTF source rest disagrees with inverse-bind matrices: "+maxBindResidual);
const nodeNames=source.nodes.map(n=>n.name);
const initial=source.nodes.map(n=>({
  translation:[...n.translation],rotation:[...n.rotation],scale:[...n.scale],
}));
const sourcePos=o=>{const v=o.getWorldPosition(new THREE.Vector3());return [v.x,v.y,v.z]};
const sourceQuat=o=>{const q=o.getWorldQuaternion(new THREE.Quaternion());return [q.x,q.y,q.z,q.w]};
const s=await createServer({root,server:{middlewareMode:true},
  appType:"custom",logLevel:"error",configFile:false});
try{
  const {createAnatomyPreset}=await s.ssrLoadModule("/packages/character-core/src/presets.ts");
  const {canonicalRigIdentity,serializeAnimationClip,parseAnimationClip}=
    await s.ssrLoadModule("/packages/character-core/src/animation.ts");
  const {createRetargetProfile,retargetWorldPose}=
    await s.ssrLoadModule("/packages/character-core/src/retargeting.ts");
  const {createHumanRestDescriptor}=
    await s.ssrLoadModule("/packages/character-core/src/retarget-human-frames.ts");
  const {mapUAL1StandardJoints}=
    await s.ssrLoadModule("/apps/web/src/characters/animation/UAL1SkeletonAdapter.ts");
  const {parseAnatomicalOBJ}=
    await s.ssrLoadModule("/apps/web/src/characters/geometry/AnatomicalTemplate.ts");
  const {makeSourceLandmarks,calibrateHumanBones}=
    await s.ssrLoadModule("/apps/web/src/characters/geometry/OfficialHumanRig.ts");
  const {createSkinningSpike}=
    await s.ssrLoadModule("/apps/web/src/characters/geometry/SkinningSpike.ts");
  const graph=createAnatomyPreset({archetype:"human"});
  const rig=canonicalRigIdentity(graph);
  const mappings=mapUAL1StandardJoints(graph,nodeNames);
  const sourceSamples=mappings.map(m=>{
    const obj=objects[sourceIndices.get(m.sourceId)];
    return {targetJointId:m.targetId,nodeId:m.sourceId,
      worldPosition:sourcePos(obj),worldRotation:sourceQuat(obj)};
  });
  const sourceRig=createHumanRestDescriptor(graph,source.sourceGlbSha256,
    sourceSamples,{sourceMapping:mappings});
  const template=parseAnatomicalOBJ(objBytes.toString("utf8"),
    {includeGroups:["body"]});
  const spike=createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
  let targetRig;
  const calibrationSha256=hash(Buffer.concat([objBytes,rigBytes]));
  try{
    const landmarks=makeSourceLandmarks(JSON.parse(rigBytes.toString("utf8")),
      template,new THREE.Float32BufferAttribute(template.sourcePositions,3));
    const root=spike.skeleton.bones[0].parent;
    calibrateHumanBones(graph,spike.bones,spike.skeleton,root,landmarks,
      spike.forearmSkinBones,spike.shoulderSkinBones);
    root.updateMatrixWorld(true);
    targetRig=createHumanRestDescriptor(graph,calibrationSha256,
      graph.joints.map(j=>{
        const obj=spike.bones.get(j.id);
        return {targetJointId:j.id,nodeId:j.id,
          worldPosition:sourcePos(obj),worldRotation:sourceQuat(obj)};
      }));
  }finally{
    template.geometry.dispose();
    spike.dispose();
  }
  const profile=createRetargetProfile(sourceRig,targetRig,mappings);
  if(profile.calibrations.length!==49)throw Error("Incomplete source mapping");
  const neutral=retargetWorldPose(profile,targetRig,
    new Map(sourceRig.joints.map(j=>[j.id,j.restWorldRotation])),
    sourceRig.identitySha256);
  if(neutral.some(p=>new THREE.Quaternion(...p.rotation).angleTo(new THREE.Quaternion())>1e-6))
    throw Error("Rest-pose transfer drift");
  const profileBytes=Buffer.from(JSON.stringify(profile)+"\n");
  const files={"profile.json":profileBytes.toString("utf8")};
  const entries=[];
  const sorted=source.clips.map(c=>c.id);
  if(new Set(sorted).size!==sorted.length)throw Error("Duplicate source clip ID");
  for(const clipSource of source.clips){
    const {id,durationSeconds,timesSeconds,tracks}=clipSource;
    if(!/^[a-z][a-z0-9-]{0,60}$/.test(id) ||
      !Array.isArray(timesSeconds)||timesSeconds.length<2||
      timesSeconds[0]!==0||timesSeconds.at(-1)!==durationSeconds||
      !Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>120)
      throw Error("Invalid source clip "+id);
    if(Object.keys(tracks).some(name=>!sourceIndices.has(name)))
      throw Error("Source track points at missing bone");
    const buffers=new Map(mappings.map(m=>[m.targetId,[]]));
    const offsets=[];
    let firstPelvis,maximumOffset=0;
    const pelvisIndex=sourceIndices.get("pelvis");
    for(let frame=0;frame<timesSeconds.length;frame++){
      for(const [i,node] of source.nodes.entries()){
        const track=tracks[node.name];
        const rotation=track?.rotation?.[frame]??initial[i].rotation;
        const translation=track?.translation?.[frame]??initial[i].translation;
        if(!rotation.every(Number.isFinite)||!translation.every(Number.isFinite))
          throw Error("Nonfinite channel "+id+"/"+node.name);
        objects[i].quaternion.fromArray(rotation).normalize();
        objects[i].position.fromArray(translation);
        objects[i].scale.fromArray(initial[i].scale);
      }
      scene.updateMatrixWorld(true);
      const rotations=new Map(mappings.map(m=>[
        m.sourceId,sourceQuat(objects[sourceIndices.get(m.sourceId)])]));
      const pose=retargetWorldPose(profile,targetRig,rotations,sourceRig.identitySha256);
      for(const p of pose)buffers.get(p.jointId).push(p.rotation);
      const pelvis=objects[pelvisIndex].getWorldPosition(new THREE.Vector3());
      if(!firstPelvis)firstPelvis=pelvis.clone();
      // Normalize pelvis displacement into the target's calibrated world.
      // The visual-only track has no simulation authority or forward travel.
      const delta=pelvis.sub(firstPelvis)
        .applyQuaternion(new THREE.Quaternion(
          ...profile.calibrations.find(x=>x.sourceId==="pelvis").frameConversion));
      const offset=[delta.x,delta.y,0];
      maximumOffset=Math.max(maximumOffset,Math.abs(offset[0]),Math.abs(offset[1]));
      offsets.push(offset);
    }
    if(maximumOffset>.25)throw Error("Unbounded visual root displacement "+id+" "+maximumOffset);
    const tracksOut=[];
    for(const m of mappings){
      const raw=buffers.get(m.targetId);
      const values=raw.map(q=>[...q]);
      for(let i=1;i<values.length;i++){
        if(values[i-1].reduce((a,v,j)=>a+v*values[i][j],0)<0)
          values[i]=values[i].map(v=>-v);
      }
      // Preserve input curves. Never quietly rewrite loop boundary data.
      const first=values[0],last=values.at(-1);
      const dot=Math.abs(first.reduce((a,v,j)=>a+v*last[j],0));
      if(dot<.995)throw Error("Clip is not a closed loop "+id+"/"+m.targetId+" "+dot);
      values[values.length-1]=[...first];
      tracksOut.push({jointId:m.targetId,channel:"rotation",
        timesSeconds:[...timesSeconds],values});
    }
    const locked=clipSource.rootMotionPolicy==="locked"||id==="human-idle";
    if(!locked){
      offsets[offsets.length-1]=[...offsets[0]];
      tracksOut.push({jointId:rig.rootJointId,channel:"translation",
        timesSeconds:[...timesSeconds],values:offsets});
    }
    const clip={schemaVersion:1,id,rig,durationSeconds,
      source:{kind:"external",creator:"quaternius",revision:"ual1-standard-v1",
        license:"CC0-1.0",origin:source.origin,sha256:source.sourceArchiveSha256},
      rootMotion:locked?"locked":"visual_only",
      layer:{mode:"base",jointMask:[...new Set(tracksOut.map(t=>t.jointId))]},
      retarget:{mode:"rest_delta",authoredBindPoseId:rig.bindPoseId},
      tracks:tracksOut,contacts:[]};
    const encoded=serializeAnimationClip(clip,graph)+"\n";
    parseAnimationClip(encoded,graph);
    const filename=id+".clip.json";
    files[filename]=encoded;
    entries.push({id,sourceClip:clipSource.sourceName,filename,
      artifactSha256:hash(encoded),bytes:Buffer.byteLength(encoded)});
  }
  const manifest={
    schemaVersion:1,kind:"c6.2-unapproved-candidate",
    sourceArchiveSha256:source.sourceArchiveSha256,
    sourceGlbSha256:source.sourceGlbSha256,
    sourceInputSha256:hash(sourceBytes),
    targetCalibrationSha256:calibrationSha256,
    profileSha256:hash(profileBytes),
    profile:"profile.json",
    sourceBindMaxResidual:maxBindResidual,
    mappedJointCount:profile.calibrations.length,
    engine:"packages/character-core/src/retargeting.ts@c6.2-full-frame-v1",
    entries,
  };
  files["manifest.json"]=JSON.stringify(manifest,null,2)+"\n";
  if(write){
    await mkdir(output,{recursive:true});
    for(const [file,bytes] of Object.entries(files))
      await writeFile(resolve(output,file),bytes);
  }else if(!emit){
    for(const [file,bytes] of Object.entries(files)){
      if((await readFile(resolve(output,file),"utf8"))!==bytes)
        throw Error("Candidate bake drift: "+file);
    }
  }
  console.log(JSON.stringify({profileSha256:manifest.profileSha256,
    mappedJoints:profile.calibrations.length,clips:entries.map(c=>c.id),
    sourceBindMaxResidual:maxBindResidual}));
  if(emit)console.log("C6_2_CANDIDATE_BEGIN"+JSON.stringify(files)+"C6_2_CANDIDATE_END");
}finally{await s.close();}
