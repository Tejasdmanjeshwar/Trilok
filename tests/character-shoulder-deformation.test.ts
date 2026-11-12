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
/** Headless CPU-skinned shoulder patch acceptance. A targeted mutation reverts
 * the connector translation while leaving its quaternion and source weights
 * unchanged, reproducing the old mismatched-pivot implementation. */
describe("C2.4 pinned CC0 shoulder/axilla geometry", () => {
  it("maintains a shared humeral pivot and measurably reduces peak surface tearing", () => {
    const { human, fk, rig, weights } = makeRig();
    try {
      const bands = new Map(SIDES.map(side => [side, region(human, weights, side)]));
      const neutral = human.mesh.geometry.getAttribute("position");
      const neutralSamples = new Map(SIDES.map(side => {
        const edge = bands.get(side)![0]!;
        return [side, { index:edge.a,
          rest:new THREE.Vector3().fromBufferAttribute(neutral,edge.a) }] as const;
      }));
      for (const side of SIDES) {
        const suffix = side === "left" ? ".R" : ".L";
        expect(rig.bones["shoulder01" + suffix]?.parent).toBe("clavicle" + suffix);
        expect(rig.bones["upperarm01" + suffix]?.parent).toBe("shoulder01" + suffix);
        expect(bands.get(side)!.length).toBe(716);
      }
      const restPositions = new Map(SIDES.map(side =>
        [side, human.spike.shoulderSkinBones!.get(side)!.position.clone()] as const));
      for (const name of ["tpose","raise","overhead","forward","adduct","elbow","torso","combined"]) {
        fk.apply(pose(human, name));
        const corrected = new Map(SIDES.map(side =>
          [side, measure(human, bands.get(side)!)] as const));
        const helperPositions = new Map(SIDES.map(side =>
          [side, human.spike.shoulderSkinBones!.get(side)!.position.clone()] as const));
        // Deliberate mutation: restore PR #24-style connector self-pivot,
        // without changing FK, helpers' quaternions, source weights, or mesh.
        for (const side of SIDES)
          human.spike.shoulderSkinBones!.get(side)!.position.copy(restPositions.get(side)!);
        human.spike.character.root.updateMatrixWorld(true);
        const mutated = new Map(SIDES.map(side =>
          [side, measure(human, bands.get(side)!)] as const));
        for (const side of SIDES)
          human.spike.shoulderSkinBones!.get(side)!.position.copy(helperPositions.get(side)!);
        human.spike.character.root.updateMatrixWorld(true);
        for (const side of SIDES) {
          const after = measure(human, bands.get(side)!);
          expect(after).toEqual(corrected.get(side));
          expect(Number.isFinite(after.max) && Number.isFinite(after.rms)).toBe(true);
          if (["raise","overhead","combined"].includes(name)) {
            // Source-geometry baseline: relative peak edge stretch decreases
            // when connector and semantic shoulder rotate about one pivot.
            expect(after.max, name+" "+side+" vs mismatched-pivot mutation")
              .toBeLessThan(mutated.get(side)!.max * .995);
          }
          // These are measured diagnostics, NOT a claim of visually
          // acceptable muscle volume or absence of self-intersections.
          expect(after.p95, name+" "+side+" edge p95").toBeLessThan(105);
        }
        expect(Math.abs(corrected.get("left")!.max -
          corrected.get("right")!.max), name+" bilateral peak").toBeLessThan(.1);
      }
      fk.apply([]);
      for (const side of SIDES) {
        const helper = human.spike.shoulderSkinBones!.get(side)!;
        expect(helper.position.distanceTo(restPositions.get(side)!)).toBeLessThan(1e-8);
        const sample = neutralSamples.get(side)!;
        expect(human.mesh.getVertexPosition(sample.index,new THREE.Vector3())
          .distanceTo(sample.rest)).toBeLessThan(1e-6);
        const metrics = measure(human,bands.get(side)!);
        expect(metrics.p95).toBeLessThan(.001);
        expect(metrics.max).toBeLessThan(.002);
      }
      const poses = pose(human,"combined");
      fk.apply(poses);
      const first = SIDES.map(side => measure(human,bands.get(side)!));
      fk.apply([...poses].reverse());
      expect(SIDES.map(side => measure(human,bands.get(side)!))).toEqual(first);
    } finally { human.dispose(); }
  });
});
