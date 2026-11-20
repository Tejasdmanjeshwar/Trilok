import {parseStudioGeneratorSeed,type GeneratorDifference} from "./StudioGenerator";
import {StudioGenerationTiming,type GenerationTimingPhase} from "./StudioGenerationTiming";
import {getBuildIdentity} from "../build-info";
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
    <div class="studio-generator-diagnostics">
      <p>Slow generation? Copy a local timing report after the first and second attempts.
        Nothing is uploaded automatically. The report includes your browser details and
        the reproducible seed.</p>
      <button id="studio-generator-copy-timing" type="button" disabled>Copy timing report</button>
      <p id="studio-generator-timing-status" role="status" aria-live="polite"></p>
      <textarea id="studio-generator-timing-report" rows="10" readonly hidden
        aria-label="Generation timing report to copy manually"></textarea>
    </div>
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
  const timings=new StudioGenerationTiming();
  const copyTiming=panel.querySelector<HTMLButtonElement>("#studio-generator-copy-timing")!;
  const timingStatus=panel.querySelector<HTMLElement>("#studio-generator-timing-status")!;
  const timingText=panel.querySelector<HTMLTextAreaElement>("#studio-generator-timing-report")!;
  const longTasks:{startMs:number;durationMs:number}[]=[];
  let longTaskObserver:PerformanceObserver|undefined;
  if(typeof PerformanceObserver!=="undefined"&&
    PerformanceObserver.supportedEntryTypes.includes("longtask")){
    try{
      longTaskObserver=new PerformanceObserver(list=>{
        for(const entry of list.getEntries()){
          longTasks.push({startMs:entry.startTime,durationMs:entry.duration});
          if(longTasks.length>150)longTasks.shift();
        }
      });
      longTaskObserver.observe({type:"longtask",buffered:true});
    }catch{longTaskObserver=undefined;}
  }
  function metricsSnapshot():unknown {
    let value:unknown=null;
    const receive=(event:Event):void=>{
      value=(event as CustomEvent<unknown>).detail;
    };
    window.addEventListener("trilok:studio:metrics",receive);
    try{window.dispatchEvent(new Event("trilok:studio:request-metrics"));}
    finally{window.removeEventListener("trilok:studio:metrics",receive);}
    return value;
  }
  function report():string {
    const resources=(performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter(entry=>{
        try{
          const path=new URL(entry.name).pathname;
          return path.startsWith("/anatomy/")||path.startsWith("/assets/");
        }catch{return false;}
      }).slice(-40).map(entry=>({
        path:new URL(entry.name).pathname,
        startMs:Math.round(entry.startTime),
        durationMs:Math.round(entry.duration),
        transferBytes:entry.transferSize,
        decodedBytes:entry.decodedBodySize,
      }));
    const connection=(navigator as Navigator&{connection?:{
      effectiveType?:string;downlink?:number;rtt?:number;
    }}).connection;
    const heap=(performance as Performance&{memory?:{
      usedJSHeapSize:number;totalJSHeapSize:number;jsHeapSizeLimit:number;
    }}).memory;
    const tasks=longTasks.map(task=>({
      atMs:Math.round(task.startMs),durationMs:Math.round(task.durationMs),
    }));
    return JSON.stringify({
      schema:"trilok-studio-generation-timing.v1",
      build:getBuildIdentity().commitSha,
      capturedAt:new Date().toISOString(),
      explanation:"Durations are browser wall-clock estimates, not GPU timings; "+
        "source:* stages can overlap their parent source stage. "+
        "A running attempt may be copied before completion.",
      environment:{
        userAgent:navigator.userAgent,
        hardwareConcurrency:navigator.hardwareConcurrency??null,
        online:navigator.onLine,
        connection:connection?{
          effectiveType:connection.effectiveType??null,
          downlinkMbps:connection.downlink??null,
          rttMs:connection.rtt??null,
        }:null,
        usedJsHeapMB:heap?Math.round(heap.usedJSHeapSize/1048576):null,
      },
      studio:metricsSnapshot(),
      attempts:timings.snapshot(performance.now()),
      longTasks:{
        observed:tasks.length,
        totalDurationMs:Math.round(tasks.reduce((sum,task)=>sum+task.durationMs,0)),
        longestMs:Math.max(0,...tasks.map(task=>task.durationMs)),
        entries:tasks.slice(-35),
      },
      resourceTimings:resources,
    },null,2);
  }
  copyTiming.addEventListener("click",()=>{
    const text=report();
    timingText.value=text;timingText.hidden=false;
    timingStatus.textContent="Report shown below. Copy it and paste it into the chat.";
    if(navigator.clipboard?.writeText){
      void navigator.clipboard.writeText(text).then(()=>{
        if(!disposed)timingStatus.textContent=
          "Timing report copied. Paste it into the chat.";
      }).catch(()=>{
        if(!disposed)timingStatus.textContent=
          "Clipboard unavailable. Select the report below and copy it manually.";
      });
    }else timingStatus.textContent=
      "Clipboard unavailable. Select the report below and copy it manually.";
  });
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
    const detail=(event as CustomEvent<{
      stage?:unknown;phase?:unknown;durationMs?:unknown;
    }>).detail;
    const stage=typeof detail?.stage==="string"?detail.stage:"";
    const phase:GenerationTimingPhase=detail?.phase==="start"?"start":"end";
    const ms=typeof detail?.durationMs==="number"?detail.durationMs:undefined;
    timings.stage(stage,phase,performance.now(),ms);
    if(phase==="start"&&Object.hasOwn(stageMessages,stage))
      feedback.textContent=stageMessages[stage]!;
  };
  window.addEventListener("trilok:studio:generation-stage",onStage);

  async function run(seed:number):Promise<void> {
    if(running||disposed)return;
    running=true;
    timings.begin(seed,performance.now(),new Date().toISOString());
    copyTiming.disabled=false;
    timingStatus.textContent="Generation running. Copy the current timing at any point.";
    timingText.hidden=true;
    create.disabled=true;manual.disabled=true;seedInput.disabled=true;
    seedInput.setAttribute("aria-invalid","false");
    feedback.textContent="Creating a new character…";
    let status:"success"|"failed"="failed";
    try {
      const result=await generate(seed);
      status=result?"success":"failed";
      if(disposed)return;
      feedback.textContent=result?
        "Character generated from seed "+seed+". Adjust any detail or use Undo to go back.":
        "Couldn't finish this character. Your previous design is safe. Try again.";
    }catch{
      if(!disposed)feedback.textContent=
        "Couldn't finish this character. Your previous design is safe. Try again.";
    }finally{
      timings.finish(status,performance.now());
      running=false;
      if(!disposed){
        create.disabled=false;manual.disabled=false;seedInput.disabled=false;
        const last=timings.snapshot(performance.now()).at(-1);
        timingStatus.textContent="Attempt "+last?.attempt+": "+
          (last?.elapsedMs??0).toFixed(0)+" ms · Copy timing report to share.";
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
    dispose(){
      disposed=true;longTaskObserver?.disconnect();
      window.removeEventListener("trilok:studio:generation-stage",onStage);
      panel.remove();
    },
  };
}
