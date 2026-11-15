/** Produces a Blender-only reference snapshot from the EXACT Three.js skinned source.
 * Run with: pnpm exec vitest run tools/blender-c52/export-source.test.ts
 * This is an offline authoring tool, not a browser dependency or a visual signoff.
 */
import {test,expect} from "vitest";
import * as THREE from "three";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from "../../apps/web/src/characters/geometry/AnatomicalTemplate";
import type {SourceRig,SourceWeights} from "../../apps/web/src/characters/geometry/OfficialHumanRig";

test("export pinned source skin, original bone identities and neutral bind geometry",()=>{
  const source=(file:string)=>readFileSync("apps/web/public/anatomy/"+file,"utf8");
  const template=parseAnatomicalOBJ(source("makehuman-base.obj"),{includeGroups:["body"]});
  const human=bindTemplateToSemanticRig(template,{
    rig:JSON.parse(source("makehuman-default.mhskel")) as SourceRig,
    weights:JSON.parse(source("makehuman-default_weights.mhw")) as SourceWeights,
  });
  try{
    const root=human.spike.character.root;
    root.updateWorldMatrix(true,true);
    const mesh=human.mesh;
    mesh.updateWorldMatrix(true,false);
    const bones=human.spike.skeleton.bones;
    const ids=new Map(bones.map((bone,i)=>[bone,i]));
    const positions=bones.map(bone=>bone.getWorldPosition(new THREE.Vector3()).toArray().map(x=>+x.toFixed(7)));
    const semantic:Record<string,number>={};
    for(const joint of human.spike.graph.joints){
      const bone=human.spike.bones.get(joint.id);
      const index=bone&&ids.get(bone);
      if(index!==undefined)semantic[joint.role]=index;
    }
    for(const role of ["chest","head","shoulder_left","shoulder_right",
      "elbow_left","elbow_right","wrist_left","wrist_right",
      "palm_left","palm_right"])
      expect(semantic[role],role+" must exist in the pinned source").toBeDefined();
    const vertices=mesh.geometry.getAttribute("position");
    const skinIndices=mesh.geometry.getAttribute("skinIndex");
    const skinWeights=mesh.geometry.getAttribute("skinWeight");
    const index=mesh.geometry.getIndex();
    expect(vertices.count).toBeGreaterThan(10000);
    const resultVerts:string[]=[];
    const weights:number[][][]=[];
    const scratch=new THREE.Vector3();
    for(let i=0;i<vertices.count;i++){
      mesh.getVertexPosition(i,scratch).applyMatrix4(mesh.matrixWorld);
      resultVerts.push("v "+scratch.toArray().map(n=>n.toFixed(7)).join(" "));
      const influences:number[][]=[];
      for(let k=0;k<4;k++){
        const boneIndex=skinIndices.getComponent(i,k);
        const weight=skinWeights.getComponent(i,k);
        if(weight>1e-6)influences.push([boneIndex,+weight.toFixed(7)]);
      }
      weights.push(influences);
    }
    const faces:string[]=[];
    const count=index?index.count:vertices.count;
    expect(count%3).toBe(0);
    for(let i=0;i<count;i+=3){
      const n=(j:number)=>(index?index.getX(j):j)+1;
      faces.push("f "+n(i)+" "+n(i+1)+" "+n(i+2));
    }
    const rig={
      schemaVersion:1,source:"Trilok pinned CC0 MakeHuman skin + default rig",
      coordinateSystem:"Y-up, +Z forward, meters",
      vertices:vertices.count,triangles:count/3,
      bones:bones.map((bone,i)=>({
        id:"bone_"+i,sourceName:bone.name,
        parent:ids.get(bone.parent as THREE.Bone)??null,
        head:positions[i],
      })),
      semantic,weights,
    };
    const out="test-results/blender-c52";
    mkdirSync(out,{recursive:true});
    writeFileSync(out+"/source-human.obj",
      "# Neutral source-skinned MakeHuman body; Y-up, +Z forward; generated, do not edit\n"+
      resultVerts.join("\n")+"\n"+faces.join("\n")+"\n");
    writeFileSync(out+"/source-rig.v1.json",JSON.stringify(rig));
    console.log("C52 BLENDER SOURCE",JSON.stringify({
      vertices:rig.vertices,triangles:rig.triangles,bones:bones.length,
      semantic:Object.fromEntries(Object.entries(semantic).filter(([role])=>
        /^(chest|shoulder_|elbow_|wrist_|palm_)/.test(role)).map(([role,i])=>[
          role,{id:i,sourceName:bones[i]?.name,parent:ids.get(bones[i]!.parent as THREE.Bone)??null,
          head:positions[i]}])),
    }));
  }finally{human.dispose();}
},90_000);
