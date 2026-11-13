// Geometry-independent anthropometric measurement helper retained from the rejected
// PR #48. This is engineering calibration only, NOT the rejected head generator.
import type {AnatomicalHuman} from "./AnatomicalTemplate";

/** Independent CC0 human reference, measured from the original unmodified
 * MakeHuman source positions (not the already-morphed mammalian head). The
 * normalized sections cover upper cheek / temporal / forehead where neither
 * shoulders nor the neck contaminate dimensions. No hard-coded head metres.
 */
export interface HumanHeadReference {
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly centerZ: number;
  readonly upperCrownY: number;
  readonly sampleCount: number;
}
export function measureHumanHeadReference(human:AnatomicalHuman):HumanHeadReference {
  const source=human.template.sourcePositions;
  const ids=human.template.sourceVertexIds;
  const [originX,originY,originZ]=human.template.sourceOrigin;
  const unit=human.template.conversionMetersPerSourceUnit;
  if(!(unit>0&&Number.isFinite(unit)))throw new Error("Missing C2 source unit calibration");
  const upperCrownY=human.template.sourceHeight*unit;
  const xSamples:number[]=[],zSamples:number[]=[];
  const visited=new Set<number>();
  for(const id of ids) {
    if(visited.has(id))continue;visited.add(id);
    const y=(source[id*3+1]!-originY)*unit;
    if(y<upperCrownY-.165||y>upperCrownY-.095)continue;
    const x=(source[id*3]!-originX)*unit;
    const z=(source[id*3+2]!-originZ)*unit;
    if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>.18||Math.abs(z)>.26)
      continue;
    xSamples.push(x);zSamples.push(z);
  }
  if(xSamples.length<160)throw new Error("Unusable CC0 human reference head cross-section");
  const bounds=(arr:number[]):readonly [number,number]=>{
    arr.sort((a,b)=>a-b);
    return [arr[Math.floor((arr.length-1)*.01)]!,
      arr[Math.ceil((arr.length-1)*.99)]!] as const;
  };
  const [minX,maxX]=bounds(xSamples),[minZ,maxZ]=bounds(zSamples);
  const halfWidth=(maxX-minX)*.5;
  const halfDepth=(maxZ-minZ)*.5;
  if(!(halfWidth>.065&&halfWidth<.125&&halfDepth>.055&&halfDepth<.145))
    throw new Error("Out-of-range CC0 human cranial reference");
  return Object.freeze({halfWidth,halfDepth,centerZ:(minZ+maxZ)*.5,
    upperCrownY,sampleCount:xSamples.length});
}

/** Fit a macaque cranium into an adult humanoid head envelope, with expressive
 * soft-tissue muzzle and ears allowed to project beyond the core braincase.
 * Values scale with C3 body breadth, but never with C2 neck width.
 */
export function sizeVanaraCranium(reference:HumanHeadReference,
  stature:number,breadth:number,skullWidth:number,faceDepth:number):{
  readonly halfWidth:number; readonly halfDepth:number;
  readonly centerZ:number; readonly crownHeight:number;
} {
  const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
  const width=reference.halfWidth*breadth*clamp(skullWidth*.98,.90,1.055);
  const depth=reference.halfDepth*breadth*clamp(faceDepth*.91,.83,1.02);
  return Object.freeze({halfWidth:width,halfDepth:depth,
    centerZ:reference.centerZ*breadth,crownHeight:reference.upperCrownY*stature});
}
