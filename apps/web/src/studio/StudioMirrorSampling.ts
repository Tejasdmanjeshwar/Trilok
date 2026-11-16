/** Choose spatially corresponding source-skin probes on reflected hands.
 *
 * MakeHuman source vertices are not ordered as mirror pairs. Subsampling with
 * vertex-index parity or original OBJ order gives different Jacobians on
 * otherwise identical anatomy. Rank bind-space points by a deterministic
 * mirror-normalized spatial hash before taking a bounded uniform subset.
 * This selection is only for numerical probes; final acceptance uses EVERY
 * original source vertex and its independently skinned morphology.
 */
export interface SourcePositionAttribute {
  getX(index:number):number;
  getY(index:number):number;
  getZ(index:number):number;
}
export type MirrorSampleSide="left"|"right";

export function mirrorStableSampleIndices(indices:readonly number[],
  position:SourcePositionAttribute,side:MirrorSampleSide,
  maximum:number):readonly number[]{
  if(maximum===Infinity||indices.length<=maximum)return [...indices];
  if(!Number.isFinite(maximum)||maximum<1)
    throw new Error("Invalid source-skin probe budget");
  const ranked=indices.map(index=>{
    // X is expressed on the +X canonical half of the character's rest
    // geometry. No world-space bone transform or runtime pose is used.
    const x=position.getX(index)*(side==="left"?-1:1);
    const y=position.getY(index),z=position.getZ(index);
    const ix=Math.round(x*100000),iy=Math.round(y*100000),
      iz=Math.round(z*100000);
    const hash=(Math.imul(ix,0x9e3779b1)^
      Math.imul(iy,0x85ebca6b)^Math.imul(iz,0xc2b2ae35))>>>0;
    return {index,x,y,z,hash};
  });
  ranked.sort((a,b)=>a.hash-b.hash||a.x-b.x||a.y-b.y||
    a.z-b.z||a.index-b.index);
  const count=Math.floor(maximum);
  return Array.from({length:count},(_,j)=>
    ranked[Math.floor((j+.5)*ranked.length/count)]!.index);
}
