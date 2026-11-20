import {parseStudioGeneratorSeed,type GeneratorDifference} from "./StudioGenerator";
import type {StudioRecipeV1} from "./StudioRecipe";

export interface StudioGeneratorPanel {
  readonly element:HTMLElement;
  sync(recipe:StudioRecipeV1):void;
  dispose():void;
}

/** One-click surprise generation plus an optional, reproducible numeric seed.
 * Both actions use the identical versioned generator and Studio history. */
export function createStudioGeneratorPanel(
  mount:HTMLElement,
  generate:(seed:number)=>Promise<GeneratorDifference|undefined>,
):StudioGeneratorPanel {
  const panel=document.createElement("div");
  panel.id="studio-generator-panel";
  panel.className="studio-generator-panel";
  panel.innerHTML=String.raw`
    <p class="studio-generator-description">Every character is a fresh surprise. Faces, features, proportions, build and skin tone can all change. Refine anything afterward in Body, Face and Appearance.</p>
    <button id="studio-generator-create" type="button" class="studio-generator-primary">Random character</button>
    <form id="studio-generator-seed-form" class="studio-generator-seed-form" novalidate>
      <label class="studio-field-label" for="studio-generator-seed">Character seed</label>
      <p id="studio-generator-seed-help" class="studio-generator-seed-help">Enter a seed to recreate the same character, from 1 to 4294967295.</p>
      <div class="studio-generator-seed-actions">
        <input id="studio-generator-seed" type="text" inputmode="numeric" autocomplete="off" spellcheck="false"
          aria-describedby="studio-generator-seed-help studio-generator-feedback" maxlength="12"
          placeholder="e.g. 2694905601" />
        <button id="studio-generator-seed-create" type="submit">Generate seed</button>
      </div>
    </form>
    <p id="studio-generator-current-seed" class="studio-generator-current-seed"></p>
    <p id="studio-generator-feedback" class="studio-generator-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
  `;
  mount.append(panel);
  const create=panel.querySelector<HTMLButtonElement>("#studio-generator-create")!;
  const manual=panel.querySelector<HTMLButtonElement>("#studio-generator-seed-create")!;
  const form=panel.querySelector<HTMLFormElement>("#studio-generator-seed-form")!;
  const seedInput=panel.querySelector<HTMLInputElement>("#studio-generator-seed")!;
  const current=panel.querySelector<HTMLElement>("#studio-generator-current-seed")!;
  const feedback=panel.querySelector<HTMLElement>("#studio-generator-feedback")!;
  let disposed=false;
  let running=false;
  const stageMessages:Readonly<Record<string,string>>={
    source:"Preparing anatomical skeleton and skin",
    "head-morph":"Shaping head and proportions",
    "body-atlas":"Preparing original body morph targets",
    "body-morph":"Applying body features",
    "facial-atlas":"Preparing original facial morph targets",
    "facial-morph":"Applying facial features",
    complete:"Preparing final character preview",
  };
  const onStage=(event:Event):void=>{
    if(!running||disposed)return;
    const detail=(event as CustomEvent<{stage?:unknown}>).detail;
    const stage=typeof detail?.stage==="string"?detail.stage:"";
    if(Object.hasOwn(stageMessages,stage))
      feedback.textContent=stageMessages[stage]!;
  };
  window.addEventListener("trilok:studio:generation-stage",onStage);

  async function run(seed:number):Promise<void> {
    if(running||disposed)return;
    running=true;
    create.disabled=true;manual.disabled=true;seedInput.disabled=true;
    seedInput.setAttribute("aria-invalid","false");
    feedback.textContent="Creating a new character…";
    try {
      const result=await generate(seed);
      if(disposed)return;
      feedback.textContent=result?
        "Character generated from seed "+seed+". Adjust any detail or use Undo to go back.":
        "Couldn't finish this character. Your previous design is safe. Try again.";
    }catch{
      if(!disposed)feedback.textContent=
        "Couldn't finish this character. Your previous design is safe. Try again.";
    }finally{
      running=false;
      if(!disposed){
        create.disabled=false;manual.disabled=false;seedInput.disabled=false;
      }
    }
  }

  create.addEventListener("click",()=>{
    if(running||disposed)return;
    const bytes=new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const seed=bytes[0]||1;
    seedInput.value=String(seed);
    void run(seed);
  });
  form.addEventListener("submit",event=>{
    event.preventDefault();
    if(running||disposed)return;
    try {
      const seed=parseStudioGeneratorSeed(seedInput.value);
      void run(seed);
    }catch(error){
      seedInput.setAttribute("aria-invalid","true");
      feedback.textContent=error instanceof Error?error.message:"Enter a valid character seed.";
      seedInput.focus();
    }
  });
  seedInput.addEventListener("input",()=>{
    seedInput.removeAttribute("aria-invalid");
    feedback.textContent="";
  });
  return {
    element:panel,
    sync(recipe){
      current.textContent=recipe.seed===1&&recipe.selectedPresets.body==="neutral"&&
        recipe.selectedPresets.face==="neutral"?
        "Generate a character to see its reproducible seed.":
        "Current character seed: "+recipe.seed;
      // Preserve any in-progress edit; update the field when its saved seed
      // changes through generation, undo, redo or history navigation.
      if(document.activeElement!==seedInput||!seedInput.value)
        seedInput.value=String(recipe.seed);
    },
    dispose(){disposed=true;window.removeEventListener("trilok:studio:generation-stage",onStage);panel.remove();},
  };
}
