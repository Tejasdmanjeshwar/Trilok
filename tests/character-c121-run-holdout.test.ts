import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {createAnimationSampler} from "../packages/character-core/src/index";
import {loadBakedStudioAnimation} from "../apps/web/src/studio/StudioAnimationLibrary";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";
import {sourceWeightRole,type SourceRig,type SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

/**
 * Independent C121 acceptance diagnostic. Do not integrate the fitted atlas
 * merely because this test passes: the metrics must show no broader shoulder
 * regression and the manually captured WebGL surface must be inspected.
 * Kevin Run is an untouched HOLDOUT, never an input to the offline fitter.
 */
type Influence=readonly [number,number];
type Atlas=Readonly<{
  schemaVersion:number;
  sourceVertexCount:number;
  sourceMeshSha256:string;
  sourceRigSha256:string;
  sourceWeightsSha256:string;
  canonicalJointIds:readonly string[];
  trainingClips:readonly string[];
  entries:readonly (readonly [number,readonly Influence[]])[];
}>;
type Face={readonly face:number; readonly ids:readonly [number,number,number];
  readonly source:readonly [number,number,number];readonly restArea:number};
const times=[0,.15,.30,.40,.45,.48,.50,.51,.52,.54,.57,.60] as const;
const atlas=JSON.parse(readFileSync(new URL("./fixtures/c121-offline-shoulder-atlas.v1.json",
  import.meta.url),"utf8")) as Atlas;
const asset=(file:string)=>readFileSync(new URL("../apps/web/public/anatomy/"+file,
  import.meta.url),"utf8");
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const vec=(p:THREE.BufferAttribute,i:number)=>new THREE.Vector3().fromBufferAttribute(p,i);
function faceSurface(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3){
  const normal=b.clone().sub(a).cross(c.clone().sub(a));
  const area=normal.length()*.5;
  return {area,normal:normal.normalize()};
}
function summarize(region:readonly Face[],get:(i:number)=>THREE.Vector3,
  full:(i:number)=>THREE.Vector3){
  const unique=new Set(region.flatMap(f=>[...f.ids]));
  let sumSq=0,maxMm=0;
  for(const i of unique){
    const mm=get(i).distanceTo(full(i))*1000;
    expect(Number.isFinite(mm)).toBe(true);
    sumSq+=mm*mm;maxMm=Math.max(mm,maxMm);
  }
  let areaError=0,collapsed=0,expanded=0,normalAgainstFull=0;
  let minRatio=Infinity,maxRatio=0;
  for(const face of region){
    const [a,b,c]=face.ids;
    const s=faceSurface(get(a),get(b),get(c));
    const ref=faceSurface(full(a),full(b),full(c));
    const ratio=s.area/face.restArea;
    expect(Number.isFinite(ratio)).toBe(true);
    areaError+=Math.abs(s.area-ref.area)/face.restArea;
    if(ratio<.2)collapsed++;
    if(ratio>3)expanded++;
    if(s.normal.dot(ref.normal)<0)normalAgainstFull++;
    minRatio=Math.min(minRatio,ratio);maxRatio=Math.max(maxRatio,ratio);
  }
  return {faces:region.length,vertices:unique.size,
    rmsPositionErrorMm:+Math.sqrt(sumSq/unique.size).toFixed(5),
    maxPositionErrorMm:+maxMm.toFixed(5),
    meanAbsAreaErrorOverRest:+(areaError/region.length).toFixed(6),
    minAreaOverRest:+minRatio.toFixed(6),
    maxAreaOverRest:+maxRatio.toFixed(6),
    collapsedLtPoint2:collapsed,expandedGt3:expanded,
    opposedToReferenceNormals:normalAgainstFull};
}
describe("C121 independent Kevin Run holdout versus full source LBS",()=>{
  it("compares both shoulders across the entire Run interval without accepting the atlas",()=>{
    const obj=asset("makehuman-base.obj");
    const rawRig=asset("makehuman-default.mhskel");
    const rawWeights=asset("makehuman-default_weights.mhw");
    const rig=JSON.parse(rawRig) as SourceRig;
    const weights=JSON.parse(rawWeights) as SourceWeights;
    expect(atlas.schemaVersion).toBe(1);
    expect(atlas.sourceMeshSha256).toBe(sha(obj));
    expect(atlas.sourceRigSha256).toBe(sha(rawRig));
    expect(atlas.sourceWeightsSha256).toBe(sha(rawWeights));
    expect(atlas.trainingClips).not.toContain("human-kevin-run");
    const human=bindTemplateToSemanticRig(parseAnatomicalOBJ(obj,
      {includeGroups:["body"]}),{rig,weights});
    const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
      jawTipWorldRest:human.jawTipWorldRest,
      forearmSkinBones:human.spike.forearmSkinBones,
      shoulderSkinBones:human.spike.shoulderSkinBones,
    });
    try{
      expect(atlas.sourceVertexCount).toBe(human.template.sourceVertexCount);
      expect(atlas.canonicalJointIds).toEqual(human.spike.graph.joints.map(j=>j.id));
      const roles=new Map(human.spike.graph.joints.map((j,i)=>[j.role,i]));
      const skeleton=human.spike.skeleton;
      const sourceIds=human.template.sourceVertexIds;
      const body=new Set(sourceIds);
      const fullWeights=new Map<number,Map<number,number>>();
      for(const [name,rows] of Object.entries(weights.weights)){
        let mapped:number|undefined;
        const shoulder=/^shoulder01\.(L|R)$/.exec(name);
        const forearm=/^lowerarm01\.(L|R)$/.exec(name);
        if(shoulder||forearm){
          const side=(shoulder??forearm)![1]==="L"?"right":"left";
          const helper=shoulder?human.spike.shoulderSkinBones?.get(side):
            human.spike.forearmSkinBones?.get(side);
          mapped=helper?skeleton.bones.indexOf(helper):undefined;
        }else{
          let current:string|null=name;
          const visited=new Set<string>();
          while(current&&!visited.has(current)){
            visited.add(current);
            const role=sourceWeightRole(current);
            if(role!==undefined)mapped=roles.get(role);
            if(mapped!==undefined)break;
            current=rig.bones[current]?.parent??null;
          }
        }
        if(mapped===undefined||mapped<0)continue;
        for(const [id,w] of rows){
          if(!Number.isSafeInteger(id)||id<0||id>=human.template.sourceVertexCount||
            !Number.isFinite(w)||w<0||w>1)
            throw new Error("Invalid pinned source weight "+name+"/"+id);
          if(!body.has(id)||w===0)continue;
          const bucket=fullWeights.get(id)??new Map<number,number>();
          bucket.set(mapped,(bucket.get(mapped)??0)+w);
          fullWeights.set(id,bucket);
        }
      }
      for(const id of body){
        const bucket=fullWeights.get(id);
        expect(bucket?.size,"Missing valid original source weights "+id).toBeGreaterThan(0);
      }
      const fitted=new Map<number,readonly Influence[]>(atlas.entries);
      expect(fitted.size).toBe(atlas.entries.length);
      expect(fitted.size).toBeGreaterThan(100);
      const gpuIndex=human.mesh.geometry.getAttribute("skinIndex");
      const gpuWeight=human.mesh.geometry.getAttribute("skinWeight");
      for(const [id,entries] of fitted){
        expect(body.has(id),"Non-body atlas source ID "+id).toBe(true);
        expect(entries.length).toBe(4);
        const sum=entries.reduce((s,[index,w])=>{
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(skeleton.bones.length);
          expect(w).toBeGreaterThanOrEqual(0);
          return s+w;
        },0);
        expect(sum).toBeCloseTo(1,6);
        const src=fullWeights.get(id)!;
        for(const [index] of entries)
          expect(src.has(index),"Atlas invented source owner "+index+"/"+id).toBe(true);
      }
      const index=human.mesh.geometry.getIndex()!;
      const rest=human.mesh.geometry.getAttribute("position");
      const bySide={left:new Set<number>(),right:new Set<number>()};
      for(const side of ["left","right"] as const){
        const suffix=side==="left"?".R":".L";
        for(const part of ["shoulder01","clavicle","upperarm01"]){
          for(const [id,w] of weights.weights[part+suffix]??[])
            if(w>.01&&body.has(id))bySide[side].add(id);
        }
      }
      const regions={left:[] as Face[],right:[] as Face[],
        changedLeft:[] as Face[],changedRight:[] as Face[],
        axilla:[] as Face[]};
      const axillaIds=new Set([20356,20357,15844,15871]);
      for(let i=0;i<index.count;i+=3){
        const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)] as const;
        const src=ids.map(id=>sourceIds[id]!) as unknown as
          readonly [number,number,number];
        const points=ids.map(id=>vec(rest,id));
        const restArea=faceSurface(points[0]!,points[1]!,points[2]!).area;
        const item={face:i/3,ids,source:src,restArea};
        for(const side of ["left","right"] as const){
          if(src.some(id=>bySide[side].has(id)))regions[side].push(item);
          if(src.some(id=>fitted.has(id))){
            if(src.some(id=>bySide[side].has(id)))
              (side==="left"?regions.changedLeft:regions.changedRight).push(item);
          }
        }
        if(axillaIds.has(i/3))regions.axilla.push(item);
      }
      for(const side of ["left","right"] as const)
        expect(regions[side].length).toBeGreaterThan(1000);
      expect(regions.changedLeft.length).toBeGreaterThan(100);
      expect(regions.changedRight.length).toBeGreaterThan(100);
      expect(regions.axilla).toHaveLength(4);
      const clip=loadBakedStudioAnimation("human-kevin-run",human.spike.graph);
      const sampler=createAnimationSampler(clip,human.spike.graph);
      for(const t of times){
        fk.applyRestDeltas(sampler.sample(t));
        human.spike.character.root.updateWorldMatrix(true,true);
        const matrices=skeleton.bones.map((bone,i)=>bone.matrixWorld.clone()
          .multiply(skeleton.boneInverses[i]!));
        const fullCache=new Map<number,THREE.Vector3>();
        const gpuCache=new Map<number,THREE.Vector3>();
        const atlasCache=new Map<number,THREE.Vector3>();
        const lbs=(render:number,entries:readonly Influence[]):THREE.Vector3=>{
          const p=vec(rest,render),out=new THREE.Vector3();
          const total=entries.reduce((s,[,w])=>s+w,0);
          if(!(total>0))throw new Error("Unweighted body vertex "+render);
          for(const [owner,w] of entries){
            if(w===0)continue;
            out.addScaledVector(p.clone().applyMatrix4(matrices[owner]!),w/total);
          }
          return out;
        };
        const getFull=(render:number)=>{
          const prior=fullCache.get(render);
          if(prior)return prior;
          const source=sourceIds[render]!;
          const entries=[...fullWeights.get(source)!];
          const result=lbs(render,entries);
          fullCache.set(render,result);return result;
        };
        const getGpu=(render:number)=>{
          const prior=gpuCache.get(render);
          if(prior)return prior;
          const influences=Array.from({length:4},(_,k)=>
            [gpuIndex.getComponent(render,k),gpuWeight.getComponent(render,k)] as const);
          const result=lbs(render,influences);
          gpuCache.set(render,result);return result;
        };
        const getAtlas=(render:number)=>{
          const prior=atlasCache.get(render);
          if(prior)return prior;
          const result=fitted.has(sourceIds[render]!)?
            lbs(render,fitted.get(sourceIds[render]!)!):getGpu(render);
          atlasCache.set(render,result);return result;
        };
        for(const side of ["left","right"] as const){
          const region=regions[side];
          const changed=side==="left"?regions.changedLeft:regions.changedRight;
          const metrics={
            time:t,side,affectedFaces:changed.length,
            source:summarize(region,getFull,getFull),
            baseline:summarize(region,getGpu,getFull),
            fitted:summarize(region,getAtlas,getFull),
            changedBaseline:summarize(changed,getGpu,getFull),
            changedFitted:summarize(changed,getAtlas,getFull),
          };
          console.log("TRILOK_C121_HOLDOUT "+JSON.stringify(metrics));
        }
        const lower=regions.axilla.map(f=>{
          const reference=faceSurface(...(f.ids.map(getFull) as
            [THREE.Vector3,THREE.Vector3,THREE.Vector3]));
          const current=faceSurface(...(f.ids.map(getGpu) as
            [THREE.Vector3,THREE.Vector3,THREE.Vector3]));
          const candidate=faceSurface(...(f.ids.map(getAtlas) as
            [THREE.Vector3,THREE.Vector3,THREE.Vector3]));
          return {face:f.face,full:+(reference.area/f.restArea).toFixed(6),
            gpu:+(current.area/f.restArea).toFixed(6),
            atlas:+(candidate.area/f.restArea).toFixed(6)};
        });
        console.log("TRILOK_C121_AXILLA_HOLDOUT "+JSON.stringify({time:t,faces:lower}));
      }
      fk.applyRestDeltas([]);
    }finally{human.dispose();}
  },120_000);
});
