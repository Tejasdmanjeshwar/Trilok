import * as THREE from "three";
import type {AnatomicalHuman} from "./AnatomicalTemplate";
import type {FacialRegionId} from "./FacialTopology";
import type {FacialContourId,HumanFacialEdgeFlow} from "./FacialEdgeFlow";
import {buildHumanFacialEdgeFlow} from "./FacialEdgeFlow";
import {validateSkinningSpike} from "./SkinningSpike";

/**
 * C3.5 human face: replace bounded disks on the *existing* indexed surface
 * with recessed, closed interior pockets. These are not pasted-on geometry:
 * each exterior contour edge is shared with a correctly wound inner wall.
 *
 * No separate meshes or new C1 bones are introduced. Underlying CC0 source
 * positions/UVs and every canonical source vertex index remain untouched.
 * The inside of each cavity is capped to preserve a closed two-manifold,
 * rather than claiming an anatomical mouth/orbit/airway breakthrough.
 */
export const FACIAL_APERTURE_VERSION=1 as const;
export type FacialApertureId=
  "orbit.left"|"orbit.right"|"nostril.left"|"nostril.right"|"mouth";
export const FACIAL_APERTURE_IDS:readonly FacialApertureId[]=
  Object.freeze(["orbit.left","orbit.right","nostril.left","nostril.right","mouth"]);
export interface FacialAperture {
  readonly id:FacialApertureId;
  readonly boundaryVertices:number;
  readonly removedTriangles:number;
  readonly wallTriangles:number;
  readonly depthMeters:number;
  readonly sourceTopologyIds:readonly number[];
  readonly centerVertex:number;
}
export interface FacialApertureAudit {
  readonly version:1;
  readonly beforeVertices:number;
  readonly afterVertices:number;
  readonly beforeTriangles:number;
  readonly afterTriangles:number;
  readonly apertureCount:number;
  readonly boundaryEdges:number;
  readonly nonManifoldEdges:number;
  readonly maximumInfluences:4;
  readonly features:readonly FacialAperture[];
}
export interface BoundedHumanFacialApertures {
  readonly geometry:THREE.BufferGeometry;
  readonly topologyIds:Uint32Array;
  readonly edgeFlow:HumanFacialEdgeFlow;
  readonly audit:FacialApertureAudit;
}

type Center={
  id:FacialApertureId;
  contour:FacialContourId;
  level:number;
  x:number;y:number;z:number;
  depth:number;
  /** Authoring preview appearance, not a skin tone replacement. */
  kind:"eye"|"nose"|"oral";
};
const key=(a:number,b:number)=>Math.min(a,b)+":"+Math.max(a,b);
const finite=(n:number)=>Number.isFinite(n);
const p=(face:HumanFacialEdgeFlow,id:FacialRegionId)=>
  new THREE.Vector3(...face.atlas.region(id).landmark.rest);
function featureCenters(face:HumanFacialEdgeFlow):readonly Center[]{
  const upper=(side:"left"|"right")=>p(face,`eyelid.upper.${side}`);
  const lower=(side:"left"|"right")=>p(face,`eyelid.lower.${side}`);
  const mouthUpper=p(face,"lip.upper"),mouthLower=p(face,"lip.lower");
  const centers:Center[]=[];
  for(const side of ["left","right"] as const){
    const up=upper(side),lo=lower(side),nares=p(face,`nostril.${side}`);
    centers.push({
      id:`orbit.${side}`,contour:`orbit.${side}`,level:.64,
      x:(up.x+lo.x)/2,y:(up.y+lo.y)/2,z:(up.z+lo.z)/2,
      depth:.010,kind:"eye",
    },{
      id:`nostril.${side}`,contour:`nostril.${side}`,level:.76,
      x:nares.x,y:nares.y,z:nares.z,
      depth:.006,kind:"nose",
    });
  }
  centers.push({
    id:"mouth",contour:"mouth",level:.67,
    x:(mouthUpper.x+mouthLower.x)/2,
    y:(mouthUpper.y+mouthLower.y)/2,
    z:(mouthUpper.z+mouthLower.z)/2,
    depth:.014,kind:"oral",
  });
  return centers.sort((a,b)=>FACIAL_APERTURE_IDS.indexOf(a.id)-FACIAL_APERTURE_IDS.indexOf(b.id));
}
type Edge={a:number;b:number};
class OwnedSurface {
  readonly positions:number[];
  readonly normals:number[];
  readonly uvs:number[];
  readonly joints:number[];
  readonly weights:number[];
  readonly colors:number[];
  readonly topologyIds:number[];
  faces:number[];
  nextTopologyId:number;
  readonly originalCount:number;

  constructor(readonly face:HumanFacialEdgeFlow){
    const g=face.geometry;
    this.positions=Array.from(g.getAttribute("position").array as ArrayLike<number>);
    this.normals=Array.from(g.getAttribute("normal").array as ArrayLike<number>);
    this.uvs=Array.from(g.getAttribute("uv").array as ArrayLike<number>);
    this.joints=Array.from(g.getAttribute("skinIndex").array as ArrayLike<number>);
    this.weights=Array.from(g.getAttribute("skinWeight").array as ArrayLike<number>);
    this.faces=Array.from(g.getIndex()!.array as ArrayLike<number>);
    this.topologyIds=Array.from(face.topologyIds);
    this.originalCount=this.topologyIds.length;
    this.nextTopologyId=Math.max(...this.topologyIds)+1;
    const oldColors=g.getAttribute("color");
    this.colors=oldColors
      ? Array.from(oldColors.array as ArrayLike<number>)
      : Array.from({length:this.originalCount*3},()=>1);
    if(this.positions.length/3!==this.topologyIds.length)
      throw new Error("C3.5 aperture source ancestry mismatch");
  }
  xyz(i:number):THREE.Vector3 {
    return new THREE.Vector3(this.positions[i*3]!,this.positions[i*3+1]!,
      this.positions[i*3+2]!);
  }
  private append(position:THREE.Vector3,uv:readonly [number,number],
    influences:readonly (readonly [number,number])[],color:readonly [number,number,number],
    topoId:number):number{
    if(!position.toArray().every(finite))
      throw new Error("C3.5 aperture nonfinite 3D vertex");
    const index=this.positions.length/3;
    this.positions.push(...position.toArray());
    this.normals.push(0,0,1);
    this.uvs.push(...uv);
    const sorted=[...influences].filter(x=>x[1]>0)
      .sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4);
    const sum=sorted.reduce((v,x)=>v+x[1],0);
    if(!(sum>0))throw new Error("C3.5 aperture unweighted inner face");
    let accumulated=0;
    for(let k=0;k<4;k++){
      this.joints.push(sorted[k]?.[0]??0);
      const w=k===3?Math.max(0,1-accumulated):(sorted[k]?.[1]??0)/sum;
      this.weights.push(w);
      accumulated+=w;
    }
    this.colors.push(...color);
    this.topologyIds.push(topoId);
    return index;
  }
  private from(i:number,position:THREE.Vector3,
    color:readonly [number,number,number],id:number):number{
    const influences:Array<[number,number]>=[];
    for(let k=0;k<4;k++)
      influences.push([this.joints[i*4+k]!,this.weights[i*4+k]!]);
    return this.append(position,
      [this.uvs[i*2]!,this.uvs[i*2+1]!],influences,color,id);
  }
  private center(vertexIds:readonly number[],position:THREE.Vector3,
    color:readonly [number,number,number],id:number):number{
    const weights=new Map<number,number>();
    let u=0,v=0;
    for(const i of vertexIds){
      u+=this.uvs[i*2]!;v+=this.uvs[i*2+1]!;
      for(let k=0;k<4;k++){
        const joint=this.joints[i*4+k]!;
        weights.set(joint,(weights.get(joint)??0)+this.weights[i*4+k]!);
      }
    }
    return this.append(position,[u/vertexIds.length,v/vertexIds.length],
      [...weights],color,id);
  }
  private add(a:number,b:number,c:number):void{
    if(a===b||b===c||a===c)throw new Error("C3.5 aperture degenerate index");
    this.faces.push(a,b,c);
  }
  private topologyEdges():Map<string,{faces:number[];edges:Edge[]}> {
    const edges=new Map<string,{faces:number[];edges:Edge[]}>();
    for(let i=0;i<this.faces.length;i+=3){
      const tri=[this.faces[i]!,this.faces[i+1]!,this.faces[i+2]!];
      for(let j=0;j<3;j++){
        const a=tri[j]!,b=tri[(j+1)%3]!;
        const k=key(this.topologyIds[a]!,this.topologyIds[b]!);
        let entry=edges.get(k);
        if(!entry){entry={faces:[],edges:[]};edges.set(k,entry);}
        entry.faces.push(i/3);entry.edges.push({a,b});
      }
    }
    return edges;
  }
  /**
   * Recover contour ancestry after other iso-lines have split it: a subsequent
   * edge midpoint remains on the old contour iff both parent IDs were on it.
   */
  private contourMembership(id:FacialContourId,level:number):Set<number>{
    const members=new Set<number>();
    for(const v of this.face.newVertices){
      if(v.contour===id && Math.abs(v.level-level)<1e-7)
        members.add(v.topologyId);
      else if(members.has(v.parentA)&&members.has(v.parentB))
        members.add(v.topologyId);
    }
    return members;
  }
  private components(members:Set<number>,
    edges:Map<string,{faces:number[];edges:Edge[]}>):number[][]{
    const links=new Map<number,Set<number>>();
    for(const entry of edges.values()){
      const {a,b}=entry.edges[0]!;
      const ca=this.topologyIds[a]!,cb=this.topologyIds[b]!;
      if(ca===cb||!members.has(ca)||!members.has(cb))continue;
      if(!links.has(ca))links.set(ca,new Set());
      if(!links.has(cb))links.set(cb,new Set());
      links.get(ca)!.add(cb);links.get(cb)!.add(ca);
    }
    const result:number[][]=[];
    const visited=new Set<number>();
    for(const start of links.keys()){
      if(visited.has(start))continue;
      const queue=[start],component:number[]=[];
      visited.add(start);
      while(queue.length){
        const current=queue.pop()!;
        component.push(current);
        for(const next of links.get(current)??[]){
          if(!visited.has(next)){visited.add(next);queue.push(next);}
        }
      }
      if(component.some(id=>links.get(id)!.size!==2))
        throw new Error("C3.5 aperture contour has missing or branching edges");
      result.push(component);
    }
    return result;
  }
  carve(center:Center):FacialAperture {
    const edges=this.topologyEdges();
    const members=this.contourMembership(center.contour,center.level);
    const components=this.components(members,edges);
    if(!components.length)
      throw new Error("C3.5 missing contour for "+center.id);
    // Find the most anterior component near the feature anchor.
    const idToFirst=new Map<number,number>();
    for(let i=0;i<this.topologyIds.length;i++)
      if(!idToFirst.has(this.topologyIds[i]!))
        idToFirst.set(this.topologyIds[i]!,i);
    const rank=(group:number[]):number=>{
      let dx=0,dy=0,dz=0;
      for(const id of group){
        const v=this.xyz(idToFirst.get(id)!);
        dx+=(v.x-center.x);dy+=(v.y-center.y);dz+=(v.z-center.z);
      }
      dx/=group.length;dy/=group.length;dz/=group.length;
      return dx*dx+dy*dy+Math.max(0,-dz)*Math.max(0,-dz)*4;
    };
    components.sort((a,b)=>rank(a)-rank(b)||a[0]!-b[0]!);
    const selected=new Set(components[0]!);
    if(selected.size<8)throw new Error("C3.5 aperture contour too sparse "+center.id);
    const boundary=new Set<string>();
    for(const [k,entry] of edges){
      const {a,b}=entry.edges[0]!;
      const ca=this.topologyIds[a]!,cb=this.topologyIds[b]!;
      if(selected.has(ca)&&selected.has(cb))boundary.add(k);
    }
    if(boundary.size!==selected.size)
      throw new Error("C3.5 aperture ring lacks a single closed boundary "+center.id);
    const incident=new Map<number,number[]>();
    for(const [k,edge] of edges){
      if(boundary.has(k))continue;
      for(const fid of edge.faces){
        const arr=incident.get(fid)??[];
        for(const other of edge.faces)
          if(other!==fid)arr.push(other);
        incident.set(fid,arr);
      }
    }
    // Find the front-facing triangle inside the projected contour.
    // The two possible floods are the small feature disk and the rest of the
    // closed body. Reject any island larger than a local face feature.
    const boundaryPositions=components[0]!.map(id=>this.xyz(idToFirst.get(id)!));
    const xMin=Math.min(...boundaryPositions.map(p=>p.x));
    const xMax=Math.max(...boundaryPositions.map(p=>p.x));
    const yMin=Math.min(...boundaryPositions.map(p=>p.y));
    const yMax=Math.max(...boundaryPositions.map(p=>p.y));
    const zMax=Math.max(...boundaryPositions.map(p=>p.z));
    let seed=-1,best=Infinity;
    for(let fid=0;fid<this.faces.length/3;fid++){
      const i=fid*3,tri=[this.faces[i]!,this.faces[i+1]!,this.faces[i+2]!];
      const a=this.xyz(tri[0]!),b=this.xyz(tri[1]!),c=this.xyz(tri[2]!);
      const centroid=a.add(b).add(c).multiplyScalar(1/3);
      if(centroid.x<=xMin||centroid.x>=xMax||
         centroid.y<=yMin||centroid.y>=yMax||
         centroid.z<zMax-.025)continue;
      if(tri.every(v=>selected.has(this.topologyIds[v]!)))continue;
      const score=(centroid.x-center.x)**2+(centroid.y-center.y)**2+
        Math.max(0,zMax-centroid.z)**2*.5;
      if(score<best){best=score;seed=fid;}
    }
    if(seed<0)throw new Error("C3.5 cannot find a source-face aperture disk "+center.id);
    const removed=new Set<number>();
    const queue=[seed];
    while(queue.length){
      const fid=queue.pop()!;
      if(removed.has(fid))continue;
      removed.add(fid);
      if(removed.size>1800)
        throw new Error("C3.5 aperture would consume non-local anatomy "+center.id);
      for(const other of incident.get(fid)??[])
        if(!removed.has(other))queue.push(other);
    }
    const walls:Edge[]=[];
    for(const k of boundary){
      const entry=edges.get(k)!;
      if(entry.faces.length!==2)
        throw new Error("C3.5 aperture target is not manifold "+center.id);
      const inside=entry.faces.filter(fid=>removed.has(fid));
      if(inside.length!==1)
        throw new Error("C3.5 aperture contour did not enclose a disk "+center.id);
      walls.push(entry.edges[entry.faces.findIndex(fid=>!removed.has(fid))]!);
    }
    if(walls.length!==boundary.size)
      throw new Error("C3.5 aperture missing exterior boundary edges");
    const keep:number[]=[];
    for(let i=0;i<this.faces.length;i+=3){
      if(!removed.has(i/3))keep.push(this.faces[i]!,this.faces[i+1]!,this.faces[i+2]!);
    }
    this.faces=keep;
    const innerA=new Map<number,number>(),innerB=new Map<number,number>();
    const ringA=new Map<number,number>(),ringB=new Map<number,number>();
    const first=new Map<number,number>();
    const colorA:[number,number,number]=center.kind==="eye"?
      [.72,.58,.57]:[.63,.43,.44];
    const colorB:[number,number,number]=center.kind==="eye"?
      [.19,.18,.20]:[.22,.095,.105];
    for(const wall of walls){
      for(const v of [wall.a,wall.b]){
        const id=this.topologyIds[v]!;
        if(!innerA.has(id))innerA.set(id,this.nextTopologyId++);
        if(!innerB.has(id))innerB.set(id,this.nextTopologyId++);
        if(first.has(id))continue;
        first.set(id,v);
      }
    }
    const rim=(v:number,ring:1|2):number=>{
      const cache=ring===1?ringA:ringB;
      const already=cache.get(v);
      if(already!==undefined)return already;
      const old=this.xyz(v);
      const factor=ring===1?.06:.34;
      const depth=center.depth*(ring===1?.24:1);
      old.x+=(center.x-old.x)*factor;
      old.y+=(center.y-old.y)*factor;
      old.z-=depth;
      const id=this.topologyIds[v]!;
      const value=this.from(v,old,ring===1?colorA:colorB,
        (ring===1?innerA:innerB).get(id)!);
      cache.set(v,value);
      return value;
    };
    const innermost:number[]=[];
    for(const {a,b} of walls){
      const a1=rim(a,1),b1=rim(b,1),a2=rim(a,2),b2=rim(b,2);
      this.add(b,a,a1);this.add(b,a1,b1);
      this.add(b1,a1,a2);this.add(b1,a2,b2);
      innermost.push(a2,b2);
    }
    const uniqueInner=[...new Set(innermost)];
    const terminal=new THREE.Vector3(center.x,center.y,
      Math.min(...uniqueInner.map(i=>this.positions[i*3+2]!))-.001);
    const centerIndex=this.center(uniqueInner,terminal,
      center.kind==="eye"?[.08,.07,.09]:[.10,.045,.052],
      this.nextTopologyId++);
    for(const {a,b} of walls)
      this.add(rim(b,2),rim(a,2),centerIndex);
    return Object.freeze({
      id:center.id,boundaryVertices:selected.size,
      removedTriangles:removed.size,wallTriangles:walls.length*5,
      depthMeters:center.depth,
      sourceTopologyIds:Object.freeze([...selected].sort((a,b)=>a-b)),
      centerVertex:centerIndex,
    });
  }
  output():THREE.BufferGeometry{
    const normals=new Float64Array(this.nextTopologyId*3);
    for(let i=0;i<this.faces.length;i+=3){
      const a=this.faces[i]!,b=this.faces[i+1]!,c=this.faces[i+2]!;
      const cross=this.xyz(b).sub(this.xyz(a)).cross(this.xyz(c).sub(this.xyz(a)));
      if(cross.lengthSq()<1e-20)
        throw new Error("C3.5 facial aperture created a zero-area triangle");
      for(const id of [a,b,c]){
        const offset=this.topologyIds[id]!*3;
        normals[offset]=normals[offset]!+cross.x;
        normals[offset+1]=normals[offset+1]!+cross.y;
        normals[offset+2]=normals[offset+2]!+cross.z;
      }
    }
    for(let i=0;i<this.topologyIds.length;i++){
      const offset=this.topologyIds[i]!*3;
      const norm=new THREE.Vector3(normals[offset]!,normals[offset+1]!,
        normals[offset+2]!);
      if(norm.lengthSq()<1e-20) {
        // A bounded carved disk leaves old source vertices unreferenced.
        // Keep their original finite normals rather than changing source IDs.
        if(i>=this.originalCount)
          throw new Error("C3.5 aperture isolated generated vertex");
        const previous=new THREE.Vector3(this.normals[i*3]!,
          this.normals[i*3+1]!,this.normals[i*3+2]!);
        if(previous.lengthSq()<1e-20)
          throw new Error("C3.5 aperture source vertex lost original normal");
        continue;
      }
      norm.normalize();
      this.normals[i*3]=norm.x;this.normals[i*3+1]=norm.y;this.normals[i*3+2]=norm.z;
    }
    const geo=new THREE.BufferGeometry();
    geo.setIndex(this.faces);
    geo.setAttribute("position",new THREE.Float32BufferAttribute(this.positions,3));
    geo.setAttribute("normal",new THREE.Float32BufferAttribute(this.normals,3));
    geo.setAttribute("uv",new THREE.Float32BufferAttribute(this.uvs,2));
    geo.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(this.joints,4));
    geo.setAttribute("skinWeight",new THREE.Float32BufferAttribute(this.weights,4));
    geo.setAttribute("color",new THREE.Float32BufferAttribute(this.colors,3));
    geo.computeBoundingBox();geo.computeBoundingSphere();
    return geo;
  }
  topologyAudit():{boundaryEdges:number;nonManifoldEdges:number}{
    const edges=this.topologyEdges();
    let boundaryEdges=0,nonManifoldEdges=0;
    for(const e of edges.values()){
      if(e.faces.length===1)boundaryEdges++;
      if(e.faces.length!==2)nonManifoldEdges++;
    }
    return {boundaryEdges,nonManifoldEdges};
  }
}
/** Apply all five bounded, inward-facing facial pockets deterministically. */
export function buildHumanFacialApertures(
  human:AnatomicalHuman,
):BoundedHumanFacialApertures{
  const original=human.template.geometry;
  const flow=buildHumanFacialEdgeFlow(human);
  let geometry:THREE.BufferGeometry|undefined;
  const material=human.mesh.material as THREE.MeshStandardMaterial;
  const oldVertexColors=material.vertexColors;
  try{
    const surface=new OwnedSurface(flow);
    const features=featureCenters(flow).map(center=>surface.carve(center));
    const topology=surface.topologyAudit();
    if(topology.boundaryEdges!==0||topology.nonManifoldEdges!==0)
      throw new Error("C3.5 facial aperture compromised closed manifold anatomy");
    geometry=surface.output();
    if(geometry.getAttribute("position").count>60000 ||
       geometry.getIndex()!.count/3>110000)
      throw new Error("C3.5 facial aperture exceeded browser geometry budget");
    human.mesh.geometry=geometry;
    material.vertexColors=true;material.needsUpdate=true;
    validateSkinningSpike(human.spike);
    const audit:FacialApertureAudit=Object.freeze({
      version:1,
      beforeVertices:original.getAttribute("position").count,
      afterVertices:geometry.getAttribute("position").count,
      beforeTriangles:original.getIndex()!.count/3,
      afterTriangles:geometry.getIndex()!.count/3,
      apertureCount:features.length,
      boundaryEdges:topology.boundaryEdges,
      nonManifoldEdges:topology.nonManifoldEdges,
      maximumInfluences:4,
      features:Object.freeze(features),
    });
    flow.geometry.dispose();
    return Object.freeze({
      geometry,topologyIds:Uint32Array.from(surface.topologyIds),
      edgeFlow:flow,audit,
    });
  }catch(error){
    human.mesh.geometry=original;
    material.vertexColors=oldVertexColors;material.needsUpdate=true;
    geometry?.dispose();flow.geometry.dispose();
    throw error;
  }
}
