import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bindTemplateToSemanticRig, parseAnatomicalOBJ } from
  "../apps/web/src/characters/geometry/AnatomicalTemplate";
import { AnatomicalFK, type AnatomicalMotion, type JointTarget } from
  "../apps/web/src/characters/geometry/AnatomicalFK";
import type { SourceRig, SourceWeights } from
  "../apps/web/src/characters/geometry/OfficialHumanRig";

type Side = "left" | "right";
const SIDES = ["left", "right"] as const;
const asset = (file: string): string => readFileSync(
  new URL("../apps/web/public/anatomy/" + file, import.meta.url), "utf8");
function makeRig() {
  const template = parseAnatomicalOBJ(asset("makehuman-base.obj"),
    { includeGroups: ["body"] });
  const rig = JSON.parse(asset("makehuman-default.mhskel")) as SourceRig;
  const weights = JSON.parse(asset("makehuman-default_weights.mhw")) as SourceWeights;
  const human = bindTemplateToSemanticRig(template, { rig, weights });
  const fk = new AnatomicalFK(human.spike.graph, human.spike.bones, {
    jawTipWorldRest: human.jawTipWorldRest,
    forearmSkinBones: human.spike.forearmSkinBones,
    shoulderSkinBones: human.spike.shoulderSkinBones,
  });
  return { human, fk, rig, weights };
}
function target(human: ReturnType<typeof makeRig>["human"],
  role: string, motion: AnatomicalMotion, radians: number): JointTarget {
  const joint = human.spike.graph.joints.find(j => j.role === role);
  if (!joint) throw new Error("Missing C1 role " + role);
  return { jointId: joint.id, motion, radians };
}
function pose(human: ReturnType<typeof makeRig>["human"], name: string): JointTarget[] {
  const commands: JointTarget[] = [];
  const add = (role: string, motion: AnatomicalMotion, angle: number) =>
    commands.push(target(human, role, motion, angle));
  for (const side of SIDES) {
    if (name === "tpose") add("shoulder_" + side, "abduction", .8);
    if (name === "raise") {
      add("clavicle_" + side, "abduction", .22);
      add("shoulder_" + side, "abduction", 1.5);
    }
    if (name === "overhead") add("shoulder_" + side, "abduction", 2.35);
    if (name === "forward") add("shoulder_" + side, "flexion", 1.5);
    if (name === "adduct") add("shoulder_" + side, "abduction", -.3);
    if (name === "elbow") {
      add("shoulder_" + side, "abduction", 1.5);
      add("elbow_" + side, "flexion", 1.8);
    }
    if (name === "combined") {
      add("clavicle_" + side, "abduction", .22);
      add("shoulder_" + side, "flexion", .75);
      add("shoulder_" + side, "abduction", 1.35);
      add("elbow_" + side, "flexion", 1.5);
      add("elbow_" + side, "rotation", side === "left" ? .7 : -.7);
      add("wrist_" + side, "flexion", .3);
    }
    if (name === "torso") {
      add("shoulder_" + side, "abduction", 1.5);
    }
  }
  if (name === "torso") {
    add("chest", "rotation", .35);
    add("spine_lower", "rotation", .3);
  }
  return commands;
}
function region(human: ReturnType<typeof makeRig>["human"],
  weights: SourceWeights, side: Side) {
  const suffix = side === "left" ? ".R" : ".L";
  const ids = new Set((weights.weights["shoulder01" + suffix] ?? [])
    .filter(([, w]) => w > .01).map(([id]) => id));
  const sourceIds = human.template.sourceVertexIds;
  const indices = human.mesh.geometry.getIndex()!;
  const seen = new Set<string>();
  const edges: { a: number; b: number; rest: number }[] = [];
  const rest = human.mesh.geometry.getAttribute("position");
  function add(a: number, b: number) {
    const x = sourceIds[a]!, y = sourceIds[b]!;
    if (x === y || !ids.has(x) || !ids.has(y)) return;
    const key = Math.min(x, y) + ":" + Math.max(x, y);
    if (seen.has(key)) return;
    seen.add(key);
    const length = new THREE.Vector3().fromBufferAttribute(rest, a)
      .distanceTo(new THREE.Vector3().fromBufferAttribute(rest, b));
    if (length > .001) edges.push({ a, b, rest: length });
  }
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
    add(a, b); add(b, c); add(c, a);
  }
  if (edges.length < 300) throw new Error("Shoulder source patch too small " + edges.length);
  return edges;
}
function measure(human: ReturnType<typeof makeRig>["human"],
  edges: ReturnType<typeof region>) {
  const sample = new Map<number, THREE.Vector3>();
  const point = (i: number) => {
    let p = sample.get(i);
    if (!p) { p = human.mesh.getVertexPosition(i, new THREE.Vector3()); sample.set(i, p); }
    return p;
  };
  const errors = edges.map(e =>
    Math.abs(point(e.a).distanceTo(point(e.b)) / e.rest - 1)).sort((a,b) => a - b);
  const rms = Math.sqrt(errors.reduce((sum,x)=>sum+x*x,0)/errors.length);
  return { rms: +(rms * 100).toFixed(3),
    p95: +(errors[Math.floor(errors.length * .95)]! * 100).toFixed(3),
    max: +(errors.at(-1)! * 100).toFixed(3) };
}
function connectorPose(human: ReturnType<typeof makeRig>["human"],
  fraction: number, anchored: boolean) {
  for (const side of SIDES) {
    const joint = human.spike.graph.joints.find(j => j.role === "shoulder_" + side)!;
    const shoulder = human.spike.bones.get(joint.id)!;
    const helper = human.spike.shoulderSkinBones!.get(side)!;
    const rest = new THREE.Quaternion();
    const delta = shoulder.quaternion.clone();
    const partial = rest.clone().slerp(delta, fraction);
    const restPos = new THREE.Vector3(
      // calibrated source shoulder01 is the bind position, not the posed one
      ...helper.userData["shoulderAuditRestPosition"] as [number,number,number]);
    helper.quaternion.copy(partial);
    helper.position.copy(restPos);
    if (anchored) {
      const offset = shoulder.position.clone().sub(restPos);
      helper.position.add(offset.clone().sub(offset.applyQuaternion(partial)));
    }
  }
  human.spike.character.root.updateMatrixWorld(true);
}

describe("C2.4 experimental CC0 shoulder skinning geometry audit", () => {
  it("measures source shoulder-girdle surface strain across connector pivots", () => {
    const { human, fk, rig, weights } = makeRig();
    try {
      for (const side of SIDES) {
        const suffix = side === "left" ? ".R" : ".L";
        expect(rig.bones["shoulder01" + suffix]?.parent).toBe("clavicle" + suffix);
        expect(rig.bones["upperarm01" + suffix]?.parent).toBe("shoulder01" + suffix);
        const h = human.spike.shoulderSkinBones!.get(side)!;
        h.userData["shoulderAuditRestPosition"] = h.position.toArray();
      }
      const bands = new Map(SIDES.map(side => [side, region(human, weights, side)]));
      console.info("SHOULDER AUDIT source patch edges",
        [...bands].map(([side, edges]) => side + ":" + edges.length).join(" "));
      for (const name of ["neutral","tpose","raise","overhead","forward","adduct","elbow","torso","combined"]) {
        fk.apply(pose(human, name));
        for (const fraction of [0, .25, .5, .75, 1]) {
          for (const anchored of [false,true]) {
            connectorPose(human, fraction, anchored);
            const results = SIDES.map(side => measure(human, bands.get(side)!));
            console.info("SHOULDER AUDIT", JSON.stringify({name,fraction,anchored,
              left:results[0],right:results[1]}));
          }
        }
      }
      fk.apply([]);
      connectorPose(human, .5, false);
      for (const side of SIDES)
        expect(measure(human, bands.get(side)!).max).toBeLessThan(.001);
    } finally { human.dispose(); }
  });
});
