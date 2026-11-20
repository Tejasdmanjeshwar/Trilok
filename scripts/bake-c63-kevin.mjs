/**
 * C6.3 developer-time canonical asset bake for Kevin Iglesias Human Basic Motions FREE.
 * Same C6.2 source-anatomical rig retargeter, no per-animation correction.
 * Bake canonical game-integrated resources for normal runtime loading.
 *
 * node scripts/bake-c63-kevin.mjs --archive "/path/Human Basic Motions FREE.zip" --write
 * Omit --write to verify deterministic baked bytes; use --all for all male clips.
 */
import * as THREE from "three";
import {FBXLoader} from "three/addons/loaders/FBXLoader.js";
import {createServer} from "vite";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {
  normalizeKevinFBXScene,indexKevinBones,
  originalKevinBoneName,verifyKevinModelBind,
} from "./lib/kevin-fbx-source.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
function flag(name, fallback) {
  const n=process.argv.indexOf(name);
  if(n<0)return fallback;
  if(!process.argv[n+1]||process.argv[n+1].startsWith("--"))
    throw Error("Missing "+name);
  return process.argv[n+1];
}
const archive=flag("--archive",null);
if(!archive)throw Error("Requires --archive (private licensed owner ZIP)");
const destination=resolve(root,flag("--output","assets/animations/studio-v1/kevin"));
const write=process.argv.includes("--write");
const all=process.argv.includes("--all");
const catalog=JSON.parse(await readFile(resolve(root,
  "assets/animations/sources/kevin-basic-motions-v1.json"),"utf8"));
if(catalog.schemaVersion!==1||catalog.fbxVersion!==7700||
   catalog.expectedMaleClipCount!==58||!Array.isArray(catalog.clips)||
   catalog.clips.length<3||new Set(catalog.clips.map(c=>c.id)).size!==catalog.clips.length)
  throw Error("Invalid Kevin source catalog");
const initial=catalog.clips.map(c=>{
  if(!/^[a-z0-9-]+$/.test(c.id)||
     !/^Animations\/Male\/[^.]+\.fbx$/.test(c.sourceFile)||
     !["locked","visual_only"].includes(c.rootMotion))
    throw Error("Invalid Kevin catalog entry "+JSON.stringify(c));
  return c;
});
const malePaths=execFileSync("unzip",["-Z1",resolve(archive)],
  {encoding:"utf8",maxBuffer:1024*1024}).split("\n")
  .filter(p=>p.startsWith("Animations/Male/")&&p.endsWith(".fbx")).sort();
if(malePaths.length!==catalog.expectedMaleClipCount||
   new Set(malePaths).size!==malePaths.length)
  throw Error("Kevin source inventory changed: "+malePaths.length);
const sourcePaths=all?[...initial,...malePaths
  .filter(path=>!initial.some(c=>c.sourceFile===path))
  .map(path=>({id:"human-kevin-"+path.slice("Animations/Male/".length)
    .replace(/\.fbx$/,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/-$/,""),
    sourceFile:path,rootMotion:(path.includes("/Idles/")||path.includes("/Social/"))?
      "locked":"visual_only"}))]:initial;
if(new Set(sourcePaths.map(c=>c.id)).size!==sourcePaths.length)
  throw Error("Duplicate Kevin output ID");
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const archiveHash=hash(await readFile(resolve(archive)));
// Accept either the verified full owner ZIP or the identical-byte male
// development subset (58 male animation FBXs + their source skinned model).
// The original 118-animation archive is never loaded by the game runtime.
const fullArchive=archiveHash===catalog.archiveSha256;
const maleSubset=archiveHash===catalog.sourceSubsetSha256;
if(!fullArchive&&!maleSubset)
  throw Error("Unexpected Kevin source archive identity: "+archiveHash);
if(maleSubset){
  const entries=execFileSync("unzip",["-Z1",resolve(archive)],
    {encoding:"utf8",maxBuffer:1024*1024}).split("\n").filter(Boolean);
  if(entries.length!==59||!entries.includes("Models/HumanM_Model.fbx")||
     entries.some(path=>!path.startsWith("Animations/Male/")&&
       path!=="Models/HumanM_Model.fbx"))
    throw Error("Unexpected male subset layout");
}
// ZIP entry names are NOT wildcard expressions: Kevin [RM] uses literal
// brackets, which unzip -p interprets as a glob character class.
const readZipEntry=(name)=>execFileSync("python3",["-c",
  "import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))",
  resolve(archive),name],{maxBuffer:8*1024*1024});
const getWorldPos=obj=>{const p=obj.getWorldPosition(new THREE.Vector3());return [p.x,p.y,p.z];};
// FBXLoader world-matrix decomposition under nonuniform inherited scale can
// produce quaternions a few e-5 off unit length. Normalize rotation samples
// before deterministic world-space retargeting, without changing joint motion.
const getWorldQuat=obj=>{const q=obj.getWorldQuaternion(new THREE.Quaternion()).normalize();return [q.x,q.y,q.z,q.w];};
const inputs=[];
for(const {id,sourceFile:path,rootMotion} of sourcePaths){
  const fbx=readZipEntry(path);
  if(fbx.readUInt32LE(23)!==7700)throw Error("FBX version mismatch "+path);
  const parsed=new FBXLoader().parse(
    fbx.buffer.slice(fbx.byteOffset,fbx.byteOffset+fbx.byteLength),"");
  const byName=normalizeKevinFBXScene(parsed);
  const bones=[...byName.values()];
  const clip=parsed.animations[0];
  if(bones.length!==56||parsed.animations.length!==1||!clip||
      clip.duration<=0||!Number.isFinite(clip.duration))
    throw Error("Unusable FBX source "+path);
  // Capture bind/rest before the AnimationMixer changes source nodes.
  const rest=bones.map(b=>({name:originalKevinBoneName(b),
    parent:b.parent?.isBone?originalKevinBoneName(b.parent):null,
    position:getWorldPos(b),rotation:getWorldQuat(b)}))
    .sort((a,b)=>a.name.localeCompare(b.name));
  inputs.push({id,path,rootMotion,scene:parsed,bones,byName,clip,rest,
    restSha256:hash(JSON.stringify(rest)),fbxSha256:hash(fbx)});
}
if(new Set(inputs.map(s=>s.restSha256)).size!==1)
  throw Error("Kevin rig rest transform differs between clips; refuse per-clip calibration");
// Validate EVERY male clip against the one reusable rest calibration.
const audited=new Set(inputs.map(c=>c.path));
for(const path of malePaths){
  if(audited.has(path))continue;
  const fbx=readZipEntry(path);
  if(fbx.readUInt32LE(23)!==catalog.fbxVersion)
    throw Error("Incompatible Kevin FBX version "+path);
  const scene=new FBXLoader().parse(fbx.buffer.slice(
    fbx.byteOffset,fbx.byteOffset+fbx.byteLength),"");
  const bones=normalizeKevinFBXScene(scene);
  const clip=scene.animations[0];
  if(scene.animations.length!==1||!clip||!Number.isFinite(clip.duration)||
     clip.duration<=0)throw Error("Incompatible Kevin source animation "+path);
  const rest=[...bones.values()].map(b=>({
    name:originalKevinBoneName(b),
    parent:b.parent?.isBone?originalKevinBoneName(b.parent):null,
    position:getWorldPos(b),rotation:getWorldQuat(b),
  })).sort((a,b)=>a.name.localeCompare(b.name));
  if(hash(JSON.stringify(rest))!==inputs[0].restSha256)
    throw Error("Kevin source-family rest mismatch "+path);
}
// Compare genuine mesh-backed source bind to the *same* male profile.
const maleFBX=readZipEntry("Models/HumanM_Model.fbx");
const modelScene=new FBXLoader().parse(maleFBX.buffer.slice(
  maleFBX.byteOffset,maleFBX.byteOffset+maleFBX.byteLength),"");
const modelBones=normalizeKevinFBXScene(modelScene,{expectedBoneCount:55});
const sourceBindEvidence=verifyKevinModelBind(modelScene,modelBones,inputs[0].byName);
const server=await createServer({root,server:{middlewareMode:true},
  appType:"custom",logLevel:"error",configFile:false});
try {
  const {createAnatomyPreset}=await server.ssrLoadModule("/packages/character-core/src/presets.ts");
  const {canonicalRigIdentity,serializeAnimationClip,parseAnimationClip}=await server.ssrLoadModule("/packages/character-core/src/animation.ts");
  const {createRetargetProfile,retargetWorldPose}=await server.ssrLoadModule("/packages/character-core/src/retargeting.ts");
  const {createHumanRestDescriptor}=await server.ssrLoadModule("/packages/character-core/src/retarget-human-frames.ts");
  const {mapKevinMaleHumanoidJoints,validateKevinMaleRestLaterality}=await server.ssrLoadModule("/apps/web/src/characters/animation/KevinHumanoidSkeletonAdapter.ts");
  const {parseAnatomicalOBJ,bindTemplateToSemanticRig}=
    await server.ssrLoadModule("/apps/web/src/characters/geometry/AnatomicalTemplate.ts");
  const graph=createAnatomyPreset({archetype:"human"});
  const rig=canonicalRigIdentity(graph);
  const source=inputs[0];
  const mappings=mapKevinMaleHumanoidJoints(graph,[...source.byName.keys()]);
  validateKevinMaleRestLaterality(source.bones.map(b=>({
    id:originalKevinBoneName(b),worldPosition:getWorldPos(b),
  })));
  const sourceRig=createHumanRestDescriptor(graph,source.restSha256,
    mappings.map(m=>({targetJointId:m.targetId,nodeId:m.sourceId,
      worldPosition:getWorldPos(source.byName.get(m.sourceId)),
      worldRotation:getWorldQuat(source.byName.get(m.sourceId))})),
    {sourceMapping:mappings});
  const [objBytes,rigBytes,weightsBytes]=await Promise.all([
    readFile(resolve(root,"apps/web/public/anatomy/makehuman-base.obj")),
    readFile(resolve(root,"apps/web/public/anatomy/makehuman-default.mhskel")),
    readFile(resolve(root,"apps/web/public/anatomy/makehuman-default_weights.mhw")),
  ]);
  const template=parseAnatomicalOBJ(objBytes.toString("utf8"),
    {includeGroups:["body"]});
  // Same production MakeHuman skin/weights/forearm & shoulder helper setup
  // used by Studio, not the standalone C2 diagnostic rig mesh.
  const human=bindTemplateToSemanticRig(template,{
    rig:JSON.parse(rigBytes.toString("utf8")),
    weights:JSON.parse(weightsBytes.toString("utf8")),
  });
  const spike=human.spike;
  let targetRig;
  const calibrationSha256=hash(Buffer.concat([objBytes,rigBytes,weightsBytes]));
  spike.character.root.updateMatrixWorld(true);
  targetRig=createHumanRestDescriptor(graph,calibrationSha256,
    graph.joints.map(j=>({targetJointId:j.id,nodeId:j.id,
      worldPosition:getWorldPos(spike.bones.get(j.id)),
      worldRotation:getWorldQuat(spike.bones.get(j.id))})));
  const {AnatomicalFK}=await server.ssrLoadModule(
    "/apps/web/src/characters/geometry/AnatomicalFK.ts");
  const {HumanPoseCorrectives}=await server.ssrLoadModule(
    "/apps/web/src/characters/geometry/HumanPoseCorrectives.ts");
  // Use the exact production Studio FK/helper-correction path: direct bone
  // quaternion assignment misses proximal-forearm twist and shoulder skinning.
  const fk=new AnatomicalFK(graph,spike.bones,{
    jawTipWorldRest:human.jawTipWorldRest,
    forearmSkinBones:spike.forearmSkinBones,
    shoulderSkinBones:spike.shoulderSkinBones,
  });
  const correctives=new HumanPoseCorrectives(human);
  const sampleMesh=()=>{
    // Numerical CHECK only: actual skinned MakeHuman body vertices.
    // Deformation quality still requires owner-reviewed Chromium rendering.
    spike.character.root.updateMatrixWorld(true);
    human.mesh.updateMatrixWorld(true);
    human.mesh.skeleton.update();
    const positions=human.mesh.geometry.getAttribute("position");
    let nonfinite=0,maxDeformedDistanceMeters=0,lowestVertexMeters=Infinity;
    const vertex=new THREE.Vector3(),base=new THREE.Vector3();
    const stride=Math.max(1,Math.floor(positions.count/800));
    for(let i=0;i<positions.count;i+=stride){
      base.fromBufferAttribute(positions,i);
      human.mesh.applyBoneTransform(i,vertex.copy(base));
      if(![vertex.x,vertex.y,vertex.z].every(Number.isFinite)){nonfinite++;continue;}
      maxDeformedDistanceMeters=Math.max(maxDeformedDistanceMeters,vertex.distanceTo(base));
      lowestVertexMeters=Math.min(lowestVertexMeters,vertex.y);
    }
    if(nonfinite||maxDeformedDistanceMeters>2.5)
      throw Error("Invalid MakeHuman skinned deformation "+JSON.stringify({
        nonfinite,maxDeformedDistanceMeters,
      }));
    return {nonfinite,maxDeformedDistanceMeters,lowestVertexMeters};
  };
  const checkSkinnedPose=pose=>{
    fk.applyRestDeltas(pose);
    correctives.applyAnimationSamples(pose);
    return sampleMesh();
  };
  // Source mesh is used for numerical validation; canonical baked clips ship.
  // Freeze all nested quaternions/frames once. All three animation stacks
  // share this identical, immutable calibration; no per-clip knobs exist.
  const deepFreeze=o=>{
    if(o&&typeof o==="object"&&!Object.isFrozen(o)){
      Object.values(o).forEach(v=>deepFreeze(v));
      Object.freeze(o);
    }
    return o;
  };
  const profile=deepFreeze(createRetargetProfile(sourceRig,targetRig,mappings));
  if(profile.calibrations.length!==49)throw Error("Incomplete Kevin profile");
  const immutableProfile=JSON.stringify(profile)+"\n";
  const profileSha256=hash(immutableProfile);
  const generated={ "profile.json":immutableProfile };
  const entries=[];
  for(const input of inputs){
    // FBXLoader owns pre/post rotations, Euler order and axis/unit conversion.
    // Sample every distinct authored key time rather than inventing sinusoids.
    const nativeTimes=input.clip.tracks.flatMap(track=>[...track.times]);
    const times=[...new Set([0,input.clip.duration,...nativeTimes
      .map(t=>Math.round(t*1e7)/1e7)
      .filter(t=>t>=0&&t<input.clip.duration)])].sort((a,b)=>a-b);
    if(times[0]!==0||times.at(-1)!==input.clip.duration ||
      times.length*49>8192)
      throw Error("Source exceeds canonical key budget; do not decimate "+input.id);
    const mixer=new THREE.AnimationMixer(input.scene);
    const offsets=[];let firstPelvis;
    const action=mixer.clipAction(input.clip);
    action.play();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
    const values=new Map(mappings.map(m=>[m.targetId,[]]));
    const skinnedSourceSamples=[];
    for(const t of times){
      mixer.setTime(t);
      input.scene.updateMatrixWorld(true);
      const sourceRotations=new Map(mappings.map(m=>
        [m.sourceId,getWorldQuat(input.byName.get(m.sourceId))]));
      for(const m of mappings){
        const q=sourceRotations.get(m.sourceId);
        if(!q||q.length!==4||!q.every(Number.isFinite)||
          Math.abs(Math.hypot(...q)-1)>1e-5){
          const bone=input.byName.get(m.sourceId);
          throw Error("Invalid world-space source rotation "+JSON.stringify({
            clip:input.id,time:t,source:m.sourceId,target:m.targetId,
            quaternion:q,boneName:bone?.name,localQuaternion:bone?.quaternion.toArray(),
            worldScale:bone?.getWorldScale(new THREE.Vector3()).toArray(),
          }));
        }
      }
      const pose=retargetWorldPose(profile,targetRig,sourceRotations,
        sourceRig.identitySha256,"source-anatomical");
      for(const p of pose)values.get(p.jointId).push([...p.rotation]);
      const pelvis=getWorldPos(input.byName.get("B-hips"));
      if(!firstPelvis)firstPelvis=pelvis;
      const delta=new THREE.Vector3(...pelvis).sub(new THREE.Vector3(...firstPelvis));
      const offset=[delta.x,delta.y,0]; // Z travel remains gameplay-authoritative.
      offsets.push(offset);
      if([0,Math.floor(times.length/4),Math.floor(times.length/2),
          Math.floor(3*times.length/4),times.length-1].includes(times.indexOf(t))){
        // Apply the SAME presentation root offset that Studio will receive.
        const sampledPose=pose.map(p=>p.jointId===rig.rootJointId &&
          input.rootMotion!=="locked"?{...p,translation:offset}:p);
        const actual=checkSkinnedPose(sampledPose);
        skinnedSourceSamples.push({timeSeconds:t,...actual});
      }

    }
    mixer.stopAllAction();
    const tracks=[];
    const seams=[];
    for(const m of mappings){
      const keys=values.get(m.targetId);
      for(let i=1;i<keys.length;i++)
        if(keys[i-1].reduce((a,v,j)=>a+v*keys[i][j],0)<0)
          keys[i]=keys[i].map(v=>-v);
      const first=keys[0],last=keys.at(-1);
      const dot=Math.min(1,Math.abs(first.reduce((a,v,j)=>a+v*last[j],0)));
      const degrees=2*Math.acos(dot)*180/Math.PI;
      seams.push({jointId:m.targetId,seamDegrees:degrees});
      // No replacement of source endpoints, and no per-clip bone fix.
      tracks.push({jointId:m.targetId,channel:"rotation",
        timesSeconds:times,values:keys});
    }
    const locked=input.rootMotion==="locked";
    if(!locked)tracks.push({jointId:rig.rootJointId,channel:"translation",
      timesSeconds:times,values:offsets});
    const clip={schemaVersion:1,id:input.id,rig,
      durationSeconds:input.clip.duration,
      source:{kind:"external",creator:"kevin-iglesias",
        revision:"human-basic-motions-free-fbx7700",
        license:"Unity Asset Store EULA",sha256:input.fbxSha256,
        origin:"https://assetstore.unity.com/packages/3d/animations/human-basic-motions-free-154271"},
      rootMotion:locked?"locked":"visual_only",
      layer:{mode:"base",jointMask:mappings.map(m=>m.targetId)},
      retarget:{mode:"rest_delta",authoredBindPoseId:rig.bindPoseId},
      tracks,contacts:[]};
    const encoded=serializeAnimationClip(clip,graph)+"\n";
    parseAnimationClip(encoded,graph);
    const filename=input.id+".clip.json";
    generated[filename]=encoded;
    entries.push({id:input.id,sourceFile:input.path,sourceSha256:input.fbxSha256,
      outputSha256:hash(encoded),keyCount:times.length,
      maxSeamDegrees:Math.max(...seams.map(s=>s.seamDegrees)),
      sampledRealMakeHumanSkin:skinnedSourceSamples,
      worstSeams:seams.sort((a,b)=>b.seamDegrees-a.seamDegrees).slice(0,6)});
  }
  generated["manifest.json"]=JSON.stringify({schemaVersion:1,
    sourceArchiveSha256:catalog.archiveSha256,developerInputSha256:archiveHash,sourceFamilyMaleClipCount:malePaths.length,
    immutableSourceRestSha256:source.restSha256,
    sourceModelSha256:hash(maleFBX),sourceBindEvidence,
    targetCalibrationSha256:calibrationSha256,profileSha256,
    entries,distribution:"game-integrated-canonical-motion-resources"},null,2)+"\n";
  // Validate or write complete deterministic outputs; never silently drift.
  if(write) {
    await mkdir(destination,{recursive:true});
    for(const [filename,data] of Object.entries(generated))
      await writeFile(resolve(destination,filename),data);
  }else{
    for(const [filename,data] of Object.entries(generated)){
      const committed=await readFile(resolve(destination,filename),"utf8");
      if(committed!==data)throw Error("Kevin bake drift: "+filename);
    }
  }
  correctives.dispose();
  human.dispose();
  console.log(JSON.stringify({profileSha256,mappedJointCount:49,
    clips:entries.map(({id,keyCount,maxSeamDegrees})=>({id,keyCount,maxSeamDegrees})),
    output:destination,verified:!write,gameIntegrated:true}));
}finally{await server.close();}
