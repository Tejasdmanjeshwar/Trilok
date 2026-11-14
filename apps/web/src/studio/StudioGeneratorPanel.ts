import {STUDIO_CONTROLS} from "./StudioMorphCatalog";
import {
  DEFAULT_GENERATOR_OPTIONS,GENERATOR_STYLES,validateGeneratorOptions,
  type GeneratorOptions,type GeneratorDifference,type GeneratorStyle,
} from "./StudioGenerator";
import type {StudioRecipeV1} from "./StudioRecipe";

export interface StudioGeneratorPanel {
  readonly element:HTMLElement;
  sync(recipe:StudioRecipeV1):void;
  dispose():void;
}

/** Authoring UI state is intentionally session-only. No generator controls or
 * lock selections are written to the character's anatomy or persistent data. */
export function createStudioGeneratorPanel(
  mount:HTMLElement,
  generate:(options:GeneratorOptions)=>Promise<GeneratorDifference|undefined>,
):StudioGeneratorPanel {
  const panel=document.createElement("div");
  panel.id="studio-generator-panel";
  panel.className="studio-generator-panel";
  panel.hidden=true;
  panel.innerHTML=String.raw`
    <fieldset class="studio-fieldset">
      <legend>Character direction</legend>
      <p class="studio-generator-description">Build a distinct human from coordinated features. Every result can be refined in Body, Face and Appearance.</p>
      <label class="studio-field-label" for="studio-generator-style">Style</label>
      <select id="studio-generator-style"></select>
    </fieldset>
    <fieldset class="studio-fieldset">
      <legend>Variation</legend>
      <label class="studio-field-label" for="studio-generator-variation">How distinctive?</label>
      <div class="studio-generator-range">
        <input id="studio-generator-variation" type="range" min="0" max="1" step=".05" value=".65"/>
        <output id="studio-generator-variation-value" for="studio-generator-variation">65%</output>
      </div>
      <div class="studio-generator-scale"><span>Subtle</span><span>Distinctive</span></div>
    </fieldset>
    <fieldset class="studio-fieldset">
      <legend>Reproduce a character</legend>
      <label class="studio-field-label" for="studio-generator-seed">Character seed</label>
      <input id="studio-generator-seed" type="number" min="1" max="4294967295" step="1" value="1" inputmode="numeric" required/>
      <p class="studio-generator-description">The same seed, style, variation and unlocked features reproduce the same design.</p>
    </fieldset>
    <fieldset class="studio-fieldset">
      <legend>Keep these features</legend>
      <p class="studio-generator-description">Locked features keep your current design when generating another character.</p>
      <div class="studio-generator-locks">
        <label><input type="checkbox" id="studio-generator-lock-body"/> Body</label>
        <label><input type="checkbox" id="studio-generator-lock-face"/> Face</label>
        <label><input type="checkbox" id="studio-generator-lock-age"/> Age</label>
        <label><input type="checkbox" id="studio-generator-lock-appearance"/> Appearance</label>
      </div>
      <label class="studio-field-label" for="studio-generator-feature">Lock a specific feature</label>
      <div class="studio-generator-add-feature">
        <select id="studio-generator-feature"></select>
        <button id="studio-generator-add" type="button">Lock</button>
      </div>
      <div id="studio-generator-locked-features" class="studio-generator-pills" aria-label="Locked features"></div>
    </fieldset>
    <div class="studio-generator-actions">
      <button id="studio-generator-create" type="button" class="studio-generator-primary">Generate character</button>
      <button id="studio-generator-new" type="button">New variation</button>
    </div>
    <p id="studio-generator-feedback" class="studio-generator-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
  `;
  mount.append(panel);
  const select=<T extends HTMLElement>(css:string):T=>{
    const found=panel.querySelector<T>(css);
    if(!found)throw Error("Generator control unavailable");
    return found;
  };
  const style=select<HTMLSelectElement>("#studio-generator-style");
  const variation=select<HTMLInputElement>("#studio-generator-variation");
  const variationValue=select<HTMLOutputElement>("#studio-generator-variation-value");
  const seed=select<HTMLInputElement>("#studio-generator-seed");
  const add=select<HTMLButtonElement>("#studio-generator-add");
  const feature=select<HTMLSelectElement>("#studio-generator-feature");
  const lockedFeatures=select<HTMLElement>("#studio-generator-locked-features");
  const feedback=select<HTMLElement>("#studio-generator-feedback");
  const create=select<HTMLButtonElement>("#studio-generator-create");
  const newVariation=select<HTMLButtonElement>("#studio-generator-new");
  const lockIds=new Set<string>();
  let disposed=false;
  let running=false;
  let lastRecipeSeed=DEFAULT_GENERATOR_OPTIONS.seed;
  for(const [id,profile] of Object.entries(GENERATOR_STYLES)){
    const option=new Option(profile.label,id);
    option.title=profile.description;
    style.add(option);
  }
  for(const category of ["body","face"] as const){
    const optgroup=document.createElement("optgroup");
    optgroup.label=category==="body"?"Body":"Face";
    const options=STUDIO_CONTROLS.filter(control=>control.category===category)
      .sort((a,b)=>a.label.localeCompare(b.label));
    for(const c of options)optgroup.append(new Option(c.label,c.id));
    feature.append(optgroup);
  }
  const lockBox=(key:"body"|"face"|"age"|"appearance")=>
    select<HTMLInputElement>("#studio-generator-lock-"+key);
  function renderLocks():void {
    lockedFeatures.replaceChildren();
    for(const id of lockIds){
      const c=STUDIO_CONTROLS.find(item=>item.id===id);
      if(!c)continue;
      const button=document.createElement("button");
      button.type="button";
      button.className="studio-generator-pill";
      button.textContent=c.label+" ×";
      button.setAttribute("aria-label","Unlock "+c.label);
      button.addEventListener("click",()=>{lockIds.delete(id);renderLocks();});
      lockedFeatures.append(button);
    }
    if(!lockIds.size){
      const note=document.createElement("span");
      note.textContent="No individual features locked";
      note.className="studio-generator-empty";
      lockedFeatures.append(note);
    }
  }
  renderLocks();
  add.addEventListener("click",()=>{
    if(!feature.value)return;
    lockIds.add(feature.value);renderLocks();
  });
  variation.addEventListener("input",()=>{
    variationValue.value=Math.round(Number(variation.value)*100)+"%";
  });
  function readOptions():GeneratorOptions {
    const choices:GeneratorOptions={
      seed:Number(seed.value),style:style.value as GeneratorStyle,
      variation:Number(variation.value),
      locks:{
        body:lockBox("body").checked,
        face:lockBox("face").checked,
        age:lockBox("age").checked,
        appearance:lockBox("appearance").checked,
        features:[...lockIds].sort(),
      },
    };
    validateGeneratorOptions(choices);
    return choices;
  }
  async function run(newSeed:boolean):Promise<void> {
    if(disposed||running)return;
    if(newSeed){
      // Entropy chooses a seed; the generator itself is always deterministic.
      const random=new Uint32Array(1);
      crypto.getRandomValues(random);
      seed.value=String(random[0]||1);
    }
    let options:GeneratorOptions;
    try{options=readOptions();}
    catch{
      feedback.textContent="Enter a valid seed and choose supported settings.";
      seed.focus();return;
    }
    running=true;create.disabled=true;newVariation.disabled=true;
    feedback.textContent="Preparing your character…";
    try{
      const result=await generate(options);
      if(disposed)return;
      if(!result){
        feedback.textContent="This variation could not be applied. Your previous character is safe.";
      }else{
        const count=result.body+result.face+result.appearance;
        const examples=result.examples.length?
          " Changed details include "+result.examples.join(", ")+".":"";
        feedback.textContent=count?
          "Created a new variation with "+count+" adjusted features."+examples:
          "The selected features stayed the same. Try a different seed or unlock a feature.";
      }
    }catch{
      if(!disposed)feedback.textContent="Unable to create a variation. Your character remains available.";
    }finally{
      running=false;create.disabled=false;newVariation.disabled=false;
    }
  }
  create.addEventListener("click",()=>{void run(false);});
  newVariation.addEventListener("click",()=>{void run(true);});
  return {
    element:panel,
    sync(recipe){
      if(recipe.seed!==lastRecipeSeed){
        seed.value=String(recipe.seed);
        lastRecipeSeed=recipe.seed;
      }
    },
    dispose(){disposed=true;panel.remove();},
  };
}
