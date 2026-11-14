import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {buildStudioHuman,type StudioHumanModel} from "./StudioHumanModel";
import {defaultStudioMorphState,type StudioMorphState} from "./StudioMorphCatalog";
import {DEFAULT_STUDIO_APPEARANCE,validateStudioAppearance,type StudioAppearanceV1} from "./StudioAppearance";
import {applyStudioSkinMaterial} from "./StudioSkinMaterial";
import type {StudioRecipeV1} from "./StudioRecipe";
import { STUDIO_LIGHTS, STUDIO_VIEWS, type StudioLight, type StudioView } from "./StudioPresentation";
import {STUDIO_FOCUS,DEFAULT_INSPECTION,previewExpression,focusPosition,
  type StudioFocus,type StudioExpression,type StudioPose,type StudioInspectionOptions}
  from "./StudioInspection";
import {StudioPosePreview} from "./StudioPosePreview";

export interface StudioViewport {
  load():Promise<void>;
  applyMorphology(state:StudioMorphState):Promise<boolean>;
  applyRecipe(recipe:StudioRecipeV1):Promise<boolean>;
  setView(view:StudioView):void;
  setLight(light:StudioLight):void;
  setOrthographic(enabled:boolean):void;
  focus(area:StudioFocus):boolean;
  returnFromFocus():void;
  setPose(pose:StudioPose):void;
  setExpression(expression:StudioExpression):Promise<boolean>;
  setInspection(options:StudioInspectionOptions):void;
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
  const perspective=new THREE.PerspectiveCamera(40,1,.05,90);
  const orthographic=new THREE.OrthographicCamera(-1,1,1,-1,.05,90);
  let camera:THREE.PerspectiveCamera|THREE.OrthographicCamera=perspective;
  let orthographicMode=false;
  let transition:{from:THREE.Vector3;to:THREE.Vector3;
    fromTarget:THREE.Vector3;toTarget:THREE.Vector3;start:number}|undefined;
  let priorFocus:{position:THREE.Vector3;target:THREE.Vector3}|undefined;
  let pose:StudioPose="neutral";
  let expression:StudioExpression="neutral";
  let posePreview:StudioPosePreview|undefined;
  let inspection:StudioInspectionOptions=DEFAULT_INSPECTION;
  let skeleton:THREE.SkeletonHelper|undefined;
  let markers:THREE.Group|undefined;
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
  const target=()=>controls?.target.clone()??new THREE.Vector3(0,.95,0);
  const endMotion=()=>{transition=undefined;};
  function moveTo(position:THREE.Vector3,look:THREE.Vector3):void {
    endMotion();
    if(!controls){camera.position.copy(position);camera.lookAt(look);return;}
    if(isReduced){
      camera.position.copy(position);controls.target.copy(look);controls.update();
    }else{
      transition={from:camera.position.clone(),to:position,
        fromTarget:target(),toTarget:look,start:performance.now()};
    }
  }
  function setView(view:StudioView):void {
    priorFocus=undefined;
    const selected=STUDIO_VIEWS[view];
    moveTo(new THREE.Vector3(...selected.position),new THREE.Vector3(...selected.target));
  }
  const resetView=()=>setView("three-quarter");
  function setOrthographic(enabled:boolean):void {
    if(orthographicMode===enabled)return;
    endMotion();
    const from=camera;
    const oldTarget=target();
    // Both cameras use the same world framing at the current distance.
    const distance=Math.max(.05,from.position.distanceTo(oldTarget));
    orthographicMode=enabled;
    camera=enabled?orthographic:perspective;
    camera.position.copy(from.position);camera.quaternion.copy(from.quaternion);
    if(enabled) {
      const half=distance*Math.tan(THREE.MathUtils.degToRad(perspective.fov)/2);
      orthographic.top=half;orthographic.bottom=-half;
      orthographic.left=-half*perspective.aspect;orthographic.right=half*perspective.aspect;
      orthographic.zoom=1;orthographic.updateProjectionMatrix();
    }
    // OrbitControls binds its camera at construction. Rebind without touching the scene.
    controls?.dispose();
    if(renderer) {
      controls=new OrbitControls(camera,renderer.domElement);
      configureControls(controls);
      controls.target.copy(oldTarget);controls.update();
    }
    measure();
  }
  function focus(area:StudioFocus):boolean {
    if(!active||!Object.hasOwn(STUDIO_FOCUS,area))return false;
    const point=focusPosition(active.human,area);
    if(!point)return false;
    if(!priorFocus)priorFocus={position:camera.position.clone(),target:target()};
    const direction=camera.position.clone().sub(target()).normalize();
    if(direction.lengthSq()<1e-8)direction.set(0,.08,1).normalize();
    moveTo(point.target.clone().addScaledVector(direction,point.distance),point.target);
    return true;
  }
  function returnFromFocus():void {
    if(!priorFocus)return;
    const previous=priorFocus;priorFocus=undefined;
    moveTo(previous.position,previous.target);
  }
  function setPose(next:StudioPose):void {
    pose=next;
    posePreview?.setPose(next);
    refreshInspection();
  }
  async function setExpression(next:StudioExpression):Promise<boolean> {
    if(!active)return false;
    const current=++ticket;
    requestAbort?.abort();
    const abort=new AbortController();requestAbort=abort;
    const previous=expression;
    try{
      const ok=await active.setFace(previewExpression(currentMorphology.face,next),
        ()=>!disposed&&!abort.signal.aborted&&current===ticket);
      if(!ok)return false;
      expression=next;
      posePreview?.refresh();
      return true;
    }catch{
      if(current===ticket){expression=previous;
        onEditError("The expression could not be previewed.");}
      return false;
    }finally{if(requestAbort===abort)requestAbort=undefined;}
  }
  function disposeInspection():void {
    if(skeleton){
      skeleton.removeFromParent();skeleton.geometry.dispose();
      if(skeleton.material instanceof THREE.Material)skeleton.material.dispose();
      skeleton=undefined;
    }
    if(markers){
      markers.removeFromParent();
      markers.traverse(object=>{
        if(object instanceof THREE.Mesh){
          object.geometry.dispose();
          if(object.material instanceof THREE.Material)object.material.dispose();
        }
      });
      markers=undefined;
    }
    if(active){
      const material=active.human.mesh.material;
      if(material instanceof THREE.MeshStandardMaterial)material.wireframe=false;
    }
  }
  function refreshInspection():void {
    disposeInspection();
    if(!active)return;
    const human=active.human;
    const material=human.mesh.material;
    if(material instanceof THREE.MeshStandardMaterial)material.wireframe=inspection.wireframe;
    if(inspection.skeleton){
      skeleton=new THREE.SkeletonHelper(human.spike.character.root);
      const lines=skeleton.material;
      if(lines instanceof THREE.LineBasicMaterial){
        lines.depthTest=false;lines.transparent=true;lines.opacity=.8;
      }
      scene.add(skeleton);
    }
    if(inspection.joints){
      markers=new THREE.Group();
      const geometry=new THREE.SphereGeometry(.009,8,6);
      const material=new THREE.MeshBasicMaterial({color:0xffd58f,depthTest:false});
      for(const joint of human.spike.graph.joints){
        if(joint.role.startsWith("finger_")&&!joint.role.endsWith("_0"))continue;
        const bone=human.spike.bones.get(joint.id);
        if(!bone)continue;
        // One marker geometry/material per joint simplifies unconditional ownership.
        const marker=new THREE.Mesh(geometry.clone(),material.clone());
        marker.userData.jointId=joint.id;
        markers.add(marker);
      }
      geometry.dispose();material.dispose();
      scene.add(markers);
    }
  }
  function setInspection(next:StudioInspectionOptions):void {
    inspection={...next};refreshInspection();
  }
  function updateMarkers():void{
    if(!markers||!active)return;
    active.human.spike.character.root.updateWorldMatrix(true,true);
    for(const marker of markers.children){
      const bone=active.human.spike.bones.get(marker.userData.jointId as string);
      if(bone)marker.position.copy(bone.getWorldPosition(new THREE.Vector3()));
    }
  }
  function configureControls(instance:OrbitControls):void {
    instance.enableDamping=!isReduced;
    instance.enablePan=true;instance.enableZoom=true;
    instance.minDistance=.25;instance.maxDistance=9;
    instance.minZoom=.25;instance.maxZoom=8;
    instance.minPolarAngle=.08;instance.maxPolarAngle=Math.PI-.08;
    instance.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
    instance.addEventListener("start",endMotion);
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
    if(transition&&controls) {
      const t=Math.min(1,(performance.now()-transition.start)/430);
      const ease=t*t*(3-2*t);
      camera.position.lerpVectors(transition.from,transition.to,ease);
      controls.target.lerpVectors(transition.fromTarget,transition.toTarget,ease);
      if(t>=1)transition=undefined;
    }
    controls.update();
    updateMarkers();
    if(!document.hidden && element.clientWidth>0 && element.clientHeight>0) {
      renderer.render(scene,camera);
    }
  }
  function measure():void {
    if(!renderer||disposed)return;
    const width=Math.max(1,element.clientWidth),height=Math.max(1,element.clientHeight);
    renderer.setSize(width,height,false);
    // Leave room for the viewport help bar on short touch displays.
    perspective.fov=height<500?50:40;
    perspective.aspect=width/height;perspective.updateProjectionMatrix();
    if(orthographicMode){
      const half=(orthographic.top-orthographic.bottom)/2;
      orthographic.left=-half*width/height;
      orthographic.right=half*width/height;
      orthographic.updateProjectionMatrix();
    }
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
    configureControls(controls);
    controls.target.set(0,.95,0);
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
        const sameFace=JSON.stringify(state.face)===JSON.stringify(currentMorphology.face);
        const changed=sameFace||await active!.setFace(previewExpression(state.face,expression),valid);
        if(!changed||!valid())return false;
        applyStudioSkinMaterial(active!.human.mesh,appearance);
        currentAppearance=appearance;
        currentMorphology=state;
        posePreview?.refresh();
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
      if(expression!=="neutral") {
        const ok=await incoming.setFace(previewExpression(state.face,expression),valid);
        if(!ok||!valid()){incoming.dispose();return false;}
      }
      const preview=new StudioPosePreview(incoming);
      try{preview.setPose(pose);}
      catch(error){preview.dispose();throw error;}
      if(!valid()){preview.dispose();incoming.dispose();return false;}
      const previous=active;
      const previousPose=posePreview;
      disposeInspection();
      scene.add(incoming.human.spike.character.root);
      active=incoming;
      posePreview=preview;
      currentMorphology=state;
      currentAppearance=appearance;
      previousPose?.dispose();
      previous?.dispose();
      refreshInspection();
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
    disposeInspection();
    posePreview?.dispose();
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
  return {load,applyMorphology,applyRecipe,setView,setLight,setOrthographic,
    focus,returnFromFocus,setPose,setExpression,setInspection,resetView,dispose};
}
