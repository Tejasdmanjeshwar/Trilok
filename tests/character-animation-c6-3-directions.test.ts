import {describe,expect,it} from "vitest";
import {createAnatomyPreset,CanonicalLocomotionMixer} from "../packages/character-core/src/index";
import {loadStudioLocomotionLibrary,loadBakedStudioAnimation,registerKevinC63Review,STUDIO_ANIMATIONS} from "../apps/web/src/studio/StudioAnimationLibrary";
import kevinCatalog from "../assets/animations/sources/kevin-basic-motions-v1.json";
import {readFileSync} from "node:fs";

const graph=createAnatomyPreset({archetype:"human"});
const original=loadStudioLocomotionLibrary(graph);
const mapping=JSON.parse(readFileSync(
  "assets/animations/studio-v1/kevin/c63/locomotion-map.json","utf8")) as {
  schemaVersion:number;motions:{id:string;gait:"walk"|"jog"|"sprint";direction:string}[];
  turns:{id:string;direction:"left"|"right"}[];
};
const motions=mapping.motions.map(m=>({
  gait:m.gait,direction:m.direction as "forward"|"backward"|"left"|"right"|
    "forward-left"|"forward-right"|"backward-left"|"backward-right",
  clip:JSON.parse(readFileSync("assets/animations/studio-v1/kevin/c63/"+m.id+".clip.json","utf8")),
}));
const turns=mapping.turns.map(t=>({
  direction:t.direction,
  clip:JSON.parse(readFileSync("assets/animations/studio-v1/kevin/c63/"+t.id+".clip.json","utf8")),
}));
const canonicalLibrary={
  idle:loadBakedStudioAnimation("human-kevin-idle",graph),
  walk:loadBakedStudioAnimation("human-kevin-walk",graph),
  jog:loadBakedStudioAnimation("human-kevin-run",graph),
  sprint:motions.find(m=>m.gait==="sprint"&&m.direction==="forward")!.clip,
  motions,turns,
};
const intent=(forward:number,lateral=0,turn=0)=>({forward,lateral,turn,grounded:true});
describe("C6.3 authored directional locomotion",()=>{
  it("preserves all 19 approved loop categories and two one-shot turns",()=>{
    expect(mapping.schemaVersion).toBe(1);
    expect(mapping.motions).toHaveLength(19);
    expect(new Set(mapping.motions.map(m=>m.gait+":"+m.direction)).size).toBe(19);
    expect(mapping.turns.map(t=>t.direction)).toEqual(["left","right"]);
    const mixer=new CanonicalLocomotionMixer(graph,canonicalLibrary);
    expect(mixer.availableDirections).toHaveLength(10);
    mixer.dispose();
  });
  it("resolves simultaneous backward-lateral input to an authored diagonal, not backward",()=>{
    const mixer=new CanonicalLocomotionMixer(graph,canonicalLibrary);
    try{
      mixer.setIntent(intent(-.2,-.2));
      mixer.advance(.4);
      expect(mixer.blendWeights["motion:walk:backward-left"]).toBeGreaterThan(.5);
      expect(mixer.blendWeights["motion:walk:backward"]??0).toBeLessThan(.01);
      expect(mixer.blendWeights["motion:walk:left"]??0).toBeLessThan(.01);
    }finally{mixer.dispose();}
  });
  it("selects authored run and sprint families independently from direction",()=>{
    const mixer=new CanonicalLocomotionMixer(graph,canonicalLibrary);
    try{
      mixer.setIntent(intent(.0,-.95));
      mixer.advance(.5);
      expect(mixer.blendWeights["motion:sprint:left"]).toBeGreaterThan(.5);
      mixer.setIntent(intent(0,-.5));
      mixer.advance(.5);
      expect(mixer.blendWeights["motion:walk:left"]).toBeGreaterThan(0);
      expect(mixer.blendWeights["motion:jog:left"]).toBeGreaterThan(0);
      expect(()=>mixer.setIntent(intent(-1,0))).toThrow(/authored clip/);
    }finally{mixer.dispose();}
  });
  it("does not mislabel partial backward sprint as a source-backed directional clip",()=>{
    const mixer=new CanonicalLocomotionMixer(graph,canonicalLibrary);
    try{
      for(const [forward,lateral] of [[-1,0],[-.8,-.6],[-.35,-.93]]){
        expect(()=>mixer.setIntent(intent(forward!,lateral!))).toThrow(/authored clip/);
      }
      // Authored sprint-left remains supported at its exact direction.
      mixer.setIntent(intent(0,-1));
      mixer.advance(.15);
      expect(mixer.blendWeights["motion:sprint:left"]).toBeGreaterThan(0);
    }finally{mixer.dispose();}
  });
  it("plays a stationary turn once and does not restart while the same intent is held",()=>{
    const mixer=new CanonicalLocomotionMixer(graph,canonicalLibrary);
    try{
      mixer.setIntent(intent(0,0,-1));
      mixer.advance(1/30);
      expect(mixer.turnStatus?.running).toBe(true);
      for(let i=0;i<150;i++)mixer.advance(1/60);
      expect(mixer.turnStatus?.running??false).toBe(false);
      expect(mixer.blendWeights["turn:left"]??0).toBeLessThan(.01);
      mixer.advance(.2);
      expect(mixer.turnStatus?.running??false).toBe(false);
      mixer.setIntent(intent(0));
      mixer.advance(.02);
      mixer.setIntent(intent(0,0,1));
      mixer.advance(.02);
      expect(mixer.turnStatus?.direction).toBe("right");
      expect(mixer.turnStatus?.running).toBe(true);
    }finally{mixer.dispose();}
  });
  it("interrupts a running turn with the opposite source one-shot",()=>{
    const mixer=new CanonicalLocomotionMixer(graph,canonicalLibrary);
    try{
      mixer.setIntent(intent(0,0,-1));
      mixer.advance(.15);
      expect(mixer.turnStatus?.direction).toBe("left");
      mixer.setIntent(intent(0,0,1));
      mixer.advance(.02);
      expect(mixer.turnStatus?.direction).toBe("right");
      expect(mixer.turnStatus?.running).toBe(true);
      for(let i=0;i<180;i++)mixer.advance(1/60);
      expect(mixer.turnStatus?.running??false).toBe(false);
      mixer.advance(.25);
      expect(mixer.turnStatus?.running??false).toBe(false);
    }finally{mixer.dispose();}
  });
  it("keeps canonical quaternions finite and prevents authoritative travel",()=>{
    const mixer=new CanonicalLocomotionMixer(graph,canonicalLibrary);
    try{
      for(const [forward,lateral] of [[1,0],[.6,-.6],[-.5,.5],[0,1],[0,0]]){
        mixer.setIntent(intent(forward!,lateral!));
        for(let t=0;t<5;t++){
          for(const joint of mixer.advance(.04)){
            if(joint.rotation)expect(Math.abs(Math.hypot(...joint.rotation)-1)).toBeLessThan(1e-5);
            if(joint.translation)expect(joint.translation[2]).toBe(0);
          }
        }
      }
    }finally{mixer.dispose();}
  });
  it("lazy-promotes approved Kevin direction clips without bloating ordinary solo menus",()=>{
    const before=STUDIO_ANIMATIONS.map(option=>option.id);
    expect(before).not.toContain("human-kevin-walk-backward");
    registerKevinC63Review(kevinCatalog.c63ReviewClips.map(entry=>({
      id:entry.id,label:entry.label,
      clip:JSON.parse(readFileSync(
        "assets/animations/studio-v1/kevin/c63/"+entry.id+".clip.json","utf8")),
    })));
    expect(STUDIO_ANIMATIONS.map(option=>option.id)).toEqual(before);
    const promoted=loadStudioLocomotionLibrary(graph);
    expect(promoted.motions).toHaveLength(19);
    expect(promoted.turns).toHaveLength(2);
    const mixer=new CanonicalLocomotionMixer(graph,promoted);
    try{
      mixer.setIntent(intent(-.45,.45));
      mixer.advance(.3);
      expect(mixer.blendWeights["motion:walk:backward-right"]).toBeGreaterThan(0);
    }finally{mixer.dispose();}
  });
  it("retains independently approved UAL1 library sampling",()=>{
    const mixer=new CanonicalLocomotionMixer(graph,original);
    try{
      mixer.setIntent(intent(.5));
      expect(mixer.advance(1/60).length).toBeGreaterThan(40);
    }finally{mixer.dispose();}
  });
});
