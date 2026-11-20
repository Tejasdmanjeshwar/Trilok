import * as THREE from "three";

/** Source-weight compression on an immutable, calibrated pose envelope.
 *
 * Only reassigns discarded mass to an existing source owner. It never invents
 * bones, UV vertices, or negative influences, and always compares the result
 * against the ordinary largest-four baseline. Bone matrices are supplied by
 * the actual calibrated C1 FK, not guessed from source bone names.
 *
 * The finite sampled envelope does NOT establish skin-volume quality; it is a
 * deterministic approximation of the unpruned linear-blend skinning reference.
 */
export function compactMotionCompatibleInfluences(
  original:ReadonlyMap<number,number>, restPosition:THREE.Vector3,
  samples:readonly (readonly THREE.Matrix4[])[],
):ReadonlyMap<number,number> {
  if(original.size<=4||samples.length===0)return new Map(original);
  const entries=[...original].sort((a,b)=>a[0]-b[0]);
  const total=entries.reduce((sum,[,weight])=>sum+weight,0);
  if(!Number.isFinite(total)||total<=0||
     entries.some(([index,weight])=>index<0||!Number.isSafeInteger(index)||
       !Number.isFinite(weight)||weight<=0))
    throw new Error("Invalid source influences for motion compaction");
  const mapped=new Map<number,THREE.Vector3[]>();
  for(const [index] of entries){
    mapped.set(index,samples.map(sample=>{
      const matrix=sample[index];
      if(!matrix||!matrix.elements.every(Number.isFinite))
        throw new Error("Incomplete C2 motion sample matrix "+index);
      return restPosition.clone().applyMatrix4(matrix);
    }));
  }
  const desired=samples.map((_,k)=>{
    const p=new THREE.Vector3();
    for(const [index,weight] of entries)
      p.addScaledVector(mapped.get(index)![k]!,weight/total);
    return p;
  });
  function loss(weights:ReadonlyMap<number,number>):number {
    const sum=[...weights.values()].reduce((a,b)=>a+b,0);
    if(sum<=0)throw new Error("Empty compressed influences");
    let error=0;
    for(let k=0;k<samples.length;k++){
      const candidate=new THREE.Vector3();
      for(const [index,weight] of weights)
        candidate.addScaledVector(mapped.get(index)![k]!,weight/sum);
      error+=candidate.distanceToSquared(desired[k]!);
    }
    return error;
  }
  const largest=new Map([...entries]
    .sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4));
  let current=new Map(entries);
  // Greedy source-mass reassignment avoids a non-deterministic numerical
  // optimizer and allows the actual unpruned oracle to veto bad choices.
  while(current.size>4){
    let best:Map<number,number>|undefined;
    let bestLoss=Infinity;
    let bestRemoved=Infinity,bestRetained=Infinity;
    for(const [removed,weight] of [...current].sort((a,b)=>a[0]-b[0])){
      for(const [retained] of [...current].sort((a,b)=>a[0]-b[0])){
        if(retained===removed)continue;
        const candidate=new Map(current);
        candidate.delete(removed);
        candidate.set(retained,candidate.get(retained)!+weight);
        const error=loss(candidate);
        if(error<bestLoss-1e-15 ||
          (Math.abs(error-bestLoss)<=1e-15 &&
           (removed<bestRemoved ||
            (removed===bestRemoved&&retained<bestRetained)))){
          best=candidate;bestLoss=error;
          bestRemoved=removed;bestRetained=retained;
        }
      }
    }
    if(!best)throw new Error("Unable to compact motion-sensitive skin");
    current=best;
  }
  // Greedy transfers assign an entire removed source owner's mass to ONE
  // survivor. On the pinned clavicle/neck/upperarm surface this can transfer
  // chest mass to a moving clavicle and fold otherwise healthy source faces.
  // Solve a four-owner simplex fit against the SAME independent calibrated
  // pose envelope, using the original unpruned LBS as the reference.
  // The candidate search is bounded (at most six leading source owners plus
  // the previous greedy/largest supports); no per-frame work or new GPU slots.
  const projectSimplex=(input:readonly number[]):number[]=>{
    const sorted=[...input].sort((a,b)=>b-a);
    let sum=0,theta=0;
    for(let i=0;i<sorted.length;i++){
      sum+=sorted[i]!;
      const candidate=(sum-1)/(i+1);
      if(sorted[i]!>candidate)theta=candidate;
    }
    return input.map(value=>Math.max(0,value-theta));
  };
  const greedyLoss=loss(current),largestLoss=loss(largest);
  let best:ReadonlyMap<number,number>=
    greedyLoss+1e-14<largestLoss?current:largest;
  let bestError=Math.min(greedyLoss,largestLoss);
  const supports=new Map<string,number[]>();
  const addSupport=(owners:readonly number[]):void=>{
    if(owners.length!==4)return;
    const unique=[...new Set(owners)].sort((a,b)=>a-b);
    if(unique.length===4)supports.set(unique.join(","),unique);
  };
  addSupport([...current.keys()]);
  addSupport([...largest.keys()]);
  const pool=[...entries].sort((a,b)=>b[1]-a[1]||a[0]-b[0])
    .slice(0,6).map(([index])=>index).sort((a,b)=>a-b);
  for(let a=0;a<pool.length;a++)for(let b=a+1;b<pool.length;b++)
    for(let c=b+1;c<pool.length;c++)for(let d=c+1;d<pool.length;d++)
      addSupport([pool[a]!,pool[b]!,pool[c]!,pool[d]!]);
  for(const owners of [...supports.values()].sort((a,b)=>
    a.join(",").localeCompare(b.join(",")))){
    // Center around the unpruned reference at each calibrated frame.
    // Because simplex weights sum to one, this is exactly equivalent to
    // minimizing the original positional LBS loss, with better conditioning.
    const centered=owners.map(index=>mapped.get(index)!.map((point,k)=>
      point.clone().sub(desired[k]!)));
    const gram=owners.map((_,i)=>owners.map((_,j)=>
      centered[i]!.reduce((sum,point,k)=>
        sum+point.dot(centered[j]![k]!),0)));
    const lip=2*Math.max(...gram.map(row=>
      row.reduce((sum,value)=>sum+Math.abs(value),0)));
    if(!Number.isFinite(lip))throw new Error("Nonfinite C2 shoulder influence fit");
    if(lip<1e-18)continue;
    let x=projectSimplex(owners.map(index=>
      (original.get(index)??0)/total));
    for(let iteration=0;iteration<240;iteration++){
      const next=projectSimplex(x.map((value,i)=>value-
        2*gram[i]!.reduce((sum,g,j)=>sum+g*x[j]!,0)/lip));
      const change=next.reduce((sum,value,i)=>
        sum+Math.abs(value-x[i]!),0);
      x=next;
      if(change<1e-12)break;
    }
    const fitted=new Map(owners.map((index,i)=>[index,x[i]!] as const));
    const error=loss(fitted);
    // Keep old behavior on numerical ties, including exact-motion sentinels.
    if(error+1e-14<bestError){best=fitted;bestError=error;}
  }
  return best;
}
