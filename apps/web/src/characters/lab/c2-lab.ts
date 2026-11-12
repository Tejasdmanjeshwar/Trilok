import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createContinuousHumanPrototype } from "../geometry/ContinuousHumanPrototype";
import { loadAnatomicalHuman, type AnatomicalHuman, type AnatomicalLoadStage } from "../geometry/AnatomicalTemplate";
import { validateSkinningSpike, type SkinningSpike } from "../geometry/SkinningSpike";
import { AnatomicalFK } from "../geometry/AnatomicalFK";
import { anatomicalPoseById, resolveAnatomicalPose } from "../geometry/AnatomicalPoseMatrix";
import { createCharacterLabControls } from "./CharacterLabControls";
import { BoneInspector } from "./BoneInspector";

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
let overlay:THREE.SkeletonHelper|undefined;
let inspector:BoneInspector|undefined;
let renderer:THREE.WebGLRenderer|undefined;
let frame=0;
let surface="template";
let currentPose="neutral";
let currentView="front";
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
  controls.update();
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
  async function switchSurface(name:string):Promise<void> {
    if(stopping)return;
    const ticket=++request;
    status!.textContent="Loading "+name+" geometry…";
    error!.textContent="";
    let preview:Preview;
    const sampleTimings=new Map<AnatomicalLoadStage,number>();
    try {
      if(name==="template")preview=await loadAnatomicalHuman(undefined,
        (stage,ms)=>sampleTimings.set(stage,ms));
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
    overlay?.removeFromParent();overlay?.geometry.dispose();
    if(overlay?.material instanceof THREE.Material)overlay.material.dispose();
    overlay=undefined;
    inspector?.dispose();inspector=undefined;
    if(active){active.spike.character.root.removeFromParent();active.dispose();}
    active=preview;surface=name;
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
  for(const button of document.querySelectorAll<HTMLButtonElement>("[data-surface]"))
      button.setAttribute("aria-pressed",String(button.dataset.surface===name));
    applyPose(currentPose);applyDebug();
    applyView(currentView);
    document.documentElement.dataset.c2Ready="true";
    document.documentElement.dataset.c2Source=name;
  }
  // Register camera controls once, not once per template/implicit surface swap.
  function applyView(selectedView:string):void {
      currentView=selectedView;
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
      if(selectedView==="head-front"||selectedView==="head-side"){
        const headJoint=active!.spike.graph.joints.find(j=>j.role==="head");
        const head=headJoint?active!.spike.bones.get(headJoint.id):undefined;
        if(head){
          active!.spike.character.root.updateWorldMatrix(true,true);
          target=head.getWorldPosition(new THREE.Vector3());
          target.y-=.07;
          camera.position.copy(target).add(selectedView==="head-front"?
            new THREE.Vector3(0,.04,.38):new THREE.Vector3(.38,.04,0));
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
  const inspectorToggle=document.querySelector<HTMLButtonElement>("#bone-inspector-toggle");
  const inspectorContent=document.querySelector<HTMLElement>("#bone-inspector-content");
  inspectorToggle?.addEventListener("click",()=>{
    if(!inspectorContent)return;
    const show=inspectorContent.hidden;
    inspectorContent.hidden=!show;
    inspectorToggle.setAttribute("aria-expanded",String(show));
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
    controls.dispose();active?.dispose();fk=undefined;scene.clear();
    renderer?.dispose();renderer?.domElement.remove();
  },{once:true});
}catch(e){
  error.textContent="C2 laboratory startup failed: "+String(e);
  status.textContent="C2 laboratory unavailable";
  renderer?.dispose();
  console.error(e);
}
