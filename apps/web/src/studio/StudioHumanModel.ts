import {
  DEFAULT_HUMAN_HEAD_MORPHOLOGY,createHumanHeadRecipe,
} from "@trilok/character-core";
import {loadAnatomicalHuman,type AnatomicalHuman} from "../characters/geometry/AnatomicalTemplate";
import {applyHumanMorphology} from "../characters/geometry/HumanMorphology";
import {MakeHumanBodyController,loadBodyAtlas} from "../characters/geometry/MakeHumanBodyTargets";
import {MakeHumanFacialController,loadFacialAtlas,type FacialWeights} from
  "../characters/geometry/MakeHumanFacialTargets";
import {validateStudioMorphState,type StudioMorphState} from "./StudioMorphCatalog";

/** Owns only a single human instance. Both Studio and Lab use these exact
 * source controllers; never silently approximate native MakeHuman targets. */
export interface StudioHumanModel {
  readonly human:AnatomicalHuman;
  readonly sourceJawOpeningRadians:number;
  setFace(face:FacialWeights,accept:()=>boolean):Promise<boolean>;
  dispose():void;
}
export async function buildStudioHuman(state:StudioMorphState,
  signal?:AbortSignal):Promise<StudioHumanModel>{
  validateStudioMorphState(state);
  const human=await loadAnatomicalHuman(signal);
  let face:MakeHumanFacialController|undefined;
  let disposed=false;
  try {
    if(signal?.aborted)throw new Error("Preview superseded");
    if(Object.keys(state.shape).some(key=>
      state.shape[key as keyof typeof state.shape] !==
        DEFAULT_HUMAN_HEAD_MORPHOLOGY[key as keyof typeof state.shape])){
      applyHumanMorphology(human,createHumanHeadRecipe(state.shape));
    }
    if(Object.keys(state.body).length){
      const atlas=await loadBodyAtlas();
      if(signal?.aborted)throw new Error("Preview superseded");
      const body=new MakeHumanBodyController(human,atlas);
      try{body.apply(state.body);}finally{body.dispose();}
    }
    if(Object.keys(state.face).length){
      const atlas=await loadFacialAtlas();
      if(signal?.aborted)throw new Error("Preview superseded");
      face=new MakeHumanFacialController(human,atlas);
      face.apply(state.face);
    }
    if(signal?.aborted)throw new Error("Preview superseded");
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
