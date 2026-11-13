import * as THREE from "three";
import type { AnatomicalHuman } from "./AnatomicalTemplate";
import {
  type FacialControlAtlas, type FacialRegionId, type FacialRefinementOptions,
  refineHumanFacialTopology,
} from "./FacialTopology";
import { validateSkinningSpike } from "./SkinningSpike";

/**
 * C3.5 contour-aligned *human* facial mesh refinement.
 *
 * Imprints level-set rings into the existing manifold CC0 surface by conforming
 * triangle splits. Each split is shared by BOTH sides of the source edge and
 * by every UV-corner duplicate. No separate face shell, facial prosthetic,
 * root scaling, new C1 joint, or species-specific deformation is introduced.
 *
 * This establishes genuine *connected mesh-edge rings* rather than merely
 * increasing face triangles. It cannot create absent eye/mouth cavities.
 */
export const FACIAL_EDGE_FLOW_VERSION = 1 as const;
export type FacialContourId =
  | "orbit.left" | "orbit.right"
  | "brow.left" | "brow.right"
  | "nostril.left" | "nostril.right"
  | "mouth" | "nose.bridge";
export interface FacialContourLoop {
  readonly id: FacialContourId;
  readonly level: number;
  readonly vertices: number;
  readonly edges: number;
  readonly components: number;
  readonly closed: boolean;
}
export interface FacialControlVertex {
  /** Render vertex on the refined surface. */
  readonly index: number;
  /** Stable topology ID shared by intentional UV duplicates. */
  readonly topologyId: number;
  /** Exact endpoints of the previous deterministic topology refinement. */
  readonly parentA: number;
  readonly parentB: number;
  readonly interpolation: number;
  readonly contour: FacialContourId;
  readonly level: number;
}
export interface FacialEdgeFlowAudit {
  readonly version: typeof FACIAL_EDGE_FLOW_VERSION;
  readonly originalVertices: number;
  readonly refinedVertices: number;
  readonly originalTriangles: number;
  readonly refinedTriangles: number;
  readonly addedVertices: number;
  readonly loopCount: number;
  readonly maximumSkinInfluences: 4;
  readonly contours: readonly FacialContourLoop[];
  readonly featureCoverage: Readonly<Record<FacialContourId, number>>;
}
export interface HumanFacialEdgeFlow {
  readonly geometry: THREE.BufferGeometry;
  readonly atlas: FacialControlAtlas;
  /** Every original C2 vertex stays at exactly its original render index. */
  readonly originalRenderVertices: number;
  readonly topologyIds: Uint32Array;
  readonly newVertices: readonly FacialControlVertex[];
  readonly audit: FacialEdgeFlowAudit;
}
type Region = ReturnType<FacialControlAtlas["region"]>;
type Curve = Readonly<{
  id: FacialContourId;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  /** Depth in meters before the contour curves up away from the face. */
  depth: number;
  levels: readonly number[];
}>;
const key=(a:number,b:number):string=>Math.min(a,b)+":"+Math.max(a,b);
const point=(r:Region):THREE.Vector3=>new THREE.Vector3(...r.landmark.rest);
const mean=(a:number,b:number):number=>(a+b)*.5;
const EPSILON=1e-8;

function featureCurves(atlas:FacialControlAtlas):readonly Curve[] {
  const r=(id:FacialRegionId)=>atlas.region(id);
  const curves:Curve[]=[];
  for(const side of ["left","right"] as const){
    const upper=r(`eyelid.upper.${side}`);
    const lower=r(`eyelid.lower.${side}`);
    const inner=r(`eye.inner.${side}`);
    const outer=r(`eye.outer.${side}`);
    const u=point(upper),l=point(lower),i=point(inner),o=point(outer);
    curves.push({
      id:`orbit.${side}`, x:mean(i.x,o.x),y:mean(u.y,l.y),
      z:Math.min(u.z,l.z),rx:Math.max(upper.radius[0]*.85,.008),
      ry:Math.max(upper.radius[1]*1.30,.005),
      depth:Math.max(upper.radius[2]*2.2,.026),
      levels:[.64,.80,.99,1.21],
    });
    const b=r(`brow.${side}`);
    const bp=point(b);
    curves.push({
      id:`brow.${side}`,x:bp.x,y:bp.y,z:bp.z,
      rx:Math.max(b.radius[0]*.83,.008),
      ry:Math.max(b.radius[1]*.92,.0045),
      depth:Math.max(b.radius[2]*2,.025),
      levels:[.82,1.16],
    });
    const nostril=r(`nostril.${side}`);
    const np=point(nostril);
    curves.push({
      id:`nostril.${side}`,x:np.x,y:np.y,z:np.z,
      rx:Math.max(nostril.radius[0]*.85,.004),
      ry:Math.max(nostril.radius[1]*.90,.004),
      depth:Math.max(nostril.radius[2]*1.7,.018),
      levels:[.76,1.12],
    });
  }
  const upper=point(r("lip.upper")),lower=point(r("lip.lower"));
  const cornerLeft=point(r("mouth.corner.left"));
  const cornerRight=point(r("mouth.corner.right"));
  curves.push({
    id:"mouth", x:mean(cornerLeft.x,cornerRight.x),
    y:mean(upper.y,lower.y),z:Math.min(upper.z,lower.z),
    rx:Math.max(Math.abs(cornerRight.x-cornerLeft.x)*.64,.013),
    ry:Math.max(Math.abs(upper.y-lower.y)*.8,.005),
    depth:Math.max(r("lip.upper").radius[2]*1.8,.021),
    levels:[.67,.85,1.03,1.24],
  });
  const bridge=r("nose.bridge"),bridgeP=point(bridge);
  curves.push({
    id:"nose.bridge",x:bridgeP.x,y:bridgeP.y,z:bridgeP.z,
    rx:Math.max(bridge.radius[0]*.85,.005),
    ry:Math.max(bridge.radius[1]*.80,.010),
    depth:Math.max(bridge.radius[2]*2,.028),
    levels:[.85,1.16],
  });
  return Object.freeze(curves);
}

class Surface {
  positions:number[];
  normals:number[];
  uvs:number[];
  skinIndices:number[];
  skinWeights:number[];
  faces:number[];
  topologyIds:number[];
  newVertices:FacialControlVertex[]=[];
  nextTopologyId:number;

  constructor(geometry:THREE.BufferGeometry,sourceIds:ArrayLike<number>,
    existing:readonly {renderIndex:number;sourceA:number;sourceB:number}[],
    sourceVertexCount:number) {
    this.positions=Array.from(geometry.getAttribute("position").array as ArrayLike<number>);
    this.normals=Array.from(geometry.getAttribute("normal").array as ArrayLike<number>);
    this.uvs=Array.from(geometry.getAttribute("uv").array as ArrayLike<number>);
    this.skinIndices=Array.from(geometry.getAttribute("skinIndex").array as ArrayLike<number>);
    this.skinWeights=Array.from(geometry.getAttribute("skinWeight").array as ArrayLike<number>);
    this.faces=Array.from(geometry.getIndex()!.array as ArrayLike<number>);
    this.topologyIds=Array.from(sourceIds);
    this.nextTopologyId=sourceVertexCount;
    const origins=new Map<string,number>();
    for(const edge of existing) {
      const k=key(edge.sourceA,edge.sourceB);
      let id=origins.get(k);
      if(id===undefined){id=this.nextTopologyId++;origins.set(k,id);}
      this.topologyIds[edge.renderIndex]=id;
    }
    if(this.topologyIds.length!==this.positions.length/3)
      throw new Error("C3.5 source correspondence missing on refined UV seams");
  }

  private insert(a:number,b:number,t:number,topologyId:number,
    curve:Curve,level:number):number {
    const index=this.positions.length/3;
    for(let k=0;k<3;k++){
      const from=this.positions[a*3+k]!,to=this.positions[b*3+k]!;
      this.positions.push(from+(to-from)*t);
    }
    const normal=new THREE.Vector3(
      this.normals[a*3]!*(1-t)+this.normals[b*3]!*t,
      this.normals[a*3+1]!*(1-t)+this.normals[b*3+1]!*t,
      this.normals[a*3+2]!*(1-t)+this.normals[b*3+2]!*t,
    ).normalize();
    this.normals.push(...normal.toArray());
    for(let k=0;k<2;k++){
      this.uvs.push(this.uvs[a*2+k]!*(1-t)+this.uvs[b*2+k]!*t);
    }
    const weights=new Map<number,number>();
    for(const [v,scale] of [[a,1-t],[b,t]] as const){
      for(let k=0;k<4;k++){
        const bone=this.skinIndices[v*4+k]!;
        const influence=this.skinWeights[v*4+k]!*scale;
        weights.set(bone,(weights.get(bone)??0)+influence);
      }
    }
    const top=[...weights].filter(x=>x[1]>0)
      .sort((x,y)=>y[1]-x[1]||x[0]-y[0]).slice(0,4);
    const sum=top.reduce((v,x)=>v+x[1],0);
    if(!(sum>0))throw new Error("C3.5 iso-edge lost valid skin weights");
    let placed=0;
    for(let k=0;k<4;k++){
      this.skinIndices.push(top[k]?.[0]??0);
      const w=k===3?Math.max(0,1-placed):(top[k]?.[1]??0)/sum;
      placed+=w;
      this.skinWeights.push(w);
    }
    this.topologyIds.push(topologyId);
    this.newVertices.push(Object.freeze({
      index,topologyId,parentA:this.topologyIds[a]!,
      parentB:this.topologyIds[b]!,interpolation:t,
      contour:curve.id,level,
    }));
    return index;
  }

  /** Exact conformed iso-line insertion on an indexed triangle surface. */
  imprint(curve:Curve,level:number):FacialContourLoop {
    const count=this.positions.length/3;
    const values=new Float64Array(count);
    for(let i=0;i<count;i++){
      const x=(this.positions[i*3]!-curve.x)/curve.rx;
      const y=(this.positions[i*3+1]!-curve.y)/curve.ry;
      const z=curve.z-this.positions[i*3+2]!-.005;
      // Backward/deep surfaces receive an additional continuous penalty:
      // closed contours are constrained to the anterior head/face.
      const recess=Math.max(0,z)/curve.depth;
      values[i]=Math.hypot(x,y)+3*recess*recess;
    }
    const canonical=new Map<string,number>();
    const split=new Map<string,number>();
    const inserted=new Set<number>();
    const segmentKeys=new Set<string>();
    const adjacency=new Map<number,Set<number>>();
    const intersection=(a:number,b:number):number=>{
      const renderEdge=key(a,b);
      const previous=split.get(renderEdge);
      if(previous!==undefined)return previous;
      const ca=this.topologyIds[a]!,cb=this.topologyIds[b]!;
      const canonicalEdge=key(ca,cb);
      let id=canonical.get(canonicalEdge);
      if(id===undefined){id=this.nextTopologyId++;canonical.set(canonicalEdge,id);}
      const va=values[a]!,vb=values[b]!;
      const denominator=vb-va;
      const raw=Math.abs(denominator)<EPSILON?.5:(level-va)/denominator;
      // Threshold ties must not create zero-area triangles.
      const t=THREE.MathUtils.clamp(raw,1e-5,1-1e-5);
      const result=this.insert(a,b,t,id,curve,level);
      inserted.add(id);
      split.set(renderEdge,result);
      return result;
    };
    const next:number[]=[];
    const triangle=(a:number,b:number,c:number):void=>{
      if(a===b||b===c||c===a)
        throw new Error("C3.5 contour generated a degenerate face");
      next.push(a,b,c);
    };
    const segment=(a:number,b:number):void=>{
      const ca=this.topologyIds[a]!,cb=this.topologyIds[b]!;
      const k=key(ca,cb);
      if(segmentKeys.has(k))return; // UV copies share one source edge
      segmentKeys.add(k);
      if(!adjacency.has(ca))adjacency.set(ca,new Set());
      if(!adjacency.has(cb))adjacency.set(cb,new Set());
      adjacency.get(ca)!.add(cb);
      adjacency.get(cb)!.add(ca);
    };
    for(let i=0;i<this.faces.length;i+=3){
      const face=[this.faces[i]!,this.faces[i+1]!,this.faces[i+2]!];
      const inside=face.map(v=>values[v]!<=level);
      const countInside=inside.filter(Boolean).length;
      if(countInside===0||countInside===3){
        triangle(face[0]!,face[1]!,face[2]!);
        continue;
      }
      // Rotate so 'a' is the singleton, then form its triangular side
      // and the opposing quad. Both cases preserve original winding.
      const solitary=countInside===1;
      const start=inside.findIndex(v=>v===solitary);
      const a=face[start]!,b=face[(start+1)%3]!,c=face[(start+2)%3]!;
      const ab=intersection(a,b),ca=intersection(c,a);
      triangle(a,ab,ca);
      triangle(ab,b,c);
      triangle(ab,c,ca);
      segment(ab,ca);
    }
    this.faces=next;
    let components=0;
    const visited=new Set<number>();
    for(const id of adjacency.keys()){
      if(visited.has(id))continue;
      components++;
      const pending=[id];
      visited.add(id);
      while(pending.length){
        const current=pending.pop()!;
        for(const adjacent of adjacency.get(current)??[]){
          if(!visited.has(adjacent)){visited.add(adjacent);pending.push(adjacent);}
        }
      }
    }
    return Object.freeze({
      id:curve.id,level,vertices:inserted.size,edges:segmentKeys.size,
      components,closed:adjacency.size>0 &&
        [...adjacency.values()].every(neighbors=>neighbors.size===2),
    });
  }

  /** Seam-consistent area-weighted normals, including all derived edges. */
  geometry():THREE.BufferGeometry {
    const weighted=new Float64Array(this.nextTopologyId*3);
    for(let i=0;i<this.faces.length;i+=3){
      const a=this.faces[i]!,b=this.faces[i+1]!,c=this.faces[i+2]!;
      const ab=new THREE.Vector3(
        this.positions[b*3]!-this.positions[a*3]!,
        this.positions[b*3+1]!-this.positions[a*3+1]!,
        this.positions[b*3+2]!-this.positions[a*3+2]!);
      const ac=new THREE.Vector3(
        this.positions[c*3]!-this.positions[a*3]!,
        this.positions[c*3+1]!-this.positions[a*3+1]!,
        this.positions[c*3+2]!-this.positions[a*3+2]!);
      ab.cross(ac);
      if(ab.lengthSq()<1e-20)
        throw new Error("C3.5 contour produced an almost-zero-area triangle");
      for(const v of [a,b,c]){
        const k=this.topologyIds[v]!*3;
        weighted[k]=weighted[k]!+ab.x;
        weighted[k+1]=weighted[k+1]!+ab.y;
        weighted[k+2]=weighted[k+2]!+ab.z;
      }
    }
    for(let i=0;i<this.topologyIds.length;i++){
      const k=this.topologyIds[i]!*3;
      const n=new THREE.Vector3(weighted[k]!,weighted[k+1]!,weighted[k+2]!);
      if(n.lengthSq()<1e-20)throw new Error("C3.5 contour lost a source vertex normal");
      n.normalize();
      this.normals[i*3]=n.x;this.normals[i*3+1]=n.y;this.normals[i*3+2]=n.z;
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setIndex(this.faces);
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(this.positions,3));
    geometry.setAttribute("normal",new THREE.Float32BufferAttribute(this.normals,3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(this.uvs,2));
    geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(this.skinIndices,4));
    geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(this.skinWeights,4));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/**
 * The default opt-in C3.5 lab build. A local density pre-pass samples source
 * facial anatomy, then conforming feature iso-curves make *actual linked
 * triangular edge rings* on the very same continuous skin.
 */
export function buildHumanFacialEdgeFlow(
  human:AnatomicalHuman,
  options:FacialRefinementOptions={},
):HumanFacialEdgeFlow {
  const original=human.template.geometry;
  const base=refineHumanFacialTopology(human,options);
  let completed:THREE.BufferGeometry|undefined;
  try{
    const surface=new Surface(base.geometry,
      human.template.sourceVertexIds,base.sourceEdges,
      human.template.sourceVertexCount);
    const contours:FacialContourLoop[]=[];
    for(const curve of featureCurves(base.atlas)){
      for(const level of curve.levels){
        const loop=surface.imprint(curve,level);
        // A crossed isolated triangle/half-ring is unsafe as a semantic
        // control loop. Reject rather than ship disconnected edge segments.
        if(!loop.closed||loop.edges<8||loop.components<1)
          throw new Error("C3.5 incomplete contour "+curve.id+" / "+level+
            ": "+loop.edges+" edges; closed "+loop.closed);
        contours.push(loop);
      }
    }
    completed=surface.geometry();
    if(completed.getAttribute("position").count>55000||
       completed.getIndex()!.count/3>110000)
      throw new Error("C3.5 facial contour mesh exceeded browser budget");
    human.mesh.geometry=completed;
    validateSkinningSpike(human.spike);
    const features=Object.fromEntries(
      [...new Set(contours.map(c=>c.id))].map(id=>
        [id,contours.filter(c=>c.id===id).reduce((total,c)=>total+c.vertices,0)]),
    ) as Record<FacialContourId,number>;
    const audit:FacialEdgeFlowAudit=Object.freeze({
      version:1,originalVertices:original.getAttribute("position").count,
      refinedVertices:completed.getAttribute("position").count,
      originalTriangles:original.getIndex()!.count/3,
      refinedTriangles:completed.getIndex()!.count/3,
      addedVertices:completed.getAttribute("position").count-
        original.getAttribute("position").count,
      loopCount:contours.length,maximumSkinInfluences:4,
      contours:Object.freeze(contours),
      featureCoverage:Object.freeze(features),
    });
    base.geometry.dispose();
    return Object.freeze({
      atlas:base.atlas,geometry:completed,
      originalRenderVertices:original.getAttribute("position").count,
      topologyIds:Uint32Array.from(surface.topologyIds),
      newVertices:Object.freeze(surface.newVertices),
      audit,
    });
  }catch(error){
    human.mesh.geometry=original;
    completed?.dispose();
    base.geometry.dispose();
    throw error;
  }
}
