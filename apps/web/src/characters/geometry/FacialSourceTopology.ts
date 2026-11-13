import * as THREE from "three";
import type { AnatomicalHuman } from "./AnatomicalTemplate";
import {
  FACIAL_REGION_IDS, type FacialRegionId, type FacialControlAtlas,
  refineHumanFacialTopology,
} from "./FacialTopology";
import { validateSkinningSpike } from "./SkinningSpike";

/**
 * C3.5: source-derived, *unmoved* human facial tessellation.
 *
 * No fitted ellipses, projected cavities, displaced eyelid/mouth caps, extra
 * shells, or independent bones. The original MakeHuman body triangles and
 * sculpted contours are the geometry authority. Two canonical-edge refinement
 * passes add samples where real surface geometry already exists.
 *
 * New vertices are linear interpolations of adjacent source-connected
 * vertices. The prefix of the C2 arrays remains bit-identical; UV-seam twins
 * share a canonical topology ID. This is a control mesh, NOT an expression.
 */
export const HUMAN_FACIAL_SOURCE_VERSION = 1 as const;

export interface FacialSourceVertex {
  readonly index: number;
  readonly topologyId: number;
  readonly parentA: number;
  readonly parentB: number;
  readonly t: 0.5;
}
export interface FacialSourceAudit {
  readonly version: 1;
  readonly originalVertices: number;
  readonly originalTriangles: number;
  readonly refinedVertices: number;
  readonly refinedTriangles: number;
  readonly primarySourceEdges: number;
  readonly secondaryCanonicalEdges: number;
  readonly maximumSkinInfluences: 4;
  readonly controlSupport: Readonly<Record<FacialRegionId, number>>;
}
export interface HumanFacialSourceSurface {
  readonly geometry: THREE.BufferGeometry;
  readonly atlas: FacialControlAtlas;
  readonly topologyIds: Uint32Array;
  readonly derivedVertices: readonly FacialSourceVertex[];
  readonly audit: FacialSourceAudit;
  /** Independent local, bilateral, rest-space authoring samples. No mutation. */
  controlWeights(id: FacialRegionId): Float32Array;
}
export interface FacialSourceOptions {
  readonly primaryEdges?: number;
  readonly secondaryEdges?: number;
}

const key=(a:number,b:number):string =>
  Math.min(a,b)+":"+Math.max(a,b);

function midpointSkin(
  a:number,b:number,skinIndices:readonly number[],skinWeights:readonly number[],
):{joints:number[];weights:number[]} {
  const merged=new Map<number,number>();
  for(const index of [a,b])for(let k=0;k<4;k++){
    const joint=skinIndices[index*4+k]!;
    merged.set(joint,(merged.get(joint)??0)+skinWeights[index*4+k]!*.5);
  }
  const pairs=[...merged].filter(pair=>pair[1]>0)
    .sort((x,y)=>y[1]-x[1]||x[0]-y[0]).slice(0,4);
  const total=pairs.reduce((v,pair)=>v+pair[1],0);
  if(!(total>0))throw new Error("C3.5 source subdivision unweighted vertex");
  const joints:number[]=[],weights:number[]=[];
  let placed=0;
  for(let k=0;k<4;k++){
    joints.push(pairs[k]?.[0]??0);
    const weight=k===3?Math.max(0,1-placed):(pairs[k]?.[1]??0)/total;
    weights.push(weight);placed+=weight;
  }
  return {joints,weights};
}

/**
 * Extra tessellation follows actual existing source edges, with extra samples
 * at sparse eyelid, mouth and nostril neighborhoods. It never changes the
 * source anatomy or invents curve positions in front of the face.
 */
export function buildHumanFacialSourceSurface(
  human:AnatomicalHuman, options:FacialSourceOptions={},
):HumanFacialSourceSurface {
  const primary=options.primaryEdges??2400;
  const secondary=options.secondaryEdges??2800;
  if(!Number.isSafeInteger(primary)||primary<32||primary>3000||
     !Number.isSafeInteger(secondary)||secondary<32||secondary>5000)
    throw new Error("C3.5 facial source topology budget is invalid");
  const original=human.template.geometry;
  const first=refineHumanFacialTopology(human,{
    maxSourceEdges:primary,minimumEdgeLengthMeters:.001,
  });
  let output:THREE.BufferGeometry|undefined;
  try {
    const g=first.geometry, position=g.getAttribute("position");
    const normal=g.getAttribute("normal"),uv=g.getAttribute("uv");
    const si=g.getAttribute("skinIndex"),sw=g.getAttribute("skinWeight");
    const indices=Array.from(g.getIndex()!.array as ArrayLike<number>);
    const sourceIds=human.template.sourceVertexIds;
    const topologyIds=Array.from(sourceIds);
    const canonicalFirst=new Map<string,number>();
    let nextTopology=human.template.sourceVertexCount;
    for(const edge of first.sourceEdges){
      const id=key(edge.sourceA,edge.sourceB);
      if(!canonicalFirst.has(id))canonicalFirst.set(id,nextTopology++);
      topologyIds[edge.renderIndex]=canonicalFirst.get(id)!;
    }
    if(topologyIds.length!==position.count)
      throw new Error("C3.5 incomplete canonical seam mapping");
    const positions=Array.from(position.array as ArrayLike<number>);
    const normals=Array.from(normal.array as ArrayLike<number>);
    const uvs=Array.from(uv.array as ArrayLike<number>);
    const joints=Array.from(si.array as ArrayLike<number>);
    const weights=Array.from(sw.array as ArrayLike<number>);
    const candidate=new Map<string,{score:number;length:number}>();
    const point=new THREE.Vector3();
    for(let i=0;i<indices.length;i+=3){
      const tri=[indices[i]!,indices[i+1]!,indices[i+2]!];
      for(let j=0;j<3;j++){
        const a=tri[j]!,b=tri[(j+1)%3]!;
        const id=key(topologyIds[a]!,topologyIds[b]!);
        if(candidate.has(id)||topologyIds[a]===topologyIds[b])continue;
        const ax=positions[a*3]!,ay=positions[a*3+1]!,az=positions[a*3+2]!;
        const bx=positions[b*3]!,by=positions[b*3+1]!,bz=positions[b*3+2]!;
        const length=Math.hypot(ax-bx,ay-by,az-bz);
        if(length<.0008)continue;
        point.set((ax+bx)*.5,(ay+by)*.5,(az+bz)*.5);
        let importance=0;
        for(const region of first.atlas.regions){
          const priority=/^(eyelid|eye\.|lip\.|mouth\.corner)/.test(region.id)?3:
            /^(nostril|brow|nose\.)/.test(region.id)?2:1;
          importance=Math.max(importance,region.weight(point)*priority);
        }
        if(importance<.12)continue;
        candidate.set(id,{score:importance*length,length});
      }
    }
    const selected=new Set([...candidate].sort((a,b)=>
      b[1].score-a[1].score||a[0].localeCompare(b[0]))
      .slice(0,secondary).map(entry=>entry[0]));
    if(selected.size<32)
      throw new Error("C3.5 source face lacks localized subdivision edges");
    const created:FacialSourceVertex[]=[];
    const renderCache=new Map<string,number>();
    const canonicalCache=new Map<string,number>();
    const mid=(a:number,b:number):number=>{
      const edge=key(a,b);
      const existing=renderCache.get(edge);
      if(existing!==undefined)return existing;
      const parentA=topologyIds[a]!,parentB=topologyIds[b]!;
      const canonical=key(parentA,parentB);
      let id=canonicalCache.get(canonical);
      if(id===undefined){id=nextTopology++;canonicalCache.set(canonical,id);}
      const vertex=positions.length/3;
      for(let j=0;j<3;j++)
        positions.push((positions[a*3+j]!+positions[b*3+j]!)*.5);
      const n=new THREE.Vector3(
        (normals[a*3]!+normals[b*3]!)*.5,
        (normals[a*3+1]!+normals[b*3+1]!)*.5,
        (normals[a*3+2]!+normals[b*3+2]!)*.5,
      ).normalize();
      normals.push(n.x,n.y,n.z);
      uvs.push((uvs[a*2]!+uvs[b*2]!)*.5,
        (uvs[a*2+1]!+uvs[b*2+1]!)*.5);
      const skin=midpointSkin(a,b,joints,weights);
      joints.push(...skin.joints);weights.push(...skin.weights);
      topologyIds.push(id);
      created.push(Object.freeze({index:vertex,topologyId:id,
        parentA,parentB,t:.5 as const}));
      renderCache.set(edge,vertex);
      return vertex;
    };
    const triangles:number[]=[];
    const add=(a:number,b:number,c:number):void=>{
      if(a===b||b===c||a===c)
        throw new Error("C3.5 source refinement degenerate triangle");
      triangles.push(a,b,c);
    };
    for(let i=0;i<indices.length;i+=3){
      const tri=[indices[i]!,indices[i+1]!,indices[i+2]!];
      const marked=[0,1,2].map(j=>selected.has(
        key(topologyIds[tri[j]!]!,topologyIds[tri[(j+1)%3]!]!)));
      const count=marked.filter(Boolean).length;
      if(count===0){add(tri[0]!,tri[1]!,tri[2]!);continue;}
      const start=count===1?marked.indexOf(true):
        count===2?marked.findIndex((v,j)=>v&&marked[(j+1)%3]):0;
      const a=tri[start]!,b=tri[(start+1)%3]!,c=tri[(start+2)%3]!;
      const ab=mid(a,b);
      if(count===1){add(a,ab,c);add(ab,b,c);continue;}
      const bc=mid(b,c);
      if(count===2){add(a,ab,c);add(ab,b,bc);add(ab,bc,c);continue;}
      const ca=mid(c,a);
      add(a,ab,ca);add(ab,b,bc);add(ca,bc,c);add(ab,bc,ca);
    }
    output=new THREE.BufferGeometry();
    output.setIndex(triangles);
    output.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    output.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
    output.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
    output.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(joints,4));
    output.setAttribute("skinWeight",new THREE.Float32BufferAttribute(weights,4));
    output.computeBoundingBox();output.computeBoundingSphere();
    if(positions.length/3>26000||triangles.length/3>55000)
      throw new Error("C3.5 facial source subdivision exceeded budget");
    human.mesh.geometry=output;
    validateSkinningSpike(human.spike);
    const controlSupport={} as Record<FacialRegionId,number>;
    for(const id of FACIAL_REGION_IDS){
      const region=first.atlas.region(id);
      let count=0;
      for(let i=0;i<positions.length;i+=3)
        if(region.weight(point.set(positions[i]!,positions[i+1]!,positions[i+2]!))>=.15)
          count++;
      controlSupport[id]=count;
    }
    first.geometry.dispose();
    const complete=output;
    const atlas=first.atlas;
    const audit:FacialSourceAudit=Object.freeze({
      version:1,originalVertices:original.getAttribute("position").count,
      originalTriangles:original.getIndex()!.count/3,
      refinedVertices:positions.length/3,
      refinedTriangles:triangles.length/3,
      primarySourceEdges:first.atlas.audit.selectedEdges,
      secondaryCanonicalEdges:selected.size,
      maximumSkinInfluences:4,
      controlSupport:Object.freeze(controlSupport),
    });
    return Object.freeze({
      geometry:complete,atlas,topologyIds:Uint32Array.from(topologyIds),
      derivedVertices:Object.freeze(created),
      audit,
      controlWeights(id:FacialRegionId):Float32Array {
        const region=atlas.region(id);
        const result=new Float32Array(positions.length/3);
        for(let i=0;i<result.length;i++){
          point.set(positions[i*3]!,positions[i*3+1]!,positions[i*3+2]!);
          result[i]=region.weight(point);
        }
        return result;
      },
    });
  }catch(error){
    human.mesh.geometry=original;
    output?.dispose();
    first.geometry.dispose();
    throw error;
  }
}
