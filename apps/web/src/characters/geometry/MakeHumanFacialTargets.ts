import {NATIVE_MAKEHUMAN_FACE_MODIFIERS,NATIVE_MAKEHUMAN_EXPRESSION_UNITS} from "./NativeMakeHumanFacialControls";
import * as THREE from "three";
import type {AnatomicalHuman} from "./AnatomicalTemplate";
import {recomputeSourceNormals} from "./HumanLocalDeformation";

/** MakeHuman's original source-indexed sparse facial deltas; CC0 asset, no GPL runtime. */
export interface FacialTarget {
  readonly id:string;
  readonly rows:readonly number[];
}
export interface FacialAtlas {
  readonly payload:{
    readonly schemaVersion:1;
    readonly revision:string;
    readonly license:"CC0-1.0";
    readonly units:"MakeHuman source coordinates";
    readonly sourceManifestHash:string;
    readonly targets:readonly FacialTarget[];
  };
  readonly contentDigest:string;
}
export const PINNED_FACIAL_REVISION="a8bc2d54ff0ac92e78ff71431b1023eda42bf482";
const MAX_TARGETS=512;
const MAX_ENTRIES=20000;
const maxAbs=10;
export function validateFacialAtlas(atlas:FacialAtlas,sourceCount:number):ReadonlyMap<string,FacialTarget> {
  if(atlas?.payload?.schemaVersion!==1||
     atlas.payload.revision!==PINNED_FACIAL_REVISION||
     atlas.payload.license!=="CC0-1.0"||
     atlas.payload.units!=="MakeHuman source coordinates"||
     !/^[a-f0-9]{64}$/.test(atlas.payload.sourceManifestHash)||
     !/^[a-f0-9]{64}$/.test(atlas.contentDigest)||
     !Array.isArray(atlas.payload.targets)||
     atlas.payload.targets.length<50||atlas.payload.targets.length>MAX_TARGETS||
     !Number.isSafeInteger(sourceCount)||sourceCount<=0)
    throw new Error("Invalid pinned MakeHuman C3.5 facial atlas metadata");
  const map=new Map<string,FacialTarget>();
  for(const target of atlas.payload.targets){
    if(typeof target.id!=="string"||
       !/^(expression\/units\/(caucasian|asian|african)|head|forehead|eyebrows|eyes|nose|cheek|mouth|chin|ears|asym)\/[a-z0-9/-]+$/.test(target.id)||
       map.has(target.id)||!Array.isArray(target.rows)||
       target.rows.length<4||target.rows.length>MAX_ENTRIES*4||
       target.rows.length%4!==0)
      throw new Error("Invalid facial target "+target?.id);
    const seen=new Set<number>();
    for(let i=0;i<target.rows.length;i+=4){
      const id=target.rows[i]!;
      if(!Number.isSafeInteger(id)||id<0||id>=sourceCount||seen.has(id)||
         target.rows.slice(i+1,i+4).some((n:number)=>!Number.isFinite(n)||Math.abs(n)>maxAbs))
        throw new Error("Invalid source facial displacement: "+target.id);
      seen.add(id);
    }
    map.set(target.id,target);
  }
  return map;
}
export type FacialControl = Readonly<{
  id:string; label:string; group:string;
  negative?:string; positive:string;
  min:number; max:number; description?:string;
}>;
/** Signed modifiers select *original* positive/negative MakeHuman targets.
 * Independent unilateral expression deltas use 0..1.
 * Values beyond 1 extrapolate the authentic source delta for explicit stress inspection. */
export const FACIAL_CONTROLS:readonly FacialControl[]=[
  {id:"leftLid",label:"Left eyelid closure",group:"Eyes",positive:"expression/units/caucasian/eye-left-closure",min:0,max:1.25},
  {id:"rightLid",label:"Right eyelid closure",group:"Eyes",positive:"expression/units/caucasian/eye-right-closure",min:0,max:1.25},
  {id:"leftEyeOpen",label:"Left upper eyelid opening",group:"Eyes",positive:"expression/units/caucasian/eye-left-opened-up",min:0,max:1.25},
  {id:"rightEyeOpen",label:"Right upper eyelid opening",group:"Eyes",positive:"expression/units/caucasian/eye-right-opened-up",min:0,max:1.25},
  {id:"leftEyeHeight",label:"Left eye aperture height",group:"Eyes",negative:"eyes/l-eye-height2-decr",positive:"eyes/l-eye-height2-incr",min:-1.25,max:1.25},
  {id:"rightEyeHeight",label:"Right eye aperture height",group:"Eyes",negative:"eyes/r-eye-height2-decr",positive:"eyes/r-eye-height2-incr",min:-1.25,max:1.25},
  {id:"leftInnerEye",label:"Left inner eye corner",group:"Eyes",negative:"eyes/l-eye-corner1-down",positive:"eyes/l-eye-corner1-up",min:-1.25,max:1.25},
  {id:"rightInnerEye",label:"Right inner eye corner",group:"Eyes",negative:"eyes/r-eye-corner1-down",positive:"eyes/r-eye-corner1-up",min:-1.25,max:1.25},
  {id:"leftOuterEye",label:"Left outer eye corner",group:"Eyes",negative:"eyes/l-eye-corner2-down",positive:"eyes/l-eye-corner2-up",min:-1.25,max:1.25},
  {id:"rightOuterEye",label:"Right outer eye corner",group:"Eyes",negative:"eyes/r-eye-corner2-down",positive:"eyes/r-eye-corner2-up",min:-1.25,max:1.25},
  {id:"leftEyeBag",label:"Left lower eye bag",group:"Eyes",negative:"eyes/l-eye-bag-decr",positive:"eyes/l-eye-bag-incr",min:-1.25,max:1.25},
  {id:"rightEyeBag",label:"Right lower eye bag",group:"Eyes",negative:"eyes/r-eye-bag-decr",positive:"eyes/r-eye-bag-incr",min:-1.25,max:1.25},
  {id:"leftBrow",label:"Left brow elevation",group:"Brows",negative:"expression/units/caucasian/eyebrows-left-down",positive:"expression/units/caucasian/eyebrows-left-up",min:-1.25,max:1.25},
  {id:"rightBrow",label:"Right brow elevation",group:"Brows",negative:"expression/units/caucasian/eyebrows-right-down",positive:"expression/units/caucasian/eyebrows-right-up",min:-1.25,max:1.25},
  {id:"leftInnerBrow",label:"Left inner brow lift",group:"Brows",positive:"expression/units/caucasian/eyebrows-left-inner-up",min:0,max:1.25},
  {id:"rightInnerBrow",label:"Right inner brow lift",group:"Brows",positive:"expression/units/caucasian/eyebrows-right-inner-up",min:0,max:1.25},
  {id:"noseWidth",label:"Nose width",group:"Nose",negative:"nose/nose-scale-horiz-decr",positive:"nose/nose-scale-horiz-incr",min:-1.25,max:1.25},
  {id:"noseBridge",label:"Nose bridge hump",group:"Nose",negative:"nose/nose-hump-decr",positive:"nose/nose-hump-incr",min:-1.25,max:1.25},
  {id:"nostrilWidth",label:"Nostril width",group:"Nose",negative:"nose/nose-nostrils-width-decr",positive:"nose/nose-nostrils-width-incr",min:-1.25,max:1.25},
  {id:"nostrilFlare",label:"Nostril flare",group:"Nose",negative:"nose/nose-flaring-decr",positive:"nose/nose-flaring-incr",min:-1.25,max:1.25},
  {id:"leftNostril",label:"Left nostril dilation",group:"Nose",positive:"expression/units/caucasian/nose-left-dilatation",min:0,max:1.25},
  {id:"rightNostril",label:"Right nostril dilation",group:"Nose",positive:"expression/units/caucasian/nose-right-dilatation",min:0,max:1.25},
  {id:"leftCheek",label:"Left cheek fullness",group:"Cheeks",negative:"cheek/l-cheek-volume-decr",positive:"cheek/l-cheek-volume-incr",min:-1.25,max:1.25},
  {id:"rightCheek",label:"Right cheek fullness",group:"Cheeks",negative:"cheek/r-cheek-volume-decr",positive:"cheek/r-cheek-volume-incr",min:-1.25,max:1.25},
  {id:"leftCheekbone",label:"Left cheekbone",group:"Cheeks",negative:"cheek/l-cheek-bones-decr",positive:"cheek/l-cheek-bones-incr",min:-1.25,max:1.25},
  {id:"rightCheekbone",label:"Right cheekbone",group:"Cheeks",negative:"cheek/r-cheek-bones-decr",positive:"cheek/r-cheek-bones-incr",min:-1.25,max:1.25},
  {id:"upperLipVolume",label:"Upper lip volume",group:"Lips & mouth",negative:"mouth/mouth-upperlip-volume-decr",positive:"mouth/mouth-upperlip-volume-incr",min:-1.25,max:1.25},
  {id:"lowerLipVolume",label:"Lower lip volume",group:"Lips & mouth",negative:"mouth/mouth-lowerlip-volume-decr",positive:"mouth/mouth-lowerlip-volume-incr",min:-1.25,max:1.25},
  {id:"upperLipHeight",label:"Upper lip lift",group:"Lips & mouth",negative:"mouth/mouth-upperlip-height-decr",positive:"mouth/mouth-upperlip-height-incr",min:-1.25,max:1.25},
  {id:"lowerLipHeight",label:"Lower lip height",group:"Lips & mouth",negative:"mouth/mouth-lowerlip-height-decr",positive:"mouth/mouth-lowerlip-height-incr",min:-1.25,max:1.25},
  {id:"cupidsBow",label:"Cupid's bow",group:"Lips & mouth",negative:"mouth/mouth-cupidsbow-decr",positive:"mouth/mouth-cupidsbow-incr",min:-1.25,max:1.25},
  {id:"lipCompression",label:"Lip compression",group:"Lips & mouth",positive:"expression/units/caucasian/mouth-compression",min:0,max:1.25},
  {id:"lipPurse",label:"Lip purse",group:"Lips & mouth",positive:"expression/units/caucasian/mouth-pursing",min:0,max:1.25},
  {id:"smile",label:"Mouth corners (smile)",group:"Lips & mouth",positive:"expression/units/caucasian/mouth-corner-puller",min:0,max:1.25},
  {id:"mouthOpen",label:"Source mouth opening",group:"Lips & mouth",positive:"expression/units/caucasian/mouth-open",min:0,max:1.25},
  {id:"leftMouthCorner",label:"Left mouth corner",group:"Lips & mouth",positive:"asym/asym-mouth-1-l",min:0,max:1.25},
  {id:"rightMouthCorner",label:"Right mouth corner",group:"Lips & mouth",positive:"asym/asym-mouth-1-r",min:0,max:1.25},
  {id:"chinWidth",label:"Chin width",group:"Jaw & chin",negative:"chin/chin-width-decr",positive:"chin/chin-width-incr",min:-1.25,max:1.25},
  {id:"chinHeight",label:"Chin height",group:"Jaw & chin",negative:"chin/chin-height-decr",positive:"chin/chin-height-incr",min:-1.25,max:1.25},
  {id:"chinForward",label:"Chin projection",group:"Jaw & chin",negative:"chin/chin-prognathism-decr",positive:"chin/chin-prognathism-incr",min:-1.25,max:1.25},
  {id:"leftJaw",label:"Left jaw asymmetry",group:"Jaw & chin",positive:"asym/asym-jaw-1-l",min:0,max:1.25},
  {id:"rightJaw",label:"Right jaw asymmetry",group:"Jaw & chin",positive:"asym/asym-jaw-1-r",min:0,max:1.25},
  {id:"leftEarSize",label:"Left ear size",group:"Ears",negative:"ears/l-ear-scale-decr",positive:"ears/l-ear-scale-incr",min:-1.25,max:1.25},
  {id:"rightEarSize",label:"Right ear size",group:"Ears",negative:"ears/r-ear-scale-decr",positive:"ears/r-ear-scale-incr",min:-1.25,max:1.25},
  {id:"leftEarFlap",label:"Left ear flap",group:"Ears",negative:"ears/l-ear-flap-decr",positive:"ears/l-ear-flap-incr",min:-1.25,max:1.25},
  {id:"rightEarFlap",label:"Right ear flap",group:"Ears",negative:"ears/r-ear-flap-decr",positive:"ears/r-ear-flap-incr",min:-1.25,max:1.25},
  {id:"leftEarlobe",label:"Left ear lobe",group:"Ears",negative:"ears/l-ear-lobe-decr",positive:"ears/l-ear-lobe-incr",min:-1.25,max:1.25},
  {id:"rightEarlobe",label:"Right ear lobe",group:"Ears",negative:"ears/r-ear-lobe-decr",positive:"ears/r-ear-lobe-incr",min:-1.25,max:1.25},
] as const;

/** Native range is -1..1 for bipolar and 0..1 for unipolar.
 * The additional 25% is deliberately unsupported stress extrapolation. */
export const NATIVE_FACIAL_CONTROLS:readonly FacialControl[] = [
  ...NATIVE_MAKEHUMAN_FACE_MODIFIERS.map(m=>({
    id:"native/"+m.id,label:m.target.replace(/-/g," "),group:"Native "+m.group,
    positive:m.positive,negative:"negative" in m?m.negative:undefined,
    min:m.nativeMin===-1?-1.25:0,max:1.25,
    description:"MakeHuman native: "+m.nativeMin+" to 1; beyond 1 stress only",
  })),
  ...NATIVE_MAKEHUMAN_EXPRESSION_UNITS.map(id=>({
    id:"native/"+id.replace("expression/units/caucasian/","expression/"),
    label:id.split("/").at(-1)!.replace(/-/g," "),group:"Native expression units",
    positive:id,min:0,max:1.25,
    description:"MakeHuman native 0 to 1; beyond 1 stress only",
  })),
];
export const ALL_FACIAL_CONTROLS:readonly FacialControl[] = [...FACIAL_CONTROLS,...NATIVE_FACIAL_CONTROLS,
  {id:"native/race-african",label:"African ancestry weight",group:"Native ancestry blend",positive:"expression/units/african/mouth-open",min:0,max:1},
  {id:"native/race-asian",label:"Asian ancestry weight",group:"Native ancestry blend",positive:"expression/units/asian/mouth-open",min:0,max:1},
];

/** Coordinate a source expression that already opens the jaw with a separate
 * C1 presentation FK command. Keep native morph deltas intact, and remove only
 * overlapping *additional* sagittal opening. Other poses and independent
 * articulation remain unchanged. This must never alter gameplay authority.
 */
export function coordinateFacialJawPose<T extends {
  readonly jointId:string; readonly motion:string; readonly radians:number;
}>(targets:readonly T[],jawId:string|undefined,
  expressionOpeningRadians:number):readonly T[] {
  if(!jawId||!Number.isFinite(expressionOpeningRadians)||
     expressionOpeningRadians<0)
    throw new Error("Invalid C3.7 jaw expression coordination");
  if(expressionOpeningRadians===0)return targets;
  return targets.map(target=>
    target.jointId===jawId&&target.motion==="flexion"&&target.radians>0
      ? {...target,radians:Math.max(0,target.radians-expressionOpeningRadians)}
      : target);
}
export type FacialWeights=Readonly<Record<string,number>>;
export const FACIAL_PRESETS:Readonly<Record<string,FacialWeights>>={
  neutral:{},
  blink:{leftLid:1,rightLid:1},
  asymmetric:{leftLid:1,leftBrow:0.8,rightBrow:-0.7,leftMouthCorner:1},
  surprised:{leftEyeOpen:0.8,rightEyeOpen:0.8,leftInnerBrow:0.6,rightInnerBrow:0.6,mouthOpen:0.5},
  smile:{smile:0.85,leftCheek:0.45,rightCheek:0.45},
  wide:{noseWidth:1,nostrilWidth:1,chinWidth:1,leftEarSize:1,rightEarSize:1},
  stress:{leftEyeHeight:-1.25,rightEyeHeight:1.25,leftBrow:1.25,rightBrow:-1.25,
    leftCheek:1.25,rightCheek:-1.25,noseWidth:1.25,nostrilFlare:1.25,
    upperLipVolume:1.25,lowerLipVolume:-1.25,mouthOpen:1.25,
    leftMouthCorner:1.25,rightMouthCorner:1.25,chinWidth:1.25,
    leftEarSize:1.25,rightEarSize:-1.25},
};

export function validateFacialWeights(weights:FacialWeights):void {
  if(typeof weights!=="object"||weights===null||Array.isArray(weights))
    throw new Error("Invalid C3.5 facial control recipe");
  const byId=new Map(ALL_FACIAL_CONTROLS.map(c=>[c.id,c]));
  for(const [key,value] of Object.entries(weights)){
    const definition=byId.get(key);
    if(!definition||!Number.isFinite(value)||value<definition.min||value>definition.max)
      throw new Error("C3.5 facial control out of range: "+key);
  }
}
export type FacialDiagnostics=Readonly<{
  affectedVertices:number;
  seamMismatches:number;
  collapsedTriangles:number;
  invertedTriangles:number;
  stretchedTriangles:number;
  maxEdgeStretch:number;
  finiteFailures:number;
  triangleCount:number;
  elapsedMs:number;
}>;
/** Deterministic source-space delta accumulation. All corner/UV duplicates receive
 * exactly the same displacement, preserving their existing skin/UV identity.
 * Rest positions are captured when the controller is created, never cumulatively.
 */
export class MakeHumanFacialController {
  private readonly neutral:Float32Array;
  private readonly sourceToRender:ReadonlyMap<number,readonly number[]>;
  private readonly targets:ReadonlyMap<string,FacialTarget>;
  private readonly position:THREE.BufferAttribute|THREE.InterleavedBufferAttribute;
  private readonly indices:THREE.BufferAttribute|undefined;
  private readonly scale:number;
  private readonly human:AnatomicalHuman;
  private readonly jawOpeningBasis?:Readonly<{rest:THREE.Vector3;axis:THREE.Vector3}>;
  private lastSourceJawOpening=0;
  /** Source-pose overlap only: exact CC0 facial vertices remain untouched. */
  get sourceJawOpeningRadians():number{return this.lastSourceJawOpening;}
  private disposed=false;
  constructor(human:AnatomicalHuman,atlas:FacialAtlas){
    this.human=human;
    this.targets=validateFacialAtlas(atlas,human.template.sourceVertexCount);
    if(!ALL_FACIAL_CONTROLS.every(c=>this.targets.has(c.positive)&&
       (!c.negative||this.targets.has(c.negative))))
      throw new Error("Missing pinned MakeHuman facial controls");
    this.scale=human.template.conversionMetersPerSourceUnit;
    this.position=human.mesh.geometry.getAttribute("position");
    if(!this.position||this.position.itemSize!==3||
       this.position.count!==human.template.sourceVertexIds.length)
      throw new Error("C3.5 requires original MakeHuman source vertex mapping");
    this.indices=human.mesh.geometry.getIndex()??undefined;
    this.neutral=Float32Array.from(this.position.array as ArrayLike<number>);
    // Capture unposed rest coordinates once: facial previews can be edited while
    // C1 jaw FK is active, so live jaw transforms are not a valid rest reference.
    const jaw=human.spike.graph.joints.find(j=>j.role==="jaw");
    const head=human.spike.graph.joints.find(j=>j.role==="head");
    const neck=human.spike.graph.joints.find(j=>j.role==="neck");
    if(jaw&&head&&neck&&human.jawTipWorldRest){
      human.spike.character.root.updateMatrixWorld(true);
      const inverseRoot=human.spike.character.root.matrixWorld.clone().invert();
      const at=(id:string):THREE.Vector3=>
        human.spike.bones.get(id)!.getWorldPosition(new THREE.Vector3())
          .applyMatrix4(inverseRoot);
      const hinge=at(jaw.id);
      const rest=human.jawTipWorldRest.clone().applyMatrix4(inverseRoot).sub(hinge);
      const up=at(head.id).sub(at(neck.id)).normalize();
      const anterior=rest.clone().addScaledVector(up,-rest.dot(up)).normalize();
      if(rest.lengthSq()>1e-10&&up.lengthSq()>1e-10&&anterior.lengthSq()>1e-10)
        this.jawOpeningBasis={rest,axis:up.cross(anterior).normalize()};
    }
    const mapping=new Map<number,number[]>();
    human.template.sourceVertexIds.forEach((sourceId,renderId)=>{
      const list=mapping.get(sourceId)??[];
      list.push(renderId);mapping.set(sourceId,list);
    });
    this.sourceToRender=mapping;
  }
  /** Estimate the rigid-jaw component already contained in the source
   * mouth-open expression. MakeHuman's CC0 target translates the original
   * jaw-tail landmark; C1 FK also rotates that same mandibular segment.
   * Use its pinned helper vertices and the actual neutral C1 jaw/neck/head
   * landmarks, not a hardcoded adult jaw angle or a synthetic face target.
   * This only informs presentation pose coordination; never edits morphs. */
  private measureSourceJawOpening(weights:FacialWeights):number {
    const value=(weights.mouthOpen??0)+(weights["native/expression/mouth-open"]??0);
    if(value<=0)return 0;
    const {sourceRig,template}=this.human;
    const tail=sourceRig?.bones.jaw?.tail;
    const ids=tail?sourceRig?.joints[tail]:undefined;
    if(!ids?.length||!this.jawOpeningBasis)return 0;
    const displacement=new THREE.Vector3();
    const included=new Set(ids);
    const african=weights["native/race-african"]??0;
    const asian=weights["native/race-asian"]??0;
    for(const [race,ancestry] of [["caucasian",1-african-asian],
      ["african",african],["asian",asian]] as const){
      if(!ancestry)continue;
      const target=this.targets.get("expression/units/"+race+"/mouth-open");
      if(!target)throw new Error("Missing original MakeHuman mouth-open source "+race);
      for(let k=0;k<target.rows.length;k+=4){
        if(!included.has(target.rows[k]!))continue;
        displacement.x+=target.rows[k+1]!*value*ancestry;
        displacement.y+=target.rows[k+2]!*value*ancestry;
        displacement.z+=target.rows[k+3]!*value*ancestry;
      }
    }
    displacement.multiplyScalar(template.conversionMetersPerSourceUnit/ids.length);
    const {rest,axis}=this.jawOpeningBasis;
    const projected=(v:THREE.Vector3)=>v.addScaledVector(axis,-v.dot(axis));
    const before=projected(rest.clone());
    const after=projected(rest.add(displacement));
    const angle=Math.atan2(axis.dot(before.clone().cross(after)),before.dot(after));
    if(!Number.isFinite(angle))throw new Error("Nonfinite MakeHuman jaw expression opening");
    return Math.max(0,angle);
  }
  apply(weights:FacialWeights):FacialDiagnostics {
    if(this.disposed)throw new Error("C3.5 facial controller disposed");
    validateFacialWeights(weights);
    const start=performance.now();
    const array=Float32Array.from(this.neutral);
    const delta=new Float64Array(this.human.template.sourceVertexCount*3);
    // Canonical ordering makes object insertion order irrelevant.
    const african=weights["native/race-african"]??0;
    const asian=weights["native/race-asian"]??0;
    if(african+asian>1+1e-8)throw new Error("MakeHuman ancestry weights exceed 1");
    const applyTarget=(item:FacialTarget,factor:number)=>{
      for(let i=0;i<item.rows.length;i+=4){
        const index=item.rows[i]!*3;
        delta[index]=(delta[index]??0)+item.rows[i+1]!*factor;
        delta[index+1]=(delta[index+1]??0)+item.rows[i+2]!*factor;
        delta[index+2]=(delta[index+2]??0)+item.rows[i+3]!*factor;
      }
    };
    for(const control of ALL_FACIAL_CONTROLS){
      const weight=weights[control.id]??0;
      if(!weight||control.id.startsWith("native/race-"))continue;
      const id=weight<0?control.negative!:control.positive;
      const amount=Math.abs(weight)*this.scale;
      if(id.startsWith("expression/units/caucasian/")){
        for(const [race,factor] of [["caucasian",1-african-asian],["african",african],["asian",asian]] as const){
          if(factor)applyTarget(this.targets.get(id.replace("caucasian",race))!,amount*factor);
        }
      }else applyTarget(this.targets.get(id)!,amount);
    }
    let affectedVertices=0,finiteFailures=0,seamMismatches=0;
    for(const [sourceId,renderIds] of this.sourceToRender){
      const d=sourceId*3,dx=delta[d]!,dy=delta[d+1]!,dz=delta[d+2]!;
      if(dx||dy||dz)affectedVertices++;
      for(const renderId of renderIds){
        const offset=renderId*3;
        for(const [axis,shift] of [dx,dy,dz].entries()){
          const value=this.neutral[offset+axis]!+shift;
          if(!Number.isFinite(value))finiteFailures++;
          array[offset+axis]=value;
        }
      }
      // Intentionally exclude already-existing seam differences: baseline C3.4
      // verifies them separately; controller applies the exact same source delta.
      for(let i=1;i<renderIds.length;i++){
        const a=renderIds[0]!*3,b=renderIds[i]!*3;
        for(let k=0;k<3;k++)
          if(Math.abs((array[a+k]!-this.neutral[a+k]!)-
                      (array[b+k]!-this.neutral[b+k]!))>1e-6)
            seamMismatches++;
      }
    }
    let collapsedTriangles=0,invertedTriangles=0,stretchedTriangles=0,maxEdgeStretch=1;
    const triangles=this.indices?.array;
    if(triangles){
      for(let i=0;i<triangles.length;i+=3){
        const a=Number(triangles[i])*3,b=Number(triangles[i+1])*3,c=Number(triangles[i+2])*3;
        const cross=(arr:Float32Array)=>{
          const ux=arr[b]!-arr[a]!,uy=arr[b+1]!-arr[a+1]!,uz=arr[b+2]!-arr[a+2]!;
          const vx=arr[c]!-arr[a]!,vy=arr[c+1]!-arr[a+1]!,vz=arr[c+2]!-arr[a+2]!;
          return [uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx] as const;
        };
        const before=cross(this.neutral),after=cross(array);
        const base=Math.hypot(...before),updated=Math.hypot(...after);
        if(base>1e-12&&updated<base*.03)collapsedTriangles++;
        if(base>1e-12&&updated>1e-12&&
           (before[0]*after[0]+before[1]*after[1]+before[2]*after[2])<0)
          invertedTriangles++;
        const edge=(values:Float32Array,u:number,v:number)=>
          Math.hypot(values[u]!-values[v]!,values[u+1]!-values[v+1]!,
            values[u+2]!-values[v+2]!);
        for(const [u,v] of [[a,b],[b,c],[c,a]]){
          const baseline=edge(this.neutral,u!,v!),now=edge(array,u!,v!);
          if(baseline>1e-9)maxEdgeStretch=Math.max(maxEdgeStretch,now/baseline);
        }
        if(base>1e-12&&updated/base>4)stretchedTriangles++;
      }
    }
    const sourceJawOpening=this.measureSourceJawOpening(weights);
    const pos=this.position;
    // Validate the complete staged result before committing it.
    if(finiteFailures||seamMismatches)throw new Error(
      "C3.5 invalid facial source-space deformation: "+
      finiteFailures+" nonfinite / "+seamMismatches+" seam errors");
    for(let i=0;i<pos.count;i++)
      pos.setXYZ(i,array[i*3]!,array[i*3+1]!,array[i*3+2]!);
    pos.needsUpdate=true;
    recomputeSourceNormals(this.human);
    this.human.mesh.geometry.computeBoundingSphere();
    this.human.mesh.geometry.computeBoundingBox();
    this.lastSourceJawOpening=sourceJawOpening;
    return {affectedVertices,seamMismatches,finiteFailures,collapsedTriangles,
      invertedTriangles,stretchedTriangles,maxEdgeStretch,
      triangleCount:(triangles?.length??0)/3,elapsedMs:performance.now()-start};
  }
  dispose(){this.disposed=true;}
}
let atlasRequest:Promise<FacialAtlas>|undefined;
/** Shared immutable fetch/parsing cache across Character Lab rebuilds. */
export async function loadFacialAtlas(signal?:AbortSignal):Promise<FacialAtlas>{
  if(!atlasRequest)atlasRequest=fetch("/anatomy/makehuman-facial-v1.json",{signal})
    .then(async response=>{
      if(!response.ok)throw new Error("Pinned C3.5 facial atlas unavailable: HTTP "+response.status);
      return await response.json() as FacialAtlas;
    }).catch(error=>{atlasRequest=undefined;throw error;});
  return atlasRequest;
}
