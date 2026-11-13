import * as THREE from "three";
import type { HumanHeadMorphologyV1 } from "@trilok/character-core";
import type { AnatomicalHuman } from "./AnatomicalTemplate";

const clamp01 = (v: number) => THREE.MathUtils.clamp(v, 0, 1);
const smooth = (v: number) => {
  const t = clamp01(v);
  return t*t*(3-2*t);
};
const bell = (v: number, center: number, radius: number): number => {
  const d = (v-center)/radius;
  return Math.exp(-3*d*d);
};
export type HumanEyeSide = "left" | "right";

/** Eye sockets are source-surface orbital probes, not invented C1 eye bones.
 * Their live position follows the original semantic head's FK. */
export interface HumanHeadLandmarks {
  readonly version: 1;
  readonly neckRest: readonly [number, number, number];
  readonly jawRest: readonly [number, number, number];
  readonly chinRest: readonly [number, number, number];
  readonly crownRest: readonly [number, number, number];
  readonly orbitLeftRest: readonly [number, number, number];
  readonly orbitRightRest: readonly [number, number, number];
  eyeWorld(side: HumanEyeSide, target?: THREE.Vector3): THREE.Vector3;
}
export interface HumanHeadTransform {
  readonly headJointIndex: number;
  readonly jawJointIndex: number;
  /** Original rest-space mapping. No index-dependent UV split seam shifts. */
  point(position: THREE.Vector3): THREE.Vector3;
  /** Calibrated source landmarks, prior to body-scale composition. */
  readonly landmarks: Readonly<{
    neck: THREE.Vector3;
    jaw: THREE.Vector3;
    chin: THREE.Vector3;
    crown: THREE.Vector3;
    eyeLeft: THREE.Vector3;
    eyeRight: THREE.Vector3;
  }>;
}

/** Derive the face envelope from actual CC0 head/jaw owned geometry and the
 * neutral source skeleton; never reconstruct a head from primitive parts. */
export function makeHumanHeadTransform(
  human: AnatomicalHuman,
  shape: HumanHeadMorphologyV1,
): HumanHeadTransform {
  const {spike,mesh} = human;
  const root = spike.character.root;
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const joints = spike.graph.joints;
  const idx = (role:string): number => {
    const i = joints.findIndex(j=>j.role===role);
    if (i < 0) throw new Error("Missing C3.4 head landmark " + role);
    return i;
  };
  const headJointIndex = idx("head");
  const jawJointIndex = idx("jaw");
  const neckJointIndex = idx("neck");
  const rest = (index:number): THREE.Vector3 =>
    spike.skeleton.bones[index]!.getWorldPosition(new THREE.Vector3())
      .applyMatrix4(inverseRoot);
  const neck = rest(neckJointIndex);
  const jaw = rest(jawJointIndex);
  const chin = human.jawTipWorldRest?.clone().applyMatrix4(inverseRoot);
  if (!chin) throw new Error("C3.4 requires the source jaw-tip landmark");

  const position = mesh.geometry.getAttribute("position");
  const skinIndices = mesh.geometry.getAttribute("skinIndex");
  const skinWeights = mesh.geometry.getAttribute("skinWeight");
  if (!position || !skinIndices || !skinWeights ||
      position.itemSize !== 3 || skinIndices.itemSize !== 4 ||
      skinWeights.itemSize !== 4) throw new Error("C3.4 requires four-weight CC0 anatomy");
  const headVertices: THREE.Vector3[] = [];
  for (let i=0;i<position.count;i++) {
    let ownership=0;
    for (let k=0;k<4;k++) {
      const jointIndex=skinIndices.getComponent(i,k);
      if (jointIndex===headJointIndex || jointIndex===jawJointIndex)
        ownership+=skinWeights.getComponent(i,k);
    }
    if (ownership>=0.35) {
      const point = new THREE.Vector3().fromBufferAttribute(position,i);
      if (point.y > neck.y - .06) headVertices.push(point);
    }
  }
  if (headVertices.length<300)
    throw new Error("C3.4 source head surface lacks calibrated skin ownership");
  let top = headVertices[0]!, minX=Infinity,maxX=-Infinity,
    minZ=Infinity,maxZ=-Infinity;
  for (const p of headVertices) {
    if (p.y>top.y) top=p;
    minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x);
    minZ=Math.min(minZ,p.z); maxZ=Math.max(maxZ,p.z);
  }
  const height=top.y-neck.y;
  const width=maxX-minX, depth=maxZ-minZ;
  if (![height,width,depth].every(n=>Number.isFinite(n)&&n>.08&&n<.60) ||
      !Number.isFinite(jaw.y) || chin.y>top.y || chin.y<neck.y-.12)
    throw new Error("C3.4 implausible source head calibration");
  const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2;
  const halfWidth=width/2;
  const eyeY=neck.y+height*.59;
  const eyeProbe=(side:HumanEyeSide):THREE.Vector3 => {
    const targetX=cx+(side==="left"?-1:1)*halfWidth*.34;
    let best:THREE.Vector3|undefined, score=-Infinity;
    for (const p of headVertices) {
      if ((p.x-cx)*(side==="left"?-1:1)<.001) continue;
      const value = p.z-2*Math.abs(p.y-eyeY)-1.2*Math.abs(p.x-targetX);
      if (value>score){best=p;score=value;}
    }
    if (!best) throw new Error("Missing CC0 orbital surface " + side);
    return best.clone();
  };
  const eyeLeft=eyeProbe("left"), eyeRight=eyeProbe("right");
  if (!(eyeLeft.x<eyeRight.x) || eyeLeft.distanceTo(eyeRight)<.025)
    throw new Error("C3.4 orbital anchors overlap");

  const point=(p:THREE.Vector3):THREE.Vector3 => {
    const x=p.x-cx, y=(p.y-neck.y)/height, z=p.z-cz;
    // The neck seam is stationary: all channels fade up from its measured
    // position, and no body/shoulder vertex can inherit facial displacement.
    const neckGate=smooth((y+.035)/.26);
    if (neckGate===0) return p;
    const front=smooth((z/depth+.30)/.85);
    const eyeBand=bell(y,.59,.18);
    const browBand=bell(y,.67,.12);
    const cheekBand=bell(y,.41,.20);
    const jawBand=bell(y,.23,.22);
    const foreheadBand=bell(y,.81,.24);
    const chinBand=bell(p.y,chin.y,height*.19);
    const eyeSide = bell(Math.abs(x),halfWidth*.34,halfWidth*.25);
    const inner = bell(x,0,halfWidth*.48);
    const dx = x*(shape.skullWidth-1)*neckGate +
      x*(shape.jawWidth-1)*jawBand*neckGate*front +
      x*(shape.cheeks-1)*cheekBand*.6*front*neckGate +
      Math.sign(x)*halfWidth*.34*(shape.eyeSpacing-1)*
        eyeBand*eyeSide*front*neckGate;
    const dy = (p.y-neck.y)*(shape.skullHeight-1)*neckGate +
      height*.30*(shape.chin-1)*chinBand*front*inner*neckGate;
    const dz = z*(shape.faceDepth-1)*front*neckGate +
      depth*.65*(shape.forehead-1)*foreheadBand*front*neckGate +
      depth*.58*(shape.brow-1)*browBand*front*eyeSide*neckGate +
      depth*.38*(shape.cheeks-1)*cheekBand*front*eyeSide*neckGate +
      depth*.55*(shape.chin-1)*chinBand*front*inner*neckGate;
    return p.add(new THREE.Vector3(dx,dy,dz));
  };
  return {
    headJointIndex,jawJointIndex,point,
    landmarks: {neck,jaw,chin,crown:top.clone(),eyeLeft,eyeRight},
  };
}

/** Construct read-only, bone-following human facial landmarks AFTER rest
 * rebinding, using exactly the same composed morph map as vertices/joints. */
export function calibrateHumanHeadLandmarks(
  human: AnatomicalHuman,
  head: HumanHeadTransform,
  map: (p:THREE.Vector3, jointIndex:number)=>THREE.Vector3,
): HumanHeadLandmarks {
  const root=human.spike.character.root;
  root.updateMatrixWorld(true);
  const headBone=human.spike.skeleton.bones[head.headJointIndex]!;
  const jawBone=human.spike.skeleton.bones[head.jawJointIndex]!;
  const neckIndex=human.spike.graph.joints.findIndex(j=>j.role==="neck");
  const shaped=(p:THREE.Vector3,index:number)=>
    map(head.point(p.clone()),index);
  const neck=shaped(head.landmarks.neck,neckIndex);
  const jaw=shaped(head.landmarks.jaw,head.jawJointIndex);
  const chin=shaped(head.landmarks.chin,head.jawJointIndex);
  const crown=shaped(head.landmarks.crown,head.headJointIndex);
  const eyeLeft=shaped(head.landmarks.eyeLeft,head.headJointIndex);
  const eyeRight=shaped(head.landmarks.eyeRight,head.headJointIndex);
  const localEye=new Map<HumanEyeSide,THREE.Vector3>();
  for(const [side,eye] of [["left",eyeLeft],["right",eyeRight]] as const) {
    const world=eye.clone().applyMatrix4(root.matrixWorld);
    localEye.set(side,headBone.worldToLocal(world));
  }
  const toArray=(v:THREE.Vector3):readonly [number,number,number] =>
    Object.freeze(v.toArray() as [number,number,number]);
  // Deliberately keep source-surface orbital anchors under head bone FK.
  // Jaw and chin remain separate source landmarks for the jaw opening oracle.
  void jawBone;
  return Object.freeze({
    version:1 as const,
    neckRest:toArray(neck),jawRest:toArray(jaw),chinRest:toArray(chin),
    crownRest:toArray(crown),
    orbitLeftRest:toArray(eyeLeft),orbitRightRest:toArray(eyeRight),
    eyeWorld(side:HumanEyeSide,target=new THREE.Vector3()):THREE.Vector3 {
      const local=localEye.get(side);
      if(!local)throw new Error("Unknown human orbit side");
      root.updateWorldMatrix(true,true);
      return target.copy(local).applyMatrix4(headBone.matrixWorld);
    },
  });
}
