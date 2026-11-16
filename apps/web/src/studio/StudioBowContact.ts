import * as THREE from "three";
import type {JointTarget,AnatomicalFK,AnatomicalMotion} from "../characters/geometry/AnatomicalFK";
import type {StudioHumanModel} from "./StudioHumanModel";
import type {HandSide} from "./StudioTwoHandGrip";
import {fitConstrainedIK} from "./ConstrainedIK";
import {HAND_SURFACE_REGIONS,measureSourceCylinder,sourceHandSamples,
  type SourceCylinderRegion} from "./StudioSourceContact";

/** A grip fit is an alternating constrained search of source finger FK and
 * socket-local cylinder translation. The handle is rigid and identical to the
 * rendered reference, rather than independently moving individual digits.
 * Failed gates are reported and never silently interpreted as successful IK. */
export interface BowContactFit {
  readonly commands:readonly JointTarget[];
  readonly bowWorld:THREE.Matrix4;
  readonly samples:readonly SourceCylinderRegion[];
  readonly accepted:boolean;
  readonly iterations:number;
  readonly residual:number;
}
type Channel={jointId:string;motion:AnatomicalMotion;min:number;max:number};
const DIGITS=["index","middle","ring","little"] as const;
/** PIP/MCP and thumb opposition are enough to adapt the hand envelope;
 * preserve distal joint curls from the authored contact profile. */
function freedoms(model:StudioHumanModel,fk:AnatomicalFK,side:HandSide):Channel[]{
  const graph=model.human.spike.graph;
  const result:Channel[]=[];
  for(const digit of DIGITS){
    for(const index of [0,1]){
      const role="finger_"+digit+"_"+index;
      const joint=graph.joints.find(j=>j.role===role&&
        j.id.includes("arm["+side+",0]"));
      const freedom=joint&&fk.frames.get(joint.id)?.freedoms.get("flexion");
      if(!joint||!freedom)throw new Error("Missing source bow finger freedom "+role);
      result.push({jointId:joint.id,motion:"flexion",min:freedom.min,max:freedom.max});
    }
  }
  for(const [index,motion] of [[0,"opposition"],[0,"flexion"],[1,"flexion"]] as const){
    const joint=graph.joints.find(j=>j.role==="finger_thumb_"+index&&
      j.id.includes("arm["+side+",0]"));
    const freedom=joint&&fk.frames.get(joint.id)?.freedoms.get(motion);
    if(!joint||!freedom)throw new Error("Missing calibrated bow thumb "+index+"/"+motion);
    result.push({jointId:joint.id,motion,min:freedom.min,max:freedom.max});
  }
  return result;
}
function overlay(base:readonly JointTarget[],channels:readonly Channel[],
  values:readonly number[]):JointTarget[]{
  const result=new Map(base.map(c=>[c.jointId+"/"+c.motion,c]));
  channels.forEach((channel,i)=>{
    const radians=values[i]!;
    result.set(channel.jointId+"/"+channel.motion,
      {jointId:channel.jointId,motion:channel.motion,radians});
  });
  return [...result.values()];
}
function criteria(samples:readonly SourceCylinderRegion[]):boolean{
  return samples.every(s=>s.axialVertices>=3&&s.contactVertices>=2&&
    s.maximumPenetrationMeters<.003&&
    s.nearestGapMeters<(s.region==="palm"?.004:.005));
}
/** Contact loss and penetration are different constraints. Clipping uses a
 * stronger penalty than floating, and every region must contribute. Position
 * and finger freedoms are alternated, with a bounded deterministic pass count
 * and no arbitrary adjustment after convergence. */
export function fitBowHandContact(model:StudioHumanModel,fk:AnatomicalFK,
  base:readonly JointTarget[],side:HandSide,startingWorld:THREE.Matrix4,
  radius:number,length:number):BowContactFit{
  const channels=freedoms(model,fk,side);
  const starting=new Map(base.map(c=>[c.jointId+"/"+c.motion,c.radians]));
  const initial=channels.map(ch=>THREE.MathUtils.clamp(
    starting.get(ch.jointId+"/"+ch.motion)??0,ch.min,ch.max));
  const sampled=sourceHandSamples(model,side,80);
  const complete=sourceHandSamples(model,side);
  const bounds=Math.max(radius*2,.005);
  const offsets=[0,0,0];
  const angles=[...initial];
  const contactWorld=(translation:readonly number[])=>startingWorld.clone().multiply(
    new THREE.Matrix4().makeTranslation(translation[0]!,translation[1]!,translation[2]!));
  const evaluate=(jointAngles:readonly number[],shift:readonly number[])=>{
    fk.apply(overlay(base,channels,jointAngles));
    return measureSourceCylinder(model,sampled,contactWorld(shift),radius,length);
  };
  const fitness=(jointAngles:readonly number[],shift:readonly number[])=>{
    const regions=evaluate(jointAngles,shift);
    const residual:number[]=[];
    for(const part of regions){
      // A source region is not in contact if its closest skinned vertex
      // misses the finite cylinder; an empty axial interval is not success.
      residual.push(Math.max(0,part.nearestGapMeters-.0015)*1.5);
      residual.push(Math.max(0,part.maximumPenetrationMeters-.0005)*4);
      residual.push(part.axialVertices<3?.012:0);
      // Smooth third-nearest residual makes a real palm/finger contact patch
      // optimizable; boolean vertex counts have zero useful derivative.
      residual.push(Math.max(0,part.thirdNearestGapMeters-.0012)*2.5);
    }
    // Physical morphology provides bounds; this merely breaks ties for
    // equivalent near-contact poses and avoids implausible extreme curls.
    for(let i=0;i<jointAngles.length;i++)
      residual.push((jointAngles[i]!-initial[i]!)*.0005);
    for(let i=0;i<3;i++)residual.push(shift[i]!*.0008/bounds);
    return residual;
  };
  let iterations=0;
  let best=Infinity;
  let bestAccepted=false;
  let bestAngles=[...angles],bestOffsets=[...offsets];
  const record=()=>{
    const residual=fitness(angles,offsets);
    const score=residual.reduce((s,x)=>s+x*x,0);
    const accepted=criteria(measureSourceCylinder(
      model,complete,contactWorld(offsets),radius,length));
    if((accepted&&!bestAccepted)||(accepted===bestAccepted&&score<best)){
      best=score;bestAccepted=accepted;
      bestAngles=[...angles];bestOffsets=[...offsets];
    }
  };
  record();
  // Explicit block-coordinate constrained optimization: the contact
  // geometry is recomputed after each block, never separately 'tuned'.
  for(let cycle=0;cycle<5;cycle++){
    const offsetFit=fitConstrainedIK(offsets,
      [{min:-bounds,max:bounds},{min:-length*.30,max:length*.30},
        {min:-bounds,max:bounds}],
      values=>fitness(angles,values),20);
    offsets.splice(0,3,...offsetFit.values);iterations+=offsetFit.iterations;
    record();
    const fingerFit=fitConstrainedIK(angles,channels,
      values=>fitness(values,offsets),20);
    angles.splice(0,angles.length,...fingerFit.values);
    iterations+=fingerFit.iterations;
    record();
    if(criteria(evaluate(angles,offsets)))break;
  }
  const commands=overlay(base,channels,bestAngles);
  fk.apply(commands);
  const bowWorld=contactWorld(bestOffsets);
  const inspected=measureSourceCylinder(model,complete,bowWorld,radius,length);
  return Object.freeze({commands:Object.freeze(commands),
    bowWorld,samples:inspected,accepted:criteria(inspected),
    iterations,residual:Math.sqrt(best)});
}
