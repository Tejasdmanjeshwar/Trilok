import { describe, expect, it } from "vitest";
import {
  anatomyId, canonicalRecipeJSON, createAnatomyPreset, createCharacterRecipe,
  parseCharacterRecipe, recipeFingerprint, remainingCapabilities,
  validateAnatomicalGraph, validateCharacterInjuryState, validateCharacterRecipe,
  type AnatomicalGraphV1, type CharacterInjuryStateV1, type CharacterRecipeV1,
} from "../packages/character-core/src/index";

const mutate=(base:AnatomicalGraphV1,patch:Partial<AnatomicalGraphV1>):AnatomicalGraphV1=>
  ({...base,...patch});
const injury=(missingSegmentIds:readonly string[]=[]):CharacterInjuryStateV1=>({
  schemaVersion:1,characterInstanceId:"test_1",missingSegmentIds,
  severEvents:[],disfigurement:{},
});

describe("C1 pure semantic anatomy contracts",()=>{
  it("constructs deterministic humanoid, Rakshasa, Vanara, avian winged and animal-head descriptors",()=>{
    for(const archetype of ["human","rakshasa","vanara","jatayu","animal_head"] as const){
      const a=createAnatomyPreset({archetype});
      validateAnatomicalGraph(a);
      expect(a).toEqual(createAnatomyPreset({archetype}));
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      expect(a.coordinates).toBe("trilok-y-up-z-forward-meters");
      expect(a.joints.filter(j=>j.parentId===null)).toHaveLength(1);
      expect(a.segments.filter(s=>s.parentId===null)).toHaveLength(1);
    }
    const bird=createAnatomyPreset({archetype:"jatayu"});
    expect(bird.modules.filter(m=>m.kind==="wing")).toHaveLength(2);
    expect(bird.joints.some(j=>j.role==="shoulder_left")).toBe(true);
    expect(bird.joints.filter(j=>j.role==="wing_carpal_left")).toHaveLength(1);
    expect(createAnatomyPreset({archetype:"vanara"}).modules.some(m=>m.kind==="tail")).toBe(true);
  });
  it("supports four arms, additional legs and extra heads without duplicate IDs",()=>{
    const g=createAnatomyPreset({extraArmPairs:1,extraLegPairs:1,extraHeads:2});
    validateAnatomicalGraph(g);
    expect(g.modules.filter(m=>m.kind==="extra_arm")).toHaveLength(2);
    expect(g.modules.filter(m=>m.kind==="extra_leg")).toHaveLength(2);
    expect(g.modules.filter(m=>m.kind==="head")).toHaveLength(2);
    expect(g.sockets.filter(s=>s.purpose==="primary_grip")).toHaveLength(4);
    const ids=g.segments.map(s=>s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(anatomyId("arm[left,1]","palm")).toBe("root/arm[left,1]/palm");
    expect(()=>anatomyId("arm[left,1]","../palm")).toThrow();
    expect(()=>createAnatomyPreset({extraArmPairs:3})).toThrow();
  });
  it("preserves finite normalized local bind transforms, reference forward and neutral scale",()=>{
    const g=createAnatomyPreset();
    for(const j of g.joints){
      expect(j.bindTranslation.every(Number.isFinite)).toBe(true);
      expect(j.bindQuaternion).toEqual([0,0,0,1]);
      expect(j).not.toHaveProperty("scale");
    }
    const l=g.joints.find(j=>j.role==="clavicle_left")!;
    const r=g.joints.find(j=>j.role==="clavicle_right")!;
    expect(l.bindTranslation[0]).toBeCloseTo(-r.bindTranslation[0]);
    expect(l.bindTranslation[1]).toBeCloseTo(r.bindTranslation[1]);
  });
  it("rejects duplicate IDs, missing parents, cycles and invalid module ownership",()=>{
    const g=createAnatomyPreset();
    expect(()=>validateAnatomicalGraph(mutate(g,{segments:[...g.segments,g.segments[0]!]}))).toThrow(/duplicate/);
    expect(()=>validateAnatomicalGraph(mutate(g,{segments:g.segments.map((s,i)=>
      i===2?{...s,parentId:"root/humanoid[0]/not_found"}:s)}))).toThrow(/missing segment parent/);
    const a=g.segments[0]!, b=g.segments[1]!;
    expect(()=>validateAnatomicalGraph(mutate(g,{segments:g.segments.map(s=>
      s.id===a.id?{...s,parentId:b.id}:s)}))).toThrow();
    expect(()=>validateAnatomicalGraph(mutate(g,{modules:g.modules.map(m=>({
      ...m,segmentIds:m.segmentIds.slice(1)
    }))}))).toThrow(/orphan segment|module segment membership/);
  });
  it("rejects malformed quaternions, missing joint references and invalid sockets",()=>{
    const g=createAnatomyPreset(), joint=g.joints[1]!;
    expect(()=>validateAnatomicalGraph(mutate(g,{joints:g.joints.map(j=>
      j.id===joint.id?{...j,bindQuaternion:[0,0,0,2] as const}:j)}))).toThrow(/non-unit/);
    expect(()=>validateAnatomicalGraph(mutate(g,{joints:g.joints.map(j=>
      j.id===joint.id?{...j,parentId:"missing"}:j)}))).toThrow(/missing joint parent/);
    expect(()=>validateAnatomicalGraph(mutate(g,{sockets:[...g.sockets,g.sockets[0]!]}))).toThrow(/duplicate/);
    expect(()=>validateAnatomicalGraph(mutate(g,{sockets:g.sockets.map((s,i)=>
      i===0?{...s,parentJointId:"unknown"}:s)}))).toThrow(/socket owner/);
    expect(()=>validateAnatomicalGraph(mutate(g,{skinBindings:[{
      meshId:"skin",jointIds:["missing"],maxInfluencesPerVertex:4,
    }]}))).toThrow(/skin joint/);
    expect(()=>validateAnatomicalGraph(mutate(g,{severZones:[{
      id:"neck_cut",segmentId:"missing",seamLoopId:"loop",capAssetId:"cap",
    }]}))).toThrow(/sever root/);
  });
  it("validates sever metadata without pretending geometry cutting exists",()=>{
    const g=createAnatomyPreset(), hand=g.segments.find(s=>s.id.endsWith("/palm"))!;
    const cut=mutate(g,{severZones:[{id:"sever_hand",segmentId:hand.id,
      seamLoopId:"wrist_loop",capAssetId:"cap_wrist"}]});
    validateAnatomicalGraph(cut);
    validateCharacterInjuryState({
      ...injury([hand.id]),severEvents:[{id:"event0",zoneId:"sever_hand",turn:3}],
    },cut);
    expect(()=>validateCharacterInjuryState({
      ...injury(),severEvents:[{id:"event0",zoneId:"sever_hand",turn:3}],
    },cut)).toThrow(/missing segments/);
  });
  it("removes missing-hand capabilities and descendant capabilities without changing combat",()=>{
    const g=createAnatomyPreset();
    const hand=g.segments.find(s=>s.id.includes("arm[left,0]/palm"))!;
    const caps=remainingCapabilities(g,injury([hand.id]));
    expect(caps.has("grip_left0")).toBe(false);
    expect(caps.has("grip_right0")).toBe(true);
    expect(g.segments.find(s=>s.id===hand.id)!.capabilityIds).toContain("grip_left0");
    expect(()=>remainingCapabilities(g,injury(["no_such_segment"]))).toThrow();
  });
  it("canonicalizes recipes and retains a stable generator/seed fingerprint",()=>{
    const a:CharacterRecipeV1={...createCharacterRecipe("human",42),
      parameters:{waist:.41,shoulder:.7}};
    const b:CharacterRecipeV1={...a,parameters:{shoulder:.7,waist:.41}};
    expect(canonicalRecipeJSON(a)).toBe(canonicalRecipeJSON(b));
    expect(recipeFingerprint(a)).toBe(recipeFingerprint(b));
    expect(parseCharacterRecipe(canonicalRecipeJSON(a))).toEqual(b);
    expect(recipeFingerprint({...a,seed:43})).not.toBe(recipeFingerprint(a));
    expect(()=>validateCharacterRecipe({...a,seed:NaN})).toThrow();
    expect(()=>parseCharacterRecipe('{"schemaVersion":2}')).toThrow();
    expect(()=>parseCharacterRecipe("[]")).toThrow();
  });
});
