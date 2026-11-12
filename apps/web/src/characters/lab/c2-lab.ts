import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createContinuousHumanPrototype } from "../geometry/ContinuousHumanPrototype";
import { loadAnatomicalHuman, type AnatomicalHuman } from "../geometry/AnatomicalTemplate";
import { validateSkinningSpike, type SkinningSpike } from "../geometry/SkinningSpike";

const viewport=document.querySelector<HTMLDivElement>("#viewport");
const status=document.querySelector<HTMLElement>("#status");
const error=document.querySelector<HTMLElement>("#error");
if(!viewport||!status||!error)throw new Error("Missing laboratory controls");

type Preview = {spike:SkinningSpike;mesh:THREE.SkinnedMesh;vertexCount:number;
  triangleCount:number;dispose():void;template?:AnatomicalHuman["template"]};
let stopping=false;
let active:Preview|undefined;
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
       " boundary / "+t.nonManifoldEdgeCount+" non-manifold edges":" · implicit fallback");
  };
  function applyPose(name:string):void {
    if(!active)return;
    currentPose=name;
    // Reset every bone before applying poses; the C1 rest graph is unchanged.
    for(const bone of active.spike.bones.values())bone.quaternion.identity();
    const pose=(role:string,axis:"x"|"y"|"z",amount:number)=>{
      const joint=active!.spike.graph.joints.find(j=>j.role===role);
      if(joint)active!.spike.bones.get(joint.id)!.rotation[axis]=amount;
    };
    switch(name){
      case "tpose":
        pose("shoulder_left","z",-Math.PI/3);pose("shoulder_right","z",Math.PI/3);break;
      case "overhead":
        pose("shoulder_left","z",-2.35);pose("shoulder_right","z",2.35);break;
      case "shoulder":
        pose("clavicle_left","z",-.22);pose("clavicle_right","z",.22);
        pose("shoulder_left","z",-1.5);pose("shoulder_right","z",1.5);break;
      case "elbow":
        pose("elbow_left","x",-2);pose("elbow_right","x",-2);break;
      case "crouch":
        pose("hip_left","x",-1);pose("hip_right","x",-1);
        pose("knee_left","x",1.45);pose("knee_right","x",1.45);
        pose("ankle_left","x",-.4);pose("ankle_right","x",-.4);break;
      case "abduction":
        pose("hip_left","z",-.6);pose("hip_right","z",.6);break;
      case "torso":pose("spine_lower","y",.62);pose("chest","y",.5);break;
      case "neck":pose("neck","y",.65);break;
      case "forearm":pose("wrist_left","y",2.8);pose("wrist_right","y",-2.8);break;
      case "bow":
        pose("shoulder_left","x",-1.2);pose("shoulder_right","x",-1);
        pose("elbow_right","y",-.65);pose("elbow_left","x",-1);break;
    }
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
    scene.add(preview.spike.character.root);
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
    controls.dispose();active?.dispose();scene.clear();
    renderer?.dispose();renderer?.domElement.remove();
  },{once:true});
}catch(e){
  error.textContent="C2 laboratory startup failed: "+String(e);
  status.textContent="C2 laboratory unavailable";
  renderer?.dispose();
  console.error(e);
}
