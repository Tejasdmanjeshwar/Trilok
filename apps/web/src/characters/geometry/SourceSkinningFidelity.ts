import * as THREE from "three";

/**
 * Recovers full-source linear-blend skinning for overloaded imported shoulder
 * vertices while retaining the standard four GPU influences. At each posed
 * frame, solve the four-owner affine blend for the bind-space point that gives
 * the original unpruned source result. This is a constant-size 4x4 inverse,
 * NOT an iterative pose optimizer or an animation-specific correction.
 *
 * Only source-overloaded render vertices are touched; topology, seam copies,
 * skin indices/weights, native morph targets and canonical bones are retained.
 */
export class SourceSkinningFidelity {
  private readonly mesh:THREE.SkinnedMesh;
  private readonly rows:readonly {
    readonly renderId:number;
    readonly owners:readonly (readonly [number,number])[];
    base:THREE.Vector3;
    last:THREE.Vector3|undefined;
  }[];
  private position:THREE.BufferAttribute|undefined;
  private readonly matrices:THREE.Matrix4[];
  private readonly blended=new THREE.Matrix4();
  private readonly bindPoint=new THREE.Vector3();
  private readonly goal=new THREE.Vector3();
  private readonly candidate=new THREE.Vector3();
  private readonly morphOffset=new THREE.Vector3();
  private readonly working=new THREE.Vector3();
  private disposed=false;
  private updated=0;
  private rejected=0;

  constructor(mesh:THREE.SkinnedMesh,sourceVertexIds:Uint32Array,
    fullSourceWeights:ReadonlyMap<number,ReadonlyMap<number,number>>) {
    this.mesh=mesh;
    const position=mesh.geometry.getAttribute("position");
    if(!(position instanceof THREE.BufferAttribute)||
       position.itemSize!==3||position.count!==sourceVertexIds.length)
      throw new Error("Invalid source-fidelity render coordinates");
    this.matrices=mesh.skeleton.bones.map(()=>new THREE.Matrix4());
    this.rows=[];
    for(let i=0;i<sourceVertexIds.length;i++){
      const weights=fullSourceWeights.get(sourceVertexIds[i]!);
      if(!weights||weights.size<=4)continue;
      const owners=[...weights].sort((a,b)=>a[0]-b[0]);
      const total=owners.reduce((sum,[,w])=>sum+w,0);
      if(!Number.isFinite(total)||total<=0||
        owners.some(([index,w])=>!Number.isSafeInteger(index)||index<0||
          index>=this.matrices.length||!Number.isFinite(w)||w<=0))
        throw new Error("Invalid overloaded source skin owners");
      this.rows.push({renderId:i,owners:owners.map(([index,w])=>
        [index,w/total] as const),base:new THREE.Vector3(),last:undefined});
    }
  }

  /** Can be called explicitly by a CPU test or from SkinnedMesh.onBeforeRender.
   * A changed position attribute is treated as a source morphology edit, not
   * as an accumulated correction. Bone matrices must be world-updated first. */
  update():void {
    if(this.disposed)throw new Error("Disposed source skin fidelity");
    if(!this.rows.length)return;
    const geometry=this.mesh.geometry;
    const position=geometry.getAttribute("position");
    const index=geometry.getAttribute("skinIndex");
    const weight=geometry.getAttribute("skinWeight");
    if(!(position instanceof THREE.BufferAttribute)||
      !index||!weight||index.itemSize!==4||weight.itemSize!==4)
      throw new Error("Source skin fidelity attributes changed unexpectedly");
    if(position!==this.position){
      this.position=position;
      for(const row of this.rows)row.last=undefined;
    }
    const bones=this.mesh.skeleton.bones;
    const inverses=this.mesh.skeleton.boneInverses;
    for(let i=0;i<bones.length;i++)
      this.matrices[i]!.multiplyMatrices(bones[i]!.matrixWorld,inverses[i]!);
    const morphs=geometry.morphAttributes.position??[];
    const influences=this.mesh.morphTargetInfluences??[];
    let changed=false;
    for(const row of this.rows){
      const id=row.renderId;
      this.working.fromBufferAttribute(position,id);
      if(!row.last||!this.working.equals(row.last))
        row.base.copy(this.working);
      this.morphOffset.set(0,0,0);
      for(let j=0;j<morphs.length;j++){
        const amount=influences[j]??0;
        if(!amount)continue;
        this.candidate.fromBufferAttribute(morphs[j]!,id);
        if(!geometry.morphTargetsRelative)this.candidate.sub(row.base);
        this.morphOffset.addScaledVector(this.candidate,amount);
      }
      this.bindPoint.copy(row.base).add(this.morphOffset)
        .applyMatrix4(this.mesh.bindMatrix);
      this.goal.set(0,0,0);
      for(const [boneId,w] of row.owners){
        this.candidate.copy(this.bindPoint).applyMatrix4(this.matrices[boneId]!);
        this.goal.addScaledVector(this.candidate,w);
      }
      const elements=this.blended.elements;
      elements.fill(0);
      for(let j=0;j<4;j++){
        const w=weight.getComponent(id,j);
        if(w===0)continue;
        const boneId=index.getComponent(id,j);
        const source=this.matrices[boneId]?.elements;
        if(!source)throw new Error("Invalid compressed shoulder skin owner");
        for(let k=0;k<16;k++)elements[k]!+=w*source[k]!;
      }
      // Do not amplify an ill-conditioned inverse into a huge outlier.
      const det=this.blended.determinant();
      if(!Number.isFinite(det)||Math.abs(det)<1e-8){
        this.rejected++;
        this.candidate.copy(row.base);
      }else{
        this.blended.invert();
        this.candidate.copy(this.goal).applyMatrix4(this.blended)
          .applyMatrix4(this.mesh.bindMatrixInverse)
          .sub(this.morphOffset);
        if(!this.candidate.toArray().every(Number.isFinite))
          throw new Error("Nonfinite full-source skin compensation");
      }
      if(!this.working.equals(this.candidate)){
        position.setXYZ(id,this.candidate.x,this.candidate.y,this.candidate.z);
        changed=true;this.updated++;
      }
      if(!row.last)row.last=new THREE.Vector3();
      row.last.copy(this.candidate);
    }
    if(changed)position.needsUpdate=true;
  }
  snapshot():Readonly<{renderVertices:number;vertexWrites:number;singularFallbacks:number}>{
    return {renderVertices:this.rows.length,vertexWrites:this.updated,
      singularFallbacks:this.rejected};
  }
  dispose():void {
    if(this.disposed)return;
    this.disposed=true;
    if(this.position){
      for(const row of this.rows)
        this.position.setXYZ(row.renderId,row.base.x,row.base.y,row.base.z);
      this.position.needsUpdate=true;
    }
    this.mesh.onBeforeRender=()=>{};
  }
}
