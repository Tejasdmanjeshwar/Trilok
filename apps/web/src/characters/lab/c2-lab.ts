import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createContinuousHumanPrototype } from "../geometry/ContinuousHumanPrototype";
import { validateSkinningSpike } from "../geometry/SkinningSpike";

const viewport=document.querySelector<HTMLDivElement>("#viewport");
const status=document.querySelector<HTMLElement>("#status");
const error=document.querySelector<HTMLElement>("#error");
if(!viewport||!status||!error)throw new Error("Missing laboratory controls");
let renderer:THREE.WebGLRenderer|undefined;
let dispose:()=>void=()=>{};
try{
  const prototype=createContinuousHumanPrototype({step:.047});
  validateSkinningSpike(prototype.spike);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x242b34);
  const camera=new THREE.PerspectiveCamera(42,1,.1,80);
  camera.position.set(3.2,2.05,4.9);camera.lookAt(0,1,0);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  viewport.appendChild(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.set(0,.96,0);
  controls.enableDamping=!matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.update();
  const ambient=new THREE.HemisphereLight(0xe9e5df,0x4d5156,2.2);
  scene.add(ambient);
  const light=new THREE.DirectionalLight(0xffffff,2);
  light.position.set(3,6,4);scene.add(light);
  const grid=new THREE.GridHelper(4,16,0x86919d,0x515e6a);
  grid.position.y=-.01;scene.add(grid);
  scene.add(prototype.spike.character.root);
  const baseline=new Map([...prototype.spike.bones].map(([id,b])=>[id,b.quaternion.clone()]));
  function applyPose(name:string):void{
    for(const [id,bone] of prototype.spike.bones)bone.quaternion.copy(baseline.get(id)!);
    const pose=(role:string,axis:"x"|"y"|"z",amount:number)=>{
      const joint=prototype.spike.graph.joints.find(j=>j.role===role);
      if(!joint)return;
      const bone=prototype.spike.bones.get(joint.id)!;
      bone.rotation[axis]=amount;
    };
    switch(name){
      case "shoulder": pose("shoulder_left","z",-1.5);pose("shoulder_right","z",1.5);break;
      case "elbow":pose("elbow_left","x",-2.0);pose("elbow_right","x",-2.0);break;
      case "crouch":
        pose("hip_left","x",-1);pose("hip_right","x",-1);
        pose("knee_left","x",1.45);pose("knee_right","x",1.45);
        pose("ankle_left","x",-.4);pose("ankle_right","x",-.4);break;
      case "torso":pose("spine_lower","y",.62);pose("chest","y",.5);break;
      case "forearm":pose("wrist_left","y",2.8);pose("wrist_right","y",-2.8);break;
      case "bow":
        pose("shoulder_left","x",-1.2);pose("shoulder_right","x",-1);
        pose("elbow_right","y",-.65);pose("elbow_left","x",-1);break;
    }
    prototype.spike.character.root.updateWorldMatrix(true,true);
  }
  for(const button of document.querySelectorAll<HTMLButtonElement>("[data-pose]"))
    button.addEventListener("click",()=>{
      const name=button.dataset.pose??"neutral";
      applyPose(name);
      for(const current of document.querySelectorAll<HTMLButtonElement>("[data-pose]"))
        current.setAttribute("aria-pressed",String(current===button));
      status!.textContent="C2 diagnostic · "+name+" · "+
        prototype.vertexCount.toLocaleString()+" vertices · "+
        prototype.triangleCount.toLocaleString()+" triangles";
    });
  status.textContent="C2 diagnostic ready · "+prototype.vertexCount.toLocaleString()+
    " vertices · "+prototype.triangleCount.toLocaleString()+" triangles";
  document.documentElement.dataset.c2Ready="true";
  let raf=0,stopped=false;
  function render(){
    if(stopped)return;
    const width=Math.max(1,viewport!.clientWidth),height=Math.max(1,viewport!.clientHeight);
    renderer!.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();
    controls.update();
    renderer!.render(scene,camera);
    raf=requestAnimationFrame(render);
  }
  render();
  const stop=()=>{
    if(stopped)return;stopped=true;cancelAnimationFrame(raf);
    controls.dispose();prototype.dispose();renderer!.dispose();renderer!.domElement.remove();
    scene.clear();
  };
  window.addEventListener("pagehide",stop,{once:true});
  dispose=stop;
}catch(e){
  const message=e instanceof Error?e.message:String(e);
  error.textContent="C2 generation failed: "+message;
  status.textContent="C2 laboratory unavailable";
  console.error(e);
}
void dispose;
