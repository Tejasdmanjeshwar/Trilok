import {describe,expect,it} from "vitest";
import {createAnatomyPreset,CanonicalLocomotionMixer}
  from "../packages/character-core/src/index";
import {loadStudioLocomotionLibrary}
  from "../apps/web/src/studio/StudioAnimationLibrary";
import {createSkinningSpike}
  from "../apps/web/src/characters/geometry/SkinningSpike";
import {GroundedFootContacts}
  from "../apps/web/src/studio/GroundedFootContacts";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";

const graph=createAnatomyPreset({archetype:"human"});
const library=loadStudioLocomotionLibrary(graph);
describe("C6.3 locomotion foundation",()=>{
  it("keeps all four C6.2 baked motion assets and manifest hash identities immutable",()=>{
    const manifest=JSON.parse(readFileSync("assets/animations/studio-v1/manifest.json","utf8")) as
      {entries:{filename:string;artifactSha256:string}[]};
    expect(manifest.entries).toHaveLength(4);
    for(const entry of manifest.entries)
      expect(createHash("sha256").update(readFileSync("assets/animations/studio-v1/"+
        entry.filename)).digest("hex")).toBe(entry.artifactSha256);
  });
  it("blends speed bands without discontinuously resetting phase or translating the actor",()=>{
    const mixer=new CanonicalLocomotionMixer(graph,library);
    try{
      mixer.setIntent({forward:.26,lateral:0,turn:0,grounded:true});
      let last=mixer.gaitPhase;
      for(let i=0;i<100;i++){
        if(i===30)mixer.setIntent({forward:.55,lateral:0,turn:0,grounded:true});
        if(i===60)mixer.setIntent({forward:.95,lateral:0,turn:0,grounded:true});
        const pose=mixer.advance(1/60);
        expect(pose.length).toBeGreaterThan(40);
        for(const joint of pose){
          if(joint.rotation)expect(Math.abs(Math.hypot(...joint.rotation)-1)).toBeLessThan(1e-5);
          if(joint.translation)expect(joint.translation[2]).toBe(0);
        }
        const phase=mixer.gaitPhase;
        expect((phase-last+1)%1).toBeLessThan(.1);
        last=phase;
      }
      const weights=mixer.blendWeights;
      expect(weights.sprint).toBeGreaterThan(0);
      expect(Object.values(weights).reduce((a,b)=>a+b,0)).toBeCloseTo(1,5);
    }finally{mixer.dispose();}
  });
  it("rejects unsupported directions instead of spoofing gait from forward clips",()=>{
    const mixer=new CanonicalLocomotionMixer(graph,library);
    try{
      for(const intent of [
        {forward:-.5,lateral:0,turn:0,grounded:true},
        {forward:0,lateral:-.5,turn:0,grounded:true},
        {forward:0,lateral:.5,turn:0,grounded:true},
        {forward:0,lateral:0,turn:-.5,grounded:true},
        {forward:0,lateral:0,turn:.5,grounded:true},
      ])expect(()=>mixer.setIntent(intent)).toThrow(/authored clip/);
      expect(()=>mixer.setIntent({forward:2,lateral:0,turn:0,grounded:true})).toThrow();
      expect(()=>mixer.advance(Number.NaN)).toThrow();
    }finally{mixer.dispose();}
  });
  it("samples repeatably from phase with no frame-time-dependent random state",()=>{
    const a=new CanonicalLocomotionMixer(graph,library);
    const b=new CanonicalLocomotionMixer(graph,library);
    try{
      for(const mixer of [a,b])
        mixer.setIntent({forward:.64,lateral:0,turn:0,grounded:true});
      for(let i=0;i<40;i++)
        expect(a.advance(1/120)).toEqual(b.advance(1/120));
      expect(a.seek(.25)).toEqual(b.seek(.25));
    }finally{a.dispose();b.dispose();}
  });
  it("bounds contact correction and preserves the semantic actor root transform",()=>{
    const spike=createSkinningSpike();
    const root=spike.character.root;
    const before=root.matrix.toArray();
    const contact=new GroundedFootContacts(spike.character);
    try{
      for(let i=0;i<10;i++){
        const metrics=contact.apply(1/60,true);
        expect(metrics.plantedFeet).toBeGreaterThanOrEqual(0);
        expect(metrics.maxAnchorSlipMeters).toBeGreaterThanOrEqual(0);
        expect(metrics.maxPenetrationMeters).toBeGreaterThanOrEqual(0);
      }
      expect(root.matrix.toArray()).toEqual(before);
      contact.reset();
      expect(contact.apply(1/60,false).plantedFeet).toBe(0);
    }finally{contact.dispose();spike.dispose();}
  });
});
