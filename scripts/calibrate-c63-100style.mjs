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
const directory=resolve(root,process.argv.find((arg,i)=>i>1&&!arg.startsWith("--"))??"c63-100style-acquisition");
const digest=x=>createHash("sha256").update(x).digest("hex");
const assets={
  "Neutral_ID.bvh":["71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f",282,[655,1555]],
  "Neutral_FW.bvh":["2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6",195,[327,7445]],
  "Neutral_FR.bvh":["f46ca526027a3654c8939a0123413f6008906fb32125d5e885eafcaa830831cb",192,[357,4227]],
};
// Frame_Cuts is part of the official motion contract: do not silently use
// remembered boundaries or accidentally ingest calibration/setup movements.
const cutBytes=await readFile(resolve(directory,"Frame_Cuts.csv"));
if(digest(cutBytes)!=="e3c1d2beab6486e083622cef6a5402fe9b20edc75a9963ea30675c67ec29ee82")
  throw Error("Official 100STYLE frame-cut metadata SHA mismatch");
const csvLines=cutBytes.toString("utf8").replace(/^\uFEFF/,"").trim().split(/\r?\n/);
const columns=csvLines[0].split(",").map(x=>x.trim());
const neutralRows=csvLines.slice(1).map(line=>line.split(",").map(s=>s.trim()))
  .filter(row=>row[0]==="Neutral");
if(neutralRows.length!==1)throw Error("Expected exactly one official Neutral style row");
const cutValues=Object.fromEntries(columns.map((name,i)=>[name,neutralRows[0][i]]));
for(const [name,suffix] of [["Neutral_ID.bvh","ID"],
  ["Neutral_FW.bvh","FW"],["Neutral_FR.bvh","FR"]]){
  const declared=[Number(cutValues[suffix+"_START"]),Number(cutValues[suffix+"_STOP"])];
  if(!declared.every(Number.isInteger)||
     declared.some((n,i)=>n!==assets[name][2][i]))
    throw Error("100STYLE Neutral cut mismatch "+name);
}
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
  const {parseBVH,sampleBVHFrame,evaluateBVHWorldPose}=await server.ssrLoadModule(
    "/packages/character-core/src/bvh.ts");
  const {canonicalRigIdentity,serializeAnimationClip,parseAnimationClip}=await server.ssrLoadModule(
    "/packages/character-core/src/animation.ts");
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
  // Signed anatomical pose diagnostics: link angles alone ignore facing
  // direction and bend-plane normal, so record both in source and target.
  // No synthetic correction or acceptance threshold is applied here.
  const anatomicalCues=(at,sourceNames)=>{
    const point=name=>v(at(sourceNames(name)));
    const direction=(a,b)=>point(b).sub(point(a)).normalize();
    const plane=(a,b,c)=>{
      const first=point(b).sub(point(a));
      const second=point(c).sub(point(b));
      const cross=new THREE.Vector3().crossVectors(first,second);
      return cross.lengthSq()<1e-8?null:cross.normalize();
    };
    const up=direction("Hips","Chest4");
    const right=direction("LeftHip","RightHip");
    const facing=new THREE.Vector3().crossVectors(right,up).normalize();
    const signedPitch=deg(Math.atan2(up.z,up.y));
    const planarFacing=facing.clone().setY(0);
    if(planarFacing.lengthSq()<1e-8)
      throw Error("Degenerate source/target planar facing");
    planarFacing.normalize();
    // Positive is forward lean relative to the actor's OWN heading,
    // regardless of whether this captured frame points toward +Z or -Z.
    const forwardLean=deg(Math.atan2(up.dot(planarFacing),up.y));
    return {facing,up,signedPitch,forwardLean,
      leftElbow:plane("LeftShoulder","LeftElbow","LeftWrist"),
      rightElbow:plane("RightShoulder","RightElbow","RightWrist"),
      leftKnee:plane("LeftHip","LeftKnee","LeftAnkle"),
      rightKnee:plane("RightHip","RightKnee","RightAnkle")};
  };
  const comparativeCues=(sourcePose,targetPose,lookup)=>{
    const native=anatomicalCues(name=>sourcePose.positions[lookup.get(name)],
      name=>name);
    const roleFor=name=>{
      const role=Object.fromEntries(pairs)[name];
      const node=graph.joints.find(j=>j.role===role);
      if(!node)throw Error("Unknown mapped role for anatomical cue "+name);
      return node.id;
    };
    const targetCues=anatomicalCues(
      name=>targetPose.positions.get(roleFor(name)),name=>name);
    const normalError=name=>native[name]&&targetCues[name]
      ?angle(native[name].toArray(),targetCues[name].toArray()):null;
    return {
      sourceForwardLeanDegrees:native.forwardLean,
      targetForwardLeanDegrees:targetCues.forwardLean,
      forwardLeanDifferenceDegrees:+(targetCues.forwardLean-native.forwardLean).toFixed(4),
      sourceTorsoPitchDegrees:native.signedPitch,
      targetTorsoPitchDegrees:targetCues.signedPitch,
      torsoPitchDifferenceDegrees:deg((targetCues.signedPitch-native.signedPitch)*Math.PI/180),
      sourceFacing:native.facing.toArray(),
      targetFacing:targetCues.facing.toArray(),
      facingResidualDegrees:angle(native.facing.toArray(),targetCues.facing.toArray()),
      torsoUpResidualDegrees:angle(native.up.toArray(),targetCues.up.toArray()),
      signedBendPlaneResidualDegrees:{
        leftElbow:normalError("leftElbow"),rightElbow:normalError("rightElbow"),
        leftKnee:normalError("leftKnee"),rightKnee:normalError("rightKnee"),
      },
      note:"A near-straight limb can have an undefined or noisy bend plane; null is preserved, not interpreted as zero error",
    };
  };
  const reports=[];
  for(const [filename,{source,lookup,reference:sourceRef,cut}] of sources){
    // Recorded setup T poses may face different compass headings even on the
    // same skeleton. Strip global heading only for *reference comparison*;
    // actual motion below retains the one ID-derived family conversion.
    const measureTPose=frame=>{
      const native=evaluateBVHWorldPose(source,frame);
      const facing=bodyFrame(source,native);
      const positions=native.positions.map(p=>
        v(p).applyQuaternion(facing.correction).multiplyScalar(scale));
      const direction=(a,b)=>positions[lookup.get(b)].clone()
        .sub(positions[lookup.get(a)]).normalize();
      // Require actual bilateral extension: a forward-moving or relaxed
      // motion frame is not interchangeable with a recorded T-like setup.
      const leftUpper=direction("LeftShoulder","LeftElbow");
      const rightUpper=direction("RightShoulder","RightElbow");
      const leftLower=direction("LeftElbow","LeftWrist");
      const rightLower=direction("RightElbow","RightWrist");
      const horizontal=Math.min(-leftUpper.x,rightUpper.x,
        -leftLower.x,rightLower.x);
      const links=measuredLinks.map(([a,b])=>({
        link:a+"->"+b,
        degrees:angle(direction(a,b).toArray(),
          reference.positions[id.lookup.get(b)].clone()
            .sub(reference.positions[id.lookup.get(a)]).toArray()),
      }));
      return {frame,facing:facing.forward.toArray(),horizontal,
        links,max:Math.max(...links.map(x=>x.degrees)),
        average:links.reduce((sum,x)=>sum+x.degrees,0)/links.length};
    };
    // Publisher setup regions contain more than one T-like posture and
    // compass headings. Find the best whole-body anatomical match, not
    // merely the most horizontal arms. This diagnostic-only choice never
    // changes the ONE family source-rest profile or animated clip rotations.
    let selected=measureTPose(sourceRef);
    if(filename!=="Neutral_ID.bvh"){
      for(let frame=0;frame<cut[0];frame+=3){
        const candidate=measureTPose(frame);
        if(candidate.horizontal<.94)continue;
        if(candidate.max<selected.max-1e-5||
          (Math.abs(candidate.max-selected.max)<=1e-5&&
            candidate.average<selected.average))
          selected=candidate;
      }
    }
    const tResidual=selected.links.map(x=>x.degrees);
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
        wholeBodyCues:comparativeCues(actual,targetPose,lookup),
      });
    }
    reports.push({filename,originalSha256:assets[filename][0],
      initialTPoseCandidateFrame:sourceRef,
      measuredTPoseReferenceFrame:selected.frame,
      measuredTPoseArmExtension:selected.horizontal,
      measuredTPoseWorstLinks:selected.links.sort((a,b)=>b.degrees-a.degrees).slice(0,5),
      relativeTPoseMaximumDirectionDegrees:+Math.max(...tResidual).toFixed(4),
      sourceFacingAtReference:selected.facing,
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
        mean:x.meanDegrees,p95:x.p95Degrees,max:x.maxDegrees,worst:x.worst,
        wholeBodyCues:x.wholeBodyCues}))})),
  }));
  // Experimental three-motion source-backed bake is confined to the CI artifact.
  // Cut bounds are publisher-defined; no loop is called seamless without measurement.
  // Frame-count and total-key budgets are evaluated against the canonical clip schema.
  const baked={};
  const bakeRecords=[];
  const chosen={
    "Neutral_ID.bvh":{id:"human-100style-neutral-idle",range:[90,160],minimumTravel:0},
    "Neutral_FW.bvh":{id:"human-100style-neutral-walk",range:[55,110],minimumTravel:.30},
    "Neutral_FR.bvh":{id:"human-100style-neutral-run",range:[35,80],minimumTravel:.50},
  };
  const identity=canonicalRigIdentity(graph);
  for(const [filename,{source,lookup,cut}] of sources){
    const {id:clipId,range,minimumTravel}=chosen[filename];
    const [cutStart,cutStop]=cut;
    const jointIndices=sourceMaps.map(m=>lookup.get(m.sourceId));
    const sourceFrame=new Map(),sourceLocal=new Map();
    const at=i=>{
      let found=sourceFrame.get(i);
      if(!found){
        const native=evaluateBVHWorldPose(source,i);
        found={native,normalized:norm(native,scale)};
        sourceFrame.set(i,found);
      }
      return found;
    };
    const local=i=>{
      let found=sourceLocal.get(i);
      if(!found){
        found=sampleBVHFrame(source,i);
        sourceLocal.set(i,found);
      }
      return found;
    };
    const angleDeg=(a,b)=>{
      const value=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];
      return (360/Math.PI)*Math.acos(Math.min(1,Math.abs(value)));
    };
    let winner;
    // Dense source-backed loop search considers all gait phases, rather than
    // choosing among only 28 coarse starting frames. Compare declared-order
    // LOCAL quaternions (invariant to the person's world travel), authored
    // pelvis motion, AND angular-speed continuity across the potential seam.
    for(let start=cutStart+6;start+range[1]+6<cutStop;start+=2){
      const first=local(start),before=local(start-1),after=local(start+1);
      for(let length=range[0];length<=range[1];length++){
        const last=start+length;
        const final=local(last),prior=local(last-1),following=local(last+1);
        let sum=0,max=0,velocityMismatch=0;
        for(const idx of jointIndices){
          const a=angleDeg(first.rotations[idx],final.rotations[idx]);
          const headSpeed=angleDeg(before.rotations[idx],after.rotations[idx]);
          const tailSpeed=angleDeg(prior.rotations[idx],following.rotations[idx]);
          sum+=a;max=Math.max(max,a);
          velocityMismatch+=Math.abs(headSpeed-tailSpeed);
        }
        const mean=sum/jointIndices.length;
        const angularSpeedSeam=velocityMismatch/jointIndices.length;
        const firstRoot=first.sourceRootTranslation;
        const finalRoot=final.sourceRootTranslation;
        const rootDelta=firstRoot.map((x,i)=>x-finalRoot[i]);
        const rootTravel= Math.hypot(...rootDelta)*scale;
        const vertical=Math.abs(rootDelta[1])*scale;
        const motionPenalty=Math.max(0,minimumTravel-rootTravel)*200;
        const score=mean+.32*max+.2*angularSpeedSeam+
          vertical*100+motionPenalty;
        if(!winner||score<winner.score)
          winner={start,last,frameLength:length,score,
            angularMeanDegrees:mean,angularMaxDegrees:max,
            angularVelocitySeamDegrees:angularSpeedSeam,
            verticalSeamMeters:vertical,rootTravelMeters:rootTravel};
      }
    }
    if(!winner)throw Error("No source-backed loop candidate "+filename);
    const {start,last}=winner;
    const frames=last-start+1;
    if(sourceMaps.length*frames>8192)
      throw Error("Clip would violate canonical total-key limit "+clipId);
    const times=Array.from({length:frames},(_,i)=>
      +(i*source.frameTimeSeconds).toFixed(7));
    const duration=times.at(-1);
    const buffers=new Map(sourceMaps.map(m=>[m.targetId,[]]));
    const bob=[];
    const firstRoot=at(start).normalized.positions[0];
    for(let frame=start;frame<=last;frame++){
      const pose=at(frame).normalized;
      const rotations=new Map(source.joints.map((j,i)=>[
        j.name,pose.rotations[i].toArray()]));
      const retarget=retargetWorldPose(profile,target,rotations,
        fingerprint,"source-anatomical");
      for(const sample of retarget)
        buffers.get(sample.jointId).push([...sample.rotation]);
      const root=pose.positions[0];
      bob.push([0,root.y-firstRoot.y,0]);
    }
    const rotationTracks=sourceMaps.map(mapping=>{
      const values=buffers.get(mapping.targetId);
      for(let i=1;i<values.length;i++)
        if(values[i-1].reduce((sum,x,k)=>sum+x*values[i][k],0)<0)
          values[i]=values[i].map(x=>-x);
      return {jointId:mapping.targetId,channel:"rotation",
        timesSeconds:times,values};
    });
    const maxRetargetSeam=rotationTracks.reduce((max,track)=>{
      const start=q(track.values[0]),end=q(track.values.at(-1));
      return Math.max(max,deg(start.angleTo(end)));
    },0);
    const maxTargetSeam=filename==="Neutral_ID.bvh"?2:
      filename==="Neutral_FW.bvh"?9:18;
    const severeSeam=winner.angularMaxDegrees>25||
      maxRetargetSeam>maxTargetSeam||winner.verticalSeamMeters>.02;
    if(severeSeam)
      throw Error("Source-backed loop seam not suitable for baking "+clipId+
        ": "+JSON.stringify({...winner,maxRetargetSeam}));
    // A nearly closed input can be interpolated by the runtime sampler at the
    // wrap; never overwrite the last authored pose to manufacture a perfect seam.
    const locked=filename==="Neutral_ID.bvh";
    const tracks=[...rotationTracks];
    if(!locked){
      // World-space forward travel is recorded in diagnostics, never applied to
      // the visual root on top of gameplay displacement.
      tracks.push({jointId:identity.rootJointId,channel:"translation",
        timesSeconds:times,values:bob});
    }
    const clip={
      schemaVersion:1,id:clipId,rig:identity,durationSeconds:duration,
      source:{kind:"external",creator:"100style",
        revision:"neutral-original-bvh-c63-experimental",
        license:"CC-BY-4.0",origin:"https://www.ianxmason.com/100style/",
        sha256:assets[filename][0]},
      rootMotion:locked?"locked":"visual_only",
      layer:{mode:"base",jointMask:[...new Set(tracks.map(t=>t.jointId))]},
      retarget:{mode:"rest_delta",authoredBindPoseId:identity.bindPoseId},
      tracks,contacts:[],
    };
    const encoded=serializeAnimationClip(clip,graph)+"\n";
    parseAnimationClip(encoded,graph);
    baked[clipId+".clip.json"]=encoded;
    const reviewedFrames=[start,Math.round(start+(last-start)*.25),
      Math.round((start+last)*.5),Math.round(start+(last-start)*.75),last];
    const fullCyclePoseEvidence=reviewedFrames.map(frame=>{
      const actual=at(frame).normalized;
      const rotations=new Map(source.joints.map((j,i)=>[
        j.name,actual.rotations[i].toArray()]));
      const samples=retargetWorldPose(profile,target,rotations,
        fingerprint,"source-anatomical");
      return {frame,seconds:+((frame-start)*source.frameTimeSeconds).toFixed(6),
        ...comparativeCues(actual,targetFK(samples),lookup)};
    });
    const startRoot=at(start).normalized.positions[0];
    const endRoot=at(last).normalized.positions[0];
    const travel=endRoot.clone().sub(startRoot).setY(0);
    const facing=v(fullCyclePoseEvidence[Math.floor(fullCyclePoseEvidence.length/2)].sourceFacing)
      .setY(0).normalize();
    const forwardTravel=travel.dot(facing);
    console.log("C63_100STYLE_GAIT_POSTURE "+JSON.stringify({
      id:clipId,loopRange:[start,last],fullCyclePoseEvidence,
      horizontalTravelMeters:travel.length(),
      travelAlongBodyFacingMeters:forwardTravel,
      relativeTravelDirection:Math.abs(forwardTravel)<.001?"near-stationary":
        forwardTravel>0?"along-facing":"against-facing",
    }));
    bakeRecords.push({id:clipId,original:filename,
      originalSha256:assets[filename][0],
      captureRange:cut,loopRange:[start,last],
      durationSeconds:duration,sourceSamples:frames,
      sourceAngularSeamMeanDegrees:winner.angularMeanDegrees,
      sourceAngularSeamMaxDegrees:winner.angularMaxDegrees,
      sourceAngularVelocitySeamDegrees:winner.angularVelocitySeamDegrees,
      targetAngularSeamMaxDegrees:maxRetargetSeam,
      verticalSeamMeters:winner.verticalSeamMeters,
      rootWorldTravelMeters:winner.rootTravelMeters,
      artifactSha256:digest(encoded),bytes:Buffer.byteLength(encoded),
      acceptedForProduction:false});
  }
  const manifest={
    schemaVersion:1,kind:"c6.3-100style-neutral-experimental",
    acceptedForProduction:false,
    sourceFamilySha256:fingerprint,
    sourceReferenceFrame:assets["Neutral_ID.bvh"][1],
    sourceToTargetScale:scale,
    sourceFrameCorrectionQuaternion:normQ.toArray(),
    targetIdentitySha256:targetHash,
    profileSha256:digest(JSON.stringify(profile,null,2)+"\n"),
    license:"CC-BY-4.0",origin:"https://www.ianxmason.com/100style/",
    clips:bakeRecords,
    warning:"Opt-in owner-review Studio only; requires skinned target/browser multi-angle quality acceptance",
  };
  for(const [name,data] of Object.entries(baked))
    await writeFile(resolve(directory,name),data);
  await writeFile(resolve(directory,"100style-experimental-manifest.json"),
    JSON.stringify(manifest,null,2)+"\n");
  console.log("C63_100STYLE_EXPERIMENTAL_BAKE "+JSON.stringify(
    {count:bakeRecords.length,clips:bakeRecords}));
  // Do not claim the reference is accepted based on unit quaternions alone.
  if(reports.some(r=>r.relativeTPoseMaximumDirectionDegrees>25))
    throw Error("The three recorded source T candidates are not yet one physically consistent reference");
  if(reports.some(r=>r.sampledSourceToTargetLinks.some(p=>p.p95Degrees>50)))
    throw Error("100STYLE skeletal direction residual exceeds diagnostic gate; do not bake/promote");
  // Local review-only import bridge: output SHA-verifiable text blobs through
  // ephemeral CI job logs, never the original multi-MB licensed BVH recordings.
  // The GitHub connector imports these reviewed artifacts onto PR #118;
  // without this explicit flag, source files stay exclusively in CI artifacts.
  if(process.argv.includes("--emit-review-blobs")){
    const reviewFiles={
      ...baked,
      "100style-neutral-profile.json":JSON.stringify(profile,null,2)+"\n",
      "100style-neutral-manifest.json":JSON.stringify(manifest,null,2)+"\n",
    };
    for(const [name,content] of Object.entries(reviewFiles)){
      const base64=Buffer.from(content,"utf8").toString("base64");
      const chunks=base64.match(/.{1,6000}/g)??[];
      console.log("C63_REVIEW_FILE "+name+" "+digest(content)+" "+chunks.length);
      for(let i=0;i<chunks.length;i++)
        console.log("C63_REVIEW_CHUNK "+name+" "+i+" "+chunks[i]);
    }
  }
}finally{await server.close();}
