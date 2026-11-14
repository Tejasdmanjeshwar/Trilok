import {
  STUDIO_CONTROLS,STUDIO_PRESETS,controlValue,defaultStudioMorphState,
  findStudioControls,resetStudioSection,withStudioControl,withStudioPreset,
  type StudioControl,type StudioMorphState,type StudioSection,
} from "./StudioMorphCatalog";

type EditCallback=(value:StudioMorphState)=>Promise<boolean>;

export interface StudioMorphEditor {
  show(section:StudioSection):void;
  dispose():void;
}
/** A single contextual control surface. Native control IDs never appear in UI.
 * Every parameter comes from the authoritative MakeHuman registries. */
export function createStudioMorphEditor(root:HTMLElement,
  apply:EditCallback):StudioMorphEditor{
  let state=defaultStudioMorphState();
  let lastApplied=state;
  let section:StudioSection="body";
  let advanced=false;
  let search="";
  let group="all";
  let revision=0;
  let timeout:ReturnType<typeof setTimeout>|undefined;
  let disposed=false;
  const groups=():string[]=>[...new Set(STUDIO_CONTROLS.filter(c=>c.category===section)
    .map(c=>c.group))];
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
  const reset=find<HTMLButtonElement>("#studio-section-reset");

  function syncValues():void{
    for(const c of STUDIO_CONTROLS){
      const row=list.querySelector<HTMLElement>('[data-control-id="'+CSS.escape(c.id)+'"]');
      if(!row)continue;
      const value=controlValue(state,c);
      const input=row.querySelector<HTMLInputElement>('input[type="range"]');
      const numeric=row.querySelector<HTMLInputElement>('input[type="number"]');
      if(input)input.value=String(value);
      if(numeric)numeric.value=String(Number(value.toFixed(6)));
    }
  }
  async function commit(next:StudioMorphState,serial:number):Promise<void>{
    const success=await apply(next);
    if(disposed)return;
    if(success)lastApplied=next;
    if(serial!==revision)return;
    if(!success){
      state=lastApplied;
      syncValues();
      message.textContent="This adjustment could not be applied. The previous shape is unchanged.";
    }else{
      message.textContent="";
    }
  }
  function schedule(next:StudioMorphState,delay=160):void{
    state=next;
    syncValues();
    if(timeout!==undefined)clearTimeout(timeout);
    const serial=++revision;
    message.textContent="Updating character…";
    timeout=setTimeout(()=>{
      timeout=undefined;
      void commit(next,serial);
    },delay);
  }
  const update=(c:StudioControl,value:number):void=>{
    try{
      const next=withStudioControl(state,c.id,value);
      preset.value="";
      schedule(next,c.channel==="face"?40:180);
    }catch{
      message.textContent="Please enter a value within the available range.";
    }
  };
  function renderControls():void{
    list.replaceChildren();
    const found=findStudioControls(section,search,advanced,group);
    count.textContent=found.length+" "+(found.length===1?"feature":"features");
    if(!found.length){
      const empty=document.createElement("p");empty.className="studio-empty";
      empty.textContent="No matching features. Try another search or area.";
      list.append(empty);return;
    }
    for(const c of found){
      const row=document.createElement("div");row.className="studio-control";
      row.dataset.controlId=c.id;
      const label=document.createElement("label");
      const rangeId="morph-"+STUDIO_CONTROLS.indexOf(c);
      label.htmlFor=rangeId;
      label.textContent=c.label;
      const heading=document.createElement("div");heading.className="studio-control-heading";
      heading.append(label);
      if(search||group==="all"){
        const tag=document.createElement("span");tag.textContent=c.group;
        heading.append(tag);
      }
      const fields=document.createElement("div");fields.className="studio-control-fields";
      const slider=document.createElement("input");
      slider.type="range";slider.id=rangeId;slider.min=String(c.min);
      slider.max=String(c.max);slider.step=String(c.step);
      slider.value=String(controlValue(state,c));
      const number=document.createElement("input");
      number.type="number";number.min=slider.min;number.max=slider.max;
      number.step=slider.step;
      number.value=String(Number(controlValue(state,c).toFixed(6)));
      number.setAttribute("aria-label",c.label+" exact value");
      number.title=c.label+" numeric value";
      slider.addEventListener("input",()=>update(c,Number(slider.value)));
      number.addEventListener("change",()=>{
        if(number.value.trim()===""){
          syncValues();return;
        }
        const val=Number(number.value);
        if(!Number.isFinite(val)||val<c.min||val>c.max){
          message.textContent="Please enter a value within the available range.";
          syncValues();return;
        }
        update(c,val);
      });
      fields.append(slider,number);row.append(heading,fields);
      if(advanced&&c.note){
        const hint=document.createElement("small");hint.className="studio-range-note";
        hint.textContent=c.note;row.append(hint);
      }
      list.append(row);
    }
  }
  function refreshSection():void{
    preset.replaceChildren(new Option("Custom", ""));
    for(const p of STUDIO_PRESETS[section])preset.add(new Option(p.label,p.id));
    const current=section==="body"?state.body:state.face;
    const shapeModified=STUDIO_CONTROLS.some(c=>c.category===section&&
      c.channel==="shape"&&controlValue(state,c)!==c.defaultValue);
    const matching=shapeModified?undefined:STUDIO_PRESETS[section].find(p=>{
      const sample=withStudioPreset(defaultStudioMorphState(),section,p.id);
      const record=section==="body"?sample.body:sample.face;
      return Object.keys(current).length===Object.keys(record).length &&
        Object.keys(record).every(key=>current[key]===record[key]);
    });
    preset.value=matching?.id??"";
    groupSelect.replaceChildren(new Option("All areas","all"));
    for(const value of groups())groupSelect.add(new Option(value,value));
    group=section==="body"?"Foundation":"Eyes";
    groupSelect.value=group;
    search="";searchInput.value="";
    advanced=false;advancedInput.checked=false;note.hidden=true;
    renderControls();
  }
  preset.addEventListener("change",()=>{
    if(!preset.value)return;
    try{schedule(withStudioPreset(state,section,preset.value),0);}
    catch{message.textContent="That character style is not available.";}
  });
  reset.addEventListener("click",()=>{
    schedule(resetStudioSection(state,section),0);
    preset.value="neutral";
  });
  searchInput.addEventListener("input",()=>{
    search=searchInput.value;
    if(search.trim())group="all";
    groupSelect.value=group;
    renderControls();
  });
  groupSelect.addEventListener("change",()=>{
    group=groupSelect.value;renderControls();
  });
  advancedInput.addEventListener("change",()=>{
    advanced=advancedInput.checked;note.hidden=!advanced;
    renderControls();
  });
  refreshSection();
  return {
    show(next){if(disposed)return;section=next;message.textContent="";refreshSection();},
    dispose(){
      disposed=true;++revision;
      if(timeout!==undefined)clearTimeout(timeout);
      container.remove();
    },
  };
}
