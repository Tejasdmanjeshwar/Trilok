import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {createHumanHeadRecipe,DEFAULT_HUMAN_HEAD_MORPHOLOGY} from
  "../packages/character-core/src/index";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology} from
  "../apps/web/src/characters/geometry/HumanMorphology";
import {buildHumanFacialSourceSurface, type HumanFacialSourceSurface} from
  "../apps/web/src/characters/geometry/FacialSourceTopology";
import type {FacialRegionId} from
  "../apps/web/src/characters/geometry/FacialTopology";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

/**
 * Temporary C3.5 stress harness, deliberately outside Character Lab and
 * C3.6.  No expression, morph target, animation track or new runtime control
 * is authored. This checks only continuity and numerical surface health.
 * A passing mesh test is NOT evidence of a natural anatomical eye closure,
 * oral mucosa, eyeball contact, or correct future C3.6 animation.
 */
const asset=(name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
const make=()=>bindTemplateToSemanticRig(parseAnatomicalOBJ(
  asset("makehuman-base.obj"),{includeGroups:["body"]}),{rig,weights});

type DiagnosticShift=readonly [FacialRegionId,readonly [number,number,number]];
interface StressMetrics {
  readonly name:string;
  readonly displacedVertices:number;
  readonly maxDisplacementMeters:number;
  readonly seamErrorMeters:number;
  readonly foldovers:number;
  readonly minAreaRatio:number;
  readonly maxEdgeRatio:number;
}

function evaluate(
  face:HumanFacialSourceSurface,name:string,shifts:readonly DiagnosticShift[],
):StressMetrics{
  const g=face.geometry;
  const position=g.getAttribute("position");
  const original=Float32Array.from(position.array as ArrayLike<number>);
  const moved=Float64Array.from(original);
  const controls=shifts.map(([id,xyz])=>({
    weights:face.controlWeights(id),xyz,
  }));
  let displacedVertices=0,maxDisplacementMeters=0;
  for(let i=0;i<position.count;i++){
    let dx=0,dy=0,dz=0;
    for(const {weights,xyz} of controls){
      const w=weights[i]!;
      dx+=w*xyz[0];dy+=w*xyz[1];dz+=w*xyz[2];
    }
    const change=Math.hypot(dx,dy,dz);
    if(change>1e-9)displacedVertices++;
    maxDisplacementMeters=Math.max(maxDisplacementMeters,change);
    moved[i*3]=moved[i*3]!+dx;
    moved[i*3+1]=moved[i*3+1]!+dy;
    moved[i*3+2]=moved[i*3+2]!+dz;
  }
  // Canonical topology IDs represent UV copies of one physical vertex. The
  // diagnostic displacement must not create cracks at those UV seams.
  const seamPositions=new Map<number,readonly [number,number,number]>();
  let seamErrorMeters=0;
  for(let i=0;i<position.count;i++){
    const id=face.topologyIds[i]!;
    const xyz=[moved[i*3]!,moved[i*3+1]!,moved[i*3+2]!] as const;
    const prior=seamPositions.get(id);
    if(prior)seamErrorMeters=Math.max(seamErrorMeters,
      Math.hypot(xyz[0]-prior[0],xyz[1]-prior[1],xyz[2]-prior[2]));
    else seamPositions.set(id,xyz);
  }
  const idx=g.getIndex()!;
  let foldovers=0,minAreaRatio=Infinity,maxEdgeRatio=0;
  const b=new THREE.Vector3(),c=new THREE.Vector3();
  const d=new THREE.Vector3(),e=new THREE.Vector3();
  for(let i=0;i<idx.count;i+=3){
    const aId=idx.getX(i),bId=idx.getX(i+1),cId=idx.getX(i+2);
    const indexPairs=[aId,bId,bId,cId,cId,aId] as const;
    for(let k=0;k<indexPairs.length;k+=2){
      const a=indexPairs[k]!,z=indexPairs[k+1]!;
      const oldLength=Math.hypot(
        original[a*3]!-original[z*3]!,
        original[a*3+1]!-original[z*3+1]!,
        original[a*3+2]!-original[z*3+2]!);
      if(oldLength<1e-9)continue;
      const newLength=Math.hypot(
        moved[a*3]!-moved[z*3]!,
        moved[a*3+1]!-moved[z*3+1]!,
        moved[a*3+2]!-moved[z*3+2]!);
      maxEdgeRatio=Math.max(maxEdgeRatio,newLength/oldLength);
    }
    b.set(original[bId*3]!-original[aId*3]!,
      original[bId*3+1]!-original[aId*3+1]!,
      original[bId*3+2]!-original[aId*3+2]!);
    c.set(original[cId*3]!-original[aId*3]!,
      original[cId*3+1]!-original[aId*3+1]!,
      original[cId*3+2]!-original[aId*3+2]!);
    d.set(moved[bId*3]!-moved[aId*3]!,
      moved[bId*3+1]!-moved[aId*3+1]!,
      moved[bId*3+2]!-moved[aId*3+2]!);
    e.set(moved[cId*3]!-moved[aId*3]!,
      moved[cId*3+1]!-moved[aId*3+1]!,
      moved[cId*3+2]!-moved[aId*3+2]!);
    const rest=b.cross(c),posed=d.cross(e);
    const restArea=rest.length();
    const posedArea=posed.length();
    if(restArea<1e-12)throw new Error("Source surface has a degenerate triangle");
    minAreaRatio=Math.min(minAreaRatio,posedArea/restArea);
    if(rest.dot(posed)<=0)foldovers++;
  }
  expect(Array.from(moved).every(Number.isFinite)).toBe(true);
  expect(g.getAttribute("position").array).toEqual(original);
  return {name,displacedVertices,maxDisplacementMeters,seamErrorMeters,
    foldovers,minAreaRatio,maxEdgeRatio};
}

describe("C3.5 large temporary facial-control deformation diagnostics",()=>{
  it("keeps neutral and bounded-stress eyelid/lip/cheek deformations seam-safe",()=>{
    const human=make();
    try{
      const face=buildHumanFacialSourceSurface(human);
      const diagnostics:readonly (readonly [string,readonly DiagnosticShift[]])[]=[
        ["left-eye-squeeze",[
          ["eyelid.upper.left",[0,-.003,0]],
          ["eyelid.lower.left",[0,.003,0]],
        ]],
        ["bilateral-eye-squeeze",[
          ["eyelid.upper.left",[0,-.0025,0]],
          ["eyelid.lower.left",[0,.0025,0]],
          ["eyelid.upper.right",[0,-.0025,0]],
          ["eyelid.lower.right",[0,.0025,0]],
        ]],
        ["mouth-opening-probe",[
          ["lip.upper",[0,.002,0]],
          ["lip.lower",[0,-.005,0]],
          ["mouth.corner.left",[-.001,0,0]],
          ["mouth.corner.right",[.001,0,0]],
        ]],
        ["asymmetric-cheek-probe",[
          ["cheek.left",[0,0,.006]],
          ["cheek.right",[0,0,-.006]],
        ]],
      ];
      const reports=diagnostics.map(([name,shift])=>evaluate(face,name,shift));
      for(const report of reports){
        expect(report.displacedVertices).toBeGreaterThan(10);
        expect(report.maxDisplacementMeters).toBeGreaterThan(.001);
        expect(report.seamErrorMeters).toBeLessThan(1e-6);
        // Local control deformation must preserve element winding and avoid
        // collapse. If this fails, C3.5 stress certification is blocked.
        expect(report.foldovers).toBe(0);
        expect(report.minAreaRatio).toBeGreaterThan(.03);
        expect(report.maxEdgeRatio).toBeLessThan(6);
      }
      console.log("C3.5 temporary stress metrics:",JSON.stringify(reports));
    }finally{human.dispose();}
  },120_000);

  it("repeats large test-only changes after the supported combined head extreme",()=>{
    const human=make();
    try{
      applyHumanMorphology(human,createHumanHeadRecipe({
        ...DEFAULT_HUMAN_HEAD_MORPHOLOGY,
        skullWidth:1.10,skullHeight:1.07,forehead:1.07,
        brow:1.08,cheeks:1.08,jawWidth:1.09,
        chin:1.08,faceDepth:1.06,eyeSpacing:1.05,
      }));
      const face=buildHumanFacialSourceSurface(human);
      const report=evaluate(face,"extreme-head-asymmetric-face",[
        ["eyelid.upper.right",[0,-.003,0]],
        ["eyelid.lower.right",[0,.003,0]],
        ["lip.lower",[0,-.005,0]],
        ["cheek.left",[0,0,.005]],
      ]);
      console.log("C3.5 combined head stress metrics:",JSON.stringify(report));
      expect(report.seamErrorMeters).toBeLessThan(1e-6);
      expect(report.foldovers).toBe(0);
      expect(report.minAreaRatio).toBeGreaterThan(.03);
    }finally{human.dispose();}
  },120_000);
});
