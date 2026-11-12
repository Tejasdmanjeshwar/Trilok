import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { parseAnatomicalOBJ, bindTemplateToSemanticRig } from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { AnatomicalFK, type JointTarget, type AnatomicalMotion } from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import type { SourceRig, SourceWeights } from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset = (name: string): string => readFileSync(
  new URL("../apps/web/public/anatomy/" + name, import.meta.url), "utf8");
function human() {
  const template = parseAnatomicalOBJ(asset("makehuman-base.obj"),
    { includeGroups: ["body"] });
  const rig = JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
  const source = JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
  const body = bindTemplateToSemanticRig(template, { rig, weights:source });
  const fk = new AnatomicalFK(body.spike.graph, body.spike.bones, {
    jawTipWorldRest: body.jawTipWorldRest,
    forearmSkinBones:body.spike.forearmSkinBones,
    shoulderSkinBones:body.spike.shoulderSkinBones,
  });
  return { body, fk, rig, source };
}
type Session = ReturnType<typeof human>;
type Side = "left" | "right";
const sides: readonly Side[] = ["left","right"];
type Region = "shoulder" | "elbow" | "hip" | "knee" | "ankle" | "neck" | "jaw";
const regions: readonly Region[] = ["shoulder","elbow","hip","knee","ankle","neck","jaw"];
const sourceNames: Record<Region, string[]> = {
  shoulder:["shoulder01","upperarm01","clavicle"],
  elbow:["upperarm02","lowerarm01","lowerarm02"],
  hip:["pelvis","upperleg01","upperleg02"],
  knee:["upperleg02","lowerleg01","lowerleg02"],
  ankle:["lowerleg02","foot","toe1-1"],
  neck:["spine01","neck01","neck02","neck03"],
  jaw:["jaw","head"],
};
function band(session: Session, region: Region, side: Side) {
  const {body,source} = session;
  const suffix = side === "left" ? ".R" : ".L";
  const wanted = new Set<number>();
  for (const name of sourceNames[region]) {
    const entries = source.weights[name+((region==="neck"||region==="jaw")?"":suffix)] ?? [];
    for (const [sourceId,weight] of entries) if (weight >= .05) wanted.add(sourceId);
  }
  const src = body.template.sourceVertexIds;
  const position = body.mesh.geometry.getAttribute("position");
  const indices = body.mesh.geometry.getIndex()!;
  const seen = new Set<string>();
  const edges: {a:number;b:number;rest:number;pair:string}[] = [];
  const local = new THREE.Vector3(),other = new THREE.Vector3();
  for (let i=0;i<indices.count;i+=3) {
    const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);
    for (const [x,y] of [[a,b],[b,c],[c,a]] as const) {
      const u=src[x]!,v=src[y]!;
      if (!wanted.has(u)||!wanted.has(v)||u===v)continue;
      const key=Math.min(u,v)+":"+Math.max(u,v);
      if(seen.has(key))continue;
      seen.add(key);
      const rest=local.fromBufferAttribute(position,x)
        .distanceTo(other.fromBufferAttribute(position,y));
      if(rest >= .003) edges.push({a:x,b:y,rest,pair:key});
    }
  }
  if(edges.length<80)throw new Error(region+" "+side+" not enough CC0 edges:"+edges.length);
  return edges;
}
function skin(session: Session, edges: ReturnType<typeof band>) {
  const cache=new Map<number,THREE.Vector3>();
  const point=(i:number):THREE.Vector3=>{
    let p=cache.get(i);if(!p){p=session.body.mesh.getVertexPosition(i,new THREE.Vector3());cache.set(i,p);}return p;
  };
  const values=edges.map(e=>{
    const next=point(e.a).distanceTo(point(e.b));
    return {change: Math.abs(next-e.rest),relative: Math.abs(next/e.rest-1),pair:e.pair};
  }).sort((a,b)=>a.relative-b.relative);
  return {
    edges: edges.length,
    rmsPercent:+(100*Math.sqrt(values.reduce((sum,x)=>sum+x.relative*x.relative,0)/values.length)).toFixed(2),
    p95Percent:+(100*values[Math.floor(values.length*.95)]!.relative).toFixed(2),
    maxPercent:+(100*values.at(-1)!.relative).toFixed(2),
    maxAbsMm:+(1000*Math.max(...values.map(x=>x.change))).toFixed(2),
    worstPair:values.at(-1)?.pair,
  };
}
function commands(session:Session,mode:string):JointTarget[] {
  const a:JointTarget[]=[];
  const push=(role:string,motion:AnatomicalMotion,radians:number)=>{
    const joint=session.body.spike.graph.joints.find(x=>x.role===role);
    if(!joint)throw Error("Missing role "+role);
    a.push({jointId:joint.id,motion,radians});
  };
  for(const side of sides) {
    if(["shoulder","combined"].includes(mode)) {
      push("clavicle_"+side,"abduction",.22);
      push("shoulder_"+side,"abduction",1.5);
      push("shoulder_"+side,"flexion",.6);
    }
    if(["elbow","combined"].includes(mode)) {
      push("elbow_"+side,"flexion",1.8);
      push("elbow_"+side,"rotation",side==="left"?.8:-.8);
    }
    if(["hip","combined"].includes(mode)) {
      push("hip_"+side,"flexion",1.5);
      push("hip_"+side,"abduction",.45);
    }
    if(["knee","combined"].includes(mode))push("knee_"+side,"flexion",1.9);
    if(["ankle","combined"].includes(mode))push("ankle_"+side,"flexion",.45);
  }
  if(["neck","combined"].includes(mode)) {
    push("neck","rotation",.55);
    push("head","flexion",.3);
  }
  if(["jaw","combined"].includes(mode))push("jaw","flexion",.5);
  if(mode==="combined") {push("chest","rotation",.32);push("spine_lower","rotation",.3);}
  return a;
}
describe("C2.4 pinned CC0 body deformation measurement",()=>{
  it("reports bilateral skin strain across hips, knees, ankles, elbow, shoulder, neck and jaw",()=>{
    const s=human();
    try {
      const patches=new Map(regions.flatMap(region=>sides.map(side=>
        [region+side,band(s,region,side)] as const)));
      for(const mode of ["neutral","shoulder","elbow","hip","knee","ankle","neck","jaw","combined"]) {
        s.fk.apply(commands(s,mode));
        const metrics=regions.map(region=>({region,
          left:skin(s,patches.get(region+"left")!),
          right:skin(s,patches.get(region+"right")!),
        }));
        console.info("BODY_SKIN_AUDIT",JSON.stringify({pose:mode,metrics}));
        const ceilings:Record<Region,{p95:number;mm:number}> = {
          shoulder:{p95:85,mm:48}, elbow:{p95:69,mm:47},
          hip:{p95:67,mm:45}, knee:{p95:51,mm:40},
          ankle:{p95:18,mm:13}, neck:{p95:59,mm:46},
          jaw:{p95:32,mm:20},
        };
        for(const m of metrics) {
          expect(Math.abs(m.left.rmsPercent-m.right.rmsPercent),
            mode+" "+m.region+" symmetry").toBeLessThan(.7);
          for(const side of sides) {
            const x=m[side];
            expect(Number.isFinite(x.rmsPercent) && Number.isFinite(x.maxAbsMm)).toBe(true);
            expect(x.edges).toBeGreaterThan(80);
            // Loose source-measured regression budgets, explicitly NOT an
            // anatomical quality or volume/penetration acceptance threshold.
            expect(x.p95Percent,mode+" "+m.region+" "+side+" p95").toBeLessThan(ceilings[m.region].p95);
            expect(x.maxAbsMm,mode+" "+m.region+" "+side+" mm").toBeLessThan(ceilings[m.region].mm);
          }
        }
      }
      s.fk.apply([]);
      for(const region of regions)for(const side of sides) {
        const restored=skin(s,patches.get(region+side)!);
        expect(restored.p95Percent,region+side+" rest").toBeLessThan(.001);
      }
    } finally {s.body.dispose();}
  });
});

/** Select only ORIGINAL source vertices whose entire weighted source-owner set
 * maps to a single rigid C1 transform under this pose envelope. This is an
 * independent kinematic oracle, not a quaternion or index-only assertion. */
function rigidPatch(session:Session, region:"shoulder"|"hip"|"knee"|"ankle"|"neck"|"jaw",
  side:Side):number[] {
  const suffix=side==="left"?".R":".L";
  const allowed:Record<typeof region,RegExp>={
    shoulder:/^upperarm0[12]\\.[LR]$/,
    hip:/^upperleg0[12]\\.[LR]$/,
    knee:/^lowerleg0[12]\\.[LR]$/,
    ankle:/^(foot|toe[1-5]-1)\\.[LR]$/,
    neck:/^neck0[123]$/,
    jaw:/^jaw$/,
  };
  const owners=new Map<number,string[]>();
  for(const [name,entries] of Object.entries(session.source.weights)) {
    for(const [id,value] of entries) {
      if(value<=0)continue;
      const bucket=owners.get(id)??[];
      bucket.push(name);
      owners.set(id,bucket);
    }
  }
  const selected=new Set<number>();
  for(const [id,names] of owners) {
    if(!names.length||!names.every(name=>allowed[region].test(name)))continue;
    if(region!=="neck"&&region!=="jaw"&&!names.every(name=>name.endsWith(suffix)))continue;
    selected.add(id);
  }
  const render:number[]=[];
  const used=new Set<number>();
  session.body.template.sourceVertexIds.forEach((id,i)=>{
    if(selected.has(id)&&!used.has(id)){render.push(i);used.add(id);}
  });
  const min=region==="neck"?6:region==="jaw"?30:40;
  expect(render.length,region+" "+side+" original exclusive CC0 vertices").toBeGreaterThanOrEqual(min);
  return render;
}
function anchor(session:Session,region:"shoulder"|"hip"|"knee"|"ankle"|"neck"|"jaw",
  side:Side):THREE.Bone {
  const role=region==="jaw"||region==="neck"?region:region+"_"+side;
  const joint=session.body.spike.graph.joints.find(j=>j.role===role);
  if(!joint)throw Error("Missing authoritative C1 region "+role);
  return session.body.spike.bones.get(joint.id)!;
}
describe("C2.4 exclusive-owner original CC0 skin-to-bone geometric contracts",()=>{
  it("retains rigid local surface correspondence for shoulders, hips, knees, ankles, neck and jaw",()=>{
    const s=human();
    try {
      const tested=["shoulder","hip","knee","ankle","neck","jaw"] as const;
      const patches=new Map(tested.flatMap(region=>sides.map(side=>
        [region+side,rigidPatch(s,region,side)] as const)));
      const rest=s.body.mesh.geometry.getAttribute("position");
      for(const mode of ["neutral","shoulder","hip","knee","ankle","neck","jaw","combined"]){
        s.fk.apply(commands(s,mode));
        for(const region of tested)for(const side of sides){
          const bone=anchor(s,region,side);
          const index=s.body.spike.skeleton.bones.indexOf(bone);
          const rigid=bone.matrixWorld.clone()
            .multiply(s.body.spike.skeleton.boneInverses[index]!);
          for(const renderId of patches.get(region+side)!){
            const actual=s.body.mesh.getVertexPosition(renderId,new THREE.Vector3());
            const predicted=new THREE.Vector3().fromBufferAttribute(rest,renderId)
              .applyMatrix4(rigid);
            expect(actual.distanceTo(predicted),mode+" "+region+" "+side+
              " original vertex "+s.body.template.sourceVertexIds[renderId])
              .toBeLessThan(1e-5);
          }
        }
      }
      const first=sides.flatMap(side=>patches.get("ankle"+side)!);
      s.fk.apply([]);
      for(const id of first)
        expect(s.body.mesh.getVertexPosition(id,new THREE.Vector3())
          .distanceTo(new THREE.Vector3().fromBufferAttribute(rest,id))).toBeLessThan(1e-6);
    } finally{s.body.dispose();}
  });
  it("catches an ankle-to-knee skin ownership mutation from actual posed vertices",()=>{
    const s=human();
    try {
      const ids=rigidPatch(s,"ankle","right");
      s.fk.apply(commands(s,"ankle"));
      const correct=ids.map(i=>s.body.mesh.getVertexPosition(i,new THREE.Vector3()));
      const index=s.body.mesh.geometry.getAttribute("skinIndex");
      const weight=s.body.mesh.geometry.getAttribute("skinWeight");
      const knee=anchor(s,"knee","right");
      const kneeIndex=s.body.spike.skeleton.bones.indexOf(knee);
      let worst=0;
      for(let n=0;n<ids.length;n++){
        const i=ids[n]!;
        const oldIds=[0,1,2,3].map(k=>index.getComponent(i,k));
        const oldWeights=[0,1,2,3].map(k=>weight.getComponent(i,k));
        index.setXYZW(i,kneeIndex,0,0,0);
        weight.setXYZW(i,1,0,0,0);
        const displaced=s.body.mesh.getVertexPosition(i,new THREE.Vector3());
        worst=Math.max(worst,displaced.distanceTo(correct[n]!));
        index.setXYZW(i,...oldIds as [number,number,number,number]);
        weight.setXYZW(i,...oldWeights as [number,number,number,number]);
      }
      expect(worst,"mutated foot skin-to-knee separation in metres").toBeGreaterThan(.01);
      for(let n=0;n<ids.length;n++)
        expect(s.body.mesh.getVertexPosition(ids[n]!,new THREE.Vector3())
          .distanceTo(correct[n]!)).toBeLessThan(1e-6);
    } finally{s.body.dispose();}
  });
});
