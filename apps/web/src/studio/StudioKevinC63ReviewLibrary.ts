import type {AnimationClipV1} from "@trilok/character-core";
import {registerKevinC63Review} from "./StudioAnimationLibrary";
import catalog from "../../../../assets/animations/sources/kevin-basic-motions-v1.json";
import manifest from "../../../../assets/animations/studio-v1/kevin/c63/manifest.json";

/** Separate code-split review chunk, never requested by normal Studio. */
const bakes=import.meta.glob<{default:AnimationClipV1}>(
  "../../../../assets/animations/studio-v1/kevin/c63/*.clip.json",{eager:true});
export function installKevinC63Review():void{
  if(manifest.schemaVersion!==1||manifest.selection!=="c63-directional-review"||
    manifest.entries.length!==24||
    manifest.entries.some((entry,i)=>entry.id!==catalog.c63ReviewClips[i]?.id))
    throw new Error("Invalid Kevin C6.3 review manifest");
  registerKevinC63Review(catalog.c63ReviewClips.map(({id,label})=>{
    const path="../../../../assets/animations/studio-v1/kevin/c63/"+id+".clip.json";
    const clip=bakes[path]?.default;
    if(!clip||clip.id!==id||clip.tracks.length!==49)
      throw new Error("Kevin C6.3 review clip missing: "+id);
    return {id,label,clip};
  }));
}
