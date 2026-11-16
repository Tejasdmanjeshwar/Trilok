import * as THREE from "three";
import type {StudioHumanModel} from "./StudioHumanModel";
import type {HandSide} from "./StudioTwoHandGrip";
import {sourceHandVolarWorld} from "./StudioWeaponGrip";
import {mirrorStableSampleIndices} from "./StudioMirrorSampling";

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

/** Select distinct original MakeHuman vertices. Deterministic downsampling
 * is for solver evaluation only; a complete pass remains available at final
 * acceptance. A region with no source vertices is a hard diagnostic failure. */
export function sourceHandSamples(model:StudioHumanModel,hand:HandSide,
  maximumPerRegion=Infinity):SourceHandSamples{
  const {mesh,spike,template}=model.human;
  const indices=mesh.geometry.getAttribute("skinIndex");
  const weights=mesh.geometry.getAttribute("skinWeight");
  const bones=new Map<HandSurfaceRegion,Set<number>>(HAND_SURFACE_REGIONS.map(region=>[region,
    new Set(spike.graph.joints.filter(j=>region==="palm"?
      j.role==="palm_"+hand:
      j.role.startsWith("finger_"+region+"_")&&
      j.id.includes("arm["+hand+",0]"))
      .map(j=>spike.skeleton.bones.indexOf(spike.bones.get(j.id)!)))] as const));
  const lists=new Map<HandSurfaceRegion,number[]>(HAND_SURFACE_REGIONS.map(region=>[region,[] as number[]] as const));
  const seen=new Set<number>();
  for(let i=0;i<indices.count;i++){
    const source=template.sourceVertexIds[i]??i;
    if(seen.has(source))continue;
    seen.add(source);
    for(const region of HAND_SURFACE_REGIONS){
      let influence=0;
      for(let j=0;j<4;j++)
        if(bones.get(region)!.has(indices.getComponent(i,j)))
          influence+=weights.getComponent(i,j);
      if(influence>=.6)lists.get(region)!.push(i);
    }
  }
  for(const region of HAND_SURFACE_REGIONS){
    const list=lists.get(region)!;
    if(list.length<8)throw new Error("Missing source skin samples: "+hand+"/"+region);
    if(Number.isFinite(maximumPerRegion)&&list.length>maximumPerRegion){
      const count=Math.max(8,Math.floor(maximumPerRegion));
      lists.set(region,[...mirrorStableSampleIndices(list,
        mesh.geometry.getAttribute("position"),hand,count)]);
    }
  }
  return lists;
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
