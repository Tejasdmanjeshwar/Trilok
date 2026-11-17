/** Synchronous opt-in C5.5 solver instrumentation for controlled benchmarks.
 * Counts are scoped to a single benchmark action; normal Studio execution
 * never retains samples, references to characters or posed skin.
 */
export type StudioSolverCounter=
  "ikFits"|"ikIterations"|"ikObjectives"|"torsoBuilds"|
  "torsoSourceVertices"|"torsoTriangles"|"collisionClearanceChecks"|
  "collisionWeaponChecks"|"stringSkinVertices"|"cylinderSkinVertices"|
  "fingerPadSkinVertices";
export type StudioSolverCounters=Readonly<Record<StudioSolverCounter,number>>;
const names:readonly StudioSolverCounter[]=[
  "ikFits","ikIterations","ikObjectives","torsoBuilds",
  "torsoSourceVertices","torsoTriangles","collisionClearanceChecks",
  "collisionWeaponChecks","stringSkinVertices","cylinderSkinVertices",
  "fingerPadSkinVertices",
];
let active:Record<StudioSolverCounter,number>|undefined;
/** No concurrent/async capture: a synchronous global scope is deliberate
 * because all benchmark actions and authoritative IK are synchronous.
 * Nested capture is disallowed so reported counters cannot be misattributed.
 */
export function captureStudioSolverCounters<T>(action:()=>T):
  Readonly<{result:T;counters:StudioSolverCounters}>{
  if(active)throw new Error("Nested Studio solver diagnostics");
  const counters=Object.fromEntries(names.map(name=>[name,0])) as
    Record<StudioSolverCounter,number>;
  active=counters;
  try{return {result:action(),counters:Object.freeze({...counters})};}
  finally{active=undefined;}
}
export function countStudioSolverWork(name:StudioSolverCounter,
  amount=1):void{
  if(active)active[name]+=amount;
}
