import * as THREE from "three";

/**
 * Canonical bow frame (metres, right-handed): grip at origin; +Y is the
 * upper limb; +Z is arrow flight and stave belly; +X is stave width.
 * The YZ plane contains both the centerline and bowstring. Manufacture ONE
 * half-profile for y >= 0, reflect it in y=0, and never perturb x by limb.
 * The grip cylinder remains the source-skin-contact authority.
 */
export type BowProfile = "simple" | "recurve";
export const BOW_PROFILES: Readonly<Record<BowProfile,string>>=Object.freeze({
  simple:"Traditional bow",
  recurve:"Recurve bow",
});

export interface BowStaveOptions {
  readonly profile:BowProfile;
  readonly limbLengthMeters:number;
  readonly handleLengthMeters:number;
  readonly handleRadiusMeters:number;
  readonly stringRestMeters:number;
  readonly limbWidthMeters:number;
  readonly limbThicknessMeters:number;
  readonly tipWidthMeters:number;
  readonly tipThicknessMeters:number;
  readonly camberMeters:number;
  readonly recurveMeters:number;
  readonly taperPower:number;
  readonly segmentsPerHalf:number;
  readonly radialSegments:number;
}
type BowDimensions=Pick<BowStaveOptions,
  "limbLengthMeters"|"handleLengthMeters"|"handleRadiusMeters"|"stringRestMeters">;

export interface BowHalfSample {
  readonly center:THREE.Vector3;
  readonly tangent:THREE.Vector3;
  readonly back:THREE.Vector3;
  readonly widthMeters:number;
  readonly thicknessMeters:number;
  readonly slope:number;
}
export interface BowStaveMesh {
  readonly geometry:THREE.BufferGeometry;
  readonly centerline:readonly THREE.Vector3[];
  readonly upperNock:THREE.Vector3;
  readonly lowerNock:THREE.Vector3;
  readonly ringCount:number;
  readonly ringStride:number;
}

/** Same descriptor-derived endpoints are used by IK, drawing fingers,
 * string, and actual stave mesh: there is no second visual nock offset. */
export function bowNockLocal(d:Pick<BowDimensions,
  "limbLengthMeters"|"stringRestMeters">,side:-1|1):THREE.Vector3{
  return new THREE.Vector3(0,side*d.limbLengthMeters,-d.stringRestMeters);
}

export function defaultBowStaveOptions(d:BowDimensions,
  profile:BowProfile="recurve"):BowStaveOptions{
  const scale=d.limbLengthMeters/.64;
  return Object.freeze({
    profile,limbLengthMeters:d.limbLengthMeters,
    handleLengthMeters:d.handleLengthMeters,
    handleRadiusMeters:d.handleRadiusMeters,
    stringRestMeters:d.stringRestMeters,
    limbWidthMeters:.036*scale,
    limbThicknessMeters:.012*scale,
    tipWidthMeters:.0065*scale,
    tipThicknessMeters:.0045*scale,
    camberMeters:(profile==="simple"?.13:.155)*scale,
    recurveMeters:profile==="recurve"?.065*scale:0,
    taperPower:1.2,segmentsPerHalf:48,radialSegments:12,
  });
}
export function validateBowStaveOptions(o:BowStaveOptions):void{
  if((o.profile!=="simple"&&o.profile!=="recurve")||
    ![o.limbLengthMeters,o.handleLengthMeters,o.handleRadiusMeters,
      o.stringRestMeters,o.limbWidthMeters,o.limbThicknessMeters,
      o.tipWidthMeters,o.tipThicknessMeters,o.camberMeters,
      o.recurveMeters,o.taperPower,o.segmentsPerHalf,o.radialSegments]
      .every(Number.isFinite)||
    o.limbLengthMeters<.2||o.limbLengthMeters>1.1||
    o.handleLengthMeters<.03||o.handleLengthMeters>.25||
    o.handleLengthMeters/2>=o.limbLengthMeters-.08||
    o.handleRadiusMeters<.002||o.handleRadiusMeters>.035||
    o.stringRestMeters<.01||o.stringRestMeters>.3||
    o.limbWidthMeters<.005||o.limbWidthMeters>.12||
    o.limbThicknessMeters<.003||o.limbThicknessMeters>.05||
    o.tipWidthMeters<.002||o.tipWidthMeters>o.limbWidthMeters||
    o.tipThicknessMeters<.002||o.tipThicknessMeters>o.limbThicknessMeters||
    o.camberMeters<0||o.camberMeters>.3||
    o.recurveMeters<0||o.recurveMeters>.2||
    o.taperPower<.4||o.taperPower>3||
    !Number.isInteger(o.segmentsPerHalf)||o.segmentsPerHalf<12||
    o.segmentsPerHalf>256||
    !Number.isInteger(o.radialSegments)||o.radialSegments<6||
    o.radialSegments>32)throw new Error("Invalid symmetric bow stave options");
}
const smooth=(t:number):number=>t*t*(3-2*t);
const mix=(a:number,b:number,t:number):number=>a+(b-a)*t;

/**
 * Analytic half-profile; C2-continuous at the recurve's two joins.
 * The constrained recurve bump reverses tip curvature intentionally, and
 * its fourth-order endpoints prevent any slope/curvature discontinuity.
 * A linear Y coordinate guarantees no centerline self-intersections.
 */
export function bowHalfProfile(o:BowStaveOptions,t:number):{
  z:number;derivative:number
}{
  if(t<0||t>1||!Number.isFinite(t))throw new Error("Invalid bow profile sample");
  const s=Math.sin(Math.PI*t);
  const base=o.camberMeters*s*s-o.stringRestMeters*smooth(t);
  const baseDerivative=o.camberMeters*Math.PI*Math.sin(2*Math.PI*t)-
    o.stringRestMeters*6*t*(1-t);
  if(o.profile==="simple"||o.recurveMeters===0||t<=.65)
    return {z:base,derivative:baseDerivative};
  const phase=(t-.65)/.35;
  const sine=Math.sin(Math.PI*phase),cosine=Math.cos(Math.PI*phase);
  const bump=sine*sine*sine*sine;
  return {
    z:base-o.recurveMeters*bump,
    derivative:baseDerivative-
      o.recurveMeters*4*sine*sine*sine*cosine*Math.PI/.35,
  };
}

/** Evaluate the mirrored rest stave in local space. Y alone chooses the limb;
 * frames are built from +Y along the entire bow and cannot corkscrew. */
export function sampleBowStave(o:BowStaveOptions,signedFraction:number):BowHalfSample{
  if(!Number.isFinite(signedFraction)||Math.abs(signedFraction)>1)
    throw new Error("Invalid signed bow sample");
  const y=Math.abs(signedFraction)*o.limbLengthMeters;
  const halfGrip=o.handleLengthMeters/2;
  const t=y<=halfGrip?0:(y-halfGrip)/(o.limbLengthMeters-halfGrip);
  const profile=bowHalfProfile(o,Math.min(1,t));
  const sign=signedFraction<0?-1:1;
  const slope=y<=halfGrip?0:
    sign*profile.derivative/(o.limbLengthMeters-halfGrip);
  const tangent=new THREE.Vector3(0,1,slope).normalize();
  const back=new THREE.Vector3(0,-slope,1).normalize();
  const flare=smooth(Math.min(1,t/.22));
  const taper=smooth(Math.max(0,(t-.28)/.72))**o.taperPower;
  const width=mix(mix(o.handleRadiusMeters*1.52,
    o.limbWidthMeters,flare),o.tipWidthMeters,taper);
  const thick=mix(mix(o.handleRadiusMeters*1.5,
    o.limbThicknessMeters,flare),o.tipThicknessMeters,taper);
  return {
    center:new THREE.Vector3(0,sign*y,profile.z),
    tangent,back,widthMeters:width,thicknessMeters:thick,slope,
  };
}

/** Closed elliptical-section loft with explicit stable orientation, UVs,
 * outward winding and independently flat-shaded tip end caps. */
export function createBowStaveGeometry(o:BowStaveOptions):BowStaveMesh{
  validateBowStaveOptions(o);
  const segmentCount=o.segmentsPerHalf, sides=o.radialSegments;
  const rings=segmentCount*2+1,stride=sides+1;
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
  const centerline:THREE.Vector3[]=[];
  for(let i=0;i<rings;i++){
    const signed=(i-segmentCount)/segmentCount;
    const s=sampleBowStave(o,signed);
    centerline.push(s.center.clone());
    for(let j=0;j<=sides;j++){
      const a=j/sides*2*Math.PI,c=Math.cos(a),si=Math.sin(a);
      const rx=s.widthMeters/2,rz=s.thicknessMeters/2;
      const point=s.center.clone().addScaledVector(
        new THREE.Vector3(1,0,0),rx*c).addScaledVector(s.back,rz*si);
      positions.push(point.x,point.y,point.z);
      const normal=new THREE.Vector3(c/rx,0,0)
        .addScaledVector(s.back,si/rz).normalize();
      normals.push(normal.x,normal.y,normal.z);
      uvs.push(j/sides,i/(rings-1));
    }
  }
  for(let i=0;i<rings-1;i++)for(let j=0;j<sides;j++){
    const a=i*stride+j,b=a+1,c=a+stride,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  // Separate vertices make flat end caps without contaminating the limb
  // normals; tip widths/thickness remain strictly nonzero.
  for(const [ring,outward] of [[0,-1],[rings-1,1]] as const){
    const sample=sampleBowStave(o,ring===0?-1:1);
    const center=positions.length/3;
    positions.push(...sample.center.toArray());
    normals.push(0,outward,0);uvs.push(.5,.5);
    for(let j=0;j<=sides;j++){
      const a=j/sides*2*Math.PI,c=Math.cos(a),si=Math.sin(a);
      const p=sample.center.clone()
        .add(new THREE.Vector3(c*sample.widthMeters/2,0,0))
        .addScaledVector(sample.back,si*sample.thicknessMeters/2);
      positions.push(...p.toArray());
      normals.push(0,outward,0);
      uvs.push(.5+.5*c,.5+.5*si);
      if(j>0){
        if(outward<0)indices.push(center,center+j,center+j+1);
        else indices.push(center,center+j+1,center+j);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return {
    geometry,centerline:Object.freeze(centerline),
    upperNock:bowNockLocal(o,1),lowerNock:bowNockLocal(o,-1),
    ringCount:rings,ringStride:stride,
  };
}
