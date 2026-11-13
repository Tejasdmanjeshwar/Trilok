import * as THREE from "three";
import type {FacialRegionId} from "./FacialTopology";
import type {HumanFacialSourceSurface} from "./FacialSourceTopology";

/**
 * Editable C3.5 facial controls. Re-applies offsets against the immutable rest
 * snapshot on every input so a slider does not accumulate drift. Also exposes
 * the same triangle-winding criterion as the C3.5 stress regression.
 *
 * This is a surface-local control preview, not a new C1 joint, production
 * expression animation or C3.6 stored morph target. Do not use its
 * inverted-face diagnostics as a substitute for visual anatomical review.
 */
export type FacialControlOffset = readonly [
  FacialRegionId, readonly [number,number,number]
];
export interface FacialControlMetrics {
  readonly displacedVertices:number;
  readonly maxDisplacementMeters:number;
  readonly invertedTriangles:number;
  readonly seamErrorMeters:number;
  readonly minAreaRatio:number;
  readonly maxEdgeRatio:number;
  readonly invertedTriangleIndices:readonly number[];
}
export class FacialControlPreview {
  private readonly geometry:THREE.BufferGeometry;
  private readonly neutral:Float32Array;
  private readonly neutralNormals:Float32Array;
  private readonly weights=new Map<FacialRegionId,Float32Array>();
  private readonly indices:THREE.BufferAttribute|THREE.InterleavedBufferAttribute;
  private disposed=false;

  constructor(private readonly face:HumanFacialSourceSurface) {
    this.geometry=face.geometry;
    this.neutral=Float32Array.from(this.geometry.getAttribute("position").array as ArrayLike<number>);
    this.neutralNormals=Float32Array.from(this.geometry.getAttribute("normal").array as ArrayLike<number>);
    const idx=this.geometry.getIndex();
    if(!idx)throw new Error("C3.5 facial controls require indexed geometry");
    this.indices=idx;
  }
  private regionWeights(id:FacialRegionId):Float32Array {
    const existing=this.weights.get(id);
    if(existing)return existing;
    const result=this.face.controlWeights(id);
    this.weights.set(id,result);
    return result;
  }
  apply(offsets:readonly FacialControlOffset[]):FacialControlMetrics {
    if(this.disposed)throw new Error("C3.5 facial control preview is disposed");
    const position=this.geometry.getAttribute("position");
    const next=Float64Array.from(this.neutral);
    let displacedVertices=0,maxDisplacementMeters=0;
    const prepared=offsets.map(([id,vector])=>{
      if(vector.some(v=>!Number.isFinite(v)||Math.abs(v)>.04))
        throw new Error("C3.5 facial control shift exceeds ±40 mm");
      return {weights:this.regionWeights(id),vector};
    });
    for(let i=0;i<position.count;i++){
      let dx=0,dy=0,dz=0;
      for(const {weights,vector} of prepared){
        const weight=weights[i]!;
        dx+=weight*vector[0];dy+=weight*vector[1];dz+=weight*vector[2];
      }
      const change=Math.hypot(dx,dy,dz);
      if(change>1e-9)displacedVertices++;
      maxDisplacementMeters=Math.max(maxDisplacementMeters,change);
      next[i*3]=next[i*3]!+dx;
      next[i*3+1]=next[i*3+1]!+dy;
      next[i*3+2]=next[i*3+2]!+dz;
    }
    const index=this.indices;
    const inverted:number[]=[];
    const canonicalNormals=new Float64Array(
      (Math.max(...this.face.topologyIds)+1)*3);
    const ax=new THREE.Vector3(),ay=new THREE.Vector3();
    const bx=new THREE.Vector3(),by=new THREE.Vector3();
    let minAreaRatio=Infinity,maxEdgeRatio=0;
    for(let i=0;i<index.count;i+=3){
      const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
      ax.set(this.neutral[b*3]!-this.neutral[a*3]!,
        this.neutral[b*3+1]!-this.neutral[a*3+1]!,
        this.neutral[b*3+2]!-this.neutral[a*3+2]!);
      ay.set(this.neutral[c*3]!-this.neutral[a*3]!,
        this.neutral[c*3+1]!-this.neutral[a*3+1]!,
        this.neutral[c*3+2]!-this.neutral[a*3+2]!);
      bx.set(next[b*3]!-next[a*3]!,next[b*3+1]!-next[a*3+1]!,
        next[b*3+2]!-next[a*3+2]!);
      by.set(next[c*3]!-next[a*3]!,next[c*3+1]!-next[a*3+1]!,
        next[c*3+2]!-next[a*3+2]!);
      const rest=ax.cross(ay),deformed=bx.cross(by);
      const originalArea=rest.length();
      if(originalArea<1e-12)throw new Error("C3.5 original triangle is degenerate");
      minAreaRatio=Math.min(minAreaRatio,deformed.length()/originalArea);
      if(rest.dot(deformed)<=0)inverted.push(i/3);
      for(const v of [a,b,c]){
        const o=this.face.topologyIds[v]!*3;
        canonicalNormals[o]=canonicalNormals[o]!+deformed.x;
        canonicalNormals[o+1]=canonicalNormals[o+1]!+deformed.y;
        canonicalNormals[o+2]=canonicalNormals[o+2]!+deformed.z;
      }
      for(const [u,v] of [[a,b],[b,c],[c,a]] as const){
        const oldDist=Math.hypot(
          this.neutral[u*3]!-this.neutral[v*3]!,
          this.neutral[u*3+1]!-this.neutral[v*3+1]!,
          this.neutral[u*3+2]!-this.neutral[v*3+2]!);
        if(oldDist>1e-9){
          const newDist=Math.hypot(
            next[u*3]!-next[v*3]!,next[u*3+1]!-next[v*3+1]!,
            next[u*3+2]!-next[v*3+2]!);
          maxEdgeRatio=Math.max(maxEdgeRatio,newDist/oldDist);
        }
      }
    }
    const firstPosition=new Map<number,readonly [number,number,number]>();
    let seamErrorMeters=0;
    for(let i=0;i<position.count;i++){
      const id=this.face.topologyIds[i]!;
      const pos=[next[i*3]!,next[i*3+1]!,next[i*3+2]!] as const;
      const old=firstPosition.get(id);
      if(old)seamErrorMeters=Math.max(seamErrorMeters,
        Math.hypot(pos[0]-old[0],pos[1]-old[1],pos[2]-old[2]));
      else firstPosition.set(id,pos);
    }
    // Commit positions only after all diagnostics succeed.
    const normals=this.geometry.getAttribute("normal");
    for(let i=0;i<position.count;i++){
      position.setXYZ(i,next[i*3]!,next[i*3+1]!,next[i*3+2]!);
      const offset=this.face.topologyIds[i]!*3;
      const n=new THREE.Vector3(canonicalNormals[offset]!,
        canonicalNormals[offset+1]!,canonicalNormals[offset+2]!);
      if(n.lengthSq()>1e-20)n.normalize();
      else n.set(this.neutralNormals[i*3]!,
        this.neutralNormals[i*3+1]!,this.neutralNormals[i*3+2]!);
      normals.setXYZ(i,n.x,n.y,n.z);
    }
    position.needsUpdate=true;normals.needsUpdate=true;
    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();
    return {
      displacedVertices,maxDisplacementMeters,
      invertedTriangles:inverted.length,
      invertedTriangleIndices:inverted,
      seamErrorMeters,minAreaRatio,maxEdgeRatio,
    };
  }
  /** A highlighting overlay has independent index/geometry ownership and
   * shares the same live positions, skin and skeleton for exact FK tracking. */
  makeFailureOverlay(mesh:THREE.SkinnedMesh,indices:readonly number[]):THREE.SkinnedMesh {
    if(this.disposed)throw new Error("Disposed facial control preview");
    const g=new THREE.BufferGeometry();
    const source=this.geometry.getIndex()!;
    const tris:number[]=[];
    for(const tri of indices){
      const i=tri*3;
      tris.push(source.getX(i),source.getX(i+1),source.getX(i+2));
    }
    g.setIndex(tris);
    for(const name of ["position","skinIndex","skinWeight"] as const)
      g.setAttribute(name,this.geometry.getAttribute(name));
    g.computeBoundingSphere();
    const material=new THREE.MeshBasicMaterial({
      color:0xff3333,side:THREE.DoubleSide,transparent:true,
      opacity:.78,polygonOffset:true,polygonOffsetFactor:-2,
      polygonOffsetUnits:-2,depthWrite:false,
    });
    const overlay=new THREE.SkinnedMesh(g,material);
    overlay.name="C3.5 inverted face warning";
    overlay.frustumCulled=false;
    overlay.renderOrder=mesh.renderOrder+3;
    overlay.bind(mesh.skeleton,mesh.bindMatrix.clone());
    overlay.bindMode=mesh.bindMode;
    overlay.position.copy(mesh.position);
    overlay.quaternion.copy(mesh.quaternion);
    overlay.scale.copy(mesh.scale);
    return overlay;
  }
  dispose():void {this.disposed=true;this.weights.clear();}
}
