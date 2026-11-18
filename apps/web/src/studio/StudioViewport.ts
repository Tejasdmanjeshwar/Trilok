import * as THREE from "three";
import {getBuildIdentity} from "../build-info";
import {initialStudioRecipe} from "./StudioRecipe";
import {createStudioGripFailureReport,createStudioBowFailureReport,
  type StudioGripFailureReport} from "./StudioGripDiagnostics";
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
import {StudioArcheryWorkerClient} from "./StudioArcheryWorkerClient";
import {StudioSwordPreview} from "./StudioWeaponGrip";
import {StudioBowPreview,isBowEquipment,type ArcheryPoseResult,
  type ArcheryState} from "./StudioArchery";
import {type BowProfile} from "./StudioBowGeometry";
import {StudioShieldPreview,isSwordShieldEquipment,shieldHand,type ShieldStance}
  from "./StudioShieldGrip";
import {StudioTwoHandPreview,isTwoHandEquipment,twoHandKind,primaryHand,
  type EquipmentChoice,type TwoHandIKResult} from "./StudioTwoHandGrip";
import {StudioPerformance} from "./StudioPerformance";
import {bakeReferenceMotion,REFERENCE_MOTION_SOURCES} from "@trilok/character-core";
import {StudioAnimationPlayback} from "./StudioAnimationPlayback";
import {isShortTap,isDoubleTap,isTrustedMouseDoubleClick,focusAreaForSkinTriangle,positionForFocusedAngle,
  type StudioTap} from "./StudioSurfaceFocus";

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
  setEquipment(hand:EquipmentChoice):void;
  setShieldStance(stance:ShieldStance):void;
  setArcheryState(state:ArcheryState):void;
  setArcheryDraw(value:number):void;
  setBowProfile(profile:BowProfile):void;
  setExpression(expression:StudioExpression):Promise<boolean>;
  setInspection(options:StudioInspectionOptions):void;
  resetView():void;
  selectAnimation(id:string|null):void;
  playAnimation(playing:boolean):void;
  seekAnimation(seconds:number):void;
  setAnimationSpeed(speed:number):void;
  setAnimationLoop(loop:boolean):void;
  stepAnimation(direction:-1|1):void;
  resetAnimation():void;
  dispose():void;
}
export interface StudioAnimationState {
  readonly clipId:string;
  readonly timeSeconds:number;
  readonly durationSeconds:number;
  readonly playing:boolean;
  readonly loop:boolean;
  readonly speed:number;
}

/** The same CC0 human assembler and semantic skinned rig used by Character Lab.
 * View state is presentation-only, separate from future character recipes. */
export function createStudioViewport(
  element:HTMLElement,onReady:()=>void,onFailure:(message:string)=>void,
  onEditError:(message:string)=>void,
  onSurfaceFocus?:(area:StudioFocus)=>void,
  onGripFailure?:(report:StudioGripFailureReport|undefined)=>void,
  onAnimationState?:(state:StudioAnimationState|undefined)=>void,
):StudioViewport {
  const scene=new THREE.Scene();
  const perspective=new THREE.PerspectiveCamera(40,1,.05,90);
  const orthographic=new THREE.OrthographicCamera(-1,1,1,-1,.05,90);
  let camera:THREE.PerspectiveCamera|THREE.OrthographicCamera=perspective;
  let orthographicMode=false;
  let transition:{from:THREE.Vector3;to:THREE.Vector3;
    fromTarget:THREE.Vector3;toTarget:THREE.Vector3;start:number}|undefined;
  let priorFocus:{position:THREE.Vector3;target:THREE.Vector3}|undefined;
  let focusedArea:StudioFocus|undefined;
  const raycaster=new THREE.Raycaster();
  const pointerNDC=new THREE.Vector2();
  let pointerStart:StudioTap|undefined;
  let previousTap:StudioTap|undefined;
  let pendingNativeDoubleClick:{first:StudioTap;second:StudioTap}|undefined;
  const pointers=new Set<number>();
  // Opt-in browser diagnostic events distinguish gesture, skin hit, anatomy and UI
  // transitions without logging in normal production sessions.
  const focusDiagnostics=new URLSearchParams(location.search).has("studio-focus-diagnostics");
  const reportFocus=(stage:string,detail:Record<string,unknown>={}):void=>{
    if(!focusDiagnostics)return;
    window.dispatchEvent(new CustomEvent("trilok:studio:surface-focus-diagnostic",{
      detail:{stage,...detail},
    }));
  };

  const makeTap=(event:PointerEvent):StudioTap=>({
    // Preserve the physical event time when a busy render frame queues input.
    x:event.clientX,y:event.clientY,time:event.timeStamp,pointerType:event.pointerType,
  });
  const clearTap=():void=>{
    pointerStart=undefined;previousTap=undefined;pendingNativeDoubleClick=undefined;
  };
  const onPointerDown=(event:PointerEvent):void=>{
    if(disposed||contextLost||event.button!==0)return;
    reportFocus("pointerdown",{pointerType:event.pointerType,pointerId:event.pointerId,time:event.timeStamp,x:event.clientX,y:event.clientY});
    pointers.add(event.pointerId);
    if(pointers.size!==1){reportFocus("multi-pointer-rejected",{count:pointers.size});clearTap();return;}
    pointerStart=makeTap(event);
  };
  const onPointerCancel=(event:PointerEvent):void=>{
    reportFocus("pointercancel",{pointerId:event.pointerId});
    pointers.delete(event.pointerId);clearTap();
  };
  /** Always intersect the real posed skin at the triggering canvas coordinate. */
  const focusRenderedSurface=(x:number,y:number):void=>{
    const rect=renderer?.domElement.getBoundingClientRect();
    if(!rect||rect.width<=0||rect.height<=0||!active){
      reportFocus("scene-unavailable",{canvasWidth:rect?.width,canvasHeight:rect?.height,active:!!active});
      return;
    }
    pointerNDC.set((x-rect.left)/rect.width*2-1,
      1-(y-rect.top)/rect.height*2);
    camera.updateMatrixWorld();
    active.human.spike.character.root.updateWorldMatrix(true,true);
    raycaster.setFromCamera(pointerNDC,camera);
    const hit=raycaster.intersectObject(active.human.mesh,false)[0];
    const area=hit?.face?focusAreaForSkinTriangle(active.human,hit.face):undefined;
    reportFocus(!hit?"skin-miss":!area?"anatomy-miss":"skin-hit",{
      ndcX:pointerNDC.x,ndcY:pointerNDC.y,canvasWidth:rect.width,canvasHeight:rect.height,
      area:area??null,faceIndex:hit?.faceIndex??null,
    });
    if(area&&hit){
      if(focusAt(area,hit.point)){
        onSurfaceFocus?.(area);
        reportFocus("focus-committed",{area});
      }else reportFocus("focus-rejected",{area});
    }
  };
  const onPointerUp=(event:PointerEvent):void=>{
    const wasSingle=pointers.size===1&&pointers.has(event.pointerId);
    pointers.delete(event.pointerId);
    if(!wasSingle||!pointerStart){
      reportFocus("pointer-sequence-rejected",{pointerId:event.pointerId,wasSingle});
      clearTap();return;
    }
    const end=makeTap(event),start=pointerStart;
    pointerStart=undefined;
    if(!isShortTap(start,end)){
      reportFocus("tap-rejected",{duration:end.time-start.time,distance:Math.hypot(end.x-start.x,end.y-start.y)});
      previousTap=undefined;pendingNativeDoubleClick=undefined;return;
    }
    reportFocus("tap-accepted",{pointerType:end.pointerType,time:end.time,elapsedSincePrior:previousTap?end.time-previousTap.time:null});
    if(previousTap&&isDoubleTap(previousTap,end)){
      reportFocus("double-tap-recognized",{pointerType:end.pointerType});
      previousTap=undefined;pendingNativeDoubleClick=undefined;
      focusRenderedSurface(event.clientX,event.clientY);
    }else{
      // The native dblclick event follows the second pointerup and is only
      // used when browser mouse scheduling exceeded the strict pointer window.
      const first=previousTap;
      pendingNativeDoubleClick=first&&first.pointerType==="mouse"&&end.pointerType==="mouse"&&
        Math.hypot(end.x-first.x,end.y-first.y)<=26?{first,second:end}:undefined;
      if(first)reportFocus("double-tap-rejected",{
        delta:end.time-first.time,distance:Math.hypot(end.x-first.x,end.y-first.y),
        priorType:first.pointerType,currentType:end.pointerType,
      });
      previousTap=end;
    }
  };
  const onNativeDoubleClick=(event:MouseEvent):void=>{
    const candidate=pendingNativeDoubleClick;
    pendingNativeDoubleClick=undefined;
    if(disposed||contextLost||pointers.size>0||!candidate)return;
    if(isTrustedMouseDoubleClick(candidate.first,candidate.second,event)){
      reportFocus("native-double-click-recognized",{
        delta:candidate.second.time-candidate.first.time,
      });
      previousTap=undefined;
      focusRenderedSurface(event.clientX,event.clientY);
    }else reportFocus("native-double-click-rejected",{
      trusted:event.isTrusted,detail:event.detail,pointerType:candidate.second.pointerType,
    });
  };
  let pose:StudioPose="neutral";
  let expression:StudioExpression="neutral";
  let posePreview:StudioPosePreview|undefined;
  let animation:StudioAnimationPlayback|undefined;
  let animationId:string|null=null;
  let equipment:EquipmentChoice="none";
  let bowProfile:BowProfile="recurve";
  let archeryState:ArcheryState="rest";
  let archeryDraw=1;
  let bowWorker:StudioArcheryWorkerClient|undefined;
  let currentRecipe:StudioRecipeV1=initialStudioRecipe();
  let sword:StudioSwordPreview|StudioTwoHandPreview|StudioBowPreview|undefined;
  let shield:StudioShieldPreview|undefined;
  const reportGripFailure=(error?:unknown,
    attemptedRecipe:StudioRecipeV1=currentRecipe,
    result?:TwoHandIKResult|ArcheryPoseResult):void=>{
    if(isTwoHandEquipment(equipment)){
      onGripFailure?.(createStudioGripFailureReport(attemptedRecipe,pose,equipment,
        getBuildIdentity(),result&&"primaryErrorMeters" in result?result:undefined,error));
    }else if(isBowEquipment(equipment)){
      onGripFailure?.(createStudioBowFailureReport(attemptedRecipe,pose,equipment,
        getBuildIdentity(),archeryState,archeryDraw,bowProfile,
        result&&"bowSkinContact" in result?result:undefined,error));
    }
  };
  function emitAnimation():void {onAnimationState?.(animation?.state);}
  function stopAnimation():void {
    if(!animation&&!animationId)return;
    animation?.dispose();animation=undefined;animationId=null;
    posePreview?.setGrip(equipment);
    posePreview?.setPose(pose);
    refreshSword();
    emitAnimation();
  }
  function enterAnimation(id:string):void {
    const source=REFERENCE_MOTION_SOURCES.find(entry=>entry.id===id);
    if(!source)throw new Error("Unknown reference animation");
    if(!active||!posePreview)throw new Error("Character is not ready for animation");
    animation?.dispose();animation=undefined;
    cancelBowWorker();clearSword();
    // Static FK/IK and source correctives must be removed before capturing rest.
    // Retain Studio pose/equipment choices for restoring when animation stops.
    posePreview.setGrip("none");
    posePreview.setPose("neutral");
    const clip=bakeReferenceMotion(source,active.human.spike.graph);
    animation=new StudioAnimationPlayback(active.human.spike.character,clip);
    animationId=id;
    updateMarkers();emitAnimation();
  }
  function selectAnimation(id:string|null):void {
    if(id===null){stopAnimation();return;}
    if(animationId===id)return;
    enterAnimation(id);
  }
  function playAnimation(playing:boolean):void{animation?.setPlaying(playing);emitAnimation();}
  function seekAnimation(seconds:number):void{animation?.seek(seconds);updateMarkers();emitAnimation();}
  function setAnimationSpeed(speed:number):void{animation?.setSpeed(speed);emitAnimation();}
  function setAnimationLoop(loop:boolean):void{animation?.setLoop(loop);emitAnimation();}
  function stepAnimation(direction:-1|1):void{animation?.step(direction);updateMarkers();emitAnimation();}
  function resetAnimation():void{animation?.reset();updateMarkers();emitAnimation();}
  function clearSword():void{
    sword?.dispose();sword=undefined;
    shield?.dispose();shield=undefined;
  }
  function refreshSword():void{
    clearSword();
    if(equipment==="none"){
      onGripFailure?.(undefined);
      onEditError("");return;
    }
    if(!active)return;
    try{
      if(isBowEquipment(equipment)){
        const result=posePreview?.bowPoseResult;
        if(!result?.reachable){
          reportGripFailure(undefined,currentRecipe,result);
          onEditError("The bow cannot reach this archery position for the current character.");
          return;
        }
        const next=new StudioBowPreview(active,result,bowProfile);
        scene.add(next.object);sword=next;
      }else if(isTwoHandEquipment(equipment)){
        const solved=posePreview?.twoHandResult;
        if(!solved?.reachable){
          reportGripFailure(undefined,currentRecipe,solved);
          onEditError("Both hands cannot comfortably reach this weapon in the selected pose.");
          return;
        }
        const next=new StudioTwoHandPreview(active,twoHandKind(equipment),
          primaryHand(equipment)!,solved);
        scene.add(next.object);sword=next;
      }else if(isSwordShieldEquipment(equipment)){
        const swordHand=equipment.endsWith("right")?"right":"left";
        if(!posePreview?.shieldPoseResult?.reachable)
          throw new Error("Shield arm cannot safely reach its guard");
        const blade=new StudioSwordPreview(active,swordHand);
        try{
          const guard=new StudioShieldPreview(active,shieldHand(swordHand));
          scene.add(blade.object,guard.object);
          sword=blade;shield=guard;
        }catch(error){blade.dispose();throw error;}
      }else{
        const next=new StudioSwordPreview(active,equipment);
        scene.add(next.object);sword=next;
      }
      onGripFailure?.(undefined);
      onEditError("");
    }catch(error){
      reportGripFailure(error);
      onEditError("The selected weapon cannot be held comfortably in this pose.");
    }
  }
  function cancelBowWorker():void{
    bowWorker?.dispose();bowWorker=undefined;
  }
  /** A worker owns a separate CPU source human. Only results from this exact
   * model, recipe, pose, state, and root are ever admitted to the scene.
   * Heavy calculations cannot block the camera/slider animation loop. */
  function startBowWorker():void{
    if(disposed||document.hidden||contextLost||!active||!posePreview||!isBowEquipment(equipment)||
      archeryState!=="partial"||bowWorker)return;
    const owner=active,preview=posePreview,generation=ticket;
    try{
      bowWorker=new StudioArcheryWorkerClient({
        type:"init",morphology:currentMorphology,expression,
        pose,equipment,
      },(_id,draw,rootWorld,result)=>{
        if(disposed||active!==owner||posePreview!==preview||
          generation!==ticket||!isBowEquipment(equipment)||
          result.hand!==(equipment.endsWith("right")?"right":"left")||
          archeryState!=="partial"||archeryDraw!==draw)return;
        owner.human.spike.character.root.updateWorldMatrix(true,true);
        const current=owner.human.spike.character.root.matrixWorld.elements;
        if(!rootWorld.every((value,i)=>value===current[i]))return;
        try{
          const accepted=preview.acceptWorkerPartial(draw,result);
          if(accepted){
            refreshSword();
            onEditError("");
          }else{
            reportGripFailure(undefined,currentRecipe,result);
            onEditError("The bow cannot reach this draw position. The last valid pose remains visible.");
          }
          // Evidence only: this is an actual completed full source solve,
          // unlike the two-rAF input responsiveness proxy.
          window.dispatchEvent(new CustomEvent("trilok:studio:bow-worker-result",{
            detail:{draw,reachable:result.reachable,accepted,id:_id},
          }));
        }catch(error){
          reportGripFailure(error);
          onEditError("The drawn bow failed source contact validation. The previous pose remains visible.");
          window.dispatchEvent(new CustomEvent("trilok:studio:bow-worker-result",{
            detail:{draw,reachable:false,accepted:false,id:_id,error:true},
          }));
        }
        updateMarkers();
      },message=>{
        if(disposed||active!==owner||generation!==ticket)return;
        // Do not retain a permanently failed boot/worker as an active owner.
        // A later input can create a fresh isolated source solver.
        cancelBowWorker();
        onEditError("The background bow solver could not complete this draw.");
        window.dispatchEvent(new CustomEvent("trilok:studio:bow-worker-result",{
          detail:{draw:archeryDraw,reachable:false,accepted:false,error:true},
        }));
        console.warn("[Trilok Studio Worker IK]",message);
      });
    }catch(error){
      cancelBowWorker();
      onEditError("Background bow solving is not available.");
      console.warn("[Trilok Studio Worker IK]",error);
    }
  }
  function queueBowDraw():void{
    startBowWorker();
    if(!bowWorker||!active)return;
    // An expensive but legal source solve may take seconds; make the pending
    // state visible while leaving the last accepted rendered pose intact.
    onEditError("Adjusting bow draw…");
    active.human.spike.character.root.updateWorldMatrix(true,true);
    try{
      bowWorker.request(archeryDraw,
        [...active.human.spike.character.root.matrixWorld.elements]);
    }catch(error){
      cancelBowWorker();
      onEditError("The background bow solver could not accept this draw.");
      console.warn("[Trilok Studio Worker IK]",error);
    }
  }
  function setEquipment(hand:EquipmentChoice):void{
    stopAnimation();
    if(!["none","left","right","longsword-left","longsword-right",
      "staff-left","staff-right","sword-shield-left","sword-shield-right",
      "bow-left","bow-right"].includes(hand))throw new Error("Unknown equipment choice");
    cancelBowWorker();
    equipment=hand;
    try{
      posePreview?.setGrip(hand);
      refreshSword();
    }catch(error){
      clearSword();
      reportGripFailure(error);
      onEditError("The selected weapon cannot be held comfortably in this pose.");
    }
    updateMarkers();
  }
  function setShieldStance(stance:ShieldStance):void{
    stopAnimation();
    posePreview?.setShieldStance(stance);
    if(isSwordShieldEquipment(equipment))refreshSword();
    updateMarkers();
  }
  function setArcheryState(state:ArcheryState):void{
    stopAnimation();
    cancelBowWorker();
    archeryState=state;
    if(state==="partial"&&isBowEquipment(equipment)&&posePreview){
      posePreview.stagePartialDraw();
      queueBowDraw();
      updateMarkers();return;
    }
    try{
      posePreview?.setArcheryState(state);
      if(isBowEquipment(equipment))refreshSword();
    }catch(error){
      clearSword();
      reportGripFailure(error);
      onEditError("The bow cannot reach this archery position for the current character.");
    }
    updateMarkers();
  }
  function setArcheryDraw(value:number):void{
    stopAnimation();
    if(!Number.isFinite(value)||value<0||value>1)
      throw new Error("Invalid archery draw");
    if(archeryDraw===value)return;
    archeryDraw=value;
    if(isBowEquipment(equipment)&&archeryState==="partial"&&posePreview){
      queueBowDraw();
      return;
    }
    try{
      posePreview?.setArcheryDraw(value);
      // Replacing identical bow meshes outside partial needlessly allocates
      // and disposes GPU buffers on every slider input.
      if(isBowEquipment(equipment)&&archeryState==="partial")refreshSword();
    }catch(error){
      clearSword();
      reportGripFailure(error);
      onEditError("The bow cannot reach this draw position for the current character.");
    }
    updateMarkers();
  }
  function setBowProfile(profile:BowProfile):void{
    stopAnimation();
    if(profile!=="simple"&&profile!=="recurve")throw new Error("Unknown bow profile");
    bowProfile=profile;
    if(isBowEquipment(equipment))refreshSword();
  }
  let inspection:StudioInspectionOptions=DEFAULT_INSPECTION;
  let skeleton:THREE.SkeletonHelper|undefined;
  let markers:THREE.Group|undefined;
  let markerGeometry:THREE.SphereGeometry|undefined;
  let markerMaterial:THREE.MeshBasicMaterial|undefined;
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
  const performanceMonitor=new StudioPerformance();
  const requestMetrics=():void=>{
    // Respond only to explicit diagnostics requests; no player-facing panel.
    window.dispatchEvent(new CustomEvent("trilok:studio:metrics",{
      detail:performanceMonitor.snapshot(renderer?.info.memory),
    }));
  };
  window.addEventListener("trilok:studio:request-metrics",requestMetrics);
  const visibilityChanged=():void=>{
    performanceMonitor.setSuspended(document.hidden);
    if(document.hidden){
      animation?.suspend();
      cancelBowWorker();
      cancelAnimationFrame(raf);raf=0;
    }else {
      if(archeryState==="partial"&&isBowEquipment(equipment))queueBowDraw();
      if(renderer&&!contextLost&&!disposed&&raf===0)draw();
    }
  };
  document.addEventListener("visibilitychange",visibilityChanged);
  performanceMonitor.setSuspended(document.hidden);
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
    const selected=STUDIO_VIEWS[view];
    if(focusedArea){
      // A camera preset rotates around the selected anatomy without changing
      // its focus, close-up zoom, or the saved return-to-previous view.
      const anchor=transition?.toTarget.clone()??target();
      const distance=transition?
        transition.to.distanceTo(anchor):camera.position.distanceTo(anchor);
      moveTo(positionForFocusedAngle(selected,anchor,distance),anchor);
      return;
    }
    moveTo(new THREE.Vector3(...selected.position),new THREE.Vector3(...selected.target));
  }
  function resetView():void {
    focusedArea=undefined;priorFocus=undefined;
    const selected=STUDIO_VIEWS["three-quarter"];
    moveTo(new THREE.Vector3(...selected.position),new THREE.Vector3(...selected.target));
  }
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
  function focusAt(area:StudioFocus,hitPoint?:THREE.Vector3):boolean {
    if(!active||!Object.hasOwn(STUDIO_FOCUS,area))return false;
    const point=focusPosition(active.human,area);
    if(!point)return false;
    // Tapping a visible surface should frame exactly that spot. The menu's
    // explicit Focus continues to use its anatomical reference joint.
    const anchor=hitPoint?.clone()??point.target;
    if(!priorFocus)priorFocus={
      position:camera.position.clone(),target:target(),
    };
    const from=transition?.to.clone()??camera.position.clone();
    const fromTarget=transition?.toTarget.clone()??target();
    const direction=from.sub(fromTarget).normalize();
    if(direction.lengthSq()<1e-8)direction.set(0,.08,1).normalize();
    if(shield&&isSwordShieldEquipment(equipment)&&
      area===shieldHand(equipment.endsWith("right")?"right":"left")+"-hand"){
      // The shield plate occludes a generic wrist close-up. Aim at the
      // source-fitted rear handle from the wielder's side instead, with
      // a lateral component so the forearm and both strap contacts stay visible.
      shield.object.updateWorldMatrix(true,true);
      const rear=new THREE.Vector3(0,0,-1)
        .transformDirection(shield.object.matrixWorld);
      const lateral=new THREE.Vector3(equipment.endsWith("right")?-1:1,.12,0)
        .applyQuaternion(active!.human.spike.character.root
          .getWorldQuaternion(new THREE.Quaternion()));
      direction.copy(rear.multiplyScalar(.78)
        .add(lateral.multiplyScalar(.56)).normalize());
    }
    focusedArea=area;
    moveTo(anchor.clone().addScaledVector(direction,point.distance),anchor);
    return true;
  }
  function focus(area:StudioFocus):boolean{return focusAt(area);}
  function returnFromFocus():void {
    if(!priorFocus)return;
    const previous=priorFocus;
    priorFocus=undefined;focusedArea=undefined;
    moveTo(previous.position,previous.target);
  }
  function setPose(next:StudioPose):void {
    stopAnimation();
    cancelBowWorker();
    pose=next;
    try{
      posePreview?.setPose(next);
      if(isTwoHandEquipment(equipment)||isSwordShieldEquipment(equipment)||isBowEquipment(equipment))
        refreshSword();
      else sword?.update();
    }catch(error){
      clearSword();
      reportGripFailure(error);
      onEditError("The selected weapon cannot be held comfortably in this pose.");
    }
    // The existing overlays follow posed bones without reallocating GPU buffers.
    updateMarkers();
  }
  async function setExpression(next:StudioExpression):Promise<boolean> {
    stopAnimation();
    if(!active)return false;
    cancelBowWorker();
    const current=++ticket;
    requestAbort?.abort();
    const abort=new AbortController();requestAbort=abort;
    const previous=expression;
    try{
      const ok=await active.setFace(previewExpression(currentMorphology.face,next),
        ()=>!disposed&&!abort.signal.aborted&&current===ticket);
      if(!ok)return false;
      expression=next;
      // Source face/jaw geometry changed in place; discard any prior
      // source-skinned IK endpoint calibration before re-solving.
      posePreview?.invalidateSourceContact();
      posePreview?.refresh();
      if(isTwoHandEquipment(equipment)||isSwordShieldEquipment(equipment)||isBowEquipment(equipment))refreshSword();
      return true;
    }catch(error){
      if(current===ticket){expression=previous;
        if(isBowEquipment(equipment))reportGripFailure(error);
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
      markers.clear();
      markerGeometry?.dispose();markerMaterial?.dispose();
      markerGeometry=undefined;markerMaterial=undefined;
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
      markerGeometry=new THREE.SphereGeometry(.009,8,6);
      markerMaterial=new THREE.MeshBasicMaterial({color:0xffd58f,depthTest:false});
      for(const joint of human.spike.graph.joints){
        if(joint.role.startsWith("finger_")&&!joint.role.endsWith("_0"))continue;
        const bone=human.spike.bones.get(joint.id);
        if(!bone)continue;
        // Share GPU resources between joint markers; dispose once on teardown.
        const marker=new THREE.Mesh(markerGeometry,markerMaterial);
        marker.userData.jointId=joint.id;
        markers.add(marker);
      }
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
    if(disposed||contextLost||document.hidden||!renderer||!controls){
      raf=0;return;
    }
    raf=requestAnimationFrame(draw);
    if(transition&&controls) {
      const t=Math.min(1,(performance.now()-transition.start)/430);
      const ease=t*t*(3-2*t);
      camera.position.lerpVectors(transition.from,transition.to,ease);
      controls.target.lerpVectors(transition.fromTarget,transition.toTarget,ease);
      if(t>=1)transition=undefined;
    }
    controls.update();
    if(animation){animation.update(performance.now());emitAnimation();}
    updateMarkers();
    if(element.clientWidth>0 && element.clientHeight>0) {
      renderer.render(scene,camera);
      performanceMonitor.recordFrame(performance.now());
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
    cancelBowWorker();
    contextLost=true;
    performanceMonitor.setSuspended(true);
    cancelAnimationFrame(raf);raf=0;
    onFailure("Your graphics session was interrupted. Restore the preview to continue.");
  }
  function onRestored():void {
    contextLost=false;
    if(disposed)return;
    measure();
    cancelAnimationFrame(raf);raf=0;
    performanceMonitor.setSuspended(document.hidden);
    if(!document.hidden)draw();
    if(active){
      if(archeryState==="partial"&&isBowEquipment(equipment))queueBowDraw();
      onReady();
    }else void load();
  }
  function onCanvasKey(event:KeyboardEvent):void {
    if(disposed||!controls||contextLost)return;
    const key=event.key;
    if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","=","-","_"].includes(key))return;
    event.preventDefault();
    endMotion();
    const anchor=controls.target;
    const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(anchor));
    const angle=THREE.MathUtils.degToRad(12);
    if(key==="ArrowLeft")spherical.theta-=angle;
    if(key==="ArrowRight")spherical.theta+=angle;
    if(key==="ArrowUp")spherical.phi=Math.max(.08,spherical.phi-angle);
    if(key==="ArrowDown")spherical.phi=Math.min(Math.PI-.08,spherical.phi+angle);
    if(["+","=","-","_"].includes(key)){
      const factor=key==="+"||key==="="?1.2:1/1.2;
      if(camera instanceof THREE.OrthographicCamera){
        camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,controls.minZoom,controls.maxZoom);
        camera.updateProjectionMatrix();
      }else spherical.radius=THREE.MathUtils.clamp(spherical.radius/factor,
        controls.minDistance,controls.maxDistance);
    }
    camera.position.copy(anchor).add(new THREE.Vector3().setFromSpherical(spherical));
    camera.lookAt(anchor);controls.update();
  }
  function initialize():void {
    if(renderer)return;
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance",
      alpha:false});
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.1;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
    renderer.domElement.setAttribute("aria-label","Interactive character preview: arrow keys turn, plus and minus zoom; double-tap a body part to focus");
    renderer.domElement.tabIndex=0;
    renderer.domElement.addEventListener("keydown",onCanvasKey);
    renderer.domElement.setAttribute("role","img");
    renderer.domElement.addEventListener("webglcontextlost",onLost);
    renderer.domElement.addEventListener("webglcontextrestored",onRestored);
    renderer.domElement.addEventListener("pointerdown",onPointerDown);
    renderer.domElement.addEventListener("pointerup",onPointerUp);
    renderer.domElement.addEventListener("pointercancel",onPointerCancel);
    renderer.domElement.addEventListener("dblclick",onNativeDoubleClick);
    // Native gestures and double-click focus are handled by the same pointer
    // recognizer, so touch devices do not depend on a synthetic dblclick event.
    element.append(renderer.domElement);
    controls=new OrbitControls(camera,renderer.domElement);
    configureControls(controls);
    // Startup has no meaningful previous view. A 430ms animated flight from
    // the camera origin could be interrupted by the user's first pointerdown,
    // leaving the first double-tap ray outside the displayed human.
    // Initialize the real framing synchronously; retain animated Reset View
    // and angle transitions after the Studio is interactive.
    const startingView=STUDIO_VIEWS["three-quarter"];
    camera.position.fromArray(startingView.position);
    controls.target.fromArray(startingView.target);
    controls.update();
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
    return applyState(recipe.morphology,recipe.appearance,recipe);
  }
  async function applyState(state:StudioMorphState,appearance:StudioAppearanceV1,
    recipe?:StudioRecipeV1):Promise<boolean>{
    const started=performance.now();
    const hadActive=!!active;
    cancelBowWorker();
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
        currentRecipe=recipe??{...currentRecipe,morphology:state,appearance};
        if(!sameFace)posePreview?.invalidateSourceContact();
        if(!animation)posePreview?.refresh();
        if(!animation&&(isTwoHandEquipment(equipment)||isSwordShieldEquipment(equipment)||
          isBowEquipment(equipment)))refreshSword();
        if(hadActive)performanceMonitor.recordEdit(performance.now()-started);
        if(equipment==="none"||sword)onEditError("");
        return true;
      }catch(error){
        if(valid()){
          reportGripFailure(error);
          onEditError("This adjustment could not be applied. Your previous character remains available.");
        }
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
      // New generated bodies must retain the selected archery state/draw;
      // otherwise failures are reported for a hidden reset-to-rest pose.
      const preview=new StudioPosePreview(incoming,{
        state:archeryState,draw:archeryDraw,
      });
      try{preview.setGrip(equipment);preview.setPose(pose);}
      catch(error){preview.dispose();throw error;}
      if(!valid()){preview.dispose();incoming.dispose();return false;}
      const previous=active;
      const previousPose=posePreview;
      const selectedAnimation=animationId;
      animation?.dispose();animation=undefined;
      disposeInspection();
      clearSword();
      scene.add(incoming.human.spike.character.root);
      active=incoming;
      posePreview=preview;
      currentRecipe=recipe??{...currentRecipe,morphology:state,appearance};
      if(selectedAnimation) {
        try{enterAnimation(selectedAnimation);}
        catch(error){
          animationId=null;
          preview.setGrip(equipment);preview.setPose(pose);
          refreshSword();
          onEditError("This body cannot use the current reference animation.");
        }
      }else refreshSword();
      currentMorphology=state;
      currentAppearance=appearance;
      previousPose?.dispose();
      previous?.dispose();
      refreshInspection();
      onReady();
      if(hadActive)performanceMonitor.recordEdit(performance.now()-started);
      if(equipment==="none"||sword)onEditError("");
      return true;
    }catch(error){
      incoming?.dispose();
      if(valid()){
        if(isTwoHandEquipment(equipment)||isBowEquipment(equipment)){
          const attempted=recipe??{...currentRecipe,morphology:state,appearance};
          reportGripFailure(error,attempted);
        }
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
    const started=performance.now();
    try{
      if(await applyMorphology(currentMorphology))
        performanceMonitor.recordInitialLoad(performance.now()-started);
    }finally{loading=false;}
  }
  function dispose():void {
    if(disposed)return;
    disposed=true;ticket++;
    cancelBowWorker();
    animation?.dispose();animation=undefined;
    clearSword();
    requestAbort?.abort();
    requestAbort=undefined;
    cancelAnimationFrame(raf);
    resize?.disconnect();
    document.removeEventListener("visibilitychange",visibilityChanged);
    window.removeEventListener("trilok:studio:request-metrics",requestMetrics);
    controls?.dispose();
    clearTap();pointers.clear();
    disposeInspection();
    posePreview?.dispose();
    active?.dispose();
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
    orientation.geometry.dispose();
    (orientation.material as THREE.Material).dispose();
    if(renderer){
      renderer.domElement.removeEventListener("keydown",onCanvasKey);
      renderer.domElement.removeEventListener("webglcontextlost",onLost);
      renderer.domElement.removeEventListener("webglcontextrestored",onRestored);
      renderer.domElement.removeEventListener("pointerdown",onPointerDown);
      renderer.domElement.removeEventListener("pointerup",onPointerUp);
      renderer.domElement.removeEventListener("pointercancel",onPointerCancel);
      renderer.domElement.removeEventListener("dblclick",onNativeDoubleClick);
      renderer.dispose();
      renderer.domElement.remove();
    }
  }
  return {load,applyMorphology,applyRecipe,setView,setLight,setOrthographic,
    focus,returnFromFocus,setPose,selectAnimation,playAnimation,seekAnimation,setAnimationSpeed,setAnimationLoop,stepAnimation,resetAnimation,setEquipment,setShieldStance,setArcheryState,setArcheryDraw,setBowProfile,setExpression,setInspection,resetView,dispose};
}
