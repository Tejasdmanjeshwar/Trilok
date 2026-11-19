/**
 * C6.3 diagnostic: reproducible per-frame *real weighted skin* foot evidence.
 * World-space locomotion reconstructs only source-authored root displacement
 * for measurement; Studio preview and gameplay movement stay unchanged.
 */
import * as THREE from "three";

const R=(n)=>+n.toFixed(6);
const quantile=(v,p)=>{
  if(!v.length)return null;
  const sorted=[...v].sort((a,b)=>a-b);
  return R(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]);
};
const STANCE_TOLERANCE=0.03;

export function captureC63SkinnedFootCycle({human,fk,correctives,frames,
  clipId,pelvisId,originalSourceSha256,lockedRoot}) {
  if(!frames.length)throw Error("Missing genuine source foot frames");
  const mesh=human.mesh;
  if(mesh.name!=="C2_MAKEHUMAN_CC0_WEIGHTED_SKINNING")
    throw Error("Foot evidence requires official MakeHuman skin weights");
  const geometry=mesh.geometry;
  const positions=geometry.getAttribute("position");
  const indices=geometry.getAttribute("skinIndex");
  const weights=geometry.getAttribute("skinWeight");
  if(!positions||!indices||!weights)
    throw Error("Missing actual weighted sole geometry");
  const graph=human.spike.graph;
  const choose=(role)=>graph.joints.find(j=>j.role===role)?.id;
  const groups={};
  for(const side of ["left","right"]){
    const footIndices=new Set(["ankle_"+side,"toe_"+side].map(choose).map(id=>{
      const bone=id?human.spike.bones.get(id):undefined;
      return human.spike.skeleton.bones.indexOf(bone);
    }));
    if(footIndices.has(-1))throw Error("Missing mapped ankle/toe for "+side);
    const vertices=[];
    for(let i=0;i<positions.count;i++){
      const originalY=positions.getY(i);
      // The source MakeHuman foot is distal to the ankle and below mid-shin;
      // exclude influenced shin/leg vertices above the sole.
      if(originalY>0.32)continue;
      let strength=0;
      for(let k=0;k<4;k++)
        if(footIndices.has(indices.getComponent(i,k)))
          strength+=weights.getComponent(i,k);
      if(strength>0.5)vertices.push(i);
    }
    if(vertices.length<16)
      throw Error("Insufficient genuine weighted foot vertices "+side+": "+vertices.length);
    groups[side]=vertices;
  }
  fk.applyRestDeltas([]);
  correctives.applyAnimationSamples([]);
  human.spike.character.root.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  human.spike.skeleton.update();
  const tmp=new THREE.Vector3();
  const originFloor={};
  for(const side of ["left","right"]){
    const heights=groups[side].map(index=>{
      const rest=tmp.fromBufferAttribute(positions,index);
      return mesh.getVertexPosition(index,rest).applyMatrix4(mesh.matrixWorld).y;
    });
    originFloor[side]=Math.min(...heights);
  }
  const floor=Math.min(...Object.values(originFloor));
  const start=frames[0].sourceRoot;
  const prev={left:new Map(),right:new Map()};
  const contact={left:0,right:0};
  const slip={left:[],right:[]};
  const penetrating={left:[],right:[]};
  const footLows={left:[],right:[]};
  const samples=[];
  for(const data of frames){
    const bob=lockedRoot?0:data.sourceRoot[1]-start[1];
    if(!Number.isFinite(bob)||Math.abs(bob)>0.25)
      throw Error("Invalid authored vertical root excursion "+clipId+"/"+data.frame);
    const sample=data.samples.map(s=>s.jointId===pelvisId?
      {...s,translation:[0,bob,0]}:s);
    correctives.applyAnimationSamples(sample);
    fk.applyRestDeltas(sample);
    human.spike.character.root.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);
    human.spike.skeleton.update();
    const horizontal=new THREE.Vector3(data.sourceRoot[0]-start[0],0,
      data.sourceRoot[2]-start[2]);
    const frameOut={frame:data.frame,seconds:R(data.seconds),feet:{}};
    for(const side of ["left","right"]){
      const previous=prev[side],current=new Map();
      let minY=Infinity;
      for(const index of groups[side]){
        const source=tmp.fromBufferAttribute(positions,index);
        const pos=mesh.getVertexPosition(index,source).applyMatrix4(mesh.matrixWorld);
        minY=Math.min(minY,pos.y);
        current.set(index,[pos.x+horizontal.x,pos.y,pos.z+horizontal.z]);
      }
      if(!Number.isFinite(minY))throw Error("Nonfinite foot mesh "+clipId+"/"+data.frame);
      const active=minY<=floor+STANCE_TOLERANCE;
      if(active)contact[side]++;
      const penetration=Math.max(0,floor-minY);
      penetrating[side].push(penetration);
      footLows[side].push(minY);
      for(const [index,now] of current){
        const before=previous.get(index);
        if(!before||!active)continue;
        if(now[1]<=floor+STANCE_TOLERANCE&&
           before[1]<=floor+STANCE_TOLERANCE)
          slip[side].push(Math.hypot(now[0]-before[0],now[2]-before[2]));
      }
      frameOut.feet[side]={lowestY:R(minY),stance:active,
        penetrationMeters:R(penetration)};
      prev[side]=current;
    }
    samples.push(frameOut);
  }
  return {schemaVersion:1,kind:"c6.3-source-backed-real-skin-foot-cycle",
    clipId,originalSourceSha256,frames:frames.length,
    sourceFrameWindow:[frames[0].frame,frames.at(-1).frame],
    sourceSampleStepSeconds:R(frames.length>1?frames[1].seconds-frames[0].seconds:0),
    unposedSoleGroundYMeters:R(floor),
    reconstruction:"Genuine source BVH root X/Z added ONLY to foot world-space measurements; "+
      "source vertical bob applies to target visual root as canonical experimental clip.",
    thresholdMeters:STANCE_TOLERANCE,
    feet:Object.fromEntries(["left","right"].map(side=>[side,{
      weightedVertexCount:groups[side].length,
      restMinYMeters:R(originFloor[side]),
      stanceFrames:contact[side],stanceFraction:R(contact[side]/frames.length),
      maximumBelowRestGroundMeters:quantile(penetrating[side],1),
      p95BelowRestGroundMeters:quantile(penetrating[side],.95),
      worldContactSlipSamples:slip[side].length,
      worldContactSlipP95PerFrameMeters:quantile(slip[side],.95),
      worldContactSlipMaxPerFrameMeters:quantile(slip[side],1),
      maximumObservedSoleYMeters:quantile(footLows[side],1),
    }])),samples,
    acceptedForProduction:false,
    caveat:"Measured at original MakeHuman bind morphology, without grounded IK. "+
      "Contact inferred from weighted sole height, not a force-plate capture.",
  };
}
