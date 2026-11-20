/**
 * Private C6.3 intake only; no original or derived motion data is committed.
 * Inspect exact owner ZIP using Three.js's FBXLoader, including its FBX
 * pre/post-rotation, Euler order, hierarchy and curve sampling implementation.
 *
 * node scripts/inspect-c63-kevin-fbx.mjs --archive /private/Human\ Basic\ Motions\ FREE.zip
 * Requires standard pnpm install; "unzip" is available on the Linux runner.
 */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import * as THREE from "three";
import {FBXLoader} from "three/addons/loaders/FBXLoader.js";
import {normalizeKevinFBXScene,originalKevinBoneName}
  from "./lib/kevin-fbx-source.mjs";

const EXPECTED_ARCHIVE="063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd";
const SOURCE=[
  "Animations/Male/Idles/HumanM@Idle01.fbx",
  "Animations/Male/Movement/Walk/HumanM@Walk01_Forward.fbx",
  "Animations/Male/Movement/Run/HumanM@Run01_Forward.fbx",
];
const i=process.argv.indexOf("--archive");
if(i<0||!process.argv[i+1])throw Error("Missing --archive with the owner's private regular ZIP");
const archive=resolve(process.argv[i+1]);
const sourceBytes=await readFile(archive);
const actual=createHash("sha256").update(sourceBytes).digest("hex");
if(actual!==EXPECTED_ARCHIVE)throw Error("Kevin source ZIP SHA-256 mismatch: "+actual);
const getNames=scene=>[...normalizeKevinFBXScene(scene).values()];
const getWorld=node=>{
  const p=node.getWorldPosition(new THREE.Vector3());
  const q=node.getWorldQuaternion(new THREE.Quaternion());
  return {position:[p.x,p.y,p.z],rotation:[q.x,q.y,q.z,q.w]};
};
const loader=new FBXLoader();
const results=[];
for(const filename of SOURCE){
  // Extract only the named member; never expand an untrusted ZIP wholesale.
  const fbx=execFileSync("unzip",["-p",archive,filename],{maxBuffer:8*1024*1024});
  if(fbx.subarray(0,21).toString("ascii")!=="Kaydara FBX Binary  \u0000")
    throw Error("Not binary FBX: "+filename);
  if(fbx.readUInt32LE(23)!==7700)throw Error("Not exact FBX 7700: "+filename);
  const sourceSha256=createHash("sha256").update(fbx).digest("hex");
  const buffer=fbx.buffer.slice(fbx.byteOffset,fbx.byteOffset+fbx.byteLength);
  const scene=loader.parse(buffer,"");
  const bones=getNames(scene);
  const byId=new Map(bones.map(b=>[originalKevinBoneName(b),b]));
  const required=["B-root","B-hips","B-spine","B-chest","B-hand.L",
    "B-hand.R","B-forearm.L","B-forearm.R","B-indexFinger01.L",
    "B-indexFinger01.R","B-pinky01.L","B-pinky01.R"];
  if(required.some(name=>!byId.has(name)))throw Error("Missing anatomical FBX landmark");
  const clip=scene.animations[0];
  if(scene.animations.length!==1||!clip||clip.duration<=0 ||
    !Number.isFinite(clip.duration)||clip.tracks.length<56)
    throw Error("Invalid FBXLoader animation stack");
  const rest=bones.map(b=>({name:originalKevinBoneName(b),
    parent:b.parent?.isBone?originalKevinBoneName(b.parent):null,
    ...getWorld(b)})).sort((a,b)=>a.name.localeCompare(b.name));
  // Imported source reference MUST match between clips (no per-clip rig profile).
  const restSignature=createHash("sha256").update(JSON.stringify(rest)).digest("hex");
  const mixer=new THREE.AnimationMixer(scene);
  const action=mixer.clipAction(clip);
  action.play();
  const poses=[];
  for(const t of [0,.25,.5,.75,1].map(a=>a*clip.duration)){
    mixer.setTime(t);
    scene.updateMatrixWorld(true);
    const hands=["B-hips","B-hand.L","B-hand.R","B-foot.L","B-foot.R"]
      .map(name=>({name,...getWorld(byId.get(name))}));
    poses.push({fraction:t/clip.duration,joints:hands});
  }
  mixer.stopAllAction();
  results.push({filename,fbxSha256:sourceSha256,fbxVersion:7700,
    bones:bones.length,restSignature,clipName:clip.name,
    durationSeconds:clip.duration,trackCount:clip.tracks.length,
    trackChannels:clip.tracks.reduce((acc,t)=>{
      const type=t.name.split(".").at(-1);
      acc[type]=(acc[type]??0)+1;return acc;
    },{}),poses});
  // No output files: all sampled data remains in this process and stdout.
}
if(new Set(results.map(r=>r.restSignature)).size!==1)
  throw Error("Three clips disagree on immutable FBX source rest skeleton");
console.log(JSON.stringify({archiveSha256:actual,
  sourceFamilyRestSha256:results[0].restSignature,clips:results},null,2));
