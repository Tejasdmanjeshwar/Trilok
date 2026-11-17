import * as THREE from "three";
import type {StudioHumanModel} from "./StudioHumanModel";
import type {HandSide} from "./StudioTwoHandGrip";
import {sourceHandVolarWorld} from "./StudioWeaponGrip";

/** Source-vertex contact is measured on the POST-FK MakeHuman skin, in the
 * actual finite handle frame. The pose and weapon must be applied first.
 * This is a geometry service: neither a bow-only rig nor an IK implementation.
 */
export const HAND_SURFACE_REGIONS=["palm","thumb","index","middle","ring","little"] as const;
export type HandSurfaceRegion=typeof HAND_SURFACE_REGIONS[number];
export interface SourceCylinderRegion {
  readonly region:HandSurfaceRegion;
  readonly sampledVertices:number;
  readonly axialVertices:number;
  readonly contactVertices:number;
  /** Unsigned surface distance to the actual finite cylinder, including caps. */
  readonly nearestGapMeters:number;
  /** Third closest source vertex: stable multi-point surface support. */
  readonly thirdNearestGapMeters:number;
  /** Positive signed intrusion (zero outside); never an unsigned distance. */
  readonly maximumPenetrationMeters:number;
}
export type SourceHandSamples=ReadonlyMap<HandSurfaceRegion,readonly number[]>;

/** A source OBJ may enumerate symmetric hands in unrelated vertex orders.
 * Preserve the established left contact-probe distribution, and pair the
 * right-hand probes by mirrored *bind geometry*, not by unrelated indices.
 * This affects only finite-difference sampling: full source-skin acceptance
 * still uses all original vertices on each (potentially asymmetric) hand.
 *
 * If a morphology has no mirror counterpart inside the same anatomical skin
 * region, use the ordinary real-side sampling. Never create synthetic skin,
 * force a joint or change a tolerance to manufacture bilateral equality.
 */
function mirroredRightProbes(left:readonly number[],right:readonly number[],
  position:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,
  count:number):number[]|undefined{
  if(left.length<count||right.length<count)return undefined;
  const selectedLeft=Array.from({length:count},(_,j)=>
    left[Math.floor((j+.5)*left.length/count)]!);
  const key=(x:number,y:number,z:number)=>[
    Math.round(x*100000),Math.round(y*100000),Math.round(z*100000),
  ].join("/");
  const indexed=new Map<string,number[]>();
  for(const index of right){
    const k=key(position.getX(index),position.getY(index),position.getZ(index));
    const entries=indexed.get(k)??[];
    entries.push(index);
    indexed.set(k,entries);
  }
  const used=new Set<number>(),matched:number[]=[];
  for(const index of selectedLeft){
    const x=-position.getX(index),y=position.getY(index),
      z=position.getZ(index);
    // A rounded float32 bind vertex can land in the neighboring bucket.
    const ix=Math.round(x*100000),iy=Math.round(y*100000),
      iz=Math.round(z*100000);
    let best=-1,distance=.0001;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)
      for(let dz=-1;dz<=1;dz++){
        const candidates=indexed.get([ix+dx,iy+dy,iz+dz].join("/"))??[];
        for(const candidate of candidates){
          if(used.has(candidate))continue;
          const error=Math.hypot(x-position.getX(candidate),
            y-position.getY(candidate),z-position.getZ(candidate));
          if(error<distance){distance=error;best=candidate;}
        }
      }
    if(best<0)return undefined;
    used.add(best);matched.push(best);
  }
  return matched;
}

/** A cache belongs to one generated human, not a global recipe or hand. Studio
 * creates a new model when morphology/topology changes. Attribute replacement
 * and needsUpdate revisions additionally invalidate in-place geometry edits.
 * The bound (six regions x <=8 selections) prevents slider-chosen sample
 * budgets from accumulating indefinitely. No posed vertices are cached. */
interface HandSampleCache {
  readonly geometry:THREE.BufferGeometry;
  readonly indices:THREE.BufferAttribute|THREE.InterleavedBufferAttribute;
  readonly weights:THREE.BufferAttribute|THREE.InterleavedBufferAttribute;
  readonly position:THREE.BufferAttribute|THREE.InterleavedBufferAttribute;
  readonly indexVersion:number;
  readonly weightVersion:number;
  readonly positionVersion:number;
  readonly graph:unknown;
  readonly skeleton:unknown;
  readonly sourceIds:unknown;
  readonly entries:Map<string,SourceHandSamples>;
}
const handSampleCaches=new WeakMap<StudioHumanModel,HandSampleCache>();
function attributeRevision(
  attribute:THREE.BufferAttribute|THREE.InterleavedBufferAttribute):number{
  return attribute instanceof THREE.InterleavedBufferAttribute?
    attribute.data.version:attribute.version;
}
function currentHandSampleCache(model:StudioHumanModel):HandSampleCache {
  const {mesh,spike,template}=model.human;
  const geometry=mesh.geometry;
  const indices=geometry.getAttribute("skinIndex");
  const weights=geometry.getAttribute("skinWeight");
  const position=geometry.getAttribute("position");
  const previous=handSampleCaches.get(model);
  if(previous&&previous.geometry===geometry&&previous.indices===indices&&
    previous.weights===weights&&previous.position===position&&
    previous.indexVersion===attributeRevision(indices)&&
    previous.weightVersion===attributeRevision(weights)&&
    previous.positionVersion===attributeRevision(position)&&
    previous.graph===spike.graph&&previous.skeleton===spike.skeleton&&
    previous.sourceIds===template.sourceVertexIds)return previous;
  const next:HandSampleCache={
    geometry,indices,weights,position,indexVersion:attributeRevision(indices),
    weightVersion:attributeRevision(weights),positionVersion:attributeRevision(position),
    graph:spike.graph,skeleton:spike.skeleton,sourceIds:template.sourceVertexIds,
    entries:new Map(),
  };
  handSampleCaches.set(model,next);
  return next;
}

/** Select distinct original MakeHuman vertices. Deterministic downsampling
 * is for solver evaluation only; a complete pass remains available at final
 * acceptance. A region with no source vertices is a hard diagnostic failure. */
export function sourceHandSamples(model:StudioHumanModel,hand:HandSide,
  maximumPerRegion=Infinity):SourceHandSamples{
  const cache=currentHandSampleCache(model);
  const key=hand+"/"+String(maximumPerRegion);
  const prior=cache.entries.get(key);
  // Return a fresh map so a caller may change selected regions (e.g. full
  // thumb recovery) without contaminating another equipment solver.
  if(prior)return new Map(prior);
  const {mesh,spike,template}=model.human;
  const indices=cache.indices;
  const weights=mesh.geometry.getAttribute("skinWeight");
  const bones=new Map<HandSurfaceRegion,Set<number>>(HAND_SURFACE_REGIONS.map(region=>[region,
    new Set(spike.graph.joints.filter(j=>region==="palm"?
      j.role==="palm_"+hand:
      j.role.startsWith("finger_"+region+"_")&&
      j.id.includes("arm["+hand+",0]"))
      .map(j=>spike.skeleton.bones.indexOf(spike.bones.get(j.id)!)))] as const));
  const lists=new Map<HandSurfaceRegion,number[]>(HAND_SURFACE_REGIONS.map(region=>[region,[] as number[]] as const));
  // Only bounded right-hand probes need mirrored left lookup. All accepted
  // final contacts still originate solely from this hand's own source skin.
  const mirrorFromLeft=hand==="right"&&Number.isFinite(maximumPerRegion);
  const counterpart=mirrorFromLeft?new Map<HandSurfaceRegion,number[]>(
    HAND_SURFACE_REGIONS.map(region=>[region,[]] as const)):undefined;
  const otherBones=mirrorFromLeft?new Map<HandSurfaceRegion,Set<number>>(
    HAND_SURFACE_REGIONS.map(region=>[region,new Set(spike.graph.joints.filter(j=>
      region==="palm"?j.role==="palm_left":
      j.role.startsWith("finger_"+region+"_")&&j.id.includes("arm[left,0]"))
      .map(j=>spike.skeleton.bones.indexOf(spike.bones.get(j.id)!)))] as const)):undefined;
  const seen=new Set<number>();
  for(let i=0;i<indices.count;i++){
    const source=template.sourceVertexIds[i]??i;
    if(seen.has(source))continue;
    seen.add(source);
    for(const region of HAND_SURFACE_REGIONS){
      let influence=0,leftInfluence=0;
      for(let j=0;j<4;j++){
        const idx=indices.getComponent(i,j),weight=weights.getComponent(i,j);
        if(bones.get(region)!.has(idx))influence+=weight;
        if(otherBones?.get(region)?.has(idx))leftInfluence+=weight;
      }
      if(influence>=.6)lists.get(region)!.push(i);
      if(counterpart&&leftInfluence>=.6)counterpart.get(region)!.push(i);
    }
  }
  for(const region of HAND_SURFACE_REGIONS){
    const list=lists.get(region)!;
    if(list.length<8)throw new Error("Missing source skin samples: "+hand+"/"+region);
    if(Number.isFinite(maximumPerRegion)&&list.length>maximumPerRegion){
      const count=Math.max(8,Math.floor(maximumPerRegion));
      const paired=counterpart&&mirroredRightProbes(
        counterpart.get(region)!,list,
        mesh.geometry.getAttribute("position"),count);
      lists.set(region,paired??Array.from({length:count},(_,j)=>
        list[Math.floor((j+.5)*list.length/count)]!));
    }
  }
  // The index lists are immutable once collected; real source-skin positions
  // and contact checks remain evaluated afresh on every IK objective call.
  for(const list of lists.values())Object.freeze(list);
  if(cache.entries.size>=8)cache.entries.clear();
  cache.entries.set(key,lists);
  return new Map(lists);
}

/** Exact signed distance to a *capped*, finite radius cylinder aligned to Y.
 * Negative inside, positive outside. End-cap vertices can never masquerade as
 * contact with the infinite extension of a handle. */
export function signedFiniteCylinderDistance(x:number,y:number,z:number,
  radius:number,length:number):number{
  if(!(radius>0&&length>0))throw new Error("Invalid finite contact cylinder");
  const radial=Math.hypot(x,z)-radius;
  const axial=Math.abs(y)-length/2;
  // Exact capped-cylinder SDF: the cap is the nearest *interior*
  // surface when a sample is inside the radius but near a handle end.
  // A radial-only interior distance overstates cap penetration.
  return Math.hypot(Math.max(radial,0),Math.max(axial,0))+
    Math.min(Math.max(radial,axial),0);
}

/** Sampling happens after all FK, morph and wrist transforms. A single lucky
 * near vertex is not accepted as an entire digit's pressure-bearing contact.
 * 'axialVertices' reports support in the real handle length, not near its
 * infinite cylinder axis. */
export function measureSourceCylinder(model:StudioHumanModel,
  samples:SourceHandSamples,weaponWorld:THREE.Matrix4,
  radius:number,length:number,pressureBandMeters=.003):readonly SourceCylinderRegion[]{
  const {mesh,spike}=model.human;
  spike.character.root.updateWorldMatrix(true,true);
  mesh.updateWorldMatrix(true,false);
  const inverse=weaponWorld.clone().invert();
  const world=new THREE.Vector3();
  const results:SourceCylinderRegion[]=[];
  for(const region of HAND_SURFACE_REGIONS){
    let axialVertices=0,contactVertices=0,nearest=Infinity,penetration=0;
    const nearestThree=[Infinity,Infinity,Infinity];
    const indices=samples.get(region)??[];
    for(const i of indices){
      mesh.getVertexPosition(i,world)
        .applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      const distance=signedFiniteCylinderDistance(
        world.x,world.y,world.z,radius,length);
      const gap=Math.abs(distance);
      nearest=Math.min(nearest,gap);
      if(gap<nearestThree[2]!){
        nearestThree[2]=gap;nearestThree.sort((a,b)=>a-b);
      }
      penetration=Math.max(penetration,-distance);
      if(Math.abs(world.y)<=length/2){
        axialVertices++;
        if(Math.abs(distance)<=pressureBandMeters)contactVertices++;
      }
    }
    results.push(Object.freeze({region,sampledVertices:indices.length,
      axialVertices,contactVertices,nearestGapMeters:nearest,
      thirdNearestGapMeters:nearestThree[2]!,
      maximumPenetrationMeters:penetration}));
  }
  return Object.freeze(results);
}

/** Fast source-skinned contact residual for the existing shared constrained IK.
 * The bow's posed nock and real two finite string segments are supplied by
 * the caller; no independent drawing-hand target or combat authority exists.
 * A missing nearby source vertex produces a positive miss, never fake contact.
 */
export function measureSourceStringContact(model:StudioHumanModel,
  samples:SourceHandSamples,nockWorld:THREE.Vector3,
  upperWorld:THREE.Vector3,lowerWorld:THREE.Vector3,
  stringRadiusMeters:number,maxNockDistanceMeters:number):
  Readonly<Record<"index"|"middle"|"ring",number>>{
  const mesh=model.human.mesh;
  mesh.updateWorldMatrix(true,false);
  const lines=[
    new THREE.Line3(nockWorld,upperWorld),
    new THREE.Line3(nockWorld,lowerWorld),
  ];
  const point=new THREE.Vector3(),nearest=new THREE.Vector3();
  const output={index:Infinity,middle:Infinity,ring:Infinity};
  for(const digit of ["index","middle","ring"] as const){
    for(const vertex of samples.get(digit)??[]){
      mesh.getVertexPosition(vertex,point).applyMatrix4(mesh.matrixWorld);
      if(point.distanceTo(nockWorld)>maxNockDistanceMeters)continue;
      for(const line of lines){
        line.closestPointToPoint(point,true,nearest);
        output[digit]=Math.min(output[digit],point.distanceTo(nearest));
      }
    }
    if(!Number.isFinite(output[digit]))
      output[digit]=maxNockDistanceMeters;
    output[digit]=Math.max(0,output[digit]-stringRadiusMeters);
  }
  return output;
}

/** Select stable distal VOLAR pad source vertices from the posed MakeHuman
 * skin. This avoids the nondifferentiable minimum-over-a-whole-digit residual
 * which can switch to unrelated knuckle/back-of-hand vertices mid-solve.
 * Measured distal phalanx length determines the sample interval; no named
 * bone coordinates or world-space hand offsets are assumed.
 */
export function sourceFingerPadVertices(model:StudioHumanModel,
  hand:HandSide,digit:"index"|"middle",sampled:SourceHandSamples,
  count=4):readonly number[]{
  const {spike,mesh}=model.human;
  const joint=(index:number)=>{
    const semantic=spike.graph.joints.find(j=>
      j.role==="finger_"+digit+"_"+index&&
      j.id.includes("arm["+hand+",0]"));
    const bone=semantic&&spike.bones.get(semantic.id);
    if(!bone)throw new Error("Missing MakeHuman distal pad bone "+digit);
    return bone;
  };
  spike.character.root.updateWorldMatrix(true,true);
  mesh.updateWorldMatrix(true,false);
  const proximal=joint(1).getWorldPosition(new THREE.Vector3());
  const distal=joint(2).getWorldPosition(new THREE.Vector3());
  const direction=distal.clone().sub(proximal);
  const length=direction.length();
  if(length<=1e-5)throw new Error("Degenerate source distal finger "+digit);
  direction.multiplyScalar(1/length);
  const volar=sourceHandVolarWorld(model,hand);
  const candidate:{id:number;along:number;volar:number}[]=[];
  const point=new THREE.Vector3();
  for(const id of sampled.get(digit)??[]){
    mesh.getVertexPosition(id,point).applyMatrix4(mesh.matrixWorld);
    const local=point.sub(distal);
    candidate.push({id,along:local.dot(direction),volar:local.dot(volar)});
  }
  if(candidate.length<count)throw new Error("Missing distal source finger pads");
  const furthest=Math.max(...candidate.map(v=>v.along));
  // Only the distal-most half-phalange is eligible for a physical pad.
  const distalSurface=candidate.filter(v=>v.along>=furthest-length*.5);
  if(distalSurface.length<count)
    throw new Error("Insufficient exposed source finger-pad vertices");
  distalSurface.sort((a,b)=>b.volar-a.volar||b.along-a.along||a.id-b.id);
  return Object.freeze(distalSurface.slice(0,count).map(v=>v.id));
}
export function sourcePadWorld(model:StudioHumanModel,
  vertices:readonly number[]):THREE.Vector3{
  const mesh=model.human.mesh;
  mesh.updateWorldMatrix(true,false);
  const point=new THREE.Vector3(),average=new THREE.Vector3();
  if(vertices.length===0)throw new Error("Missing physical pad vertices");
  for(const id of vertices)
    average.add(mesh.getVertexPosition(id,point).applyMatrix4(mesh.matrixWorld));
  return average.multiplyScalar(1/vertices.length);
}
