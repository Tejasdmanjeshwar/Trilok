/**
 * Kevin Iglesias FBX 7700 offline import conventions (Three.js r180).
 * Source is Z-up in centimeters. C1 uses Y-up in meters.
 * No private source bytes, animation curves, or per-clip correction in this module.
 */
import * as THREE from "three";

const SIDE_END=/^(B-(?:hand|handProp|shoulder|upperArm|forearm|thigh|shin|foot|toe|(?:indexFinger|middleFinger|ringFinger|pinky|thumb)0[1-3]))[_.]?([LR])$/;

/** FBXLoader sanitizes . in three.js PropertyBinding node names. */
export function originalKevinBoneName(node) {
  const name=node.userData?.originalName || node.name;
  if(typeof name!=="string"||!name.startsWith("B-"))
    throw Error("Unexpected Kevin source bone name "+String(name));
  return name.replace(SIDE_END,"$1.$2");
}
export function indexKevinBones(scene, expected=56) {
  const byName=new Map();
  scene.traverse(obj=>{
    if(!obj.isBone)return;
    const name=originalKevinBoneName(obj);
    if(byName.has(name))throw Error("Duplicate Kevin FBXLoader bone "+name);
    byName.set(name,obj);
  });
  if(byName.size!==expected)
    throw Error("Unexpected imported Kevin bone count "+byName.size+"; expected "+expected);
  return byName;
}
export const getKevinWorldPosition=bone=>
  bone.getWorldPosition(new THREE.Vector3());
export const getKevinWorldRotation=bone=>
  bone.getWorldQuaternion(new THREE.Quaternion());
export const kevinVec3=v=>[v.x,v.y,v.z];
export const kevinQuat4=q=>[q.x,q.y,q.z,q.w];

/** Apply ONE source-family coordinate/scale convention, never a per-clip fix.
 * r180 FBXLoader keeps the declared Z-up axes; adjust the root once, after
 * parsing and BEFORE measuring the source bind/rest or animation curves.
 * Fail if the loader upgrades/starts applying the conversion automatically.
 */
export function normalizeKevinFBXScene(scene, {expectedBoneCount=56}={}) {
  if(!scene?.isGroup || scene.quaternion.angleTo(new THREE.Quaternion())>1e-8 ||
    scene.scale.distanceTo(new THREE.Vector3(1,1,1))>1e-8)
    throw Error("Unexpected FBXLoader scene transform; re-audit Z-up conversion");
  scene.rotation.set(-Math.PI/2,0,0);
  scene.scale.setScalar(.01); // FBX UnitScaleFactor=1 (centimeter), C1 meter.
  scene.updateMatrixWorld(true);
  const byName=indexKevinBones(scene,expectedBoneCount);
  const named=name=>{
    const bone=byName.get(name);
    if(!bone)throw Error("Missing source landmark "+name);
    return getKevinWorldPosition(bone);
  };
  const hips=named("B-hips"),head=named("B-head");
  const handL=named("B-hand.L"),handR=named("B-hand.R");
  const footL=named("B-foot.L");
  // These are intentionally broad REAL-METER/side sanity bounds for this
  // exact archived male skeleton, not fitted rotational offsets.
  if(!(hips.y>.8&&hips.y<1.2 && head.y>hips.y+.35 &&
    handL.y>hips.y && handR.y>hips.y &&
    handL.x>.5 && handR.x<-.5 &&
    footL.y>0&&footL.y<.3))
    throw Error("Kevin FBXLoader source axes/units or rest layout do not match original bind pose");
  return byName;
}

function maxDifference(a,b) {
  return Math.max(...a.elements.map((n,i)=>Math.abs(n-b.elements[i])));
}

/** The separately supplied male source mesh has 52 real clusters.
 * Source model has 55 bones: B-spineProxy is an animation-only control.
 * Check actual skin inverse binds and rest agreement before calibration.
 */
export function verifyKevinModelBind(modelScene, modelBones, animatedBones) {
  const absent=[...animatedBones.keys()].filter(name=>!modelBones.has(name));
  if(absent.length!==1||absent[0]!=="B-spineProxy" || modelBones.size!==55)
    throw Error("Kevin model/source hierarchy mismatch (expected only B-spineProxy omitted)");
  let maximumRestTranslationMeters=0,maximumRestAngleRadians=0;
  for(const [name,bone] of modelBones) {
    const match=animatedBones.get(name);
    if(!match)throw Error("Missing Kevin animated bone "+name);
    maximumRestTranslationMeters=Math.max(maximumRestTranslationMeters,
      getKevinWorldPosition(bone).distanceTo(getKevinWorldPosition(match)));
    maximumRestAngleRadians=Math.max(maximumRestAngleRadians,
      getKevinWorldRotation(bone).angleTo(getKevinWorldRotation(match)));
  }
  if(maximumRestTranslationMeters>1e-4||maximumRestAngleRadians>1e-3)
    throw Error("Kevin model bind differs from authored animation rest: "+
      maximumRestTranslationMeters+"m / "+maximumRestAngleRadians+"rad");
  const meshes=[];
  modelScene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
  if(meshes.length!==1)throw Error("Expected one genuine Kevin male skinned source mesh");
  const skin=meshes[0].skeleton;
  if(skin.bones.length!==52||skin.boneInverses.length!==52)
    throw Error("Expected 52 Kevin source skin clusters/bind transforms");
  // FBX bind inverses may be expressed relative to a common mesh matrix.
  // Every J_world * IBM MUST produce the same matrix in that bind space.
  let bind=null,maximumBindResidual=0;
  for(let i=0;i<skin.bones.length;i++) {
    const matrix=skin.bones[i].matrixWorld.clone().multiply(skin.boneInverses[i]);
    if(!bind)bind=matrix;
    maximumBindResidual=Math.max(maximumBindResidual,maxDifference(matrix,bind));
  }
  if(!Number.isFinite(maximumBindResidual)||maximumBindResidual>1e-3)
    throw Error("Source skin clusters disagree on bind space: "+maximumBindResidual);
  return {skinClusterCount:52,maximumBindResidual,
    maximumRestTranslationMeters,maximumRestAngleRadians};
}
