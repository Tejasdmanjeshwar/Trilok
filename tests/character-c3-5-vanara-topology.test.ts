import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {createMammalianHeadRecipe,DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY} from
  "../packages/character-core/src/index";
import {parseAnatomicalOBJ,bindTemplateToSemanticRig} from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology,getMammalianHeadLandmarks} from
  "../apps/web/src/characters/geometry/HumanMorphology";
import {getVanaraHeadReplacement} from
  "../apps/web/src/characters/geometry/VanaraHeadGeometry";
import {VANARA_JAW_REGISTRATION,alignVanaraMandiblePoint} from
  "../apps/web/src/characters/geometry/VanaraScanRegistration";
import {VANARA_SCAN_ENVELOPE,VANARA_SCAN_ID,VANARA_SCAN_PROVENANCE,
  VANARA_SCAN_LANDMARKS_MM} from
  "../apps/web/src/characters/geometry/VanaraScanCalibration";
import {AnatomicalFK} from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import type {SourceRig,SourceWeights} from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

const asset=(name:string)=>readFileSync(
  new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
const create=()=>bindTemplateToSemanticRig(parseAnatomicalOBJ(
  asset("makehuman-base.obj"),{includeGroups:["body"]}),
  {rig,weights,headFamily:"primate"});

describe("C3.5 Vanara independent external head geometry",()=>{
  it("uses pinned Smithsonian cranial/mandibular envelope with bounded stations",()=>{
    expect(VANARA_SCAN_PROVENANCE.specimen).toBe("USNM 334797");
    expect(VANARA_SCAN_PROVENANCE.craniumSHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(VANARA_SCAN_PROVENANCE.mandibleSHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(VANARA_SCAN_PROVENANCE.craniumFaces).toBe(750000);
    expect(VANARA_SCAN_PROVENANCE.mandibleFaces).toBe(241727);
    expect(VANARA_SCAN_ENVELOPE).toHaveLength(21);
    expect(VANARA_SCAN_LANDMARKS_MM.leftZygomatic[0]).toBeLessThan(0);
    expect(VANARA_SCAN_LANDMARKS_MM.rightZygomatic[0]).toBeGreaterThan(0);
    expect(VANARA_SCAN_LANDMARKS_MM.leftOrbitRimProxy[0]).toBeLessThan(0);
    expect(VANARA_SCAN_LANDMARKS_MM.rightOrbitRimProxy[0]).toBeGreaterThan(0);
    expect(VANARA_SCAN_PROVENANCE.scanSagittalSpanMm).toBeGreaterThan(100);
    let previous=-1;
    for(const [t,width,depth,offset] of VANARA_SCAN_ENVELOPE){
      expect(t).toBeGreaterThan(previous);previous=t;
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      expect(width).toBeGreaterThanOrEqual(0);
      expect(width).toBeLessThanOrEqual(1.1);
      expect(depth).toBeGreaterThanOrEqual(0);
      expect(depth).toBeLessThanOrEqual(1.1);
      expect(Number.isFinite(offset)).toBe(true);
    }
  });

  it("rigidly aligns paired condyle proxies without scale and maintains mandibular symphysis below glenoid",()=>{
    const l=VANARA_SCAN_LANDMARKS_MM;
    const fitted=VANARA_JAW_REGISTRATION;
    expect(fitted.residualRmsMm).toBeLessThan(1.1);
    expect(fitted.residualRmsMm).toBeGreaterThan(0);
    expect(Math.abs(fitted.mandibleCondyleSpanMm-fitted.craniumJointSpanMm))
      .toBeGreaterThan(1);
    const q=new THREE.Quaternion(...fitted.rotation);
    expect(q.length()).toBeCloseTo(1,8);
    const a=alignVanaraMandiblePoint(l.leftMandibleCondyleUnaligned);
    const b=alignVanaraMandiblePoint(l.rightMandibleCondyleUnaligned);
    for(const [point,target] of [[a,l.leftCranialJointProxy],
      [b,l.rightCranialJointProxy]] as const)
      expect(new THREE.Vector3(...point).distanceTo(new THREE.Vector3(...target)))
        .toBeLessThan(1.1);
    expect(fitted.symphysisMm[1]).toBeLessThan(fitted.condyleMidpointMm[1]-10);
    expect(fitted.symphysisMm[2]).toBeGreaterThan(fitted.condyleMidpointMm[2]+40);
  });

  it("matches actual retained C2 neck vertices, influences and posed skinning",()=>{
    const human=create();
    try{
      applyHumanMorphology(human,createMammalianHeadRecipe("primate"));
      const replacement=getVanaraHeadReplacement(human)!;
      const head=replacement.mesh,body=human.mesh;
      const headPos=head.geometry.getAttribute("position");
      const bodyPos=body.geometry.getAttribute("position");
      const headWeight=head.geometry.getAttribute("skinWeight");
      const headId=head.geometry.getAttribute("skinIndex");
      const bodyWeight=body.geometry.getAttribute("skinWeight");
      const bodyId=body.geometry.getAttribute("skinIndex");
      const headColor=head.geometry.getAttribute("color");
      const bodyColor=body.geometry.getAttribute("color");
      const headNormal=head.geometry.getAttribute("normal");
      const bodyNormal=body.geometry.getAttribute("normal");
      const ring=replacement.neckSeamVertices;
      expect(ring).toBeGreaterThan(24);
      expect(ring).toBeLessThan(160);
      // A disconnected or crossing source contour can match bone weights yet
      // still produce a visibly torn/bridged neck. Bound adjacent 3D edge
      // lengths on the actual generated rim, including its closing edge.
      for(let h=0;h<ring;h++){
        const a=new THREE.Vector3().fromBufferAttribute(headPos,h);
        const b=new THREE.Vector3().fromBufferAttribute(headPos,(h+1)%ring);
        expect(a.distanceTo(b)).toBeLessThan(.045);
        expect(a.distanceTo(b)).toBeGreaterThan(1e-5);
      }
      const matched:number[]=[];
      for(let h=0;h<ring;h++){
        const point=new THREE.Vector3().fromBufferAttribute(headPos,h);
        let bodyIndex=-1;
        for(let i=0;i<bodyPos.count;i++){
          const v=new THREE.Vector3().fromBufferAttribute(bodyPos,i);
          if(point.distanceToSquared(v)<1e-12){bodyIndex=i;break;}
        }
        expect(bodyIndex).toBeGreaterThanOrEqual(0);
        for(let k=0;k<4;k++){
          expect(headId.getComponent(h,k)).toBe(bodyId.getComponent(bodyIndex,k));
          expect(headWeight.getComponent(h,k))
            .toBeCloseTo(bodyWeight.getComponent(bodyIndex,k),5);
        }
        for(let k=0;k<3;k++){
          expect(headColor.getComponent(h,k))
            .toBeCloseTo(bodyColor.getComponent(bodyIndex,k),5);
          expect(headNormal.getComponent(h,k))
            .toBeCloseTo(bodyNormal.getComponent(bodyIndex,k),5);
        }
        matched.push(bodyIndex);
      }
      const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
        jawTipWorldRest:human.jawTipWorldRest,
        forearmSkinBones:human.spike.forearmSkinBones,
        shoulderSkinBones:human.spike.shoulderSkinBones,
      });
      const roles=human.spike.graph.joints;
      for(const joint of [roles.find(j=>j.role==="head"),
        roles.find(j=>j.role==="neck")]){
        if(!joint)throw new Error("Missing C1 cranial bone");
        fk.apply([{jointId:joint.id,motion:"rotation",radians:.45}]);
        for(let h=0;h<ring;h++){
          const a=head.getVertexPosition(h,new THREE.Vector3());
          const b=body.getVertexPosition(matched[h]!,new THREE.Vector3());
          expect(a.distanceTo(b)).toBeLessThan(1e-5);
        }
        fk.apply([]);
      }
    }finally{human.dispose();}
  },120_000);

  it("provides a species-specific skinned topology with finite UVs, normalized ownership and nondegenerate faces",()=>{
    const human=create();
    try{
      const baselineTriangles=human.mesh.geometry.getIndex()!.count;
      const sourceIds=Array.from(human.template.sourceVertexIds);
      applyHumanMorphology(human,createMammalianHeadRecipe("primate"));
      const replacement=getVanaraHeadReplacement(human);
      expect(replacement).toBeDefined();
      const {mesh,headVertices,neckCutY,skullWidthMeters}=replacement!;
      expect(replacement!.sourceCalibration).toBe(VANARA_SCAN_ID);
      expect(replacement!.baselineHumanHeadTriangles).toBeGreaterThan(0);
      expect(replacement!.replacementHeadTriangles).toBeGreaterThan(0);
      expect(replacement!.replacementHeadTriangles).toBeLessThanOrEqual(
        replacement!.baselineHumanHeadTriangles*1.3);
      const geometry=mesh.geometry;
      expect(mesh.name).toContain("VANARA_INDEPENDENT");
      expect(mesh.skeleton).toBe(human.spike.skeleton);
      expect(headVertices).toBeGreaterThan(3000);
      expect(skullWidthMeters).toBeGreaterThan(.16);
      expect(skullWidthMeters).toBeLessThan(.34);
      expect(neckCutY).toBeGreaterThan(1.4);
      expect(human.mesh.geometry.getIndex()!.count).toBeLessThan(baselineTriangles);
      expect([...human.template.sourceVertexIds]).toEqual(sourceIds);
      const pos=geometry.getAttribute("position");
      const uv=geometry.getAttribute("uv");
      const norm=geometry.getAttribute("normal");
      const color=geometry.getAttribute("color");
      const ids=geometry.getAttribute("skinIndex");
      const weightsAttr=geometry.getAttribute("skinWeight");
      for(let i=0;i<pos.count;i++){
        for(let k=0;k<3;k++){
          expect(Number.isFinite(pos.getComponent(i,k))).toBe(true);
          expect(Number.isFinite(norm.getComponent(i,k))).toBe(true);
          expect(Number.isFinite(color.getComponent(i,k))).toBe(true);
        }
        for(let k=0;k<2;k++)expect(Number.isFinite(uv.getComponent(i,k))).toBe(true);
        let sum=0;
        for(let k=0;k<4;k++){
          const index=ids.getComponent(i,k),w=weightsAttr.getComponent(i,k);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(human.spike.skeleton.bones.length);
          expect(w).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(w)).toBe(true);
          sum+=w;
        }
        expect(sum).toBeCloseTo(1,5);
      }
      const faces=geometry.getIndex()!;
      let degenerate=0;
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
      for(let i=0;i<faces.count;i+=3){
        a.fromBufferAttribute(pos,faces.getX(i));
        b.fromBufferAttribute(pos,faces.getX(i+1));
        c.fromBufferAttribute(pos,faces.getX(i+2));
        if(new THREE.Vector3().subVectors(b,a).cross(
          new THREE.Vector3().subVectors(c,a)).lengthSq()<1e-14)degenerate++;
      }
      expect(degenerate).toBe(0);
    }finally{human.dispose();}
  },120_000);

  it("remains deterministic and updates mouth under canonical jaw FK without shifting the cranial nose",()=>{
    const outputs:string[]=[];
    for(let iteration=0;iteration<2;iteration++){
      const human=create();
      try{
        applyHumanMorphology(human,createMammalianHeadRecipe("primate",{
          ...DEFAULT_MAMMALIAN_HEAD_MORPHOLOGY,
          muzzleLength:1.12,muzzleWidth:1.07,earSize:1.08,
        }));
        const replacement=getVanaraHeadReplacement(human)!;
        const positions=replacement.mesh.geometry.getAttribute("position").array;
        outputs.push(Array.from(positions as ArrayLike<number>).map(x=>x.toFixed(5)).join(","));
        const landmark=getMammalianHeadLandmarks(human)!;
        const mouth=landmark.mouthWorld().clone(),nose=landmark.noseWorld().clone();
        const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
          jawTipWorldRest:human.jawTipWorldRest,
          forearmSkinBones:human.spike.forearmSkinBones,
          shoulderSkinBones:human.spike.shoulderSkinBones,
        });
        const jaw=human.spike.graph.joints.find(j=>j.role==="jaw")!;
        fk.apply([{jointId:jaw.id,motion:"flexion",radians:.40}]);
        expect(landmark.mouthWorld().distanceTo(mouth)).toBeGreaterThan(.001);
        expect(landmark.noseWorld().distanceTo(nose)).toBeLessThan(1e-5);
        fk.apply([]);
        expect(landmark.mouthWorld().distanceTo(mouth)).toBeLessThan(1e-5);
        expect(landmark.noseWorld().distanceTo(nose)).toBeLessThan(1e-5);
        const material=replacement.mesh.material as THREE.Material;
        const geometry=replacement.mesh.geometry;
        human.dispose();
        human.dispose();
        expect(geometry.getAttribute("position")).toBeDefined();
        expect(material).toBeDefined();
      }finally{human.dispose();}
    }
    expect(outputs[0]).toEqual(outputs[1]);
  },120_000);
});
