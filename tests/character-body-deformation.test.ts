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
    return {change: Math.abs(next-e.rest),relative: Math.abs(next/e.rest-1)};
  }).sort((a,b)=>a.relative-b.relative);
  return {
    edges: edges.length,
    rmsPercent:+(100*Math.sqrt(values.reduce((sum,x)=>sum+x.relative*x.relative,0)/values.length)).toFixed(2),
    p95Percent:+(100*values[Math.floor(values.length*.95)]!.relative).toFixed(2),
    maxPercent:+(100*values.at(-1)!.relative).toFixed(2),
    maxAbsMm:+(1000*Math.max(...values.map(x=>x.change))).toFixed(2),
    worstPair:edges.find(e=>e.pair===edges[values.length-1]?.pair)?.pair,
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
        for(const m of metrics) {
          for(const side of sides) {
            const x=m[side];
            expect(Number.isFinite(x.rmsPercent) && Number.isFinite(x.maxAbsMm)).toBe(true);
            expect(x.edges).toBeGreaterThan(80);
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
