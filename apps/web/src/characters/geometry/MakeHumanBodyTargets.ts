import * as THREE from "three";
import type {AnatomicalHuman} from "./AnatomicalTemplate";
import {recomputeSourceNormals} from "./HumanLocalDeformation";
import {captureHumanRestSockets,calibrateHumanMorphologyAlignment} from "./HumanMorphologyAlignment";
import {registerHumanSourceBodyAlignment} from "./HumanMorphology";
import {NATIVE_MAKEHUMAN_BODY_MODIFIERS} from "./NativeMakeHumanBodyControls";

/** C3.6: source-indexed, topology-preserving original MakeHuman CC0 body targets.
 * Supports native direct modifier endpoint behavior and explicit macro interpolation.
 * Native MakeHuman executable/oracle equivalence remains a separate acceptance gate. */
export type BodyTarget=Readonly<{id:string;rows:readonly number[]}>;
export type BodyAtlas=Readonly<{
  payload:Readonly<{schemaVersion:1;revision:string;license:"CC0-1.0";
    units:"MakeHuman source coordinates";sourceManifestHash:string;
    targets:readonly BodyTarget[]}>;
  contentDigest:string;
}>;
export type BodyWeights=Readonly<Record<string,number>>;
export type BodyControl=Readonly<{
  id:string;label:string;group:string;min:number;max:number;
  nativeMin:number;nativeMax:number;negative?:string;positive?:string;
}>;
export const PINNED_BODY_REVISION="a8bc2d54ff0ac92e78ff71431b1023eda42bf482";
export const BODY_CONTROLS:readonly BodyControl[]=[
  ...NATIVE_MAKEHUMAN_BODY_MODIFIERS.map(m=>({
    id:"native/"+m.id,label:m.target.replace(/-/g," "),
    group:m.group==="armslegs"?
      (/hand|finger|thumb/.test(m.target)?"Hands & fingers":
       /foot|toe/.test(m.target)?"Feet & toes":
       /leg|knee|calf/.test(m.target)?"Legs":"Arms"):
      m.group==="measure"?"Measurements":m.group,
    min:m.nativeMin===-1?-1.25:0,max:1.25,
    nativeMin:m.nativeMin,nativeMax:1,
    positive:m.positive,negative:"negative" in m?m.negative:undefined,
  })),
  ...[
    ["sex","Sex (female to male)",.5],
    ["age","Age (baby to old)",.5],
    ["african","African ancestry",1/3],
    ["asian","Asian ancestry",1/3],
    ["caucasian","Caucasian ancestry",1/3],
    ["weight","Weight (min to max)",.5],
    ["muscle","Muscularity (min to max)",.5],
    ["height","Stature (min to max)",.5],
    ["proportions","Body proportions (uncommon to ideal)",.5],
    ["breastSize","Breast cup size",.5],
    ["breastFirmness","Breast firmness",.5],
  ].map(([id,label,initial])=>({
    id:"macro/"+id,label:String(label)+" · neutral "+initial,
    group:"Macro anatomy",min:0,max:1,nativeMin:0,nativeMax:1,
  })),
  {id:"stress/gain",label:"Extra displacement gain (unsupported extrapolation)",
    group:"Stress inspection",min:0,max:1.5,nativeMin:0,nativeMax:1},
];
export const BODY_MACRO_DEFAULTS:Readonly<BodyWeights>=Object.freeze({
  "macro/sex":.5,"macro/age":.5,"macro/african":1/3,
  "macro/asian":1/3,"macro/caucasian":1/3,
  "macro/weight":.5,"macro/muscle":.5,"macro/height":.5,
  "macro/proportions":.5,"macro/breastSize":.5,
  "macro/breastFirmness":.5,"stress/gain":1,
});
export const BODY_PRESETS:Readonly<Record<string,BodyWeights>>={
  neutral:{},
  athletic:{"macro/muscle":.9,"macro/weight":.4},
  muscular:{"macro/muscle":1,"macro/weight":.65},
  heavy:{"macro/weight":1,"macro/muscle":.35},
  lean:{"macro/weight":.1,"macro/muscle":.45},
  tall:{"macro/height":1},
  short:{"macro/height":0},
  wideShoulders:{"native/torso/torso-scale-horiz-decr-incr":1},
  longArms:{"native/measure/measure-upperarm-length-decr-incr":1},
  largeHands:{"native/armslegs/l-hand-scale-decr-incr":1,
    "native/armslegs/r-hand-scale-decr-incr":1},
  wideHips:{"native/hip/hip-scale-horiz-decr-incr":1},
  stress:{"native/torso/torso-scale-horiz-decr-incr":1.25,
    "native/hip/hip-scale-horiz-decr-incr":-1.25,
    "native/armslegs/l-hand-fingers-length-decr-incr":1.25,
    "native/armslegs/r-hand-fingers-length-decr-incr":-1.25,
    "macro/weight":1,"macro/muscle":1,"macro/height":1,
    "stress/gain":1.5},
};
const bodyMap=new Map(BODY_CONTROLS.map(c=>[c.id,c]));
export function validateBodyWeights(weights:BodyWeights):void{
  if(!weights||typeof weights!=="object"||Array.isArray(weights))
    throw new Error("Invalid C3.6 body recipe");
  for(const [id,value] of Object.entries(weights)){
    const c=bodyMap.get(id);
    if(!c||!Number.isFinite(value)||value<c.min||value>c.max)
      throw new Error("C3.6 body parameter outside preview range: "+id);
  }
  const ancestry=["african","asian","caucasian"].map(k=>
    weights["macro/"+k]??1/3);
  if(Math.abs(ancestry.reduce((a,n)=>a+n,0)-1)>1e-7)
    throw new Error("MakeHuman native ancestry weights must sum to 1");
}
export function validateBodyAtlas(atlas:BodyAtlas,sourceCount:number):ReadonlyMap<string,BodyTarget>{
  if(atlas?.payload?.schemaVersion!==1||
     atlas.payload.revision!==PINNED_BODY_REVISION||
     atlas.payload.license!=="CC0-1.0"||
     atlas.payload.units!=="MakeHuman source coordinates"||
     !/^[a-f0-9]{64}$/.test(atlas.payload.sourceManifestHash)||
     !/^[a-f0-9]{64}$/.test(atlas.contentDigest)||
     !Array.isArray(atlas.payload.targets)||atlas.payload.targets.length!==846||
     !Number.isSafeInteger(sourceCount)||sourceCount<=0)
    throw new Error("Invalid pinned MakeHuman C3.6 body atlas");
  const result=new Map<string,BodyTarget>();
  for(const t of atlas.payload.targets){
    if(!/^(neck|torso|hip|stomach|buttocks|pelvis|armslegs|breast|genitals|bodyshapes|measure|macrodetails)(\/|$)/.test(t.id)||
       result.has(t.id)||!Array.isArray(t.rows)||t.rows.length%4!==0||
       t.rows.length>sourceCount*4)
      throw new Error("Malformed MakeHuman source body target "+t.id);
    const seen=new Set<number>();
    for(let i=0;i<t.rows.length;i+=4){
      const id=t.rows[i]!;
      if(!Number.isSafeInteger(id)||id<0||id>=sourceCount||seen.has(id)||
         t.rows.slice(i+1,i+4).some((x:number)=>!Number.isFinite(x)||Math.abs(x)>100))
        throw new Error("Invalid source body vertex "+t.id);
      seen.add(id);
    }
    result.set(t.id,t);
  }
  for(const c of BODY_CONTROLS){
    if(c.positive&&!result.has(c.positive))throw new Error("Missing body target "+c.positive);
    if(c.negative&&!result.has(c.negative))throw new Error("Missing body target "+c.negative);
  }
  return result;
}
/** Piecewise macro interpolation with an explicit neutral midpoint.
 * Actual MakeHuman macro modifiers additionally involve dependency recalculation;
 * comparison against the upstream executable is required for parity acceptance. */
function axes(value:number,names:readonly string[],anchors:readonly number[]):
  readonly (readonly [string,number])[]{
  if(value<=anchors[0]!)return [[names[0]!,1]];
  for(let i=1;i<anchors.length;i++)if(value<=anchors[i]!){
    const t=(value-anchors[i-1]!)/(anchors[i]!-anchors[i-1]!);
    return [[names[i-1]!,1-t],[names[i]!,t]];
  }
  return [[names.at(-1)!,1]];
}
/** Pinned MakeHuman Human._setAgeVals exact native factor constants. */
function ageAxis(v:number):readonly (readonly [string,number])[]{
  if(v<.5){
    const baby=Math.max(0,1-v*5.333);
    const young=Math.max(0,(v-.1875)*3.2);
    const child=Math.max(0,Math.min(1,5.333*v)-young);
    return [["baby",baby],["child",child],["young",young]];
  }
  const old=Math.max(0,2*v-1);
  return [["young",1-old],["old",old]];
}
const rangeAxis=(v:number,prefix:string)=>axes(v,
  ["min"+prefix,"average"+prefix,"max"+prefix],[0,.5,1]);
const sexAxis=(v:number)=>[["female",1-v],["male",v]] as const;
const ancestryAxis=(african:number,asian:number,caucasian:number)=>
  [["caucasian",caucasian],["african",african],["asian",asian]] as const;
/** Original MakeHuman height/proportion macro targets have no center target.
 * Default 0.5 is strictly ZERO weight, not 50% of each extreme. */
const extremeAxis=(value:number,lo:string,hi:string):readonly (readonly [string,number])[]=>[
  [lo,Math.max(0,1-2*value)],[hi,Math.max(0,2*value-1)],
];
/** Native MakeHuman ethnic slider normalization: retain edited channel and
 * renormalize the remaining two in their prior ratio (equal if both zero). */
export function setBodyAncestryChannel(previous:BodyWeights,
  edited:"african"|"asian"|"caucasian",value:number):BodyWeights{
  if(!Number.isFinite(value)||value<0||value>1)
    throw new Error("Invalid MakeHuman ancestry channel");
  const channels=["african","asian","caucasian"] as const;
  const others=channels.filter(k=>k!==edited);
  const prior=others.map(k=>previous["macro/"+k]??1/3);
  const total=prior[0]!+prior[1]!;
  return {...previous,["macro/"+edited]:value,
    ["macro/"+others[0]!]:total>0?(1-value)*prior[0]!/total:(1-value)/2,
    ["macro/"+others[1]!]:total>0?(1-value)*prior[1]!/total:(1-value)/2};
}
/** Numerically stable, sorted target factors; independent of recipe key order. */
export function resolveBodyMacroFactors(weights:BodyWeights):ReadonlyMap<string,number>{
  validateBodyWeights(weights);
  const w=(key:string)=>weights["macro/"+key]??BODY_MACRO_DEFAULTS["macro/"+key]!;
  const result=new Map<string,number>();
  const add=(id:string,value:number)=>{
    if(value!==0)result.set(id,(result.get(id)??0)+value);
  };
  const neutral=["sex","age","african","asian","caucasian","muscle","weight","height","proportions","breastSize","breastFirmness"]
    .every(k=>w(k)===BODY_MACRO_DEFAULTS["macro/"+k]);
  if(neutral)return result;
  for(const [race,raceW] of ancestryAxis(w("african"),w("asian"),w("caucasian")))
    for(const [sex,sexW] of sexAxis(w("sex")))
      for(const [age,ageW] of ageAxis(w("age"))){
        const factor=raceW*sexW*ageW;
        add("macrodetails/"+race+"-"+sex+"-"+age,factor);
      }
  // Rest-corrected macro ancestry/age/gender: same shape baseline on first load.
  for(const [race,raceW] of ancestryAxis(1/3,1/3,1/3))
    for(const [sex,sexW] of sexAxis(.5))
      add("macrodetails/"+race+"-"+sex+"-young",-raceW*sexW);
  const distributions=(sex:string,age:string,factor:number)=>{
    for(const [muscle,muscleW] of rangeAxis(w("muscle"),"muscle"))
      for(const [weight,weightW] of rangeAxis(w("weight"),"weight")){
        const f=factor*muscleW*weightW;
        add("macrodetails/universal-"+sex+"-"+age+"-"+muscle+"-"+weight,f);
        for(const [height,heightW] of extremeAxis(w("height"),"minheight","maxheight"))
          add("macrodetails/height/"+sex+"-"+age+"-"+muscle+"-"+weight+"-"+height,
            f*heightW);
        if(age!=="baby")for(const [p,pW] of extremeAxis(w("proportions"),
          "uncommonproportions","idealproportions"))
          add("macrodetails/proportions/"+sex+"-"+age+"-"+muscle+"-"+weight+"-"+p,
            f*pW);
      }
  };
  for(const [sex,sexW] of sexAxis(w("sex")))
    for(const [age,ageW] of ageAxis(w("age")))
      distributions(sex,age,sexW*ageW);
  // Native MakeHuman breast macro targets omit the neutral average/average
  // cell; the remaining eight corners are CC0 targets conditioned on female,
  // age, muscle, weight, cup size and firmness.
  if(w("breastSize")!==.5||w("breastFirmness")!==.5||
     w("sex")!==.5||w("age")!==.5||w("muscle")!==.5||w("weight")!==.5){
    for(const [age,ageW] of ageAxis(w("age"))){
      if(age==="baby")continue; // upstream corpus has only child/young/old
      for(const [muscle,muscleW] of rangeAxis(w("muscle"),"muscle"))
        for(const [weight,weightW] of rangeAxis(w("weight"),"weight"))
          for(const [cup,cupW] of axes(w("breastSize"),
            ["mincup","averagecup","maxcup"],[0,.5,1]))
            for(const [firm,firmW] of axes(w("breastFirmness"),
              ["minfirmness","averagefirmness","maxfirmness"],[0,.5,1])){
              if(cup==="averagecup"&&firm==="averagefirmness")continue;
              add("breast/female-"+age+"-"+muscle+"-"+weight+"-"+cup+"-"+firm,
                (1-w("sex"))*ageW*muscleW*weightW*cupW*firmW);
            }
    }
  }
  // Subtract canonical macro middle rather than stacking a hidden default shape.
  const baselines=(sex:string,age:string,factor:number)=>{
    const m="averagemuscle-averageweight";
    add("macrodetails/universal-"+sex+"-"+age+"-"+m,-factor);

  };
  for(const [sex,sexW] of sexAxis(.5))baselines(sex,"young",sexW);
  return new Map([...result].filter(([,v])=>Math.abs(v)>1e-12).sort(([a],[b])=>a.localeCompare(b)));
}
export type BodyDiagnostics=Readonly<{affectedVertices:number;seamMismatches:number;
  finiteFailures:number;collapsedTriangles:number;invertedTriangles:number;
  stretchedTriangles:number;maxEdgeStretch:number;triangleCount:number;elapsedMs:number;
  activeTargets:number;unsupportedExtrapolation:boolean}>;
export class MakeHumanBodyController {
  private readonly baseline:Float32Array;
  private readonly position:THREE.BufferAttribute|THREE.InterleavedBufferAttribute;
  private readonly sourceToRender:ReadonlyMap<number,readonly number[]>;
  private readonly atlas:ReadonlyMap<string,BodyTarget>;
  private readonly human:AnatomicalHuman;
  private readonly originalJoints:readonly THREE.Vector3[];
  /** Jaw landmark stored in root-local rest coordinates, not stale world space. */
  private readonly originalJawTipRoot?:THREE.Vector3;
  private readonly originalSockets:ReturnType<typeof captureHumanRestSockets>;
  /** Original skin-influence-weighted surface samples, selected once per bone. */
  private readonly boneSamples:readonly (readonly (readonly [number,number])[])[];
  private disposed=false;
  constructor(human:AnatomicalHuman,atlas:BodyAtlas){
    this.human=human;
    this.assertNeutralRest();
    this.atlas=validateBodyAtlas(atlas,human.template.sourceVertexCount);
    this.position=human.mesh.geometry.getAttribute("position");
    if(!this.position||this.position.itemSize!==3||
       this.position.count!==human.template.sourceVertexIds.length)
      throw new Error("C3.6 requires original MakeHuman topology correspondence");
    this.baseline=Float32Array.from(this.position.array as ArrayLike<number>);
    const mapping=new Map<number,number[]>();
    human.template.sourceVertexIds.forEach((id,index)=>{
      const items=mapping.get(id)??[];
      items.push(index);mapping.set(id,items);
    });
    this.sourceToRender=mapping;
    const {spike}=human;
    spike.character.root.updateMatrixWorld(true);
    const inverseRoot=spike.character.root.matrixWorld.clone().invert();
    this.originalJoints=spike.skeleton.bones.map(bone=>
      bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseRoot));
    this.originalJawTipRoot=human.jawTipWorldRest?.clone().applyMatrix4(inverseRoot);
    this.originalSockets=captureHumanRestSockets(human);
    const skinIndex=human.mesh.geometry.getAttribute("skinIndex");
    const skinWeight=human.mesh.geometry.getAttribute("skinWeight");
    if(!skinIndex||!skinWeight)throw new Error("C3.6 requires original source skin ownership");
    this.boneSamples=this.originalJoints.map((joint,boneIndex)=>{
      const candidates:Array<{id:number;score:number;weight:number}>=[];
      for(let i=0;i<this.position.count;i++){
        let influence=0;
        for(let k=0;k<4;k++)
          if(skinIndex.getComponent(i,k)===boneIndex)
            influence+=skinWeight.getComponent(i,k);
        if(influence<.035)continue;
        const offset=i*3;
        const dx=this.baseline[offset]!-joint.x;
        const dy=this.baseline[offset+1]!-joint.y;
        const dz=this.baseline[offset+2]!-joint.z;
        const distanceSq=dx*dx+dy*dy+dz*dz;
        const score=distanceSq/Math.max(influence,.1);
        candidates.push({id:human.template.sourceVertexIds[i]!,score,
          weight:influence/Math.max(distanceSq,.0002)});
      }
      candidates.sort((a,b)=>a.score-b.score||a.id-b.id);
      const picked=candidates.slice(0,24);
      const summed=picked.reduce((acc,item)=>acc+item.weight,0);
      return picked.map(item=>[item.id,item.weight/summed] as const);
    });
  }
  /** Rebinding a posed skeleton would silently bake FK motion into its rest bind.
   * In attached binding mode the mesh bind inverse cancels any whole-character
   * translation or rotation, so legitimate root motion is still allowed. */
  private assertNeutralRest():void{
    const {spike}=this.human;
    spike.character.root.updateMatrixWorld(true);
    const inverseRoot=spike.character.root.matrixWorld.clone().invert();
    for(let i=0;i<spike.skeleton.bones.length;i++){
      const skin=new THREE.Matrix4().multiplyMatrices(
        inverseRoot,spike.skeleton.bones[i]!.matrixWorld)
        .multiply(spike.skeleton.boneInverses[i]!);
      if(skin.elements.some((v,j)=>Math.abs(v-(j%5===0?1:0))>1e-5))
        throw new Error("C3.6 body morphology requires a neutral-pose rest skeleton");
    }
  }
  apply(weights:BodyWeights):BodyDiagnostics{
    if(this.disposed)throw new Error("C3.6 body controller disposed");
    validateBodyWeights(weights);
    this.assertNeutralRest();
    const start=performance.now();
    const gain=weights["stress/gain"]??1;
    const scale=this.human.template.conversionMetersPerSourceUnit*gain;
    const delta=new Float64Array(this.human.template.sourceVertexCount*3);
    const factors=new Map<string,number>();
    for(const control of BODY_CONTROLS){
      if(!control.positive)continue;
      const value=weights[control.id]??0;
      if(!value)continue;
      const id=value<0?control.negative!:control.positive;
      factors.set(id,(factors.get(id)??0)+Math.abs(value));
    }
    for(const [id,value] of resolveBodyMacroFactors(weights))
      factors.set(id,(factors.get(id)??0)+value);
    let activeTargets=0;
    for(const [id,factor] of [...factors].sort(([a],[b])=>a.localeCompare(b))){
      if(!factor)continue;
      const target=this.atlas.get(id);
      if(!target)throw new Error("Missing pinned MakeHuman macro target "+id);
      activeTargets++;
      for(let i=0;i<target.rows.length;i+=4){
        const index=target.rows[i]!*3;
        delta[index]=(delta[index]??0)+target.rows[i+1]!*factor*scale;
        delta[index+1]=(delta[index+1]??0)+target.rows[i+2]!*factor*scale;
        delta[index+2]=(delta[index+2]??0)+target.rows[i+3]!*factor*scale;
      }
    }
    const staged=Float32Array.from(this.baseline);
    let affectedVertices=0,finiteFailures=0,seamMismatches=0;
    for(const [source,renderIds] of this.sourceToRender){
      const offset=source*3;
      const shift=[delta[offset]!,delta[offset+1]!,delta[offset+2]!];
      if(shift.some(x=>x!==0))affectedVertices++;
      for(const render of renderIds){
        const k=render*3;
        for(let axis=0;axis<3;axis++){
          const v=this.baseline[k+axis]!+shift[axis]!;
          if(!Number.isFinite(v))finiteFailures++;
          staged[k+axis]=v;
        }
      }
      for(let j=1;j<renderIds.length;j++){
        const a=renderIds[0]!*3,b=renderIds[j]!*3;
        for(let k=0;k<3;k++)
          if(Math.abs((staged[a+k]!-this.baseline[a+k]!)-
            (staged[b+k]!-this.baseline[b+k]!))>1e-6)seamMismatches++;
      }
    }
    if(finiteFailures||seamMismatches)throw new Error("Invalid C3.6 staged deformation");
    let collapsedTriangles=0,invertedTriangles=0,stretchedTriangles=0,maxEdgeStretch=1;
    const indices=this.human.mesh.geometry.getIndex()?.array;
    if(indices)for(let i=0;i<indices.length;i+=3){
      const a=Number(indices[i])*3,b=Number(indices[i+1])*3,c=Number(indices[i+2])*3;
      const cross=(values:Float32Array)=>{
        const x=values[b]!-values[a]!,y=values[b+1]!-values[a+1]!,z=values[b+2]!-values[a+2]!;
        const u=values[c]!-values[a]!,v=values[c+1]!-values[a+1]!,w=values[c+2]!-values[a+2]!;
        return [y*w-z*v,z*u-x*w,x*v-y*u] as const;
      };
      const before=cross(this.baseline),after=cross(staged);
      const old=Math.hypot(...before),now=Math.hypot(...after);
      if(old>1e-12&&now<old*.03)collapsedTriangles++;
      if(old>1e-12&&now>1e-12&&before.reduce((sum,n,k)=>sum+n*after[k]!,0)<0)
        invertedTriangles++;
      if(old>1e-12&&now/old>4)stretchedTriangles++;
      for(const [u,v] of [[a,b],[b,c],[c,a]] as const){
        const length=(values:Float32Array)=>
          Math.hypot(values[u]!-values[v]!,values[u+1]!-values[v+1]!,
            values[u+2]!-values[v+2]!);
        const initial=length(this.baseline);
        if(initial>1e-9)maxEdgeStretch=Math.max(maxEdgeStretch,length(staged)/initial);
      }
    }
    // Apply vertex/rig changes as one neutral-rest operation. Refit inverse
    // binds and semantic joint positions from the same original CC0 source
    // deltas; no root scaling or extra topology is introduced.
    const {spike}=this.human;
    const shifted=this.originalJoints.map((original,i)=>{
      const position=original.clone();
      const samples=this.boneSamples[i]!;
      if(samples.length){
        for(const [source,weight] of samples){
          const offset=source*3;
          position.x+=delta[offset]!*weight;
          position.y+=delta[offset+1]!*weight;
          position.z+=delta[offset+2]!*weight;
        }
      }
      return position;
    });
    if(shifted.some(p=>!p.toArray().every(Number.isFinite)))
      throw new Error("Nonfinite MakeHuman source-derived C1 joint alignment");
    const sockets=this.originalSockets;
    const root=spike.character.root;
    root.updateMatrixWorld(true);
    const rootWorld=root.matrixWorld.clone();
    for(let i=0;i<spike.skeleton.bones.length;i++){
      const bone=spike.skeleton.bones[i]!;
      if(!bone.parent)throw new Error("C3.6 skeleton parent missing");
      bone.parent.updateWorldMatrix(true,false);
      bone.position.copy(bone.parent.worldToLocal(
        shifted[i]!.clone().applyMatrix4(rootWorld)));
      bone.updateMatrixWorld(true);
    }
    root.updateMatrixWorld(true);
    spike.skeleton.calculateInverses();
    if(this.human.jawTipWorldRest&&this.originalJawTipRoot){
      const jaw=spike.graph.joints.findIndex(j=>j.role==="jaw");
      const local=this.originalJawTipRoot.clone();
      if(jaw>=0)local.add(shifted[jaw]!.clone().sub(this.originalJoints[jaw]!));
      this.human.jawTipWorldRest.copy(local.applyMatrix4(rootWorld));
    }
    const mapJoint=(point:THREE.Vector3,index:number):THREE.Vector3=>
      index>=0&&index<shifted.length?
        point.add(shifted[index]!.clone().sub(this.originalJoints[index]!)):point;
    registerHumanSourceBodyAlignment(this.human,
      calibrateHumanMorphologyAlignment(this.human,sockets,mapJoint));
    for(let i=0;i<this.position.count;i++)
      this.position.setXYZ(i,staged[i*3]!,staged[i*3+1]!,staged[i*3+2]!);
    this.position.needsUpdate=true;
    recomputeSourceNormals(this.human);
    this.human.mesh.geometry.computeBoundingSphere();
    this.human.mesh.geometry.computeBoundingBox();
    const unsupportedExtrapolation=gain>1||BODY_CONTROLS.some(c=>
      c.positive&&Math.abs(weights[c.id]??0)>1);
    return {affectedVertices,finiteFailures,seamMismatches,collapsedTriangles,
      invertedTriangles,stretchedTriangles,maxEdgeStretch,
      triangleCount:(indices?.length??0)/3,elapsedMs:performance.now()-start,
      activeTargets,unsupportedExtrapolation};
  }
  dispose():void{this.disposed=true;}
}
let request:Promise<BodyAtlas>|undefined;
type BodyChunkIndex=Readonly<{schemaVersion:1;revision:string;license:"CC0-1.0";
  sourceManifestHash:string;targetCount:number;
  chunks:readonly Readonly<{name:string;targetCount:number;sha256:string;
    compressedBytes:number;jsonSha256:string;jsonBytes:number}>[]}>;
async function checkedBodyChunk(chunk:BodyChunkIndex["chunks"][number],
  signal?:AbortSignal):Promise<readonly BodyTarget[]>{
  if(!/^makehuman-body-v1-[0-9]{3}\.json\.gz$/.test(chunk.name)||
     chunk.compressedBytes<=0||chunk.compressedBytes>12*1024*1024||
     !/^[a-f0-9]{64}$/.test(chunk.sha256))
    throw new Error("Malformed C3.6 source chunk index");
  const response=await fetch("/anatomy/"+chunk.name,{signal});
  if(!response.ok)throw new Error("Missing pinned C3.6 chunk "+chunk.name);
  const bytes=await response.arrayBuffer();
  const digest=async(buffer:ArrayBuffer):Promise<string>=>
    Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer)))
      .map(v=>v.toString(16).padStart(2,"0")).join("");
  if(!/^[a-f0-9]{64}$/.test(chunk.jsonSha256)||
     chunk.jsonBytes<=0||chunk.jsonBytes>16*1024*1024)
    throw new Error("Malformed original MakeHuman decompressed source chunk");
  let payload:{targets:BodyTarget[]};
  const data=new Uint8Array(bytes);
  if(data[0]===0x1f&&data[1]===0x8b){
    // Browser received the actual gzip archive.
    if(bytes.byteLength!==chunk.compressedBytes||
       await digest(bytes)!==chunk.sha256)
      throw new Error("C3.6 original compressed body checksum mismatch "+chunk.name);
    if(typeof DecompressionStream!=="function")
      throw new Error("Browser lacks original target gzip decompression");
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const raw=await new Response(stream).arrayBuffer();
    if(raw.byteLength!==chunk.jsonBytes||
       await digest(raw)!==chunk.jsonSha256)
      throw new Error("C3.6 original decompressed body checksum mismatch "+chunk.name);
    payload=JSON.parse(new TextDecoder().decode(raw)) as {targets:BodyTarget[]};
  }else{
    // A CDN/server may perform transparent Content-Encoding gzip decoding.
    // Validate identical uncompressed bytes instead of decoding a second time.
    if(bytes.byteLength!==chunk.jsonBytes||
       await digest(bytes)!==chunk.jsonSha256)
      throw new Error("C3.6 original decoded body checksum mismatch "+chunk.name);
    payload=JSON.parse(new TextDecoder().decode(bytes)) as {targets:BodyTarget[]};
  }
  if(!Array.isArray(payload.targets)||payload.targets.length!==chunk.targetCount)
    throw new Error("C3.6 source chunk target count mismatch "+chunk.name);
  return payload.targets;
}
export async function loadBodyAtlas(signal?:AbortSignal):Promise<BodyAtlas>{
  if(!request)request=(async()=>{
    const response=await fetch("/anatomy/makehuman-body-v1-index.json",{signal});
    if(!response.ok)throw new Error("Pinned MakeHuman C3.6 body index unavailable");
    const index=await response.json() as BodyChunkIndex;
    if(index.schemaVersion!==1||index.revision!==PINNED_BODY_REVISION||
       index.license!=="CC0-1.0"||index.targetCount!==846||
       !/^[a-f0-9]{64}$/.test(index.sourceManifestHash)||
       !Array.isArray(index.chunks)||index.chunks.length<2||index.chunks.length>100)
      throw new Error("Invalid source-indexed MakeHuman body manifest");
    const parts:BodyTarget[][]=[];
    // Controlled concurrency bounds browser bandwidth and decompression peaks.
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,index.chunks.length)},async()=>{
      while(cursor<index.chunks.length){
        const id=cursor++;
        parts[id]=[...await checkedBodyChunk(index.chunks[id]!,signal)];
      }
    }));
    const targets=parts.flat();
    if(targets.length!==846||new Set(targets.map(t=>t.id)).size!==846)
      throw new Error("Incomplete C3.6 original MakeHuman source body atlas");
    return {payload:{schemaVersion:1,revision:index.revision,license:"CC0-1.0",
      units:"MakeHuman source coordinates",sourceManifestHash:index.sourceManifestHash,
      targets},contentDigest:index.sourceManifestHash} as BodyAtlas;
  })().catch(e=>{request=undefined;throw e;});
  return request;
}
