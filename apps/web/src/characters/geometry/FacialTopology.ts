import * as THREE from "three";
import { DEFAULT_HUMAN_HEAD_MORPHOLOGY } from "@trilok/character-core";
import type { AnatomicalHuman } from "./AnatomicalTemplate";
import { makeHumanHeadTransform } from "./HumanHeadDeformation";
import { validateSkinningSpike } from "./SkinningSpike";

/**
 * C3.5 human-only, versioned facial control topology. These are independent
 * non-skeletal *authoring fields*: C3.6 may produce deltas from them, but they
 * never write pose, damage, expressions, or new C1 bones.
 *
 * The reference surface is the indexed CC0 C2 human, after optional C3.4
 * neutral-rest shaping. The pinned source IDs and UVs are never changed.
 */
export const FACIAL_TOPOLOGY_VERSION = 1 as const;
export const FACIAL_REGION_IDS = [
  "forehead", "brow.left", "brow.right",
  "eyelid.upper.left", "eyelid.upper.right",
  "eyelid.lower.left", "eyelid.lower.right",
  "eye.inner.left", "eye.inner.right",
  "eye.outer.left", "eye.outer.right",
  "nose.bridge", "nose.tip", "nostril.left", "nostril.right",
  "cheek.left", "cheek.right",
  "lip.upper", "lip.lower", "mouth.corner.left", "mouth.corner.right",
  "jaw.left", "jaw.right", "chin", "ear.left", "ear.right",
] as const;
export type FacialRegionId = typeof FACIAL_REGION_IDS[number];
export type FacialBoneRole = "head" | "jaw";

export interface FacialLandmark {
  readonly vertexIndex: number;
  readonly sourceVertexId: number;
  readonly rest: readonly [number, number, number];
  /** Ownership of the original C1 joint; NOT a new animation joint. */
  readonly boneRole: FacialBoneRole;
}
export interface FacialControlRegion {
  readonly id: FacialRegionId;
  readonly landmark: FacialLandmark;
  readonly radius: readonly [number, number, number];
  readonly coveredVertices: number;
  /** Smooth source-space influence sampled on the current rest surface. */
  weight(position: THREE.Vector3): number;
}
export interface FacialTopologyAudit {
  readonly version: 1;
  readonly originalVertices: number;
  readonly originalTriangles: number;
  readonly originalSourceVertices: number;
  readonly originalBoundaryEdges: number;
  readonly originalNonManifoldEdges: number;
  readonly regionCounts: Readonly<Record<FacialRegionId, number>>;
  readonly candidateEdges: number;
  readonly selectedEdges: number;
  readonly refinedVertices: number;
  readonly refinedTriangles: number;
}
export interface FacialControlAtlas {
  readonly version: 1;
  readonly regions: readonly FacialControlRegion[];
  readonly audit: FacialTopologyAudit;
  region(id: FacialRegionId): FacialControlRegion;
}
export interface FacialEdgeOrigin {
  /** Original C2 source vertex endpoints, stable even across UV seams. */
  readonly sourceA: number;
  readonly sourceB: number;
  /** Render vertex index in the new derived surface. */
  readonly renderIndex: number;
  readonly t: 0.5;
}
export interface RefinedHumanFace {
  readonly atlas: FacialControlAtlas;
  readonly sourceEdges: readonly FacialEdgeOrigin[];
  readonly geometry: THREE.BufferGeometry;
}

type VertexInfo = { readonly p: THREE.Vector3; readonly head: number; readonly jaw: number };
type RegionSpec = {
  readonly id: FacialRegionId;
  readonly x: number; readonly y: number; readonly z: number;
  readonly sx: number; readonly sy: number; readonly sz: number;
  readonly boneRole: FacialBoneRole;
  readonly side?: "left" | "right";
};
const finite = (n: number): boolean => Number.isFinite(n);
const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-6;
const edgeKey = (a: number, b: number): string =>
  Math.min(a,b) + ":" + Math.max(a,b);

/** Only source-derived anatomical proportions are used for feature probes. */
export function inspectHumanFacialTopology(human: AnatomicalHuman): FacialControlAtlas {
  if (human.spike.graph.headTopologyFamilyId !== "head_human_v1" ||
      human.mesh.geometry !== human.template.geometry)
    throw new Error("C3.5 expects one owned, unrefined C2 human surface");
  const geometry=human.mesh.geometry;
  const position=geometry.getAttribute("position");
  const skinIndex=geometry.getAttribute("skinIndex");
  const skinWeight=geometry.getAttribute("skinWeight");
  const triangles=geometry.getIndex();
  if (!triangles || !position || !skinIndex || !skinWeight ||
      skinIndex.itemSize!==4 || skinWeight.itemSize!==4 ||
      position.itemSize!==3 || position.count!==human.template.sourceVertexIds.length)
    throw new Error("C3.5 invalid source topology or four-weight skinning");
  const base=makeHumanHeadTransform(human,DEFAULT_HUMAN_HEAD_MORPHOLOGY);
  const points:VertexInfo[]=[];
  for(let i=0;i<position.count;i++){
    let head=0,jaw=0;
    for(let k=0;k<4;k++){
      const bone=skinIndex.getComponent(i,k);
      if(bone===base.headJointIndex)head+=skinWeight.getComponent(i,k);
      if(bone===base.jawJointIndex)jaw+=skinWeight.getComponent(i,k);
    }
    points.push({p:new THREE.Vector3().fromBufferAttribute(position,i),head,jaw});
  }
  const eyes=base.landmarks;
  const centerX=(eyes.eyeLeft.x+eyes.eyeRight.x)*.5;
  const eyeY=(eyes.eyeLeft.y+eyes.eyeRight.y)*.5;
  const span=eyes.eyeRight.x-eyes.eyeLeft.x;
  const faceHeight=eyeY-eyes.chin.y;
  const headHeight=eyes.crown.y-eyes.neck.y;
  if(!(span>.025 && span<.22 && faceHeight>.045 && headHeight>.14))
    throw new Error("C3.5 implausible source-derived facial proportions");
  const eyeLeftX=eyes.eyeLeft.x, eyeRightX=eyes.eyeRight.x;
  // On the pinned CC0 head the old orbital front probe samples the brow,
  // not the palpebral fissure. Calibrate eyelids independently of brows.
  const eyelidY=eyeY-faceHeight*.19;
  // Align the oral band with the original lip fissure rather than the chin.
  const mouthY=eyes.chin.y+faceHeight*.39;
  const noseY=eyes.chin.y+faceHeight*.58;
  const r=Math.max(.008,span*.145);
  const front=Math.max(eyes.eyeLeft.z,eyes.eyeRight.z);
  const specs:RegionSpec[]=[
    {id:"forehead",x:centerX,y:eyeY+headHeight*.18,z:front,sx:span*.65,sy:headHeight*.17,sz:headHeight*.25,boneRole:"head"},
    ...(["left","right"] as const).flatMap(side=>{
      const x=side==="left"?eyeLeftX:eyeRightX;
      const sign=side==="left"?-1:1;
      return [
        {id:`brow.${side}`,x,y:eyeY+2*r*.55,z:front,sx:r*1.7,sy:r*.65,sz:r*1.4,boneRole:"head",side},
        {id:`eyelid.upper.${side}`,x,y:eyelidY+r*.36,z:front,sx:r*1.65,sy:r*.52,sz:r*1.25,boneRole:"head",side},
        {id:`eyelid.lower.${side}`,x,y:eyelidY-r*.38,z:front,sx:r*1.65,sy:r*.52,sz:r*1.25,boneRole:"head",side},
        {id:`eye.inner.${side}`,x:x-sign*r*.89,y:eyelidY,z:front,sx:r*.7,sy:r*.72,sz:r,boneRole:"head",side},
        {id:`eye.outer.${side}`,x:x+sign*r*.94,y:eyelidY,z:front,sx:r*.7,sy:r*.72,sz:r,boneRole:"head",side},
        {id:`nostril.${side}`,x:centerX+sign*span*.105,y:noseY-faceHeight*.09,z:front,sx:r*.72,sy:r*.68,sz:r*1.3,boneRole:"head",side},
        {id:`cheek.${side}`,x:x+sign*r*.8,y:eyeY-faceHeight*.32,z:front,sx:r*2,sy:faceHeight*.22,sz:faceHeight*.23,boneRole:"head",side},
        {id:`mouth.corner.${side}`,x:centerX+sign*span*.27,y:mouthY,z:front,sx:r*.85,sy:r*.8,sz:r*1.5,boneRole:"jaw",side},
        {id:`jaw.${side}`,x:centerX+sign*span*.43,y:eyes.chin.y+faceHeight*.16,z:front,sx:r*2,sy:faceHeight*.20,sz:faceHeight*.34,boneRole:"jaw",side},
        {id:`ear.${side}`,x:x+sign*span*.65,y:eyeY,z:front-span*.65,sx:r*1.4,sy:faceHeight*.30,sz:faceHeight*.5,boneRole:"head",side},
      ] satisfies RegionSpec[];
    }),
    {id:"nose.bridge",x:centerX,y:eyeY-faceHeight*.14,z:front,sx:r*.85,sy:faceHeight*.23,sz:r*1.8,boneRole:"head"},
    {id:"nose.tip",x:centerX,y:noseY,z:front,sx:r*1.1,sy:r*1.15,sz:r*1.8,boneRole:"head"},
    {id:"lip.upper",x:centerX,y:mouthY+r*.5,z:front,sx:span*.33,sy:r*.65,sz:r*1.7,boneRole:"head"},
    {id:"lip.lower",x:centerX,y:mouthY-r*.5,z:front,sx:span*.33,sy:r*.65,sz:r*1.7,boneRole:"jaw"},
    {id:"chin",x:centerX,y:eyes.chin.y+faceHeight*.08,z:front,sx:span*.35,sy:faceHeight*.17,sz:faceHeight*.23,boneRole:"jaw"},
  ];
  const ordered=FACIAL_REGION_IDS.map(id=>{
    const spec=specs.find(s=>s.id===id);
    if(!spec)throw new Error("Missing C3.5 region "+id);
    const frontFacing=!id.startsWith("ear.") && !id.startsWith("jaw.") && id!=="chin";
    let best=-1,score=Infinity;
    for(let i=0;i<points.length;i++){
      const v=points[i]!;
      const ownership=spec.boneRole==="jaw"?v.jaw:v.head;
      if(ownership<.12 || v.p.y<eyes.neck.y+.025)continue;
      if(spec.side==="left" && v.p.x>centerX+.001)continue;
      if(spec.side==="right" && v.p.x<centerX-.001)continue;
      const dx=(v.p.x-spec.x)/spec.sx,dy=(v.p.y-spec.y)/spec.sy;
      const dz=(v.p.z-spec.z)/spec.sz;
      // Surface-only landmark: preserve the pinned vertex ID and avoid
      // selecting the backside of the cranium for front-face features.
      const candidate=dx*dx+dy*dy+dz*dz*(frontFacing?.35:1)-
        (frontFacing? Math.min(v.p.z-front,0)*3:0);
      if(candidate<score){score=candidate;best=i;}
    }
    if(best<0)throw new Error("Missing source-skinned facial landmark "+id);
    const p=points[best]!.p;
    const landmark:FacialLandmark=Object.freeze({
      vertexIndex:best,sourceVertexId:human.template.sourceVertexIds[best]!,
      rest:Object.freeze(p.toArray() as [number,number,number]),
      boneRole:spec.boneRole,
    });
    const radius=Object.freeze([spec.sx,spec.sy,spec.sz] as [number,number,number]);
    const weight=(point:THREE.Vector3):number=>{
      if(spec.side==="left" && point.x>centerX)return 0;
      if(spec.side==="right" && point.x<centerX)return 0;
      if(point.y<eyes.neck.y+.025)return 0;
      const dx=(point.x-p.x)/spec.sx;
      const dy=(point.y-p.y)/spec.sy;
      const dz=(point.z-p.z)/spec.sz;
      const distance=dx*dx+dy*dy+dz*dz;
      return distance>3.2?0:Math.exp(-2*distance);
    };
    let coveredVertices=0;
    for(const v of points){
      const ownership=spec.boneRole==="jaw"?v.jaw:v.head;
      if(ownership>=.12 && weight(v.p)>=.15)coveredVertices++;
    }
    return Object.freeze({id,landmark,radius,coveredVertices,weight});
  });
  const regionCounts=Object.fromEntries(ordered.map(r=>[r.id,r.coveredVertices])) as
    Record<FacialRegionId,number>;
  const audit:FacialTopologyAudit=Object.freeze({
    version:1,originalVertices:position.count,originalTriangles:triangles.count/3,
    originalSourceVertices:human.template.sourceVertexCount,
    originalBoundaryEdges:human.template.boundaryEdgeCount,
    originalNonManifoldEdges:human.template.nonManifoldEdgeCount,
    regionCounts:Object.freeze(regionCounts),
    candidateEdges:0,selectedEdges:0,
    refinedVertices:position.count,refinedTriangles:triangles.count/3,
  });
  return Object.freeze({
    version:1 as const, regions:Object.freeze(ordered),audit,
    region(id:FacialRegionId):FacialControlRegion {
      const region=ordered.find(item=>item.id===id);
      if(!region)throw new Error("Unknown facial control region "+id);
      return region;
    },
  });
}

export interface FacialRefinementOptions {
  /** Number of canonical source edges that may be split (UV seams excluded). */
  readonly maxSourceEdges?: number;
  readonly minimumEdgeLengthMeters?: number;
}
/** Conforming single-level edge splitting, with interpolated C2 UV/skin data.
 * Selecting edges by original source IDs makes both sides of UV seams split
 * together. This adds deformation samples but does not fake cavities or loops
 * that do not exist in the upstream CC0 face. */
export function refineHumanFacialTopology(
  human: AnatomicalHuman,
  options: FacialRefinementOptions={},
): RefinedHumanFace {
  const atlas=inspectHumanFacialTopology(human);
  const limit=options.maxSourceEdges??1200;
  const minimum=options.minimumEdgeLengthMeters??.0025;
  if(!Number.isSafeInteger(limit)||limit<1||limit>3000 ||
      !finite(minimum)||minimum<.001||minimum>.03)
    throw new Error("C3.5 refinement budget outside supported range");
  const original=human.mesh.geometry;
  const source=human.template.sourceVertexIds;
  const index=original.getIndex()!;
  const p=original.getAttribute("position");
  const n=original.getAttribute("normal");
  const uv=original.getAttribute("uv");
  const si=original.getAttribute("skinIndex");
  const sw=original.getAttribute("skinWeight");
  if(!n||!uv||!si||!sw || n.count!==p.count || uv.count!==p.count ||
      si.count!==p.count || sw.count!==p.count)
    throw new Error("C3.5 missing compatible source vertex attributes");
  const candidates=new Map<string,{a:number;b:number;score:number;length:number}>();
  for(let i=0;i<index.count;i+=3){
    const face=[index.getX(i),index.getX(i+1),index.getX(i+2)];
    for(let k=0;k<3;k++){
      const a=face[k]!,b=face[(k+1)%3]!;
      const key=edgeKey(source[a]!,source[b]!);
      if(candidates.has(key))continue;
      const point=new THREE.Vector3(
        (p.getX(a)+p.getX(b))*.5,
        (p.getY(a)+p.getY(b))*.5,
        (p.getZ(a)+p.getZ(b))*.5);
      const length=new THREE.Vector3().fromBufferAttribute(p,a)
        .distanceTo(new THREE.Vector3().fromBufferAttribute(p,b));
      if(length<minimum)continue;
      let score=0;
      for(const region of atlas.regions)
        score=Math.max(score,region.weight(point));
      if(score<.19)continue;
      candidates.set(key,{a,b,score:score*length,length});
    }
  }
  const selected=new Set([...candidates].sort((a,b)=>
    b[1].score-a[1].score||a[0].localeCompare(b[0]))
    .slice(0,limit).map(([key])=>key));
  if(selected.size===0)throw new Error("C3.5 source lacks refinable facial edges");
  const positions=Array.from(p.array as ArrayLike<number>);
  const normals=Array.from(n.array as ArrayLike<number>);
  const uvs=Array.from(uv.array as ArrayLike<number>);
  const skinIndices=Array.from(si.array as ArrayLike<number>);
  const skinWeights=Array.from(sw.array as ArrayLike<number>);
  const midpointCache=new Map<string,number>();
  const origins:FacialEdgeOrigin[]=[];
  function mid(a:number,b:number):number {
    const key=edgeKey(a,b);
    const found=midpointCache.get(key);
    if(found!==undefined)return found;
    const output=positions.length/3;
    for(let k=0;k<3;k++)positions.push((p.getComponent(a,k)+p.getComponent(b,k))*.5);
    const normal=new THREE.Vector3().fromBufferAttribute(n,a)
      .add(new THREE.Vector3().fromBufferAttribute(n,b)).normalize();
    normals.push(normal.x,normal.y,normal.z);
    uvs.push((uv.getX(a)+uv.getX(b))*.5,(uv.getY(a)+uv.getY(b))*.5);
    const blend=new Map<number,number>();
    for(const [vertex,factor] of [[a,.5],[b,.5]] as const){
      for(let k=0;k<4;k++){
        const joint=si.getComponent(vertex,k);
        blend.set(joint,(blend.get(joint)??0)+sw.getComponent(vertex,k)*factor);
      }
    }
    const top=[...blend].filter(x=>x[1]>0)
      .sort((x,y)=>y[1]-x[1]||x[0]-y[0]).slice(0,4);
    const sum=top.reduce((total,item)=>total+item[1],0);
    if(!(sum>0))throw new Error("C3.5 unweighted midpoint");
    let accumulated=0;
    for(let k=0;k<4;k++){
      skinIndices.push(top[k]?.[0]??0);
      const value=k===3?1-accumulated:(top[k]?.[1]??0)/sum;
      skinWeights.push(value);
      accumulated+=value;
    }
    origins.push(Object.freeze({sourceA:source[a]!,sourceB:source[b]!,
      renderIndex:output,t:.5 as const}));
    midpointCache.set(key,output);
    return output;
  }
  const out:number[]=[];
  const triangle=(a:number,b:number,c:number):void=>{
    if(a===b||b===c||c===a)throw new Error("C3.5 degenerate subdivided triangle");
    out.push(a,b,c);
  };
  for(let i=0;i<index.count;i+=3){
    const face=[index.getX(i),index.getX(i+1),index.getX(i+2)];
    const marked=[0,1,2].map(k=>selected.has(
      edgeKey(source[face[k]!]!,source[face[(k+1)%3]!]!)));
    const cuts=marked.filter(Boolean).length;
    if(cuts===0){triangle(face[0]!,face[1]!,face[2]!);continue;}
    // Cyclic rotation retains source winding, and reduces all 1/2-edge
    // conformity cases to one deterministic triangulation.
    const start=cuts===1?marked.indexOf(true):
      cuts===2?marked.findIndex((v,k)=>v&&marked[(k+1)%3]):0;
    const a=face[start]!,b=face[(start+1)%3]!,c=face[(start+2)%3]!;
    const ab=mid(a,b);
    if(cuts===1){triangle(a,ab,c);triangle(ab,b,c);continue;}
    const bc=mid(b,c);
    if(cuts===2){
      triangle(a,ab,c);triangle(ab,b,bc);triangle(ab,bc,c);continue;
    }
    const ca=mid(c,a);
    triangle(a,ab,ca);triangle(ab,b,bc);triangle(ca,bc,c);
    triangle(ab,bc,ca);
  }
  const refined=new THREE.BufferGeometry();
  refined.setIndex(out);
  refined.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  refined.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
  refined.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  refined.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(skinIndices,4));
  refined.setAttribute("skinWeight",new THREE.Float32BufferAttribute(skinWeights,4));
  refined.computeBoundingBox();
  refined.computeBoundingSphere();
  const resultAudit:FacialTopologyAudit=Object.freeze({
    ...atlas.audit,candidateEdges:candidates.size,selectedEdges:selected.size,
    refinedVertices:positions.length/3,refinedTriangles:out.length/3,
  });
  const resultAtlas:FacialControlAtlas=Object.freeze({...atlas,audit:resultAudit});
  try{
    human.mesh.geometry=refined;
    validateSkinningSpike(human.spike);
  }catch(error){
    human.mesh.geometry=original;refined.dispose();throw error;
  }
  return Object.freeze({
    atlas:resultAtlas,sourceEdges:Object.freeze(origins),geometry:refined,
  });
}
