/**
 * C6.3 100STYLE shared anatomical calibration experiment.
 * Run only with official, SHA-pinned BVHs acquired by probe-c63-100style.py.
 * This does not promote clips; a source->skinned-target visual gate is required.
 */
import * as THREE from "three";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createServer} from "vite";

const root=resolve(import.meta.dirname,"..");
const directory=resolve(root,process.argv[2]??"c63-100style-acquisition");
const digest=x=>createHash("sha256").update(x).digest("hex");
const assets={
  "Neutral_ID.bvh":["71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f",282,[655,1555]],
  "Neutral_FW.bvh":["2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6",195,[327,7445]],
  "Neutral_FR.bvh":["f46ca526027a3654c8939a0123413f6008906fb32125d5e885eafcaa830831cb",192,[357,4227]],
};
const pairs=[
  ["Hips","pelvis"],["Chest2","spine_lower"],["Chest4","chest"],
  ["Neck","neck"],["Head","head"],
  ...["Left","Right"].flatMap(side=>{
    const suffix=side.toLowerCase();
    return [["Collar","clavicle"],["Shoulder","shoulder"],
      ["Elbow","elbow"],["Wrist","wrist"],["Hip","hip"],
      ["Knee","knee"],["Ankle","ankle"],["Toe","toe"]]
      .map(([source,target])=>[side+source,target+"_"+suffix]);
  }),
];
const shaftChild={
  Hips:"Chest",Chest:"Chest2",Chest2:"Chest3",Chest3:"Chest4",
  Chest4:"Neck",Neck:"Head",
};
for(const side of ["Left","Right"]){
  Object.assign(shaftChild,{
    [side+"Collar"]:side+"Shoulder",
    [side+"Shoulder"]:side+"Elbow",
    [side+"Elbow"]:side+"Wrist",
    [side+"Hip"]:side+"Knee",
    [side+"Knee"]:side+"Ankle",
    [side+"Ankle"]:side+"Toe",
  });
}
const pos=o=>{const a=o.getWorldPosition(new THREE.Vector3());return a.toArray()};
const quat=o=>{const a=o.getWorldQuaternion(new THREE.Quaternion());return a.toArray()};
const v=a=>new THREE.Vector3(...a);
const q=a=>new THREE.Quaternion(...a);
const normalize=(a,label)=>{
  const x=v(a);
  if(x.lengthSq()<1e-10)throw Error("Degenerate 100STYLE "+label);
  return x.normalize();
};
const deg=d=>+(180*d/Math.PI).toFixed(4);
const angle=(a,b)=>deg(Math.acos(THREE.MathUtils.clamp(normalize(a,"a").dot(normalize(b,"b")),-1,1)));
function bodyFrame(source,pose){
  const names=new Map(source.joints.map((j,i)=>[j.name,i]));
  const at=name=>v(pose.positions[names.get(name)]);
  const right=at("RightHip").sub(at("LeftHip"));
  right.y=0;
  right.normalize();
  if(right.lengthSq()<.9)throw Error("Cannot resolve signed source right vector");
  const up=new THREE.Vector3(0,1,0);
  const forward=new THREE.Vector3().crossVectors(right,up).normalize();
  const orientation=new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right,up,forward));
  return {right,up,forward,correction:orientation.invert()};
}
const server=await createServer({root,server:{middlewareMode:true},appType:"custom",
  logLevel:"error",configFile:false});
try{
  const {parseBVH,evaluateBVHWorldPose}=await server.ssrLoadModule(
    "/packages/character-core/src/bvh.ts");
  const {createAnatomyPreset}=await server.ssrLoadModule(
    "/packages/character-core/src/presets.ts");
  const {createRetargetProfile,retargetWorldPose}=await server.ssrLoadModule(
    "/packages/character-core/src/retargeting.ts");
  const {createHumanRestDescriptor}=await server.ssrLoadModule(
    "/packages/character-core/src/retarget-human-frames.ts");
  const {parseAnatomicalOBJ}=await server.ssrLoadModule(
    "/apps/web/src/characters/geometry/AnatomicalTemplate.ts");
  const {makeSourceLandmarks,calibrateHumanBones}=await server.ssrLoadModule(
    "/apps/web/src/characters/geometry/OfficialHumanRig.ts");
  const {createSkinningSpike}=await server.ssrLoadModule(
    "/apps/web/src/characters/geometry/SkinningSpike.ts");
  const sources=new Map();
  let fingerprint;
  for(const [filename,[pin,reference,cut]] of Object.entries(assets)){
    const bytes=await readFile(resolve(directory,filename));
    if(digest(bytes)!==pin)throw Error("100STYLE source SHA mismatch "+filename);
    const source=parseBVH(bytes.toString("utf8"));
    const hierarchy=digest(JSON.stringify(source.joints));
    if(fingerprint && fingerprint!==hierarchy)
      throw Error("One calibration cannot serve different BVH hierarchies");
    fingerprint=hierarchy;
    if(source.joints.length!==23||source.channelCount!==72 ||
      reference>=cut[0]||cut[1]>=source.frames)
      throw Error("Unexpected source format/bounds "+filename);
    const lookup=new Map(source.joints.map((j,i)=>[j.name,i]));
    for(const [name] of pairs)if(!lookup.has(name))
      throw Error("Missing mapped BVH joint "+name);
    sources.set(filename,{source,lookup,reference,cut});
  }
  const id=sources.get("Neutral_ID.bvh");
  const referencePose=evaluateBVHWorldPose(id.source,id.reference);
  const basis=bodyFrame(id.source,referencePose);
  const normQ=basis.correction;
  // The source posture is a real recorded pre-cut T-like reference, not frame 0.
  const norm=(pose,scale)=>({
    positions:pose.positions.map(p=>v(p).applyQuaternion(normQ).multiplyScalar(scale)),
    rotations:pose.rotations.map(r=>normQ.clone().multiply(q(r)).normalize()),
  });
  const graph=createAnatomyPreset({archetype:"human"});
  const sourceMaps=pairs.map(([sourceId,role])=>{
    const matches=graph.joints.filter(j=>j.role===role);
    if(matches.length!==1)throw Error("Ambiguous C1 human role "+role);
    return {sourceId,targetId:matches[0].id};
  });
  const [objBytes,rigBytes]=await Promise.all([
    readFile(resolve(root,"apps/web/public/anatomy/makehuman-base.obj")),
    readFile(resolve(root,"apps/web/public/anatomy/makehuman-default.mhskel")),
  ]);
  const targetHash=digest(Buffer.concat([objBytes,rigBytes]));
  const template=parseAnatomicalOBJ(objBytes.toString("utf8"),{includeGroups:["body"]});
  const spike=createSkinningSpike({forearmSkinning:true,shoulderSkinning:true});
  let target;
  try{
    const landmarks=makeSourceLandmarks(JSON.parse(rigBytes.toString("utf8")),
      template,new THREE.Float32BufferAttribute(template.sourcePositions,3));
    const anchor=spike.skeleton.bones[0].parent;
    calibrateHumanBones(graph,spike.bones,spike.skeleton,anchor,landmarks,
      spike.forearmSkinBones,spike.shoulderSkinBones);
    anchor.updateWorldMatrix(true);
    target=createHumanRestDescriptor(graph,targetHash,
      graph.joints.map(j=>{
        const node=spike.bones.get(j.id);
        if(!node)throw Error("Missing real target C1 bone "+j.id);
        return {targetJointId:j.id,nodeId:j.id,
          worldPosition:pos(node),worldRotation:quat(node)};
      }));
  }finally{template.geometry.dispose();spike.dispose();}
  const targetRole=role=>{
    const node=graph.joints.find(j=>j.role===role);
    if(!node)throw Error("Missing target role "+role);
    return target.joints.find(j=>j.id===node.id);
  };
  const srcRefHipSpan=v(referencePose.positions[id.lookup.get("RightHip")])
    .distanceTo(v(referencePose.positions[id.lookup.get("LeftHip")]));
  const targetHipSpan=v(targetRole("hip_right").restWorldPosition)
    .distanceTo(v(targetRole("hip_left").restWorldPosition));
  const scale=targetHipSpan/srcRefHipSpan;
  if(!(scale>.004&&scale<.035))throw Error("Anatomical hip-span source unit calibration implausible "+scale);
  const reference=norm(referencePose,scale);
  const refPos=name=>reference.positions[id.lookup.get(name)];
  const worldDir=(from,to)=>refPos(to).clone().sub(refPos(from)).normalize();
  const upper=worldDir("Hips","Chest4");
  const face=new THREE.Vector3(0,0,1);
  const sourceJoints=id.source.joints.map((joint,i)=>{
    const start=reference.positions[i];
    const child=shaftChild[joint.name];
    let axis;
    if(child)axis=refPos(child).clone().sub(start);
    else if(joint.endSites.length){
      // BVH End Site is a real measured distal endpoint, not a fake finger bone.
      axis=v(joint.endSites[0]).applyQuaternion(reference.rotations[i]);
    }else if(joint.parent!==null){
      axis=start.clone().sub(reference.positions[joint.parent]);
    }else throw Error("No anatomical shaft for "+joint.name);
    if(axis.lengthSq()<1e-8)throw Error("Zero shaft "+joint.name);
    // Signed body-frame cue; BVH has no fingers/palm metadata, so wrists' twist
    // calibration remains provisional and is explicitly reported as such.
    const secondary=/Ankle$|Toe$/.test(joint.name)?upper:face;
    return {
      id:joint.name,parentId:joint.parent===null?null:id.source.joints[joint.parent].name,
      restWorldPosition:start.toArray(),
      restWorldRotation:reference.rotations[i].toArray(),
      shaftWorld:axis.normalize().toArray(),
      secondaryWorld:secondary.toArray(),
    };
  });
  const sourceRig={schemaVersion:1,identitySha256:fingerprint,
    coordinates:graph.coordinates,joints:sourceJoints};
  const profile=createRetargetProfile(sourceRig,target,sourceMaps);
  if(profile.calibrations.length!==sourceMaps.length)
    throw Error("100STYLE anatomical mapping incomplete");
  const targetById=new Map(target.joints.map(j=>[j.id,j]));
  const mappedBySource=new Map(sourceMaps.map(m=>[m.sourceId,m.targetId]));
  const mappedJointIds=new Set(sourceMaps.map(m=>m.targetId));
  function targetFK(sample){
    const local=new Map(sample.map(s=>[s.jointId,q(s.rotation)]));
    const rotations=new Map(),positions=new Map();
    const computed=id=>{
      if(rotations.has(id))return;
      const j=targetById.get(id);
      if(!j)throw Error("Unknown target joint "+id);
      const parent=j.parentId;
      if(parent)computed(parent);
      const p=parent?targetById.get(parent):null;
      const currentParent=parent?rotations.get(parent):new THREE.Quaternion();
      const restParent=p?q(p.restWorldRotation):new THREE.Quaternion();
      const restLocal=restParent.clone().invert().multiply(q(j.restWorldRotation));
      const current=currentParent.clone().multiply(restLocal)
        .multiply(local.get(id)??new THREE.Quaternion()).normalize();
      let position=v(j.restWorldPosition);
      if(parent){
        const offset=position.sub(v(p.restWorldPosition));
        offset.applyQuaternion(currentParent.clone().multiply(restParent.clone().invert()));
        position=v(positions.get(parent)).add(offset);
      }
      rotations.set(id,current);
      positions.set(id,position.toArray());
    };
    for(const j of target.joints)computed(j.id);
    return {rotations,positions};
  }
  const measuredLinks=[
    ["Hips","Chest2"],["Chest2","Chest4"],["Chest4","Neck"],["Neck","Head"],
    ...["Left","Right"].flatMap(s=>[
      [s+"Collar",s+"Shoulder"],[s+"Shoulder",s+"Elbow"],
      [s+"Elbow",s+"Wrist"],[s+"Hip",s+"Knee"],
      [s+"Knee",s+"Ankle"],[s+"Ankle",s+"Toe"],
    ]),
  ];
  const reports=[];
  for(const [filename,{source,lookup,reference:sourceRef,cut}] of sources){
    const tPose=norm(evaluateBVHWorldPose(source,sourceRef),scale);
    const tResidual=measuredLinks.map(([a,b])=>angle(
      tPose.positions[lookup.get(b)].clone().sub(tPose.positions[lookup.get(a)]).toArray(),
      reference.positions[id.lookup.get(b)].clone().sub(reference.positions[id.lookup.get(a)]).toArray()));
    const probes=[cut[0]+10,Math.floor(cut[0]+(cut[1]-cut[0])*.25),
      Math.floor((cut[0]+cut[1])/2),
      Math.floor(cut[0]+(cut[1]-cut[0])*.75),cut[1]-10];
    const byFrame=[];
    for(const frame of probes){
      const actual=norm(evaluateBVHWorldPose(source,frame),scale);
      const rotations=new Map(source.joints.map((j,i)=>[j.name,actual.rotations[i].toArray()]));
      const relative=retargetWorldPose(profile,target,rotations,fingerprint,"source-anatomical");
      const targetPose=targetFK(relative);
      const errors=measuredLinks.map(([a,b])=>{
        const s1=lookup.get(a),s2=lookup.get(b);
        const t1=mappedBySource.get(a),t2=mappedBySource.get(b);
        const src=actual.positions[s2].clone().sub(actual.positions[s1]);
        const dst=v(targetPose.positions.get(t2)).sub(v(targetPose.positions.get(t1)));
        return {link:a+"->"+b,angleDegrees:angle(src.toArray(),dst.toArray())};
      });
      const sorted=errors.map(e=>e.angleDegrees).sort((a,b)=>a-b);
      byFrame.push({
        frame,sourceSeconds:+(frame*source.frameTimeSeconds).toFixed(4),
        meanDegrees:+(sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(4),
        p95Degrees:sorted[Math.ceil(sorted.length*.95)-1],
        maxDegrees:sorted.at(-1),worst:errors.sort((a,b)=>b.angleDegrees-a.angleDegrees).slice(0,4),
        authoredRoot:actual.positions[0].toArray(),
      });
    }
    reports.push({filename,originalSha256:assets[filename][0],
      tPoseReferenceFrame:sourceRef,
      relativeTPoseMaximumDirectionDegrees:+Math.max(...tResidual).toFixed(4),
      sourceFacingAtReference:
        bodyFrame(source,evaluateBVHWorldPose(source,sourceRef)).forward.toArray(),
      sampledSourceToTargetLinks:byFrame});
  }
  const result={
    schemaVersion:1,kind:"c6.3-100style-retarget-calibration-diagnostic",
    acceptedForProduction:false,
    sourceIdentitySha256:fingerprint,targetIdentitySha256:targetHash,
    sourceHipSpan:srcRefHipSpan,targetHipSpan,sourceUnitsToMeters:scale,
    correctionQuaternion:normQ.toArray(),
    calibrationJointCount:profile.calibrations.length,
    anatomicalWristTwistVerified:false,
    note:"World anatomical link-angle comparisons are NOT skinned-mesh or gait-loop visual acceptance.",
    reports,
  };
  await mkdir(directory,{recursive:true});
  await writeFile(resolve(directory,"100style-shared-profile.json"),JSON.stringify(profile,null,2)+"\n");
  await writeFile(resolve(directory,"100style-target-reference.json"),JSON.stringify(target,null,2)+"\n");
  await writeFile(resolve(directory,"100style-calibration-report.json"),JSON.stringify(result,null,2)+"\n");
  console.log("C63_100STYLE_SHARED_CALIBRATION "+JSON.stringify({
    sourceIdentitySha256:fingerprint,targetIdentitySha256:targetHash,
    conversion:normQ.toArray(),scale,
    mapped:profile.calibrations.length,
    diagnostic:reports.map(r=>({file:r.filename,
      tPoseMax:r.relativeTPoseMaximumDirectionDegrees,
      probes:r.sampledSourceToTargetLinks.map(x=>({frame:x.frame,
        mean:x.meanDegrees,p95:x.p95Degrees,max:x.maxDegrees,worst:x.worst}))})),
  }));
  // Do not claim the reference is accepted based on unit quaternions alone.
  if(reports.some(r=>r.relativeTPoseMaximumDirectionDegrees>25))
    throw Error("The three recorded source T candidates are not yet one physically consistent reference");
  if(reports.some(r=>r.sampledSourceToTargetLinks.some(p=>p.p95Degrees>50)))
    throw Error("100STYLE skeletal direction residual exceeds diagnostic gate; do not bake/promote");
}finally{await server.close();}
