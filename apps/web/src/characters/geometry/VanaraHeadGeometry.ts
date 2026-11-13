import * as THREE from "three";
import type {MammalianHeadMorphologyV1} from "@trilok/character-core";
import type {AnatomicalHuman} from "./AnatomicalTemplate";
import type {MammalianHeadLandmarks} from "./MammalianHeadDeformation";
import type {HumanHeadTransform} from "./HumanHeadDeformation";

/**
 * C3.5 Vanara topology experiment. This is an authored procedural *external*
 * soft-tissue surface, not a Smithsonian scan or scan-extracted measurement.
 * It replaces (rather than stretches) the human head's rendered triangles.
 * Bones, combat and the pinned C2 human source remain unchanged.
 */
export interface VanaraHeadReplacement {
  readonly mesh: THREE.SkinnedMesh;
  readonly landmarks: MammalianHeadLandmarks;
  readonly neckCutY: number;
  readonly headVertices: number;
  readonly skullWidthMeters: number;
  readonly skullHeightMeters: number;
}
const replacements = new WeakMap<AnatomicalHuman, VanaraHeadReplacement>();
export const getVanaraHeadReplacement = (human: AnatomicalHuman):
  VanaraHeadReplacement | undefined => replacements.get(human);

const clamp = THREE.MathUtils.clamp;
const bell = (distance:number, radius:number):number =>
  Math.exp(-2*(distance/Math.max(radius,1e-5))**2);
const smooth = (x:number):number => {
  const t=clamp(x,0,1);
  return t*t*(3-2*t);
};
function lerpProfile(t:number,
  stations:readonly (readonly [number,number])[]):number {
  for(let i=1;i<stations.length;i++){
    if(t<=stations[i]![0]){
      const a=stations[i-1]!,b=stations[i]!;
      return THREE.MathUtils.lerp(a[1],b[1],smooth((t-a[0])/(b[0]-a[0])));
    }
  }
  return stations[stations.length-1]![1];
}
const cranialProfile = [
  [0,.57],[.10,.72],[.25,.91],[.44,1.0],
  [.66,1.09],[.79,1.05],[.91,.78],[1,0],
] as const;
const depthProfile = [
  [0,.57],[.10,.77],[.26,.92],[.48,.95],
  [.69,1.05],[.84,.97],[.95,.55],[1,0],
] as const;
const centerProfile = [
  [0,0],[.2,-.002],[.48,-.014],[.72,-.023],[1,-.023],
] as const;

/** Explicit topology generation from a calibrated humanoid neck boundary.
 * The skull is one indexed surface with sculpted nasal, buccal, orbital and
 * auricular regions. Eye globes are distinct skinned anatomical components
 * rather than an additional extrusion of the original human face. */
export function replaceVanaraHead(human:AnatomicalHuman,
  head:HumanHeadTransform,shape:MammalianHeadMorphologyV1):VanaraHeadReplacement {
  if(replacements.has(human))throw new Error("Vanara head already replaced");
  if(human.spike.graph.headTopologyFamilyId!=="head_primate_v1")
    throw new Error("Vanara head requires C1 primate graph");
  const {spike,mesh}=human;
  const geometry=mesh.geometry;
  const pos=geometry.getAttribute("position");
  const skinIndex=geometry.getAttribute("skinIndex");
  const skinWeight=geometry.getAttribute("skinWeight");
  const index=geometry.getIndex();
  if(!pos||!skinIndex||!skinWeight||!index)
    throw new Error("Vanara replacement requires a skinned source body");
  const neckIndex=spike.graph.joints.findIndex(j=>j.role==="neck");
  const skull=spike.skeleton.bones[head.headJointIndex];
  const jaw=spike.skeleton.bones[head.jawJointIndex];
  if(neckIndex<0||!skull||!jaw)
    throw new Error("Vanara replacement requires live C1 head/neck/jaw");
  const root=spike.character.root;
  root.updateWorldMatrix(true,true);
  const toRoot=(p:THREE.Vector3):THREE.Vector3 =>
    p.applyMatrix4(root.matrixWorld.clone().invert());
  const neck=toRoot(spike.skeleton.bones[neckIndex]!.getWorldPosition(new THREE.Vector3()));
  const eyeLeft=toRoot(skull.getWorldPosition(new THREE.Vector3()))
    .add(new THREE.Vector3(-.038,.035,.064));
  const eyeRight=eyeLeft.clone().add(new THREE.Vector3(.076,0,0));
  const crown=head.landmarks.crown;
  // Head vertical extent derives from the already rebound human foundation.
  // The family-specific topology is independent of the human *face* surface.
  const topY=Math.max(crown.y*shape.stature,neck.y+.245);
  const cutY=neck.y+.025*shape.stature;
  const baseY=cutY-.018*shape.stature;
  const height=topY-baseY;
  if(!(height>.20&&height<.43))
    throw new Error("Vanara cranial height outside C1 envelope");
  // Calibrate lateral and sagittal neck size from *rendered skin* near cut.
  const nearest:number[]=[];
  for(let i=0;i<pos.count;i++){
    const y=pos.getY(i);
    if(Math.abs(y-cutY)<.012)nearest.push(i);
  }
  if(nearest.length<12)throw new Error("Vanara neck contour not found");
  const cx=neck.x,cz=neck.z;
  const spans=nearest.filter(i=>Math.abs(pos.getX(i)-cx)<.24 &&
    Math.abs(pos.getZ(i)-cz)<.20);
  if(spans.length<12)throw new Error("Vanara neck contour ambiguous");
  let neckWidth=0,neckDepth=0;
  for(const i of spans) {
    neckWidth=Math.max(neckWidth,Math.abs(pos.getX(i)-cx));
    neckDepth=Math.max(neckDepth,Math.abs(pos.getZ(i)-cz));
  }
  // The base nests inside the remaining anatomical neck; skull proportions
  // are independent of the projected human nose.
  const baseWidth=clamp(neckWidth*.87,.040,.085);
  const baseDepth=clamp(neckDepth*.87,.035,.080);
  const width=clamp(baseWidth*1.81*shape.skullWidth,.092,.152);
  const depth=clamp(baseDepth*1.72*shape.faceDepth,.073,.136);
  const muzzleScale=shape.muzzleLength, muzzleWidth=shape.muzzleWidth;
  const earScale=shape.earSize;
  const positions:number[]=[],uvs:number[]=[],colors:number[]=[];
  const skinIds:number[]=[],skinWeights:number[]=[],triangles:number[]=[];
  const samples=64,levels=48;
  const fur=new THREE.Color(0x625850);
  const faceSkin=new THREE.Color(0xa47c6e);
  const muzzleTone=new THREE.Color(0xa58276);
  const noseTone=new THREE.Color(0x71554e);
  const nostrilTone=new THREE.Color(0x2b2124);
  const mouthTone=new THREE.Color(0x38282a);
  const orbitTone=new THREE.Color(0x493334);
  const earTone=new THREE.Color(0x6b4a45);
  const add=(p:THREE.Vector3,u:number,v:number,c:THREE.Color,jawWeight:number):number=>{
    if(!p.toArray().every(Number.isFinite))
      throw new Error("Vanara external topology contains nonfinite vertex");
    const id=positions.length/3;
    positions.push(p.x,p.y,p.z);uvs.push(u,v);
    colors.push(c.r,c.g,c.b);
    skinIds.push(head.headJointIndex,head.jawJointIndex,0,0);
    skinWeights.push(1-jawWeight,jawWeight,0,0);
    return id;
  };
  const feature=(x:number,t:number,theta:number):{
    readonly nose:number;readonly nares:number;readonly lip:number;
    readonly eye:number;readonly ear:number;readonly face:number;
    readonly cheek:number;readonly muzzle:number;readonly brow:number;
  }=>{
    const front=smooth((Math.sin(theta)-.10)/.6);
    const nose=bell(x,.028*muzzleWidth)*bell(t-.42,.09)*front;
    const nares=(bell(x-.014,.008)+bell(x+.014,.008))*
      bell(t-.397,.028)*front;
    const lip=bell(x,.058*muzzleWidth)*bell(t-.287,.015)*front;
    const eye=(bell(x-.041,.023)+bell(x+.041,.023))*
      bell(t-.625,.057)*front;
    const ear=bell(Math.abs(x)-width*.99,.038)*
      bell(t-.59,.135)*(1-front*.38);
    const face=front*smooth((t-.13)/.21)*(1-smooth((t-.79)/.11));
    const cheek=(bell(x-.081,.042)+bell(x+.081,.042))*
      bell(t-.46,.15)*front;
    const muzzle=bell(x,.079*muzzleWidth)*bell(t-.36,.145)*front;
    const brow=(bell(x-.043,.030)+bell(x+.043,.030))*
      bell(t-.71,.048)*front;
    return {nose,nares,lip,eye,ear,face,cheek,muzzle,brow};
  };
  for(let row=0;row<levels;row++){
    const t=row/levels;
    const y=baseY+height*t;
    const rx=width*lerpProfile(t,cranialProfile);
    const rz=depth*lerpProfile(t,depthProfile);
    const centerZ=cz+lerpProfile(t,centerProfile);
    for(let j=0;j<samples;j++){
      const theta=2*Math.PI*j/samples;
      const ux=Math.cos(theta),uz=Math.sin(theta);
      let x=cx+rx*ux;
      const f=feature(x-cx,t,theta);
      const earPush=.037*earScale*f.ear;
      x+=Math.sign(ux)*earPush*(1-.34*bell(t-.585,.042));
      const nose=.026*muzzleScale*f.nose;
      const muzzle=.042*muzzleScale*f.muzzle;
      const nostrilIndent=.015*f.nares;
      const oralIndent=.009*f.lip;
      const eyeRecess=.013*f.eye;
      const z=centerZ+rz*uz+
        muzzle+nose+.010*shape.jawMass*f.cheek+.013*shape.browMass*f.brow-
        nostrilIndent-oralIndent-eyeRecess-
        .008*f.ear*bell(t-.58,.067);
      const point=new THREE.Vector3(x,y,z);
      // The existing C1 jaw bone controls lower-face movement. The transition
      // is smooth through the cheek so no source seam changes at runtime.
      const jawWeight=smooth((.39-t)/.17)*
        smooth((Math.sin(theta)+.65)/1.0)*.93;
      const color=fur.clone().lerp(faceSkin,f.face*.98);
      color.lerp(muzzleTone,clamp(f.muzzle*.56+f.cheek*.14,0,.85));
      color.lerp(orbitTone,clamp(f.eye*.70,0,.77));
      color.lerp(noseTone,clamp(f.nose*.85,0,.88));
      color.lerp(nostrilTone,clamp(f.nares*.94,0,.96));
      color.lerp(mouthTone,clamp(f.lip*.92,0,.95));
      color.lerp(earTone,clamp(f.ear*.70,0,.77));
      add(point,j/samples,t,color,jawWeight);
      if(row>0){
        const prev=(row-1)*samples+j;
        const next=(row-1)*samples+(j+1)%samples;
        const current=row*samples+j;
        const currentNext=row*samples+(j+1)%samples;
        // The profile rings are oriented for the outward positive-Z front.
        triangles.push(prev,current,next,next,current,currentNext);
      }
    }
  }
  const centerTop=add(new THREE.Vector3(cx,baseY+height,cz-.023),.5,1,fur,0);
  const lastRing=(levels-1)*samples;
  for(let j=0;j<samples;j++)
    triangles.push(lastRing+j,centerTop,lastRing+(j+1)%samples);
  // Cover the bottom join inside the overlapping C2 neck surface; this
  // retains a closed replacement head even though the body cut is separate.
  const centerBottom=add(new THREE.Vector3(cx,baseY,cz),.5,0,fur,0);
  for(let j=0;j<samples;j++)
    triangles.push(centerBottom,(j+1)%samples,j);
  // Append independent spherical eye surfaces to the same skinned geometry.
  // Both globes remain fully bound to the canonical C1 head bone.
  const eyeY=baseY+height*.625;
  for(const sign of [-1,1]){
    const eyeX=cx+sign*.041;
    const eyeZ=cz+lerpProfile(.625,centerProfile)+
      depth*lerpProfile(.625,depthProfile)*.92+.007;
    const center=new THREE.Vector3(eyeX,eyeY,eyeZ);
    const first=positions.length/3;
    const stacks=10,slices=16;
    for(let j=0;j<stacks;j++){
      const v=(j+.5)/stacks,phi=Math.PI*v;
      for(let k=0;k<slices;k++){
        const u=k/slices,theta=u*2*Math.PI;
        const eyePos=center.clone().add(new THREE.Vector3(
          .017*Math.sin(phi)*Math.cos(theta),
          .014*Math.cos(phi),
          .012*Math.sin(phi)*Math.sin(theta)));
        const front=eyePos.z>eyeZ+.001;
        const pupil=bell(eyePos.x-eyeX,.0065)*bell(eyePos.y-eyeY,.0065);
        const iris=bell(eyePos.x-eyeX,.010)*bell(eyePos.y-eyeY,.010);
        const irisColor=new THREE.Color(0x6b4a31);
        const c=new THREE.Color(0x211d1e);
        if(front)c.lerp(irisColor,.72*iris*(1-pupil));
        add(eyePos,u,v,c,0);
        if(j>0){
          const a=first+(j-1)*slices+k;
          const b=first+(j-1)*slices+(k+1)%slices;
          const d=first+j*slices+k;
          const e=first+j*slices+(k+1)%slices;
          triangles.push(a,b,d,b,e,d);
        }
      }
    }
    const upper=add(center.clone().add(new THREE.Vector3(0,.014,0)),.5,0,
      new THREE.Color(0x211d1e),0);
    const lower=add(center.clone().add(new THREE.Vector3(0,-.014,0)),.5,1,
      new THREE.Color(0x211d1e),0);
    for(let k=0;k<slices;k++){
      triangles.push(upper,first+k,first+(k+1)%slices);
      const last=first+(stacks-1)*slices;
      triangles.push(lower,last+(k+1)%slices,last+k);
    }
  }
  const headGeo=new THREE.BufferGeometry();
  headGeo.setIndex(triangles);
  headGeo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  headGeo.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  headGeo.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  headGeo.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(skinIds,4));
  headGeo.setAttribute("skinWeight",new THREE.Float32BufferAttribute(skinWeights,4));
  headGeo.computeVertexNormals();
  headGeo.computeBoundingSphere();
  headGeo.computeBoundingBox();
  const headMaterial=new THREE.MeshStandardMaterial({
    color:0xffffff,vertexColors:true,roughness:.9,side:THREE.DoubleSide,
  });
  const headMesh=new THREE.SkinnedMesh(headGeo,headMaterial);
  headMesh.name="C3_VANARA_INDEPENDENT_SOFT_TISSUE_TOPOLOGY";
  headMesh.frustumCulled=false;
  // Passing the existing bindMatrix avoids changing the established C2 bone
  // inverses. There are no new gameplay joints, sockets or hit volumes.
  root.add(headMesh);
  headMesh.bind(spike.skeleton,mesh.bindMatrix);
  // Remove human *render triangles* above the neck; the original C2 vertex,
  // UV and weight arrays remain intact for human mode and regressions.
  const kept:number[]=[];
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
    if(Math.max(pos.getY(a),pos.getY(b),pos.getY(c))<=cutY)
      kept.push(a,b,c);
  }
  if(kept.length<index.count*.60||kept.length>index.count*.99){
    root.remove(headMesh);headGeo.dispose();headMaterial.dispose();
    throw new Error("Vanara replacement rejected unexpected neck cut");
  }
  geometry.setIndex(kept);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const featurePoint=(x:number,t:number,zOffset:number):THREE.Vector3 =>
    new THREE.Vector3(cx+x,baseY+height*t,
      cz+lerpProfile(t,centerProfile)+depth*lerpProfile(t,depthProfile)+zOffset);
  const rest={
    muzzle:featurePoint(0,.36,.052*muzzleScale),
    nose:featurePoint(0,.42,.068*muzzleScale),
    nostrilLeft:featurePoint(-.014,.397,.05*muzzleScale),
    nostrilRight:featurePoint(.014,.397,.05*muzzleScale),
    mouth:featurePoint(0,.287,.04*muzzleScale),
    earLeft:new THREE.Vector3(cx-width-.03*earScale,baseY+height*.59,cz),
    earRight:new THREE.Vector3(cx+width+.03*earScale,baseY+height*.59,cz),
  };
  root.updateWorldMatrix(true,true);
  const local=(point:THREE.Vector3,bone:THREE.Bone):THREE.Vector3=>
    bone.worldToLocal(point.clone().applyMatrix4(root.matrixWorld));
  const localCranial={
    muzzle:local(rest.muzzle,skull),nose:local(rest.nose,skull),
    nostrilLeft:local(rest.nostrilLeft,skull),
    nostrilRight:local(rest.nostrilRight,skull),
    mouth:local(rest.mouth,jaw),
    earLeft:local(rest.earLeft,skull),earRight:local(rest.earRight,skull),
  };
  const current=(p:THREE.Vector3,bone:THREE.Bone,out:THREE.Vector3):THREE.Vector3=>{
    root.updateWorldMatrix(true,true);
    return out.copy(p).applyMatrix4(bone.matrixWorld);
  };
  const arr=(p:THREE.Vector3):readonly [number,number,number]=>
    Object.freeze(p.toArray() as [number,number,number]);
  const landmarks:MammalianHeadLandmarks=Object.freeze({
    family:"primate" as const,
    muzzleRest:arr(rest.muzzle),noseRest:arr(rest.nose),
    nostrilLeftRest:arr(rest.nostrilLeft),nostrilRightRest:arr(rest.nostrilRight),
    mouthRest:arr(rest.mouth),
    earLeftRest:arr(rest.earLeft),earRightRest:arr(rest.earRight),
    muzzleWorld:(out=new THREE.Vector3())=>current(localCranial.muzzle,skull,out),
    noseWorld:(out=new THREE.Vector3())=>current(localCranial.nose,skull,out),
    nostrilWorld:(side,out=new THREE.Vector3())=>current(
      side==="left"?localCranial.nostrilLeft:localCranial.nostrilRight,skull,out),
    mouthWorld:(out=new THREE.Vector3())=>current(localCranial.mouth,jaw,out),
    earWorld:(side,out=new THREE.Vector3())=>current(
      side==="left"?localCranial.earLeft:localCranial.earRight,skull,out),
  });
  const replacement:VanaraHeadReplacement=Object.freeze({
    mesh:headMesh,landmarks,neckCutY:cutY,
    headVertices:headGeo.getAttribute("position").count,
    skullWidthMeters:width*2,skullHeightMeters:height,
  });
  replacements.set(human,replacement);
  // C2 owns the original source geometry, C3.5 owns its added head GPU data.
  const dispose=human.dispose.bind(human);
  let released=false;
  human.dispose=()=>{
    if(!released){
      released=true;replacements.delete(human);
      headMesh.removeFromParent();headGeo.dispose();headMaterial.dispose();
    }
    dispose();
  };
  return replacement;
}
