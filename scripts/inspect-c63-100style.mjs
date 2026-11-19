/**
 * Offline-only source probe: validate original 100STYLE bytes through the same
 * TypeScript BVH decoder intended for canonical retargeting. No output assets
 * are accepted as render-ready or imported to the web application.
 */
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createServer} from "vite";
const root=resolve(import.meta.dirname,"..");
const directory=resolve(root,process.argv[2]??"c63-100style-acquisition");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const expected={
  "Neutral_ID.bvh":"71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f",
  "Neutral_FW.bvh":"2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6",
  "Neutral_FR.bvh":"f46ca526027a3654c8939a0123413f6008906fb32125d5e885eafcaa830831cb",
};
const cuts={
  "Neutral_ID.bvh":[655,1555],
  "Neutral_FW.bvh":[327,7445],
  "Neutral_FR.bvh":[357,4227],
};
const server=await createServer({
  root,server:{middlewareMode:true},appType:"custom",
  logLevel:"error",configFile:false,
});
try{
  const {parseBVH,evaluateBVHWorldPose}=await server.ssrLoadModule(
    "/packages/character-core/src/bvh.ts");
  const reports=[];
  const structure=[];
  for(const [name,pin] of Object.entries(expected)){
    const bytes=await readFile(resolve(directory,name));
    if(sha(bytes)!==pin)throw Error("Official source hash mismatch "+name);
    const source=parseBVH(bytes.toString("utf8"));
    const fingerprint=sha(JSON.stringify(source.joints));
    structure.push(fingerprint);
    if(source.joints.length!==23||source.channelCount!==72||
       source.joints[0].name!=="Hips" ||
       JSON.stringify(source.joints[0].channels)!==
       JSON.stringify(["Xposition","Yposition","Zposition","Yrotation","Xrotation","Zrotation"]))
      throw Error("Unexpected Neutral BVH hierarchy/channel declaration "+name);
    const [first,last]=cuts[name];
    if(first>=last||last>=source.frames)throw Error("Invalid capture range "+name);
    const probes=[first,Math.round(first+(last-first)*.2),
      Math.round(first+(last-first)*.4),
      Math.round(first+(last-first)*.6),
      Math.round(first+(last-first)*.8),last];
    const sourceReferenceProbes=[0,1,10,60,Math.max(0,first-1),first,
      Math.round((first+last)/2)].map(index=>{
      const pose=evaluateBVHWorldPose(source,index);
      const p=name=>pose.positions[source.joints.findIndex(j=>j.name===name)];
      const diff=(a,b)=>p(a).map((v,i)=>v-p(b)[i]);
      const unit=v=>v.map(x=>x/Math.hypot(...v));
      const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
      const torso=unit(diff("Chest4","Hips"));
      const right=unit(diff("RightHip","LeftHip"));
      const face=unit([right[1]*torso[2]-right[2]*torso[1],
        right[2]*torso[0]-right[0]*torso[2],
        right[0]*torso[1]-right[1]*torso[0]]);
      const larm=unit(diff("LeftElbow","LeftShoulder"));
      const rarm=unit(diff("RightElbow","RightShoulder"));
      const lknee=unit(diff("LeftKnee","LeftHip"));
      const rknee=unit(diff("RightKnee","RightHip"));
      return {frame:index,torso,right,face,
        leftUpperArm:larm,rightUpperArm:rarm,
        leftUpperLeg:lknee,rightUpperLeg:rknee,
        armSymmetryDot:dot(larm,rarm),
        rootWorld:pose.positions[0],
        pelvisRotation:pose.rotations[0]};
    });
    const samples=probes.map(index=>{
      const pose=evaluateBVHWorldPose(source,index);
      const root=pose.positions[0],leftHip=pose.positions[19],rightHip=pose.positions[15];
      if(![...root,...leftHip,...rightHip].every(Number.isFinite))
        throw Error("Nonfinite source world joint "+name);
      return {frame:index,sourceSeconds:+(index*source.frameTimeSeconds).toFixed(6),
        originalRoot:pose.sourceRootTranslation,
        rootWorld:root,hipSpan:Math.hypot(...leftHip.map((x,i)=>x-rightHip[i]))};
    });
    reports.push({name,sha256:pin,frames:source.frames,
      frameTimeSeconds:source.frameTimeSeconds,structureSha256:fingerprint,
      captureStart:first,captureStop:last,sourceProbes:samples,sourceReferenceProbes});
  }
  if(new Set(structure).size!==1)
    throw Error("100STYLE Neutral source family hierarchy/offsets diverge");
  await writeFile(resolve(directory,"typed-inspection.json"),
    JSON.stringify({schemaVersion:1,kind:"source-only-bvh-fk",
      note:"These are unnormalized source-space samples, NOT retarget quality measurements.",
      jointStructureSha256:structure[0],reports},null,2)+"\n");
  console.log("SOURCE_TYPED_BVH_VERIFIED "+JSON.stringify({
    jointStructureSha256:structure[0],
    files:reports.map(r=>({name:r.name,frames:r.frames,
      frameTimeSeconds:r.frameTimeSeconds,range:[r.captureStart,r.captureStop],
      firstProbe:r.sourceProbes[0],lastProbe:r.sourceProbes.at(-1),
      referenceProbes:r.sourceReferenceProbes})),
  }));
}finally{await server.close();}
