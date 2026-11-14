import {availableStudioModules} from "./StudioAppearance";
import "./studio.css";
import {createStudioViewport} from "./StudioViewport";
import {createStudioMorphEditor} from "./StudioMorphEditor";
import {createStudioGeneratorPanel,type StudioGeneratorPanel} from "./StudioGeneratorPanel";
import {STUDIO_VIEWS,STUDIO_LIGHTS,type StudioView,type StudioLight} from "./StudioPresentation";
import {STUDIO_FOCUS,STUDIO_POSES,STUDIO_EXPRESSIONS,
  type StudioFocus,type StudioPose,type StudioExpression}
  from "./StudioInspection";

const host=document.querySelector<HTMLElement>("#studio-app");
if(!host)throw new Error("Unable to open Character Studio");
host.innerHTML=String.raw`
<main class="studio" aria-label="Character Studio">
  <header class="studio-header">
    <div class="studio-heading">
      <a class="studio-back" href="/" aria-label="Return to Trilok">‹ <span>Trilok</span></a>
      <span class="studio-divider" aria-hidden="true"></span>
      <div><p class="eyebrow">TRILOK</p><h1>Character Studio</h1></div>
    </div>
    <div class="studio-header-actions">
      <div class="studio-edit-actions" role="group" aria-label="Character editing">
        <button type="button" id="studio-undo" aria-label="Undo character adjustment" title="Undo · Ctrl+Z" disabled>↶ <span>Undo</span></button>
        <button type="button" id="studio-redo" aria-label="Redo character adjustment" title="Redo · Ctrl+Shift+Z" disabled>↷ <span>Redo</span></button>
        <button type="button" id="studio-start-over" title="Restore the original character" disabled>Start over</button>
      </div>
      <a class="studio-exit" href="/">Return to game <span aria-hidden="true">↗</span></a>
    </div>
  </header>
  <div class="studio-workspace">
    <nav class="studio-nav" aria-label="Character sections">
      <span class="nav-title">EXPLORE</span>
      <button type="button" data-section="character" aria-current="page"><span aria-hidden="true">◈</span> Character</button>
      <button type="button" data-section="pose"><span aria-hidden="true">♙</span> Pose</button>
      <button type="button" data-section="generate"><span aria-hidden="true">✧</span> Generate</button>
      <button type="button" data-section="view"><span aria-hidden="true">◎</span> View</button>
      <button type="button" data-section="inspection"><span aria-hidden="true">⌕</span> Inspect</button>
    </nav>
    <section class="studio-stage" aria-label="Character preview">
      <div class="studio-stage-top">
        <div><span class="studio-indicator" aria-hidden="true"></span> <span id="studio-scene-label">Human · Neutral pose</span></div>
        <span class="studio-stage-note">CHARACTER PREVIEW</span>
      </div>
      <div id="studio-viewport" class="studio-viewport" aria-label="Three-dimensional character stage"></div>
      <div class="studio-loading" id="studio-loading" role="status" aria-live="polite">
        <span class="studio-spinner" aria-hidden="true"></span>
        <strong>Preparing your character</strong>
        <p>Bringing your character into view…</p>
      </div>
      <div class="studio-error" id="studio-error" role="alert" hidden>
        <strong>Preview unavailable</strong>
        <p id="studio-error-message"></p>
        <button id="studio-retry" type="button">Try again</button>
      </div>
      <div class="studio-stage-bottom">
        <div class="studio-hint">Drag to turn <span aria-hidden="true">·</span> Double-tap a body area to focus <span aria-hidden="true">·</span> Scroll or pinch to zoom <span aria-hidden="true">·</span> Two fingers to move</div>
        <button type="button" id="studio-reset" aria-label="Reset camera to three-quarter view">Reset view ↺</button>
      </div>
    </section>
    <aside class="studio-inspector" aria-label="Character settings">
      <div class="studio-inspector-intro">
        <span class="eyebrow" id="studio-context">YOUR CHARACTER</span>
        <h2 id="studio-title">Meet your character</h2>
        <p id="studio-description">A human foundation ready to explore. Rotate and zoom to examine the silhouette, face, and proportions.</p>
      </div>
      <div class="studio-settings">
        <fieldset class="studio-fieldset">
          <legend>Camera angle</legend>
          <div class="studio-view-grid" id="studio-views">
            <button type="button" data-view="three-quarter" aria-pressed="true">¾ <span>Angle</span></button>
            <button type="button" data-view="front" aria-pressed="false">↑ <span>Front</span></button>
            <button type="button" data-view="side" aria-pressed="false">→ <span>Side</span></button>
            <button type="button" data-view="rear" aria-pressed="false">↓ <span>Rear</span></button>
          </div>
          <label class="studio-switch"><input id="studio-orthographic" type="checkbox"/> Orthographic view</label>
        </fieldset>
        <div class="studio-rule"></div>
        <fieldset class="studio-fieldset">
          <legend>Focus on an area</legend>
          <label class="studio-field-label" for="studio-focus-area">Body area</label>
          <select id="studio-focus-area" aria-label="Body area to focus on"></select>
          <div class="studio-action-pair">
            <button id="studio-focus" type="button">Focus</button>
            <button id="studio-return-focus" type="button" disabled>Previous view</button>
          </div>
        </fieldset>
        <div class="studio-rule"></div>
        <fieldset class="studio-fieldset">
          <legend>Lighting</legend>
          <div class="studio-light-grid" id="studio-lights">
            <button type="button" data-light="daylight" aria-pressed="true"><span class="light-swatch day" aria-hidden="true"></span> Daylight</button>
            <button type="button" data-light="warm" aria-pressed="false"><span class="light-swatch warm" aria-hidden="true"></span> Golden hour</button>
            <button type="button" data-light="dusk" aria-pressed="false"><span class="light-swatch dusk" aria-hidden="true"></span> Twilight</button>
          </div>
        </fieldset>
      </div>
      <div id="studio-pose-panel" class="studio-extra-panel" hidden>
        <fieldset class="studio-fieldset">
          <legend>Body pose</legend>
          <p>Preview how the character moves without changing your design.</p>
          <label class="studio-field-label" for="studio-pose-select">Position</label>
          <select id="studio-pose-select"></select>
        </fieldset>
        <div class="studio-rule"></div>
        <fieldset class="studio-fieldset">
          <legend>Facial expression</legend>
          <p>Try a temporary expression. Your facial shaping stays intact.</p>
          <label class="studio-field-label" for="studio-expression-select">Expression</label>
          <select id="studio-expression-select"></select>
        </fieldset>
      </div>
      <div id="studio-inspection-panel" class="studio-extra-panel" hidden>
        <p>These optional tools reveal the structure beneath the character. Turn them off to return to a clean preview.</p>
        <label class="studio-switch"><input type="checkbox" id="studio-inspect-skeleton"/> Skeleton</label>
        <label class="studio-switch"><input type="checkbox" id="studio-inspect-wireframe"/> Surface wireframe</label>
        <label class="studio-switch"><input type="checkbox" id="studio-inspect-joints"/> Joint markers</label>
        <p class="studio-inspection-note">Pose and inspection are previews only. They do not change your character's shape.</p>
      </div>
      <div id="studio-editor" hidden></div>
      <div id="studio-generate-editor" hidden></div>
      <div class="studio-inspector-foot"><span class="gold-star" aria-hidden="true">✧</span> A closer look at your next character.</div>
    </aside>
  </div>
</main>`;

const nav=host.querySelector<HTMLElement>(".studio-nav")!;
const viewLink=nav.querySelector<HTMLElement>('[data-section="view"]')!;
const moduleIcons:Record<string,string>={body:"♧",face:"◉",appearance:"✦"};
for(const module of availableStudioModules()){
  const button=document.createElement("button");
  button.type="button";
  button.dataset.section=module.id;
  const icon=document.createElement("span");
  icon.setAttribute("aria-hidden","true");
  icon.textContent=moduleIcons[module.id]??"✧";
  button.append(icon,document.createTextNode(" "+module.label));
  nav.insertBefore(button,viewLink);
}
const element=<T extends HTMLElement>(selector:string):T=>{
  const result=host.querySelector<T>(selector);
  if(!result)throw new Error("A required Studio control was not found");
  return result;
};
const loading=element<HTMLElement>("#studio-loading");
const failure=element<HTMLElement>("#studio-error");
const message=element<HTMLElement>("#studio-error-message");
const editStatus=document.createElement("div");
editStatus.id="studio-edit-status";editStatus.className="studio-visual-status";
element("#studio-viewport").after(editStatus);
const viewport=createStudioViewport(element("#studio-viewport"),()=>{
  loading.hidden=true;failure.hidden=true;
  document.documentElement.dataset.studioReady="true";
},reason=>{
  loading.hidden=true;failure.hidden=false;message.textContent=reason;
  document.documentElement.dataset.studioReady="false";
},reason=>{editStatus.textContent=reason;},area=>{
  focusArea.value=area;
  focused=true;
  element<HTMLButtonElement>("#studio-return-focus").disabled=false;
  setPressed("view","");
});
const undoButton=element<HTMLButtonElement>("#studio-undo");
const redoButton=element<HTMLButtonElement>("#studio-redo");
const startOverButton=element<HTMLButtonElement>("#studio-start-over");
const focusArea=element<HTMLSelectElement>("#studio-focus-area");
const poseSelect=element<HTMLSelectElement>("#studio-pose-select");
const expressionSelect=element<HTMLSelectElement>("#studio-expression-select");
function addOptions(select:HTMLSelectElement,items:Readonly<Record<string,
  {readonly label:string}|string>>):void {
  for(const [id,entry] of Object.entries(items))
    select.add(new Option(typeof entry==="string"?entry:entry.label,id));
}
addOptions(focusArea,STUDIO_FOCUS);
addOptions(poseSelect,STUDIO_POSES);
addOptions(expressionSelect,STUDIO_EXPRESSIONS);
let focused=false;
function clearFocus():void {
  focused=false;
  element<HTMLButtonElement>("#studio-return-focus").disabled=true;
}
element<HTMLButtonElement>("#studio-focus").addEventListener("click",()=>{
  const area=focusArea.value as StudioFocus;
  if(!Object.hasOwn(STUDIO_FOCUS,area))return;
  if(viewport.focus(area)){
    focused=true;
    element<HTMLButtonElement>("#studio-return-focus").disabled=false;
    setPressed("view","");
  }
});
element<HTMLButtonElement>("#studio-return-focus").addEventListener("click",()=>{
  if(!focused)return;
  viewport.returnFromFocus();clearFocus();
});
element<HTMLInputElement>("#studio-orthographic").addEventListener("change",event=>{
  viewport.setOrthographic((event.currentTarget as HTMLInputElement).checked);
});
poseSelect.addEventListener("change",()=>{
  const id=poseSelect.value as StudioPose;
  if(!Object.hasOwn(STUDIO_POSES,id))return;
  viewport.setPose(id);
  element("#studio-scene-label").textContent="Human · "+STUDIO_POSES[id];
});
expressionSelect.addEventListener("change",()=>{
  const id=expressionSelect.value as StudioExpression;
  if(!Object.hasOwn(STUDIO_EXPRESSIONS,id))return;
  const previous=expressionSelect.dataset.applied??"neutral";
  expressionSelect.disabled=true;
  void viewport.setExpression(id).then(ok=>{
    if(!ok)expressionSelect.value=previous;
    else expressionSelect.dataset.applied=id;
  }).finally(()=>{expressionSelect.disabled=false;});
});
const inspectionKeys=["skeleton","wireframe","joints"] as const;
function syncInspection():void {
  const next={skeleton:false,wireframe:false,joints:false};
  for(const key of inspectionKeys)
    next[key]=element<HTMLInputElement>("#studio-inspect-"+key).checked;
  viewport.setInspection(next);
}
for(const key of inspectionKeys)
  element<HTMLInputElement>("#studio-inspect-"+key)
    .addEventListener("change",syncInspection);
let generatorPanel:StudioGeneratorPanel|undefined;
const morphEditor=createStudioMorphEditor(element("#studio-editor"),
  recipe=>viewport.applyRecipe(recipe),status=>{
    undoButton.disabled=!status.canUndo;
    redoButton.disabled=!status.canRedo;
    startOverButton.disabled=!status.changed;
    generatorPanel?.sync(status.recipe);
  });
generatorPanel=createStudioGeneratorPanel(element("#studio-generate-editor"),
  options=>morphEditor.generate(options));
generatorPanel.sync(morphEditor.status().recipe);
undoButton.addEventListener("click",()=>morphEditor.undo());
redoButton.addEventListener("click",()=>morphEditor.redo());
startOverButton.addEventListener("click",()=>{
  if(morphEditor.status().changed&&
    window.confirm("Restore the original character? You can undo this change.")){
    morphEditor.resetAll();
  }
});
function keyboardHistory(event:KeyboardEvent):void {
  if(!(event.ctrlKey||event.metaKey)||event.altKey||event.isComposing)return;
  const target=event.target;
  if(target instanceof HTMLTextAreaElement||target instanceof HTMLInputElement&&
      target.type!=="range"||target instanceof HTMLElement&&target.isContentEditable)return;
  const key=event.key.toLowerCase();
  if(key==="z"){
    event.preventDefault();
    if(event.shiftKey)morphEditor.redo();
    else morphEditor.undo();
  }else if(key==="y"){
    event.preventDefault();morphEditor.redo();
  }
}
window.addEventListener("keydown",keyboardHistory);
element<HTMLButtonElement>("#studio-retry").addEventListener("click",()=>{
  failure.hidden=true;loading.hidden=false;
  void viewport.load();
});
element<HTMLButtonElement>("#studio-reset").addEventListener("click",()=>{
  viewport.resetView();clearFocus();
  setPressed("view","three-quarter");
});
function setPressed(attribute:"view"|"light",value:string):void {
  host?.querySelectorAll<HTMLButtonElement>("[data-"+attribute+"]").forEach(button=>
    button.setAttribute("aria-pressed",String(button.dataset[attribute]===value)));
}
host.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button=>
  button.addEventListener("click",()=>{
    const view=button.dataset.view as StudioView;
    if(!Object.hasOwn(STUDIO_VIEWS,view))return;
    viewport.setView(view);setPressed("view",view);
  }));
host.querySelectorAll<HTMLButtonElement>("[data-light]").forEach(button=>
  button.addEventListener("click",()=>{
    const light=button.dataset.light as StudioLight;
    if(!Object.hasOwn(STUDIO_LIGHTS,light))return;
    viewport.setLight(light);setPressed("light",light);
  }));
const sections={
  character:{context:"YOUR CHARACTER",title:"Meet your character",
    description:"A human foundation ready to explore. Rotate and zoom to examine the silhouette, face, and proportions."},
  body:{context:"SCULPT THE BODY",title:"Shape the silhouette",
    description:"Explore human proportions, age and build. Choose an area for finer shaping."},
  face:{context:"SCULPT THE FACE",title:"Shape the face",
    description:"Refine facial anatomy and expressions with precise independent controls."},
  appearance:{context:"PERSONALIZE APPEARANCE",title:"Skin & surface",
    description:"Choose a tone and finish, and see the change directly on your character."},
  pose:{context:"STRIKE A POSE",title:"See your character in motion",
    description:"Explore natural movements and expressions. Your character design remains unchanged."},
  generate:{context:"MAKE IT YOUR OWN",title:"Create a new character",
    description:"Explore meaningful human variations, keep the features you love, and refine your design."},
  inspection:{context:"A CLOSER LOOK",title:"Inspect the anatomy",
    description:"Reveal the skeleton, joint locations, and underlying surface only when you need them."},
  view:{context:"THE VIEW",title:"Find your angle",
    description:"Double-tap a body part to focus. Camera angles keep that area in view until you choose Previous view or Reset view."},
} as const;
host.querySelectorAll<HTMLButtonElement>("[data-section]").forEach(button=>
  button.addEventListener("click",()=>{
    const id=button.dataset.section as keyof typeof sections;
    if(!Object.hasOwn(sections,id))return;
    for(const item of host.querySelectorAll<HTMLButtonElement>("[data-section]")){
      if(item===button)item.setAttribute("aria-current","page");
      else item.removeAttribute("aria-current");
    }
    const editing=id==="body"||id==="face"||id==="appearance";
    element("#studio-editor").hidden=!editing;
    element(".studio-settings").hidden=editing||id==="pose"||id==="inspection";
    element("#studio-pose-panel").hidden=id!=="pose";
    element("#studio-inspection-panel").hidden=id!=="inspection";
    element("#studio-generate-editor").hidden=id!=="generate";
    if(editing)morphEditor.show(id);
    element("#studio-context").textContent=sections[id].context;
    element("#studio-title").textContent=sections[id].title;
    element("#studio-description").textContent=sections[id].description;
  }));
void viewport.load();
window.addEventListener("pagehide",()=>{
  window.removeEventListener("keydown",keyboardHistory);
  generatorPanel?.dispose();morphEditor.dispose();viewport.dispose();
},{once:true});
