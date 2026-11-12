import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createContinuousHumanPrototype } from "../geometry/ContinuousHumanPrototype";
import { loadAnatomicalHuman, type AnatomicalHuman } from "../geometry/AnatomicalTemplate";
import { validateSkinningSpike, type SkinningSpike } from "../geometry/SkinningSpike";
import { AnatomicalFK, type JointTarget, type AnatomicalMotion } from "../geometry/AnatomicalFK";
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
    const targets:JointTarget[]=[];
    const pose=(role:string,motion:AnatomicalMotion,radians:number)=>{
      for(const joint of active!.spike.graph.joints){
        if(joint.role===role && fk!.frames.get(joint.id)?.freedoms.has(motion))
          targets.push({jointId:joint.id,motion,radians});
      }
    };
    const finger=(side:"left"|"right",digit:string,index:number,
      motion:AnatomicalMotion,radians:number)=>{
      const joint=active!.spike.graph.joints.find(j=>j.role==="finger_"+digit+"_"+index &&
        j.id.includes("arm["+side+","));
      if(joint)targets.push({jointId:joint.id,motion,radians});
    };
    const fist=(closure:number)=>{
      for(const side of ["left","right"] as const){
        for(const digit of ["index","middle","ring","little"]){
          finger(side,digit,0,"flexion",1.15*closure);
          finger(side,digit,1,"flexion",1.19*closure);
          finger(side,digit,2,"flexion",.55*closure);
        }
        finger(side,"thumb",0,"opposition",.55*closure);
        finger(side,"thumb",0,"flexion",.4*closure);
        finger(side,"thumb",1,"flexion",.55*closure);
      }
    };
    switch(name){
      case "tpose":
        pose("shoulder_left","abduction",.8);pose("shoulder_right","abduction",.8);break;
      case "overhead":
        pose("shoulder_left","abduction",2.35);pose("shoulder_right","abduction",2.35);break;
      case "shoulder":
        pose("clavicle_left","abduction",.22);pose("clavicle_right","abduction",.22);
        pose("shoulder_left","abduction",1.5);pose("shoulder_right","abduction",1.5);break;
      case "elbow":
        pose("elbow_left","flexion",1.7);pose("elbow_right","flexion",1.7);break;
      case "crouch":
        pose("hip_left","flexion",1);pose("hip_right","flexion",1);
        pose("knee_left","flexion",1.45);pose("knee_right","flexion",1.45);
        pose("ankle_left","flexion",-.4);pose("ankle_right","flexion",-.4);break;
      case "abduction":
        pose("hip_left","abduction",.6);pose("hip_right","abduction",.6);break;
      case "torso":pose("spine_lower","rotation",.42);pose("chest","rotation",.4);break;
      case "neck":pose("neck","rotation",.65);break;
      case "forearm":pose("elbow_left","rotation",1.15);pose("elbow_right","rotation",-1.15);break;
      case "wrist":
        pose("wrist_left","flexion",.65);pose("wrist_right","flexion",.65);break;
      case "fist":fist(1);break;
      case "index":
        for(const side of ["left","right"] as const){
          finger(side,"index",0,"flexion",1.1);
          finger(side,"index",1,"flexion",1.35);
          finger(side,"index",2,"flexion",.7);
        }break;
      case "thumb":
        for(const side of ["left","right"] as const){
          finger(side,"thumb",0,"opposition",.72);
          finger(side,"thumb",0,"flexion",.6);
          finger(side,"thumb",1,"flexion",.8);
        }break;
      case "thumb-wrist":
        pose("wrist_left","flexion",.62);pose("wrist_right","flexion",.62);
        pose("wrist_left","abduction",.2);pose("wrist_right","abduction",-.2);
        for(const side of ["left","right"] as const){
          finger(side,"thumb",0,"opposition",.75);
          finger(side,"thumb",0,"flexion",.55);
          finger(side,"thumb",1,"flexion",.7);
        }break;
      case "hand-stress":
        pose("elbow_left","flexion",1);pose("elbow_right","flexion",1);
        pose("elbow_left","rotation",.7);pose("elbow_right","rotation",-.7);
        pose("wrist_left","flexion",.62);pose("wrist_right","flexion",.62);
        pose("wrist_left","abduction",.2);pose("wrist_right","abduction",-.2);
        for(const side of ["left","right"] as const){
          finger(side,"thumb",0,"opposition",.75);
          finger(side,"thumb",0,"flexion",.55);
          finger(side,"thumb",1,"flexion",.7);
          finger(side,"index",0,"flexion",1.2);
          finger(side,"index",1,"flexion",1.1);
          finger(side,"index",2,"flexion",.6);
        }break;
      case "sword":
        pose("shoulder_left","flexion",.5);pose("shoulder_right","flexion",.5);
        pose("elbow_left","flexion",1);pose("elbow_right","flexion",1);
        fist(.65);break;
      case "jaw":pose("jaw","flexion",.4);break;
      case "bow":
        pose("shoulder_left","flexion",1.2);pose("shoulder_right","flexion",1);
        pose("elbow_right","rotation",-.65);pose("elbow_left","flexion",1);break;
    }
    fk.apply(targets);
    active.spike.character.root.updateWorldMatrix(true,true);
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
    try {
      if(name==="template")preview=await loadAnatomicalHuman();
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
    for(const button of document.querySelectorAll<HTMLButtonElement>("[data-view]"))
    button.addEventListener("click",()=>{
      const selectedView=button.dataset.view;
      if(selectedView==="front")camera.position.set(0,1.45,3.2);
      if(selectedView==="side")camera.position.set(3.2,1.45,0);
      if(selectedView==="rear")camera.position.set(0,1.45,-3.2);
      let target=new THREE.Vector3(0,.95,0);
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
      for(const item of document.querySelectorAll<HTMLButtonElement>("[data-view]"))
        item.setAttribute("aria-pressed",String(item===button));
    });
  for(const button of document.querySelectorAll<HTMLButtonElement>("[data-surface]"))
      button.setAttribute("aria-pressed",String(button.dataset.surface===name));
    applyPose(currentPose);applyDebug();
    document.documentElement.dataset.c2Ready="true";
    document.documentElement.dataset.c2Source=name;
  }
  for(const button of document.querySelectorAll<HTMLButtonElement>("[data-pose]"))
    button.addEventListener("click",()=>{
      applyPose(button.dataset.pose??"neutral");
      for(const b of document.querySelectorAll<HTMLButtonElement>("[data-pose]"))
        b.setAttribute("aria-pressed",String(b===button));
    });
  for(const button of document.querySelectorAll<HTMLButtonElement>("[data-surface]"))
    button.addEventListener("click",()=>void switchSurface(button.dataset.surface??"implicit"));
  for(const toggle of document.querySelectorAll<HTMLInputElement>("[data-debug]"))
    toggle.addEventListener("change",applyDebug);
  const render=()=>{
    if(stopping)return;
    const width=Math.max(1,viewport.clientWidth),height=Math.max(1,viewport.clientHeight);
    renderer!.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();
    controls.update();
    inspector?.update();
    renderer!.render(scene,camera);
    frame=requestAnimationFrame(render);
  };
  render();
  void switchSurface("template");
  window.addEventListener("pagehide",()=>{
    stopping=true;request++;cancelAnimationFrame(frame);
    overlay?.removeFromParent();overlay?.geometry.dispose();
    if(overlay?.material instanceof THREE.Material)overlay.material.dispose();
    inspector?.dispose();inspector=undefined;
    controls.dispose();active?.dispose();fk=undefined;scene.clear();
    renderer?.dispose();renderer?.domElement.remove();
  },{once:true});
}catch(e){
  error.textContent="C2 laboratory startup failed: "+String(e);
  status.textContent="C2 laboratory unavailable";
  renderer?.dispose();
  console.error(e);
}
