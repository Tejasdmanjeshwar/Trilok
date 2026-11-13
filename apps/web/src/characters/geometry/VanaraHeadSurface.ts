import * as THREE from "three";
import type { MammalianHeadMorphologyV1 } from "@trilok/character-core";

/**
 * C3.5 original, explicitly sectioned Vanara surface. The face is tessellated
 * separately from the back of the braincase: dense frontal columns pass through
 * the orbital, zygomatic, maxillary, nasal and oral regions. Nothing here samples
 * or remeshes the owner-supplied non-derivative Hanuman STL.
 *
 * All dimensions derive from the C2 human head metric envelope. The authored
 * spatial constraints below are *design* choices, NOT measurements from the STL.
 */
export interface VanaraNeckSample {
  readonly point: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly color: THREE.Color;
  readonly ids: readonly number[];
  readonly weights: readonly number[];
}
export interface VanaraSurfaceSpec {
  readonly seam: readonly VanaraNeckSample[]; // CC0 source-order, increasing azimuth
  readonly centerX: number;
  readonly neckY: number;
  readonly centerZ: number;
  readonly crownY: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly headBone: number;
  readonly jawBone: number;
  readonly shape: MammalianHeadMorphologyV1;
  readonly maxTriangles: number;
}
export interface VanaraFacePositions {
  readonly muzzle: THREE.Vector3;
  readonly nose: THREE.Vector3;
  readonly nostrilLeft: THREE.Vector3;
  readonly nostrilRight: THREE.Vector3;
  readonly mouth: THREE.Vector3;
  readonly earLeft: THREE.Vector3;
  readonly earRight: THREE.Vector3;
}
export interface VanaraSurfaceResult {
  readonly geometry: THREE.BufferGeometry;
  readonly landmarks: VanaraFacePositions;
  readonly faceTriangles: number;
  readonly ringCount: number;
}
const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const fur=new THREE.Color(0x66534c);
const skin=new THREE.Color(0x9b7064);
const muzzleTone=new THREE.Color(0x8b6559);
const deep=new THREE.Color(0x31211d);

/**
 * Authored *frontal depth* cross sections at semantic facial levels.
 * columns: midline, nasal side, eye, cheek, outer lateral face (metres).
 * Unlike a displaced human nose or an all-around ring sculpt, front vertices
 * are explicitly concentrated at the mouth / maxilla / orbit / brow levels.
 */
const depthStations: readonly (readonly [number,number,number,number,number,number])[] = [
  [.00, .000,.000,.000,.000,.000],
  [.18, .002,.003,.001,.001,.000],
  [.26, .012,.010,.005,.003,.000],
  [.32, .025,.023,.011,.006,.000], // separate mental/chin crest
  [.355,.034,.029,.012,.007,.000], // lower vermilion
  [.385,.020,.025,.012,.009,.000], // oral commissure crease
  [.42, .037,.039,.019,.015,.000], // upper vermilion / oral pad
  [.48, .048,.042,.026,.016,.000], // nasal pad and maxilla
  [.54, .037,.034,.025,.017,.000], // nasal bridge and cheek
  [.61, .018,.013,-.006,.022,.000], // infraorbital / zygomatic
  [.675,.015,.000,-.019,.018,.000], // orbit: inset, not eye-shaped protrusion
  [.735,.020,.017,.024,.016,.000], // supraorbital ridge
  [.81, .013,.013,.012,.008,.000],
  [.92, .001,.003,.004,.002,.000],
  [1.0, .000,.000,.000,.000,.000],
];
const lateralStops=[0,.20,.39,.68,1] as const;
function lateralDepth(x:number,values:readonly number[]):number {
  const a=Math.abs(x);
  let j=0;
  while(j+1<lateralStops.length-1&&a>lateralStops[j+1]!)j++;
  const blend=smooth((a-lateralStops[j]!)/(lateralStops[j+1]!-lateralStops[j]!));
  return mix(values[j]!,values[j+1]!,blend);
}
function sculpt(x:number,t:number,shape:MammalianHeadMorphologyV1):number {
  let j=0;
  while(j+1<depthStations.length-1&&t>depthStations[j+1]![0])j++;
  const before=depthStations[j]!,after=depthStations[j+1]!;
  const a=lateralDepth(x,before.slice(1));
  const b=lateralDepth(x,after.slice(1));
  const w=smooth((t-before[0])/(after[0]-before[0]));
  const base=mix(a,b,w);
  const muzzleChange=mix(1,shape.muzzleLength,1-clamp((t-.58)/.15));
  const cheekChange=mix(1,shape.muzzleWidth,clamp((Math.abs(x)-.28)/.45));
  return base*muzzleChange*cheekChange;
}
function widthProfile(t:number):number {
  const keys: readonly (readonly [number,number])[]=[
    [0,.55],[.08,.65],[.22,.76],[.38,.86],[.57,.98],
    [.72,1.0],[.82,.96],[.91,.79],[.975,.35],[1,0]
  ];
  let j=0;
  while(j+1<keys.length-1&&t>keys[j+1]![0])j++;
  const a=keys[j]!,b=keys[j+1]!;
  return mix(a[1],b[1],smooth((t-a[0])/(b[0]-a[0])));
}
function markColor(x:number,t:number):THREE.Color {
  const facial=smooth((t-.28)/.23)*(1-smooth((t-.79)/.16))*
    (1-smooth((Math.abs(x)-.60)/.32));
  const c=fur.clone().lerp(skin,facial);
  const oral=Math.abs(t-.385)<.014 && Math.abs(x)<.45;
  if(oral)c.lerp(deep,.63);
  const pad=smooth((t-.38)/.05)*(1-smooth((t-.54)/.08))*
    (1-smooth((Math.abs(x)-.30)/.33));
  return c.lerp(muzzleTone,pad*.38);
}
function degrees(p:THREE.Vector3,cx:number,cz:number):number {
  const a=Math.atan2(p.z-cz,p.x-cx);
  return a<0?a+2*Math.PI:a;
}
export function buildVanaraSurface(spec:VanaraSurfaceSpec):VanaraSurfaceResult {
  const {seam,centerX:cx,centerZ:cz,shape,headBone,jawBone}=spec;
  const height=spec.crownY-spec.neckY;
  if(seam.length<24||seam.length>160||!(height>.20&&height<.38)||
    !(spec.halfWidth>.055&&spec.halfWidth<.125)||
    !(spec.halfDepth>.05&&spec.halfDepth<.155)||
    !Number.isInteger(headBone)||!Number.isInteger(jawBone)||
    !(spec.maxTriangles>0))
    throw new Error("C3.5 invalid humanoid head envelope or seam");
  if(seam.some(s=>s.ids.length!==4||s.weights.length!==4||
    !s.point.toArray().every(Number.isFinite)||
    !s.normal.toArray().every(Number.isFinite)||
    Math.abs(s.weights.reduce((a,b)=>a+b,0)-1)>1e-4))
    throw new Error("C3.5 invalid C2 seam vertex/weight");
  const positions:number[]=[],uvs:number[]=[],colors:number[]=[];
  const indices:number[]=[],weights:number[]=[],faces:number[]=[];
  const add=(p:THREE.Vector3,u:number,v:number,c:THREE.Color,
    jawWeight=0,src?:VanaraNeckSample):number=>{
    if(!p.toArray().every(Number.isFinite)||
      ![u,v,jawWeight].every(Number.isFinite))throw new Error("C3.5 nonfinite vertex");
    const id=positions.length/3;
    positions.push(p.x,p.y,p.z);uvs.push(u,v);
    colors.push(c.r,c.g,c.b);
    if(src&&v===0){
      for(let k=0;k<4;k++){indices.push(src.ids[k]!);weights.push(src.weights[k]!);}
    } else {
      const blend=smooth(v/.15);
      const influence=new Map<number,number>();
      if(blend<1){
        const angle=degrees(p,cx,cz);
        const reference=src??seam.reduce((best,candidate)=>{
          const distance=(item:VanaraNeckSample)=>{
            const delta=Math.abs(degrees(item.point,cx,cz)-angle);
            return Math.min(delta,Math.PI*2-delta);
          };
          return distance(candidate)<distance(best)?candidate:best;
        },seam[0]!);
        for(let k=0;k<4;k++)
          influence.set(reference.ids[k]!,
            (influence.get(reference.ids[k]!)??0)+reference.weights[k]!*(1-blend));
      }
      influence.set(headBone,(influence.get(headBone)??0)+blend*(1-jawWeight));
      influence.set(jawBone,(influence.get(jawBone)??0)+blend*jawWeight);
      const sorted=[...influence].filter(([,w])=>w>0)
        .sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4);
      const sum=sorted.reduce((s,[,w])=>s+w,0);
      if(!(sum>0))throw new Error("C3.5 zero-weight vertex");
      for(let k=0;k<4;k++){
        indices.push(sorted[k]?.[0]??0);
        weights.push((sorted[k]?.[1]??0)/sum);
      }
    }
    return id;
  };
  const bridge=(a:readonly number[],b:readonly number[])=>{
    let i=0,j=0;
    while(i<a.length||j<b.length){
      if(i<a.length&&(j===b.length||(i+1)/a.length<=(j+1)/b.length)){
        faces.push(a[i%a.length]!,b[j%b.length]!,a[(i+1)%a.length]!);
        i++;
      }else{
        faces.push(a[i%a.length]!,b[j%b.length]!,b[(j+1)%b.length]!);
        j++;
      }
    }
  };
  // C2 boundary must retain its exact positions and four original skin weights.
  const sortedSeam=[...seam].sort((a,b)=>
    degrees(a.point,cx,cz)-degrees(b.point,cx,cz));
  let previous=sortedSeam.map((s,i)=>add(s.point,i/sortedSeam.length,0,s.color,0,s));
  const frontColumns=29,backColumns=24;
  const pointsPerRing=frontColumns+backColumns-1;
  const reservedFeatures=550;
  const maxRows=Math.floor((spec.maxTriangles-reservedFeatures-sortedSeam.length)/
    (2*pointsPerRing));
  const rows=Math.min(25,maxRows);
  if(rows<12)throw new Error("C3.5 human head triangle budget too small for anatomical topology");
  const front=(x:number,t:number):THREE.Vector3=>{
    const rx=spec.halfWidth*widthProfile(t);
    const z=cz+spec.halfDepth*Math.sqrt(Math.max(.02,1-x*x))*
      (.87+.13*smooth((t-.22)/.30))+
      sculpt(x,t,shape);
    return new THREE.Vector3(cx+rx*x,spec.neckY+height*t,z);
  };
  for(let row=1;row<=rows;row++){
    // sample anatomical rows (nonuniform at the eye, nose and mouth) by a
    // monotone warp, allocating more geometry to articulating lower face.
    const q=row/(rows+1);
    const t=mix(q,smooth(q),.18)*.985;
    const ring:number[]=[];
    for(let k=0;k<frontColumns;k++){
      const x=1-2*k/(frontColumns-1);
      const p=front(x,t);
      const jaw=smooth((.55-t)/.28)*(1-smooth((Math.abs(x)-.55)/.34));
      ring.push(add(p,(1-x)/2,t,markColor(x,t),jaw));
    }
    const rx=spec.halfWidth*widthProfile(t);
    for(let k=1;k<backColumns;k++){
      const angle=Math.PI+k*Math.PI/backColumns;
      const p=new THREE.Vector3(cx+rx*Math.cos(angle),
        spec.neckY+height*t,
        cz+spec.halfDepth*Math.sin(angle)*widthProfile(t)*.95);
      ring.push(add(p,.5+angle/(2*Math.PI),t,fur,0));
    }
    // Rings are in 0..2pi order and front vertices explicitly follow
    // facial bands. This is NOT the rejected homogeneous cranium-ring mesh.
    bridge(previous,ring);
    previous=ring;
  }
  const top=add(new THREE.Vector3(cx,spec.crownY,cz-.004),.5,1,fur);
  for(let k=0;k<previous.length;k++)
    faces.push(previous[k]!,top,previous[(k+1)%previous.length]!);

  // Feature loops: skinned ocular surfaces, ear bowl, and paired nasal rims.
  // These do not transfer vertex positions or tessellation from any STL.
  const addOval=(center:THREE.Vector3,rx:number,ry:number,rz:number,
    c:THREE.Color,inner:THREE.Color,jawWeight=0)=>{
    const outer:number[]=[],middle:number[]=[],inside:number[];const n=14;
    for(let k=0;k<n;k++){
      const angle=k*2*Math.PI/n,dx=Math.cos(angle),dy=Math.sin(angle);
      outer.push(add(new THREE.Vector3(center.x+rx*dx,center.y+ry*dy,center.z),
        k/n,.5,c,jawWeight));
      middle.push(add(new THREE.Vector3(center.x+rx*.75*dx,center.y+ry*.75*dy,
        center.z+rz*.36),k/n,.6,c.clone().lerp(inner,.5),jawWeight));
      inside.push(add(new THREE.Vector3(center.x+rx*.42*dx,center.y+ry*.42*dy,
        center.z-rz),k/n,.7,inner,jawWeight));
    }
    const centerId=add(new THREE.Vector3(center.x,center.y,center.z-rz*1.1),
      .5,.5,inner,jawWeight);
    for(let k=0;k<n;k++){
      const next=(k+1)%n;
      faces.push(outer[k]!,middle[k]!,outer[next]!,
        outer[next]!,middle[k]!,middle[next]!,
        middle[k]!,inside[k]!,middle[next]!,
        middle[next]!,inside[k]!,inside[next]!,
        inside[k]!,centerId,inside[next]!);
    }
  };
  const eyes:[THREE.Vector3,THREE.Vector3]=[
    front(-.39,.675),front(.39,.675)
  ];
  for(const p of eyes){
    // Use an inset orbital loop rather than protruding spheres or bony skull holes.
    addOval(new THREE.Vector3(p.x,p.y,p.z+.002),
      .014*shape.orbitalSpacing,.010,.005,
      new THREE.Color(0x5f483f),new THREE.Color(0x302621));
    // iris set inside the upper lid ring, owned by the C1 head joint
    addOval(new THREE.Vector3(p.x,p.y,p.z+.003),.007,.007,.001,
      new THREE.Color(0x705c42),new THREE.Color(0x1f1b19));
  }
  const nose=front(0,.49);
  const nares:[THREE.Vector3,THREE.Vector3]=[
    front(-.18,.465),front(.18,.465)
  ];
  for(const p of nares){
    addOval(new THREE.Vector3(p.x,p.y,p.z+.001),
      .0052,.0031,.003,muzzleTone,deep);
  }
  const ears:[THREE.Vector3,THREE.Vector3]=[
    new THREE.Vector3(cx-spec.halfWidth*1.08,spec.neckY+height*.66,cz-.007),
    new THREE.Vector3(cx+spec.halfWidth*1.08,spec.neckY+height*.66,cz-.007)
  ];
  for(let s=0;s<2;s++){
    const p=ears[s]!,sign=s===0?-1:1;
    // Auricular contours are in the YZ plane; outer helix, concha and inset bowl.
    const n=18,outer:number[]=[],inner:number[]=[];
    for(let k=0;k<n;k++){
      const a=k*2*Math.PI/n;
      const oval=(scale:number,xOffset:number)=>new THREE.Vector3(
        p.x+sign*xOffset,
        p.y+.025*shape.earSize*scale*Math.cos(a),
        p.z+.016*shape.earSize*scale*Math.sin(a)
      );
      outer.push(add(oval(1,.011),k/n,.4,fur));
      inner.push(add(oval(.55,.014),k/n,.6,skin));
    }
    const bowl=add(new THREE.Vector3(p.x+sign*.006,p.y,p.z),.5,.5,deep);
    for(let k=0;k<n;k++){const j=(k+1)%n;
      faces.push(outer[k]!,outer[j]!,inner[k]!,outer[j]!,inner[j]!,inner[k]!,
        inner[k]!,inner[j]!,bowl);
    }
  }
  if(faces.length/3>spec.maxTriangles)
    throw new Error("C3.5 rebuilt head exceeds 130% measured human-head triangle budget");
  const geometry=new THREE.BufferGeometry();
  geometry.setIndex(faces);
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(indices,4));
  geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(weights,4));
  geometry.computeVertexNormals();
  // Preserve C2 neck normals at the exact shared seam.
  const normal=geometry.getAttribute("normal");
  for(let i=0;i<sortedSeam.length;i++){
    const n=sortedSeam[i]!.normal;
    normal.setXYZ(i,n.x,n.y,n.z);
  }
  normal.needsUpdate=true;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mouth=front(0,.38);
  return Object.freeze({
    geometry,
    landmarks:Object.freeze({
      muzzle:front(0,.43),nose,
      nostrilLeft:nares[0],nostrilRight:nares[1],
      mouth,earLeft:ears[0],earRight:ears[1]
    }),
    faceTriangles:faces.length/3,ringCount:rows,
  });
}
