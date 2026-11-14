import * as THREE from "three";
import { createHumanLocalRecipe, DEFAULT_HUMAN_LOCAL_MORPHOLOGY,
  type HumanLocalMorphologyV1, createHumanHeadRecipe,
  DEFAULT_HUMAN_HEAD_MORPHOLOGY, type HumanHeadMorphologyV1,
  } from "@trilok/character-core";
import { applyHumanMorphology, getHumanHeadLandmarks } from "../geometry/HumanMorphology";
import { HumanPoseCorrectives } from "../geometry/HumanPoseCorrectives";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createContinuousHumanPrototype } from "../geometry/ContinuousHumanPrototype";
import { loadAnatomicalHuman, type AnatomicalHuman, type AnatomicalLoadStage } from "../geometry/AnatomicalTemplate";
import { validateSkinningSpike, type SkinningSpike } from "../geometry/SkinningSpike";
import { AnatomicalFK } from "../geometry/AnatomicalFK";
import { anatomicalPoseById, resolveAnatomicalPose } from "../geometry/AnatomicalPoseMatrix";
import { createCharacterLabControls } from "./CharacterLabControls";
import { BoneInspector } from "./BoneInspector";
import { frameSelectedAnatomicalBone } from "./LabCameraFocus";
import {ALL_FACIAL_CONTROLS as FACIAL_CONTROLS,FACIAL_PRESETS,MakeHumanFacialController,loadFacialAtlas,
  type FacialWeights,type FacialDiagnostics} from "../geometry/MakeHumanFacialTargets";

import {BODY_CONTROLS,BODY_PRESETS,MakeHumanBodyController,loadBodyAtlas,
  setBodyAncestryChannel,type BodyWeights,type BodyDiagnostics} from "../geometry/MakeHumanBodyTargets";

const viewport=document.querySelector<HTMLDivElement>("#viewport");
const status=document.querySelector<HTMLElement>("#status");
const error=document.querySelector<HTMLElement>("#error");
if(!viewport||!status||!error)throw new Error("Missing laboratory controls");

type Preview = {spike:SkinningSpike;mesh:THREE.SkinnedMesh;vertexCount:number;
  triangleCount:number;dispose():void;template?:AnatomicalHuman["template"];
  rigDiagnostics?:AnatomicalHuman["rigDiagnostics"];
  jawTipWorldRest?:AnatomicalHuman["jawTipWorldRest"]};
let stopping=false;
let active:Preview|undefined;
let fk:AnatomicalFK|undefined;
let correctives:HumanPoseCorrectives|undefined;
let overlay:THREE.SkeletonHelper|undefined;
let inspector:BoneInspector|undefined;
let renderer:THREE.WebGLRenderer|undefined;
let frame=0;
let surface="template";
let currentPose="neutral";
let currentView="front";
let facialController:MakeHumanFacialController|undefined;
let facialDiagnostics:FacialDiagnostics|undefined;
const facialPanel=document.querySelector<HTMLElement>("#c35-facial-controls");
const facialPreset=document.querySelector<HTMLSelectElement>("#c35-facial-preset");
const facialStatus=document.querySelector<HTMLElement>("#c35-facial-diagnostics");
const facialInputs=new Map<string,HTMLInputElement>();
let facialWeights:Record<string,number>={};
const facialActive=()=>Object.values(facialWeights).some(v=>v!==0);
function buildFacialControls():void{
  if(!facialPanel)return;
  let group="";
  for(const control of FACIAL_CONTROLS){
    if(group!==control.group){
      group=control.group;
      const heading=document.createElement("h3");
      heading.textContent=group;heading.className="facial-group-heading";
      facialPanel.append(heading);
    }
    const label=document.createElement("label");label.className="facial-slider";
    const title=document.createElement("span");title.textContent=control.label;
    const readout=document.createElement("output");readout.textContent="0.00";
    const slider=document.createElement("input");
    slider.type="range";slider.min=String(control.min);slider.max=String(control.max);
    slider.step="0.05";slider.value="0";
    slider.dataset.facialControl=control.id;
    slider.setAttribute("aria-label",control.label);
    slider.title=control.description??"Native MakeHuman ranges: [-1,1] or [0,1]; 1.25 is deliberate unsupported extrapolation";
    slider.addEventListener("input",()=>{
      const value=Number(slider.value);
      if(value===0)delete facialWeights[control.id];
      else facialWeights[control.id]=value;
      readout.value=value.toFixed(2);
      if(facialPreset)facialPreset.value="custom";
      updateFacialPreview();
    });
    label.append(title,readout,slider);facialPanel.append(label);
    facialInputs.set(control.id,slider);
  }
}
function syncFacialInputs():void{
  for(const control of FACIAL_CONTROLS){
    const value=facialWeights[control.id]??0;
    const input=facialInputs.get(control.id);
    if(!input)continue;
    input.value=String(value);
    const output=input.parentElement?.querySelector("output");
    if(output)output.value=value.toFixed(2);
  }
}
function updateFacialPreview():void{
  if(!facialController)return;
  try{
    facialDiagnostics=facialController.apply(facialWeights);
    if(facialStatus)facialStatus.textContent=
      "Source-affected vertices: "+facialDiagnostics.affectedVertices+
      " · triangles: "+facialDiagnostics.triangleCount+
      " · inverted: "+facialDiagnostics.invertedTriangles+
      " · collapsed: "+facialDiagnostics.collapsedTriangles+
      " · stretched: "+facialDiagnostics.stretchedTriangles+
      " · UV seam mismatches: "+facialDiagnostics.seamMismatches+
      " · nonfinite: "+facialDiagnostics.finiteFailures+
      " · max edge stretch: "+facialDiagnostics.maxEdgeStretch.toFixed(2)+"×"+
      " · CPU apply: "+facialDiagnostics.elapsedMs.toFixed(1)+"ms";
    document.documentElement.dataset.c35FacialReady="true";
    document.documentElement.dataset.c35Inversions=String(facialDiagnostics.invertedTriangles);
  }catch(e){
    document.documentElement.dataset.c35FacialReady="false";
    if(facialStatus)facialStatus.textContent="Facial deformation error: "+String(e);
  }
}
buildFacialControls();
facialPreset?.addEventListener("change",()=>{
  const preset=FACIAL_PRESETS[facialPreset.value];
  if(!preset)return;
  facialWeights={...preset};syncFacialInputs();updateFacialPreview();
});
document.querySelector<HTMLButtonElement>("#c35-reset-facial")?.addEventListener(
  "click",()=>{
    facialWeights={};syncFacialInputs();
    if(facialPreset)facialPreset.value="neutral";
    updateFacialPreview();
  });
let bodyDiagnostics:BodyDiagnostics|undefined;
const bodyPanel=document.querySelector<HTMLElement>("#c36-body-controls");
const bodyPreset=document.querySelector<HTMLSelectElement>("#c36-body-preset");
const bodyStatus=document.querySelector<HTMLElement>("#c36-body-diagnostics");
const bodyInputs=new Map<string,HTMLInputElement>();
let bodyWeights:Record<string,number>={};
let requestBodyRebuild:()=>void=()=>{};
let bodyInputDelay:ReturnType<typeof setTimeout>|undefined;
const applyBodyInput=(id:string,value:number,immediate=false):void=>{
  bodyWeights=id==="macro/african"||id==="macro/asian"||id==="macro/caucasian"?
    {...setBodyAncestryChannel(bodyWeights,id.slice(6) as "african"|"asian"|"caucasian",value)}:
    {...bodyWeights,[id]:value};
  if(id==="macro/african"||id==="macro/asian"||id==="macro/caucasian")
    syncBodyInputs();
  if(bodyPreset)bodyPreset.value="custom";
  if(bodyInputDelay!==undefined)clearTimeout(bodyInputDelay);
  bodyInputDelay=undefined;
  if(immediate)requestBodyRebuild();
  else bodyInputDelay=setTimeout(()=>{bodyInputDelay=undefined;requestBodyRebuild();},160);
};
function buildBodyControls():void{
  if(!bodyPanel)return;
  const groups=new Map<string,HTMLElement>();
  for(const c of BODY_CONTROLS){
    let group=groups.get(c.group);
    if(!group){
      const details=document.createElement("details");
      details.className="body-controls-group";
      const heading=document.createElement("summary");
      heading.textContent=c.group;
      details.append(heading);
      bodyPanel.append(details);
      groups.set(c.group,details);
      group=details;
    }
    const label=document.createElement("label");
    label.className="facial-slider";
    const title=document.createElement("span");
    title.textContent=c.label;
    const output=document.createElement("output");
    output.textContent="0.00";
    const slider=document.createElement("input");
    slider.type="range";slider.min=String(c.min);slider.max=String(c.max);
    slider.step=c.id.includes("macro/")?"0.001":"0.05";
    slider.dataset.bodyControl=c.id;
    slider.value=String(c.id==="stress/gain"?1:c.id.startsWith("macro/")?
      (["macro/african","macro/asian","macro/caucasian"].includes(c.id)?1/3:.5):0);
    slider.setAttribute("aria-label",c.label);
    slider.title=c.id.startsWith("native/")?
      "Original MakeHuman native range "+c.nativeMin+".."+c.nativeMax+
      ". Values beyond ±1 are unsupported stress extrapolation.":
      "Source-indexed MakeHuman macro dependency preview";
    slider.addEventListener("input",()=>{
      output.value=Number(slider.value).toFixed(2);
      applyBodyInput(c.id,Number(slider.value));
    });
    slider.addEventListener("change",()=>{
      applyBodyInput(c.id,Number(slider.value),true);
    });
    label.append(title,output,slider);group.append(label);
    bodyInputs.set(c.id,slider);
  }
}
function syncBodyInputs():void{
  for(const c of BODY_CONTROLS){
    const slider=bodyInputs.get(c.id);
    if(!slider)continue;
    const def=c.id==="stress/gain"?1:c.id.startsWith("macro/")?
      (["macro/african","macro/asian","macro/caucasian"].includes(c.id)?1/3:.5):0;
    const value=bodyWeights[c.id]??def;
    slider.value=String(value);
    const output=slider.parentElement?.querySelector("output");
    if(output)output.value=value.toFixed(2);
  }
}
buildBodyControls();
bodyPreset?.addEventListener("change",()=>{
  if(bodyInputDelay!==undefined)clearTimeout(bodyInputDelay);
  bodyInputDelay=undefined;
  bodyWeights={...(BODY_PRESETS[bodyPreset.value]??{})};
  syncBodyInputs();requestBodyRebuild();
});
document.querySelector<HTMLButtonElement>("#c36-reset-body")?.addEventListener(
  "click",()=>{
    if(bodyInputDelay!==undefined)clearTimeout(bodyInputDelay);
    bodyInputDelay=undefined;
    bodyWeights={};syncBodyInputs();
    if(bodyPreset)bodyPreset.value="neutral";
    requestBodyRebuild();
  });
const morphPresets: Readonly<Record<string, Partial<HumanLocalMorphologyV1>>> = {
  neutral:{}, shoulders:{shoulders:1.10}, chest:{chest:1.10},
  waist:{waist:0.90}, hips:{hips:1.10}, arms:{arms:1.06},
  legs:{legs:1.06}, stress:{shoulders:1.10,chest:1.10,waist:0.90,
    hips:1.10,arms:1.06,legs:1.06},
};
const morphologySelect = document.querySelector<HTMLSelectElement>("#morph-preset");
const headPresetSelect = document.querySelector<HTMLSelectElement>("#head-preset");
type HeadKey = "skullWidth" | "skullHeight" | "forehead" | "brow" |
  "cheeks" | "jawWidth" | "chin" | "faceDepth" | "eyeSpacing";
const headKeys = ["skullWidth","skullHeight","forehead","brow","cheeks",
  "jawWidth","chin","faceDepth","eyeSpacing"] as const;
const headPresets: Readonly<Record<string, Partial<HumanHeadMorphologyV1>>> = {
  neutral:{}, broad:{skullWidth:1.10,cheeks:1.07},
  long:{skullHeight:1.07,forehead:1.06},
  brow:{brow:1.08,eyeSpacing:1.04,faceDepth:1.05},
  jaw:{jawWidth:1.09,chin:1.08,cheeks:1.06},
  stress:{skullWidth:1.10,skullHeight:1.07,forehead:1.07,
    brow:1.08,cheeks:1.08,jawWidth:1.09,chin:1.08,
    faceDepth:1.06,eyeSpacing:1.05},
};
const headSliders = new Map<HeadKey, HTMLInputElement>();
for (const key of headKeys) {
  const slider=document.querySelector<HTMLInputElement>('[data-head-param="'+key+'"]');
  if(!slider)throw new Error("Missing C3.4 head parameter "+key);
  headSliders.set(key,slider);
}
const readHeadOverrides=():Partial<HumanHeadMorphologyV1> =>
  Object.fromEntries(headKeys.map(key=>[key,Number(headSliders.get(key)!.value)])) as
    Partial<HumanHeadMorphologyV1>;
const headIsActive=():boolean => headKeys.some(key=>
  Number(headSliders.get(key)!.value)!==1);
const syncHeadValues=():void => {
  for (const key of headKeys) {
    const output=document.querySelector<HTMLOutputElement>('[data-head-value="'+key+'"]');
    if(output)output.value=Number(headSliders.get(key)!.value).toFixed(2);
  }
};
syncHeadValues();
const performancePanel=document.querySelector<HTMLElement>("#c25-metrics");
const stageTimings=new Map<AnatomicalLoadStage,number>();
let lastPoseApplyMs:number|undefined;
let lastCpuSampleMs:number|undefined;
let lastRenderSubmitMs:number|undefined;
let frameIntervals:number[]=[];
let previousFrameTime:number|undefined;
let renderTicks=0;
function publishMetrics():void {
  if(!performancePanel)return;
  const orderedStages:readonly AnatomicalLoadStage[]=[
    "obj-fetch","obj-parse","rig-fetch","rig-json","weight-json",
    "fk-calibration","shoulder-motion-sampling","skin-influence-fitting",
    "total-instantiation",
  ];
  const rows=orderedStages.map(stage=>stageTimings.has(stage)?
    stage+": "+stageTimings.get(stage)!.toFixed(2)+" ms":undefined)
    .filter((entry):entry is string=>entry!==undefined);
  if(lastPoseApplyMs!==undefined)rows.push("last FK pose: "+lastPoseApplyMs.toFixed(2)+" ms");
  if(lastCpuSampleMs!==undefined)rows.push("256-vertex CPU skin sample: "+
    lastCpuSampleMs.toFixed(2)+" ms");
  if(lastRenderSubmitMs!==undefined)rows.push("last JS render submission: "+
    lastRenderSubmitMs.toFixed(2)+" ms (NOT GPU time)");
  if(frameIntervals.length>=20){
    const ordered=[...frameIntervals].sort((a,b)=>a-b);
    const median=ordered[Math.floor(ordered.length/2)]!;
    rows.push("observed RAF median interval: "+median.toFixed(2)+" ms / "+
      (1000/median).toFixed(1)+" FPS (includes scheduling)");
  }
  performancePanel.textContent=rows.join("\n")||"No anatomical timing samples yet.";
}
const scene=new THREE.Scene();scene.background=new THREE.Color(0x242b34);
const camera=new THREE.PerspectiveCamera(42,1,.1,80);
camera.position.set(1.75,1.55,2.9);camera.lookAt(0,1,0);
try{
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewport.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.set(0,.96,0);
  controls.enableDamping=!matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Read-only diagnostic for phase-gated camera continuity tests. Updated on
  // user orbit/pan/zoom or explicit view selection, never every render frame.
  const publishCameraState=()=>{
    viewport.dataset.cameraState=JSON.stringify([
      ...camera.position.toArray(),...controls.target.toArray(),camera.zoom,
    ]);
  };
  controls.addEventListener("change",publishCameraState);
  controls.update();
  publishCameraState();
  scene.add(new THREE.HemisphereLight(0xe9e5df,0x4d5156,2.2));
  const light=new THREE.DirectionalLight(0xffffff,2);
  light.position.set(3,6,4);scene.add(light);
  const grid=new THREE.GridHelper(4,16,0x86919d,0x515e6a);
  grid.position.y=-.01;scene.add(grid);
  const selected=(name:string)=>document.querySelector<HTMLInputElement>('[data-debug="'+name+'"]')?.checked??false;
  const refreshOverlay=()=>{
    overlay?.removeFromParent();
    overlay?.geometry.dispose();
    if(overlay?.material instanceof THREE.Material)overlay.material.dispose();
    overlay=undefined;
    if(active&&selected("skeleton")){
      overlay=new THREE.SkeletonHelper(active.spike.character.root);
      const lineMaterial=overlay.material as THREE.LineBasicMaterial;
      lineMaterial.depthTest=false;lineMaterial.transparent=true;
      scene.add(overlay);
    }
  };
  const details=()=>{
    if(!active)return;
    const t=active.template;
    status!.textContent="C2 diagnostic ready · "+surface+" · "+currentPose+" · "+
      "morphology "+(morphologySelect?.value??"neutral")+
      " · head "+(headIsActive()?(headPresetSelect?.value??"custom"):"original")+" · "+
      active.vertexCount.toLocaleString()+" vertices · "+
      active.triangleCount.toLocaleString()+" triangles"+
      (t?" · "+t.sourceVertexCount.toLocaleString()+" source vertices · "+
       t.connectedComponents+" topology components · "+t.sourceHeight.toFixed(3)+" source height units · "+t.boundaryEdgeCount+
       " boundary / "+t.nonManifoldEdgeCount+" non-manifold edges"+
       (active.rigDiagnostics?" · CC0 rig "+active.rigDiagnostics.mappedBones+" weighted bones · "+
       active.rigDiagnostics.unweightedVertices+" unweighted vertices · "+
       active.rigDiagnostics.maxBindDisplacementMeters.toFixed(3)+"m max bind correction":"")
       :" · implicit fallback");
  };
  /** Actual imported-source regression: verify signed hand movement in the
   * WebGL rig, not just the schematic C1 unit-test hand. Each individual
   * joint is assessed in isolation before restoring the calibrated rest. */
  function verifyCalibratedHandMotions():void {
    if(!active||!fk)return;
    const joint=(side:"left"|"right",digit:string,index:number)=>
      active!.spike.graph.joints.find(j=>j.role==="finger_"+digit+"_"+index &&
        j.id.includes("arm["+side+","));
    const world=(id:string)=>active!.spike.bones.get(id)!.getWorldPosition(new THREE.Vector3());
    for(const side of ["left","right"] as const){
      const palmar=fk.palmarNormals.get(side)!;
      const wrist=active.spike.graph.joints.find(j=>j.role==="wrist_"+side)!;
      const thumb=joint(side,"thumb",1)!;
      if(world(thumb.id).clone().sub(world(wrist.id)).dot(palmar)<=0)
        throw new Error("Imported "+side+" hand palmar normal faces dorsally");
      for(const digit of ["index","middle","ring","little"]){
        for(let index=0;index<3;index++){
          const target=joint(side,digit,index)!;
          const bone=active.spike.bones.get(target.id)!;
          const current=world(target.id);
          const previous=index>0?world(joint(side,digit,index-1)!.id):
            world(active.spike.graph.joints.find(j=>j.role==="palm_"+side)!.id);
          const restEnd=index<2?world(joint(side,digit,index+1)!.id):
            current.clone().add(current.clone().sub(previous));
          const probe=bone.worldToLocal(restEnd.clone());
          fk.apply([{jointId:target.id,motion:"flexion",radians:.6}]);
          const displacement=bone.localToWorld(probe.clone()).sub(restEnd).dot(palmar);
          fk.apply([]);
          if(displacement<=.00001)
            throw new Error("Imported "+side+" "+digit+" joint "+index+" bends dorsally");
        }
      }
      const base=joint(side,"thumb",0)!;
      const ring=joint(side,"ring",0)!;
      const initial=world(thumb.id).distanceTo(world(ring.id));
      fk.apply([{jointId:base.id,motion:"opposition",radians:.7}]);
      const opposed=world(thumb.id).distanceTo(world(ring.id));
      fk.apply([]);
      if(opposed>=initial-.00001)
        throw new Error("Imported "+side+" thumb does not oppose across palm");
    }
    document.documentElement.dataset.c2Directions="passed";
  }
  /** Probe the source-defined chin tip after mandibular rotation. The
   * imported jaw may not visibly open despite nonzero quaternion rotation,
   * so require actual downward movement relative to a stable head. */
  function verifyCalibratedJawOpening():void {
    if(!active||!fk||!active.jawTipWorldRest)return;
    const jawJoint=active.spike.graph.joints.find(j=>j.role==="jaw");
    const headJoint=active.spike.graph.joints.find(j=>j.role==="head");
    if(!jawJoint||!headJoint)throw new Error("Missing CC0 jaw/head semantic joints");
    const jawBone=active.spike.bones.get(jawJoint.id)!;
    const headBone=active.spike.bones.get(headJoint.id)!;
    const chin=active.jawTipWorldRest.clone();
    const local=jawBone.worldToLocal(chin.clone());
    const restHead=headBone.getWorldPosition(new THREE.Vector3());
    fk.apply([{jointId:jawJoint.id,motion:"flexion",radians:.4}]);
    const openedChin=jawBone.localToWorld(local.clone());
    const openedHead=headBone.getWorldPosition(new THREE.Vector3());
    fk.apply([]);
    if(openedChin.y>=chin.y-.001)
      throw new Error("Imported jaw closure instead of opening: chin did not descend");
    if(openedHead.distanceTo(restHead)>1e-7)
      throw new Error("Opening jaw also moved the cranial hinge/head");
    document.documentElement.dataset.c2JawDirection="passed";
  }
  function applyPose(name:string):void {
    if(!active||!fk)return;
    currentPose=name;
    const targets=resolveAnatomicalPose(anatomicalPoseById(name),active.spike.graph,fk);
    const poseStart=performance.now();
    fk.apply(targets);
    correctives?.apply(targets);
    active.spike.character.root.updateWorldMatrix(true,true);
    lastPoseApplyMs=performance.now()-poseStart;
    // Explicit, bounded diagnostic sampling; not part of normal rendering.
    const cpuStart=performance.now();
    const total=active.mesh.geometry.getAttribute("position").count;
    const temp=new THREE.Vector3();
    for(let k=0;k<256;k++)
      active.mesh.getVertexPosition(Math.floor(k*(total-1)/255),temp);
    lastCpuSampleMs=performance.now()-cpuStart;
    publishMetrics();
    inspector?.update();
    details();
  }
  const applyDebug=()=>{
    if(!active)return;
    const material=active.mesh.material as THREE.MeshStandardMaterial;
    material.wireframe=selected("wireframe");
    refreshOverlay();
  };
  let request=0;
  requestBodyRebuild=()=>{void switchSurface("template",true);};
  // Morphology rebuilds change only the owned anatomical surface. Preserve
  // manually orbited/panned/zoomed camera and OrbitControls target; only a
  // user-selected camera view or an explicit source switch may reframe.
  async function switchSurface(name:string,preserveCamera=false):Promise<void> {
    if(stopping)return;
    const ticket=++request;
    status!.textContent="Loading "+name+" geometry…";
    error!.textContent="";
    let preview:Preview;
    const sampleTimings=new Map<AnatomicalLoadStage,number>();
    try {
      if(name==="template"){
        const anatomical=await loadAnatomicalHuman(undefined,
          (stage,ms)=>sampleTimings.set(stage,ms));
        preview=anatomical;
        const preset=morphologySelect?.value??"neutral";
        const params=morphPresets[preset];
        if(!params)throw new Error("Unknown morphology preset "+preset);
        if(preset!=="neutral" || headIsActive()){
          try{
            if(headIsActive()){
              applyHumanMorphology(anatomical,createHumanHeadRecipe({
                ...DEFAULT_HUMAN_HEAD_MORPHOLOGY,...params,...readHeadOverrides(),
              }));
              if(!getHumanHeadLandmarks(anatomical))
                throw new Error("Missing calibrated C3.4 orbital landmarks");
            }else{
              applyHumanMorphology(anatomical,createHumanLocalRecipe({
                ...DEFAULT_HUMAN_LOCAL_MORPHOLOGY,...params,
              }));
            }
          }catch(error){anatomical.dispose();throw error;}
        }
      }
      else preview=createContinuousHumanPrototype({step:.047});
      validateSkinningSpike(preview.spike);
    }catch(e){
      if(name==="template") {
        error!.textContent="Template unavailable: "+String(e)+
          ". Showing the existing implicit prototype (not anatomical signoff).";
        if(ticket!==request||stopping)return;
        preview=createContinuousHumanPrototype({step:.047});
        name="implicit";
      }else{
        error!.textContent="C2 generation failed: "+String(e);
        status!.textContent="C2 laboratory unavailable";
        return;
      }
    }
    if(stopping||ticket!==request){preview.dispose();return;}
    facialController?.dispose();facialController=undefined;
    facialDiagnostics=undefined;
    bodyDiagnostics=undefined;
    if(name==="template"&&Object.keys(bodyWeights).length>0){
      try{
        const atlas=await loadBodyAtlas();
        if(stopping||ticket!==request){preview.dispose();return;}
        const controller=new MakeHumanBodyController(preview as AnatomicalHuman,atlas);
        bodyDiagnostics=controller.apply(bodyWeights);
        controller.dispose();
        if(bodyStatus)bodyStatus.textContent=
          "Source-affected vertices: "+bodyDiagnostics.affectedVertices+
          " · active targets: "+bodyDiagnostics.activeTargets+
          " · triangles: "+bodyDiagnostics.triangleCount+
          " · inverted: "+bodyDiagnostics.invertedTriangles+
          " · collapsed: "+bodyDiagnostics.collapsedTriangles+
          " · stretched: "+bodyDiagnostics.stretchedTriangles+
          " · seams: "+bodyDiagnostics.seamMismatches+
          " · max edge stretch: "+bodyDiagnostics.maxEdgeStretch.toFixed(2)+"×"+
          (bodyDiagnostics.unsupportedExtrapolation?" · unsupported stress":" · native-range preview");
        document.documentElement.dataset.c36BodyReady="true";
      }catch(e){
        if(bodyStatus)bodyStatus.textContent="C3.6 body source unavailable: "+String(e);
        document.documentElement.dataset.c36BodyReady="false";
      }
    }else{
      document.documentElement.dataset.c36BodyReady="true";
      if(bodyStatus)bodyStatus.textContent="Neutral original source body · select a preset or adjust an anatomical control";
    }
    for(const slider of bodyInputs.values())slider.disabled=
      name!=="template";
    if(name==="template"){
      try{
        const atlas=await loadFacialAtlas();
        if(stopping||ticket!==request){preview.dispose();return;}
        // Original source vertex numbers and already-shaped C3.4 neutral rest.
        facialController=new MakeHumanFacialController(preview as AnatomicalHuman,atlas);
        facialDiagnostics=facialController.apply(facialWeights);
        if(facialStatus)facialStatus.textContent="MakeHuman CC0 facial atlas ready";
      }catch(e){
        if(facialStatus)facialStatus.textContent="C3.5 facial source unavailable: "+String(e);
      }
    }
    document.documentElement.dataset.c35FacialReady=String(!!facialController);
    for(const input of facialInputs.values())input.disabled=!facialController;
    updateFacialPreview();
    overlay?.removeFromParent();overlay?.geometry.dispose();
    if(overlay?.material instanceof THREE.Material)overlay.material.dispose();
    overlay=undefined;
    const priorSelectedBone=inspector?.getSelectedBone()?.id;
    inspector?.dispose();inspector=undefined;
    correctives?.dispose();correctives=undefined;
    if(active){active.spike.character.root.removeFromParent();active.dispose();}
    active=preview;surface=name;
    if(name==="template" && (morphologySelect?.value!=="neutral" ||
      headIsActive()))
      correctives=new HumanPoseCorrectives(preview as AnatomicalHuman);
    document.documentElement.dataset.c3HeadReady =
      name==="template" && !!getHumanHeadLandmarks(preview as AnatomicalHuman)
        ? "true" : "false";
    if(morphologySelect)morphologySelect.disabled=name!=="template";
    if(headPresetSelect)headPresetSelect.disabled=name!=="template";
    for(const slider of headSliders.values()) slider.disabled=name!=="template";
    document.documentElement.dataset.c3MorphPreset=
      name==="template"?(morphologySelect?.value??"neutral"):"unavailable";
    const sourceSelect=document.querySelector<HTMLSelectElement>("#source-select");
    if(sourceSelect)sourceSelect.value=name;
    stageTimings.clear();
    if(name==="template")for(const [stage,ms] of sampleTimings)stageTimings.set(stage,ms);
    frameIntervals=[];
    previousFrameTime=undefined;
    lastPoseApplyMs=undefined;
    lastCpuSampleMs=undefined;
    lastRenderSubmitMs=undefined;
    fk=new AnatomicalFK(preview.spike.graph,preview.spike.bones,
      {jawTipWorldRest:preview.jawTipWorldRest,
        forearmSkinBones:preview.spike.forearmSkinBones,
        shoulderSkinBones:preview.spike.shoulderSkinBones});
    if(name==="template"){
      verifyCalibratedHandMotions();
      verifyCalibratedJawOpening();
    }else{
      delete document.documentElement.dataset.c2Directions;
      delete document.documentElement.dataset.c2JawDirection;
    }
    scene.add(preview.spike.character.root);
    const panel=document.querySelector<HTMLElement>("#bone-inspector-panel");
    const labels=document.querySelector<HTMLElement>("#bone-marker-labels");
    const markerToggle=document.querySelector<HTMLInputElement>("#bone-markers");
    const connectionToggle=document.querySelector<HTMLInputElement>("#bone-connections");
    if(!panel||!labels||!markerToggle||!connectionToggle)
      throw new Error("Missing bone inspector UI");
    inspector=new BoneInspector({
      graph:preview.spike.graph,bones:preview.spike.bones,scene,camera,
      viewport:viewport!,panel,labels,markerToggle,connectionToggle,
    });
    if(priorSelectedBone)inspector.selectBone(priorSelectedBone);
  for(const button of document.querySelectorAll<HTMLButtonElement>("[data-surface]"))
      button.setAttribute("aria-pressed",String(button.dataset.surface===name));
    applyPose(currentPose);applyDebug();
    if(!preserveCamera)applyView(currentView);
    document.documentElement.dataset.c2Ready="true";
    document.documentElement.dataset.c2Source=name;
  }
  // Explicit action only: framing does not run when selecting a marker or
  // changing morphology. Preserve the current orbit direction while moving
  // the camera target to the live selected semantic C1 bone.
  function focusSelectedBone():void {
    const selection=inspector?.getSelectedBone();
    if(!selection||!active)return;
    frameSelectedAnatomicalBone(camera,controls.target,selection);
    controls.update();
  }
  document.querySelector<HTMLButtonElement>("#focus-selected-bone")
    ?.addEventListener("click",focusSelectedBone);
  // Register camera controls once, not once per template/implicit surface swap.
  function applyView(selectedView:string):void {
      currentView=selectedView;
      if(!active)return;
      if(selectedView==="front")camera.position.set(0,1.45,3.2);
      if(selectedView==="side")camera.position.set(3.2,1.45,0);
      if(selectedView==="rear")camera.position.set(0,1.45,-3.2);
      let target=new THREE.Vector3(0,.95,0);
      if(selectedView==="shoulder-left"||selectedView==="shoulder-right"||
        selectedView==="axilla-left"||selectedView==="axilla-right"){
        const side=selectedView.endsWith("left")?"left":"right";
        const joint=active!.spike.graph.joints.find(j=>j.role==="shoulder_"+side);
        const bone=joint?active!.spike.bones.get(joint.id):undefined;
        if(bone){
          active!.spike.character.root.updateWorldMatrix(true,true);
          target=bone.getWorldPosition(new THREE.Vector3());
          if(selectedView.startsWith("axilla"))target.y-=.085;
          camera.position.copy(target).add(selectedView.startsWith("axilla")?
            new THREE.Vector3(side==="left"?.36:-.36,-.18,.27):
            new THREE.Vector3(side==="left"?.24:-.24,.12,.43));
        }
      }
      if(/^(elbow|hip|knee|ankle)-(left|right)$/.test(selectedView??"")){
        const match=/^(elbow|hip|knee|ankle)-(left|right)$/.exec(selectedView!);
        const role=match![1]+"_"+match![2];
        const joint=active!.spike.graph.joints.find(j=>j.role===role);
        const bone=joint?active!.spike.bones.get(joint.id):undefined;
        if(bone){
          active!.spike.character.root.updateWorldMatrix(true,true);
          target=bone.getWorldPosition(new THREE.Vector3());
          // Joint-anchored cameras follow the live FK pose, including crouch.
          camera.position.copy(target).add(new THREE.Vector3(
            match![2]==="left"?.22:-.22,.07,.38));
        }
      }
      if(selectedView==="head-front"||selectedView==="head-side"||selectedView==="head-three-quarter"){
        const headJoint=active!.spike.graph.joints.find(j=>j.role==="head");
        const head=headJoint?active!.spike.bones.get(headJoint.id):undefined;
        if(head){
          active!.spike.character.root.updateWorldMatrix(true,true);
          target=head.getWorldPosition(new THREE.Vector3());
          // Explicit close-up views frame the eyes, brows, mouth and jaw together.
           target.y+=.015;
          camera.position.copy(target).add(selectedView==="head-front"?
            new THREE.Vector3(0,.03,.45):
             selectedView==="head-three-quarter"?new THREE.Vector3(.32,.03,.32):
             new THREE.Vector3(.45,.03,0));
        }
      }
      if(selectedView==="thumb-web-left"||selectedView==="thumb-web-right"){
        const side=selectedView==="thumb-web-left"?"left":"right";
        const joint=active!.spike.graph.joints.find(j=>
          j.role==="finger_thumb_0" && j.id.includes("arm["+side+","));
        const base=joint?active!.spike.bones.get(joint.id):undefined;
        if(base){
          active!.spike.character.root.updateWorldMatrix(true,true);
          target=base.getWorldPosition(new THREE.Vector3());
          // Focus directly on the imported thumb/palm transition, not a
          // guessed screen-space location; still works after posing.
          camera.position.copy(target).add(new THREE.Vector3(
            side==="left"?.16:-.16,.1,.25));
        }
      }
      if(selectedView==="hand-left"||selectedView==="hand-right"){
        const role=selectedView==="hand-left"?"palm_left":"palm_right";
        const joint=active!.spike.graph.joints.find(j=>j.role===role);
        const bone=joint?active!.spike.bones.get(joint.id):undefined;
        if(bone){
          active!.spike.character.root.updateWorldMatrix(true,true);
          target=bone.getWorldPosition(new THREE.Vector3());
          camera.position.copy(target).add(new THREE.Vector3(0,.15,.58));
        }
      }
      camera.lookAt(target);controls.target.copy(target);controls.update();
  }
  const labControls=createCharacterLabControls(applyPose,applyView);
  const sourceSelect=document.querySelector<HTMLSelectElement>("#source-select");
  sourceSelect?.addEventListener("change",()=>{
    void switchSurface(sourceSelect.value);
  });
  morphologySelect?.addEventListener("change",()=>{
    void switchSurface("template",true);
  });
  headPresetSelect?.addEventListener("change",()=>{
    const preset=headPresets[headPresetSelect.value];
    if(!preset)return;
    for(const key of headKeys) headSliders.get(key)!.value=
      String(preset[key]??1);
    syncHeadValues();
    void switchSurface("template",true);
  });
  for(const slider of headSliders.values()){
    slider.addEventListener("input",syncHeadValues);
    slider.addEventListener("change",()=>{
      if(headPresetSelect)headPresetSelect.value="custom";
      void switchSurface("template",true);
    });
  }
  document.querySelector<HTMLButtonElement>("#reset-head")?.addEventListener(
    "click",()=>{
      for(const slider of headSliders.values())slider.value="1";
      if(headPresetSelect)headPresetSelect.value="neutral";
      syncHeadValues();void switchSurface("template",true);
    });
  const inspectorToggle=document.querySelector<HTMLButtonElement>("#bone-inspector-toggle");
  const inspectorContent=document.querySelector<HTMLElement>("#bone-inspector-content");
  inspectorToggle?.addEventListener("click",()=>{
    if(!inspectorContent)return;
    const show=inspectorContent.hidden;
    inspectorContent.hidden=!show;
    inspectorToggle.setAttribute("aria-expanded",String(show));
    document.body.classList.toggle("inspector-open",show);
    inspectorToggle.textContent=show?"Hide inspector":"Inspect bones";
  });
  for(const toggle of document.querySelectorAll<HTMLInputElement>("[data-debug]"))
    toggle.addEventListener("change",applyDebug);
  const render=()=>{
    if(stopping)return;
    const width=Math.max(1,viewport.clientWidth),height=Math.max(1,viewport.clientHeight);
    renderer!.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();
    controls.update();
    inspector?.update();
    const started=performance.now();
    renderer!.render(scene,camera);
    lastRenderSubmitMs=performance.now()-started;
    if(previousFrameTime!==undefined && started-previousFrameTime<250){
      frameIntervals.push(started-previousFrameTime);
      if(frameIntervals.length>120)frameIntervals.shift();
    }
    previousFrameTime=started;
    // Metrics are updated only periodically, not on every frame or GPU call.
    if(++renderTicks%120===0)publishMetrics();
    frame=requestAnimationFrame(render);
  };
  render();
  void switchSurface("template");
  window.addEventListener("pagehide",()=>{
    stopping=true;request++;cancelAnimationFrame(frame);
    overlay?.removeFromParent();overlay?.geometry.dispose();
    if(overlay?.material instanceof THREE.Material)overlay.material.dispose();
    inspector?.dispose();inspector=undefined;
    labControls.dispose();
    controls.dispose();correctives?.dispose();correctives=undefined;
    active?.dispose();fk=undefined;scene.clear();
    renderer?.dispose();renderer?.domElement.remove();
  },{once:true});
}catch(e){
  error.textContent="C2 laboratory startup failed: "+String(e);
  status.textContent="C2 laboratory unavailable";
  renderer?.dispose();
  console.error(e);
}
