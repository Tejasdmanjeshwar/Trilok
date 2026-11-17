import * as THREE from "three";
import type {StudioHumanModel} from "./StudioHumanModel";
import {countStudioSolverWork} from "./StudioSolverDiagnostics";

/**
 * A small, disposable-by-GC torso volume built from the actual morphed
 * MakeHuman skin, never the chest/pelvis joint positions or generator knobs.
 *
 * Cross sections are deliberately conservative envelopes of source-skinned
 * torso vertices. Each section follows its source torso bone, so legal spine
 * flexion/rotation is included in IK evaluations. The volume is calibrated
 * once per solve (and therefore regenerated after each body/pose rebuild).
 * No per-iteration full-mesh query or BVH dependency. Immutable source-index
 * classifications are weakly held per human; posed envelopes are never cached.
 */
export interface BodyClearance {
  readonly minimumMeters:number;
  readonly maximumPenetrationMeters:number;
  readonly penalties:readonly number[];
}
export type BodyCollisionWeapon="longsword"|"staff";
export interface BodyCollisionDimensions {
  readonly scale:number;
  readonly handleLength:number;
  readonly bladeLength:number;
  readonly shaftLength:number;
  readonly guardWidth:number;
  readonly radius:number;
}
type Section={
  readonly y:number;readonly halfHeight:number;
  readonly cx:number;readonly cz:number;
  readonly rx:number;readonly rz:number;
  readonly carrier:0|1;
};
type Probe={readonly point:THREE.Vector3;readonly radius:number};

const boneByRole=(model:StudioHumanModel,role:string):THREE.Bone=>{
  const joint=model.human.spike.graph.joints.find(j=>j.role===role);
  const bone=joint&&model.human.spike.bones.get(joint.id);
  if(!bone)throw new Error("Missing anatomical collision bone: "+role);
  return bone;
};
const boneWorld=(bone:THREE.Bone)=>bone.getWorldPosition(new THREE.Vector3());

/** Only bind-source ownership/topology may be reused between poses. Root,
 * FK and morphed skin cross-sections are always recalibrated per solve.
 * Attribute versions (including in-place needsUpdate), graph, skeleton and
 * source-id replacements invalidate the single entry held for this human. */
type SkinAttribute=THREE.BufferAttribute|THREE.InterleavedBufferAttribute;
type TorsoTopology=Readonly<{
  geometry:THREE.BufferGeometry;
  position:SkinAttribute;indices:SkinAttribute;weights:SkinAttribute;
  trianglesIndex:THREE.BufferAttribute;
  positionVersion:number;indicesVersion:number;weightsVersion:number;
  trianglesVersion:number;
  graph:unknown;skeleton:unknown;sourceIds:unknown;
  vertices:readonly number[];
  triangles:readonly (readonly [number,number,number])[];
}>;
const torsoTopologies=new WeakMap<StudioHumanModel,TorsoTopology>();
const revision=(attribute:SkinAttribute):number=>
  attribute instanceof THREE.InterleavedBufferAttribute?
    attribute.data.version:attribute.version;

function torsoTopology(model:StudioHumanModel):TorsoTopology{
  const {mesh,spike,template}=model.human;
  const geometry=mesh.geometry;
  const position=geometry.getAttribute("position");
  const indices=geometry.getAttribute("skinIndex");
  const weights=geometry.getAttribute("skinWeight");
  const trianglesIndex=geometry.getIndex();
  if(!position||!indices||!weights||!trianglesIndex||
      indices.count!==position.count||weights.count!==position.count)
    throw new Error("Missing morphed torso skin attributes");
  const existing=torsoTopologies.get(model);
  if(existing&&existing.geometry===geometry&&
      existing.position===position&&existing.indices===indices&&
      existing.weights===weights&&existing.trianglesIndex===trianglesIndex&&
      existing.positionVersion===revision(position)&&
      existing.indicesVersion===revision(indices)&&
      existing.weightsVersion===revision(weights)&&
      existing.trianglesVersion===revision(trianglesIndex)&&
      existing.graph===spike.graph&&existing.skeleton===spike.skeleton&&
      existing.sourceIds===template.sourceVertexIds)
    return existing;
  const torsoIds=new Set<number>();
  for(const joint of spike.graph.joints){
    if(["pelvis","spine_lower","chest"].includes(joint.role)){
      const index=spike.skeleton.bones.indexOf(spike.bones.get(joint.id)!);
      if(index>=0)torsoIds.add(index);
    }
  }
  if(torsoIds.size!==3)throw new Error("Incomplete calibrated torso skin");
  const ownership=new Float32Array(position.count);
  const vertices:number[]=[];
  const used=new Set<number>();
  for(let i=0;i<position.count;i++){
    let influence=0;
    for(let k=0;k<4;k++)
      if(torsoIds.has(indices.getComponent(i,k)))
        influence+=weights.getComponent(i,k);
    ownership[i]=influence;
    const sourceId=template.sourceVertexIds[i]!;
    if(used.has(sourceId))continue;
    used.add(sourceId);
    if(influence>=.45)vertices.push(i);
  }
  const triangles:(readonly [number,number,number])[]=[];
  for(let i=0;i<trianglesIndex.count;i+=3){
    const a=trianglesIndex.getX(i),b=trianglesIndex.getX(i+1),
      c=trianglesIndex.getX(i+2);
    const owned=Number(ownership[a]!>=.3)+Number(ownership[b]!>=.3)+
      Number(ownership[c]!>=.3);
    if(owned>=2)triangles.push(Object.freeze([a,b,c] as const));
  }
  if(triangles.length<250)
    throw new Error("Insufficient actual torso-surface triangle coverage");
  const next:TorsoTopology={
    geometry,position,indices,weights,trianglesIndex,
    positionVersion:revision(position),indicesVersion:revision(indices),
    weightsVersion:revision(weights),
    trianglesVersion:revision(trianglesIndex),
    graph:spike.graph,skeleton:spike.skeleton,
    sourceIds:template.sourceVertexIds,
    vertices:Object.freeze(vertices),triangles:Object.freeze(triangles),
  };
  torsoTopologies.set(model,next);
  return next;
}

/** This helper also makes the calibrated occupied surface independently
 * inspectable by regression tests, including the belly bulge of real recipes. */
export class StudioBodyCollision {
  private readonly sections:readonly Section[];
  /** Indexed source-skin surface triangle topology, cached per generated body. */
  private readonly torsoTriangles:readonly (readonly [number,number,number])[];
  readonly sourceTriangleCount:number;
  private readonly carriers:readonly THREE.Bone[];
  private readonly bindMatrices:readonly THREE.Matrix4[];
  private readonly bindRootInverse:THREE.Matrix4;
  readonly sourceVertices:number;

  constructor(model:StudioHumanModel){
    countStudioSolverWork("torsoBuilds");
    const {mesh,spike,template}=model.human;
    spike.character.root.updateWorldMatrix(true,true);
    mesh.updateWorldMatrix(true,false);
    const root=spike.character.root;
    this.bindRootInverse=root.matrixWorld.clone().invert();
    const lower=boneByRole(model,"spine_lower");
    const chest=boneByRole(model,"chest");
    this.carriers=[lower,chest];
    this.bindMatrices=this.carriers.map(b=>b.matrixWorld.clone());
    const pelvisY=root.worldToLocal(boneWorld(boneByRole(model,"pelvis"))).y;
    const lowerY=root.worldToLocal(boneWorld(lower)).y;
    const chestY=root.worldToLocal(boneWorld(chest)).y;
    const height=Math.max(.12,chestY-pelvisY);
    const lo=pelvisY-height*.12,hi=chestY+height*.20;
    const layers=16,step=(hi-lo)/(layers-1);
    const halfHeight=step*1.1;
    const bins=Array.from({length:layers},(_,i)=>({
      y:lo+i*step,minX:Infinity,maxX:-Infinity,
      minZ:Infinity,maxZ:-Infinity,count:0,
    }));
    const topology=torsoTopology(model);
    const point=new THREE.Vector3();
    let accepted=0;
    // Skin the real source on every solve, including after root/pose changes.
    // Only its immutable list of torso-owned bind vertices is reused.
    for(const i of topology.vertices){
      mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld)
        .applyMatrix4(this.bindRootInverse);
      if(!point.toArray().every(Number.isFinite))throw new Error("Nonfinite torso skin");
      accepted++;
      countStudioSolverWork("torsoSourceVertices");
      for(const bin of bins){
        if(Math.abs(point.y-bin.y)>halfHeight)continue;
        bin.minX=Math.min(bin.minX,point.x);
        bin.maxX=Math.max(bin.maxX,point.x);
        bin.minZ=Math.min(bin.minZ,point.z);
        bin.maxZ=Math.max(bin.maxZ,point.z);
        bin.count++;
      }
    }
    if(accepted<150)throw new Error("Insufficient source torso skin coverage");
    const scale=Math.max(.35,Math.min(1.4,height/.44));
    const sections:Section[]=[];
    for(const bin of bins){
      if(bin.count<8)continue;
      const rx=(bin.maxX-bin.minX)/2;
      const rz=(bin.maxZ-bin.minZ)/2;
      if(rx<.015*scale||rz<.015*scale)continue;
      sections.push(Object.freeze({
        y:bin.y,halfHeight,
        cx:(bin.maxX+bin.minX)/2,
        cz:(bin.maxZ+bin.minZ)/2,
        rx:rx+.004*scale,rz:rz+.004*scale,
        carrier:bin.y<(lowerY+chestY)*.5?0:1,
      }));
    }
    if(sections.length<10)throw new Error("Incomplete anatomical torso envelope");
    this.sections=Object.freeze(sections);
    this.sourceVertices=accepted;
    this.torsoTriangles=topology.triangles;
    this.sourceTriangleCount=topology.triangles.length;
    countStudioSolverWork("torsoTriangles",topology.triangles.length);
  }

  /**
   * Signed clearance to the union of morphed torso slices; negative is inside.
   * One bone-relative inverse transform per section carrier, then only a few
   * scalar operations per probe. This never changes skin or FK state.
   */
  private transforms():readonly THREE.Matrix4[]{
    return this.carriers.map((bone,i)=>
      this.bindRootInverse.clone().multiply(this.bindMatrices[i]!)
        .multiply(bone.matrixWorld.clone().invert()));
  }
  clearance(point:THREE.Vector3):number{
    countStudioSolverWork("collisionClearanceChecks");
    const matrices=this.transforms();
    return this.distance(point,matrices);
  }
  private distance(point:THREE.Vector3,transforms:readonly THREE.Matrix4[]):number{
    const local=[
      point.clone().applyMatrix4(transforms[0]!),
      point.clone().applyMatrix4(transforms[1]!),
    ];
    let closest=Infinity;
    for(const s of this.sections){
      const p=local[s.carrier]!;
      const dx=(p.x-s.cx)/s.rx,dz=(p.z-s.cz)/s.rz;
      // The ellipse encloses the actual convex torso cross-section at each
      // height, including forward abdominal growth in the generated skin.
      const radial=(Math.hypot(dx,dz)-1)*Math.min(s.rx,s.rz);
      const vertical=Math.abs(p.y-s.y)-s.halfHeight;
      const signed=Math.max(radial,vertical);
      closest=Math.min(closest,signed);
    }
    return closest;
  }
  /** Sample every solid weapon primitive, hand and forearm capsule.
   * All probes are fixed-count: deterministic least-squares residuals.
   * The first half of a sword blade is included near the torso.
   */
  private collectProbes(model:StudioHumanModel,weapon:THREE.Matrix4,
    kind:BodyCollisionWeapon,dim:BodyCollisionDimensions):readonly Probe[]{
    const probes:Probe[]=[];
    const put=(point:THREE.Vector3,radius:number)=>
      probes.push({point,radius});
    const weaponPoint=(x:number,y:number,z=0)=>
      new THREE.Vector3(x,y,z).applyMatrix4(weapon);
    const line=(a:THREE.Vector3,b:THREE.Vector3,radius:number,count:number)=>{
      for(let i=0;i<=count;i++)
        put(a.clone().lerp(b,i/count),radius);
    };
    const r=dim.radius;
    if(kind==="longsword"){
      const half=dim.handleLength*.5;
      line(weaponPoint(0,-half),weaponPoint(0,half),r,10);
      put(weaponPoint(0,-half-r*.8),r*1.75);
      const guardY=half+r*.55;
      line(weaponPoint(-dim.guardWidth*.5,guardY),
        weaponPoint(dim.guardWidth*.5,guardY),r*1.4,10);
      const base=guardY+r*1.1;
      line(weaponPoint(0,base),weaponPoint(0,base+
        Math.min(dim.bladeLength,.24*dim.scale)),r*1.75,8);
    }else{
      line(weaponPoint(0,-dim.shaftLength*.5),
        weaponPoint(0,dim.shaftLength*.5),r*1.2,24);
    }
    for(const hand of ["left","right"] as const){
      const get=(role:string)=>boneWorld(boneByRole(model,role+"_"+hand));
      const elbow=get("elbow"),wrist=get("wrist"),palm=get("palm");
      line(elbow,wrist,.027*dim.scale,8);
      put(palm,.025*dim.scale);
      // Source index/little knuckle span approximates the outer grasp volume,
      // while the solver's separate finger-skin fit owns hilt contact.
      const finger=(role:string)=>{
        const joint=model.human.spike.graph.joints.find(j=>
          j.role===role&&j.id.includes("arm["+hand+",0]"));
        const bone=joint&&model.human.spike.bones.get(joint.id);
        if(!bone)throw new Error("Missing source finger collision landmark");
        return boneWorld(bone);
      };
      const first=finger("finger_index_0");
      const last=finger("finger_little_0");
      if(first.distanceTo(last)<.30*dim.scale){
        put(first,.012*dim.scale);put(last,.012*dim.scale);
      }
    }
    return probes;
  }
  measure(model:StudioHumanModel,weapon:THREE.Matrix4,
    kind:BodyCollisionWeapon,dim:BodyCollisionDimensions):BodyClearance{
    const transforms=this.transforms();
    const probes=this.collectProbes(model,weapon,kind,dim);
    countStudioSolverWork("collisionWeaponChecks",probes.length);
    const penalties:number[]=[];
    let minimum=Infinity,maximumPenetration=0;
    for(const probe of probes){
      const signed=this.distance(probe.point,transforms)-probe.radius;
      minimum=Math.min(minimum,signed);
      const penetration=Math.max(0,.003*dim.scale-signed);
      penalties.push(penetration);
      maximumPenetration=Math.max(maximumPenetration,penetration);
    }
    return {minimumMeters:minimum,maximumPenetrationMeters:maximumPenetration,
      penalties:Object.freeze(penalties)};
  }
  /** Independent final source-skinned triangle check.
   *
   * A small fixed set of weapon/arm capsule probes is compared to the
   * ACTUAL posed MakeHuman torso triangle surface. Topology and skin
   * ownership are cached at model creation; the exact posed triangle
   * positions are sampled ONLY on a promising final candidate, never
   * inside the numerical IK/Jacobian loop. A spatial AABB prefilter bounds
   * the number of closest-point evaluations. The conservative volume
   * envelope remains responsible for rejecting fully enclosed probes.
   */
  measureSkinnedSurface(model:StudioHumanModel,weapon:THREE.Matrix4,
    kind:BodyCollisionWeapon,dim:BodyCollisionDimensions):BodyClearance {
    const mesh=model.human.mesh;
    model.human.spike.character.root.updateWorldMatrix(true,true);
    mesh.updateWorldMatrix(true,false);
    const probes=this.collectProbes(model,weapon,kind,dim);
    const skin=new Map<number,THREE.Vector3>();
    const sourcePoint=(index:number):THREE.Vector3=>{
      let value=skin.get(index);
      if(!value){
        value=mesh.getVertexPosition(index,new THREE.Vector3())
          .applyMatrix4(mesh.matrixWorld);
        if(!value.toArray().every(Number.isFinite))
          throw new Error("Nonfinite posed source-skin surface");
        skin.set(index,value);
      }
      return value;
    };
    const queryMin=new THREE.Vector3(Infinity,Infinity,Infinity);
    const queryMax=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
    const queryMargin=.07*dim.scale;
    for(const {point,radius} of probes){
      const margin=radius+queryMargin;
      queryMin.min(new THREE.Vector3(point.x-margin,point.y-margin,point.z-margin));
      queryMax.max(new THREE.Vector3(point.x+margin,point.y+margin,point.z+margin));
    }
    const triangle=new THREE.Triangle(),closest=new THREE.Vector3();
    const penalties=new Array<number>(probes.length).fill(0);
    let minimum=.07*dim.scale;
    for(const [ai,bi,ci] of this.torsoTriangles){
      const a=sourcePoint(ai),b=sourcePoint(bi),c=sourcePoint(ci);
      const loX=Math.min(a.x,b.x,c.x),hiX=Math.max(a.x,b.x,c.x);
      const loY=Math.min(a.y,b.y,c.y),hiY=Math.max(a.y,b.y,c.y);
      const loZ=Math.min(a.z,b.z,c.z),hiZ=Math.max(a.z,b.z,c.z);
      if(loX>queryMax.x||hiX<queryMin.x||
        loY>queryMax.y||hiY<queryMin.y||
        loZ>queryMax.z||hiZ<queryMin.z)continue;
      triangle.set(a,b,c);
      for(let i=0;i<probes.length;i++){
        const probe=probes[i]!;
        const {point,radius}=probe;
        const margin=radius+queryMargin;
        if(point.x<loX-margin||point.x>hiX+margin||
          point.y<loY-margin||point.y>hiY+margin||
          point.z<loZ-margin||point.z>hiZ+margin)continue;
        triangle.closestPointToPoint(point,closest);
        const signed=closest.distanceTo(point)-radius;
        minimum=Math.min(minimum,signed);
        penalties[i]=Math.max(penalties[i]!,
          Math.max(0,.002*dim.scale-signed));
      }
    }
    const maximumPenetration=Math.max(0,...penalties.map(p=>
      Math.max(0,p-.002*dim.scale)));
    return Object.freeze({
      minimumMeters:minimum,maximumPenetrationMeters:maximumPenetration,
      penalties:Object.freeze(penalties),
    });
  }

}
