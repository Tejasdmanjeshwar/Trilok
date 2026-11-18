import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  canonicalRigIdentity, canonicalSkeleton, createAnimationSampler,
  createAnatomyPreset, createReferenceBreathingClip,
  parseAnimationClip, serializeAnimationClip, validateAnimationClip,
  type AnimationClipV1,
} from "../packages/character-core/src/index";
import { createSkinningSpike } from "../apps/web/src/characters/geometry/SkinningSpike";
import { CanonicalAnimationPose } from "../apps/web/src/characters/runtime/CanonicalAnimationPose";

const fixture = () => {
  const graph = createAnatomyPreset({archetype:"human"});
  return {graph, clip:createReferenceBreathingClip(graph)};
};
const changed = (clip:AnimationClipV1, override:Partial<AnimationClipV1>) =>
  ({...clip,...override}) as AnimationClipV1;

describe("C6.1 canonical animation", () => {
  it("maps to exact existing C1 semantics, bind data and sockets", () => {
    const {graph,clip} = fixture();
    const skeleton = canonicalSkeleton(graph);
    expect(skeleton.joints).toBe(graph.joints);
    expect(skeleton.sockets).toBe(graph.sockets);
    expect(clip.rig).toEqual(canonicalRigIdentity(graph));
    expect(clip.tracks[0]!.jointId).toBe(graph.joints.find(j=>j.role==="chest")!.id);
    expect(clip.rootMotion).toBe("locked");
    expect(clip.source.kind).toBe("internal");
    validateAnimationClip(clip,graph);
  });
  it("samples precisely, with shortest-arc normalized quaternions and frame-rate independence", () => {
    const {graph,clip} = fixture();
    const sampler = createAnimationSampler(clip,graph);
    const a = sampler.sample(.5);
    const b = sampler.sample(.25 * 2);
    expect(a).toEqual(b);
    const q = a[0]!.rotation!;
    expect(Math.hypot(...q)).toBeCloseTo(1,12);
    expect(q[0]).toBeGreaterThan(0);
    expect(q[0]).toBeLessThan(clip.tracks[0]!.values[1]![0]!);
    expect(sampler.sample(-100)).toEqual(sampler.sample(0));
    expect(sampler.sample(100)).toEqual(sampler.sample(2));
    expect(() => sampler.sample(NaN)).toThrow();
    expect(sampler.sample(0)).toEqual(sampler.sample(2));
  });
  it("replays deterministically and survives JSON bake/parse round-trip", () => {
    const {graph,clip} = fixture();
    const json = serializeAnimationClip(clip,graph);
    expect(serializeAnimationClip(parseAnimationClip(json,graph),graph)).toBe(json);
    const from = createAnimationSampler(clip,graph);
    const to = createAnimationSampler(parseAnimationClip(json,graph),graph);
    const timestamps = [0,.01,.04,.18,.5,.9,1,1.4,1.99,2];
    expect(timestamps.map(s=>from.sample(s))).toEqual(timestamps.map(s=>to.sample(s)));
    expect(JSON.parse(json).source.creator).toBe("trilok");
  });
  it("rejects bad transforms, illegal root motion, bad metadata and hostile records", () => {
    const {graph,clip} = fixture();
    const track = clip.tracks[0]!;
    const invalid = (changes:Record<string,unknown>) =>
      changed(clip,{tracks:[{...track,...changes} as typeof track]});
    expect(() => validateAnimationClip(invalid({timesSeconds:[0,1,1]}),graph)).toThrow();
    expect(() => validateAnimationClip(invalid({values:[[0,0,0,1],[NaN,0,0,1],[0,0,0,1]]}),graph)).toThrow();
    expect(() => validateAnimationClip(invalid({values:[[0,0,0,1],[0,0,0,-1],[0,0,0,1]]}),graph)).toThrow();
    expect(() => validateAnimationClip(invalid({jointId:"unknown"}),graph)).toThrow();
    expect(() => validateAnimationClip(changed(clip,{tracks:[track,track]}),graph)).toThrow();
    expect(() => validateAnimationClip(invalid({channel:"translation"}),graph)).toThrow();
    expect(() => validateAnimationClip(changed(clip,{rig:{...clip.rig,bindPoseId:"bogus"}}),graph)).toThrow();
    expect(() => validateAnimationClip(changed(clip,{contacts:[{
      id:"bad",atSeconds:0,socketId:"unknown",kind:"grip",
    }]}),graph)).toThrow();
    expect(() => validateAnimationClip(changed(clip,{source:{...clip.source,
      kind:"external", origin:"https://example.com/../bad"}}),graph)).toThrow();
    expect(() => parseAnimationClip("{\"schemaVersion\":7}",graph)).toThrow();
  });
  it("rejects a different canonical hierarchy without silently retargeting", () => {
    const {graph,clip} = fixture();
    const other = createAnatomyPreset({archetype:"vanara"});
    expect(() => validateAnimationClip(clip,other)).toThrow(/bind mismatch/);
    const moved = {...graph,joints:graph.joints.map((j,i)=>
      i===0?{...j,bindTranslation:[0,1,0] as const}:j)};
    expect(() => validateAnimationClip(clip,moved)).toThrow(/bind mismatch/);
  });
  it("applies to the *existing* skinned skeleton, restores rest and disposes safely", () => {
    const rig = createSkinningSpike();
    const clip = createReferenceBreathingClip(rig.graph);
    const chestId = clip.tracks[0]!.jointId;
    const chest = rig.character.joint(chestId);
    const original = chest.quaternion.clone();
    const socket = rig.graph.sockets.find(s=>s.purpose==="primary_grip")!;
    const before = rig.character.socketWorld(socket.id).clone();
    const pose = new CanonicalAnimationPose(rig.character,clip);
    pose.apply(1);
    expect(chest.quaternion.angleTo(original)).toBeGreaterThan(.03);
    expect(rig.character.socketWorld(socket.id).elements.every(Number.isFinite)).toBe(true);
    pose.apply(0);
    expect(chest.quaternion.angleTo(original)).toBeLessThan(1e-7);
    expect(rig.character.socketWorld(socket.id).elements).toEqual(before.elements);
    pose.apply(.5);
    pose.dispose();
    expect(chest.quaternion.angleTo(original)).toBeLessThan(1e-7);
    expect(() => pose.apply(0)).toThrow(/disposed/);
    rig.dispose();
  });
  it("preserves exact permitted root visual translation without mutating combat state", () => {
    const rig = createSkinningSpike();
    const clip = createReferenceBreathingClip(rig.graph);
    const root = rig.graph.joints.find(j=>j.parentId===null)!;
    const translated:AnimationClipV1 = {...clip,rootMotion:"visual_only",
      tracks:[...clip.tracks,{channel:"translation",jointId:root.id,
        timesSeconds:[0,2],values:[[0,0,0],[0,.1,0]]}]};
    validateAnimationClip(translated,rig.graph);
    const object = rig.character.joint(root.id);
    const previous = object.position.clone();
    const view = new CanonicalAnimationPose(rig.character,translated);
    view.apply(1);
    expect(object.position.y-previous.y).toBeCloseTo(.05,10);
    view.dispose();
    expect(object.position.equals(previous)).toBe(true);
    rig.dispose();
  });
});
