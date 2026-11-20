import {
  DEFAULT_HUMAN_HEAD_MORPHOLOGY,createHumanHeadRecipe,
} from "@trilok/character-core";
import {loadAnatomicalHuman,type AnatomicalHuman, type AnatomicalTimingSink} from "../characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology} from "../characters/geometry/HumanMorphology";
import {MakeHumanBodyController,loadBodyAtlas} from "../characters/geometry/MakeHumanBodyTargets";
import {MakeHumanFacialController,loadFacialAtlas,type FacialWeights} from
  "../characters/geometry/MakeHumanFacialTargets";
import {validateStudioMorphState,type StudioMorphState} from "./StudioMorphCatalog";

export type StudioHumanBuildStage =
  | "source" | "head-morph" | "body-atlas" | "body-morph"
  | "facial-atlas" | "facial-morph" | "complete";
export type StudioHumanBuildTiming=(stage:StudioHumanBuildStage,ms:number)=>void;

/** Owns one canonical Studio human. Reuses the exact pinned MakeHuman
 * source controllers; never silently approximate native source targets. */
export interface StudioHumanModel {
  readonly human:AnatomicalHuman;
  readonly sourceJawOpeningRadians:number;
  setFace(face:FacialWeights,accept:()=>boolean):Promise<boolean>;
  dispose():void;
}
export async function buildStudioHuman(state:StudioMorphState,
  signal?:AbortSignal,onTiming?:StudioHumanBuildTiming,
  onSourceTiming?:AnatomicalTimingSink,
  onStageStart?:(stage:StudioHumanBuildStage)=>void):Promise<StudioHumanModel>{
  validateStudioMorphState(state);
  const started=performance.now();
  const sourceStart=performance.now();
  onStageStart?.("source");
  const human=await loadAnatomicalHuman(signal,onSourceTiming);
  onTiming?.("source",performance.now()-sourceStart);
  let face:MakeHumanFacialController|undefined;
  let disposed=false;
  try {
    if(signal?.aborted)throw new Error("Preview superseded");
    if(Object.keys(state.shape).some(key=>
      state.shape[key as keyof typeof state.shape] !==
        DEFAULT_HUMAN_HEAD_MORPHOLOGY[key as keyof typeof state.shape])){
      onStageStart?.("head-morph");
      const start=performance.now();
      applyHumanMorphology(human,createHumanHeadRecipe(state.shape));
      onTiming?.("head-morph",performance.now()-start);
    }
    if(Object.keys(state.body).length){
      onStageStart?.("body-atlas");
      const atlasStart=performance.now();
      const atlas=await loadBodyAtlas();
      onTiming?.("body-atlas",performance.now()-atlasStart);
      if(signal?.aborted)throw new Error("Preview superseded");
      onStageStart?.("body-morph");
      const morphStart=performance.now();
      const body=new MakeHumanBodyController(human,atlas);
      try{body.apply(state.body);}finally{body.dispose();}
      onTiming?.("body-morph",performance.now()-morphStart);
    }
    if(Object.keys(state.face).length){
      onStageStart?.("facial-atlas");
      const atlasStart=performance.now();
      const atlas=await loadFacialAtlas();
      onTiming?.("facial-atlas",performance.now()-atlasStart);
      if(signal?.aborted)throw new Error("Preview superseded");
      face=new MakeHumanFacialController(human,atlas);
      onStageStart?.("facial-morph");
      const morphStart=performance.now();
      face.apply(state.face);
      onTiming?.("facial-morph",performance.now()-morphStart);
    }
    if(signal?.aborted)throw new Error("Preview superseded");
    onTiming?.("complete",performance.now()-started);
    return {
      human,
      get sourceJawOpeningRadians(){return face?.sourceJawOpeningRadians??0;},
      async setFace(weights,accept){
        if(disposed)throw new Error("Character preview has closed");
        // No in-place mutation after an awaited load unless the caller's
        // generation is still current. Older face edits must be invisible.
        const atlas=face?undefined:await loadFacialAtlas();
        if(disposed||!accept())return false;
        if(!face)face=new MakeHumanFacialController(human,atlas!);
        face.apply(weights);
        return true;
      },
      dispose(){
        if(disposed)return;
        disposed=true;face?.dispose();human.dispose();
      },
    };
  }catch(error){
    face?.dispose();human.dispose();throw error;
  }
}
