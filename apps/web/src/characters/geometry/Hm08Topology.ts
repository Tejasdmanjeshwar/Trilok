import * as THREE from "three";

/** MakeHuman hm08 CC0 mesh: source OBJ has several closed islands (eyes, etc.).
 * C2 deliberately isolates the largest *single watertight body component*.
 * No artist input or external authoring application is used at runtime.
 */
export interface HumanTopologyStats {
  readonly sourceVertices: number;
  readonly sourceQuads: number;
  readonly connectedComponents: number;
  readonly retainedSourceVertices: number;
  readonly retainedQuads: number;
  readonly outputVertices: number;
  readonly triangles: number;
  readonly boundaryEdges: number;
  readonly nonManifoldEdges: number;
  readonly heightMeters: number;
}
export interface HumanTopology {
  readonly geometry: THREE.BufferGeometry;
  readonly stats: HumanTopologyStats;
}
type FaceCorner = readonly [number,number];

function parseIndex(value:string,limit:number):number {
  const n=Number(value);
  if (!Number.isSafeInteger(n) || n===0) throw new Error("Invalid OBJ index: "+value);
  const index=n>0?n-1:limit+n;
  if(index<0 || index>=limit)throw new Error("OBJ index out of range: "+value);
  return index;
}
function requireFinite(values:readonly number[],label:string):void {
  if(values.some(v=>!Number.isFinite(v)))throw new Error("Nonfinite OBJ "+label);
}
export function parseHm08HumanOBJ(text:string):HumanTopology {
  if(text.length>6_000_000 || !text.includes("basemesh hm08"))throw new Error("Unexpected hm08 source");
  const sourcePositions:number[][]=[], sourceUvs:number[][]=[], faces:FaceCorner[][]=[];
  for(const line of text.split(/\r?\n/)) {
    if(line.startsWith("v ")) {
      const nums=line.trim().split(/\s+/).slice(1).map(Number);
      if(nums.length!==3)throw new Error("OBJ vertex dimensionality");
      requireFinite(nums,"position");sourcePositions.push(nums);
    } else if(line.startsWith("vt ")) {
      const nums=line.trim().split(/\s+/).slice(1).map(Number);
      if(nums.length<2)throw new Error("OBJ UV dimensionality");
      requireFinite(nums,"UV");sourceUvs.push(nums);
    } else if(line.startsWith("f ")) {
      const parts=line.trim().split(/\s+/).slice(1);
      if(parts.length!==4)throw new Error("hm08 expected quad topology");
      const corners=parts.map(token=>{
        const pair=token.split("/");
        if(pair.length<2 || !pair[1])throw new Error("Missing OBJ UV");
        return [parseIndex(pair[0]!,sourcePositions.length),
          parseIndex(pair[1],sourceUvs.length)] as const;
      });
      faces.push(corners);
    }
  }
  if(sourcePositions.length<10000 || faces.length<10000)throw new Error("Incomplete hm08 template");
  const parent=sourcePositions.map((_,i)=>i);
  function find(i:number):number {
    while(parent[i]!==i){parent[i]=parent[parent[i]!]!;i=parent[i]!;}
    return i;
  }
  function union(a:number,b:number):void {
    a=find(a);b=find(b);if(a!==b)parent[a]=b;
  }
  for(const face of faces)for(let i=1;i<4;i++)union(face[0]![0],face[i]![0]);
  const counts=new Map<number,number>();
  for(let i=0;i<sourcePositions.length;i++) {
    const root=find(i);counts.set(root,(counts.get(root)??0)+1);
  }
  const biggest=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];
  if(!biggest || biggest[1]<12000)throw new Error("No continuous anatomical body component");
  const selected=faces.filter(face=>find(face[0]![0])===biggest[0]);
  const sourceIds=new Set<number>();
  const edges=new Map<string,number>();
  let minY=Infinity,maxY=-Infinity;
  for(const face of selected)for(let i=0;i<4;i++){
    const v=face[i]![0],next=face[(i+1)%4]![0];
    sourceIds.add(v);
    const y=sourcePositions[v]![1]!;
    minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    const key=Math.min(v,next)+":"+Math.max(v,next);
    edges.set(key,(edges.get(key)??0)+1);
  }
  const boundaries=[...edges.values()].filter(count=>count===1).length;
  const nonManifold=[...edges.values()].filter(count=>count>2).length;
  if(boundaries!==0 || nonManifold!==0)throw new Error("Body mesh not watertight / manifold");
  const height=maxY-minY;
  if(height<=0 || !Number.isFinite(height))throw new Error("Invalid human height");
  // Height normalization occurs in geometry coordinates, not character root scale.
  const scale=1.75/height;
  const cache=new Map<string,number>();
  const position:number[]=[],uv:number[]=[],index:number[]=[],sourceForOutput:number[]=[];
  for(const face of selected) {
    const quad:number[]=[];
    for(const [v,t] of face) {
      const key=v+":"+t;
      let out=cache.get(key);
      if(out===undefined) {
        out=position.length/3;cache.set(key,out);
        const p=sourcePositions[v]!,texture=sourceUvs[t]!;
        position.push(p[0]!*scale,(p[1]!-minY)*scale,p[2]!*scale);
        uv.push(texture[0]!,texture[1]!);
        sourceForOutput.push(v);
      }
      quad.push(out);
    }
    index.push(quad[0]!,quad[1]!,quad[2]!,quad[0]!,quad[2]!,quad[3]!);
  }
  // UV splits must share normals. Accumulate face normals at original vertex IDs,
  // rather than running computeVertexNormals on each UV-split corner.
  const normals=new Float64Array(sourcePositions.length*3);
  for(let i=0;i<index.length;i+=3) {
    const a=index[i]!*3,b=index[i+1]!*3,c=index[i+2]!*3;
    const ab=[position[b]!-position[a]!,position[b+1]!-position[a+1]!,position[b+2]!-position[a+2]!];
    const ac=[position[c]!-position[a]!,position[c+1]!-position[a+1]!,position[c+2]!-position[a+2]!];
    const nx=ab[1]!*ac[2]!-ab[2]!*ac[1]!;
    const ny=ab[2]!*ac[0]!-ab[0]!*ac[2]!;
    const nz=ab[0]!*ac[1]!-ab[1]!*ac[0]!;
    if(nx*nx+ny*ny+nz*nz<1e-18)throw new Error("Degenerate hm08 source triangle");
    for(const id of [sourceForOutput[index[i]!]!,sourceForOutput[index[i+1]!]!,
      sourceForOutput[index[i+2]!]!]){
      normals[id*3]=(normals[id*3]??0)+nx;
      normals[id*3+1]=(normals[id*3+1]??0)+ny;
      normals[id*3+2]=(normals[id*3+2]??0)+nz;
    }
  }
  const smooth=new Float32Array(sourceForOutput.length*3);
  for(let i=0;i<sourceForOutput.length;i++) {
    const id=sourceForOutput[i]!,x=normals[id*3]!,y=normals[id*3+1]!,z=normals[id*3+2]!;
    const d=Math.hypot(x,y,z);
    if(d<=1e-14)throw new Error("Zero body normal");
    smooth[i*3]=x/d;smooth[i*3+1]=y/d;smooth[i*3+2]=z/d;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index),1));
  geometry.setAttribute("position",new THREE.BufferAttribute(new Float32Array(position),3));
  geometry.setAttribute("normal",new THREE.BufferAttribute(smooth,3));
  geometry.setAttribute("uv",new THREE.BufferAttribute(new Float32Array(uv),2));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {geometry,stats:{
    sourceVertices:sourcePositions.length,sourceQuads:faces.length,
    connectedComponents:counts.size,retainedSourceVertices:sourceIds.size,
    retainedQuads:selected.length,outputVertices:sourceForOutput.length,
    triangles:index.length/3,boundaryEdges:boundaries,nonManifoldEdges:nonManifold,
    heightMeters:1.75,
  }};
}
