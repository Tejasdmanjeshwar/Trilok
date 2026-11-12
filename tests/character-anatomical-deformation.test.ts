import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { parseAnatomicalOBJ, bindTemplateToSemanticRig } from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { AnatomicalFK, type JointTarget } from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import { validateSkinningSpike } from
  "../apps/web/src/characters/geometry/SkinningSpike";
import type { SourceRig, SourceWeights } from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

/**
 * Headless C2.4 deformation acceptance on the *actual pinned CC0 source*.
 * It deliberately examines deformed GPU-equivalent skin vertices, rather
 * than repeating an FK quaternion assertion against the implementation.
 * pnpm test fetches and hash-checks all three immutable CC0 files first.
 */
function loadRealHuman() {
  const asset=(name:string)=>readFileSync(
    new URL("../apps/web/public/anatomy/"+name,import.meta.url),"utf8");
  const template=parseAnatomicalOBJ(asset("makehuman-base.obj"),
    {includeGroups:["body"]});
  const rig=JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
  const weights=JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
  const human=bindTemplateToSemanticRig(template,{rig,weights});
  const fk=new AnatomicalFK(human.spike.graph,human.spike.bones,{
    jawTipWorldRest:human.jawTipWorldRest,
    forearmSkinBones:human.spike.forearmSkinBones,
    shoulderSkinBones:human.spike.shoulderSkinBones,
  });
  return {human,fk,weights};
}
type Side="left"|"right";

/** Select genuine wrist/hand transition vertices whose ORIGINAL source
 * weights are exclusively wrist + metacarpal segments of that same hand.
 * With no independent palm movement, ALL those source influences must undergo
 * the exact same rigid semantic-wrist transform, whatever their percentages.
 * This constraint is independent of any chosen twist/skin blend algorithm.
 */
function wristRigidVertices(human:ReturnType<typeof loadRealHuman>["human"],
  source:SourceWeights,side:Side):number[] {
  const suffix=side==="left"?".R":".L"; // pinned MakeHuman naming convention
  const all=new Map<number,string[]>();
  for(const [bone,entries] of Object.entries(source.weights)) {
    for(const [id,weight] of entries) {
      if(weight<=0)continue;
      let names=all.get(id);
      if(!names){names=[];all.set(id,names);}
      names.push(bone);
    }
  }
  const ids=new Set((source.weights["wrist"+suffix]??[])
    .filter(([,weight])=>weight>0.01)
    .map(([id])=>id)
    .filter(id=>{
      const owners=all.get(id)??[];
      return owners.length>0&&owners.every(name=>
        name==="wrist"+suffix||
        /^metacarpal[1-4]\.(L|R)$/.test(name)&&name.endsWith(suffix));
    }));
  const selected:number[]=[];
  human.template.sourceVertexIds.forEach((sourceId,renderId)=>{
    if(ids.has(sourceId))selected.push(renderId);
  });
  return selected;
}

describe("C2.4 pinned CC0 wrist geometric regression (no browser)",()=>{
  it("keeps the real wrist skin coincident with C1 wrist transforms under all test poses",()=>{
    const {human,fk,weights}=loadRealHuman();
    try {
      const {spike,mesh,template}=human;
      expect(human.rigDiagnostics?.unweightedVertices).toBe(0);
      expect(human.rigDiagnostics?.unmappedBones).toEqual([]);
      // Prior C2.4 forearm + shoulder helpers remain, but no wrist bridge.
      expect(spike.skeleton.bones.length).toBe(spike.graph.joints.length+4);
      validateSkinningSpike(spike);
      const wrists=new Map<Side,{
        vertexIndices:number[];
        restMatrix:THREE.Matrix4;
        bone:THREE.Bone;
      }>();
      for(const side of ["left","right"] as const){
        const joint=spike.graph.joints.find(j=>j.role==="wrist_"+side)!;
        const bone=spike.bones.get(joint.id)!;
        const vertexIndices=wristRigidVertices(human,weights,side);
        expect(vertexIndices.length,side+" CC0 wrist surface coverage")
          .toBeGreaterThanOrEqual(10);
        wrists.set(side,{vertexIndices,bone,
          restMatrix:bone.matrixWorld.clone()});
      }
      const neutral=new Map<number,THREE.Vector3>();
      const vertex=new THREE.Vector3();
      for(const {vertexIndices} of wrists.values()) {
        for(const i of vertexIndices){
          const rest=mesh.getVertexPosition(i,vertex).clone();
          neutral.set(i,rest);
          const sourceRest=new THREE.Vector3().fromBufferAttribute(
            template.geometry.getAttribute("position"),i);
          expect(rest.distanceTo(sourceRest),"CC0 neutral skin offset "+i)
            .toBeLessThan(0.00015);
        }
      }
      const command=(role:string,side:Side,motion:JointTarget["motion"],
        radians:number):JointTarget=>{
        const joint=spike.graph.joints.find(j=>j.role===role+"_"+side)!;
        return {jointId:joint.id,motion,radians};
      };
      const cases:readonly {name:string;commands:readonly JointTarget[]}[]=[
        {name:"wrist flexion",commands:[
          command("wrist","left","flexion",.7),
          command("wrist","right","flexion",-.7),
        ]},
        {name:"wrist deviation",commands:[
          command("wrist","left","abduction",.3),
          command("wrist","right","abduction",-.3),
        ]},
        {name:"pronation and wrist",commands:[
          command("elbow","left","rotation",1.1),
          command("elbow","right","rotation",-1.1),
          command("wrist","left","flexion",.6),
          command("wrist","right","flexion",-.6),
          command("wrist","left","abduction",.25),
          command("wrist","right","abduction",-.25),
        ]},
        {name:"elbow bend and wrist",commands:[
          command("elbow","left","flexion",1.2),
          command("elbow","right","flexion",1.2),
          command("wrist","left","flexion",.65),
          command("wrist","right","flexion",-.65),
        ]},
      ];
      let largestWristMotion=0;
      for(const testCase of cases){
        fk.apply(testCase.commands);
        spike.character.root.updateWorldMatrix(true,true);
        for(const [side,{vertexIndices,bone,restMatrix}] of wrists){
          // Independent geometric oracle: the entire wrist/metacarpal-only
          // source patch must follow the current *semantic wrist* rigidly.
          const transform=bone.matrixWorld.clone()
            .multiply(restMatrix.clone().invert());
          for(const i of vertexIndices){
            const expected=neutral.get(i)!.clone().applyMatrix4(transform);
            const actual=mesh.getVertexPosition(i,new THREE.Vector3());
            const error=actual.distanceTo(expected);
            expect(error,side+" "+testCase.name+" wrist surface vertex "+i)
              .toBeLessThan(.00015);
            largestWristMotion=Math.max(largestWristMotion,
              actual.distanceTo(neutral.get(i)!));
          }
        }
      }
      expect(largestWristMotion).toBeGreaterThan(.005);
      // Repeated neutral commands must restore the original *surface*, not
      // merely the per-bone quaternions and inverse bind matrices.
      fk.apply([]);
      spike.character.root.updateWorldMatrix(true,true);
      for(const [i,point]of neutral){
        const restored=mesh.getVertexPosition(i,new THREE.Vector3());
        expect(restored.distanceTo(point),"neutral skin recovery "+i)
          .toBeLessThan(.00015);
      }
    }finally {human.dispose();}
  },60_000);

  it("detects deliberately misweighted CC0 wrist geometry even with normalized weights",()=>{
    const {human,fk,weights}=loadRealHuman();
    try{
      const {spike,mesh}=human;
      const side:Side="left";
      const vertices=wristRigidVertices(human,weights,side);
      expect(vertices.length).toBeGreaterThanOrEqual(10);
      const joint=spike.graph.joints.find(j=>j.role==="wrist_"+side)!;
      const bone=spike.bones.get(joint.id)!;
      const elbow=spike.graph.joints.find(j=>j.role==="elbow_"+side)!;
      const elbowIndex=spike.graph.joints.indexOf(elbow);
      const neutral=vertices.map(i=>mesh.getVertexPosition(i,new THREE.Vector3()).clone());
      const rest=bone.matrixWorld.clone();
      fk.apply([{jointId:joint.id,motion:"flexion",radians:.75}]);
      spike.character.root.updateWorldMatrix(true,true);
      const transform=bone.matrixWorld.clone().multiply(rest.invert());
      const skinIndex=mesh.geometry.getAttribute("skinIndex");
      const skinWeight=mesh.geometry.getAttribute("skinWeight");
      let largestError=0;
      for(let n=0;n<vertices.length;n++){
        const i=vertices[n]!;
        const originalIndices=[0,1,2,3].map(k=>skinIndex.getComponent(i,k));
        const originalWeights=[0,1,2,3].map(k=>skinWeight.getComponent(i,k));
        try{
          // Simulate the previous regression's class of error: the source
          // wrist patch is reassigned to a transform that doesn't follow
          // full C1 wrist flexion. This still has FOUR normalized influences.
          for(let k=0;k<4;k++){
            skinIndex.setComponent(i,k,k===0?elbowIndex:0);
            skinWeight.setComponent(i,k,k===0?1:0);
          }
          const actual=mesh.getVertexPosition(i,new THREE.Vector3());
          const expected=neutral[n]!.clone().applyMatrix4(transform);
          largestError=Math.max(largestError,actual.distanceTo(expected));
        }finally{
          for(let k=0;k<4;k++){
            skinIndex.setComponent(i,k,originalIndices[k]!);
            skinWeight.setComponent(i,k,originalWeights[k]!);
          }
        }
      }
      expect(largestError,"geometric guard must detect skin-to-bone separation")
        .toBeGreaterThan(.002);
      validateSkinningSpike(spike);
    }finally{human.dispose();}
  },60_000);
});


/** The real wrist band is not wrist-only: source lowerarm01 and lowerarm02
 * overlap wrist/metacarpals. The elbow-flexion parent transform MUST move
 * every descendant vertex rigidly even when wrist and fingers are posed.
 * PR #27's exclusive wrist/metacarpal selection excluded this failure area.
 */
function elbowWristTransitionVertices(
  human: ReturnType<typeof loadRealHuman>["human"],
  weights: SourceWeights, side: Side,
): number[] {
  const suffix = side === "left" ? ".R" : ".L";
  const wrist = new Set((weights.weights["wrist" + suffix] ?? [])
    .filter(([, w]) => w > 0).map(([id]) => id));
  const forearm = new Set((weights.weights["lowerarm01" + suffix] ?? [])
    .filter(([, w]) => w > 0).map(([id]) => id));
  const candidate = new Set([...wrist].filter(id => forearm.has(id)));
  // Only include vertices whose entire source owner chain is beneath the
  // semantic elbow (or its proximal sibling). No upper-arm owner can satisfy
  // the rigid-elbow oracle.
  const owners = new Map<number, string[]>();
  for (const [name, entries] of Object.entries(weights.weights)) {
    for (const [id, w] of entries) {
      if (w <= 0 || !candidate.has(id)) continue;
      const list = owners.get(id) ?? [];
      list.push(name); owners.set(id, list);
    }
  }
  const allowed = /^(lowerarm01|lowerarm02|wrist|metacarpal[1-4]|finger[1-5]-[1-3])\.(L|R)$/;
  const ids = new Set([...candidate].filter(id =>
    (owners.get(id) ?? []).every(name => allowed.test(name) && name.endsWith(suffix))));
  const vertices: number[] = [];
  human.template.sourceVertexIds.forEach((id, renderIndex) => {
    if (ids.has(id)) vertices.push(renderIndex);
  });
  return vertices;
}

describe("C2.4 full CC0 forearm/wrist transition geometry", () => {
  it("matches the independent rigid elbow oracle throughout both wrist bands and finger poses", () => {
    const { human, fk, weights } = loadRealHuman();
    try {
      const { spike, mesh } = human;
      const sides = (["left", "right"] as const).map(side => {
        const joint = spike.graph.joints.find(j => j.role === "elbow_" + side)!;
        const wrist = spike.graph.joints.find(j => j.role === "wrist_" + side)!;
        const vertices = elbowWristTransitionVertices(human, weights, side);
        expect(vertices.length, side + " real CC0 mixed forearm/wrist skin")
          .toBeGreaterThanOrEqual(30);
        return { side, elbow: joint, wrist, bone: spike.bones.get(joint.id)!,
          vertices, helper: spike.forearmSkinBones!.get(side)! };
      });
      const target = (id: string, motion: JointTarget["motion"],
        radians: number): JointTarget => ({ jointId: id, motion, radians });
      const finger = (side: Side, digit: string, index: number,
        motion: JointTarget["motion"], radians: number): JointTarget => {
        const joint = spike.graph.joints.find(j =>
          j.role === "finger_" + digit + "_" + index &&
          j.id.includes("arm[" + side + ","))!;
        return target(joint.id, motion, radians);
      };
      const cases = [
        { name: "neutral wrist", commands: [] as JointTarget[] },
        { name: "flexion and deviation", commands: sides.flatMap(s => [
          target(s.wrist.id, "flexion", s.side === "left" ? .65 : -.65),
          target(s.wrist.id, "abduction", s.side === "left" ? .22 : -.22),
        ]) },
        { name: "wrist, fist and thumb opposition", commands: [
          ...sides.flatMap(s => [
            target(s.wrist.id, "flexion", .55),
            target(s.wrist.id, "abduction", s.side === "left" ? .2 : -.2),
            finger(s.side, "thumb", 0, "opposition", .65),
            finger(s.side, "thumb", 0, "flexion", .3),
            finger(s.side, "index", 0, "flexion", 1.1),
            finger(s.side, "index", 1, "flexion", 1.1),
            finger(s.side, "middle", 0, "flexion", 1.1),
          ]),
        ] },
      ];
      const point = (i: number) => mesh.getVertexPosition(i, new THREE.Vector3());
      for (const testCase of cases) {
        fk.apply(testCase.commands);
        spike.character.root.updateWorldMatrix(true, true);
        const baseline = sides.map(s => ({
          ...s, world: s.bone.matrixWorld.clone(),
          positions: s.vertices.map(i => point(i)),
        }));
        const flexCommands = [
          ...testCase.commands,
          ...sides.map(s => target(s.elbow.id, "flexion", 1.1)),
        ];
        fk.apply(flexCommands);
        spike.character.root.updateWorldMatrix(true, true);
        for (const s of baseline) {
          // Source lowerarm01 and distal wrist are both children of shoulder;
          // bend applied *only* to elbow must rigidly transport the entire
          // skin patch. This is independent of the weighting implementation.
          const delta = s.bone.matrixWorld.clone().multiply(s.world.clone().invert());
          let worst = 0;
          let actualMotion = 0;
          for (let k = 0; k < s.vertices.length; k++) {
            const predicted = s.positions[k]!.clone().applyMatrix4(delta);
            const actual = point(s.vertices[k]!);
            worst = Math.max(worst, predicted.distanceTo(actual));
            actualMotion = Math.max(actualMotion, actual.distanceTo(s.positions[k]!));
          }
          expect(worst, s.side + " " + testCase.name + " wrist-to-forearm alignment")
            .toBeLessThan(.00015);
          expect(actualMotion).toBeGreaterThan(.005);
        }
      }
      // A mutation recreating the exact PR #26 class of error (50% elbow
      // flexion on the mixed lowerarm01 region) must fail the geometric test.
      fk.apply([]);
      spike.character.root.updateWorldMatrix(true, true);
      const left = sides[0]!;
      const rest = left.bone.matrixWorld.clone();
      const restPoints = left.vertices.map(i => point(i));
      fk.apply([target(left.elbow.id, "flexion", 1.1)]);
      spike.character.root.updateWorldMatrix(true, true);
      const transform = left.bone.matrixWorld.clone().multiply(rest.invert());
      const oldQuaternion = left.helper.quaternion.clone();
      try {
        left.helper.quaternion.copy(fk.frames.get(left.elbow.id)!.rest)
          .slerp(left.bone.quaternion, .5);
        spike.character.root.updateWorldMatrix(true, true);
        let error = 0;
        for (let k = 0; k < left.vertices.length; k++)
          error = Math.max(error, point(left.vertices[k]!).distanceTo(
            restPoints[k]!.clone().applyMatrix4(transform)));
        expect(error, "half-elbow-flexion regression must move actual CC0 wrist skin")
          .toBeGreaterThan(.002);
      } finally {
        left.helper.quaternion.copy(oldQuaternion);
      }
      fk.apply([]);
      spike.character.root.updateWorldMatrix(true, true);
      for (let k = 0; k < left.vertices.length; k++)
        expect(point(left.vertices[k]!).distanceTo(restPoints[k]!))
          .toBeLessThan(.00015);
    } finally { human.dispose(); }
  }, 60_000);

  it("retains finite, deterministic CPU-skinned surfaces for bilateral twist and wrist poses", () => {
    const { human, fk, weights } = loadRealHuman();
    try {
      const { spike, mesh } = human;
      const samples = (["left", "right"] as const).flatMap(side =>
        elbowWristTransitionVertices(human, weights, side));
      expect(samples.length).toBeGreaterThanOrEqual(60);
      const pose = (role: string, side: Side, motion: JointTarget["motion"],
        radians: number): JointTarget => ({
          jointId: spike.graph.joints.find(j => j.role === role + "_" + side)!.id,
          motion, radians,
        });
      for (const angle of [-.85, .85]) {
        const commands = (["left", "right"] as const).flatMap(side => [
          pose("elbow", side, "rotation", angle),
          pose("wrist", side, "flexion", .55),
          pose("wrist", side, "abduction", .22),
        ]);
        fk.apply(commands);
        spike.character.root.updateWorldMatrix(true, true);
        const once = samples.map(i => mesh.getVertexPosition(i, new THREE.Vector3()).clone());
        fk.apply([...commands].reverse());
        spike.character.root.updateWorldMatrix(true, true);
        samples.forEach((i, n) => {
          const p = mesh.getVertexPosition(i, new THREE.Vector3());
          expect(p.toArray().every(Number.isFinite)).toBe(true);
          expect(p.distanceTo(once[n]!)).toBeLessThan(1e-7);
        });
      }
      fk.apply([]);
      spike.character.root.updateWorldMatrix(true, true);
      for (const i of samples) {
        const actual = mesh.getVertexPosition(i, new THREE.Vector3());
        const rest = new THREE.Vector3().fromBufferAttribute(
          mesh.geometry.getAttribute("position"), i);
        expect(actual.distanceTo(rest)).toBeLessThan(.00015);
      }
    } finally { human.dispose(); }
  }, 60_000);
});
