/**
 * C6.3 private-only candidate bake for Kevin Iglesias Human Basic Motions FREE.
 * Same C6.2 source-anatomical rig retargeter, no per-animation correction.
 * Output is intentionally local/ignored: DO NOT commit/deploy/export without
 * legal authorization for independently extractable animation keyframes.
 *
 * pnpm exec node scripts/bake-c63-kevin-private.mjs \
 *   --archive "/private/Human Basic Motions FREE.zip" \
 *   --output assets/animations/private/kevin-c63
 */
import * as THREE from "three";
import {FBXLoader} from "three/addons/loaders/FBXLoader.js";
import {createServer} from "vite";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

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
const destination=resolve(root,flag("--output","assets/animations/private/kevin-c63"));
const allowable=resolve(root,"assets/animations/private");
if(!destination.startsWith(allowable+"/"))
  throw Error("Private candidate output must remain inside ignored assets/animations/private");
const sourcePaths=[
  ["human-kevin-idle","Animations/Male/Idles/HumanM@Idle01.fbx"],
  ["human-kevin-walk","Animations/Male/Movement/Walk/HumanM@Walk01_Forward.fbx"],
  ["human-kevin-run","Animations/Male/Movement/Run/HumanM@Run01_Forward.fbx"],
];
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const archiveHash=hash(await readFile(resolve(archive)));
if(archiveHash!=="063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd")
  throw Error("Unexpected Kevin archive identity: "+archiveHash);
const getWorldPos=obj=>{const p=obj.getWorldPosition(new THREE.Vector3());return [p.x,p.y,p.z];};
const getWorldQuat=obj=>{const q=obj.getWorldQuaternion(new THREE.Quaternion());return [q.x,q.y,q.z,q.w];};
const inputs=[];
for(const [id,path] of sourcePaths){
  const fbx=execFileSync("unzip",["-p",resolve(archive),path],{maxBuffer:8*1024*1024});
  if(fbx.readUInt32LE(23)!==7700)throw Error("FBX version mismatch "+path);
  const parsed=new FBXLoader().parse(
    fbx.buffer.slice(fbx.byteOffset,fbx.byteOffset+fbx.byteLength),"");
  parsed.updateMatrixWorld(true);
  const bones=[];parsed.traverse(obj=>{if(obj.isBone)bones.push(obj);});
  const clip=parsed.animations[0];
  if(bones.length!==56||parsed.animations.length!==1||!clip||
      clip.duration<=0||!Number.isFinite(clip.duration))
    throw Error("Unusable FBX source "+path);
  // The original scene REST is read before any AnimationMixer modifies nodes.
  const byName=new Map(bones.map(b=>[b.name,b]));
  if(byName.size!==56)throw Error("Duplicate FBX source bone name");
  const rest=bones.map(b=>({name:b.name,parent:b.parent?.name,
    position:getWorldPos(b),rotation:getWorldQuat(b)}))
    .sort((a,b)=>a.name.localeCompare(b.name));
  inputs.push({id,path,scene:parsed,bones,byName,clip,rest,
    restSha256:hash(JSON.stringify(rest)),fbxSha256:hash(fbx)});
}
if(new Set(inputs.map(s=>s.restSha256)).size!==1)
  throw Error("Kevin rig rest transform differs between clips; refuse per-clip calibration");
const server=await createServer({root,server:{middlewareMode:true},
  appType:"custom",logLevel:"error",configFile:false});
try {
  const {createAnatomyPreset}=await server.ssrLoadModule("/packages/character-core/src/presets.ts");
  const {canonicalRigIdentity,serializeAnimationClip,parseAnimationClip}=await server.ssrLoadModule("/packages/character-core/src/animation.ts");
  const {createRetargetProfile,retargetWorldPose}=await server.ssrLoadModule("/packages/character-core/src/retargeting.ts");
  const {createHumanRestDescriptor}=await server.ssrLoadModule("/packages/character-core/src/retarget-human-frames.ts");
  const {mapKevinMaleHumanoidJoints,validateKevinMaleRestLaterality}=await server.ssrLoadModule("/apps/web/src/characters/animation/KevinHumanoidSkeletonAdapter.ts");
  const {parseAnatomicalOBJ}=await server.ssrLoadModule("/apps/web/src/characters/geometry/AnatomicalTemplate.ts");
  const {makeSourceLandmarks,calibrateHumanBones}=await server.ssrLoadModule("/apps/web/src/characters/geometry/OfficialHumanRig.ts");
  const {createSkinningSpike}=await server.ssrLoadModule("/apps/web/src/characters/geometry/SkinningSpike.ts");
  const graph=createAnatomyPreset({archetype:"human"});
  const rig=canonicalRigIdentity(graph);
  const source=inputs[0];
  const mappings=mapKevinMaleHumanoidJoints(graph,[...source.byName.keys()]);
  validateKevinMaleRestLaterality(source.bones.map(b=>({
    id:b.name,worldPosition:getWorldPos(b),
  })));
  const sourceRig=createHumanRestDescriptor(graph,source.restSha256,
    mappings.map(m=>({targetJointId:m.targetId,nodeId:m.sourceId,
      worldPosition:getWorldPos(source.byName.get(m.sourceId)),
      worldRotation:getWorldQuat(source.byName.get(m.sourceId))})),
    {sourceMapping:mappings});
  const [objBytes,rigBytes]=await Promise.all([
    readFile(resolve(root,"apps/web/public/anatomy/makehuman-base.obj")),
    readFile(resolve(root,"apps/web/public/anatomy/makehuman-default.mhskel")),
  ]);
  const template=parseAnatomicalOBJ(objBytes.toString("utf8"),
    {includeGroups:["body"]});
  const spike=createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
  let targetRig;
  const calibrationSha256=hash(Buffer.concat([objBytes,rigBytes]));
  try {
    const landmarks=makeSourceLandmarks(JSON.parse(rigBytes.toString("utf8")),
      template,new THREE.Float32BufferAttribute(template.sourcePositions,3));
    const targetRoot=spike.skeleton.bones[0].parent;
    calibrateHumanBones(graph,spike.bones,spike.skeleton,targetRoot,landmarks,
      spike.forearmSkinBones,spike.shoulderSkinBones);
    targetRoot.updateMatrixWorld(true);
    targetRig=createHumanRestDescriptor(graph,calibrationSha256,
      graph.joints.map(j=>({targetJointId:j.id,nodeId:j.id,
        worldPosition:getWorldPos(spike.bones.get(j.id)),
        worldRotation:getWorldQuat(spike.bones.get(j.id))})));
  }finally{template.geometry.dispose();spike.dispose();}
  const profile=createRetargetProfile(sourceRig,targetRig,mappings);
  if(profile.calibrations.length!==49)throw Error("Incomplete Kevin profile");
  const immutableProfile=JSON.stringify(profile)+"\n";
  const profileSha256=hash(immutableProfile);
  const generated={ "profile.json":immutableProfile };
  const entries=[];
  for(const input of inputs){
    // FBXLoader owns pre/post rotations, Euler order and axis/unit conversion.
    // Sample every distinct authored key time rather than inventing sinusoids.
    const nativeTimes=input.clip.tracks.flatMap(track=>[...track.times]);
    const times=[...new Set([0,input.clip.duration,...nativeTimes]
      .map(t=>Math.round(t*1e7)/1e7))].sort((a,b)=>a-b);
    if(times[0]!==0||times.at(-1)!==input.clip.duration ||
      times.length*49>8192)
      throw Error("Source exceeds canonical key budget; do not decimate "+input.id);
    const mixer=new THREE.AnimationMixer(input.scene);
    const action=mixer.clipAction(input.clip);
    action.play();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
    const values=new Map(mappings.map(m=>[m.targetId,[]]));
    for(const t of times){
      mixer.setTime(t);
      input.scene.updateMatrixWorld(true);
      const sourceRotations=new Map(mappings.map(m=>
        [m.sourceId,getWorldQuat(input.byName.get(m.sourceId))]));
      const pose=retargetWorldPose(profile,targetRig,sourceRotations,
        sourceRig.identitySha256,"source-anatomical");
      for(const p of pose)values.get(p.jointId).push([...p.rotation]);
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
    const clip={schemaVersion:1,id:input.id,rig,
      durationSeconds:input.clip.duration,
      source:{kind:"external",creator:"kevin-iglesias",
        revision:"human-basic-motions-free-fbx7700",
        license:"Unity Asset Store EULA",sha256:input.fbxSha256,
        origin:"https://assetstore.unity.com/packages/3d/animations/human-basic-motions-free-154271"},
      rootMotion:"locked",
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
      worstSeams:seams.sort((a,b)=>b.seamDegrees-a.seamDegrees).slice(0,6)});
  }
  generated["manifest.json"]=JSON.stringify({schemaVersion:1,
    sourceArchiveSha256:archiveHash,
    immutableSourceRestSha256:source.restSha256,
    targetCalibrationSha256:calibrationSha256,profileSha256,
    entries,distribution:"private-only-not-cleared-for-browser"},null,2)+"\n";
  // Writes only after all three clips have passed canonical validation.
  await mkdir(destination,{recursive:true});
  for(const [filename,data] of Object.entries(generated))
    await writeFile(resolve(destination,filename),data,{mode:0o600});
  console.log(JSON.stringify({profileSha256,mappedJointCount:49,
    clips:entries.map(({id,keyCount,maxSeamDegrees})=>({id,keyCount,maxSeamDegrees})),
    output:destination,publicDistributionAllowed:false}));
}finally{await server.close();}
