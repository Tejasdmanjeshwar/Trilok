import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {StudioPosePreview} from "../apps/web/src/studio/StudioPosePreview";
import {type ArcheryState,type ArcheryPoseResult} from "../apps/web/src/studio/StudioArchery";
import {mirrorSourceRotationX} from "../apps/web/src/studio/StudioMakeHumanArcherRetarget";

/** Character-local sagittal reflection M=diag(-1,1,1). */
const reflect=(p:THREE.Vector3)=>new THREE.Vector3(-p.x,p.y,p.z);
const radToDeg=THREE.MathUtils.radToDeg;
const mm=(m:number)=>+(m*1000).toFixed(3);
const deg=(r:number)=>+radToDeg(r).toFixed(3);
const PARTS=["clavicle","shoulder","elbow","wrist","palm"] as const;
const DIGITS=["thumb","index","middle","ring","little"] as const;
type Side="left"|"right";
type PoseSnapshot={
  joints:ReadonlyMap<string,{p:THREE.Vector3;q:THREE.Quaternion}>;
  bow:THREE.Matrix4;nock:THREE.Vector3;contact:THREE.Vector3;
  arrow:THREE.Vector3;pitch:number;yaw:number;
  draw:number;fraction:number;error:number;bowError:number;
  skin:ArcheryPoseResult["drawingSkinGapsMeters"];reachable:boolean;
};
const roleIds=(side:Side)=>[
  ...PARTS.map(part=>part+"_"+side),
  ...DIGITS.flatMap(digit=>Array.from({length:digit==="thumb"?2:3},
    (_,i)=>"finger_"+digit+"_"+i)),
];
function joint(model:ReturnType<typeof make>["model"],role:string,side:Side){
  const j=model.human.spike.graph.joints.find(j=>j.role===role&&
    (role.startsWith("finger_")?j.id.includes("arm["+side+",0]"):true));
  if(!j)throw new Error("Missing source symmetry joint: "+role+"/"+side);
  const b=model.human.spike.bones.get(j.id);
  if(!b)throw new Error("Missing source symmetry bone: "+role+"/"+side);
  return b;
}
function capture(model:ReturnType<typeof make>["model"],pose:StudioPosePreview,
  side:Side):PoseSnapshot{
  const result=pose.bowPoseResult!;
  model.human.spike.character.root.updateWorldMatrix(true,true);
  const root=model.human.spike.character.root;
  const inv=root.matrixWorld.clone().invert();
  const rootQuat=root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const joints=new Map<string,{p:THREE.Vector3;q:THREE.Quaternion}>();
  for(const role of roleIds(side)){
    const b=joint(model,role,side);
    const key=role.replace(/_(left|right)$/, "");
    joints.set(key,{p:b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv),
      q:rootQuat.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()))});
  }
  const arrow=result.arrowDirectionWorld.clone().transformDirection(inv);
  return {joints,bow:inv.clone().multiply(result.bowWorld),
    nock:result.nockWorld.clone().applyMatrix4(inv),
    contact:result.drawContactWorld.clone().applyMatrix4(inv),
    arrow,pitch:Math.asin(THREE.MathUtils.clamp(arrow.y,-1,1)),
    yaw:Math.atan2(arrow.x,arrow.z),draw:result.drawMeters,
    fraction:result.actualDrawFraction,error:result.drawHandErrorMeters,
    bowError:result.bowHandErrorMeters,skin:result.drawingSkinGapsMeters,
    reachable:result.reachable};
}
function compare(left:PoseSnapshot,right:PoseSnapshot){
  const perJoint=Object.fromEntries([...left.joints].map(([role,a])=>{
    const b=right.joints.get(role)!;
    return [role,mm(reflect(a.p).distanceTo(b.p))];
  }));
  const point=(m:THREE.Matrix4,x:number,y:number,z:number)=>
    new THREE.Vector3(x,y,z).applyMatrix4(m);
  const distances={
    bowGrip:mm(reflect(point(left.bow,0,0,0)).distanceTo(point(right.bow,0,0,0))),
    upperTip:mm(reflect(point(left.bow,0,.64,0)).distanceTo(point(right.bow,0,.64,0))),
    lowerTip:mm(reflect(point(left.bow,0,-.64,0)).distanceTo(point(right.bow,0,-.64,0))),
    nock:mm(reflect(left.nock).distanceTo(right.nock)),
    drawingHook:mm(reflect(left.contact).distanceTo(right.contact)),
    arrowAxisDegrees:deg(reflect(left.arrow).angleTo(right.arrow)),
    drawMillimetres:mm(Math.abs(left.draw-right.draw)),
    bowHandResidualMillimetres:mm(Math.abs(left.bowError-right.bowError)),
    drawHandResidualMillimetres:mm(Math.abs(left.error-right.error)),
  };
  const angular=Object.fromEntries([...left.joints].map(([role,a])=>[
    role,deg(mirrorSourceRotationX(a.q).angleTo(right.joints.get(role)!.q)),
  ]));
  return {jointMillimetres:perJoint,jointQuaternionDegrees:angular,
    equipment:distances,pitchDegrees:[deg(left.pitch),deg(right.pitch)],
    yawDegrees:[deg(left.yaw),deg(right.yaw)],
    drawFractions:[left.fraction,right.fraction],
    skin:[left.skin,right.skin],reachable:[left.reachable,right.reachable]};
}
describe("C5.4 sagittal source and archery symmetry audit",()=>{
  it("measures original source-mesh pairs, semantic landmarks and FK frames in local X reflection",()=>{
    const {human,model,fk}=make();
    try{
      const source=human.template.sourceVertexIds;
      const positions=human.mesh.geometry.getAttribute("position");
      const seen=new Set<number>();
      const left:THREE.Vector3[]=[],right:THREE.Vector3[]=[];
      for(let i=0;i<source.length;i++){
        if(seen.has(source[i]!))continue;
        seen.add(source[i]!);
        const p=new THREE.Vector3().fromBufferAttribute(positions,i);
        if(p.x<-.015)left.push(p);
        if(p.x>.015)right.push(p);
      }
      const size=.005;
      const cell=(x:number,y:number,z:number)=>
        [Math.round(x/size),Math.round(y/size),Math.round(z/size)];
      const key=(v:readonly number[])=>v.join(",");
      const bins=new Map<string,THREE.Vector3[]>();
      for(const p of right){
        const k=key(cell(p.x,p.y,p.z));
        if(!bins.has(k))bins.set(k,[]);
        bins.get(k)!.push(p);
      }
      let sum=0,max=0,paired=0,within1=0,within3=0;
      for(const p of left){
        const target=reflect(p), c=cell(target.x,target.y,target.z);
        let min=Infinity;
        for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let d=-1;d<=1;d++){
          for(const candidate of bins.get(key([c[0]!+a,c[1]!+b,c[2]!+d]))??[]){
            min=Math.min(min,candidate.distanceTo(target));
          }
        }
        if(!Number.isFinite(min))continue;
        paired++;sum+=min;max=Math.max(max,min);
        if(min<=.001)within1++;
        if(min<=.003)within3++;
      }
      const landmark:any[]=[];const axes:any[]=[];
      const inv=human.spike.character.root.matrixWorld.clone().invert();
      for(const role of roleIds("left")){
        const keyRole=role.replace(/_left$/, "");
        const other=role.replace(/_left$/, "_right");
        const l=joint(model,role,"left"),r=joint(model,other,"right");
        const p=reflect(l.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv));
        const q=r.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
        landmark.push({joint:keyRole,mm:mm(p.distanceTo(q))});
        const lj=human.spike.graph.joints.find(j=>j.role===role&&
          (role.startsWith("finger_")?j.id.includes("arm[left,0]"):true))!;
        const rj=human.spike.graph.joints.find(j=>j.role===other&&
          (role.startsWith("finger_")?j.id.includes("arm[right,0]"):true))!;
        for(const [motion,freedom] of fk.frames.get(lj.id)!.freedoms){
          const rhs=fk.frames.get(rj.id)?.freedoms.get(motion);
          if(!rhs)continue;
          const av=freedom.axis.clone().applyQuaternion(l.getWorldQuaternion(new THREE.Quaternion()));
          const bv=rhs.axis.clone().applyQuaternion(r.getWorldQuaternion(new THREE.Quaternion()));
          const mirrored=new THREE.Vector3(av.x,-av.y,-av.z);
          axes.push({joint:keyRole,motion,
            alignedDegrees:deg(mirrored.angleTo(bv)),
            oppositeDegrees:deg(mirrored.angleTo(bv.clone().negate())),
            min:[freedom.min,rhs.min],max:[freedom.max,rhs.max]});
        }
      }
      console.log("C5.4 SOURCE SYMMETRY AUDIT",JSON.stringify({
        mesh:{left:left.length,right:right.length,pairedWithinGrid:paired,
          unmatched:left.length-paired,meanMm:mm(sum/Math.max(1,paired)),
          maxMm:mm(max),within1mm:within1,within3mm:within3},
        landmarks:landmark,axes}));
      expect(landmark.length).toBe(19);
      expect(paired).toBeGreaterThan(left.length*.8);
    }finally{human.dispose();}
  },120_000);
  const cases:ReadonlyArray<readonly [ArcheryState,number]>=[
    ["rest",0],["nock",1],["partial",0],["partial",.25],
    ["partial",.5],["partial",.75],["partial",1],
    ["aim",0],["aim",.25],["aim",.5],["aim",.75],["aim",1],
    ["release",1],
  ];
  // Each solve is a separate Vitest task. Avoid a multi-minute synchronous
  // test body that starves the Vitest worker's RPC heartbeat.
  it.each(cases)("measures mirror error at %s draw %s",(state,draw)=>{
    const {human,model}=make();
    const preview=new StudioPosePreview(model);
    try{
      preview.setArcheryState(state);
      preview.setArcheryDraw(draw);
      preview.setGrip("bow-left");
      const left=capture(model,preview,"left");
      preview.setGrip("bow-right");
      const right=capture(model,preview,"right");
      const metrics=compare(left,right);
      console.log("C5.4 BILATERAL BASELINE",JSON.stringify({state,draw,...metrics}));
      expect([left.reachable,right.reachable].every(Boolean)).toBe(true);
      expect(metrics.equipment.arrowAxisDegrees).toBeLessThan(90);
    }finally{preview.dispose();human.dispose();}
  },120_000);
});
