import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {readFileSync} from "node:fs";
import {bindTemplateToSemanticRig,parseAnatomicalOBJ} from "../apps/web/src/characters/geometry/AnatomicalTemplate";
import {BODY_CONTROLS,BODY_PRESETS,BODY_MACRO_DEFAULTS,setBodyAncestryChannel,
  MakeHumanBodyController,resolveBodyMacroFactors,
  validateBodyWeights,validateBodyAtlas,type BodyAtlas} from "../apps/web/src/characters/geometry/MakeHumanBodyTargets";
import {NATIVE_MAKEHUMAN_BODY_MODIFIERS} from "../apps/web/src/characters/geometry/NativeMakeHumanBodyControls";
import {getHumanMorphologyAlignment} from "../apps/web/src/characters/geometry/HumanMorphology";
import type {SourceRig,SourceWeights} from "../apps/web/src/characters/geometry/OfficialHumanRig";
const asset=(f:string)=>readFileSync("apps/web/public/anatomy/"+f,"utf8");
const manifest=JSON.parse(readFileSync("assets/makehuman-body-v1.json","utf8"));
function makeHuman(){
  const tpl=parseAnatomicalOBJ(asset("makehuman-base.obj"),{includeGroups:["body"]});
  const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
  const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
  return bindTemplateToSemanticRig(tpl,{rig,weights});
}
describe("C3.6 original MakeHuman body asset correspondence",()=>{
  it("pins complete source and native modifiers, with no fabricated target files",()=>{
    expect(manifest.revision).toBe("a8bc2d54ff0ac92e78ff71431b1023eda42bf482");
    expect(manifest.license).toBe("CC0-1.0");
    expect(manifest.targets.length).toBe(846);
    expect(new Set(manifest.targets.map((t:{id:string})=>t.id)).size).toBe(846);
    expect(NATIVE_MAKEHUMAN_BODY_MODIFIERS.length).toBe(142);
    const ids=new Set(manifest.targets.map((t:{id:string})=>t.id));
    for(const c of BODY_CONTROLS) {
      if(c.positive)expect(ids.has(c.positive),c.id+" positive").toBe(true);
      if(c.negative)expect(ids.has(c.negative),c.id+" negative").toBe(true);
    }
  });
  it("preserves original MakeHuman signed and unipolar supported ranges",()=>{
    for(const c of BODY_CONTROLS.filter(c=>c.positive)){
      expect(c.nativeMin===-1||c.nativeMin===0).toBe(true);
      expect(c.nativeMax).toBe(1);
    }
    expect(()=>validateBodyWeights({"native/hip/hip-scale-horiz-decr-incr":-1.25})).not.toThrow();
    expect(()=>validateBodyWeights({"native/hip/hip-scale-horiz-decr-incr":-1.26})).toThrow();
    expect(()=>validateBodyWeights({"macro/muscle":NaN})).toThrow();
    expect(()=>validateBodyWeights({"macro/african":.7,"macro/asian":.7})).toThrow();
    expect(()=>validateBodyWeights({unexpected:1})).toThrow();
  });
  it("matches pinned MakeHuman native macro factor knots and ethnic coupling",()=>{
    expect(BODY_MACRO_DEFAULTS["macro/african"]).toBeCloseTo(1/3,12);
    expect(BODY_MACRO_DEFAULTS["macro/asian"]).toBeCloseTo(1/3,12);
    expect(BODY_MACRO_DEFAULTS["macro/caucasian"]).toBeCloseTo(1/3,12);
    const normalized=setBodyAncestryChannel({},"african",.7);
    expect(normalized["macro/african"]).toBe(.7);
    expect(normalized["macro/asian"]).toBeCloseTo(.15,12);
    expect(normalized["macro/caucasian"]).toBeCloseTo(.15,12);
    expect(()=>validateBodyWeights(normalized)).not.toThrow();
    expect(resolveBodyMacroFactors({}).size).toBe(0);
    const weight=resolveBodyMacroFactors({"macro/weight":1});
    expect([...weight.keys()].some(k=>k.startsWith("macrodetails/height/"))).toBe(false);
    expect([...weight.keys()].some(k=>k.startsWith("macrodetails/proportions/"))).toBe(false);
    const age=resolveBodyMacroFactors({"macro/age":.1875});
    expect(age.get("macrodetails/caucasian-male-child")).toBeCloseTo((.1875*5.333)/6,10);
    expect(age.get("macrodetails/caucasian-male-baby")).toBeCloseTo((1-.1875*5.333)/6,10);
    expect(resolveBodyMacroFactors({"macro/height":1}).get(
      "macrodetails/height/male-young-averagemuscle-averageweight-maxheight"))
      .toBeCloseTo(.5,8);
  });
  it("applies MakeHuman baby/child source deltas without an artificial young offset",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const samples=validateBodyAtlas(atlas,19158);
    const human=makeHuman();
    try{
      const controller=new MakeHumanBodyController(human,atlas);
      const original=Float32Array.from(human.mesh.geometry.getAttribute("position").array as ArrayLike<number>);
      const source=human.template.sourceVertexIds;
      const scale=human.template.conversionMetersPerSourceUnit;
      const races=["caucasian","african","asian"] as const;
      const sexes=["female","male"] as const;
      // Reference interpolation follows Human._setAgeVals at the immutable
      // pinned source revision, evaluated independently of the implementation.
      for(const age of [0,.01,.03,.05,.055,.06,.1875]){
        const baby=Math.max(0,1-age*5.333);
        const child=Math.max(0,Math.min(1,5.333*age));
        const factors=resolveBodyMacroFactors({"macro/age":age});
        expect([...factors].filter(([id])=>/macrodetails\/(?:african|asian|caucasian)-(?:male|female)-(?:baby|child|young)/.test(id))
          .every(([,weight])=>weight>=0)).toBe(true);
        const expected=new Float64Array(human.template.sourceVertexCount*3);
        for(const race of races)for(const sex of sexes)
          for(const [stage,weight] of [["baby",baby],["child",child]] as const){
            const id=`macrodetails/${race}-${sex}-${stage}`;
            expect(factors.get(id)??0).toBeCloseTo(weight/6,9);
            const target=samples.get(id)!;
            for(let j=0;j<target.rows.length;j+=4){
              const offset=target.rows[j]!*3;
              for(let axis=0;axis<3;axis++)
                expected[offset+axis]=(expected[offset+axis]??0)+
                  target.rows[j+axis+1]!*scale*weight/6;
            }
          }
        // Verify there is no -young source factor at an infant age; the
        // published MakeHuman .target files already reference base.obj.
        for(const race of races)for(const sex of sexes)
          expect(factors.has(`macrodetails/${race}-${sex}-young`)).toBe(false);
        const diagnostic=controller.apply({"macro/age":age});
        expect(diagnostic.finiteFailures).toBe(0);
        expect(diagnostic.seamMismatches).toBe(0);
        expect(diagnostic.invertedTriangles,"native infancy age "+age).toBeLessThan(250);
        const position=human.mesh.geometry.getAttribute("position");
        for(let i=0;i<position.count;i++){
          const offset=source[i]!*3;
          for(let axis=0;axis<3;axis++)
            expect(Math.abs(position.getComponent(i,axis)-
              original[i*3+axis]!-expected[offset+axis]!)).toBeLessThan(3e-6);
        }
      }
      const young=resolveBodyMacroFactors({"macro/age":.5});
      for(const race of races)for(const sex of sexes)
        expect(young.get(`macrodetails/${race}-${sex}-young`)).toBeCloseTo(1/6,9);
      controller.dispose();
    }finally{human.dispose();}
  },120_000);
  it("maps source endpoints exactly, with identical deltas on original UV duplicates",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const human=makeHuman();
    try{
      const ctrl=new MakeHumanBodyController(human,atlas);
      const geometry=human.mesh.geometry;
      const base=Float32Array.from(geometry.getAttribute("position").array as ArrayLike<number>);
      const originalFaces=Array.from(geometry.getIndex()!.array);
      const originalUvs=Array.from(geometry.getAttribute("uv").array);
      const originalSkin=Array.from(geometry.getAttribute("skinWeight").array);
      const atlasById=validateBodyAtlas(atlas,human.template.sourceVertexCount);
      for(const [control,targetId,value] of [
        ["native/armslegs/l-hand-fingers-length-decr-incr","armslegs/l-hand-fingers-length-incr",1],
        ["native/armslegs/l-hand-fingers-length-decr-incr","armslegs/l-hand-fingers-length-decr",-1],
        ["native/neck/neck-scale-horiz-decr-incr","neck/neck-scale-horiz-incr",1],
        ["native/hip/hip-scale-horiz-decr-incr","hip/hip-scale-horiz-decr",-1],
      ] as const){
        const target=atlasById.get(targetId)!;
        expect(target).toBeDefined();
        const sourceId=target.rows[0]!;
        const renderId=human.template.sourceVertexIds.indexOf(sourceId);
        expect(renderId).toBeGreaterThanOrEqual(0);
        const diagnostics=ctrl.apply({[control]:value});
        const position=geometry.getAttribute("position");
        for(let axis=0;axis<3;axis++){
          const expected=base[renderId*3+axis]!+
            target.rows[axis+1]!*human.template.conversionMetersPerSourceUnit;
          expect(Math.abs(position.getComponent(renderId,axis)-expected)).toBeLessThan(2e-6);
        }
        expect(diagnostics.finiteFailures).toBe(0);
        expect(diagnostics.seamMismatches).toBe(0);
      }
      ctrl.apply({});
      expect(Array.from(geometry.getAttribute("position").array)).toEqual(Array.from(base));
      expect(Array.from(geometry.getIndex()!.array)).toEqual(originalFaces);
      expect(Array.from(geometry.getAttribute("uv").array)).toEqual(originalUvs);
      expect(Array.from(geometry.getAttribute("skinWeight").array)).toEqual(originalSkin);
      ctrl.dispose();
      expect(()=>ctrl.apply({})).toThrow(/disposed/);
    }finally{human.dispose();}
  },120_000);
  it("refits C1 rest skeleton, inverse binds and semantic IK from source body displacement",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const human=makeHuman();
    try{
      const root=human.spike.character.root;
      root.updateMatrixWorld(true);
      const original=human.spike.skeleton.bones.map(b=>
        b.getWorldPosition(new THREE.Vector3()));
      const ctrl=new MakeHumanBodyController(human,atlas);
      const diagnostic=ctrl.apply({"native/measure/measure-upperarm-length-decr-incr":1});
      expect(diagnostic.affectedVertices).toBeGreaterThan(0);
      const alignment=getHumanMorphologyAlignment(human);
      expect(alignment).toBeDefined();
      expect(alignment!.chains.get("arm_left")!.upperMeters).toBeGreaterThan(.08);
      const changed=human.spike.skeleton.bones.some((bone,i)=>
        bone.getWorldPosition(new THREE.Vector3()).distanceTo(original[i]!)>1e-5);
      expect(changed).toBe(true);
      for(let i=0;i<human.spike.skeleton.bones.length;i++){
        const bone=human.spike.skeleton.bones[i]!;
        const m=bone.matrixWorld.clone().multiply(human.spike.skeleton.boneInverses[i]!);
        const e=m.elements;
        expect(e.every((v,j)=>Math.abs(v-(j%5===0?1:0))<1e-5)).toBe(true);
      }
      ctrl.apply({});
      root.updateMatrixWorld(true);
      human.spike.skeleton.bones.forEach((bone,i)=>{
        expect(bone.getWorldPosition(original[i]!.clone()).distanceTo(original[i]!))
          .toBeLessThan(1e-5);
      });
      ctrl.dispose();
    }finally{human.dispose();}
  },120_000);
  it("rejects a posed C1 skeleton before any geometry or inverse bind changes",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const human=makeHuman();
    try{
      const ctrl=new MakeHumanBodyController(human,atlas);
      const geometry=human.mesh.geometry;
      const positions=Array.from(geometry.getAttribute("position").array);
      const inverse=human.spike.skeleton.boneInverses.map(m=>m.clone());
      const bone=human.spike.skeleton.bones.find(b=>b.name.includes("shoulder")) ??
        human.spike.skeleton.bones[5]!;
      bone.rotation.x+=.3;
      human.spike.character.root.updateMatrixWorld(true);
      expect(()=>ctrl.apply({"native/neck/neck-scale-horiz-decr-incr":.6}))
        .toThrow(/neutral-pose rest skeleton/);
      expect(Array.from(geometry.getAttribute("position").array)).toEqual(positions);
      human.spike.skeleton.boneInverses.forEach((m,i)=>
        expect(m.elements).toEqual(inverse[i]!.elements));
      bone.rotation.x-=.3;
      human.spike.character.root.updateMatrixWorld(true);
      expect(ctrl.apply({}).finiteFailures).toBe(0);
      ctrl.dispose();
    }finally{human.dispose();}
  },120_000);
  it("keeps jaw-tip displacement in root-local coordinates after root rotation",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const a=makeHuman(),b=makeHuman();
    try{
      const aRoot=a.spike.character.root,bRoot=b.spike.character.root;
      bRoot.position.set(1.2,.4,-.8);
      bRoot.rotation.y=.72;
      bRoot.updateMatrixWorld(true);
      // The world-space landmark accompanies its character when the root moves.
      b.jawTipWorldRest?.applyMatrix4(bRoot.matrixWorld);
      const aCtrl=new MakeHumanBodyController(a,atlas);
      const bCtrl=new MakeHumanBodyController(b,atlas);
      const recipe={"native/neck/neck-scale-horiz-decr-incr":.8};
      aCtrl.apply(recipe);
      bCtrl.apply(recipe);
      // A second refit must not misclassify a moved neutral root as FK motion.
      aCtrl.apply(recipe);
      bCtrl.apply(recipe);
      expect(a.jawTipWorldRest).toBeDefined();
      expect(b.jawTipWorldRest).toBeDefined();
      const expected=a.jawTipWorldRest!.clone().applyMatrix4(bRoot.matrixWorld);
      expect(b.jawTipWorldRest!.distanceTo(expected)).toBeLessThan(1e-5);
      aCtrl.dispose();bCtrl.dispose();
    }finally{a.dispose();b.dispose();}
  },120_000);
  it("keeps infant age 0..0.1875 surface, source joints and IK aligned",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const instance=makeHuman();
    try {
      const rig=instance.sourceRig!;
      const ctrl=new MakeHumanBodyController(instance,atlas);
      const sourceIds=instance.template.sourceVertexIds;
      const scale=instance.template.conversionMetersPerSourceUnit;
      const targetMap=validateBodyAtlas(atlas,instance.template.sourceVertexCount);
      const base=Float32Array.from(instance.mesh.geometry.getAttribute("position").array as ArrayLike<number>);
      const head=instance.spike.graph.joints.find(j=>j.role==="head")!;
      const headBone=instance.spike.bones.get(head.id)!;
      const headRef=rig.joints[rig.bones.head!.head]!;
      const baseline=headBone.getWorldPosition(new THREE.Vector3());
      for(const age of [0,.01,.03,.05,.055,.06,.1,.1875]){
        const weights={"macro/age":age};
        const factors=resolveBodyMacroFactors(weights);
        const expectedDelta=new THREE.Vector3();
        for(const [id,amount] of factors){
          const target=targetMap.get(id)!;
          const rowMap=new Map<number,ArrayLike<number>>();
          for(let i=0;i<target.rows.length;i+=4)
            rowMap.set(target.rows[i]!,target.rows.slice(i+1,i+4));
          for(const source of headRef){
            const row=rowMap.get(source);
            if(row)expectedDelta.add(new THREE.Vector3(row[0]!,row[1]!,row[2]!)
              .multiplyScalar(amount*scale/headRef.length));
          }
        }
        const result=ctrl.apply(weights);
        expect(result.finiteFailures, "age "+age).toBe(0);
        expect(result.seamMismatches, "age "+age).toBe(0);
        const actual=headBone.getWorldPosition(new THREE.Vector3()).sub(baseline);
        expect(actual.distanceTo(expectedDelta), "age "+age+" exact head joint")
          .toBeLessThan(2e-5);
        const alignment=getHumanMorphologyAlignment(instance)!;
        for(const chain of alignment.chains.values()){
          expect(chain.upperMeters, "age "+age+" "+chain.id).toBeGreaterThan(1e-5);
          expect(chain.lowerMeters, "age "+age+" "+chain.id).toBeGreaterThan(1e-5);
        }
        expect(Array.from(instance.mesh.geometry.getAttribute("position").array))
          .not.toEqual(Array.from(base));
      }
      ctrl.apply({});
      expect(Array.from(instance.mesh.geometry.getAttribute("position").array))
        .toEqual(Array.from(base));
    }finally{instance.dispose();}
  },120_000);
  it("rolls back joints and geometry if IK registration rejects a staged morphology",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const human=makeHuman();
    try{
      const ctrl=new MakeHumanBodyController(human,atlas);
      const bones=human.spike.skeleton.bones;
      const oldPositions=bones.map(b=>b.position.clone());
      const oldInverse=human.spike.skeleton.boneInverses.map(m=>m.clone());
      const oldGeometry=Float32Array.from(human.mesh.geometry.getAttribute("position").array as ArrayLike<number>);
      const alignment=getHumanMorphologyAlignment(human);
      const joint=human.spike.graph.joints.find(j=>j.role==="wrist_left")!;
      const originalRole=joint.role;
      // Replace a role only in this owned fixture to deliberately invalidate
      // post-refit chain lookup, not to weaken any runtime acceptance threshold.
      (joint as {role:string}).role="unmapped_test_role";
      try{
        expect(()=>ctrl.apply({"macro/age":0})).toThrow(/Missing C3.3 chain joint/);
      }finally{(joint as {role:string}).role=originalRole;}
      expect(Array.from(human.mesh.geometry.getAttribute("position").array))
        .toEqual(Array.from(oldGeometry));
      bones.forEach((b,i)=>expect(b.position.distanceTo(oldPositions[i]!)).toBeLessThan(1e-7));
      human.spike.skeleton.boneInverses.forEach((m,i)=>
        expect(m.elements).toEqual(oldInverse[i]!.elements));
      expect(getHumanMorphologyAlignment(human)).toBe(alignment);
      expect(ctrl.apply({"macro/age":.05}).finiteFailures).toBe(0);
    }finally{human.dispose();}
  },120_000);
  it("uses insertion-order-independent macro factors and preserves neutral geometry",()=>{
    const atlas=JSON.parse(readFileSync("assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const human=makeHuman();
    try{
      const ctrl=new MakeHumanBodyController(human,atlas);
      const original=Array.from(human.mesh.geometry.getAttribute("position").array);
      expect(resolveBodyMacroFactors({}).size).toBe(0);
      const a=ctrl.apply(BODY_PRESETS.muscular!);
      expect(a.affectedVertices).toBeGreaterThan(0);
      const output=Array.from(human.mesh.geometry.getAttribute("position").array);
      const inverted=Object.fromEntries(Object.entries(BODY_PRESETS.muscular!).reverse());
      ctrl.apply(inverted);
      expect(Array.from(human.mesh.geometry.getAttribute("position").array)).toEqual(output);
      ctrl.apply({});
      expect(Array.from(human.mesh.geometry.getAttribute("position").array)).toEqual(original);
      expect(a.unsupportedExtrapolation).toBe(false);
      expect(ctrl.apply(BODY_PRESETS.stress!).unsupportedExtrapolation).toBe(true);
    }finally{human.dispose();}
  },120_000);
});
