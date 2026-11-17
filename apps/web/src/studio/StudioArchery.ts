import * as THREE from "three";
import {bowNockLocal,createBowStaveGeometry,defaultBowStaveOptions,
  type BowProfile} from "./StudioBowGeometry";
import type {AnatomicalGraphV1} from "@trilok/character-core";
import {AnatomicalFK,type AnatomicalMotion,type JointTarget}
  from "../characters/geometry/AnatomicalFK";
import type {StudioHumanModel} from "./StudioHumanModel";
import {fitConstrainedIK,fitCanonicalIK} from "./ConstrainedIK";
import {StudioBodyCollision} from "./StudioBodyCollision";
import {calibrateGripSpreads,handContactTargets,fitHandleCenter}
  from "./StudioWeaponGrip";
import {fitBowHandContact,fitMorphologyAwareBowRadius} from "./StudioBowContact";
import {retargetSourceArcherPose} from "./StudioMakeHumanArcherRetarget";
import {measureSourceStringContact,sourceHandSamples,
  signedFiniteCylinderDistance,
  sourceFingerPadVertices,sourcePadWorld,
  type SourceCylinderRegion} from "./StudioSourceContact";
import {measureSourceArrowShaft,sourceIndexRestLandmark,
  validateArrowRestReference,type ArrowRestReferenceV1,
  type ArrowShaftClearance} from "./StudioArrowRest";
import {contactArmFreedoms,supportedContactFreedoms,composeContactPose,
  clampContactSeed,mirrorContactDifferenceSign}
  from "./StudioContactIK";
import {twoHandGripContactWorld,type HandSide} from "./StudioTwoHandGrip";
import {coordinateTorsoAndGaze} from "./StudioUpperBodyCoordination";
import {measureArmAlignment,bowArmExtensionResidual,measurePullLineAlignment,
  feasibleBowArmExtension,measureProjectedArmAlignment}
  from "./StudioAnatomicalAlignment";

/** Studio-only visual states. A release preview never dispatches a combat event. */
export type ArcheryState="rest"|"nock"|"partial"|"aim"|"release";
export type BowEquipment="bow-left"|"bow-right";
export const isBowEquipment=(value:string):value is BowEquipment=>
  value==="bow-left"||value==="bow-right";
export const oppositeHand=(side:HandSide):HandSide=>side==="left"?"right":"left";
/** Studio preview aim is the avatar-facing +Z line, not an independently
 * rotated arrow model. Unreachable alignment must reject the source pose. */
export const MAX_ARCHERY_AIM_DEVIATION_RADIANS=THREE.MathUtils.degToRad(15);
export const ARCHERY_STATES:Readonly<Record<ArcheryState,string>>=Object.freeze({
  rest:"Bow held",nock:"Nocking arrow",partial:"Partial draw",
  aim:"Full draw / aim",release:"Release / follow-through",
});
export interface BowReferenceV1 {
  readonly schemaVersion:1;
  readonly id:string;
  readonly kind:"bow";
  readonly hand:HandSide;
  readonly socketId:string;
  readonly limbLengthMeters:number;
  readonly handleRadiusMeters:number;
  readonly handleLengthMeters:number;
  readonly arrowLengthMeters:number;
  readonly stringRestMeters:number;
  readonly maximumDrawMeters:number;
  readonly arrowRest:ArrowRestReferenceV1;
}
/** Local frame: grip is origin, +Y upper tip, +Z forward (arrow travel);
 * string anchor points are (0,+/- limbLength,-stringRest);
 * string center follows bounded source-resolved nock Y and draw distance.
 * Arrow is +Z from its nock; the model owns no physics or combat clock. */
export function validateBowReference(d:BowReferenceV1,graph:AnatomicalGraphV1):void{
  validateArrowRestReference(d.arrowRest);
  const socket=graph.sockets.find(s=>s.id===d.socketId);
  const parent=graph.joints.find(j=>j.id===socket?.parentJointId);
  if(d.schemaVersion!==1||d.kind!=="bow"||!/^bow\/(left|right)$/.test(d.id)||
    !["left","right"].includes(d.hand)||socket?.purpose!=="primary_grip"||
    parent?.role!=="palm_"+d.hand||
    !parent.id.includes("arm["+d.hand+",0]")||
    ![d.limbLengthMeters,d.handleRadiusMeters,d.handleLengthMeters,
      d.arrowLengthMeters,d.stringRestMeters,d.maximumDrawMeters]
      .every(Number.isFinite)||
    d.limbLengthMeters<.2||d.limbLengthMeters>1.1||
    d.handleRadiusMeters<.002||d.handleRadiusMeters>.035||
    d.handleLengthMeters<.03||d.handleLengthMeters>.25||
    d.arrowLengthMeters<.2||d.arrowLengthMeters>1.5||
    d.stringRestMeters<.02||d.stringRestMeters>.2||
    d.maximumDrawMeters<.05||d.maximumDrawMeters>.8)
    throw new Error("Invalid anatomical bow reference");
}
function bone(model:StudioHumanModel,role:string,side:HandSide):THREE.Bone{
  const j=model.human.spike.graph.joints.find(j=>j.role===role&&
    (role.startsWith("finger_")?j.id.includes("arm["+side+",0]"):true));
  const result=j&&model.human.spike.bones.get(j.id);
  if(!result)throw new Error("Missing source bow joint "+role);
  return result;
}
const at=(item:THREE.Object3D)=>item.getWorldPosition(new THREE.Vector3());
const scoped=(model:StudioHumanModel,role:string,side:HandSide)=>
  model.human.spike.graph.joints.find(j=>j.role===role+"_"+side&&
    j.id.includes("arm["+side+",0]")) ??
  model.human.spike.graph.joints.find(j=>j.role===role+"_"+side);
const k=(item:Pick<JointTarget,"jointId"|"motion">)=>item.jointId+"/"+item.motion;
const merge=(base:readonly JointTarget[],overrides:readonly JointTarget[]):JointTarget[]=>{
  const state=new Map(base.map(c=>[k(c),c]));
  for(const command of overrides)state.set(k(command),command);
  return [...state.values()];
};
function digitCommands(model:StudioHumanModel,fk:AnatomicalFK,side:HandSide,
  drawing:boolean):readonly JointTarget[]{
  const h=model.human.spike;
  const spreads=calibrateGripSpreads(h.graph,h.bones,fk.frames,side);
  // Actual source BVH finger rotations are the *starting pose*. Contact IK
  // remains authoritative and may adjust these legal channels when the
  // skinned fingers do not land on the handle/string for this morphology.
  // Keep the established C5 fallback profile available for diagnostic
  // comparisons; never modify sword/staff/shield grip paths.
  const reference=retargetSourceArcherPose(h.graph,fk,side,
    drawing?"string-drawing":"bow-holding","square");
  const source=new Map(reference.commands.map(c=>[c.jointId+"/"+c.motion,c]));
  const fallback=handContactTargets(h.graph,side,
    drawing?"string-two-finger":"bow-handle",spreads);
  const commands=[...fallback.map(c=>source.get(c.jointId+"/"+c.motion)??c)];
  // Some source MakeHuman hands explicitly articulate MCP spread even when
  // the previous contact profile did not. Those source freedoms are legal.
  for(const c of reference.commands)if(!fallback.some(f=>k(f)===k(c)))
    commands.push(c);
  return Object.freeze(commands);
}
/** The string hook is the crease between the source index and middle fingers,
 * not the C5.2 cylindrical-grip palm proxy. These are real posed MakeHuman
 * finger bones: the solver cannot claim contact by shifting a visual target. */
export function drawingFingerContactWorld(model:StudioHumanModel,
  side:HandSide):THREE.Vector3{
  const index=at(bone(model,"finger_index_1",side));
  const middle=at(bone(model,"finger_middle_1",side));
  return index.add(middle).multiplyScalar(.5);
}

type Freedom={jointId:string;motion:AnatomicalMotion;min:number;max:number;
  differenceSign?:1|-1};
const ARM_CHANNELS:readonly (readonly [string,readonly AnatomicalMotion[]])[]=[
  ["clavicle",["abduction","flexion"]],
  ["shoulder",["abduction","flexion","rotation"]],
  ["elbow",["flexion","rotation"]],
  ["wrist",["flexion","abduction"]],
];
function fitArm(model:StudioHumanModel,fk:AnatomicalFK,base:readonly JointTarget[],
  side:HandSide,target:THREE.Vector3,drawHand:boolean,scale:number,
  desiredBowBendRadians?:number,continuation?:readonly JointTarget[]){
  const axes:Freedom[]=[];
  for(const [role,motions] of ARM_CHANNELS){
    const joint=scoped(model,role,side);
    if(!joint)throw new Error("Missing constrained bow arm role "+role);
    for(const motion of motions){
      const f=fk.frames.get(joint.id)?.freedoms.get(motion);
      if(!f)throw new Error("Uncalibrated bow arm freedom");
      axes.push({jointId:joint.id,motion,min:f.min,max:f.max,
          differenceSign:mirrorContactDifferenceSign(
            model.human.spike.graph,fk,joint.id,motion,side)});
    }
  }
  const sign=side==="right"?1:-1;
  // A draw arm approaching the face from the contralateral shoulder needs
  // alternative, anatomically legal elbow folds. Reuse the same bounded DLS
  // solver, selecting the lowest measured source-contact residual.
  const reference=retargetSourceArcherPose(model.human.spike.graph,fk,side,
    drawHand?"string-drawing":"bow-holding","square",true);
  const referenceMap=new Map(reference.commands.map(c=>[k(c),c.radians]));
  const referenceArm=axes.map(a=>referenceMap.get(a.jointId+"/"+a.motion)??0);
  const guide=new Map(continuation?.map(c=>[k(c),c.radians])??[]);
  const continuationSeed=continuation?axes.map(a=>
    guide.get(a.jointId+"/"+a.motion)??referenceMap.get(a.jointId+"/"+a.motion)??0):undefined;
  const seedAngles=drawHand?[
    referenceArm,
    [0,0,.48,.29,.86*sign,1.40,0,-.06,0],
    [0,0,.16,.88,-.80*sign,1.58,0,-.12,0],
    [0,0,-.12,.62,-1.45*sign,1.95,0,-.20,0],
    [0,0,.62,.48,-1.10*sign,1.24,0,.16,0],
  ]:[
    ...(continuationSeed?[continuationSeed]:[]),
    referenceArm,
    [0,0,.55,.40,.85*sign,.65,0,-.08,0],
  ];
  const stage=(values:readonly number[])=>merge(base,axes.map((a,i)=>({
    jointId:a.jointId,motion:a.motion,radians:values[i]!,
  })));
  const shoulder=bone(model,"shoulder_"+side,side);
  const elbow=bone(model,"elbow_"+side,side);
  const wrist=bone(model,"wrist_"+side,side);
  const head=bone(model,"head",side);
  const collision=new StudioBodyCollision(model);
  const rootQuaternion=model.human.spike.character.root
    .getWorldQuaternion(new THREE.Quaternion());
  const worldUp=new THREE.Vector3(0,1,0).applyQuaternion(rootQuaternion);
  const sourceGripAxis=()=>{
    const wristPoint=at(bone(model,"wrist_"+side,side));
    const middlePoint=at(bone(model,"finger_middle_0",side));
    const direction=middlePoint.sub(wristPoint).normalize();
    const across=at(bone(model,"finger_index_0",side))
      .sub(at(bone(model,"finger_little_0",side)));
    return across.addScaledVector(direction,-across.dot(direction)).normalize();
  };
  let best:{commands:JointTarget[];error:number;clearance:number;
    iterations:number;score:number}|undefined;
  let attempts=0;
  for(const seed of seedAngles){
    attempts++;
    const initial=axes.map((a,i)=>THREE.MathUtils.clamp(
      seed[i]!,a.min,a.max));
    const evaluate=(values:readonly number[])=>{
      fk.apply(stage(values));
      const contact=twoHandGripContactWorld(model,side);
      const elbowWorld=at(elbow),wristWorld=at(wrist),headWorld=at(head);
      const body=collision.clearance(elbowWorld.clone().lerp(wristWorld,.5));
      return [
        contact.x-target.x,contact.y-target.y,contact.z-target.z,
        Math.max(0,.026*scale-body)*1.2,
        Math.max(0,.11*scale-contact.distanceTo(headWorld)),
        // The physically held bow should be approximately upright.
        // Calibrate the source knuckle axis by legal shoulder/elbow/wrist FK,
        // never visually rotate the weapon independently of the hand socket.
        ...(drawHand?[]:[...sourceGripAxis().clone().cross(worldUp).toArray()]
          .map(x=>x*.08*scale)),
        // A contacting hand alone is not enough: the bow arm must form a
        // supported, nearly straight shoulder-elbow-wrist chain.
        ...(drawHand||desiredBowBendRadians===undefined?[]:[
          bowArmExtensionResidual(measureArmAlignment(
            at(shoulder),elbowWorld,wristWorld),desiredBowBendRadians)*.22]),
        ...values.map((angle,i)=>(angle-initial[i]!)*.003),
        // Prefer one continuous source-FK candidate family rather than
        // switching between equivalent twist/abduction basins when the
        // target grip is nearly identical across neighboring partial draws.
        ...(continuationSeed?values.map((angle,i)=>
          (angle-continuationSeed[i]!)*.045*scale):[]),
      ];
    };
    const fit=fitCanonicalIK(initial,axes,
      axes.map(axis=>axis.differenceSign??1),evaluate,24);
    const commands=stage(fit.values);
    fk.apply(commands);
    const error=twoHandGripContactWorld(model,side).distanceTo(target);
    const clearance=collision.clearance(at(elbow).lerp(at(wrist),.5));
    const inclination=drawHand?0:
      sourceGripAxis().clone().cross(worldUp).length();
    const extensionPenalty=drawHand||desiredBowBendRadians===undefined?0:
      bowArmExtensionResidual(measureArmAlignment(
        at(shoulder),at(elbow),at(wrist)),desiredBowBendRadians)*.22;
    const referenceDeviation=continuationSeed?fit.values.reduce(
      (sum,value,i)=>sum+Math.abs(value-continuationSeed[i]!),0):0;
    const score=error+Math.max(0,.01*scale-clearance)*2+
      inclination*.08*scale+extensionPenalty+
      referenceDeviation*.020*scale;
    if(!best||score<best.score){
      best={commands,error,clearance,iterations:fit.iterations,score};
    }
    if(error<.012*scale&&clearance>.01*scale&&
      (drawHand||extensionPenalty<.012*scale))break;
  }
  if(!best)throw new Error("No calibrated archery arm candidates");
  fk.apply(best.commands);
  return {...best,attempts};
}
function bowFrame(model:StudioHumanModel,hand:HandSide,
  radius:number,length:number):THREE.Matrix4{
  const wrist=at(bone(model,"wrist_"+hand,hand));
  const index=at(bone(model,"finger_index_0",hand));
  const little=at(bone(model,"finger_little_0",hand));
  const middle=at(bone(model,"finger_middle_0",hand));
  const forward=middle.sub(wrist).normalize();
  const knuckles=index.clone().sub(little);
  const y=knuckles.addScaledVector(forward,-knuckles.dot(forward)).normalize();
  const facing=new THREE.Vector3(0,0,1).applyQuaternion(
    model.human.spike.character.root.getWorldQuaternion(new THREE.Quaternion()));
  const z=facing.addScaledVector(y,-facing.dot(y)).normalize();
  const x=y.clone().cross(z).normalize();
  z.crossVectors(x,y).normalize();
  if(y.lengthSq()<.9||x.lengthSq()<.9||z.lengthSq()<.9)
    throw new Error("Degenerate calibrated bow-hand frame");
  // +Y follows the actual source knuckle line, never an invented socket Euler.
  const center=fitHandleCenter(model,hand,twoHandGripContactWorld(model,hand),
    x,y,z,radius,length);
  return new THREE.Matrix4().makeBasis(x,y,z).setPosition(center);
}
export interface ArcheryPoseResult {
  readonly reachable:boolean;
  readonly reason:"ok"|"bow-unreachable"|"draw-unreachable"|
    "aim-unreachable"|"body-intersection"|"arrow-rest-unreachable";
  readonly hand:HandSide;
  readonly state:ArcheryState;
  readonly commands:readonly JointTarget[];
  readonly iterations:number;
  readonly solverAttempts:number;
  readonly bowHandErrorMeters:number;
  readonly bowSkinContact:readonly SourceCylinderRegion[];
  readonly drawHandErrorMeters:number;
  readonly drawingSkinGapsMeters?:Readonly<Record<"index"|"middle"|"ring",number>>;
  readonly bodyClearanceMeters:number;
  readonly drawMeters:number;
  readonly actualDrawFraction:number;
  readonly bowWorld:THREE.Matrix4;
  readonly nockWorld:THREE.Vector3;
  readonly drawContactWorld:THREE.Vector3;
  readonly arrowDirectionWorld:THREE.Vector3;
  readonly arrowAimDeviationRadians:number;
  /** Measured joint geometry after FK, not visual-prop alignment. */
  readonly stanceAlignment?:Readonly<{
    bowElbowInteriorRadians:number;
    bowElbowExtensionDeficitMeters:number;
    bowShoulderLeadMeters:number;
    drawElbowBehindHookMeters:number;
    drawElbowOffAxisMeters:number;
    bowElbowTopViewRadians:number;
    bowArmForwardReachMeters:number;
    bowArmLateralOffsetMeters:number;
  }>;
  readonly descriptor:BowReferenceV1;
  readonly arrowShaftClearance?:readonly ArrowShaftClearance[];
  /** Read-only candidate-selection evidence, not part of authoritative play. */
  readonly symmetryTrace?:Readonly<{
    holdingArmAttempts:number;holdingArmScore:number;
    bowContactCandidate:number;bowContactScore:number;
    drawArmSeed:number;drawFingerSeed:number;drawScore:number;
  }>;
}
/** Reusable source-FK endpoint guide; each endpoint was independently
 * accepted under the same skinned string/grip contact gates. The physical
 * bow-hand coordinates are measured from solved FK, never fabricated.
 * StudioPosePreview caches this per actual character/pose/hand.
 */
export interface ArcheryTransitionGuide {
  readonly nock:Readonly<{commands:readonly JointTarget[];
    gripWorld:THREE.Vector3}>;
  readonly aim:Readonly<{commands:readonly JointTarget[];
    gripWorld:THREE.Vector3}>;
}
export function archeryDrawFraction(state:ArcheryState,value:number):number{
  if(!Number.isFinite(value)||value<0||value>1)throw new Error("Invalid archery draw");
  return state==="rest"||state==="release"?0:
    state==="nock"?.08:state==="partial"?value*.65:value;
}
/** A progressive, foot-planted shooting plane. Both stances are solved by the
 * same legal FK and contact IK; this is NOT a root or weapon rotation. */
export function archeryShootingPlaneYaw(state:ArcheryState,draw:number,
  hand:HandSide):number{
  if(!Object.hasOwn(ARCHERY_STATES,state)||!Number.isFinite(draw)||draw<0||draw>1)
    throw new Error("Invalid shooting-plane state");
  // Establish most shoulder alignment at setup; tension adds only a
  // smaller refinement instead of twisting the torso through full draw.
  const angle=state==="rest"?0:state==="nock"?.15:
    state==="release"?.68:.15+.65*draw;
  return (hand==="left"?1:-1)*angle;
}
export function solveArcheryPose(model:StudioHumanModel,fk:AnatomicalFK,
  base:readonly JointTarget[],hand:HandSide,state:ArcheryState,
  draw=1,guide?:ArcheryTransitionGuide):ArcheryPoseResult{
  if(!Object.hasOwn(ARCHERY_STATES,state)||!["left","right"].includes(hand))
    throw new Error("Unknown archery pose");
  const root=model.human.spike.character.root;
  root.updateWorldMatrix(true,true);
  const rootMatrix=root.matrixWorld.clone();
  // The source square-stance BVH preserves a mostly frontal spine. Compose
  // a foot-planted shooting plane BEFORE arm optimization, so both arms,
  // true-skin contacts and the arrow aim solve in the resulting anatomy.
  // Never turn the root, bow prop or projectile axis as a visual workaround.
  // A partial draw is a continuation of accepted source-FK endpoint
  // shooting planes, not an unrelated sideways stance. The unguided
  // legacy path is retained only as a safe fallback for unavailable guides.
  const guidedPartial=state==="partial"&&guide!==undefined;
  // A supported bow arm establishes its shooting column *before* the
  // drawing fingers complete their physical string travel. These are
  // independent, deterministic progressions; neither is a global FK lock.
  // The fast support phase blends between actual accepted endpoint poses,
  // not fixed skeleton angles or invented bow offsets.
  const supportProgress=guidedPartial?
    Math.min(.78,THREE.MathUtils.smoothstep(draw,0,1)):0;
  const stance=coordinateTorsoAndGaze(model.human.spike.graph,fk,base,
    archeryShootingPlaneYaw(guidedPartial?state:
      state==="partial"?"aim":state,
      state==="partial"?(guidedPartial?supportProgress:1):draw,hand));
  fk.apply(stance);
  const head=at(bone(model,"head",hand));
  const ankle=at(bone(model,"ankle_left","left"));
  const scale=THREE.MathUtils.clamp((head.y-ankle.y+.13)/1.75,.4,1.2);
  const chest=at(bone(model,"chest",hand));
  const orientation=root.getWorldQuaternion(new THREE.Quaternion());
  const right=new THREE.Vector3(1,0,0).applyQuaternion(orientation);
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(orientation);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(orientation);
  const fingers=merge(stance,[
    ...digitCommands(model,fk,hand,false),
    ...digitCommands(model,fk,oppositeHand(hand),true),
  ]);
  fk.apply(fingers);
  // Reuse source-rig bone references across every Jacobian probe rather
  // than scanning the semantic graph for the same joints thousands of times.
  const bowShoulderBone=bone(model,"shoulder_"+hand,hand);
  const bowElbowBone=bone(model,"elbow_"+hand,hand);
  const bowWristBone=bone(model,"wrist_"+hand,hand);
  const bowShoulder=at(bowShoulderBone);
  const initialElbow=at(bowElbowBone);
  const initialWrist=at(bowWristBone);
  const initialPalm=at(bone(model,"palm_"+hand,hand));
  const armReach=bowShoulder.distanceTo(initialElbow)+
    initialElbow.distanceTo(initialWrist);
  const drawSide=oppositeHand(hand);
  const drawShoulder=at(bone(model,"shoulder_"+drawSide,drawSide));
  const drawElbow=at(bone(model,"elbow_"+drawSide,drawSide));
  const drawWrist=at(bone(model,"wrist_"+drawSide,drawSide));
  const drawHook=drawingFingerContactWorld(model,drawSide);
  const drawingReach=drawShoulder.distanceTo(drawElbow)+
    drawElbow.distanceTo(drawWrist)+drawWrist.distanceTo(drawHook);
  // The old chest+fixed-Z target let flexed elbows reach the bow while
  // the shoulder line was correct. Use real limb lengths from source FK,
  // with a higher, longer target in the bow-side shooting plane.
  const tension=archeryDrawFraction(state,draw);
  // Physical draw remains 0..65% in partial. This is an endpoint pose
  // interpolation parameter, NOT a replacement for string travel.
  const transition=THREE.MathUtils.clamp((tension-.08)/.92,0,1);
  const guideCommands=guidedPartial?(()=>{
    const source=new Map(guide!.nock.commands.map(c=>[k(c),c.radians]));
    const goal=new Map(guide!.aim.commands.map(c=>[k(c),c.radians]));
    const bowArmIds=new Set(model.human.spike.graph.joints.filter(j=>
      ["clavicle_","shoulder_","elbow_","wrist_"].some(role=>
        j.role===role+hand)).map(j=>j.id));
    return [...guide!.nock.commands].map(c=>({
      jointId:c.jointId,motion:c.motion,
      radians:THREE.MathUtils.lerp(c.radians,goal.get(k(c))??c.radians,
        bowArmIds.has(c.jointId)?supportProgress:transition),
    })).concat(guide!.aim.commands.filter(c=>!source.has(k(c))));
  })():undefined;
  const preparedTarget=chest.clone()
    .addScaledVector(right,(hand==="right"?1:-1)*.12*scale)
    .addScaledVector(forward,.56*scale).addScaledVector(up,.06*scale);
  const transverseOffset=right.clone().multiplyScalar(
    (hand==="right"?1:-1)*.014*scale).addScaledVector(up,.015*scale);
  const maximumForwardReach=feasibleBowArmExtension(
    bowShoulder,drawShoulder,forward,armReach*.96,
    drawingReach,scale*(.07+.28*tension),transverseOffset,.045*scale);
  // The requested bow-hand target is the actual source hand rather than
  // the wrist: leave a small metacarpal offset beyond the wrist reach.
  const desiredForwardReach=Math.min(armReach*.92+
    initialWrist.distanceTo(initialPalm)*.28,maximumForwardReach);
  const extendedTarget=bowShoulder.clone().add(transverseOffset)
    .addScaledVector(forward,desiredForwardReach);
  // Set up compact enough to nock; extend against resistance as the string
  // comes back. Extending at zero draw puts the nock beyond the other hand's
  // legal reach even though the bow hand itself can grip it.
  // Until the drawing hand is safely on the string, the bow target
  // remains close to the verified nock geometry. In later expansion,
  // smoothly load the bow arm rather than snapping to a long extension.
  const expansion=THREE.MathUtils.clamp((tension-.58)/.42,0,1);
  const smoothExpansion=expansion*expansion*(3-2*expansion);
  const extensionBlend=state==="rest"?0:state==="release"?.70:
    smoothExpansion;
  // The measured nock-reach cap can be shorter than the visually desirable
  // target on unusual anatomy. Use it as a REAL geometric limit, not a
  // cosmetic change to the weapon or string. The coupled IK resolves the
  // remaining arm and finger DOFs under unchanged hard contact gates.
  // At full draw the bow elbow is already near-straight. For a supported
  // intermediate draw, the bow hand can be diagonally across the shooting
  // plane, rather than requiring its full-draw world-space wrist coordinate.
  // Choose one support pose, independent of the partial slider, within the
  // drawing arm's worst-case (unpulled string) reach envelope. The lateral
  // component uses measured arm length, not a hand/weapon teleport.
  const partialSupport=state==="partial";
  const supportForward=Math.min(armReach*.70,feasibleBowArmExtension(
    bowShoulder,drawShoulder,forward,armReach*.96,drawingReach,
    scale*.07,transverseOffset,.045*scale));
  // A contact target lies beyond the source wrist, not at the end of its
  // forearm. Include the measured wrist-to-palm span to avoid shortening
  // the supported elbow simply to bring a hand grip near the string.
  const supportReach=armReach*.97+
    initialWrist.distanceTo(initialPalm)*.45;
  const supportLateral=Math.sqrt(Math.max(0,
    supportReach*supportReach-supportForward*supportForward));
  const supportTarget=bowShoulder.clone()
    .addScaledVector(forward,supportForward)
    .addScaledVector(right,(hand==="left"?1:-1)*supportLateral)
    .addScaledVector(up,.015*scale);
  const bowTarget=guidedPartial?
    guide!.nock.gripWorld.clone().lerp(guide!.aim.gripWorld,supportProgress):
    partialSupport?supportTarget:preparedTarget.lerp(extendedTarget,extensionBlend);
  const desiredBend=partialSupport?THREE.MathUtils.degToRad(17):
    tension<.80?undefined:THREE.MathUtils.degToRad(19-7*tension);
  const held=fitArm(model,fk,fingers,hand,bowTarget,false,scale,
    desiredBend,guideCommands);
  let staged:readonly JointTarget[]=held.commands;
  const width=at(bone(model,"finger_index_0",hand)).distanceTo(
    at(bone(model,"finger_little_0",hand)));
  const socket=model.human.spike.graph.sockets.find(s=>s.purpose==="primary_grip"&&
    s.parentJointId===scoped(model,"palm",hand)?.id);
  if(!socket)throw new Error("Missing source bow-hand grip socket");
  let descriptor:BowReferenceV1=Object.freeze({
    schemaVersion:1,id:"bow/"+hand,kind:"bow",hand,socketId:socket.id,
    limbLengthMeters:.64*scale,
    handleRadiusMeters:THREE.MathUtils.clamp(width/8,.003,.014),
    handleLengthMeters:THREE.MathUtils.clamp(width*1.45,.038,.18),
    arrowLengthMeters:.70*scale,stringRestMeters:.07*scale,
    // Preserve the independently verified full C5.4 string length.
    // Longer draw travel requires separate source-skin/collision tuning:
    // posture objectives must not silently change the physical hook goal.
    maximumDrawMeters:.28*scale,
    arrowRest:Object.freeze({schemaVersion:1,kind:"hand-supported",
      support:"index-knuckle",shaftRadiusMeters:.0035*scale,
      supportGapMeters:.005*scale,lateralOffsetMeters:0}),
  });
  validateBowReference(descriptor,model.human.spike.graph);
  // The BVH is a source-authored pose *candidate*, not permission to force
  // source Euler angles into a non-contacting handle. Compare it against the
  // proven C5 profile using the SAME bounded real source-skinned contact fit.
  // Both candidates reuse one AnatomicalFK and one solver; no alternate rig.
  const sourceGrip=staged;
  const fallbackGrip=merge(staged,handContactTargets(model.human.spike.graph,
    hand,"bow-handle",calibrateGripSpreads(model.human.spike.graph,
      model.human.spike.bones,fk.frames,hand)));
  const candidates=[sourceGrip,fallbackGrip].map((commands,index)=>{
    fk.apply(commands);
    const frame=bowFrame(model,hand,descriptor.handleRadiusMeters,
      descriptor.handleLengthMeters);
    const initialFit=fitBowHandContact(model,fk,commands,hand,frame,
      descriptor.handleRadiusMeters,descriptor.handleLengthMeters);
    const {fit,radius}=fitMorphologyAwareBowRadius(model,fk,hand,initialFit,
      descriptor.handleRadiusMeters,descriptor.handleLengthMeters);
    // Contact pressure and sampled finite-cylinder coverage are evaluated
    // on ALL source vertices after FK. Reward a real palm/four-finger grasp,
    // not a tiny number of lucky vertices in the finite handle region.
    const cost=fit.samples.reduce((sum,part)=>
      sum+part.maximumPenetrationMeters*5+
      part.nearestGapMeters*1.4+
      Math.max(0,.60-part.axialVertices/part.sampledVertices)*.012,0);
    return {fit,index,cost,radius};
  });
  candidates.sort((a,b)=>Number(b.fit.accepted)-Number(a.fit.accepted)||
    a.cost-b.cost||a.index-b.index);
  const handFit=candidates[0]!.fit;
  const chosenHandCandidate=candidates[0]!;
  // The visible cylinder, contact evaluator and authoritative socket must
  // all share the SAME selected morphology-specific handle dimensions.
  descriptor=Object.freeze({...descriptor,
    handleRadiusMeters:candidates[0]!.radius});
  staged=handFit.commands;
  fk.apply(staged);
  const world=handFit.bowWorld;
  // The fitted source index skin, not a global avatar offset, establishes
  // the provisional hand-supported rest above the physical grip cap.
  // The same nock is used by drawing IK, shaft and both string segments.
  const bowSkin=sourceHandSamples(model,hand);
  // Small bounded source-vertex subset for candidate ranking. Full skin is
  // reserved for the chosen final contact check, avoiding a per-seed O(mesh)
  // scan during repeated Character Studio slider movement.
  const coarseBowSkin=sourceHandSamples(model,hand,24);
  const indexRest=sourceIndexRestLandmark(model,hand,bowSkin,world);
  const arrowRestY=indexRest.y+descriptor.arrowRest.shaftRadiusMeters+
    descriptor.arrowRest.supportGapMeters;
  // A shelf-less traditional arrow passes beside the handle on the
  // anatomical index-support side. Raising it over the entire wooden grip
  // made it float 29-41 mm above the actual proximal index surface.
  // A proximal index vertex may lie on the SAME lateral side as the
  // curled thumb. Using its X sign picked a shaft path through the thumb
  // (measured -3.95 mm on nominal left nock). The semantic thumb surface
  // defines the prohibited side of this hand-supported arrow rest.
  // A curled thumb can cross the opposite side of its overall centroid.
  // Measure the thumb surface nearest the prospective *complete* arrow
  // path rather than averaging remote thumb tip and metacarpal vertices.
  const probeNock=new THREE.Vector3(0,arrowRestY,
    -descriptor.stringRestMeters-descriptor.maximumDrawMeters*tension);
  const probe=measureSourceArrowShaft(model,bowSkin,world,
    probeNock,descriptor.arrowLengthMeters,descriptor.arrowRest.shaftRadiusMeters);
  const thumbNear=probe.find(s=>s.region==="thumb");
  if(!thumbNear||!Number.isFinite(thumbNear.nearestSurfaceClearanceMeters))
    throw new Error("Missing physical thumb-web rest sample");
  const arrowSide=-Math.sign(thumbNear.closestPointLocal.x);
  if(arrowSide===0)throw new Error("Degenerate source thumb-web shaft side");
  const arrowRestX=arrowSide*(descriptor.handleRadiusMeters+
    descriptor.arrowRest.shaftRadiusMeters+descriptor.arrowRest.supportGapMeters);
  descriptor=Object.freeze({...descriptor,arrowRest:Object.freeze({
    ...descriptor.arrowRest,lateralOffsetMeters:arrowRestX})});
  const fraction=tension;
  // Pull travels along the bow's own forward axis. Bound its world target
  // by occupied torso space before any arm IK, never by moving the avatar.
  const collisions=new StudioBodyCollision(model);
  const localNock=new THREE.Vector3(arrowRestX,0,-descriptor.stringRestMeters-
    descriptor.maximumDrawMeters*fraction);
  let target=localNock.clone().applyMatrix4(world);
  if(fraction>0){
    const local=world.clone().invert();
    for(let i=0;i<10&&collisions.clearance(target)<.025*scale;i++){
      localNock.z+=.018*scale;
      target=localNock.clone().applyMatrix4(world);
    }
  }
  let completed:readonly JointTarget[]=staged;
  let selectedDrawTrace={arm:-1,finger:-1,score:0};
  let drawError=0,drawClearance=Infinity,drawIterations=0,drawAttempts=0;
  let drawSkinGaps:Readonly<Record<"index"|"middle"|"ring",number>>|undefined;
  let contact=target.clone();
  let solvedWorld=world.clone();
  const bowOffset=model.human.spike.character.socketWorld(socket.id)
    .invert().multiply(world);
  if(state!=="rest"&&state!=="release"){
    // One shared optimization moves BOTH arm chains against one moving bow
    // frame. The primary handle stays socket-anchored; its motion changes the
    // actual secondary string goal. Independent arm solutions could never
    // close the historical 166mm discrepancy at the physical string.
    // The drawing-hook MCP/PIP and spread are part of the SAME constrained
    // fit as both arms. A midpoint between finger bones is not skin contact.
    const drawDigitFreedoms:Freedom[]=[];
    for(const digit of ["index","middle"] as const){
      for(let index=0;index<3;index++){
        const joint=model.human.spike.graph.joints.find(j=>
          j.role==="finger_"+digit+"_"+index&&
          j.id.includes("arm["+drawSide+",0]"));
        if(!joint)throw new Error("Missing drawing source finger joint");
        const motions:AnatomicalMotion[]=index===0?
          ["flexion","abduction"]:["flexion"];
        for(const motion of motions){
          const range=fk.frames.get(joint.id)?.freedoms.get(motion);
          if(!range)throw new Error("Missing legal drawing finger freedom");
          drawDigitFreedoms.push({jointId:joint.id,motion,
            min:range.min,max:range.max});
        }
      }
    }
    // A supported bow arm is NOT a locked FK chain. Retain its calibrated
    // nine anatomical DOFs inside the same coupled contact solver, with
    // limited compliant motion about the *solved* source-skin grip pose.
    // The full-draw/nock solvers keep their existing unrestricted freedoms.
    const supportReference=partialSupport?
      contactArmFreedoms(model.human.spike.graph,fk,hand):undefined;
    const holdingFreedoms=partialSupport?supportedContactFreedoms(
      supportReference!,staged,THREE.MathUtils.degToRad(
        guidedPartial?10:2)):
      contactArmFreedoms(model.human.spike.graph,fk,hand);
    const freedoms=[
      ...holdingFreedoms,
      ...contactArmFreedoms(model.human.spike.graph,fk,drawSide),
      ...drawDigitFreedoms,
    ].map(channel=>{
      // At a settled full draw the bow elbow is a nearly straight support
      // column. Restrict only the CONTACT optimizer's legal elbow-flexion
      // search window; source FK joint limits and other weapons are intact.
      // On partial draws the elbow remains free to seek the real string.
      const bowElbow=scoped(model,"elbow",hand);
      return tension>=.85&&channel.jointId===bowElbow?.id&&
        channel.motion==="flexion"?
        {...channel,max:Math.min(channel.max,.16)}:channel;
    });
    // Separate a deterministic Jacobian sampling budget from FINAL
    // acceptance. Source-skin evaluation on every finite-difference probe
    // was monopolizing Vitest worker RPC and browser input response.
    // Every selected candidate is checked against *all* original vertices.
    const coarseHook=sourceHandSamples(model,drawSide,32);
    const fullHook=sourceHandSamples(model,drawSide);
    const padSurface=sourceHandSamples(model,drawSide,120);
    const padVertices={
      index:sourceFingerPadVertices(model,drawSide,"index",padSurface),
      middle:sourceFingerPadVertices(model,drawSide,"middle",padSurface),
    };
    const fingerSkin=(actualBow:THREE.Matrix4,goal:THREE.Vector3,
      samples=coarseHook)=>{
      const upper=bowNockLocal(descriptor,1).applyMatrix4(actualBow);
      const lower=bowNockLocal(descriptor,-1).applyMatrix4(actualBow);
      return measureSourceStringContact(model,samples,
        goal,upper,lower,.0018*scale,.055*scale);
    };
    const stagedMap=new Map(staged.map(v=>[v.jointId+"/"+v.motion,v.radians]));
    const initial=freedoms.map(f=>stagedMap.get(f.jointId+"/"+f.motion)??0);
    const signed=drawSide==="right"?1:-1;
    const sourceDraw=retargetSourceArcherPose(
      model.human.spike.graph,fk,drawSide,"string-drawing","square",true);
    const sourceDrawMap=new Map(sourceDraw.commands.map(c=>[k(c),c.radians]));
    const drawFreedoms=freedoms.slice(holdingFreedoms.length,
      holdingFreedoms.length+9);
    const continuation=new Map(guideCommands?.map(c=>[k(c),c.radians])??[]);
    const drawSeeds=[
      ...(guidedPartial?[drawFreedoms.map(c=>
        continuation.get(k(c))??sourceDrawMap.get(k(c))??0)]:[]),
      drawFreedoms.map(c=>sourceDrawMap.get(k(c))??0),
      [0,0,.48,.29,.86*signed,1.40,0,-.06,0],
      [0,0,.16,.88,-.80*signed,1.58,0,-.12,0],
      [0,0,-.12,.62,-1.45*signed,1.95,0,-.20,0],
      [0,0,.62,.48,-1.10*signed,1.24,0,.16,0],
    ];
    const elbow=bone(model,"elbow_"+drawSide,drawSide);
    const wrist=bone(model,"wrist_"+drawSide,drawSide);
    // A real nocked arrow rests slightly above/below the grip midpoint
    // depending on the source hand. Give the nock a bounded, shared bow-local
    // longitudinal variable instead of forcing every anatomy onto local Y=0.
    const nockYBound=Math.max(.035*scale,arrowRestY+.012*scale);
    const nockLimits=[...freedoms,{min:-nockYBound,max:nockYBound}];
    const nockWorldFor=(bow:THREE.Matrix4,y:number)=>
      new THREE.Vector3(arrowRestX,y,localNock.z).applyMatrix4(bow);
    const dynamicBow=()=>model.human.spike.character.socketWorld(socket.id)
      .multiply(bowOffset);
    const calibratedHook=handContactTargets(model.human.spike.graph,
      drawSide,"string-two-finger",calibrateGripSpreads(
        model.human.spike.graph,model.human.spike.bones,fk.frames,drawSide));
    const calibratedHookMap=new Map(calibratedHook.map(c=>[k(c),c.radians]));
    const sourceDigitSeed=initial.slice(holdingFreedoms.length+9);
    const calibratedDigitSeed=drawDigitFreedoms.map((c,i)=>
      calibratedHookMap.get(k(c))??sourceDigitSeed[i]!);
    // Prefer the calibrated midpoint as a starting envelope. Source and
    // C5 contact profiles remain legal independent fallback basins.
    const digitSeeds=[
      ...(guidedPartial?[drawDigitFreedoms.map((c,i)=>
        continuation.get(k(c))??sourceDigitSeed[i]!)]:[]),
      sourceDigitSeed.map((angle,i)=>(angle+calibratedDigitSeed[i]!)*.5),
      sourceDigitSeed,calibratedDigitSeed,
    ];
    // Compare the SAME legal seed pairs in actual source FK before the
    // nonlinear solve. The old lexicographic feasible-first pass could select
    // unrelated elbow basins on reflected hands even for exact mirrored
    // neutral anatomy. The score is a symmetric physical distance and angle;
    // no opposing hand pose is copied, and asymmetric bodies still get their
    // own independent ranking. This costs only 15 FK/landmark probes, not an
    // additional DLS solve or a new per-frame iteration.
    const orderedSeeds=drawSeeds.flatMap((angles,armSeed)=>
      digitSeeds.map((digits,fingerSeedIndex)=>{
        const joints=clampContactSeed([
          ...initial.slice(0,holdingFreedoms.length),...angles,...digits],freedoms);
        fk.apply(composeContactPose(staged,freedoms,joints));
        const bow=dynamicBow();
        const goal=nockWorldFor(bow,arrowRestY);
        const hook=drawingFingerContactWorld(model,drawSide);
        const pointing=new THREE.Vector3(0,0,1)
          .transformDirection(bow).angleTo(forward);
        const clearance=collisions.clearance(hook);
        return {armSeed,fingerSeedIndex,
          priority:hook.distanceTo(goal)+
            pointing*.115*scale+Math.max(0,.012*scale-clearance)*1.5};
      }));
    orderedSeeds.sort((a,b)=>a.priority-b.priority||
      a.armSeed-b.armSeed||a.fingerSeedIndex-b.fingerSeedIndex);
    let best:{commands:readonly JointTarget[];world:THREE.Matrix4;
      contact:THREE.Vector3;error:number;clearance:number;cost:number;
      skin:Readonly<Record<"index"|"middle"|"ring",number>>;
      nockY:number;valid:boolean;skinValid:boolean;
      iterations:number;armSeed:number;fingerSeed:number}|undefined;
    candidateSearch:for(const {armSeed,fingerSeedIndex} of orderedSeeds){
      const angles=drawSeeds[armSeed]!,fingerSeed=digitSeeds[fingerSeedIndex]!;
      const jointSeed=clampContactSeed([
        ...initial.slice(0,holdingFreedoms.length),...angles,...fingerSeed],freedoms);
      const seed=[...jointSeed,arrowRestY];
      const commands=(values:readonly number[])=>
        composeContactPose(staged,freedoms,values.slice(0,freedoms.length));
      const evaluate=(values:readonly number[])=>{
        fk.apply(commands(values));
        const actualBow=dynamicBow();
        const goal=nockWorldFor(actualBow,values[freedoms.length]!);
        const finger=drawingFingerContactWorld(model,drawSide);
        const bowGrip=twoHandGripContactWorld(model,hand);
        const elbowMid=at(elbow).lerp(at(wrist),.5);
        const bowArm=desiredBend===undefined?undefined:measureArmAlignment(
          at(bowShoulderBone),at(bowElbowBone),at(bowWristBone));
        const skin=fingerSkin(actualBow,goal);
        const indexPad=sourcePadWorld(model,padVertices.index);
        const middlePad=sourcePadWorld(model,padVertices.middle);
        const upperTip=bowNockLocal(descriptor,1).applyMatrix4(actualBow);
        const lowerTip=bowNockLocal(descriptor,-1).applyMatrix4(actualBow);
        const indexTarget=new THREE.Line3(goal,upperTip)
          .closestPointToPoint(indexPad,true,new THREE.Vector3());
        const middleTarget=new THREE.Line3(goal,lowerTip)
          .closestPointToPoint(middlePad,true,new THREE.Vector3());
        const indexPadResidual=indexPad.sub(indexTarget);
        const middlePadResidual=middlePad.sub(middleTarget);
        const axis=new THREE.Vector3(0,1,0).transformDirection(actualBow);
        const upright=axis.cross(up);
        const shaft=new THREE.Vector3(0,0,1).transformDirection(actualBow);
        return [
          // The arrow/string and the source finger hook share one goal.
          (finger.x-goal.x)*1.65,(finger.y-goal.y)*1.65,
          (finger.z-goal.z)*1.65,
          // Actual skinned index + middle pads contact the moving string,
          // instead of satisfying only their shared bone-crease midpoint.
          // Fixed source-skin volar pads provide continuous 3D Jacobians.
          // A nearest-any-digit-vertex distance alone is discontinuous and
          // may snap contact to a knuckle or a third finger.
          ...indexPadResidual.toArray(),
          ...middlePadResidual.toArray(),
          Math.max(0,skin.index-.006*scale)*2,
          Math.max(0,skin.middle-.006*scale)*2,
          Math.max(0,.006*scale-skin.ring)*.3,
          ...upright.toArray().map(v=>v*.045*scale),
          // This is the ACTUAL arrow launch axis carried by the bow socket.
          // A vertical bow can still roll/yaw around Y while pointing the
          // arrow 45 degrees away from the gaze: constrain both orientation
          // axes through legal holding/drawing shoulder, elbow and wrist FK.
          ...shaft.sub(forward).toArray().map(v=>v*.115*scale),
          // The contact fit may otherwise fold the bow elbow while placing
          // the fingertips perfectly on the string. Use a low-weight
          // skeletal extension residual INSIDE this shared IK, so contact
          // and elbow alignment are solved together (not post-rotated).
          ...(bowArm&&desiredBend!==undefined?[
            bowArmExtensionResidual(bowArm,desiredBend)*.55]:[]),
          // Keep the bow arm near its source-reach-calibrated target.
          (bowGrip.x-bowTarget.x)*.45,(bowGrip.y-bowTarget.y)*.45,
          (bowGrip.z-bowTarget.z)*.45,
          // A reference pose is a compliance preference, not a frozen
          // shoulder/elbow/wrist. Draw-hand contact can still induce small,
          // legal support-arm changes within the calibrated search envelope.
          ...(partialSupport?values.slice(0,holdingFreedoms.length)
            .map((v,i)=>(v-initial[i]!)*(guidedPartial?.075:.075)*scale):[]),
          Math.max(0,.018*scale-collisions.clearance(elbowMid))*1.5,
          Math.max(0,.012*scale-collisions.clearance(finger))*1.5,
          ...values.map((v,i)=>(v-seed[i]!)*.002),
          // The posed index skin supplies the physical arrow rest.
          // This residual moves the source drawing fingers and shared nock,
          // never a render-only shaft disconnected from the string.
          (values[freedoms.length]!-arrowRestY)*1.4,
        ];
      };
      // A larger bounded trust region reaches a verified source-pose target
      // within the original iteration budget; the shared solver still
      // line-searches all proposals and clamps every legal joint freedom.
      // The preceding bow-hand contact is mirrored in the neutral source.
      // Keep the joint parameterization equivariant through the subsequent
      // coupled arm/string solve as well. Reflect axial DOFs via calibrated
      // FK axes; the scalar bow-local nock offset remains a polar coordinate.
      const signs:readonly (1|-1)[]=[
        ...freedoms.map(f=>{
          const joint=model.human.spike.graph.joints.find(j=>j.id===f.jointId);
          if(!joint)throw new Error("Missing coupled archery FK joint");
          const side:HandSide=joint.role.endsWith("_right")||
            joint.id.includes("arm[right,0]")?"right":"left";
          return mirrorContactDifferenceSign(model.human.spike.graph,fk,
            f.jointId,f.motion,side);
        }),1,
      ];
      const fit=fitCanonicalIK(seed,nockLimits,signs,evaluate,32,.55);
      const candidate=commands(fit.values);
      fk.apply(candidate);
      const actualBow=dynamicBow();
      const finger=drawingFingerContactWorld(model,drawSide);
      const goal=nockWorldFor(actualBow,fit.values[freedoms.length]!);
      const error=finger.distanceTo(goal);
      const skin=fingerSkin(actualBow,goal,fullHook);
      const clearance=Math.min(
        collisions.clearance(at(elbow).lerp(at(wrist),.5)),
        collisions.clearance(finger));
      const bowDisplacement=twoHandGripContactWorld(model,hand)
        .distanceTo(bowTarget);
      const arrowAimDeviation=new THREE.Vector3(0,0,1)
        .transformDirection(actualBow).angleTo(forward);
      const bowArm=desiredBend===undefined?undefined:measureArmAlignment(
        at(bowShoulderBone),at(bowElbowBone),at(bowWristBone));
      const extensionCost=bowArm&&desiredBend!==undefined?
        bowArmExtensionResidual(bowArm,desiredBend)*.55:0;
      const shaftClearance=measureSourceArrowShaft(model,coarseBowSkin,
        actualBow,new THREE.Vector3(arrowRestX,fit.values[freedoms.length]!,localNock.z),
        descriptor.arrowLengthMeters,descriptor.arrowRest.shaftRadiusMeters);
      const shaftValid=shaftClearance.every(s=>
        s.nearestSurfaceClearanceMeters>=-.001*scale);
      const handleValid=signedFiniteCylinderDistance(
        arrowRestX,fit.values[freedoms.length]!,0,
        descriptor.handleRadiusMeters,descriptor.handleLengthMeters)-
        descriptor.arrowRest.shaftRadiusMeters>=-.001*scale;
      const restGap=Math.abs(fit.values[freedoms.length]!-arrowRestY);
      const cost=error+Math.max(0,.01*scale-clearance)*2+
        Math.max(0,restGap-.008*scale)*2+
        shaftClearance.reduce((sum,s)=>sum+
          Math.max(0,-s.nearestSurfaceClearanceMeters)*4,0)+
        Math.max(0,bowDisplacement-.06*scale)*.5+
        (skin.index+skin.middle)*1.5+
        arrowAimDeviation*.115*scale+extensionCost;
      drawAttempts++;
      drawIterations=Math.max(drawIterations,fit.iterations);
      const valid=error<.03*scale&&clearance>-.025*scale&&
        shaftValid&&handleValid&&
        arrowAimDeviation<=MAX_ARCHERY_AIM_DEVIATION_RADIANS;
      const skinValid=skin.index<.008*scale&&skin.middle<.008*scale;
      // Feasible true-skin contacts take precedence over proxy crease cost.
      // A lowered hook gap is not accepted if it makes the arm unreachable.
      if(!best||(valid&&!best.valid)||
          (valid===best.valid&&skinValid&&!best.skinValid)||
          (valid===best.valid&&skinValid===best.skinValid&&cost<best.cost))best={
        commands:candidate,world:actualBow,contact:finger,
        error,clearance,cost,skin,valid,skinValid,
        nockY:fit.values[freedoms.length]!,iterations:fit.iterations,
        armSeed,fingerSeed:fingerSeedIndex,
      };
      // Deterministic feasible-first exit at a bounded margin inside the
      // original 30-mm reach / 8-mm source-skin and 100-mm bow gates. A
      // solution with acceptable complete source-skin geometry does not
      // require 14 more expensive exploratory candidates; the hard
      // acceptance assertions remain unchanged.
      if(error<.029*scale&&clearance>0&&shaftValid&&handleValid&&
        bowDisplacement<.09*scale&&
        skin.index<.0075*scale&&skin.middle<.0075*scale&&
        arrowAimDeviation<=MAX_ARCHERY_AIM_DEVIATION_RADIANS&&
        // Do not stop at the first contacting but visibly bent arm. The
        // angular target affects selection only; strict source-skin contact
        // and aim acceptance remain mandatory and unchanged.
        (tension<.45||bowArm!==undefined&&
          bowArm.elbowInteriorRadians>THREE.MathUtils.degToRad(148))){
        best={commands:candidate,world:actualBow,contact:finger,
          error,clearance,cost,skin,valid:true,skinValid:true,
          nockY:fit.values[freedoms.length]!,iterations:fit.iterations,
          armSeed,fingerSeed:fingerSeedIndex};
        break candidateSearch;
      }
    }
    if(!best)throw new Error("Missing legal coupled archery candidate");
    selectedDrawTrace={arm:best.armSeed,finger:best.fingerSeed,
      score:best.cost};
    completed=best.commands;
    fk.apply(completed);
    solvedWorld=dynamicBow();
    target=localNock.clone().applyMatrix4(solvedWorld);
    contact=drawingFingerContactWorld(model,drawSide);
    localNock.y=best.nockY;
    target=nockWorldFor(best.world,best.nockY);
    drawError=contact.distanceTo(target);
    drawSkinGaps=best.skin;
    drawClearance=best.clearance;
    drawIterations=best.iterations;
  }
  const unsafe=collisions.clearance(contact)<-.015*scale;
  const arrowAimDeviation=new THREE.Vector3(0,0,1)
    .transformDirection(solvedWorld).angleTo(forward);
  const bowError=twoHandGripContactWorld(model,hand).distanceTo(bowTarget);
  const arrowShaftClearance=state==="rest"||state==="release"?undefined:
    measureSourceArrowShaft(model,bowSkin,solvedWorld,
      new THREE.Vector3(arrowRestX,localNock.y,localNock.z),
      descriptor.arrowLengthMeters,descriptor.arrowRest.shaftRadiusMeters);
  const arrowClear=arrowShaftClearance===undefined||
    arrowShaftClearance.every(s=>s.nearestSurfaceClearanceMeters>=-.001*scale);
  const reachable=handFit.accepted&&arrowClear&&bowError<.10*scale&&held.clearance>-.027*scale&&
    ((state==="rest"||state==="release")||
      drawError<.03*scale&&drawClearance>-.025*scale&&
      drawSkinGaps!==undefined&&drawSkinGaps.index<.008*scale&&
      drawSkinGaps.middle<.008*scale&&
      arrowAimDeviation<=MAX_ARCHERY_AIM_DEVIATION_RADIANS)&&!unsafe;
  // Restoring the original source pose on failure avoids broken IK, facial
  // clipping, and a weapon hovering on a disconnected hand.
  if(!reachable)fk.apply(base);
  if(!root.matrixWorld.equals(rootMatrix))
    throw new Error("Archery IK must not move character root");
  const nock=(state==="rest"||state==="release"?
    new THREE.Vector3(0,0,-descriptor.stringRestMeters).applyMatrix4(solvedWorld):
    target.clone());
  const z=new THREE.Vector3(0,0,1).transformDirection(solvedWorld);
  const resolved=solvedWorld.clone().invert();
  const contactLocal=contact.clone().applyMatrix4(resolved);
  const stanceAlignment=reachable?(()=>{
    const bowArm=measureArmAlignment(at(bowShoulderBone),at(bowElbowBone),
      at(bowWristBone));
    const grip=twoHandGripContactWorld(model,hand);
    const line=measurePullLineAlignment(grip,nock,
      at(bone(model,"elbow_"+drawSide,drawSide)));
    const projected=measureProjectedArmAlignment(at(bowShoulderBone),
      at(bowElbowBone),at(bowWristBone),up,forward);
    return Object.freeze({bowElbowInteriorRadians:bowArm.elbowInteriorRadians,
      bowElbowExtensionDeficitMeters:bowArm.extensionDeficitMeters,
      bowShoulderLeadMeters:at(bowShoulderBone).sub(
        at(bone(model,"shoulder_"+drawSide,drawSide))).dot(forward),
      drawElbowBehindHookMeters:line.behindHookMeters,
      drawElbowOffAxisMeters:line.perpendicularMeters,
      bowElbowTopViewRadians:projected.elbowInteriorRadians,
      bowArmForwardReachMeters:projected.reachAlongForwardMeters,
      bowArmLateralOffsetMeters:projected.wristLateralOffsetMeters});
  })():undefined;
  return Object.freeze({
    reachable,reason:!handFit.accepted||bowError>=.10*scale?"bow-unreachable":
      !arrowClear?"arrow-rest-unreachable":
      unsafe||held.clearance<=-.027*scale||
        state!=="rest"&&state!=="release"&&drawClearance<=-.025*scale?
        "body-intersection":
      state!=="rest"&&state!=="release"&&
        arrowAimDeviation>MAX_ARCHERY_AIM_DEVIATION_RADIANS?"aim-unreachable":
      state!=="rest"&&state!=="release"&&
        (drawError>=.03*scale||!drawSkinGaps||
          drawSkinGaps.index>=.008*scale||drawSkinGaps.middle>=.008*scale)?
        "draw-unreachable":"ok",
    hand,state,commands:Object.freeze(reachable?completed:base.slice()),
    iterations:held.iterations+drawIterations,solverAttempts:held.attempts+drawAttempts,
    bowHandErrorMeters:bowError,bowSkinContact:handFit.samples,drawHandErrorMeters:drawError,
    drawingSkinGapsMeters:drawSkinGaps,
    bodyClearanceMeters:Math.min(held.clearance,drawClearance,
      collisions.clearance(nock)),drawMeters:Math.max(0,
      -contactLocal.z-descriptor.stringRestMeters),
    actualDrawFraction:Math.max(0,Math.min(1,
      (-contactLocal.z-descriptor.stringRestMeters)/descriptor.maximumDrawMeters)),
    bowWorld:solvedWorld,nockWorld:nock,drawContactWorld:contact,
    arrowDirectionWorld:z,arrowAimDeviationRadians:arrowAimDeviation,
    stanceAlignment,descriptor,arrowShaftClearance,
    symmetryTrace:Object.freeze({
      holdingArmAttempts:held.attempts,holdingArmScore:held.score,
      bowContactCandidate:chosenHandCandidate.index,
      bowContactScore:chosenHandCandidate.cost,
      drawArmSeed:selectedDrawTrace.arm,
      drawFingerSeed:selectedDrawTrace.finger,drawScore:selectedDrawTrace.score,
    }),
  });
}
/** Independent final inspection against the posed source-skinned fingers.
 * The bounded IK residual uses anatomical joint landmarks for performance;
 * only this final diagnostic evaluates actual MakeHuman source skin. The
 * string is the two real segments in the bow descriptor (not a free target).
 * An empty candidate set is invalid rather than silently reporting contact. */
export interface StringSkinGap {
  readonly digit:"index"|"middle"|"ring";
  readonly skinVertices:number;
  readonly nearestGapMeters:number;
}
export function measureStringFingerSkin(model:StudioHumanModel,
  hand:HandSide,result:ArcheryPoseResult):readonly StringSkinGap[]{
  const {mesh,spike,template}=model.human;
  spike.character.root.updateWorldMatrix(true,true);
  mesh.updateWorldMatrix(true,false);
  const pos=mesh.geometry.getAttribute("skinIndex");
  const weights=mesh.geometry.getAttribute("skinWeight");
  const scale=result.descriptor.limbLengthMeters/.64;
  const start=result.nockWorld;
  const tips=[-1,1].map(sign=>
    bowNockLocal(result.descriptor,sign===1?1:-1).applyMatrix4(result.bowWorld));
  const lines=tips.map(tip=>new THREE.Line3(start,tip));
  const indices=new Map((["index","middle","ring"] as const).map(digit=>[
    digit,new Set(spike.graph.joints.filter(j=>j.role.startsWith("finger_"+digit+"_")&&
      j.id.includes("arm["+hand+",0]")).map(j=>
      spike.skeleton.bones.indexOf(spike.bones.get(j.id)!))),
  ]));
  const found=new Map<"index"|"middle"|"ring",
    {count:number;gap:number}>();
  for(const digit of indices.keys())found.set(digit,{count:0,gap:Infinity});
  const unique=new Set<number>();
  const world=new THREE.Vector3(),near=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    const source=template.sourceVertexIds[i]??i;
    if(unique.has(source))continue;
    unique.add(source);
    const eligible=(["index","middle","ring"] as const).filter(digit=>{
      let influence=0;
      for(let k=0;k<4;k++)
        if(indices.get(digit)!.has(pos.getComponent(i,k)))
          influence+=weights.getComponent(i,k);
      return influence>=.6;
    });
    if(!eligible.length)continue;
    mesh.getVertexPosition(i,world).applyMatrix4(mesh.matrixWorld);
    if(world.distanceTo(start)>.10*scale)continue;
    let nearest=Infinity;
    for(const line of lines){
      line.closestPointToPoint(world,true,near);
      nearest=Math.min(nearest,world.distanceTo(near));
    }
    const gap=Math.max(0,nearest-.0018*scale);
    for(const digit of eligible){
      const record=found.get(digit)!;
      record.count++;
      record.gap=Math.min(record.gap,gap);
    }
  }
  return Object.freeze((["index","middle","ring"] as const).map(digit=>{
    const sample=found.get(digit)!;
    return Object.freeze({digit,skinVertices:sample.count,
      nearestGapMeters:sample.gap});
  }));
}
function segment(a:THREE.Vector3,b:THREE.Vector3,r:number,mat:THREE.Material){
  const d=b.clone().sub(a);
  const obj=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),8),mat);
  obj.position.copy(a).add(b).multiplyScalar(.5);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  obj.castShadow=true;
  return obj;
}
/** One disposable, replaceable reference asset. The entire hierarchy is in
 * bow local coordinates; neither render nor UI callbacks launch a projectile. */
export class StudioBowPreview {
  readonly descriptor:BowReferenceV1;
  readonly object:THREE.Group=new THREE.Group();
  readonly nockLocal:THREE.Vector3;
  readonly tipLocal:THREE.Vector3;
  private readonly socketOffset:THREE.Matrix4;
  constructor(private readonly model:StudioHumanModel,readonly result:ArcheryPoseResult,
    readonly profile:BowProfile="recurve"){
    if(!result.reachable)throw new Error("Unreachable source-skinned bow pose");
    this.descriptor=result.descriptor;
    const d=result.descriptor;
    this.object.name="StudioBowPreview";
    const wood=new THREE.MeshStandardMaterial({color:0x805336,roughness:.67});
    const grip=new THREE.MeshStandardMaterial({color:0x392820,roughness:.9});
    const gold=new THREE.MeshStandardMaterial({color:0xc5a46b,metalness:.6,roughness:.36});
    const string=new THREE.MeshStandardMaterial({color:0xe7d8b0,roughness:.95});
    const shaft=new THREE.MeshStandardMaterial({color:0xb38b55,roughness:.75});
    const steel=new THREE.MeshStandardMaterial({color:0xd4dbe0,metalness:.7,roughness:.28});
    const feather=new THREE.MeshStandardMaterial({color:0xe6e0c7,side:THREE.DoubleSide});
    const factor=d.limbLengthMeters/.64;
    const handle=new THREE.Mesh(new THREE.CylinderGeometry(
      d.handleRadiusMeters,d.handleRadiusMeters,d.handleLengthMeters,12),grip);
    handle.name="BowHandle";this.object.add(handle);
    // Manufactured geometry is one exact mirror-symmetric YZ stave loft.
    // The cylinder remains the contact-authoritative hand-pressure surface;
    // profile changes never displace it or the socket-aligned bow frame.
    const stave=createBowStaveGeometry(defaultBowStaveOptions(d,profile));
    const limb=new THREE.Mesh(stave.geometry,wood);
    limb.name="BowStave";
    limb.castShadow=true;
    this.object.add(limb);
    // Named subparts intentionally reference the same parent stave object:
    // no independently positioned limb meshes or asymmetrical caps.
    const top=stave.upperNock,bottom=stave.lowerNock;
    for(const nock of [top,bottom]){
      const ferrule=new THREE.Mesh(
        new THREE.SphereGeometry(.006*factor,12,8),gold);
      ferrule.name=nock.y>0?"UpperBowNock":"LowerBowNock";
      ferrule.position.copy(nock);
      this.object.add(ferrule);
    }
    const local=result.nockWorld.clone().applyMatrix4(result.bowWorld.clone().invert());
    // Clamp the string center to a stable axis at supported contact tolerance;
    // errors outside this range are handled as unreachable by the IK result.
    this.nockLocal=local;
    for(const tip of [top,bottom]){
      const stringMesh=segment(tip,local,.0018*factor,string);
      stringMesh.name="BowString";
      this.object.add(stringMesh);
    }
    this.tipLocal=local.clone().add(new THREE.Vector3(0,0,d.arrowLengthMeters));
    if(result.state!=="rest"&&result.state!=="release"){
      const nock=local.clone();
      const arrowTip=this.tipLocal;
      const arrow=segment(nock.clone().addScaledVector(
        new THREE.Vector3(0,0,1),.025*factor),
        arrowTip.clone().addScaledVector(new THREE.Vector3(0,0,1),-.045*factor),
        d.arrowRest.shaftRadiusMeters,shaft);
      arrow.name="NockedArrowShaft";
      this.object.add(arrow);
      const tip=new THREE.Mesh(new THREE.ConeGeometry(.016*factor,.065*factor,6),steel);
      tip.rotation.x=Math.PI/2;tip.position.copy(arrowTip).addScaledVector(
        new THREE.Vector3(0,0,1),-.0325*factor);
      tip.name="NockedArrowTip";this.object.add(tip);
      const nockCap=new THREE.Mesh(new THREE.SphereGeometry(.008*factor,8,6),gold);
      nockCap.position.copy(nock);nockCap.name="ArrowNock";this.object.add(nockCap);
      for(let i=0;i<3;i++){
        const vane=new THREE.Mesh(new THREE.PlaneGeometry(.037*factor,.1*factor),feather);
        vane.rotation.set(Math.PI/2,0,i*Math.PI*2/3);
        vane.position.copy(nock).add(new THREE.Vector3(0,0,.105*factor));
        vane.name="ArrowFletching"+i;this.object.add(vane);
      }
    }
    this.socketOffset=model.human.spike.character.socketWorld(d.socketId)
      .invert().multiply(result.bowWorld);
    this.update();
  }
  update():void{
    this.object.matrixAutoUpdate=false;
    this.object.matrix.multiplyMatrices(this.model.human.spike.character
      .socketWorld(this.descriptor.socketId),this.socketOffset);
    this.object.matrixWorldNeedsUpdate=true;
  }
  dispose():void{
    this.object.removeFromParent();
    const geometries=new Set<THREE.BufferGeometry>();
    const materials=new Set<THREE.Material>();
    this.object.traverse(o=>{
      if(o instanceof THREE.Mesh){
        geometries.add(o.geometry);
        for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);
      }
    });
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    this.object.clear();
  }
}
