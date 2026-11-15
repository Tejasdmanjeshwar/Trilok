import * as THREE from "three";
import type {StudioHumanModel} from "./StudioHumanModel";

/**
 * A small, disposable-by-GC torso volume built from the actual morphed
 * MakeHuman skin, never the chest/pelvis joint positions or generator knobs.
 *
 * Cross sections are deliberately conservative envelopes of source-skinned
 * torso vertices. Each section follows its source torso bone, so legal spine
 * flexion/rotation is included in IK evaluations. The volume is calibrated
 * once per solve (and therefore regenerated after each body/pose rebuild).
 * No per-iteration full-mesh query, BVH dependency or mutable global cache.
 */
export interface BodyClearance {
  readonly minimumMeters:number;
  readonly maximumPenetrationMeters:number;
  readonly penalties:readonly number[];
}
export type BodyCollisionWeapon="longsword"|"staff";
export interface BodyCollisionDimensions {
  readonly scale:number;
  readonly handleLength:number;
  readonly bladeLength:number;
  readonly shaftLength:number;
  readonly guardWidth:number;
  readonly radius:number;
}
type Section={
  readonly y:number;readonly halfHeight:number;
  readonly cx:number;readonly cz:number;
  readonly rx:number;readonly rz:number;
  readonly carrier:0|1;
};
type Probe={readonly point:THREE.Vector3;readonly radius:number};

const boneByRole=(model:StudioHumanModel,role:string):THREE.Bone=>{
  const joint=model.human.spike.graph.joints.find(j=>j.role===role);
  const bone=joint&&model.human.spike.bones.get(joint.id);
  if(!bone)throw new Error("Missing anatomical collision bone: "+role);
  return bone;
};
const boneWorld=(bone:THREE.Bone)=>bone.getWorldPosition(new THREE.Vector3());

/** This helper also makes the calibrated occupied surface independently
 * inspectable by regression tests, including the belly bulge of real recipes. */
export class StudioBodyCollision {
  private readonly sections:readonly Section[];
  private readonly carriers:readonly THREE.Bone[];
  private readonly bindMatrices:readonly THREE.Matrix4[];
  private readonly bindRootInverse:THREE.Matrix4;
  readonly sourceVertices:number;

  constructor(model:StudioHumanModel){
    const {mesh,spike,template}=model.human;
    spike.character.root.updateWorldMatrix(true,true);
    mesh.updateWorldMatrix(true,false);
    const root=spike.character.root;
    this.bindRootInverse=root.matrixWorld.clone().invert();
    const lower=boneByRole(model,"spine_lower");
    const chest=boneByRole(model,"chest");
    this.carriers=[lower,chest];
    this.bindMatrices=this.carriers.map(b=>b.matrixWorld.clone());
    const pelvisY=root.worldToLocal(boneWorld(boneByRole(model,"pelvis"))).y;
    const lowerY=root.worldToLocal(boneWorld(lower)).y;
    const chestY=root.worldToLocal(boneWorld(chest)).y;
    const height=Math.max(.12,chestY-pelvisY);
    const lo=pelvisY-height*.12,hi=chestY+height*.20;
    const layers=16,step=(hi-lo)/(layers-1);
    const halfHeight=step*1.1;
    const bins=Array.from({length:layers},(_,i)=>({
      y:lo+i*step,minX:Infinity,maxX:-Infinity,
      minZ:Infinity,maxZ:-Infinity,count:0,
    }));
    const position=mesh.geometry.getAttribute("position");
    const indices=mesh.geometry.getAttribute("skinIndex");
    const weights=mesh.geometry.getAttribute("skinWeight");
    if(!position||!indices||!weights||indices.count!==position.count||
       weights.count!==position.count)
      throw new Error("Missing morphed torso skin attributes");
    const torsoIds=new Set<number>();
    for(const joint of spike.graph.joints){
      if(["pelvis","spine_lower","chest"].includes(joint.role)){
        const index=spike.skeleton.bones.indexOf(spike.bones.get(joint.id)!);
        if(index>=0)torsoIds.add(index);
      }
    }
    if(torsoIds.size!==3)throw new Error("Incomplete calibrated torso skin");
    const used=new Set<number>(),point=new THREE.Vector3();
    let accepted=0;
    for(let i=0;i<position.count;i++){
      const sourceId=template.sourceVertexIds[i]!;
      if(used.has(sourceId))continue;
      used.add(sourceId);
      let influence=0;
      for(let k=0;k<4;k++){
        if(torsoIds.has(indices.getComponent(i,k)))
          influence+=weights.getComponent(i,k);
      }
      if(influence<.45)continue;
      // Actual skin, not the neutral skeleton or an assumed radial body size.
      mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld)
        .applyMatrix4(this.bindRootInverse);
      if(!point.toArray().every(Number.isFinite))throw new Error("Nonfinite torso skin");
      accepted++;
      for(const bin of bins){
        if(Math.abs(point.y-bin.y)>halfHeight)continue;
        bin.minX=Math.min(bin.minX,point.x);
        bin.maxX=Math.max(bin.maxX,point.x);
        bin.minZ=Math.min(bin.minZ,point.z);
        bin.maxZ=Math.max(bin.maxZ,point.z);
        bin.count++;
      }
    }
    if(accepted<150)throw new Error("Insufficient source torso skin coverage");
    const scale=Math.max(.35,Math.min(1.4,height/.44));
    const sections:Section[]=[];
    for(const bin of bins){
      if(bin.count<8)continue;
      const rx=(bin.maxX-bin.minX)/2;
      const rz=(bin.maxZ-bin.minZ)/2;
      if(rx<.015*scale||rz<.015*scale)continue;
      sections.push(Object.freeze({
        y:bin.y,halfHeight,
        cx:(bin.maxX+bin.minX)/2,
        cz:(bin.maxZ+bin.minZ)/2,
        rx:rx+.004*scale,rz:rz+.004*scale,
        carrier:bin.y<(lowerY+chestY)*.5?0:1,
      }));
    }
    if(sections.length<10)throw new Error("Incomplete anatomical torso envelope");
    this.sections=Object.freeze(sections);
    this.sourceVertices=accepted;
  }

  /**
   * Signed clearance to the union of morphed torso slices; negative is inside.
   * One bone-relative inverse transform per section carrier, then only a few
   * scalar operations per probe. This never changes skin or FK state.
   */
  private transforms():readonly THREE.Matrix4[]{
    return this.carriers.map((bone,i)=>
      this.bindRootInverse.clone().multiply(this.bindMatrices[i]!)
        .multiply(bone.matrixWorld.clone().invert()));
  }
  clearance(point:THREE.Vector3):number{
    const matrices=this.transforms();
    return this.distance(point,matrices);
  }
  private distance(point:THREE.Vector3,transforms:readonly THREE.Matrix4[]):number{
    const local=[
      point.clone().applyMatrix4(transforms[0]!),
      point.clone().applyMatrix4(transforms[1]!),
    ];
    let closest=Infinity;
    for(const s of this.sections){
      const p=local[s.carrier]!;
      const dx=(p.x-s.cx)/s.rx,dz=(p.z-s.cz)/s.rz;
      // The ellipse encloses the actual convex torso cross-section at each
      // height, including forward abdominal growth in the generated skin.
      const radial=(Math.hypot(dx,dz)-1)*Math.min(s.rx,s.rz);
      const vertical=Math.abs(p.y-s.y)-s.halfHeight;
      const signed=Math.max(radial,vertical);
      closest=Math.min(closest,signed);
    }
    return closest;
  }
  /** Sample every solid weapon primitive, hand and forearm capsule.
   * All probes are fixed-count: deterministic least-squares residuals.
   * The first half of a sword blade is included near the torso.
   */
  measure(model:StudioHumanModel,weapon:THREE.Matrix4,
    kind:BodyCollisionWeapon,dim:BodyCollisionDimensions):BodyClearance{
    const transforms=this.transforms();
    const probes:Probe[]=[];
    const put=(point:THREE.Vector3,radius:number)=>
      probes.push({point,radius});
    const weaponPoint=(x:number,y:number,z=0)=>
      new THREE.Vector3(x,y,z).applyMatrix4(weapon);
    const line=(a:THREE.Vector3,b:THREE.Vector3,radius:number,count:number)=>{
      for(let i=0;i<=count;i++)
        put(a.clone().lerp(b,i/count),radius);
    };
    const r=dim.radius;
    if(kind==="longsword"){
      const half=dim.handleLength*.5;
      line(weaponPoint(0,-half),weaponPoint(0,half),r,10);
      put(weaponPoint(0,-half-r*.8),r*1.75);
      const guardY=half+r*.55;
      line(weaponPoint(-dim.guardWidth*.5,guardY),
        weaponPoint(dim.guardWidth*.5,guardY),r*1.4,10);
      const base=guardY+r*1.1;
      line(weaponPoint(0,base),weaponPoint(0,base+
        Math.min(dim.bladeLength,.24*dim.scale)),r*1.75,8);
    }else{
      line(weaponPoint(0,-dim.shaftLength*.5),
        weaponPoint(0,dim.shaftLength*.5),r*1.2,24);
    }
    for(const hand of ["left","right"] as const){
      const get=(role:string)=>boneWorld(boneByRole(model,role+"_"+hand));
      const elbow=get("elbow"),wrist=get("wrist"),palm=get("palm");
      line(elbow,wrist,.027*dim.scale,8);
      put(palm,.025*dim.scale);
      // Source index/little knuckle span approximates the outer grasp volume,
      // while the solver's separate finger-skin fit owns hilt contact.
      const finger=(role:string)=>{
        const joint=model.human.spike.graph.joints.find(j=>
          j.role===role&&j.id.includes("arm["+hand+",0]"));
        const bone=joint&&model.human.spike.bones.get(joint.id);
        if(!bone)throw new Error("Missing source finger collision landmark");
        return boneWorld(bone);
      };
      const first=finger("finger_index_0");
      const last=finger("finger_little_0");
      if(first.distanceTo(last)<.30*dim.scale){
        put(first,.012*dim.scale);put(last,.012*dim.scale);
      }
    }
    const penalties:number[]=[];
    let minimum=Infinity,maximumPenetration=0;
    for(const probe of probes){
      const signed=this.distance(probe.point,transforms)-probe.radius;
      minimum=Math.min(minimum,signed);
      const penetration=Math.max(0,.003*dim.scale-signed);
      penalties.push(penetration);
      maximumPenetration=Math.max(maximumPenetration,penetration);
    }
    return {minimumMeters:minimum,maximumPenetrationMeters:maximumPenetration,
      penalties:Object.freeze(penalties)};
  }
}
