import * as THREE from "three";

export interface SkinnedHumanValidation {
  readonly vertices:number;
  readonly triangles:number;
  readonly joints:number;
  readonly maxWeightError:number;
  readonly degenerateTriangles:number;
  readonly invalidVertices:number;
}
/** Structural skin/geometry gate. Visual quality requires captured pose review. */
export function validateSkinnedHuman(mesh:THREE.SkinnedMesh):SkinnedHumanValidation {
  const g=mesh.geometry,pos=g.getAttribute("position"),uv=g.getAttribute("uv"),
    normal=g.getAttribute("normal"),weights=g.getAttribute("skinWeight"),
    joints=g.getAttribute("skinIndex"),indices=g.getIndex();
  if(!pos || !uv || !normal || !weights || !joints || !indices ||
    weights.itemSize!==4 || joints.itemSize!==4 ||
    pos.count!==uv.count || pos.count!==normal.count ||
    pos.count!==weights.count || pos.count!==joints.count ||
    indices.count%3!==0)throw new Error("Invalid skinned geometry attributes");
  if(mesh.skeleton.bones.length<1 || mesh.skeleton.bones.length>256)
    throw new Error("Unsupported bone palette");
  let error=0,invalid=0,degenerate=0;
  for(let i=0;i<pos.count;i++) {
    for(let d=0;d<3;d++)if(!Number.isFinite(pos.getComponent(i,d)) ||
      !Number.isFinite(normal.getComponent(i,d)))invalid++;
    for(let d=0;d<2;d++)if(!Number.isFinite(uv.getComponent(i,d)))invalid++;
    let sum=0;
    for(let d=0;d<4;d++){
      const w=weights.getComponent(i,d),j=joints.getComponent(i,d);
      if(!Number.isFinite(w)||w<0||w>1||
        !Number.isSafeInteger(j)||j<0||j>=mesh.skeleton.bones.length)invalid++;
      sum+=w;
    }
    error=Math.max(error,Math.abs(sum-1));
  }
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
  for(let i=0;i<indices.count;i+=3) {
    a.fromBufferAttribute(pos,indices.getX(i));
    b.fromBufferAttribute(pos,indices.getX(i+1));
    c.fromBufferAttribute(pos,indices.getX(i+2));
    n.subVectors(b,a).cross(c.sub(a));
    if(n.lengthSq()<1e-16)degenerate++;
  }
  if(error>1e-5 || invalid!==0 || degenerate!==0)
    throw new Error("Invalid skin geometry: weightError="+error+
      " invalid="+invalid+" degenerate="+degenerate);
  for(const inverse of mesh.skeleton.boneInverses)
    if(!inverse.elements.every(Number.isFinite) || Math.abs(inverse.determinant())<1e-8)
      throw new Error("Invalid inverse bind matrix");
  return {vertices:pos.count,triangles:indices.count/3,
    joints:mesh.skeleton.bones.length,maxWeightError:error,
    degenerateTriangles:degenerate,invalidVertices:invalid};
}
