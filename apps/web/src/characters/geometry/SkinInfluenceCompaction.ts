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
  return loss(current)+1e-14 < loss(largest) ? current : largest;
}
