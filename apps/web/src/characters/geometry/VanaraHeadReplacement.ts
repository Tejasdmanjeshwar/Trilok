import * as THREE from "three";
import type { MammalianHeadMorphologyV1 } from "@trilok/character-core";
import type { AnatomicalHuman } from "./AnatomicalTemplate";
import type { HumanHeadTransform } from "./HumanHeadDeformation";
import type { MammalianHeadLandmarks } from "./MammalianHeadDeformation";
import { measureHumanHeadReference, sizeVanaraCranium } from "./VanaraHeadSizing";
import { buildVanaraSurface, type VanaraNeckSample } from "./VanaraHeadSurface";

/**
 * Vanara-only C3 head swap. Unlike the legacy human-face C3.5 morph, this
 * replaces the head faces, preserving the original C2 body triangles and rig.
 * All mutation is after geometry and triangle-budget preflight.
 */
export interface VanaraReplacement {
  readonly mesh: THREE.SkinnedMesh;
  readonly landmarks: MammalianHeadLandmarks;
  readonly removedHumanTriangles: number;
  readonly newHeadTriangles: number;
  readonly humanWidthMeters: number;
  readonly headWidthMeters: number;
  readonly seamVertices: number;
}
const installed=new WeakMap<AnatomicalHuman,VanaraReplacement>();
export const getVanaraReplacement=(human:AnatomicalHuman):VanaraReplacement|undefined=>
  installed.get(human);
export function replaceVanaraHead(
  human:AnatomicalHuman,head:HumanHeadTransform,
  shape:MammalianHeadMorphologyV1):VanaraReplacement {
  if(installed.has(human))throw new Error("Vanara head already replaced");
  if(human.spike.graph.headTopologyFamilyId!=="head_primate_v1")
    throw new Error("Vanara replacement requires primate C1 family");
  const {mesh,spike,template}=human;
  const geometry=mesh.geometry,index=geometry.getIndex();
  const position=geometry.getAttribute("position");
  const normal=geometry.getAttribute("normal");
  const colors=geometry.getAttribute("color");
  const boneIds=geometry.getAttribute("skinIndex");
  const boneWeights=geometry.getAttribute("skinWeight");
  if(!index||!position||!normal||!boneIds||!boneWeights)
    throw new Error("C3.5 source geometry incomplete");
  const root=spike.character.root;
  root.updateWorldMatrix(true,true);
  const invRoot=root.matrixWorld.clone().invert();
  const neckIndex=spike.graph.joints.findIndex(j=>j.role==="neck");
  if(neckIndex<0)throw new Error("C3.5 C1 neck missing");
  const neck=spike.skeleton.bones[neckIndex]!
    .getWorldPosition(new THREE.Vector3()).applyMatrix4(invRoot);
  const cutY=neck.y+.025*shape.stature;
  const kept:number[]=[];
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
    if(Math.max(position.getY(a),position.getY(b),position.getY(c))<=cutY)
      kept.push(a,b,c);
  }
  if(kept.length<index.count*.60||kept.length>index.count*.99)
    throw new Error("C3.5 unexpected C2 neck cut");
  const humanTriangles=(index.count-kept.length)/3;
  const edges=new Map<string,{a:number,b:number,count:number}>();
  for(let i=0;i<kept.length;i+=3){
    const face=[kept[i]!,kept[i+1]!,kept[i+2]!];
    for(let j=0;j<3;j++){
      const a=face[j]!,b=face[(j+1)%3]!;
      const sa=template.sourceVertexIds[a]!,sb=template.sourceVertexIds[b]!;
      if(sa===sb)continue;
      const key=Math.min(sa,sb)+"|"+Math.max(sa,sb);
      const prev=edges.get(key);
      if(prev)prev.count++;else edges.set(key,{a,b,count:1});
    }
  }
  const contour=new Map<number,number>();
  for(const edge of edges.values()){
    if(edge.count!==1)continue;
    for(const id of [edge.a,edge.b]){
      const source=template.sourceVertexIds[id]!;
      if(position.getY(id)>cutY-.075 &&
        Math.abs(position.getX(id)-neck.x)<.16 &&
        Math.abs(position.getZ(id)-neck.z)<.20)
        contour.set(source,id);
    }
  }
  const ordered=[...contour.values()].sort((a,b)=>{
    const angle=(id:number)=>{
      const t=Math.atan2(position.getZ(id)-neck.z,position.getX(id)-neck.x);
      return t<0?t+Math.PI*2:t;
    };
    return angle(a)-angle(b);
  });
  if(ordered.length<24||ordered.length>160)
    throw new Error("C3.5 invalid C2 neck opening");
  const seam:VanaraNeckSample[]=ordered.map(i=>({
    point:new THREE.Vector3().fromBufferAttribute(position,i),
    normal:new THREE.Vector3().fromBufferAttribute(normal,i),
    color:colors?new THREE.Color(colors.getX(i),colors.getY(i),colors.getZ(i)):
      new THREE.Color(0xb38b70),
    ids:[0,1,2,3].map(k=>boneIds.getComponent(i,k)),
    weights:[0,1,2,3].map(k=>boneWeights.getComponent(i,k)),
  }));
  const humanRef=measureHumanHeadReference(human);
  const sized=sizeVanaraCranium(humanRef,shape.stature,shape.breadth,
    shape.skullWidth,shape.faceDepth);
  const crown=Math.min(head.landmarks.crown.y*shape.stature,
    sized.crownHeight)+.002*shape.stature;
  // Build original topology in isolation, before replacing the C2 index.
  const result=buildVanaraSurface({
    seam,centerX:neck.x,neckY:cutY,
    centerZ:sized.centerZ,crownY:crown,
    halfWidth:sized.halfWidth,halfDepth:sized.halfDepth,
    headBone:head.headJointIndex,jawBone:head.jawJointIndex,
    shape,maxTriangles:Math.floor(humanTriangles*1.30),
  });
  const newGeometry=result.geometry;
  const material=new THREE.MeshStandardMaterial({
    color:0xffffff,vertexColors:true,roughness:.88,side:THREE.DoubleSide,
  });
  const newMesh=new THREE.SkinnedMesh(newGeometry,material);
  newMesh.frustumCulled=false;
  newMesh.name="C3_VANARA_ORIGINAL_FACIAL_TOPOLOGY";
  // C2 indexed geometry keeps original source IDs/UV/weights and only loses
  // head faces. The retained seam is an exact spatial/weighted match.
  geometry.setIndex(kept);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  root.add(newMesh);
  newMesh.bind(spike.skeleton,mesh.bindMatrix);
  const skull=spike.skeleton.bones[head.headJointIndex]!;
  const jaw=spike.skeleton.bones[head.jawJointIndex]!;
  root.updateWorldMatrix(true,true);
  const toBone=(point:THREE.Vector3,bone:THREE.Bone)=>
    bone.worldToLocal(point.clone().applyMatrix4(root.matrixWorld));
  const original=result.landmarks;
  const rest={
    muzzle:original.muzzle,nose:original.nose,
    nostrilLeft:original.nostrilLeft,nostrilRight:original.nostrilRight,
    mouth:original.mouth,earLeft:original.earLeft,earRight:original.earRight,
  };
  const locals={
    muzzle:toBone(rest.muzzle,skull),nose:toBone(rest.nose,skull),
    nostrilLeft:toBone(rest.nostrilLeft,skull),
    nostrilRight:toBone(rest.nostrilRight,skull),
    mouth:toBone(rest.mouth,jaw),
    earLeft:toBone(rest.earLeft,skull),
    earRight:toBone(rest.earRight,skull),
  };
  const current=(point:THREE.Vector3,bone:THREE.Bone,target:THREE.Vector3)=>
  {root.updateMatrixWorld(true);
    return target.copy(point).applyMatrix4(bone.matrixWorld);};
  const tuple=(p:THREE.Vector3):readonly [number,number,number]=>
    Object.freeze(p.toArray() as [number,number,number]);
  const landmarks:MammalianHeadLandmarks=Object.freeze({
    family:"primate" as const,
    muzzleRest:tuple(rest.muzzle),noseRest:tuple(rest.nose),
    nostrilLeftRest:tuple(rest.nostrilLeft),
    nostrilRightRest:tuple(rest.nostrilRight),
    mouthRest:tuple(rest.mouth),earLeftRest:tuple(rest.earLeft),
    earRightRest:tuple(rest.earRight),
    muzzleWorld:(out=new THREE.Vector3())=>current(locals.muzzle,skull,out),
    noseWorld:(out=new THREE.Vector3())=>current(locals.nose,skull,out),
    nostrilWorld:(side:"left"|"right",out=new THREE.Vector3())=>current(
      side==="left"?locals.nostrilLeft:locals.nostrilRight,skull,out),
    mouthWorld:(out=new THREE.Vector3())=>current(locals.mouth,jaw,out),
    earWorld:(side:"left"|"right",out=new THREE.Vector3())=>current(
      side==="left"?locals.earLeft:locals.earRight,skull,out),
  });
  const replacement:VanaraReplacement=Object.freeze({
    mesh:newMesh,landmarks,removedHumanTriangles:humanTriangles,
    newHeadTriangles:result.faceTriangles,
    humanWidthMeters:humanRef.halfWidth*2,
    headWidthMeters:sized.halfWidth*2,seamVertices:seam.length,
  });
  installed.set(human,replacement);
  const originalDispose=human.dispose.bind(human);
  let disposed=false;
  human.dispose=()=>{
    if(!disposed){
      disposed=true;installed.delete(human);
      newMesh.removeFromParent();newGeometry.dispose();material.dispose();
    }
    originalDispose();
  };
  return replacement;
}
