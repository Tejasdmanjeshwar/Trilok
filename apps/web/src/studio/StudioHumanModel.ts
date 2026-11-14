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
  setFace(face:FacialWeights):Promise<void>;
  dispose():void;
}
export async function buildStudioHuman(state:StudioMorphState):Promise<StudioHumanModel>{
  validateStudioMorphState(state);
  const human=await loadAnatomicalHuman();
  let face:MakeHumanFacialController|undefined;
  let disposed=false;
  try {
    if(Object.keys(state.shape).some(key=>
      state.shape[key as keyof typeof state.shape] !==
        DEFAULT_HUMAN_HEAD_MORPHOLOGY[key as keyof typeof state.shape])){
      applyHumanMorphology(human,createHumanHeadRecipe(state.shape));
    }
    if(Object.keys(state.body).length){
      const atlas=await loadBodyAtlas();
      const body=new MakeHumanBodyController(human,atlas);
      try{body.apply(state.body);}finally{body.dispose();}
    }
    if(Object.keys(state.face).length){
      face=new MakeHumanFacialController(human,await loadFacialAtlas());
      face.apply(state.face);
    }
    return {
      human,
      async setFace(weights){
        if(disposed)throw new Error("Character preview has closed");
        if(!face)face=new MakeHumanFacialController(human,await loadFacialAtlas());
        if(disposed)return;
        face.apply(weights);
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
