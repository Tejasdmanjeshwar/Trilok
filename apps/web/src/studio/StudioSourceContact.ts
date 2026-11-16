import * as THREE from "three";
import type {StudioHumanModel} from "./StudioHumanModel";
import type {HandSide} from "./StudioTwoHandGrip";

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
      lists.set(region,Array.from({length:count},(_,j)=>
        list[Math.floor((j+.5)*list.length/count)]!));
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
  if(axial<=0)return radial;
  if(radial<=0)return axial;
  return Math.hypot(radial,axial);
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
    const indices=samples.get(region)??[];
    for(const i of indices){
      mesh.getVertexPosition(i,world)
        .applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      const distance=signedFiniteCylinderDistance(
        world.x,world.y,world.z,radius,length);
      nearest=Math.min(nearest,Math.abs(distance));
      penetration=Math.max(penetration,-distance);
      if(Math.abs(world.y)<=length/2){
        axialVertices++;
        if(Math.abs(distance)<=pressureBandMeters)contactVertices++;
      }
    }
    results.push(Object.freeze({region,sampledVertices:indices.length,
      axialVertices,contactVertices,nearestGapMeters:nearest,
      maximumPenetrationMeters:penetration}));
  }
  return Object.freeze(results);
}
