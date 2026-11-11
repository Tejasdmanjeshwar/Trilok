import {describe,expect,it} from "vitest";
import {
  aimBallisticAt,appendTrajectorySegment,findInterceptionWindow,
  planInterception,sampleTrajectory,distance,
  getLegalReactions,getInterceptionPlan,queueAttack,resolveReaction,
  resolveProjectileContinuation,type InterceptionRequest,type ProjectileTrajectory,
} from "../packages/combat/src/index";
import {createPreviewEncounter,PREVIEW_CATALOG} from "../apps/web/src/combat/preview-encounter";
const gravity={x:0,y:-9.81,z:0};
const A={x:10,y:1.5,z:0};
const B={x:0,y:1.5,z:0};
const stillA:ProjectileTrajectory={kind:"ballistic",startTick:0,origin:A,
  velocity:{x:0,y:0,z:0},acceleration:{x:0,y:0,z:0}};
const incoming=aimBallisticAt(715,A,B,1150,gravity);
const base:Omit<InterceptionRequest,"inputTick">={
  incoming,launchOrigin:B,
  targetAtTick:tick=>sampleTrajectory(stillA,tick).position,
  move:{minSpeed:5,maxSpeed:92,releaseDelayTicks:80,acceleration:gravity,
    earliestClashTick:730,latestClashTick:1120,sampleStepTicks:12,
    continuationHorizonTicks:900,targetRadiusMeters:.85},
};
describe("v0.4-D4 deterministic extensible projectile motion",()=>{
  it("samples the same ballistic position and tangent regardless of frame order",()=>{
    const path=aimBallisticAt(715,A,B,1150,gravity);
    const end=sampleTrajectory(path,1150);
    expect(distance(end.position,B)).toBeLessThan(1e-7);
    expect(sampleTrajectory(path,900)).toEqual(sampleTrajectory(path,900));
    const apex=sampleTrajectory(path,932).position.y;
    expect(apex).toBeGreaterThan(Math.min(A.y,B.y));
    expect(sampleTrajectory(path,900).velocity.y).toBeGreaterThan(
      sampleTrajectory(path,1050).velocity.y);
  });
  it("supports straight rays and future homing as piecewise deterministic guidance",()=>{
    const straight=aimBallisticAt(0,B,A,500,{x:0,y:0,z:0});
    expect(distance(sampleTrajectory(straight,250).position,{x:5,y:1.5,z:0})).toBeLessThan(1e-7);
    const guided=appendTrajectorySegment(straight,250,
      {x:20,y:5,z:0},{x:0,y:0,z:-3});
    expect(distance(sampleTrajectory(guided,250).position,
      sampleTrajectory(straight,250).position)).toBeLessThan(1e-7);
    expect(sampleTrajectory(guided,450).position.y).toBeGreaterThan(
      sampleTrajectory(straight,450).position.y);
    expect(()=>appendTrajectorySegment(guided,220,
      {x:2,y:1,z:0},gravity)).toThrow();
  });
  it("solves exact projectile interception without moving either arrow to the collision",()=>{
    const solution=planInterception({...base,inputTick:890});
    expect(solution).not.toBeNull();
    const atIncoming=sampleTrajectory(incoming,solution!.clashTick).position;
    const atDefender=sampleTrajectory(solution!.flight,solution!.clashTick).position;
    expect(distance(atIncoming,atDefender)).toBeLessThan(1e-7);
    expect(solution!.launchSpeed).toBeGreaterThanOrEqual(5);
    expect(solution!.launchSpeed).toBeLessThanOrEqual(92);
    const repeat=planInterception({...base,inputTick:890});
    expect(repeat).toEqual(solution);
  });
  it("never advertises a perfect tick unless exact collision planning succeeds",()=>{
    const window=findInterceptionWindow({
      attackStartedTick:0,attackImpactTick:1150,earliestInputTick:750,
      latestInputTick:1000,inputStepTicks:6,base,
    });
    expect(window).not.toBeNull();
    expect(window!.perfectStartTick).toBeGreaterThanOrEqual(window!.firstTick);
    expect(window!.perfectEndTick).toBeLessThanOrEqual(window!.lastTick);
    for(let tick=window!.perfectStartTick;tick<=window!.perfectEndTick;tick++){
      expect(planInterception({...base,inputTick:tick}),String(tick)).not.toBeNull();
    }
  });
  it("rejects physically unreachable arrows rather than teleporting them",()=>{
    const impossible={...base,move:{...base.move,maxSpeed:2,minSpeed:1}};
    expect(planInterception({...impossible,inputTick:900})).toBeNull();
    expect(findInterceptionWindow({
      attackStartedTick:0,attackImpactTick:1150,earliestInputTick:750,
      latestInputTick:1000,inputStepTicks:6,base:impossible,
    })).toBeNull();
  });
  it("plans through the opponent when possible but does not fake a future hit",()=>{
    const solved=planInterception({...base,inputTick:890});
    expect(solved).not.toBeNull();
    expect(Number.isFinite(solved!.continuationMissMeters)).toBe(true);
    const displaced={...base,targetAtTick:()=>({x:40,y:1.5,z:15})};
    const far=planInterception({...displaced,inputTick:890});
    expect(far).not.toBeNull();
    expect(far!.dualTarget).toBe(false);
    expect(far!.continuationMissMeters).toBeGreaterThan(solved!.continuationMissMeters);
  });
  it("the encounter exposes the solver-derived timing zone and the same continuing trajectory",()=>{
    const baseState=createPreviewEncounter();
    const ready={...baseState,actors:{...baseState.actors,
      enemy:{...baseState.actors.enemy!,equippedId:"rakshasa_bow"},
    }};
    const state=queueAttack(ready,{
      attackerId:"hero",defenderId:"enemy",moveId:"arrow",
      distanceAtStartMeters:10,startedTick:0,
      projectileGeometry:{
        incoming,defenderLaunchOrigin:B,attackerPosition:stillA,
      },
    },PREVIEW_CATALOG);
    const option=getLegalReactions(state,PREVIEW_CATALOG)
      .find(x=>x.technique==="projectile_intercept");
    expect(option?.feasibleWindow).toBeDefined();
    const tick=option!.targetTick;
    const plan=getInterceptionPlan(state,PREVIEW_CATALOG,option!.moveId,tick);
    expect(plan).not.toBeNull();
    const r=resolveReaction(state,{
      defenderId:"enemy",defenseMoveId:option!.moveId,
      reactionTick:tick,resolvedTick:plan!.clashTick,distanceAtImpactMeters:10,
    },PREVIEW_CATALOG);
    expect(r.outcome.grade).toBe("perfect");
    expect(r.outcome.projectileClash?.interceptionPlan).toEqual(plan);
    expect(r.outcome.counter).toBeNull();
    const survivor=r.state.pendingProjectile;
    if(survivor){
      expect(survivor.trajectory).toBeDefined();
      const before=sampleTrajectory(survivor.trajectory!,plan!.clashTick).velocity;
      const after=sampleTrajectory(survivor.trajectory!,plan!.clashTick+1).velocity;
      expect(distance(after,before)).toBeLessThan(.02); // gravity, not collision impulse
      const done=resolveProjectileContinuation(r.state,{
        projectileId:survivor.projectileId,resolvedTick:survivor.impactTick,
        distanceAtImpactMeters:10,actualRegionId:null,contact:false,
      },PREVIEW_CATALOG);
      expect(done.outcome.damage).toBe(0);
    }
  });
});
