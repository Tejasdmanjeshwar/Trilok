import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {createAnimationSampler} from "../packages/character-core/src/index";
import {loadBakedStudioAnimation} from "../apps/web/src/studio/StudioAnimationLibrary";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {HumanPoseCorrectives} from
  "../apps/web/src/characters/geometry/HumanPoseCorrectives";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

/**
 * Issue #121: exact source-indexed, CPU-skinned Kevin Run measurements.
 * This is a diagnosis gate, NOT a passing visual acceptance certificate.
 * The explicit C121 output can be compared across fixes without WebGL readback.
 * Camera-visible self-occlusion still requires the manual Chromium review.
 */
const asset=(name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
const TIMES=[0,.15,.30,.40,.45,.48,.50,.51,.52,.54,.57,.60] as const;
type Side="left"|"right";
type Triangle=Readonly<{
  face:number;render:readonly [number,number,number];
  source:readonly [number,number,number];area:number;normal:THREE.Vector3;
}>;
function areaNormal(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3){
  const cross=b.clone().sub(a).cross(c.clone().sub(a));
  return {area:cross.length()*.5,normal:cross.normalize()};
}
function triangles(human:ReturnType<typeof bindTemplateToSemanticRig>,
  weights:SourceWeights,side:Side):Triangle[]{
  const suffix=side==="left"?".R":".L";
  const sourceIds=human.template.sourceVertexIds;
  // Include clavicle neighbors, not just the 716 shoulder01 test edges.
  const owners=new Set<number>();
  for(const sourceName of ["shoulder01","clavicle","upperarm01"]){
    for(const [id,w] of weights.weights[sourceName+suffix]??[]){
      if(w>.01)owners.add(id);
    }
  }
  const index=human.mesh.geometry.getIndex()!;
  const position=human.mesh.geometry.getAttribute("position");
  const result:Triangle[]=[];
  for(let i=0;i<index.count;i+=3){
    const render=[index.getX(i),index.getX(i+1),index.getX(i+2)] as const;
    const source=render.map(id=>sourceIds[id]!) as unknown as
      readonly [number,number,number];
    if(!source.some(id=>owners.has(id)))continue;
    const rest=render.map(id=>
      new THREE.Vector3().fromBufferAttribute(position,id));
    const {area,normal}=areaNormal(rest[0]!,rest[1]!,rest[2]!);
    expect(area).toBeGreaterThan(1e-12);
    result.push({face:i/3,render,source,area,normal});
  }
  expect(result.length).toBeGreaterThan(300);
  return result;
}
function inspect(human:ReturnType<typeof bindTemplateToSemanticRig>,
  region:readonly Triangle[]){
  const positions=new Map<number,THREE.Vector3>();
  const get=(i:number)=>{
    let p=positions.get(i);
    if(!p){p=human.mesh.getVertexPosition(i,new THREE.Vector3());positions.set(i,p);}
    return p;
  };
  let min=Infinity,max=-Infinity,collapsed=0,reversed=0,invalid=0;
  let smallest:Triangle|undefined,largest:Triangle|undefined;
  let minDot=Infinity;
  const sample=(triangle:Triangle)=>{
    const [a,b,c]=triangle.render;
    const posed=areaNormal(get(a),get(b),get(c));
    const ratio=posed.area/triangle.area;
    return {ratio,normalDot:posed.normal.dot(triangle.normal)};
  };
  for(const triangle of region){
    const {ratio,normalDot}=sample(triangle);
    if(!Number.isFinite(ratio)||!Number.isFinite(normalDot)){
      invalid++;continue;
    }
    if(ratio<min){min=ratio;smallest=triangle;}
    if(ratio>max){max=ratio;largest=triangle;}
    if(ratio<.2)collapsed++;
    // A rest-vs-posed normal sign alone is NOT evidence of winding inversion:
    // rigid bone rotation can also turn normals by >90 degrees.
    if(normalDot<0)reversed++;
    minDot=Math.min(minDot,normalDot);
  }
  const detail=(tri:Triangle|undefined)=>{
    if(!tri)return null;
    const index=human.mesh.geometry.getAttribute("skinIndex");
    const weight=human.mesh.geometry.getAttribute("skinWeight");
    const {ratio,normalDot}=sample(tri);
    return {face:tri.face,source:tri.source,render:tri.render,
      restAreaMeters2:tri.area,posedAreaMeters2:tri.area*ratio,
      ratio,normalDot,
      gpu:tri.render.map(i=>Array.from({length:4},(_,k)=>[
        index.getComponent(i,k),weight.getComponent(i,k)]))};
  };
  return {faces:region.length,invalid,areaRatioMin:min,areaRatioMax:max,
    areaRatioLtPoint2:collapsed,restNormalOppositeCount:reversed,
    minRestNormalDot:minDot,smallest:detail(smallest),largest:detail(largest)};
}
describe("Issue #121 Kevin Run exact-frame shoulder surface diagnosis",()=>{
  it("reports original MakeHuman triangle IDs, actual posed areas and corrective isolation",()=>{
    const template=parseAnatomicalOBJ(asset("makehuman-base.obj"),
      {includeGroups:["body"]});
    const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
    const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
    const human=bindTemplateToSemanticRig(template,{rig,weights});
    const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
      jawTipWorldRest:human.jawTipWorldRest,
      forearmSkinBones:human.spike.forearmSkinBones,
      shoulderSkinBones:human.spike.shoulderSkinBones,
    });
    const correctives=new HumanPoseCorrectives(human);
    try{
      const clip=loadBakedStudioAnimation("human-kevin-run",human.spike.graph);
      const sampler=createAnimationSampler(clip,human.spike.graph);
      expect(clip.durationSeconds).toBeCloseTo(.6,5);
      const bands={
        left:triangles(human,weights,"left"),
        right:triangles(human,weights,"right"),
      };
      for(const seconds of TIMES){
        const samples=sampler.sample(seconds);
        fk.applyRestDeltas(samples);
        correctives.applyAnimationSamples(samples);
        for(const correction of ["on","off"] as const){
          if(correction==="off")correctives.applyAnimationSamples([]);
          for(const side of ["left","right"] as const){
            const metrics=inspect(human,bands[side]);
            expect(metrics.invalid).toBe(0);
            console.log("TRILOK_C121_GEOMETRY "+JSON.stringify({
              seconds,side,correction,...metrics,
              correctiveInfluence:human.mesh.morphTargetInfluences?.slice(0,2),
            }));
          }
          if(correction==="off")correctives.applyAnimationSamples(samples);
        }
      }
      fk.applyRestDeltas([]);
      correctives.applyAnimationSamples([]);
      for(const side of ["left","right"] as const)
        expect(inspect(human,bands[side]).areaRatioMin).toBeCloseTo(1,4);
    }finally{correctives.dispose();human.dispose();}
  },120_000);
});
