import * as THREE from "three";
import type { AnatomicalHuman } from "./AnatomicalTemplate";
import { recomputeSourceNormals } from "./HumanLocalDeformation";

/** 
 * Experimental, local-only C3.5 fitting aid. It never installs an extra head,
 * cuts C2 triangles, changes UVs or rebuilds C1 skeletons. It rasterizes the
 * FRONT-facing depth of an independently supplied reference into a signed
 * relief field, then moves existing face vertices in their original mesh.
 *
 * Inputs may have separate redistribution limits: no reference-derived
 * geometry/displacement data is serialized or uploaded by this module.
 */
export interface ReferenceFaceWindow {
  readonly xMin: number; readonly xMax: number;
  readonly yMin: number; readonly yMax: number;
}
export interface FaceTransferOptions {
  readonly sourceWindow?: ReferenceFaceWindow;
  readonly strength?: number;
  readonly width?: number;
  readonly height?: number;
}
export interface FaceTransferMetrics {
  readonly modifiedVertices: number;
  readonly maximumDisplacementMeters: number;
  readonly surfaceSamples: number;
  readonly neckPreservedVertices: number;
  readonly sourceFaces: number;
}
const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
function percentile(samples:number[],fraction:number):number {
  if(!samples.length)throw new Error("Reference has no usable forward surface");
  samples.sort((a,b)=>a-b);
  return samples[Math.floor((samples.length-1)*fraction)]!;
}
function validateWindow(w:ReferenceFaceWindow):void {
  if(![w.xMin,w.xMax,w.yMin,w.yMax].every(Number.isFinite)||
    w.xMax-w.xMin<=1e-5||w.yMax-w.yMin<=1e-5)
    throw new Error("Invalid reference facial calibration window");
}
interface DepthField {
  readonly depth:Float32Array;
  readonly width:number;
  readonly height:number;
  readonly median:number;
  readonly populated:number;
  readonly sampledFaces:number;
}
/** Rasterizes source triangles as a forward (+Z) elevation map, without
 * embedding source triangles in the generated runtime model. */
function rasterizeReference(
  reference:THREE.BufferGeometry,w:ReferenceFaceWindow,width:number,height:number,
):DepthField {
  const attr=reference.getAttribute("position");
  const index=reference.getIndex();
  if(!attr||attr.itemSize!==3||attr.count<3||attr.count>1_000_000)
    throw new Error("Reference STL has invalid or excessive vertices");
  const count=index?index.count:attr.count;
  if(count%3||count/3>350_000)throw new Error("Invalid reference face count");
  const depth=new Float32Array(width*height).fill(-Infinity);
  let sampledFaces=0;
  const dx=w.xMax-w.xMin,dy=w.yMax-w.yMin;
  const point=(id:number):readonly [number,number,number]=>[
    (attr.getX(id)-w.xMin)/dx*(width-1),
    (attr.getY(id)-w.yMin)/dy*(height-1),
    attr.getZ(id)
  ];
  for(let i=0;i<count;i+=3){
    const a=point(index?index.getX(i):i);
    const b=point(index?index.getX(i+1):i+1);
    const c=point(index?index.getX(i+2):i+2);
    if(![...a,...b,...c].every(Number.isFinite))
      throw new Error("Nonfinite reference surface");
    // Drop huge triangles crossing the cropped facial patch.
    const minX=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0])));
    const maxX=Math.min(width-1,Math.floor(Math.max(a[0],b[0],c[0])));
    const minY=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1])));
    const maxY=Math.min(height-1,Math.floor(Math.max(a[1],b[1],c[1])));
    if(minX>maxX||minY>maxY)continue;
    const denom=(b[1]-c[1])*(a[0]-c[0])+
      (c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(denom)<1e-9)continue;
    sampledFaces++;
    for(let y=minY;y<=maxY;y++){
      for(let x=minX;x<=maxX;x++){
        const wa=((b[1]-c[1])*(x-c[0])+
          (c[0]-b[0])*(y-c[1]))/denom;
        const wb=((c[1]-a[1])*(x-c[0])+
          (a[0]-c[0])*(y-c[1]))/denom;
        const wc=1-wa-wb;
        if(wa < -1e-5||wb < -1e-5||wc < -1e-5)continue;
        const z=wa*a[2]+wb*b[2]+wc*c[2];
        const at=y*width+x;
        depth[at]=Math.max(depth[at]!,z);
      }
    }
  }
  const values=Array.from(depth).filter(Number.isFinite);
  if(values.length<width*height*.15)
    throw new Error("Insufficient reference facial coverage");
  return {depth,width,height,median:percentile(values,.50),
    populated:values.length,sampledFaces};
}
function readDepth(field:DepthField,x:number,y:number):number|undefined {
  const xx=clamp(x)*(field.width-1);
  const yy=clamp(y)*(field.height-1);
  const ix=Math.floor(xx),iy=Math.floor(yy);
  // Smooth interpolation where available; holes fail closed (no displacement).
  const x1=Math.min(field.width-1,ix+1),y1=Math.min(field.height-1,iy+1);
  const ids=[iy*field.width+ix,iy*field.width+x1,
    y1*field.width+ix,y1*field.width+x1];
  if(ids.some(id=>!Number.isFinite(field.depth[id])))return undefined;
  const a=xx-ix,b=yy-iy;
  return field.depth[ids[0]!]!*(1-a)*(1-b)+
    field.depth[ids[1]!]!*a*(1-b)+
    field.depth[ids[2]!]!*(1-a)*b+
    field.depth[ids[3]!]!*a*b;
}
/** Face-only geometry pass applied to a neutral owned C2 human instance after
 * the ordinary recipe rebuild. All bone transforms and skin references stay
 * unchanged. This is not an automatic licensed asset converter. */
export function applyLocalVanaraReferenceMorph(
  human:AnatomicalHuman,reference:THREE.BufferGeometry,
  options:FaceTransferOptions={},
):FaceTransferMetrics {
  const source=reference.getAttribute("position");
  if(!source||source.itemSize!==3)throw new Error("Missing STL vertex positions");
  reference.computeBoundingBox();
  const bounds=reference.boundingBox!;
  const bx=bounds.min,tx=bounds.max;
  // Source sculpt's crest/hair are *not* appropriate face calibration bounds.
  // The cropped window can be adjusted using the local head.stl measurements.
  const w=options.sourceWindow??{
    xMin:bx.x+(tx.x-bx.x)*.16,
    xMax:bx.x+(tx.x-bx.x)*.84,
    yMin:bx.y+(tx.y-bx.y)*.17,
    yMax:bx.y+(tx.y-bx.y)*.74,
  };
  validateWindow(w);
  const width=options.width??128,height=options.height??144;
  if(!Number.isInteger(width)||!Number.isInteger(height)||
    width<32||width>256||height<32||height>256)
    throw new Error("Unsafe reference raster resolution");
  const strength=options.strength??.85;
  if(!Number.isFinite(strength)||strength<0||strength>1)
    throw new Error("Invalid reference morph strength");
  const field=rasterizeReference(reference,w,width,height);
  const {mesh,spike}=human;
  const pos=mesh.geometry.getAttribute("position");
  const skin=mesh.geometry.getAttribute("skinIndex");
  const weights=mesh.geometry.getAttribute("skinWeight");
  if(!pos||!skin||!weights)throw new Error("Missing C2 body skin");
  const root=spike.character.root;
  root.updateMatrixWorld(true);
  const rootInverse=root.matrixWorld.clone().invert();
  const role=(name:string)=>spike.graph.joints.findIndex(j=>j.role===name);
  const head=role("head"),jaw=role("jaw"),neck=role("neck");
  if(head<0||jaw<0||neck<0)
    throw new Error("Missing humanoid C1 neck/head/jaw rig");
  const neckRest=spike.skeleton.bones[neck]!
    .getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
  const crown=human.template.sourceHeight*
    human.template.conversionMetersPerSourceUnit;
  const heightMeters=crown-neckRest.y;
  if(!(heightMeters>.18&&heightMeters<.45))
    throw new Error("Cannot calibrate C2 head extent");
  // C2's existing vertex positions, not reference hair, set the local scales.
  const headSamples:number[]=[];
  for(let i=0;i<pos.count;i++){
    if(pos.getY(i)>neckRest.y+heightMeters*.22 &&
      pos.getY(i)<crown-.020 &&
      Math.abs(pos.getX(i)-neckRest.x)<.20)
      headSamples.push(Math.abs(pos.getX(i)-neckRest.x));
  }
  if(headSamples.length<100)throw new Error("Not enough C2 head vertices");
  const halfWidth=percentile(headSamples,.97);
  if(!(halfWidth>.06&&halfWidth<.16))
    throw new Error("C2 head width outside humanoid envelope");
  // Conserve the first 16% of the head/neck completely; fade the uppermost
  // hairline to zero too. Apply only to forward, head/jaw-owned skin.
  let modified=0,maxShift=0,neckPreserved=0;
  const changes:Array<[number,number]>=[];
  const referenceSpan=Math.max(1e-5,Math.max(
    Math.abs(bounds.max.z-field.median),Math.abs(field.median-bounds.min.z)));
  for(let i=0;i<pos.count;i++){
    const y=pos.getY(i);
    const t=(y-neckRest.y)/heightMeters;
    if(t<=.16){neckPreserved++;continue;}
    if(t>=.90)continue;
    const lateral=(pos.getX(i)-neckRest.x)/halfWidth;
    if(Math.abs(lateral)>.88)continue;
    let owner=0;
    for(let k=0;k<4;k++)
      if([head,jaw].includes(skin.getComponent(i,k)))
        owner+=weights.getComponent(i,k);
    if(owner<.18)continue;
    const depth=readDepth(field,(lateral/.88+1)*.5,
      (t-.16)/.74);
    if(depth===undefined)continue;
    const side=smooth((.88-Math.abs(lateral))/.28);
    const fade=smooth((t-.16)/.19)*(1-smooth((t-.77)/.13));
    const mask=fade*side*smooth((owner-.18)/.35);
    if(mask<=0)continue;
    // Relative sculpted surface relief; the original human cranium remains
    // in place and is never replaced or translated as a separate object.
    const signed=clamp((depth-field.median)/referenceSpan,-1,1);
    const displacement=THREE.MathUtils.clamp(signed*.033,-.027,.033)*
      mask*strength;
    if(Math.abs(displacement)<1e-7)continue;
    changes.push([i,pos.getZ(i)+displacement]);
    maxShift=Math.max(maxShift,Math.abs(displacement));modified++;
  }
  if(modified<25)throw new Error("Reference did not cover the C2 face region");
  for(const [i,z] of changes)pos.setZ(i,z);
  pos.needsUpdate=true;
  recomputeSourceNormals(human);
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
  return Object.freeze({modifiedVertices:modified,
    maximumDisplacementMeters:maxShift,
    surfaceSamples:field.populated,neckPreservedVertices:neckPreserved,
    sourceFaces:field.sampledFaces});
}
