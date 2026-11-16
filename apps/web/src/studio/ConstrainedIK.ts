/** Deterministic bounded damped least-squares IK core.
 * Joint DOFs and shared rigid-weapon pose parameters are treated uniformly;
 * the caller owns anatomical frames, collision barriers and surface samples.
 * This deliberately does not change a Three.js skeleton outside evaluate().
 */
export interface IKFreedom {
  readonly min:number;
  readonly max:number;
}
export interface IKFit {
  readonly values:readonly number[];
  readonly cost:number;
  readonly iterations:number;
}
function normalStep(jacobian:readonly (readonly number[])[],
  residual:readonly number[],lambda:number):number[]|undefined{
  const n=jacobian[0]?.length??0;
  const system=Array.from({length:n},(_,i)=>{
    const row=Array<number>(n+1).fill(0);
    for(let j=0;j<n;j++){
      for(let k=0;k<residual.length;k++)
        row[j]!+=jacobian[k]![i]!*jacobian[k]![j]!;
    }
    row[i]!+=lambda;
    for(let k=0;k<residual.length;k++)
      row[n]!-=jacobian[k]![i]!*residual[k]!;
    return row;
  });
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let i=col+1;i<n;i++)
      if(Math.abs(system[i]![col]!)>Math.abs(system[pivot]![col]!))pivot=i;
    if(Math.abs(system[pivot]![col]!)<1e-12)return undefined;
    [system[col],system[pivot]]=[system[pivot]!,system[col]!];
    const div=system[col]![col]!;
    for(let k=col;k<=n;k++)system[col]![k]!/=div;
    for(let i=0;i<n;i++){
      if(i===col)continue;
      const t=system[i]![col]!;
      for(let k=col;k<=n;k++)system[i]![k]!-=t*system[col]![k]!;
    }
  }
  const step=system.map(row=>row[n]!);
  return step.every(Number.isFinite)?step:undefined;
}
const squared=(v:readonly number[])=>v.reduce((sum,x)=>sum+x*x,0);
/** Use one numerical objective for all limb chains and a shared weapon.
 * Differentiation samples only legal angles and poses. Every accepted
 * iteration strictly lowers cost; evaluation order and output are stable.
 */
export function fitConstrainedIK(start:readonly number[],
  limits:readonly IKFreedom[],
  evaluate:(values:readonly number[])=>readonly number[],
  maxIterations=52,maxParameterStep=.35):IKFit{
  if(!Number.isFinite(maxParameterStep)||maxParameterStep<=0||
      maxParameterStep>1||start.length!==limits.length||!start.every(Number.isFinite)||
      limits.some((b,i)=>!Number.isFinite(b.min)||!Number.isFinite(b.max)||
        b.min>b.max||start[i]!<b.min-1e-8||start[i]!>b.max+1e-8))
    throw new Error("Invalid constrained IK parameter bounds");
  let parameters=[...start];
  let errors=[...evaluate(parameters)];
  const count=errors.length;
  if(!count||errors.some(x=>!Number.isFinite(x)))
    throw new Error("Nonfinite constrained IK residual");
  let cost=squared(errors),lambda=.002,iterations=0,stalls=0;
  for(let it=0;it<maxIterations;it++){
    iterations++;
    const jacobian=Array.from({length:count},()=>Array<number>(start.length).fill(0));
    for(let j=0;j<start.length;j++){
      const bound=limits[j]!,h=.006;
      const step=parameters[j]!+h<=bound.max?h:-h;
      const moved=Math.max(bound.min,Math.min(bound.max,parameters[j]!+step));
      const delta=moved-parameters[j]!;
      if(Math.abs(delta)<1e-10)continue;
      const trial=[...parameters];trial[j]=moved;
      const sampled=evaluate(trial);
      if(sampled.length!==count||sampled.some(x=>!Number.isFinite(x)))
        throw new Error("Unstable constrained IK residual");
      for(let k=0;k<count;k++)
        jacobian[k]![j]=(sampled[k]!-errors[k]!)/delta;
    }
    const step=normalStep(jacobian,errors,lambda);
    if(!step)break;
    let improved=false;
    for(const factor of [1,.5,.25,.125]){
      const trial=parameters.map((value,j)=>
        Math.max(limits[j]!.min,Math.min(limits[j]!.max,
          value+Math.max(-maxParameterStep,
          Math.min(maxParameterStep,step[j]!*factor)))));
      const sampled=[...evaluate(trial)];
      const nextCost=squared(sampled);
      if(Number.isFinite(nextCost)&&nextCost<cost-1e-12){
        parameters=trial;errors=sampled;cost=nextCost;
        lambda=Math.max(.000001,lambda*.65);improved=true;stalls=0;break;
      }
    }
    if(!improved){
      lambda=Math.min(5,lambda*5);stalls++;
      if(stalls>=7)break;
    }
    if(cost<1e-9)break;
  }
  // evaluate() may mutate a skeleton: ensure the successful parameter vector
  // is the last applied pose, even after finite difference / line searches.
  evaluate(parameters);
  return Object.freeze({values:Object.freeze(parameters),cost,iterations});
}
