import {createStudioAppearancePanel} from "./StudioAppearancePanel";
import {
  STUDIO_CONTROLS,STUDIO_PRESETS,controlValue,findStudioControls,
  type StudioControl,type StudioSection,
} from "./StudioMorphCatalog";
import {StudioHistory,type StudioHistoryStatus} from "./StudioHistory";
import {type StudioEditCommand,type StudioRecipeV1} from "./StudioRecipe";

type Preview=(recipe:StudioRecipeV1)=>Promise<boolean>;
export interface StudioMorphEditor {
  show(section:StudioSection|"appearance"):void;
  undo():void;
  redo():void;
  resetAll():void;
  status():StudioHistoryStatus;
  dispose():void;
}
/** One in-memory editor/controller shared by all contextual Body/Face panels.
 * Gesture snapshots live in StudioHistory; viewport state is separate. */
export function createStudioMorphEditor(root:HTMLElement,apply:Preview,
  onHistory:(status:StudioHistoryStatus)=>void):StudioMorphEditor {
  const history=new StudioHistory();
  let section:StudioSection="body";
  let advanced=false,search="",group="all";
  let timeout:ReturnType<typeof setTimeout>|undefined;
  let disposed=false;
  const container=document.createElement("div");
  container.className="studio-morph-editor";
  container.innerHTML=String.raw`
    <div class="studio-morph-toolbar">
      <label class="studio-field-label" for="studio-preset">Character style</label>
      <select id="studio-preset" aria-label="Character style"></select>
      <button id="studio-section-reset" class="studio-text-button" type="button">Reset this section</button>
      <div class="studio-rule"></div>
      <label class="studio-field-label" for="studio-control-search">Find a feature</label>
      <input id="studio-control-search" type="search" placeholder="Search features…" autocomplete="off" />
      <label class="studio-field-label" for="studio-group">Area</label>
      <select id="studio-group" aria-label="Character area"></select>
      <label class="studio-advanced-toggle"><input type="checkbox" id="studio-advanced"/>
        <span>Advanced shaping</span></label>
      <p class="studio-stress-hint" id="studio-advanced-hint" hidden>
        Extended ranges are intended for experimentation. Extreme combinations can distort the character.
      </p>
    </div>
    <div class="studio-control-summary" id="studio-control-count"></div>
    <div class="studio-control-list" id="studio-control-list"></div>
    <p id="studio-editor-message" class="studio-editor-message" role="status" aria-live="polite"></p>
  `;
  root.append(container);
  const find=<T extends HTMLElement>(selector:string):T=>{
    const el=container.querySelector<T>(selector);
    if(!el)throw Error("Character control unavailable");
    return el;
  };
  const preset=find<HTMLSelectElement>("#studio-preset");
  const searchInput=find<HTMLInputElement>("#studio-control-search");
  const groupSelect=find<HTMLSelectElement>("#studio-group");
  const advancedInput=find<HTMLInputElement>("#studio-advanced");
  const note=find<HTMLElement>("#studio-advanced-hint");
  const count=find<HTMLElement>("#studio-control-count");
  const list=find<HTMLElement>("#studio-control-list");
  const message=find<HTMLElement>("#studio-editor-message");

  function syncValues():void{
    const recipe=history.current;
    appearancePanel.sync(recipe);
    preset.value=recipe.selectedPresets[section]==="custom"?"":recipe.selectedPresets[section];
    for(const c of STUDIO_CONTROLS){
      const row=list.querySelector<HTMLElement>('[data-control-id="'+CSS.escape(c.id)+'"]');
      if(!row)continue;
      const value=controlValue(recipe.morphology,c);
      const slider=row.querySelector<HTMLInputElement>('input[type="range"]');
      const numeric=row.querySelector<HTMLInputElement>('input[type="number"]');
      if(slider)slider.value=String(value);
      if(numeric)numeric.value=String(Number(value.toFixed(6)));
    }
  }
  function notify():void{onHistory(history.status);}
  async function commit(recipe:StudioRecipeV1,revision:number):Promise<void> {
    let success=false;
    try{success=await apply(recipe);}
    catch{success=false;}
    if(disposed||!history.resolve(revision,success))return;
    if(!success){
      syncValues();
      message.textContent="That edit could not be completed. Your last valid character has been restored.";
    }else message.textContent="";
    notify();
  }
  function queue(delay:number):void {
    if(timeout!==undefined)clearTimeout(timeout);
    const {recipe,revision}=history.status;
    message.textContent="Updating character…";
    timeout=setTimeout(()=>{
      timeout=undefined;
      void commit(recipe,revision);
    },delay);
  }
  function dispatch(command:StudioEditCommand,delay=150):void {
    try{
      if(!history.apply(command))return;
      syncValues();
      notify();
      queue(delay);
    }catch{
      message.textContent="Please choose a value within the available range.";
      syncValues();
    }
  }
  function navigate(direction:"undo"|"redo"):void{
    const moved=direction==="undo"?history.undo():history.redo();
    if(!moved)return;
    syncValues();notify();queue(0);
  }
  function renderControls():void {
    list.replaceChildren();
    const found=findStudioControls(section,search,advanced,group);
    count.textContent=found.length+" "+(found.length===1?"feature":"features");
    if(!found.length){
      const empty=document.createElement("p");empty.className="studio-empty";
      empty.textContent="No matching features. Try another search or area.";
      list.append(empty);return;
    }
    for(const c of found){
      const row=document.createElement("div");
      row.className="studio-control";row.dataset.controlId=c.id;
      const heading=document.createElement("div");heading.className="studio-control-heading";
      const label=document.createElement("label");
      const rangeId="morph-"+STUDIO_CONTROLS.indexOf(c);
      label.htmlFor=rangeId;label.textContent=c.label;
      heading.append(label);
      if(search||group==="all"){
        const tag=document.createElement("span");tag.textContent=c.group;heading.append(tag);
      }
      const fields=document.createElement("div");fields.className="studio-control-fields";
      const slider=document.createElement("input");
      slider.type="range";slider.id=rangeId;slider.min=String(c.min);
      slider.max=String(c.max);slider.step=String(c.step);
      const number=document.createElement("input");
      number.type="number";number.min=slider.min;number.max=slider.max;
      number.step=slider.step;
      number.setAttribute("aria-label",c.label+" exact value");
      number.title=c.label+" numeric value";
      const sliderValue=()=>dispatch({type:"adjust",id:c.id,value:Number(slider.value)},
        c.channel==="face"?35:160);
      slider.addEventListener("pointerdown",()=>history.beginGesture(c.id));
      slider.addEventListener("pointerup",()=>history.endGesture());
      slider.addEventListener("pointercancel",()=>history.endGesture());
      slider.addEventListener("keydown",event=>{
        if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End","PageUp","PageDown"]
          .includes(event.key))history.beginGesture(c.id);
      });
      slider.addEventListener("keyup",()=>history.endGesture());
      slider.addEventListener("blur",()=>history.endGesture());
      slider.addEventListener("input",sliderValue);
      slider.addEventListener("change",()=>history.endGesture());
      number.addEventListener("change",()=>{
        if(!number.value.trim()){syncValues();return;}
        const value=Number(number.value);
        if(!Number.isFinite(value)||value<c.min||value>c.max){
          message.textContent="Please choose a value within the available range.";
          syncValues();return;
        }
        dispatch({type:"adjust",id:c.id,value},c.channel==="face"?35:160);
      });
      fields.append(slider,number);row.append(heading,fields);
      if(advanced&&c.note){
        const hint=document.createElement("small");hint.className="studio-range-note";
        hint.textContent=c.note;row.append(hint);
      }
      list.append(row);
    }
    syncValues();
  }
  const appearancePanel=createStudioAppearancePanel(root,
    (command,delay=0)=>dispatch(command,delay),
    key=>history.beginGesture(key),()=>history.endGesture());
  root.append(message);
  function refreshSection():void {
    history.endGesture();
    preset.replaceChildren(new Option("Custom",""));
    for(const p of STUDIO_PRESETS[section])preset.add(new Option(p.label,p.id));
    groupSelect.replaceChildren(new Option("All areas","all"));
    for(const name of new Set(STUDIO_CONTROLS.filter(c=>c.category===section)
      .map(c=>c.group)))groupSelect.add(new Option(name,name));
    group=section==="body"?"Foundation":"Eyes";
    groupSelect.value=group;
    search="";searchInput.value="";
    advanced=false;advancedInput.checked=false;note.hidden=true;
    renderControls();
  }
  preset.addEventListener("change",()=>{
    if(preset.value)dispatch({type:"preset",section,preset:preset.value},0);
  });
  find<HTMLButtonElement>("#studio-section-reset").addEventListener("click",()=>{
    history.endGesture();
    dispatch({type:"reset-section",section},0);
  });
  searchInput.addEventListener("input",()=>{
    search=searchInput.value;
    if(search.trim())group="all";
    groupSelect.value=group;renderControls();
  });
  groupSelect.addEventListener("change",()=>{
    group=groupSelect.value;renderControls();
  });
  advancedInput.addEventListener("change",()=>{
    advanced=advancedInput.checked;note.hidden=!advanced;renderControls();
  });
  refreshSection();
  notify();
  return {
    show(next){
      if(disposed)return;
      history.endGesture();
      const showingAppearance=next==="appearance";
      container.hidden=showingAppearance;
      appearancePanel.element.hidden=!showingAppearance;
      if(showingAppearance)appearancePanel.sync(history.current);
      else {section=next;refreshSection();}
    },
    undo(){navigate("undo");},
    redo(){navigate("redo");},
    resetAll(){history.endGesture();dispatch({type:"reset-all"},0);},
    status:()=>history.status,
    dispose(){
      disposed=true;
      if(timeout!==undefined)clearTimeout(timeout);
      container.remove();appearancePanel.dispose();
    },
  };
}
