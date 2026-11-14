import type {GeneratorDifference} from "./StudioGenerator";
import type {StudioRecipeV1} from "./StudioRecipe";

export interface StudioGeneratorPanel {
  readonly element:HTMLElement;
  sync(recipe:StudioRecipeV1):void;
  dispose():void;
}

/** One-button generator: no profiles, locks, strength or seed editor. */
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
    <p id="studio-generator-feedback" class="studio-generator-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
  `;
  mount.append(panel);
  const create=panel.querySelector<HTMLButtonElement>("#studio-generator-create")!;
  const feedback=panel.querySelector<HTMLElement>("#studio-generator-feedback")!;
  let disposed=false;
  let running=false;
  create.addEventListener("click",()=>{
    if(running||disposed)return;
    const bytes=new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const seed=bytes[0]||1;
    running=true;create.disabled=true;
    feedback.textContent="Creating a new character…";
    void generate(seed).then(result=>{
      if(disposed)return;
      feedback.textContent=result?
        "New character created. Adjust any detail or use Undo to go back.":
        "Couldn't finish this character. Your previous design is safe. Try again.";
    }).catch(()=>{
      if(!disposed)feedback.textContent=
        "Couldn't finish this character. Your previous design is safe. Try again.";
    }).finally(()=>{
      running=false;create.disabled=false;
    });
  });
  return {element:panel,sync(_recipe){/* One action, no generator settings. */},
    dispose(){disposed=true;panel.remove();}};
}
