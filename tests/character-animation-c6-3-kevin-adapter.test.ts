import {describe,it,expect} from "vitest";
import {createAnatomyPreset} from "../packages/character-core/src/presets";
import {
  KEVIN_BASIC_MOTIONS_MALE_SOURCE, KEVIN_MALE_REQUIRED_SOURCE_BONES,
  KEVIN_SOURCE_ONLY_BONES, mapKevinMaleHumanoidJoints,
  validateKevinMaleRestLaterality,
} from "../apps/web/src/characters/animation/KevinHumanoidSkeletonAdapter";

const graph=createAnatomyPreset({archetype:"human"});
describe("C6.3 Kevin male FBX 7700 source-family mapping (asset-free)",()=>{
  it("accepts precisely the audited 56 source joints and maps 49 semantic C1 joints",()=>{
    const names=[...KEVIN_MALE_REQUIRED_SOURCE_BONES];
    expect(names).toHaveLength(56);
    const mappings=mapKevinMaleHumanoidJoints(graph,names);
    expect(mappings).toHaveLength(49);
    expect(new Set(mappings.map(m=>m.sourceId)).size).toBe(49);
    expect(new Set(mappings.map(m=>m.targetId)).size).toBe(49);
    expect(KEVIN_SOURCE_ONLY_BONES).toHaveLength(7);
    for(const name of KEVIN_SOURCE_ONLY_BONES)
      expect(mappings.some(m=>m.sourceId===name)).toBe(false);
    expect(KEVIN_BASIC_MOTIONS_MALE_SOURCE.clips).toHaveLength(3);
    expect(KEVIN_BASIC_MOTIONS_MALE_SOURCE.archiveSha256)
      .toBe("063d5e1822f85549d14035ef342b1feae45bac37962499a8b478c7eb997200cd");
  });
  it("maps source physical -X to C1 left for arms, feet and finger chains",()=>{
    const mappings=mapKevinMaleHumanoidJoints(graph,KEVIN_MALE_REQUIRED_SOURCE_BONES);
    const source=(role:string, side:"left"|"right")=>{
      const id=graph.joints.find(j=>j.role===role &&
        (role.startsWith("finger_")
          ? j.id.includes("arm["+side+",0]")
          : j.role.endsWith("_"+side)))?.id;
      return mappings.find(m=>m.targetId===id)?.sourceId;
    };
    expect(source("wrist_left","left")).toBe("B-hand.R");
    expect(source("wrist_right","right")).toBe("B-hand.L");
    expect(source("elbow_left","left")).toBe("B-forearm.R");
    expect(source("toe_left","left")).toBe("B-toe.R");
    expect(source("finger_index_0","left")).toBe("B-indexFinger01.R");
    expect(source("finger_little_2","right")).toBe("B-pinky03.L");
    expect(source("finger_thumb_1","left")).toBe("B-thumb02.R");
  });
  it("fails closed on missing, unexpected and repeated bone names",()=>{
    const names=[...KEVIN_MALE_REQUIRED_SOURCE_BONES];
    expect(()=>mapKevinMaleHumanoidJoints(graph,names.slice(1))).toThrow(/topology/);
    expect(()=>mapKevinMaleHumanoidJoints(graph,[...names.slice(1),"unknown"])).toThrow(/topology/);
    expect(()=>mapKevinMaleHumanoidJoints(graph,[...names,names[0]!])).toThrow(/Duplicate/);
  });
  it("checks measured side signs rather than guessing anatomical L/R labels",()=>{
    const sample=(sign=1)=>["hand","thigh","foot","indexFinger01","pinky01"]
      .flatMap(role=>[
        {id:"B-"+role+".R",worldPosition:[-sign,1,0] as const},
        {id:"B-"+role+".L",worldPosition:[sign,1,0] as const},
      ]);
    expect(()=>validateKevinMaleRestLaterality(sample())).not.toThrow();
    expect(()=>validateKevinMaleRestLaterality(sample(-1))).toThrow(/right\/left/);
  });
});
