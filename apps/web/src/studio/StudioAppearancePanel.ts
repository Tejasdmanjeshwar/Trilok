import {
  HUMAN_SKIN_TONES, FINISH_PRESETS, SKIN_ROUGHNESS_RANGE, matchingFinish,
  type SkinToneId,type FinishPresetId,
} from "./StudioAppearance";
import type {StudioEditCommand,StudioRecipeV1} from "./StudioRecipe";

export interface StudioAppearancePanel {
  readonly element:HTMLElement;
  sync(recipe:StudioRecipeV1):void;
  dispose():void;
}
/** The actual skin material is the swatch preview. No simulated textures. */
export function createStudioAppearancePanel(
  mount:HTMLElement,
  dispatch:(command:StudioEditCommand,delay?:number)=>void,
  startGesture:(key:string)=>void,
  endGesture:()=>void,
):StudioAppearancePanel{
  const panel=document.createElement("div");
  panel.id="studio-appearance-editor";
  panel.className="studio-appearance-editor";
  panel.hidden=true;
  panel.innerHTML=String.raw`
    <fieldset class="studio-appearance-fieldset">
      <legend>Skin tone</legend>
      <p class="studio-appearance-description">Choose a tone to see it directly on your character.</p>
      <div class="studio-tone-grid" id="studio-tone-options" role="group" aria-label="Skin tone"></div>
    </fieldset>
    <fieldset class="studio-appearance-fieldset">
      <legend>Surface finish</legend>
      <p class="studio-appearance-description">Adjust how softly the skin reflects light.</p>
      <div class="studio-finish-presets" id="studio-finish-presets" role="group" aria-label="Surface finish presets"></div>
      <div class="studio-finish-slider">
        <label for="studio-skin-roughness">Fine adjustment</label>
        <input id="studio-skin-roughness" type="range" />
        <output for="studio-skin-roughness" id="studio-roughness-value"></output>
      </div>
    </fieldset>
    <button id="studio-appearance-reset" type="button" class="studio-text-button">Reset appearance</button>
    <p class="studio-appearance-note">The preview uses the current skin material. Lighting can change how each shade appears.</p>
  `;
  mount.append(panel);
  const toneList=panel.querySelector<HTMLElement>("#studio-tone-options")!;
  const finishList=panel.querySelector<HTMLElement>("#studio-finish-presets")!;
  const roughness=panel.querySelector<HTMLInputElement>("#studio-skin-roughness")!;
  const output=panel.querySelector<HTMLOutputElement>("#studio-roughness-value")!;
  roughness.min=String(SKIN_ROUGHNESS_RANGE.min);
  roughness.max=String(SKIN_ROUGHNESS_RANGE.max);
  roughness.step=String(SKIN_ROUGHNESS_RANGE.step);
  for(const [id,tone] of Object.entries(HUMAN_SKIN_TONES)){
    const button=document.createElement("button");
    button.type="button";button.className="studio-tone-choice";
    button.dataset.tone=id;
    button.setAttribute("aria-label",tone.label+" skin tone");
    button.setAttribute("aria-pressed","false");
    const circle=document.createElement("span");circle.className="studio-tone-sample";
    circle.style.backgroundColor="#"+tone.hex.toString(16).padStart(6,"0");
    circle.setAttribute("aria-hidden","true");
    const label=document.createElement("span");label.textContent=tone.label;
    button.append(circle,label);
    button.addEventListener("click",()=>{
      dispatch({type:"appearance-tone",tone:id as SkinToneId},0);
    });
    toneList.append(button);
  }
  for(const [id,preset] of Object.entries(FINISH_PRESETS)){
    const button=document.createElement("button");
    button.type="button";button.className="studio-finish-choice";
    button.dataset.finish=id;
    button.textContent=preset.label;
    button.setAttribute("aria-pressed","false");
    button.addEventListener("click",()=>{
      dispatch({type:"appearance-finish",preset:id as FinishPresetId},0);
    });
    finishList.append(button);
  }
  const sliderValue=()=>{
    dispatch({type:"appearance-roughness",roughness:Number(roughness.value)},40);
  };
  roughness.addEventListener("pointerdown",()=>startGesture("appearance:roughness"));
  roughness.addEventListener("pointerup",endGesture);
  roughness.addEventListener("pointercancel",endGesture);
  roughness.addEventListener("keydown",event=>{
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End",
      "PageUp","PageDown"].includes(event.key))startGesture("appearance:roughness");
  });
  roughness.addEventListener("keyup",endGesture);
  roughness.addEventListener("blur",endGesture);
  roughness.addEventListener("input",sliderValue);
  roughness.addEventListener("change",endGesture);
  panel.querySelector<HTMLButtonElement>("#studio-appearance-reset")!
    .addEventListener("click",()=>dispatch({type:"reset-appearance"},0));
  const sync=(recipe:StudioRecipeV1):void=>{
    const appearance=recipe.appearance;
    for(const button of toneList.querySelectorAll<HTMLButtonElement>("button")){
      button.setAttribute("aria-pressed",String(button.dataset.tone===appearance.tone));
    }
    const matched=matchingFinish(appearance);
    for(const button of finishList.querySelectorAll<HTMLButtonElement>("button")){
      button.setAttribute("aria-pressed",String(button.dataset.finish===matched));
    }
    roughness.value=String(appearance.roughness);
    output.value=appearance.roughness.toFixed(2);
  };
  return {element:panel,sync,dispose:()=>panel.remove()};
}
