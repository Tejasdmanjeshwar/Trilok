/**
 * Deterministic C6.3 KayKit CC0 authored directional motion baker.
 * Reuses canonical C1 + the C6.2 anatomical-frame retargeter without
 * changing the four owner-approved UAL1 clips or their manifest/profile.
 *
 * node scripts/bake-c63-kaykit.mjs [--source path] [--output dir] [--write]
 * Default is byte-for-byte reproducibility verification.
 */
import * as THREE from "three";
import {createServer} from "vite";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const flag=(name,defaultValue)=>{
  const i=process.argv.indexOf(name);
  return i<0?defaultValue:process.argv[i+1]??(()=>{throw Error("Missing "+name)})();
};
const sourceFile=resolve(root,flag("--source",
  "assets/animations/sources/kaykit-adventurers-locomotion-v1.json"));
const output=resolve(root,flag("--output","assets/animations/studio-v1"));
const write=process.argv.includes("--write");
const emit=process.argv.includes("--emit");
const hash=b=>createHash("sha256").update(b).digest("hex");
const [sourceBytes,objBytes,rigBytes]=await Promise.all([
  readFile(sourceFile),
  readFile(resolve(root,"apps/web/public/anatomy/makehuman-base.obj")),
  readFile(resolve(root,"apps/web/public/anatomy/makehuman-default.mhskel")),
]);
const source=JSON.parse(sourceBytes.toString("utf8"));
const SOURCE_SHA="60428e3abc09ba83e595d256e3af8c5c976b46cdae599f0802fc82b4a3445168";
if(source.schemaVersion!==1||source.sourceGlbSha256!==SOURCE_SHA||
  source.license!=="CC0-1.0"||source.revision!==
  "672074b73ba276876a19e8816ecdc5241817ab47"||
  !Array.isArray(source.nodes)||source.nodes.length<50||
  !Array.isArray(source.clips)||source.clips.length!==3)
  throw Error("Unpinned KayKit authored source");
const nodes=source.nodes;
const scene=new THREE.Group();
const objects=nodes.map(n=>{
  const obj=new THREE.Object3D();
  obj.name=n.name;
  obj.position.fromArray(n.translation);
  obj.quaternion.fromArray(n.rotation).normalize();
  obj.scale.fromArray(n.scale);
  return obj;
});
const indices=new Map();
nodes.forEach((n,i)=>{
  if(indices.has(n.name))throw Error("Duplicate KayKit name "+n.name);
  indices.set(n.name,i);
  if(n.parent!==null && (n.parent<0||n.parent>=nodes.length))
    throw Error("Invalid hierarchy "+n.name);
  (n.parent===null?scene:objects[n.parent]).add(objects[i]);
});
scene.updateMatrixWorld(true);
const get=name=>{
  const index=indices.get(name);
  if(index===undefined)throw Error("Missing source joint "+name);
  return objects[index];
};
const pos=o=>{
  const v=o.getWorldPosition(new THREE.Vector3());
  return [v.x,v.y,v.z];
};
const quat=o=>{
  const v=o.getWorldQuaternion(new THREE.Quaternion());
  return [v.x,v.y,v.z,v.w];
};
const fromName=name=>pos(get(name));
const v=(a)=>new THREE.Vector3().fromArray(a);
const difference=(a,b)=>v(a).sub(v(b)).toArray();
const norm=(a,label)=>{
  const d=v(a);
  if(d.lengthSq()<1e-12)throw Error("Unmeasured KayKit cue "+label);
  return d.normalize().toArray();
};
const cross=(a,b)=>v(a).cross(v(b)).toArray();
const right=norm(difference(fromName("upperleg.r"),fromName("upperleg.l")),"bilateral hip");
const up=norm(difference(fromName("chest"),fromName("hips")),"torso");
const forward=norm(cross(right,up),"signed forward");
function joint(name,parent,targetRole,side){
  return {name,parent,targetRole,side};
}
const definitions=[
  joint("hips",null,"pelvis"),
  joint("spine","hips","spine_lower"),
  joint("chest","spine","chest"),
  joint("head","chest","head"),
  ...(["l","r"]).flatMap(side=>{
    const anatomicalSide=side==="l"?"left":"right";
    return [
      joint("upperarm."+side,"chest","shoulder_"+anatomicalSide,anatomicalSide),
      joint("lowerarm."+side,"upperarm."+side,"elbow_"+anatomicalSide,anatomicalSide),
      joint("hand."+side,"lowerarm."+side,"wrist_"+anatomicalSide,anatomicalSide),
      joint("upperleg."+side,"hips","hip_"+anatomicalSide,anatomicalSide),
      joint("lowerleg."+side,"upperleg."+side,"knee_"+anatomicalSide,anatomicalSide),
      joint("foot."+side,"lowerleg."+side,"ankle_"+anatomicalSide,anatomicalSide),
      joint("toes."+side,"foot."+side,"toe_"+anatomicalSide,anatomicalSide),
    ];
  }),
];
function shaft(name){
  const child={
    hips:"spine",spine:"chest",chest:"head",head:"head",
  };
  for(const side of ["l","r"]){
    Object.assign(child,{
      ["upperarm."+side]:"lowerarm."+side,
      ["lowerarm."+side]:"hand."+side,
      ["hand."+side]:"hand."+side,
      ["upperleg."+side]:"lowerleg."+side,
      ["lowerleg."+side]:"foot."+side,
      ["foot."+side]:"toes."+side,
      ["toes."+side]:"toes."+side,
    });
  }
  const segment=child[name];
  if(!segment)throw Error("Unknown shaft "+name);
  if(segment===name){
    const parent=definitions.find(j=>j.name===name).parent;
    return norm(difference(fromName(name),fromName(parent)),"distal "+name);
  }
  return norm(difference(fromName(segment),fromName(name)),"shaft "+name);
}
function secondary(name){
  if(name.startsWith("foot.")||name.startsWith("toes."))
    return up;
  const match=/^(?:lowerarm|hand)\.(l|r)$/.exec(name);
  if(match){
    const side=match[1];
    const wrist=fromName("hand."+side);
    const slot=fromName("handslot."+side);
    const palm=difference(slot,wrist);
    const axis=shaft(name);
    const projected=v(palm).sub(v(axis).multiplyScalar(v(palm).dot(v(axis))));
    if(projected.lengthSq()<1e-6)
      throw Error("Cannot resolve KayKit hand grip plane "+side);
    return norm(projected.toArray(),"palm "+side);
  }
  return forward;
}
let bindResidual=0,referenceBind;
const inverseBind=source.sourceSkin?.inverseBindMatrices;
const jointNames=source.sourceSkin?.jointNames;
if(!Array.isArray(inverseBind)||!Array.isArray(jointNames)||
  inverseBind.length!==41||jointNames.length!==41)
  throw Error("Source inverse skin bind metadata missing");
for(let i=0;i<jointNames.length;i++){
  const elements=inverseBind[i];
  if(!Array.isArray(elements)||elements.length!==16||!elements.every(Number.isFinite))
    throw Error("Malformed KayKit IBM");
  const matrix=new THREE.Matrix4().fromArray(elements);
  if(Math.abs(matrix.determinant())<1e-10)throw Error("Singular KayKit IBM");
  const bound=get(jointNames[i]).matrixWorld.clone().multiply(matrix);
  if(!referenceBind)referenceBind=bound;
  for(let k=0;k<16;k++)
    bindResidual=Math.max(bindResidual,
      Math.abs(bound.elements[k]-referenceBind.elements[k]));
}
if(bindResidual>.002)throw Error("KayKit skin does not match measured source rest "+bindResidual);
const server=await createServer({root,server:{middlewareMode:true},appType:"custom",
  logLevel:"error",configFile:false});
try{
  const {createAnatomyPreset}=await server.ssrLoadModule(
    "/packages/character-core/src/presets.ts");
  const {canonicalRigIdentity,serializeAnimationClip,parseAnimationClip}=
    await server.ssrLoadModule("/packages/character-core/src/animation.ts");
  const {createRetargetProfile,retargetWorldPose}=
    await server.ssrLoadModule("/packages/character-core/src/retargeting.ts");
  const {createHumanRestDescriptor}=
    await server.ssrLoadModule("/packages/character-core/src/retarget-human-frames.ts");
  const {parseAnatomicalOBJ}=
    await server.ssrLoadModule("/apps/web/src/characters/geometry/AnatomicalTemplate.ts");
  const {makeSourceLandmarks,calibrateHumanBones}=
    await server.ssrLoadModule("/apps/web/src/characters/geometry/OfficialHumanRig.ts");
  const {createSkinningSpike}=
    await server.ssrLoadModule("/apps/web/src/characters/geometry/SkinningSpike.ts");
  const graph=createAnatomyPreset({archetype:"human"});
  const rig=canonicalRigIdentity(graph);
  const mappings=definitions.map(def=>{
    const matches=graph.joints.filter(j=>j.role===def.targetRole);
    if(matches.length!==1)throw Error("Ambiguous target role "+def.targetRole);
    return {sourceId:def.name,targetId:matches[0].id};
  });
  const sourceRig={
    schemaVersion:1,identitySha256:SOURCE_SHA,coordinates:graph.coordinates,
    joints:definitions.map(def=>({
      id:def.name,parentId:def.parent,
      restWorldPosition:fromName(def.name),restWorldRotation:quat(get(def.name)),
      shaftWorld:shaft(def.name),secondaryWorld:secondary(def.name),
    })),
  };
  const template=parseAnatomicalOBJ(objBytes.toString("utf8"),{includeGroups:["body"]});
  const spike=createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
  let targetRig;
  const targetHash=hash(Buffer.concat([objBytes,rigBytes]));
  try{
    const landmarks=makeSourceLandmarks(JSON.parse(rigBytes.toString("utf8")),
      template,new THREE.Float32BufferAttribute(template.sourcePositions,3));
    const root=spike.skeleton.bones[0].parent;
    calibrateHumanBones(graph,spike.bones,spike.skeleton,root,landmarks,
      spike.forearmSkinBones,spike.shoulderSkinBones);
    root.updateWorldMatrix(true);
    targetRig=createHumanRestDescriptor(graph,targetHash,
      graph.joints.map(j=>{
        const node=spike.bones.get(j.id);
        return {targetJointId:j.id,nodeId:j.id,
          worldPosition:pos(node),worldRotation:quat(node)};
      }));
  }finally{template.geometry.dispose();spike.dispose();}
  const profile=createRetargetProfile(sourceRig,targetRig,mappings);
  if(profile.calibrations.length!==definitions.length)
    throw Error("Incomplete KayKit anatomical calibration");
  const neutral=retargetWorldPose(profile,targetRig,
    new Map(sourceRig.joints.map(j=>[j.id,j.restWorldRotation])),
    sourceRig.identitySha256,"source-anatomical");
  if(neutral.length!==mappings.length||neutral.some(p=>
    Math.abs(Math.hypot(...p.rotation)-1)>1e-5))
    throw Error("Invalid source A/T rest neutral");
  const files={};
  const profileName="kaykit-profile.json";
  const profileText=JSON.stringify(profile)+"\n";
  files[profileName]=profileText;
  const entries=[];
  const initial=nodes.map(n=>({
    translation:[...n.translation],rotation:[...n.rotation],scale:[...n.scale],
  }));
  for(const clipSource of source.clips){
    const {id,sourceName,durationSeconds,timesSeconds,tracks}=clipSource;
    if(!/^human-(backward|strafe-left|strafe-right)$/.test(id)||
      !(durationSeconds>.2&&durationSeconds<20)||
      timesSeconds[0]!==0||timesSeconds.at(-1)!==durationSeconds)
      throw Error("Invalid authored directional clip "+id);
    const buffers=new Map(mappings.map(m=>[m.targetId,[]]));
    const bob=[];
    let firstPelvis,maxDelta=0;
    for(let frame=0;frame<timesSeconds.length;frame++){
      for(let i=0;i<nodes.length;i++){
        const obj=objects[i],track=tracks[nodes[i].name];
        const rotation=track?.rotation?.[frame]??initial[i].rotation;
        const translation=track?.translation?.[frame]??initial[i].translation;
        const scale=track?.scale?.[frame]??initial[i].scale;
        if(![...rotation,...translation,...scale].every(Number.isFinite))
          throw Error("Nonfinite KayKit pose "+id);
        obj.quaternion.fromArray(rotation).normalize();
        obj.position.fromArray(translation);
        obj.scale.fromArray(scale);
      }
      scene.updateMatrixWorld(true);
      const rotations=new Map(mappings.map(m=>[m.sourceId,quat(get(m.sourceId))]));
      const pose=retargetWorldPose(profile,targetRig,rotations,SOURCE_SHA,"source-anatomical");
      for(const sample of pose)buffers.get(sample.jointId).push(sample.rotation);
      const pelvis=get("hips").getWorldPosition(new THREE.Vector3());
      if(!firstPelvis)firstPelvis=pelvis.clone();
      const delta=pelvis.sub(firstPelvis);
      const offset=[0,delta.y,0]; // No double-applied actor displacement or fabricated side travel.
      bob.push(offset);
      maxDelta=Math.max(maxDelta,Math.abs(offset[1]));
    }
    if(maxDelta>.20)throw Error("Unbounded authored pelvis bob "+id+" "+maxDelta);
    const tracksOut=[];
    let minLoopDot=1;
    for(const m of mappings){
      const values=buffers.get(m.targetId).map(q=>[...q]);
      for(let i=1;i<values.length;i++)
        if(values[i-1].reduce((sum,v,k)=>sum+v*values[i][k],0)<0)
          values[i]=values[i].map(v=>-v);
      const first=values[0],last=values.at(-1);
      const closure=Math.abs(first.reduce((sum,v,k)=>sum+v*last[k],0));
      minLoopDot=Math.min(minLoopDot,closure);
      if(closure<.98)
        throw Error("Authored source is not a gait-cycle loop "+id+"/"+m.sourceId+" dot="+closure);
      // Eliminate sub-frame roundoff seam only; never rewrite source gait curves.
      if(closure>=.9999)values[values.length-1]=[...first];
      tracksOut.push({jointId:m.targetId,channel:"rotation",
        timesSeconds:[...timesSeconds],values});
    }
    bob[bob.length-1]=[...bob[0]];
    tracksOut.push({jointId:rig.rootJointId,channel:"translation",
      timesSeconds:[...timesSeconds],values:bob});
    const clip={
      schemaVersion:1,id,rig,durationSeconds,
      source:{kind:"external",creator:"kaykit",
        revision:"adventurers-1.0-672074b",license:"CC0-1.0",
        origin:source.origin,sha256:SOURCE_SHA},
      rootMotion:"visual_only",
      layer:{mode:"base",jointMask:[...new Set(tracksOut.map(t=>t.jointId))]},
      retarget:{mode:"rest_delta",authoredBindPoseId:rig.bindPoseId},
      tracks:tracksOut,contacts:[],
    };
    const encoded=serializeAnimationClip(clip,graph)+"\n";
    parseAnimationClip(encoded,graph);
    const filename=id+".clip.json";
    files[filename]=encoded;
    entries.push({id,sourceClip:sourceName,filename,
      artifactSha256:hash(encoded),bytes:Buffer.byteLength(encoded),minLoopDot});
  }
  const manifest={
    schemaVersion:1,kind:"c6.3-authored-directional-library",
    sourceGlbSha256:SOURCE_SHA,sourceCommit:source.revision,
    sourceInputSha256:hash(sourceBytes),
    sourceLicense:source.license,sourceOrigin:source.origin,
    targetCalibrationSha256:targetHash,
    sourceBindMaxResidual:bindResidual,
    mappedJointCount:profile.calibrations.length,
    profileSha256:hash(profileText),profile:profileName,
    engine:"packages/character-core/src/retargeting.ts@c6.2-anatomical-absolute-v2",
    entries,
  };
  files["kaykit-manifest.json"]=JSON.stringify(manifest,null,2)+"\n";
  if(write){
    await mkdir(output,{recursive:true});
    for(const [file,content] of Object.entries(files))
      await writeFile(resolve(output,file),content);
  }else if(!emit){
    for(const [file,content] of Object.entries(files))
      if(await readFile(resolve(output,file),"utf8")!==content)
        throw Error("KayKit C6.3 artifact drift "+file);
  }
  console.log(JSON.stringify({profileSha256:manifest.profileSha256,
    joints:profile.calibrations.length,bindResidual,clips:entries}));
  if(emit)console.log("C63_KAYKIT_BEGIN"+JSON.stringify(files)+"C63_KAYKIT_END");
}finally{await server.close();}
