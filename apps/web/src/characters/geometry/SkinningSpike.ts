import * as THREE from "three";
import { createAnatomyPreset, type AnatomicalGraphV1 } from "@trilok/character-core";
import { SemanticCharacter } from "../runtime/SemanticCharacter";

/**
 * C2 feasibility rig: actual GPU skinned mesh with normalized weights and
 * deterministic ring topology. Surface consists of separate closed diagnostic
 * limb segments, NOT a continuous anatomical human. Never use as final art.
 */
export interface SkinningSpike {
  readonly graph: AnatomicalGraphV1;
  readonly character: SemanticCharacter;
  readonly mesh: THREE.SkinnedMesh;
  readonly skeleton: THREE.Skeleton;
  readonly bones: ReadonlyMap<string, THREE.Bone>;
  readonly vertexCount: number;
  readonly triangleCount: number;
  dispose(): void;
}
export interface SpikeOptions {
  readonly heightScale?: number;
  readonly shoulderScale?: number;
}
function finiteScale(value:number|undefined,name:string):number {
  const n=value??1;
  if(!Number.isFinite(n)||n<.85||n>1.15)throw new Error("Invalid "+name);
  return n;
}
const referenceHeight=1.75;
export function createSkinningSpike(options:SpikeOptions={}):SkinningSpike {
  const height=finiteScale(options.heightScale,"heightScale");
  const shoulder=finiteScale(options.shoulderScale,"shoulderScale");
  const graph=createAnatomyPreset({archetype:"human"});
  const root=new THREE.Group();
  root.name="C2_DIAGNOSTIC_ONLY";
  const bones=new Map<string,THREE.Bone>();
  const boneList:THREE.Bone[]=[];
  for(const joint of graph.joints) {
    const bone=new THREE.Bone();
    bone.name=joint.id;
    bone.position.set(...joint.bindTranslation);
    if(joint.role.startsWith("clavicle_"))bone.position.x*=shoulder;
    if(joint.role==="pelvis")bone.position.y*=height;
    else bone.position.y*=height;
    bone.quaternion.set(...joint.bindQuaternion);
    (joint.parentId===null?root:bones.get(joint.parentId)!).add(bone);
    bones.set(joint.id,bone);
    boneList.push(bone);
  }
  root.updateMatrixWorld(true);
  const centers=new Map<string,THREE.Vector3>();
  for(const [id,bone] of bones)centers.set(id,bone.getWorldPosition(new THREE.Vector3()));
  const indices:number[]=[];
  const positions:number[]=[];
  const normals:number[]=[];
  const uvs:number[]=[];
  const skinIndices:number[]=[];
  const skinWeights:number[]=[];
  const segments=graph.segments;
  const jointIndex=new Map(graph.joints.map((j,i)=>[j.id,i]));
  const ringSides=12;
  const rings=7;
  function addDiagnosticSurface(from:THREE.Vector3,to:THREE.Vector3,
    startJoint:number,endJoint:number,radius:number):void {
    const axis=new THREE.Vector3().subVectors(to,from);
    const length=axis.length();
    if(length<.025)return;
    axis.normalize();
    const side=new THREE.Vector3(0,0,1);
    if(Math.abs(axis.dot(side))>.92)side.set(1,0,0);
    const tangent=new THREE.Vector3().crossVectors(axis,side).normalize();
    const bitangent=new THREE.Vector3().crossVectors(axis,tangent).normalize();
    const first=positions.length/3;
    for(let i=0;i<=rings;i++){
      const t=i/rings;
      const center=from.clone().lerp(to,t);
      // Cap end rings to create closed diagnostics. Not a skin-sever seam.
      const taper=(i===0||i===rings)?0.02:Math.sin(Math.PI*t)*.12+.88;
      for(let j=0;j<ringSides;j++){
        const theta=j*2*Math.PI/ringSides;
        const normal=tangent.clone().multiplyScalar(Math.cos(theta))
          .addScaledVector(bitangent,Math.sin(theta));
        const point=center.clone().addScaledVector(normal,radius*taper);
        positions.push(point.x,point.y,point.z);
        normals.push(normal.x,normal.y,normal.z);
        uvs.push(j/ringSides,t);
        const w=t*t*(3-2*t);
        skinIndices.push(startJoint,endJoint,0,0);
        skinWeights.push(1-w,w,0,0);
      }
    }
    for(let i=0;i<rings;i++)for(let j=0;j<ringSides;j++){
      const a=first+i*ringSides+j;
      const b=first+i*ringSides+(j+1)%ringSides;
      const c=a+ringSides,d=b+ringSides;
      indices.push(a,c,b,b,c,d);
    }
    const a=positions.length/3;
    positions.push(from.x,from.y,from.z,to.x,to.y,to.z);
    normals.push(-axis.x,-axis.y,-axis.z,axis.x,axis.y,axis.z);
    uvs.push(.5,0,.5,1);
    skinIndices.push(startJoint,0,0,0,endJoint,0,0,0);
    skinWeights.push(1,0,0,0,1,0,0,0);
    for(let j=0;j<ringSides;j++){
      const next=(j+1)%ringSides;
      indices.push(a,first+j,first+next);
      const top=first+rings*ringSides;
      indices.push(a+1,top+next,top+j);
    }
  }
  for(const seg of segments){
    if(!seg.parentId)continue;
    const parent=segments.find(s=>s.id===seg.parentId)!;
    const from=centers.get(parent.proximalJointId)!;
    const to=centers.get(seg.proximalJointId)!;
    const role=graph.joints.find(j=>j.id===seg.proximalJointId)!.role;
    const radius=role.includes("spine")||role==="chest"?.14:
      role.includes("hip")?.105:role.includes("knee")?.082:
      role.includes("shoulder")?.075:role.includes("elbow")?.058:
      role.includes("wrist")?.045:role.includes("neck")?.07:
      role.includes("head")?.095:role.includes("palm")?.038:.016;
    addDiagnosticSurface(from,to,jointIndex.get(parent.proximalJointId)!,
      jointIndex.get(seg.proximalJointId)!,radius*height);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(skinIndices,4));
  geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(skinWeights,4));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({color:0xb38b70,roughness:.86,metalness:0,
    side:THREE.DoubleSide});
  const mesh=new THREE.SkinnedMesh(geometry,material);
  mesh.name="C2_SKINNING_DIAGNOSTIC_NOT_CHARACTER_ART";
  mesh.frustumCulled=false;
  root.add(mesh);
  const skeleton=new THREE.Skeleton(boneList);
  mesh.bind(skeleton);
  const character=new SemanticCharacter(graph,root,bones,{
    ownedResources:[geometry,material,skeleton],detachRootOnDispose:true,
  });
  let disposed=false;
  return {graph,character,mesh,skeleton,bones,
    vertexCount:positions.length/3,triangleCount:indices.length/3,
    dispose(){if(disposed)return;disposed=true;character.dispose();}};
}
/** Checks exported GPU attributes, without claiming visual/anatomical correctness. */
export function validateSkinningSpike(spike:SkinningSpike):void {
  const g=spike.mesh.geometry;
  const p=g.getAttribute("position"),w=g.getAttribute("skinWeight"),ids=g.getAttribute("skinIndex");
  const uv=g.getAttribute("uv");
  if(!p||!w||!ids||!uv||p.count!==w.count||p.count!==ids.count||p.count!==uv.count)
    throw new Error("Missing or inconsistent skinned attributes");
  if(spike.skeleton.bones.length!==spike.graph.joints.length)
    throw new Error("Skeleton joint mismatch");
  for(let i=0;i<p.count;i++){
    let total=0;
    for(let j=0;j<4;j++){
      const weight=w.getComponent(i,j),index=ids.getComponent(i,j);
      if(!Number.isFinite(weight)||weight<0||!Number.isSafeInteger(index)||
        index<0||index>=spike.skeleton.bones.length)
        throw new Error("Invalid skin influence "+i);
      total+=weight;
    }
    if(Math.abs(total-1)>1e-5)throw new Error("Unnormalized skin influence "+i);
    for(let j=0;j<3;j++)if(!Number.isFinite(p.getComponent(i,j)))
      throw new Error("Nonfinite position "+i);
    for(let j=0;j<2;j++)if(!Number.isFinite(uv.getComponent(i,j)))
      throw new Error("Nonfinite UV "+i);
  }
  const idx=g.getIndex();
  if(!idx||idx.count%3)throw new Error("Missing triangles");
  for(let i=0;i<idx.count;i+=3){
    const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);
    if(a===b||b===c||a===c)throw new Error("Repeated triangle index");
  }
  for(const inverse of spike.skeleton.boneInverses){
    if(!inverse.elements.every(Number.isFinite))throw new Error("Nonfinite inverse bind matrix");
    if(Math.abs(inverse.determinant())<1e-10)throw new Error("Singular inverse bind matrix");
  }
}
