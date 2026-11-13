import * as THREE from "three";
import { applyOfficialSkinWeights, calibrateHumanBones, makeSourceLandmarks, type SourceRig, type SourceWeights, type RigDiagnostics } from "./OfficialHumanRig";
import { createSkinningSpike, validateSkinningSpike, type SkinningSpike } from "./SkinningSpike";
import { AnatomicalFK, type AnatomicalMotion, type JointTarget } from "./AnatomicalFK";

/**
 * Deterministic OBJ adapter for verified core MakeHuman geometry. Face-corner UV
 * seams duplicate render vertices, but sourceVertexIds preserve morph/topology
 * correspondence with upstream numbered 'v' entries. No GPL parser or editor.
 *
 * Source Y is up; +Z is assumed forward pending visual calibration. Vertices
 * are baked into meters in C1 space; the root and bone scales remain exactly 1.
 */
export interface AnatomicalTemplate {
  readonly geometry: THREE.BufferGeometry;
  readonly sourceVertexIds: Uint32Array;
  readonly sourcePositions: Float32Array;
  readonly sourceOrigin: readonly [number,number,number];
  readonly sourceVertexCount: number;
  readonly sourceFaceCount: number;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly connectedComponents: number;
  readonly sourceHeight: number;
  readonly conversionMetersPerSourceUnit: number;
}
export type AnatomicalLoadStage = "obj-fetch" | "obj-parse" | "rig-fetch" | "rig-json" | "weight-json" | "fk-calibration" | "shoulder-motion-sampling" | "skin-influence-fitting" | "total-instantiation";
export type AnatomicalTimingSink = (stage:AnatomicalLoadStage,milliseconds:number)=>void;
export interface AnatomicalHuman {
  readonly spike: SkinningSpike;
  readonly mesh: THREE.SkinnedMesh;
  readonly template: AnatomicalTemplate;
  readonly rigDiagnostics?: RigDiagnostics;
  /** Source jaw tip rest-world position; used to calibrate sagittal opening. */
  readonly jawTipWorldRest?: THREE.Vector3;
  readonly vertexCount: number;
  readonly triangleCount: number;
  dispose():void;
}
const MAX_BYTES=4_000_000;
const MAX_VERTICES=100_000;
const TARGET_HEIGHT_METERS=1.88; // C1 head tip ~1.88m; explicit provisional calibration.

function positiveIndex(raw:string,size:number):number {
  const i=Number(raw);
  const index=i>0?i-1:size+i;
  if(!Number.isSafeInteger(i)||i===0||index<0||index>=size)
    throw new Error("Invalid OBJ index "+raw);
  return index;
}
function finiteValues(parts:readonly string[],length:number):number[] {
  if(parts.length<length)throw new Error("Truncated OBJ geometry");
  const values=parts.slice(0,length).map(Number);
  if(values.some(v=>!Number.isFinite(v)))throw new Error("Nonfinite OBJ coordinates");
  return values;
}
/** Bounded parser preserving source vertex indexing and triangulating polygon faces. */
export function parseAnatomicalOBJ(
  source:string, options:{readonly includeGroups?:readonly string[]}={},
):AnatomicalTemplate {
  if(!source||source.length>MAX_BYTES)throw new Error("Anatomical OBJ outside size budget");
  const sourcePositions:number[]=[];
  const sourceUVs:number[]=[];
  const positions:number[]=[];
  const uvs:number[]=[];
  const sourceIds:number[]=[];
  const triangles:number[]=[];
  const corners=new Map<string,number>();
  const topologyEdges=new Map<string,number>();
  let faces=0;
  let group="";
  const includedGroups=options.includeGroups===undefined?undefined:new Set(options.includeGroups);
  if(includedGroups?.size===0)throw new Error("Empty anatomical source group allowlist");
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(const rawLine of source.split(/\r?\n/)){
    const line=rawLine.trim();
    if(!line||line.startsWith("#"))continue;
    const parts=line.split(/\s+/);
    const command=parts.shift();
    if(command==="g"){
      group=parts[0]??"";
      continue;
    }
    if(command==="v"){
      const [x,y,z]=finiteValues(parts,3);
      sourcePositions.push(x!,y!,z!);
      minX=Math.min(minX,x!);maxX=Math.max(maxX,x!);
      minY=Math.min(minY,y!);maxY=Math.max(maxY,y!);
      minZ=Math.min(minZ,z!);maxZ=Math.max(maxZ,z!);
      if(sourcePositions.length/3>MAX_VERTICES)throw new Error("Anatomical vertex budget exceeded");
    }else if(command==="vt"){
      const [u,v]=finiteValues(parts,2);sourceUVs.push(u!,v!);
    }else if(command==="f"){
      if(includedGroups && !includedGroups.has(group))continue;
      if(parts.length<3||parts.length>32)throw new Error("Unsupported OBJ face size");
      const face=parts.map(part=>{
        const pieces=part.split("/");
        const id=positiveIndex(pieces[0]!,sourcePositions.length/3);
        const uv=pieces[1]?positiveIndex(pieces[1],sourceUVs.length/2):-1;
        const key=id+"/"+uv;
        let rendered=corners.get(key);
        if(rendered===undefined){
          rendered=sourceIds.length;corners.set(key,rendered);sourceIds.push(id);
          positions.push(sourcePositions[id*3]!,sourcePositions[id*3+1]!,sourcePositions[id*3+2]!);
          uvs.push(uv<0?0:sourceUVs[uv*2]!,uv<0?0:sourceUVs[uv*2+1]!);
        }
        return rendered;
      });
      for(let k=1;k<face.length-1;k++){
        const a=face[0]!,b=face[k]!,c=face[k+1]!;
        const aa=sourceIds[a]!,bb=sourceIds[b]!,cc=sourceIds[c]!;
        if(aa===bb||aa===cc||bb===cc)throw new Error("Degenerate source triangle");
        // Undirected source-index edges ignore intentional UV-render seams.
        for(const [v0,v1] of [[aa,bb],[bb,cc],[cc,aa]]){
          const key=Math.min(v0!,v1!)+"|"+Math.max(v0!,v1!);
          topologyEdges.set(key,(topologyEdges.get(key)??0)+1);
        }
        triangles.push(a,b,c);
      }
      faces++;
    }
  }
  const count=sourcePositions.length/3;
  // Source OBJ also contains invisible helpers and auxiliary facial meshes.
  // Calibrate dimensions from *included topology only*, not unused helper vertices.
  if(includedGroups){
    minX=Infinity;minY=Infinity;minZ=Infinity;
    maxX=-Infinity;maxY=-Infinity;maxZ=-Infinity;
    for(const id of new Set(sourceIds)){
      const x=sourcePositions[id*3]!,y=sourcePositions[id*3+1]!,z=sourcePositions[id*3+2]!;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
    }
  }
  const height=maxY-minY;
  if(count<3||!triangles.length||!Number.isFinite(height)||height<=0)
    throw new Error("Empty or flat anatomical OBJ");
  const unit=TARGET_HEIGHT_METERS/height;
  const centerX=(minX+maxX)*.5,centerZ=(minZ+maxZ)*.5;
  const sourceOrigin:readonly [number,number,number]=[centerX,minY,centerZ];
  for(let i=0;i<positions.length;i+=3){
    positions[i]=(positions[i]!-centerX)*unit;
    positions[i+1]=(positions[i+1]!-minY)*unit;
    positions[i+2]=(positions[i+2]!-centerZ)*unit;
  }
  // Sum area-weighted surface normals per original vertex: UV seams share a normal.
  const sourceNormals=new Float64Array(count*3);
  for(let i=0;i<triangles.length;i+=3){
    const a=triangles[i]!,b=triangles[i+1]!,c=triangles[i+2]!;
    const pa=a*3,pb=b*3,pc=c*3;
    const abx=positions[pb]!-positions[pa]!,aby=positions[pb+1]!-positions[pa+1]!,
      abz=positions[pb+2]!-positions[pa+2]!;
    const acx=positions[pc]!-positions[pa]!,acy=positions[pc+1]!-positions[pa+1]!,
      acz=positions[pc+2]!-positions[pa+2]!;
    const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
    if(nx*nx+ny*ny+nz*nz<1e-20)throw new Error("Degenerate anatomical face");
    for(const id of [sourceIds[a]!,sourceIds[b]!,sourceIds[c]!]){
      sourceNormals[id*3]=(sourceNormals[id*3]??0)+nx;
      sourceNormals[id*3+1]=(sourceNormals[id*3+1]??0)+ny;
      sourceNormals[id*3+2]=(sourceNormals[id*3+2]??0)+nz;
    }
  }
  const normals:number[]=[];
  for(const id of sourceIds){
    const x=sourceNormals[id*3]??0,y=sourceNormals[id*3+1]??0,z=sourceNormals[id*3+2]??0;
    const len=Math.hypot(x,y,z);
    normals.push(len>1e-12?x/len:0,len>1e-12?y/len:1,len>1e-12?z/len:0);
  }
  // Disjoint set counts connected topology components, not disconnected UV islands.
  const parent=Uint32Array.from({length:count},(_,i)=>i);
  const find=(n:number):number=>{
    while(parent[n]!==n){parent[n]=parent[parent[n]!]!;n=parent[n]!;}return n;
  };
  for(const key of topologyEdges.keys()){
    const [a,b]=key.split("|").map(Number);
    parent[find(a!)]=find(b!);
  }
  const used=new Set(sourceIds);
  const components=new Set([...used].map(find)).size;
  const geometry=new THREE.BufferGeometry();
  geometry.setIndex(triangles);
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {geometry,sourceVertexIds:Uint32Array.from(sourceIds),
    sourcePositions:Float32Array.from(sourcePositions),sourceOrigin,sourceVertexCount:count,
    sourceFaceCount:faces,sourceHeight:height,conversionMetersPerSourceUnit:unit,
    boundaryEdgeCount:[...topologyEdges.values()].filter(n=>n===1).length,
    nonManifoldEdgeCount:[...topologyEdges.values()].filter(n=>n>2).length,
    connectedComponents:components};
}

/** Evaluates the actual C2 FK matrices for a small immutable, measurable
 * pose envelope before assigning GPU weights. No WebGL and no extra C1 bones.
 * Sampling is local to importing the verified CC0 template and restores rest. */
function calibratedSkinMotionSamples(spike:SkinningSpike,
  jawTipWorldRest:THREE.Vector3):readonly (readonly THREE.Matrix4[])[] {
  const fk=new AnatomicalFK(spike.graph,spike.bones,{
    jawTipWorldRest,forearmSkinBones:spike.forearmSkinBones,
    shoulderSkinBones:spike.shoulderSkinBones,
  });
  const target=(role:string,motion:AnatomicalMotion,radians:number):JointTarget=>{
    const joint=spike.graph.joints.find(j=>j.role===role);
    if(!joint||!fk.frames.get(joint.id)?.freedoms.has(motion))
      throw new Error("Unsupported imported CC0 skin sampling role "+role+"/"+motion);
    return {jointId:joint.id,motion,radians};
  };
  const sides=["left","right"] as const;
  const both=(role:string,motion:AnatomicalMotion,radians:number):JointTarget[] =>
    sides.map(side=>target(role+"_"+side,motion,radians));
  const samples:JointTarget[][]=[
    [...both("clavicle","abduction",.22),
     ...both("shoulder","abduction",1.5),
     ...both("shoulder","flexion",.6)],
    [...both("shoulder","abduction",2.35)],
    [...both("shoulder","flexion",1.5)],
    [...both("shoulder","abduction",-.3)],
    [...both("shoulder","abduction",1.35),
     ...both("shoulder","flexion",.75),
     ...both("elbow","flexion",1.5)],
    [...both("shoulder","abduction",1.5),
     target("chest","rotation",.35),
     target("spine_lower","rotation",.3)],
    [target("neck","rotation",.55),
     target("head","flexion",.3)],
    [target("jaw","flexion",.5)],
    [...both("clavicle","abduction",.22),
     ...both("shoulder","abduction",1.5),
     ...both("shoulder","flexion",.6),
     ...both("elbow","flexion",1.8),
     ...both("hip","flexion",1.5),
     ...both("knee","flexion",1.9),
     target("chest","rotation",.32),
     target("spine_lower","rotation",.3)],
  ];
  try{
    return samples.map(targets=>{
      fk.apply(targets);
      return spike.skeleton.bones.map((bone,index)=>
        bone.matrixWorld.clone().multiply(spike.skeleton.boneInverses[index]!));
    });
  }finally{fk.apply([]);}
}

/** The official weights are mandatory for the deployed template, while synthetic
 * OBJ unit fixtures retain the explicit provisional heuristic for parser tests. */
export function bindTemplateToSemanticRig(template:AnatomicalTemplate,
  official?:{readonly rig:SourceRig;readonly weights:SourceWeights;
    readonly onTiming?:AnatomicalTimingSink;
    readonly headFamily?:"primate"|"bear"}):AnatomicalHuman {
  const spike=createSkinningSpike({forearmSkinning:official!==undefined,
    shoulderSkinning:official!==undefined,
    headFamily:official?.headFamily});
  const geometry=template.geometry;
  if(official){
    let diagnostic:RigDiagnostics;
    let displacement=0;
    let jawTipWorldRest:THREE.Vector3|undefined;
    try{
      const positions=new THREE.Float32BufferAttribute(template.sourcePositions,3);
      const landmarks=makeSourceLandmarks(official.rig,template,positions);
      jawTipWorldRest=landmarks.get("jaw:tail")?.clone();
      if(!jawTipWorldRest)throw new Error("Missing imported jaw-tip landmark");
      const calibrationStart=performance.now();
      displacement=calibrateHumanBones(spike.graph,spike.bones,spike.skeleton,
        spike.character.root,landmarks,spike.forearmSkinBones,
        spike.shoulderSkinBones);
      official.onTiming?.("fk-calibration",performance.now()-calibrationStart);
      const proximalIndices=new Map<"left"|"right",number>();
      for(const side of ["left","right"] as const){
        const helper=spike.forearmSkinBones?.get(side);
        const index=helper?spike.skeleton.bones.indexOf(helper):-1;
        if(index<spike.graph.joints.length)
          throw new Error("Missing C2 proximal skin reference "+side);
        proximalIndices.set(side,index);
      }
      const shoulderIndices=new Map<"left"|"right",number>();
      for(const side of ["left","right"] as const){
        const helper=spike.shoulderSkinBones?.get(side);
        const index=helper?spike.skeleton.bones.indexOf(helper):-1;
        if(index<spike.graph.joints.length+proximalIndices.size)
          throw new Error("Missing C2 shoulder skin connector "+side);
        shoulderIndices.set(side,index);
      }
      const samplingStart=performance.now();
      const sampledMotions=calibratedSkinMotionSamples(spike,jawTipWorldRest);
      official.onTiming?.("shoulder-motion-sampling",performance.now()-samplingStart);
      const fittingStart=performance.now();
      diagnostic=applyOfficialSkinWeights(template,spike.graph,official.rig,
        official.weights,proximalIndices,shoulderIndices,sampledMotions);
      official.onTiming?.("skin-influence-fitting",performance.now()-fittingStart);
      if(diagnostic.unweightedVertices||diagnostic.unmappedBones.length)
        throw new Error("Official rig incomplete: "+diagnostic.unweightedVertices+" unweighted render vertices; "+diagnostic.unmappedBones.join(","));
      spike.mesh.geometry=geometry;
      spike.mesh.name="C2_MAKEHUMAN_CC0_WEIGHTED_SKINNING";
      validateSkinningSpike(spike);
    }catch(error){geometry.dispose();spike.dispose();throw error;}
    let disposed=false;
    return {spike,mesh:spike.mesh,template,jawTipWorldRest,
      rigDiagnostics:{...diagnostic,maxBindDisplacementMeters:displacement},
      vertexCount:geometry.getAttribute("position").count,
      triangleCount:geometry.getIndex()!.count/3,
      dispose(){if(disposed)return;disposed=true;geometry.dispose();spike.dispose();}};
  }
  const indices:number[]=[],weights:number[]=[];
  const joints=spike.graph.joints;
  const points=new Map<string,THREE.Vector3>();
  for(const [id,bone] of spike.bones)points.set(id,bone.getWorldPosition(new THREE.Vector3()));
  const segments=joints.flatMap((joint,index)=>{
    if(!joint.parentId)return [];
    const parentIndex=joints.findIndex(j=>j.id===joint.parentId);
    if(parentIndex<0)throw new Error("Missing semantic rig parent");
    const a=points.get(joint.parentId)!,b=points.get(joint.id)!;
    const delta=b.clone().sub(a),lengthSq=delta.lengthSq();
    return lengthSq>1e-12?[{a,b,delta,lengthSq,parentIndex,index}]:[];
  });
  const position=geometry.getAttribute("position");
  const p=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
    p.fromBufferAttribute(position,i);
    const scored=segments.map(s=>{
      const t=THREE.MathUtils.clamp(p.clone().sub(s.a).dot(s.delta)/s.lengthSq,0,1);
      const q=s.a.clone().addScaledVector(s.delta,t);
      return {s,t,dist:p.distanceToSquared(q)};
    }).sort((a,b)=>a.dist-b.dist||a.s.index-b.s.index).slice(0,3);
    const influence=new Map<number,number>();
    for(const {s,t,dist} of scored){
      const proximity=1/(.004+dist);
      influence.set(s.parentIndex,(influence.get(s.parentIndex)??0)+proximity*(1-t));
      influence.set(s.index,(influence.get(s.index)??0)+proximity*t);
    }
    const top=[...influence].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4);
    const sum=top.reduce((total,item)=>total+item[1],0);
    if(!Number.isFinite(sum)||sum<=0)throw new Error("Invalid semantic skin transfer");
    for(let j=0;j<4;j++){
      indices.push(top[j]?.[0]??0);
      weights.push(j===3?0:(top[j]?.[1]??0)/sum);
    }
    // Re-normalize after influence truncation using exact 4th-slot remainder.
    const offset=i*4;
    const fourth=Math.max(0,1-weights[offset]!-weights[offset+1]!-weights[offset+2]!);
    weights[offset+3]=fourth;
  }
  geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(indices,4));
  geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(weights,4));
  spike.mesh.geometry=geometry;
  spike.mesh.name="C2_MAKEHUMAN_TEMPLATE_PROVISIONAL_SKINNING";
  try{validateSkinningSpike(spike);}
  catch(error){geometry.dispose();spike.dispose();throw error;}
  let disposed=false;
  return {spike,mesh:spike.mesh,template,
    vertexCount:position.count,triangleCount:geometry.getIndex()!.count/3,
    dispose(){if(disposed)return;disposed=true;geometry.dispose();spike.dispose();}};
}
export async function loadAnatomicalHuman(signal?:AbortSignal,
  onTiming?:AnatomicalTimingSink,
  headFamily?:"primate"|"bear"):Promise<AnatomicalHuman> {
  const totalStart=performance.now();
  const fetchStart=performance.now();
  const response=await fetch("/anatomy/makehuman-base.obj",{signal});
  if(!response.ok)throw new Error("Pinned anatomical source unavailable (HTTP "+response.status+")");
  const obj=await response.text();
  onTiming?.("obj-fetch",performance.now()-fetchStart);
  // MakeHuman core OBJ contains helper clothing/collision meshes that overlap
  // the visible skin and produce a false "skirt" silhouette if imported.
  // Retain original vertex numbering but render only the actual body surface.
  const parseStart=performance.now();
  const template=parseAnatomicalOBJ(obj,{includeGroups:["body"]});
  onTiming?.("obj-parse",performance.now()-parseStart);
  const rigFetchStart=performance.now();
  const [rigResponse,weightResponse]=await Promise.all([
    fetch("/anatomy/makehuman-default.mhskel",{signal}),
    fetch("/anatomy/makehuman-default_weights.mhw",{signal}),
  ]);
  if(!rigResponse.ok||!weightResponse.ok){template.geometry.dispose();
    throw new Error("Pinned CC0 MakeHuman skeleton/weight data unavailable");}
  const rawRig=await rigResponse.text();
  const rawWeights=await weightResponse.text();
  onTiming?.("rig-fetch",performance.now()-rigFetchStart);
  try{
    const rigParseStart=performance.now();
    const rig=JSON.parse(rawRig) as SourceRig;
    onTiming?.("rig-json",performance.now()-rigParseStart);
    const weightParseStart=performance.now();
    const weights=JSON.parse(rawWeights) as SourceWeights;
    onTiming?.("weight-json",performance.now()-weightParseStart);
    const human=bindTemplateToSemanticRig(template,{rig,weights,onTiming,headFamily});
    onTiming?.("total-instantiation",performance.now()-totalStart);
    return human;
  }catch(error){template.geometry.dispose();throw error;}
}
