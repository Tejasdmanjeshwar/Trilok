import {getBuildIdentity} from "../build-info";
import {STUDIO_ANIMATIONS,EXPERIMENTAL_KAYKIT_REVIEW,
  EXPERIMENTAL_KEVIN_C63_REVIEW} from "./StudioAnimationLibrary";
import type {StudioAnimationState} from "./StudioViewport";
import {availableStudioModules} from "./StudioAppearance";
import "./studio.css";
import {createStudioViewport} from "./StudioViewport";
import {serializeStudioGripFailure,type StudioGripFailureReport} from "./StudioGripDiagnostics";
import {primaryHand,type EquipmentChoice} from "./StudioTwoHandGrip";
import {isBowEquipment,ARCHERY_STATES,type ArcheryState} from "./StudioArchery";
import {BOW_PROFILES,type BowProfile} from "./StudioBowGeometry";
import {isSwordShieldEquipment,shieldHand,type ShieldStance} from "./StudioShieldGrip";
import {createStudioMorphEditor} from "./StudioMorphEditor";
import {createStudioGeneratorPanel,type StudioGeneratorPanel} from "./StudioGeneratorPanel";
import {STUDIO_VIEWS,STUDIO_LIGHTS,type StudioView,type StudioLight} from "./StudioPresentation";
import {STUDIO_FOCUS,STUDIO_POSES,STUDIO_EXPRESSIONS,
  type StudioFocus,type StudioPose,type StudioExpression}
  from "./StudioInspection";

async function bootstrapStudio():Promise<void>{
if(EXPERIMENTAL_KEVIN_C63_REVIEW){
  const {installKevinC63Review}=await import("./StudioKevinC63ReviewLibrary");
  installKevinC63Review();
}
const studioBuild=getBuildIdentity();
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
        <div class="studio-stage-meta">
          <span class="studio-stage-note">CHARACTER PREVIEW</span>
          <a class="studio-build-revision" href="/build-info.json" target="_blank"
            rel="noopener noreferrer" aria-label="View deployed Character Studio build revision"
            title="View exact deployed build SHA">BUILD ${studioBuild.commitSha==="unknown"?"LOCAL":studioBuild.commitSha.slice(0,8)}</a>
        </div>
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
        <fieldset class="studio-fieldset studio-animation-panel">
          <legend>Animations</legend>
          <p>Preview motion on your character. Shape and equipment settings are preserved.</p>
          <label class="studio-field-label" for="studio-animation-select">Animation</label>
          <select id="studio-animation-select" aria-label="Studio animation">
            <option value="">Static pose</option>
          </select>
          <div id="studio-movement-settings" hidden>
            <label class="studio-field-label" for="studio-movement-direction">Movement direction</label>
            <select id="studio-movement-direction" aria-label="Movement direction">
              <option value="forward">Forward</option>
              ${!EXPERIMENTAL_KAYKIT_REVIEW?String.raw`<option value="forward-left">Forward-left</option>
              <option value="forward-right">Forward-right</option>
              <option value="backward">Backward</option>
              <option value="backward-left">Backward-left</option>
              <option value="backward-right">Backward-right</option>
              <option value="left">Strafe left</option>
              <option value="right">Strafe right</option>
              <option value="turn-left">Turn left (one-shot)</option>
              <option value="turn-right">Turn right (one-shot)</option>`:
                String.raw`<option value="backward">Backward (unaccepted KayKit)</option>
              <option value="left">Strafe left (unaccepted KayKit)</option>
              <option value="right">Strafe right (unaccepted KayKit)</option>`}
            </select>
            <label class="studio-field-label" for="studio-movement-speed">Movement pace</label>
            <input id="studio-movement-speed" type="range" min="0" max="1" step=".01" value="0" />
            <output id="studio-movement-speed-value">Standing</output>
            <p>${EXPERIMENTAL_KAYKIT_REVIEW?"Experimental KayKit directional source is unaccepted; anatomical fidelity is not proven.":"Owner-approved Kevin movement loads on demand. Backward sprint is not authored; turns play once and never change the gameplay actor heading."}</p>
          </div>
          <div class="studio-action-pair studio-animation-actions">
            <button id="studio-animation-play" type="button" disabled aria-label="Play animation">Play</button>
            <button id="studio-animation-reset" type="button" disabled>Reset</button>
          </div>
          <label class="studio-field-label" for="studio-animation-time">Timeline</label>
          <input id="studio-animation-time" type="range" min="0" max="1" step=".001" value="0"
            aria-label="Animation timeline in seconds" disabled />
          <output id="studio-animation-clock" for="studio-animation-time">0.00 / 0.00 s</output>
          <div class="studio-action-pair studio-animation-actions">
            <button id="studio-animation-back" type="button" disabled aria-label="Previous animation frame">Previous frame</button>
            <button id="studio-animation-next" type="button" disabled aria-label="Next animation frame">Next frame</button>
          </div>
          <label class="studio-field-label" for="studio-animation-speed">Playback speed</label>
          <select id="studio-animation-speed" aria-label="Animation playback speed">
            <option value=".5">Half speed</option>
            <option value="1" selected>Normal</option>
            <option value="1.5">1.5× faster</option>
            <option value="2">Double speed</option>
          </select>
          <label class="studio-switch"><input type="checkbox" id="studio-animation-loop" checked /> Loop animation</label>
          <button id="studio-animation-static" type="button" disabled>Return to static pose</button>
        </fieldset>
        <div class="studio-rule"></div>
        <fieldset class="studio-fieldset">
          <legend>Body pose</legend>
          <p>Preview how the character moves without changing your design.</p>
          <label class="studio-field-label" for="studio-pose-select">Position</label>
          <select id="studio-pose-select"></select>
        </fieldset>
        <div class="studio-rule"></div>
        <fieldset class="studio-fieldset">
          <legend>Equipment</legend>
          <label class="studio-field-label" for="studio-sword-hand">Weapon and grip</label>
          <select id="studio-sword-hand" aria-label="Reference weapon and gripping hand">
            <option value="none">None</option>
            <optgroup label="One-handed sword">
              <option value="right">Right hand</option>
              <option value="left">Left hand</option>
            </optgroup>
            <optgroup label="Two-handed greatsword">
              <option value="longsword-right">Right hand leads</option>
              <option value="longsword-left">Left hand leads</option>
            </optgroup>
            <optgroup label="Two-handed staff">
              <option value="staff-right">Right hand leads</option>
              <option value="staff-left">Left hand leads</option>
            </optgroup>
            <optgroup label="Bow">
              <option value="bow-left">Bow left · draw right</option>
              <option value="bow-right">Bow right · draw left</option>
            </optgroup>
            <optgroup label="Sword and shield">
              <option value="sword-shield-right">Sword right · shield left</option>
              <option value="sword-shield-left">Sword left · shield right</option>
            </optgroup>
          </select>
          <div id="studio-archery-pose" hidden>
            <label class="studio-field-label" for="studio-bow-profile">Bow shape</label>
            <select id="studio-bow-profile" aria-label="Bow shape">
              <option value="recurve">Recurve bow</option>
              <option value="simple">Traditional bow</option>
            </select>
            <label class="studio-field-label" for="studio-archery-state">Archery position</label>
            <select id="studio-archery-state" aria-label="Archery position">
              <option value="rest">Bow held</option>
              <option value="nock">Nocking arrow</option>
              <option value="partial">Partial draw</option>
              <option value="aim">Full draw / aim</option>
              <option value="release">Release / follow-through</option>
            </select>
            <label class="studio-field-label" for="studio-archery-draw">Draw amount</label>
            <input id="studio-archery-draw" type="range" min="0" max="100" value="100" step="5" aria-label="Draw amount" />
          </div>
          <div id="studio-shield-pose" hidden>
            <label class="studio-field-label" for="studio-shield-stance">Shield position</label>
            <select id="studio-shield-stance" aria-label="Shield position">
              <option value="guard">Guard</option>
              <option value="attack-ready">Attack ready</option>
              <option value="parry">Parry preview</option>
            </select>
          </div>
          <p>Inspect each weapon's hand contact and fit. Your character design stays unchanged.</p>
          <div class="studio-action-pair studio-weapon-focus">
            <button id="studio-sword-focus" type="button">Focus on gripping hand</button>
            <button id="studio-shield-focus" type="button" hidden>Focus on shield hand</button>
          </div>
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
const poseLink=nav.querySelector<HTMLElement>('[data-section="pose"]')!;
const moduleIcons:Record<string,string>={body:"♧",face:"◉",appearance:"✦"};
for(const module of availableStudioModules()){
  const button=document.createElement("button");
  button.type="button";
  button.dataset.section=module.id;
  const icon=document.createElement("span");
  icon.setAttribute("aria-hidden","true");
  icon.textContent=moduleIcons[module.id]??"✧";
  button.append(icon,document.createTextNode(" "+module.label));
  nav.insertBefore(button,poseLink);
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
let lastGripFailure:StudioGripFailureReport|undefined;
const copyGripReport=document.createElement("button");
copyGripReport.id="studio-copy-grip-failure";
copyGripReport.type="button";
copyGripReport.textContent="Copy grip issue details";
copyGripReport.hidden=true;
copyGripReport.className="studio-copy-grip-failure";
copyGripReport.setAttribute("aria-label","Copy failed grip diagnostic report");
editStatus.after(copyGripReport);
copyGripReport.addEventListener("click",()=>{
  if(!lastGripFailure)return;
  const content=serializeStudioGripFailure(lastGripFailure);
  void navigator.clipboard.writeText(content).then(()=>{
    copyGripReport.textContent="Grip issue details copied";
  }).catch(()=>{
    copyGripReport.textContent="Copy unavailable · see browser console";
  });
});
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
},report=>{
  lastGripFailure=report;
  copyGripReport.hidden=!report;
  copyGripReport.textContent="Copy grip issue details";
  if(report)console.warn("[Trilok Studio Grip Failure]",serializeStudioGripFailure(report));
},state=>syncAnimation(state));
const undoButton=element<HTMLButtonElement>("#studio-undo");
const redoButton=element<HTMLButtonElement>("#studio-redo");
const startOverButton=element<HTMLButtonElement>("#studio-start-over");
const focusArea=element<HTMLSelectElement>("#studio-focus-area");
const animationSelect=element<HTMLSelectElement>("#studio-animation-select");
const movementSettings=element<HTMLElement>("#studio-movement-settings");
const movementDirection=element<HTMLSelectElement>("#studio-movement-direction");
const movementSpeed=element<HTMLInputElement>("#studio-movement-speed");
const movementSpeedValue=element<HTMLOutputElement>("#studio-movement-speed-value");
function movementPaceLabel(speed:number,direction:string):string {
  return direction.startsWith("turn-")?"One-shot turn":
    speed<.05?"Standing":speed<=.32?"Walking":speed<=.65?"Jogging":"Sprinting";
}
movementDirection.addEventListener("change",()=>{
  const selected=movementDirection.value;
  // The source set has no backward sprint; never disguise running as sprint.
  // Keep the requested slider value available for directions that support it.
  const prior=movementDirection.dataset.previous??"forward";
  try{
    if(!EXPERIMENTAL_KAYKIT_REVIEW&&selected.startsWith("backward") &&
      Number(movementSpeed.value)>.65){
      viewport.setMovementPreviewSpeed(.65);
      movementSpeed.value=".65";
    }
    viewport.setMovementPreviewDirection(selected as
      Parameters<typeof viewport.setMovementPreviewDirection>[0]);
    movementDirection.dataset.previous=selected;
    movementSpeed.disabled=selected.startsWith("turn-");
    movementSpeedValue.textContent=movementPaceLabel(Number(movementSpeed.value),selected);
  }catch(error){
    console.error("Unsupported authored movement",error);
    movementDirection.value=prior;
    movementSpeed.disabled=prior.startsWith("turn-");
  }
});
movementSpeed.addEventListener("input",()=>{
  const requested=Number(movementSpeed.value);
  const direction=movementDirection.value;
  // No backward-sprint source in the approved 27-clip inventory.
  const speed=!EXPERIMENTAL_KAYKIT_REVIEW && direction.startsWith("backward")?
    Math.min(.65,requested):requested;
  try{
    viewport.setMovementPreviewSpeed(speed);
    movementSpeed.value=String(speed);
    movementSpeedValue.textContent=movementPaceLabel(speed,direction);
  }catch(error){
    console.error("Unsupported authored movement",error);
  }
});
const animationTime=element<HTMLInputElement>("#studio-animation-time");
const animationPlay=element<HTMLButtonElement>("#studio-animation-play");
const animationReset=element<HTMLButtonElement>("#studio-animation-reset");
const animationBack=element<HTMLButtonElement>("#studio-animation-back");
const animationNext=element<HTMLButtonElement>("#studio-animation-next");
const animationStatic=element<HTMLButtonElement>("#studio-animation-static");
const animationClock=element<HTMLOutputElement>("#studio-animation-clock");
const animationSpeed=element<HTMLSelectElement>("#studio-animation-speed");
const animationLoop=element<HTMLInputElement>("#studio-animation-loop");
for(const clip of STUDIO_ANIMATIONS)animationSelect.add(new Option(clip.label,clip.id));
function syncAnimation(state:StudioAnimationState|undefined):void {
  const active=!!state;
  animationSelect.value=state?.clipId??"";
  movementSettings.hidden=state?.clipId!=="locomotion-preview";
  for(const control of [animationTime,animationPlay,animationReset,animationBack,animationNext,animationStatic])
    control.disabled=!active;
  animationTime.max=String(state?.durationSeconds??1);
  animationTime.value=String(state?.timeSeconds??0);
  animationClock.textContent=(state?.timeSeconds??0).toFixed(2)+" / "+
    (state?.durationSeconds??0).toFixed(2)+" s";
  animationPlay.textContent=state?.playing?"Pause":"Play";
  animationPlay.setAttribute("aria-label",state?.playing?"Pause animation":"Play animation");
  if(state){
    animationSpeed.value=String(state.speed);
    animationLoop.checked=state.loop;
  }
}
animationSelect.addEventListener("change",async()=>{
  const requested=animationSelect.value||null;
  try{
    // Do not preload 4.54MB of approved directional poses on Studio startup.
    // Demand-load only when the user enters the locomotion mixer.
    if(requested==="locomotion-preview"&&!EXPERIMENTAL_KAYKIT_REVIEW){
      const {installKevinC63Review}=await import("./StudioKevinC63ReviewLibrary");
      installKevinC63Review();
    }
    // An asynchronous import must not restore a stale user selection.
    if((animationSelect.value||null)!==requested)return;
    viewport.selectAnimation(requested);
  }catch(error){
    console.error("Studio animation unavailable",error);
    viewport.selectAnimation(null);
  }
});
animationPlay.addEventListener("click",()=>viewport.playAnimation(animationPlay.textContent==="Play"));
animationTime.addEventListener("input",()=>viewport.seekAnimation(Number(animationTime.value)));
animationReset.addEventListener("click",()=>viewport.resetAnimation());
animationBack.addEventListener("click",()=>viewport.stepAnimation(-1));
animationNext.addEventListener("click",()=>viewport.stepAnimation(1));
animationStatic.addEventListener("click",()=>viewport.selectAnimation(null));
animationSpeed.addEventListener("change",()=>viewport.setAnimationSpeed(Number(animationSpeed.value)));
animationLoop.addEventListener("change",()=>viewport.setAnimationLoop(animationLoop.checked));
const poseSelect=element<HTMLSelectElement>("#studio-pose-select");
const expressionSelect=element<HTMLSelectElement>("#studio-expression-select");
const swordSelect=element<HTMLSelectElement>("#studio-sword-hand");
const swordFocus=element<HTMLButtonElement>("#studio-sword-focus");
const shieldFocus=element<HTMLButtonElement>("#studio-shield-focus");
const shieldPose=element<HTMLElement>("#studio-shield-pose");
const archeryPose=element<HTMLElement>("#studio-archery-pose");
const archeryState=element<HTMLSelectElement>("#studio-archery-state");
const archeryDraw=element<HTMLInputElement>("#studio-archery-draw");
const bowProfile=element<HTMLSelectElement>("#studio-bow-profile");
bowProfile.addEventListener("change",()=>{
  if(Object.hasOwn(BOW_PROFILES,bowProfile.value))
    viewport.setBowProfile(bowProfile.value as BowProfile);
});
archeryState.addEventListener("change",()=>{
  if(Object.hasOwn(ARCHERY_STATES,archeryState.value))
    viewport.setArcheryState(archeryState.value as ArcheryState);
});
archeryDraw.addEventListener("input",()=>{
  viewport.setArcheryDraw(Number(archeryDraw.value)/100);
});
const shieldStance=element<HTMLSelectElement>("#studio-shield-stance");
shieldStance.addEventListener("change",()=>{
  viewport.setShieldStance(shieldStance.value as ShieldStance);
});
swordFocus.disabled=true;
swordSelect.addEventListener("change",()=>{
  const hand=swordSelect.value as EquipmentChoice;
  if(!["none","left","right","longsword-left","longsword-right",
    "staff-left","staff-right","sword-shield-left","sword-shield-right",
    "bow-left","bow-right"].includes(hand))return;
  viewport.setEquipment(hand);
  swordFocus.disabled=hand==="none";
  const dual=isSwordShieldEquipment(hand);
  shieldPose.hidden=!dual;shieldFocus.hidden=!dual;
  archeryPose.hidden=!isBowEquipment(hand);
});
shieldFocus.addEventListener("click",()=>{
  const mode=swordSelect.value as EquipmentChoice;
  if(!isSwordShieldEquipment(mode))return;
  const area=(shieldHand(mode.endsWith("right")?"right":"left")+"-hand") as StudioFocus;
  focusArea.value=area;
  if(viewport.focus(area)){
    focused=true;
    element<HTMLButtonElement>("#studio-return-focus").disabled=false;
    setPressed("view","");
  }
});
swordFocus.addEventListener("click",()=>{
  const hand=primaryHand(swordSelect.value as EquipmentChoice);
  if(!hand)return;
  const area=(hand+"-hand") as StudioFocus;
  focusArea.value=area;
  if(viewport.focus(area)){
    focused=true;
    element<HTMLButtonElement>("#studio-return-focus").disabled=false;
    setPressed("view","");
  }
});
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
    description:"One click creates a completely new human with randomly different features, build and appearance."},
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
    element(".studio-settings").hidden=editing||id==="pose"||id==="inspection"||id==="generate";
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

}
void bootstrapStudio().catch(error=>{
  console.error("Studio animation review initialization failed",error);
  const host=document.querySelector<HTMLElement>("#studio-app");
  if(host)host.textContent="Unable to initialize Character Studio animation review.";
});
