import * as THREE from "three";
import type {StudioHumanModel} from "./StudioHumanModel";
import {HAND_SURFACE_REGIONS,type HandSurfaceRegion,
  type SourceHandSamples} from "./StudioSourceContact";

/** Source-skinned arrow/hand inspection shared by weapon presentation.
 * No combat hit tests or source rig changes happen here. */
export interface ArrowShaftClearance {
  readonly region:HandSurfaceRegion;
  readonly vertices:number;
  /** Unsigned nearest point-to-centerline distance minus physical shaft radius. */
  readonly nearestSurfaceClearanceMeters:number;
  /** Source vertex attaining the nearest surface clearance, in bow local space. */
  readonly closestPointLocal:THREE.Vector3;
}

export interface ArrowRestReferenceV1 {
  readonly schemaVersion:1;
  readonly kind:"hand-supported"|"shelf";
  readonly support:"index-knuckle"|"thumb-web"|"shelf";
  readonly shaftRadiusMeters:number;
  readonly supportGapMeters:number;
  /** For shelf bows this can be positive or negative in bow-local X. */
  readonly lateralOffsetMeters:number;
}

export function validateArrowRestReference(r:ArrowRestReferenceV1):void{
  if(r.schemaVersion!==1||
    !["hand-supported","shelf"].includes(r.kind)||
    !["index-knuckle","thumb-web","shelf"].includes(r.support)||
    r.kind==="shelf"!== (r.support==="shelf")||
    ![r.shaftRadiusMeters,r.supportGapMeters,r.lateralOffsetMeters].every(Number.isFinite)||
    r.shaftRadiusMeters<.001||r.shaftRadiusMeters>.02||
    r.supportGapMeters<0||r.supportGapMeters>.02||
    Math.abs(r.lateralOffsetMeters)>.05)
    throw new Error("Invalid anatomical arrow-rest reference");
}

/** Measure a *finite* physical shaft capsule against complete posed hand
 * source vertices. Call after FK and morphology have settled. Read-only:
 * neither the bow matrix nor the character mesh is modified. Sampling may
 * be bounded for optimization, but final acceptance needs full skin.
 * Vertex tests are conservative diagnostics; mesh-triangle clearance is a
 * separate quality gate when a narrow shaft passes between vertices.
 */
export function measureSourceArrowShaft(model:StudioHumanModel,
  samples:SourceHandSamples,bowWorld:THREE.Matrix4,
  nockLocal:THREE.Vector3,arrowLengthMeters:number,
  shaftRadiusMeters:number):readonly ArrowShaftClearance[]{
  if(!(Number.isFinite(arrowLengthMeters)&&arrowLengthMeters>0&&
    Number.isFinite(shaftRadiusMeters)&&shaftRadiusMeters>0))
    throw new Error("Invalid physical arrow shaft");
  model.human.spike.character.root.updateWorldMatrix(true,true);
  const mesh=model.human.mesh;
  mesh.updateWorldMatrix(true,false);
  const inverse=bowWorld.clone().invert();
  const line=new THREE.Line3(nockLocal,
    nockLocal.clone().add(new THREE.Vector3(0,0,arrowLengthMeters)));
  const vertex=new THREE.Vector3(),closest=new THREE.Vector3();
  return Object.freeze(HAND_SURFACE_REGIONS.map(region=>{
    let minimum=Infinity;
    let closestPoint=new THREE.Vector3();
    const indices=samples.get(region)??[];
    for(const id of indices){
      mesh.getVertexPosition(id,vertex).applyMatrix4(mesh.matrixWorld)
        .applyMatrix4(inverse);
      line.closestPointToPoint(vertex,true,closest);
      const signed=vertex.distanceTo(closest)-shaftRadiusMeters;
      if(signed<minimum){minimum=signed;closestPoint=vertex.clone();}
    }
    return Object.freeze({region,vertices:indices.length,
      nearestSurfaceClearanceMeters:minimum,closestPointLocal:closestPoint});
  }));
}

/** Source-skinned hand-supported rest at the proximal index region.
 * +Y of the fitted bow is defined by the index-to-little knuckle axis,
 * regardless of handedness. Preserve the grip-to-finger spatial relation,
 * not a fixed avatar-wide height or a post-render cosmetic shift.
 *
 * The support band's closest posed skin vertices are extracted near the
 * index MCP joint. This is a geometric landmark, not an IK bone origin.
 */
export function sourceIndexRestLandmark(model:StudioHumanModel,
  hand:"left"|"right",samples:SourceHandSamples,
  bowWorld:THREE.Matrix4):THREE.Vector3{
  const joint=model.human.spike.graph.joints.find(j=>
    j.role==="finger_index_0"&&j.id.includes("arm["+hand+",0]"));
  const bone=joint&&model.human.spike.bones.get(joint.id);
  if(!bone)throw new Error("Missing anatomical index MCP landmark");
  const mesh=model.human.mesh;
  model.human.spike.character.root.updateWorldMatrix(true,true);
  mesh.updateWorldMatrix(true,false);
  const inverse=bowWorld.clone().invert();
  const mcp=bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
  const point=new THREE.Vector3();
  let nearestDistance=Infinity,nearest:THREE.Vector3|undefined;
  for(const id of samples.get("index")??[]){
    mesh.getVertexPosition(id,point).applyMatrix4(mesh.matrixWorld)
      .applyMatrix4(inverse);
    // Do not choose a distant fingertip merely because it is above the rest.
    const distance=point.distanceToSquared(mcp);
    if(distance<nearestDistance){nearestDistance=distance;nearest=point.clone();}
  }
  if(!nearest)throw new Error("Missing source index-rest skin");
  return nearest;
}
