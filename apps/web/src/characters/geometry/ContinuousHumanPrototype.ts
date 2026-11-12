import * as THREE from "three";
import { createSkinningSpike, validateSkinningSpike, type SkinningSpike } from "./SkinningSpike";

/**
 * C2 research topology: smooth-union implicit field sampled into ONE indexed
 * skinned surface. This is a deterministic procedural topology feasibility test,
 * not certified human anatomy, nor a cut-ready game asset.
 */
export interface ContinuousHumanPrototype {
  readonly spike: SkinningSpike;
  readonly mesh: THREE.SkinnedMesh;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly generation: "c2-implicit-v1";
  dispose(): void;
}
export interface ContinuousOptions {
  readonly step?: number;
  readonly heightScale?: number;
  readonly shoulderScale?: number;
}
interface FieldSegment {
  from:THREE.Vector3;
  to:THREE.Vector3;
  radius:number;
  jointA:number;
  jointB:number;
}
const rad=(role:string):number=>
  role==="chest" ? .19 :
  role==="spine_lower" ? .17 :
  role==="neck" ? .080 :
  role==="head" ? .14 :
  role.startsWith("clavicle") ? .087 :
  role.startsWith("shoulder") ? .10 :
  role.startsWith("elbow") ? .073 :
  role.startsWith("wrist") ? .058 :
  role.startsWith("palm") ? .062 :
  role.startsWith("hip_") ? .12 :
  role.startsWith("knee_") ? .095 :
  role.startsWith("ankle_") ? .068 :
  role.startsWith("foot_") ? .078 :
  role.startsWith("toe_") ? .055 :
  role.startsWith("finger") ? .021 :.043;

function segmentsOf(spike:SkinningSpike):FieldSegment[] {
  const world=new Map<string,THREE.Vector3>();
  for(const [id,bone] of spike.bones)world.set(id,bone.getWorldPosition(new THREE.Vector3()));
  const jointIndex=new Map(spike.graph.joints.map((j,i)=>[j.id,i]));
  return spike.graph.segments.flatMap(seg=>{
    if(!seg.parentId)return [];
    const parent=spike.graph.segments.find(s=>s.id===seg.parentId)!;
    const from=world.get(parent.proximalJointId)!,to=world.get(seg.proximalJointId)!;
    if(from.distanceToSquared(to)<.0001)return [];
    const role=spike.graph.joints.find(j=>j.id===seg.proximalJointId)!.role;
    return [{from,to,radius:rad(role),jointA:jointIndex.get(parent.proximalJointId)!,
      jointB:jointIndex.get(seg.proximalJointId)!}];
  });
}
function capsule(x:number,y:number,z:number,s:FieldSegment):number {
  const ax=s.from.x,ay=s.from.y,az=s.from.z;
  const dx=s.to.x-ax,dy=s.to.y-ay,dz=s.to.z-az;
  const lenSq=dx*dx+dy*dy+dz*dz;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy+(z-az)*dz)/lenSq));
  return Math.hypot(x-ax-t*dx,y-ay-t*dy,z-az-t*dz)-s.radius;
}
/** Smooth union; this is a surface prototype, not anatomical muscle simulation. */
function field(x:number,y:number,z:number,segs:readonly FieldSegment[]):number {
  let d=1e6;
  for(const s of segs){
    const b=capsule(x,y,z,s);
    const k=.045;
    const h=Math.max(k-Math.abs(d-b),0)/k;
    d=Math.min(d,b)-h*h*k*.25;
  }
  return d;
}
const corners:readonly (readonly [number,number,number])[]=[
  [0,0,0],[1,0,0],[1,1,0],[0,1,0],
  [0,0,1],[1,0,1],[1,1,1],[0,1,1],
];
const tetra:readonly (readonly [number,number,number,number])[]=[
  [0,5,1,6],[0,1,2,6],[0,2,3,6],
  [0,3,7,6],[0,7,4,6],[0,4,5,6],
];
/** Uses quantized grid edge identities, avoiding duplicate vertices on cells. */
export function generateContinuousHumanGeometry(
  segs:readonly FieldSegment[],step=.045,
):THREE.BufferGeometry {
  if(!Number.isFinite(step)||step<.032||step>.09||!segs.length)
    throw new Error("Invalid C2 prototype resolution");
  const min=new THREE.Vector3(Infinity,Infinity,Infinity);
  const max=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
  for(const s of segs)for(const p of [s.from,s.to]){
    min.min(p);max.max(p);
  }
  min.addScalar(-.27);max.addScalar(.27);
  const nx=Math.ceil((max.x-min.x)/step),ny=Math.ceil((max.y-min.y)/step),
    nz=Math.ceil((max.z-min.z)/step);
  if(nx*ny*nz>420000)throw new Error("Prototype grid exceeds browser memory budget");
  const gx=nx+1,gy=ny+1,gz=nz+1;
  const samples=new Float32Array(gx*gy*gz);
  const locate=(x:number,y:number,z:number)=>x+gx*(y+gy*z);
  for(let k=0;k<gz;k++)for(let j=0;j<gy;j++)for(let i=0;i<gx;i++)
    samples[locate(i,j,k)]=field(min.x+i*step,min.y+j*step,min.z+k*step,segs);
  const points:number[]=[],normals:number[]=[],uvs:number[]=[],
    skinIndices:number[]=[],skinWeights:number[]=[],indices:number[]=[];
  const edges=new Map<string,number>();
  const gridId=(i:number,j:number,k:number)=>locate(i,j,k);
  function vertex(a:readonly [number,number,number],b:readonly [number,number,number],
    va:number,vb:number):number {
    const ia=gridId(...a),ib=gridId(...b);
    const key=ia<ib?ia+"|"+ib:ib+"|"+ia;
    const existing=edges.get(key);
    if(existing!==undefined)return existing;
    const t=Math.max(0,Math.min(1,va/(va-vb)));
    const x=min.x+(a[0]+(b[0]-a[0])*t)*step;
    const y=min.y+(a[1]+(b[1]-a[1])*t)*step;
    const z=min.z+(a[2]+(b[2]-a[2])*t)*step;
    const h=step*.4;
    const normal=new THREE.Vector3(
      field(x+h,y,z,segs)-field(x-h,y,z,segs),
      field(x,y+h,z,segs)-field(x,y-h,z,segs),
      field(x,y,z+h,segs)-field(x,y,z-h,segs)).normalize();
    const p=new THREE.Vector3(x,y,z);
    const closest=segs.map(s=>{
      const delta=s.to.clone().sub(s.from);
      const u=Math.max(0,Math.min(1,p.clone().sub(s.from).dot(delta)/delta.lengthSq()));
      const closestPoint=s.from.clone().addScaledVector(delta,u);
      return {s,u,dist:p.distanceToSquared(closestPoint)};
    }).sort((a,b)=>a.dist-b.dist)[0]!;
    const w=closest.u*closest.u*(3-2*closest.u);
    points.push(x,y,z);
    normals.push(normal.x,normal.y,normal.z);
    uvs.push((Math.atan2(z,x)+Math.PI)/(2*Math.PI),Math.max(0,Math.min(1,y/1.75)));
    skinIndices.push(closest.s.jointA,closest.s.jointB,0,0);
    skinWeights.push(1-w,w,0,0);
    const id=points.length/3-1;edges.set(key,id);
    return id;
  }
  function triangle(a:number,b:number,c:number):void {
    if(a===b||b===c||a===c)return;
    const a3=a*3,b3=b*3,c3=c*3;
    const ab=new THREE.Vector3(points[b3]!-points[a3]!,points[b3+1]!-points[a3+1]!,
      points[b3+2]!-points[a3+2]!);
    const ac=new THREE.Vector3(points[c3]!-points[a3]!,points[c3+1]!-points[a3+1]!,
      points[c3+2]!-points[a3+2]!);
    const outward=new THREE.Vector3(normals[a3]!,normals[a3+1]!,normals[a3+2]!);
    if(ab.cross(ac).dot(outward)<0)indices.push(a,c,b);
    else indices.push(a,b,c);
  }
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const coord=corners.map(([u,v,w])=>[i+u,j+v,k+w] as const);
    const values=coord.map(([u,v,w])=>samples[locate(u,v,w)]!);
    if(values.every(v=>v>=0)||values.every(v=>v<0))continue;
    for(const ids of tetra){
      const inside=ids.filter(id=>values[id]!<0),outside=ids.filter(id=>values[id]!>=0);
      if(inside.length===0||inside.length===4)continue;
      const cross=(a:number,b:number)=>vertex(coord[a]!,coord[b]!,values[a]!,values[b]!);
      if(inside.length===1){
        const a=inside[0]!;
        triangle(cross(a,outside[0]!),cross(a,outside[1]!),cross(a,outside[2]!));
      } else if(inside.length===3){
        const a=outside[0]!;
        triangle(cross(a,inside[0]!),cross(a,inside[2]!),cross(a,inside[1]!));
      } else {
        const a=inside[0]!,b=inside[1]!,c=outside[0]!,d=outside[1]!;
        const ac=cross(a,c),ad=cross(a,d),bc=cross(b,c),bd=cross(b,d);
        triangle(ac,ad,bc);
        triangle(ad,bd,bc);
      }
    }
  }
  if(!indices.length)throw new Error("Empty implicit character surface");
  const geo=new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute("position",new THREE.Float32BufferAttribute(points,3));
  geo.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geo.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(skinIndices,4));
  geo.setAttribute("skinWeight",new THREE.Float32BufferAttribute(skinWeights,4));
  geo.computeBoundingBox();geo.computeBoundingSphere();
  return geo;
}
export function createContinuousHumanPrototype(options:ContinuousOptions={}):ContinuousHumanPrototype {
  const spike=createSkinningSpike(options);
  let geometry:THREE.BufferGeometry;
  try{
    geometry=generateContinuousHumanGeometry(segmentsOf(spike),options.step);
  }catch(error){spike.dispose();throw error;}
  spike.mesh.geometry=geometry;
  try{validateSkinningSpike(spike);}
  catch(error){geometry.dispose();spike.dispose();throw error;}
  let disposed=false;
  return {spike,mesh:spike.mesh,generation:"c2-implicit-v1",
    vertexCount:geometry.getAttribute("position").count,
    triangleCount:geometry.getIndex()!.count/3,
    dispose(){if(disposed)return;disposed=true;geometry.dispose();spike.dispose();}};
}
