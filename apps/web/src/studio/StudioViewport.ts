import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {buildStudioHuman,type StudioHumanModel} from "./StudioHumanModel";
import {defaultStudioMorphState,type StudioMorphState} from "./StudioMorphCatalog";
import {DEFAULT_STUDIO_APPEARANCE,validateStudioAppearance,type StudioAppearanceV1} from "./StudioAppearance";
import {applyStudioSkinMaterial} from "./StudioSkinMaterial";
import type {StudioRecipeV1} from "./StudioRecipe";
import { STUDIO_LIGHTS, STUDIO_VIEWS, type StudioLight, type StudioView } from "./StudioPresentation";

export interface StudioViewport {
  load():Promise<void>;
  applyMorphology(state:StudioMorphState):Promise<boolean>;
  applyRecipe(recipe:StudioRecipeV1):Promise<boolean>;
  setView(view:StudioView):void;
  setLight(light:StudioLight):void;
  resetView():void;
  dispose():void;
}

/** The same CC0 human assembler and semantic skinned rig used by Character Lab.
 * View state is presentation-only, separate from future character recipes. */
export function createStudioViewport(
  element:HTMLElement,onReady:()=>void,onFailure:(message:string)=>void,
  onEditError:(message:string)=>void,
):StudioViewport {
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(40,1,.05,90);
  const isReduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer:THREE.WebGLRenderer|undefined;
  let controls:OrbitControls|undefined;
  let active:StudioHumanModel|undefined;
  let currentMorphology=defaultStudioMorphState();
  let currentAppearance:StudioAppearanceV1=DEFAULT_STUDIO_APPEARANCE;
  let disposed=false;
  let loading=false;
  let ticket=0;
  let rebuilding=0;
  let requestAbort:AbortController|undefined;
  let light:StudioLight="daylight";
  let contextLost=false;
  let raf=0;
  let resize:ResizeObserver|undefined;
  const ambient=new THREE.HemisphereLight();
  const key=new THREE.DirectionalLight();
  const fill=new THREE.DirectionalLight();
  const rim=new THREE.DirectionalLight();
  key.position.set(3,5,4);fill.position.set(-3,2,2);rim.position.set(-2,4,-3);
  scene.add(ambient,key,fill,rim);
  const ground=new THREE.Mesh(
    new THREE.CircleGeometry(1.55,96),
    new THREE.MeshBasicMaterial({color:0x0b1119,transparent:true,opacity:.23,depthWrite:false}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.012;
  scene.add(ground);
  const orientation=new THREE.GridHelper(3.5,28,0x53616a,0x44515a);
  orientation.position.y=-.015;
  (orientation.material as THREE.Material).transparent=true;
  (orientation.material as THREE.Material).opacity=.16;
  scene.add(orientation);
  const resetView=()=>setView("three-quarter");
  function setView(view:StudioView):void {
    const selected=STUDIO_VIEWS[view];
    camera.position.set(selected.position[0],selected.position[1],selected.position[2]);
    controls?.target.set(selected.target[0],selected.target[1],selected.target[2]);
    camera.lookAt(selected.target[0],selected.target[1],selected.target[2]);
    controls?.update();
  }
  function setLight(mode:StudioLight):void {
    light=mode;
    const preset=STUDIO_LIGHTS[mode];
    scene.background=new THREE.Color(preset.background);
    ambient.intensity=preset.hemisphere;
    ambient.color.set(0xffffff);ambient.groundColor.set(0x57505a);
    key.color.set(preset.keyColor);key.intensity=preset.key;
    fill.color.set(preset.fillColor);fill.intensity=preset.fill;
    rim.color.set(preset.rimColor);rim.intensity=preset.rim;
  }
  function draw():void {
    if(disposed||contextLost||!renderer||!controls)return;
    raf=requestAnimationFrame(draw);
    controls.update();
    if(!document.hidden && element.clientWidth>0 && element.clientHeight>0) {
      renderer.render(scene,camera);
    }
  }
  function measure():void {
    if(!renderer||disposed)return;
    const width=Math.max(1,element.clientWidth),height=Math.max(1,element.clientHeight);
    renderer.setSize(width,height,false);
    // Leave room for the viewport help bar on short touch displays.
    camera.fov=height<500?50:40;
    camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  function onLost(event:Event):void {
    event.preventDefault();
    contextLost=true;
    cancelAnimationFrame(raf);
    onFailure("Your graphics session was interrupted. Restore the preview to continue.");
  }
  function onRestored():void {
    contextLost=false;
    if(disposed)return;
    measure();
    cancelAnimationFrame(raf);
    draw();
    if(active)onReady();else void load();
  }
  function initialize():void {
    if(renderer)return;
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance",
      alpha:false});
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.1;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
    renderer.domElement.setAttribute("aria-label","Interactive three-dimensional character preview");
    renderer.domElement.setAttribute("role","img");
    renderer.domElement.addEventListener("webglcontextlost",onLost);
    renderer.domElement.addEventListener("webglcontextrestored",onRestored);
    element.append(renderer.domElement);
    controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=!isReduced;
    controls.enablePan=true;
    controls.enableZoom=true;
    controls.minDistance=.33;controls.maxDistance=9;
    controls.minPolarAngle=.08;controls.maxPolarAngle=Math.PI-.08;
    controls.target.set(0,.95,0);
    controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
    resetView();
    setLight(light);
    resize=new ResizeObserver(measure);
    resize.observe(element);
    measure();
    draw();
  }
  // Only a facial change can reuse the same neutral-rest mesh without
  // recalibrating joints. Body and head edits rebuild a complete owned model;
  // the previous good character remains visible until the candidate succeeds.
  async function applyMorphology(state:StudioMorphState):Promise<boolean> {
    return applyState(state,currentAppearance);
  }
  async function applyRecipe(recipe:StudioRecipeV1):Promise<boolean>{
    return applyState(recipe.morphology,recipe.appearance);
  }
  async function applyState(state:StudioMorphState,appearance:StudioAppearanceV1):Promise<boolean>{
    validateStudioAppearance(appearance);
    if(disposed)return false;
    const current=++ticket;
    requestAbort?.abort();
    const abort=new AbortController();
    requestAbort=abort;
    const valid=()=>!disposed&&current===ticket&&!abort.signal.aborted;
    const faceOnly=!!active && rebuilding===0 &&
      JSON.stringify(state.body)===JSON.stringify(currentMorphology.body) &&
      JSON.stringify(state.shape)===JSON.stringify(currentMorphology.shape);
    if(faceOnly){
      try{
        const changed=await active!.setFace(state.face,valid);
        if(!changed||!valid())return false;
        applyStudioSkinMaterial(active!.human.mesh,appearance);
        currentAppearance=appearance;
        currentMorphology=state;
        onEditError("");
        return true;
      }catch(_error){
        if(valid())onEditError("This adjustment could not be applied. Your previous character remains available.");
        return false;
      }
    }
    let incoming:StudioHumanModel|undefined;
    rebuilding++;
    try{
      initialize();
      incoming=await buildStudioHuman(state,abort.signal);
      if(!valid()){incoming.dispose();return false;}
      applyStudioSkinMaterial(incoming.human.mesh,appearance);
      const previous=active;
      scene.add(incoming.human.spike.character.root);
      active=incoming;
      currentMorphology=state;
      currentAppearance=appearance;
      previous?.dispose();
      onReady();
      onEditError("");
      return true;
    }catch(_error){
      incoming?.dispose();
      if(valid()){
        if(active)onEditError("This change could not be applied. The previous character has been preserved.");
        else onFailure("The character could not be opened. Check your connection and try again.");
      }
      return false;
    }finally{
      rebuilding--;
      if(requestAbort===abort)requestAbort=undefined;
    }
  }
  async function load():Promise<void> {
    if(disposed||loading)return;
    loading=true;
    try{await applyMorphology(currentMorphology);}
    finally{loading=false;}
  }
  function dispose():void {
    if(disposed)return;
    disposed=true;ticket++;
    requestAbort?.abort();
    requestAbort=undefined;
    cancelAnimationFrame(raf);
    resize?.disconnect();
    controls?.dispose();
    active?.dispose();
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
    orientation.geometry.dispose();
    (orientation.material as THREE.Material).dispose();
    if(renderer){
      renderer.domElement.removeEventListener("webglcontextlost",onLost);
      renderer.domElement.removeEventListener("webglcontextrestored",onRestored);
      renderer.dispose();
      renderer.domElement.remove();
    }
  }
  return {load,applyMorphology,applyRecipe,setView,setLight,resetView,dispose};
}
