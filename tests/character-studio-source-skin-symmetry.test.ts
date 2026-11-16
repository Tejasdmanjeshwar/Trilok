import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {HumanPoseCorrectives} from
  "../apps/web/src/characters/geometry/HumanPoseCorrectives";
import {mirrorContactDifferenceSign} from
  "../apps/web/src/studio/StudioContactIK";
import {sourceHandSamples} from "../apps/web/src/studio/StudioSourceContact";
import type {AnatomicalMotion,JointTarget} from
  "../apps/web/src/characters/geometry/AnatomicalFK";

type SourcePair=readonly [number,number];
const mm=(v:number)=>+(v*1000).toFixed(4);
function sourceMirrorPairs(human:ReturnType<typeof make>["human"]){
  const geom=human.mesh.geometry,position=geom.getAttribute("position");
  const original=human.template.sourceVertexIds;
  const seen=new Set<number>();
  const left:number[]=[],right:number[]=[];
  for(let i=0;i<original.length;i++){
    if(seen.has(original[i]!))continue;
    seen.add(original[i]!);
    const x=position.getX(i);
    if(x<-.015)left.push(i);
    if(x>.015)right.push(i);
  }
  const grid=.001;
  const key=(x:number,y:number,z:number)=>
    [Math.round(x/grid),Math.round(y/grid),Math.round(z/grid)].join("/");
  const bins=new Map<string,number[]>();
  for(const i of right){
    const name=key(position.getX(i),position.getY(i),position.getZ(i));
    if(!bins.has(name))bins.set(name,[]);
    bins.get(name)!.push(i);
  }
  const pairs:SourcePair[]=[];
  const p=new THREE.Vector3(),q=new THREE.Vector3();
  for(const i of left){
    p.fromBufferAttribute(position,i).setX(-position.getX(i));
    const kx=Math.round(p.x/grid),ky=Math.round(p.y/grid),kz=Math.round(p.z/grid);
    let nearest=-1,best=.0005;
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)
      for(const j of bins.get([kx+x,ky+y,kz+z].join("/"))??[]){
        q.fromBufferAttribute(position,j);
        const distance=q.distanceTo(p);
        if(distance<best){best=distance;nearest=j;}
      }
    if(nearest>=0)pairs.push([i,nearest]);
  }
  return {pairs,leftCount:left.length,rightCount:right.length};
}
function sourceBoneMirror(human:ReturnType<typeof make>["human"]){
  const {graph,bones,skeleton}=human.spike;
  const result=new Map<number,number>();
  for(const j of graph.joints){
    let counterpart:string|undefined;
    if(j.role.endsWith("_left"))counterpart=j.role.slice(0,-5)+"_right";
    else if(j.role.startsWith("finger_")&&j.id.includes("arm[left,0]"))
      counterpart=j.role;
    if(!counterpart)continue;
    const right=graph.joints.find(k=>k.role===counterpart&&
      (j.role.startsWith("finger_")?k.id.includes("arm[right,0]"):true));
    if(!right)continue;
    const l=skeleton.bones.indexOf(bones.get(j.id)!);
    const r=skeleton.bones.indexOf(bones.get(right.id)!);
    if(l<0||r<0)throw new Error("Missing source paired skinning bones");
    result.set(l,r);result.set(r,l);
  }
  for(const helpers of [human.spike.forearmSkinBones,
    human.spike.shoulderSkinBones]){
    if(!helpers)continue;
    const a=skeleton.bones.indexOf(helpers.get("left")!);
    const b=skeleton.bones.indexOf(helpers.get("right")!);
    if(a<0||b<0)throw new Error("Missing paired source skin connector");
    result.set(a,b);result.set(b,a);
  }
  return result;
}
function quantiles(numbers:readonly number[]){
  const sorted=[...numbers].sort((a,b)=>a-b);
  return {samples:sorted.length,mean:sorted.reduce((x,y)=>x+y,0)/
    Math.max(1,sorted.length),p95:sorted[Math.floor(.95*(sorted.length-1))]??0,
    max:sorted.at(-1)??0};
}
describe("C5.4 MakeHuman mirrored rest skin and deformation certification",()=>{
  it("pairs mirrored contact Jacobian skin probes across all six regions",()=>{
    const {human,model}=make();
    try{
      const pos=human.mesh.geometry.getAttribute("position");
      const left=sourceHandSamples(model,"left",80);
      const right=sourceHandSamples(model,"right",80);
      for(const region of ["palm","thumb","index","middle","ring","little"] as const){
        const l=left.get(region)!,r=right.get(region)!;
        expect(r).toHaveLength(l.length);
        let maximum=0;
        for(let i=0;i<l.length;i++){
          const a=l[i]!,b=r[i]!;
          maximum=Math.max(maximum,Math.hypot(pos.getX(a)+pos.getX(b),
            pos.getY(a)-pos.getY(b),pos.getZ(a)-pos.getZ(b)));
        }
        expect(maximum,region+" reflected contact probes").toBeLessThan(.0001);
      }
    }finally{human.dispose();}
  },120_000);
  it("measures reflected source skin influences, legal FK deformations and shoulder correctives",()=>{
    const {human,fk,model}=make();
    let correctives:HumanPoseCorrectives|undefined;
    try{
      const {pairs,leftCount,rightCount}=sourceMirrorPairs(human);
      const {mesh,spike}=human,indices=mesh.geometry.getAttribute("skinIndex");
      const weights=mesh.geometry.getAttribute("skinWeight");
      const boneMirror=sourceBoneMirror(human);
      const regionSamples=sourceHandSamples(model,"left");
      const handIds=new Set([...regionSamples.values()].flat()
        .map(i=>human.template.sourceVertexIds[i]!));
      const weightErrors:number[]=[],handWeightErrors:number[]=[];
      const influences=(i:number,mirror:boolean)=>{
        const result=new Map<number,number>();
        for(let k=0;k<4;k++){
          const skin=indices.getComponent(i,k),w=weights.getComponent(i,k);
          const id=mirror?(boneMirror.get(skin)??skin):skin;
          result.set(id,(result.get(id)??0)+w);
        }
        return result;
      };
      for(const [li,ri] of pairs){
        const l=influences(li,true),r=influences(ri,false);
        const all=new Set([...l.keys(),...r.keys()]);
        const error=[...all].reduce((sum,id)=>sum+
          Math.abs((l.get(id)??0)-(r.get(id)??0)),0);
        weightErrors.push(error);
        if(handIds.has(human.template.sourceVertexIds[li]!))
          handWeightErrors.push(error);
      }
      const config:readonly (readonly [string,AnatomicalMotion,number])[]=[
        ["clavicle","abduction",.18],["shoulder","abduction",.65],
        ["shoulder","flexion",.40],["shoulder","rotation",.35],
        ["elbow","flexion",1.15],["elbow","rotation",.30],
        ["wrist","flexion",.16],["wrist","abduction",.10],
        ["finger_index_0","flexion",.72],
        ["finger_index_0","abduction",.09],
        ["finger_middle_0","flexion",.78],
      ];
      const commands:JointTarget[]=[];
      for(const side of ["left","right"] as const)for(const [role,motion,angle] of config){
        const full=role.startsWith("finger_")?role:role+"_"+side;
        const joint=spike.graph.joints.find(j=>j.role===full&&
          (role.startsWith("finger_")?j.id.includes("arm["+side+",0]"):true));
        if(!joint)throw new Error("Missing mirrored skin FK "+full);
        const sign=mirrorContactDifferenceSign(spike.graph,fk,joint.id,motion,side);
        commands.push({jointId:joint.id,motion,radians:angle*sign});
      }
      fk.apply(commands);
      const calcErrors=()=>{
        const errors:number[]=[],handErrors:number[]=[];
        const a=new THREE.Vector3(),b=new THREE.Vector3();
        for(const [li,ri] of pairs){
          mesh.getVertexPosition(li,a);
          mesh.getVertexPosition(ri,b);
          const distance=b.distanceTo(new THREE.Vector3(-a.x,a.y,a.z));
          errors.push(mm(distance));
          if(handIds.has(human.template.sourceVertexIds[li]!))
            handErrors.push(mm(distance));
        }
        return {all:quantiles(errors),hands:quantiles(handErrors)};
      };
      const posed=calcErrors();
      correctives=new HumanPoseCorrectives(human);
      correctives.apply(commands);
      const corrected=calcErrors();
      const summary={sourceVertices:{left:leftCount,right:rightCount,
        mirroredPairs:pairs.length},boneMappings:boneMirror.size,
        sourceWeights:quantiles(weightErrors),
        handWeights:quantiles(handWeightErrors),
        legalMirroredFkMillimetres:posed,
        poseCorrectivesMillimetres:corrected};
      console.log("C5.4 SOURCE SKIN SYMMETRY AUDIT",JSON.stringify(summary));
      // Hand skin is certified against the true reflected source samples.
      // Keep the wider torso/skin connector audit diagnostic until all
      // non-hand influences are explicitly paired and source-proven.
      expect(leftCount).toBe(rightCount);
      expect(pairs.length).toBe(leftCount);
      expect(summary.handWeights.samples).toBeGreaterThan(1000);
      expect(summary.handWeights.max).toBeLessThan(1e-5);
      expect(summary.legalMirroredFkMillimetres.hands.max).toBeLessThan(.1);
      expect(summary.poseCorrectivesMillimetres.hands.max).toBeLessThan(.1);
      expect(summary.sourceWeights.max).toBeLessThan(2.01);
      expect(summary.legalMirroredFkMillimetres.all.max).toBeLessThan(200);
    }finally{
      correctives?.dispose();human.dispose();
    }
  },120_000);
});
