/**
 * Deterministic, frame-rate independent projectile motion and interception.
 *
 * Every model returns position AND velocity at a simulation tick. Renderer,
 * hit detection and AI call the same sampler, never a separate easing curve.
 *
 * A future homing controller can emit deterministic piecewise flight segments
 * on fixed simulation ticks; the sampler and clash pipeline need no changes.
 */
export interface Vector3 { readonly x: number; readonly y: number; readonly z: number }
export interface BallisticSegment {
  readonly startTick: number;
  readonly origin: Vector3;
  readonly velocity: Vector3; // metres / second
  readonly acceleration: Vector3; // metres / second squared
}
export type ProjectileTrajectory =
  | ({ readonly kind: "ballistic" } & BallisticSegment)
  | { readonly kind: "piecewise"; readonly segments: readonly BallisticSegment[] };
export interface ProjectileSample { readonly position: Vector3; readonly velocity: Vector3 }

export const vec = (x:number,y:number,z:number):Vector3 => ({x,y,z});
export const add = (a:Vector3,b:Vector3):Vector3 => vec(a.x+b.x,a.y+b.y,a.z+b.z);
export const subtract = (a:Vector3,b:Vector3):Vector3 => vec(a.x-b.x,a.y-b.y,a.z-b.z);
export const scale = (a:Vector3,v:number):Vector3 => vec(a.x*v,a.y*v,a.z*v);
export const dot = (a:Vector3,b:Vector3):number => a.x*b.x+a.y*b.y+a.z*b.z;
export const length = (a:Vector3):number => Math.sqrt(dot(a,a));
export const distance = (a:Vector3,b:Vector3):number => length(subtract(a,b));
export const lerp = (a:Vector3,b:Vector3,t:number):Vector3 => add(a,scale(subtract(b,a),t));
const finiteVec=(v:Vector3)=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
const validTick=(v:number)=>Number.isSafeInteger(v)&&v>=0;
function assertSegment(s:BallisticSegment):void {
  if(!validTick(s.startTick)||!finiteVec(s.origin)||!finiteVec(s.velocity)||
     !finiteVec(s.acceleration)) throw new Error("Invalid projectile segment.");
}
export function validateTrajectory(t:ProjectileTrajectory):void {
  if(t.kind==="ballistic"){assertSegment(t);return;}
  if(t.kind!=="piecewise"||!t.segments.length||t.segments.length>256)
    throw new Error("Invalid trajectory kind or segment count.");
  let previous=-1;
  for(const segment of t.segments){
    assertSegment(segment);
    if(segment.startTick<=previous) throw new Error("Projectile segments must be time ordered.");
    previous=segment.startTick;
  }
}
export function sampleTrajectory(path:ProjectileTrajectory,tick:number):ProjectileSample {
  if(!Number.isFinite(tick))throw new Error("Invalid projectile sample tick.");
  const segments=path.kind==="ballistic"?[path]:path.segments;
  if(!segments.length)throw new Error("Missing projectile segments.");
  let segment=segments[0]!;
  for(let i=1;i<segments.length;i++){
    const next=segments[i]!;
    if(next.startTick>tick)break;
    segment=next;
  }
  const seconds=Math.max(0,(tick-segment.startTick)/1000);
  return {
    position:add(add(segment.origin,scale(segment.velocity,seconds)),
      scale(segment.acceleration,.5*seconds*seconds)),
    velocity:add(segment.velocity,scale(segment.acceleration,seconds)),
  };
}
/** New guidance segment for homing or authored steering: same projectile, same path. */
export function appendTrajectorySegment(path:ProjectileTrajectory,
  tick:number, velocity:Vector3,acceleration:Vector3):ProjectileTrajectory {
  if(!validTick(tick)||!finiteVec(velocity)||!finiteVec(acceleration))
    throw new Error("Invalid guidance change.");
  const segments=path.kind==="ballistic"?[path]:path.segments;
  if(tick<=segments[segments.length-1]!.startTick)
    throw new Error("Guidance changes must be forward in time.");
  return {kind:"piecewise",segments:[...segments,{
    startTick:tick,
    origin:sampleTrajectory(path,tick).position,
    velocity,acceleration,
  }]};
}
/** Convenience constructor: deterministic launch arc through a desired point. */
export function aimBallisticAt(startTick:number, origin:Vector3, target:Vector3,
  arriveTick:number,acceleration:Vector3):ProjectileTrajectory {
  if(!validTick(startTick)||!validTick(arriveTick)||arriveTick<=startTick||
    !finiteVec(origin)||!finiteVec(target)||!finiteVec(acceleration))
    throw new Error("Invalid ballistic aim.");
  const seconds=(arriveTick-startTick)/1000;
  return {kind:"ballistic",startTick,origin,acceleration,
    velocity:scale(subtract(subtract(target,origin),
      scale(acceleration,.5*seconds*seconds)),1/seconds)};
}

export interface InterceptionMove {
  readonly minSpeed: number;
  readonly maxSpeed: number;
  readonly acceleration: Vector3;
  readonly releaseDelayTicks: number;
  readonly earliestClashTick: number;
  readonly latestClashTick: number;
  readonly sampleStepTicks?: number;
  readonly continuationHorizonTicks?: number;
  readonly contactRadiusMeters?: number;
  readonly targetRadiusMeters?: number;
}
export interface InterceptionRequest {
  readonly incoming: ProjectileTrajectory;
  readonly inputTick: number;
  readonly launchOrigin: Vector3;
  readonly targetAtTick: (tick:number)=>Vector3; // predicted original attacker
  readonly move: InterceptionMove;
}
export interface InterceptionPlan {
  readonly inputTick: number;
  readonly releaseTick: number;
  readonly clashTick: number;
  readonly clashPoint: Vector3;
  readonly flight: ProjectileTrajectory;
  readonly launchSpeed: number;
  readonly continuationClosestTick: number;
  readonly continuationMissMeters: number;
  readonly dualTarget: boolean;
}
/** Evaluate a future continuation point, not just whether projectiles collide. */
function closestTargetApproach(path:ProjectileTrajectory, startTick:number,
  endTick:number, targetAtTick:(tick:number)=>Vector3, step:number){
  let bestDistance=Number.POSITIVE_INFINITY,bestTick=startTick;
  const count=Math.max(1,Math.ceil((endTick-startTick)/step));
  for(let i=1;i<=count;i++){
    const tick=Math.round(startTick+(endTick-startTick)*i/count);
    const center=targetAtTick(tick);
    if(!finiteVec(center))throw new Error("Invalid predicted target position.");
    const d=distance(sampleTrajectory(path,tick).position,center);
    if(d<bestDistance){bestDistance=d;bestTick=tick;}
  }
  return {miss:bestDistance,tick:bestTick};
}
/**
 * Bounded deterministic feasibility search. For every future collision time
 * it computes the exact ballistic launch velocity, checks speed constraints,
 * then prioritizes trajectories that ALSO approach the attacker.
 *
 * One solver call depends on O(clash candidates × continuation candidates);
 * never call this per render frame. Preview does it on attack release and
 * upon an intercept input, using precomputed candidate timing windows.
 */
export function planInterception(request:InterceptionRequest):InterceptionPlan|null {
  const {incoming,inputTick,launchOrigin,targetAtTick,move}=request;
  if(!validTick(inputTick)||!finiteVec(launchOrigin)||!finiteVec(move.acceleration)||
    !Number.isFinite(move.minSpeed)||move.minSpeed<0||
    !Number.isFinite(move.maxSpeed)||move.maxSpeed<=0||
    move.maxSpeed<move.minSpeed||
    !Number.isSafeInteger(move.releaseDelayTicks)||move.releaseDelayTicks<0||
    !validTick(move.earliestClashTick)||!validTick(move.latestClashTick)||
    move.latestClashTick<move.earliestClashTick) throw new Error("Invalid interception request.");
  const step=move.sampleStepTicks??12;
  const horizon=move.continuationHorizonTicks??900;
  if(!Number.isSafeInteger(step)||step<4||step>200||
    !Number.isSafeInteger(horizon)||horizon<100||horizon>10_000)
    throw new Error("Invalid interception search budget.");
  const releaseTick=inputTick+move.releaseDelayTicks;
  const first=Math.max(move.earliestClashTick,releaseTick+Math.max(24,step));
  if(first>move.latestClashTick)return null;
  let best:InterceptionPlan|null=null,bestScore=Infinity;
  for(let clashTick=first;clashTick<=move.latestClashTick+1e-8;clashTick+=step){
    const incomingPosition=sampleTrajectory(incoming,clashTick).position;
    const flight=aimBallisticAt(releaseTick,launchOrigin,incomingPosition,
      clashTick,move.acceleration);
    const launchSpeed=length(flight.kind==="ballistic"?flight.velocity:vec(0,0,0));
    // Use a safety margin when publishing recommended windows.
    if(launchSpeed<move.minSpeed-1e-8||launchSpeed>move.maxSpeed+1e-8)continue;
    const target=closestTargetApproach(flight,clashTick,
      clashTick+horizon,targetAtTick,Math.max(12,step*2));
    const dualTarget=target.miss<=(move.targetRadiusMeters??.75);
    const score=(dualTarget?0:1000)+target.miss*10+
      Math.abs(launchSpeed-(move.minSpeed+move.maxSpeed)*.5)*.008+
      (clashTick-first)*.00002;
    if(score<bestScore){
      bestScore=score;
      best={inputTick,releaseTick,clashTick,
        clashPoint:incomingPosition,flight,launchSpeed,
        continuationClosestTick:target.tick,
        continuationMissMeters:target.miss,dualTarget};
    }
  }
  return best;
}
export interface InterceptionWindow {
  readonly firstTick:number;
  readonly lastTick:number;
  readonly recommendedTick:number;
  readonly perfectStartTick:number;
  readonly perfectEndTick:number;
  readonly preferredDualTarget:boolean;
}
export interface InterceptionWindowSearch {
  readonly attackStartedTick:number;
  readonly attackImpactTick:number;
  readonly earliestInputTick:number;
  readonly latestInputTick:number;
  readonly inputStepTicks?:number;
  readonly base:Omit<InterceptionRequest,"inputTick">;
}
/**
 * Preview geometry-based legal window. Perfect interval is selected only
 * inside the *feasible* window; a fresh exact solve is still required on input.
 */
export function findInterceptionWindow(search:InterceptionWindowSearch):InterceptionWindow|null {
  const step=search.inputStepTicks??12;
  if(!Number.isSafeInteger(step)||step<4||step>50||
    !validTick(search.attackStartedTick)||!validTick(search.attackImpactTick)||
    !validTick(search.earliestInputTick)||!validTick(search.latestInputTick)||
    search.latestInputTick<search.earliestInputTick)
    throw new Error("Invalid interception window scan.");
  const valid:InterceptionPlan[]=[];
  for(let tick=search.earliestInputTick;tick<=search.latestInputTick;tick+=step){
    const plan=planInterception({...search.base,inputTick:tick});
    if(plan)valid.push(plan);
  }
  if(!valid.length)return null;
  // Prefer a dual-target path if available but never promise target contact
  // after a moving target or a future obstruction changes the scene.
  valid.sort((a,b)=>(Number(b.dualTarget)-Number(a.dualTarget))||
    (a.continuationMissMeters-b.continuationMissMeters));
  const recommended=valid[0]!;
  valid.sort((a,b)=>a.inputTick-b.inputTick);
  const first=valid[0]!.inputTick,last=valid[valid.length-1]!.inputTick;
  // Verify EVERY integer tick in the advertised perfect band. This is the
  // guarantee: perfect cannot be offered where the actual solver fails.
  const radius=Math.max(6,Math.min(24,(last-first)/8));
  let perfectStart=recommended.inputTick;
  let perfectEnd=recommended.inputTick;
  for(let tick=recommended.inputTick-1;tick>=Math.max(first,recommended.inputTick-radius);tick--){
    if(!planInterception({...search.base,inputTick:tick}))break;
    perfectStart=tick;
  }
  for(let tick=recommended.inputTick+1;tick<=Math.min(last,recommended.inputTick+radius);tick++){
    if(!planInterception({...search.base,inputTick:tick}))break;
    perfectEnd=tick;
  }
  return {firstTick:first,lastTick:last,recommendedTick:recommended.inputTick,
    perfectStartTick:perfectStart,
    perfectEndTick:perfectEnd,
    preferredDualTarget:recommended.dualTarget};
}
