import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createContinuousHumanPrototype } from "../geometry/ContinuousHumanPrototype";
import { loadAnatomicalHuman, type AnatomicalHuman } from "../geometry/AnatomicalTemplate";
import { validateSkinningSpike, type SkinningSpike } from "../geometry/SkinningSpike";
import { AnatomicalFK, type JointTarget, type AnatomicalMotion } from "../geometry/AnatomicalFK";

const viewport=document.querySelector<HTMLDivElement>("#viewport");
const status=document.querySelector<HTMLElement>("#status");
const error=document.querySelector<HTMLElement>("#error");
if(!viewport||!status||!error)throw new Error("Missing laboratory controls");

type Preview = {spike:SkinningSpike;mesh:THREE.SkinnedMesh;vertexCount:number;
  triangleCount:number;dispose():void;template?:AnatomicalHuman["template"];
  rigDiagnostics?:AnatomicalHuman["rigDiagnostics"]};
let stopping=false;
let active:Preview|undefined;
let fk:AnatomicalFK|undefined;
let overlay:THREE.SkeletonHelper|undefined;
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
          finger(side,digit,0,"flexion",1.07*closure);
          finger(side,digit,1,"flexion",1.05*closure);
          finger(side,digit,2,"flexion",.42*closure);
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
    if(active){active.spike.character.root.removeFromParent();active.dispose();}
    active=preview;surface=name;
    fk=new AnatomicalFK(preview.spike.graph,preview.spike.bones);
    scene.add(preview.spike.character.root);
    for(const button of document.querySelectorAll<HTMLButtonElement>("[data-view]"))
    button.addEventListener("click",()=>{
      const selectedView=button.dataset.view;
      if(selectedView==="front")camera.position.set(0,1.45,3.2);
      if(selectedView==="side")camera.position.set(3.2,1.45,0);
      if(selectedView==="rear")camera.position.set(0,1.45,-3.2);
      let target=new THREE.Vector3(0,.95,0);
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
    renderer!.render(scene,camera);
    frame=requestAnimationFrame(render);
  };
  render();
  void switchSurface("template");
  window.addEventListener("pagehide",()=>{
    stopping=true;request++;cancelAnimationFrame(frame);
    overlay?.removeFromParent();overlay?.geometry.dispose();
    if(overlay?.material instanceof THREE.Material)overlay.material.dispose();
    controls.dispose();active?.dispose();fk=undefined;scene.clear();
    renderer?.dispose();renderer?.domElement.remove();
  },{once:true});
}catch(e){
  error.textContent="C2 laboratory startup failed: "+String(e);
  status.textContent="C2 laboratory unavailable";
  renderer?.dispose();
  console.error(e);
}
