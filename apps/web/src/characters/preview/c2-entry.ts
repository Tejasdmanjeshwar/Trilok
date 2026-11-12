import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createC2Human, type C2Human } from "../runtime/createC2Human";
import { applyC2StressPose, C2_STRESS_POSES, inspectC2Pose,
  type C2StressPose } from "../pose/C2PoseStress";

function required<T extends HTMLElement>(selector:string):T{
  const node=document.querySelector<T>(selector);
  if(!node)throw new Error("C2 preview missing "+selector);
  return node;
}
const viewport=required<HTMLDivElement>("#c2-view");
const status=required<HTMLElement>("#c2-status");
const error=required<HTMLElement>("#c2-error");
const poseSelect=required<HTMLSelectElement>("#c2-pose");
const cameraSelect=required<HTMLSelectElement>("#c2-camera");
const overlaySelect=required<HTMLSelectElement>("#c2-skeleton");
const geometryLabel=required<HTMLElement>("#c2-geometry");
const rigLabel=required<HTMLElement>("#c2-rig");
const stressLabel=required<HTMLElement>("#c2-stress");
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x10212b);
const camera=new THREE.PerspectiveCamera(38,1,.02,35);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance",preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.4;
viewport.prepend(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=.075;
controls.target.set(0,.91,0);
controls.minDistance=.75;controls.maxDistance=6;
const ambient=new THREE.HemisphereLight(0xcce4fb,0x344050,2.1);
scene.add(ambient);
const key=new THREE.DirectionalLight(0xffead9,3.2);key.position.set(3,5,5);scene.add(key);
const fill=new THREE.DirectionalLight(0xa3e4ef,1.5);fill.position.set(-4,2,-3);scene.add(fill);
const floor=new THREE.Mesh(new THREE.CircleGeometry(2.1,64),
  new THREE.MeshStandardMaterial({color:0x1b3138,roughness:1}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.018;scene.add(floor);
const grid=new THREE.GridHelper(3.8,20,0x567d86,0x2c4951);grid.position.y=.004;scene.add(grid);
let human:C2Human|null=null;
let helper:THREE.SkeletonHelper|null=null;
let frame=0,closed=false;
function viewCamera(mode:string):void{
  const positions:Record<string,[number,number,number]>={
    front:[0,1.05,3.3],three_quarter:[2.5,1.24,2.75],
    side:[3.5,1.10,0],rear:[0,1.05,-3.3],
  };
  camera.position.set(...(positions[mode]??positions.front!));
  controls.target.set(0,.91,0);
  controls.update();
}
function updateDiagnostics():void{
  if(!human)return;
  const pose=poseSelect.value as C2StressPose;
  if(!C2_STRESS_POSES.includes(pose))throw new Error("Invalid pose");
  applyC2StressPose(human,pose);
  const inspected=inspectC2Pose(human);
  stressLabel.textContent="Stress: "+pose+" · "+inspected.samples+
    " CPU samples · max displacement "+inspected.maxDisplacementMeters.toFixed(3)+" m";
  human.mesh.material instanceof THREE.MeshStandardMaterial &&
    (human.mesh.material.wireframe=overlaySelect.value==="wire");
  if(helper)helper.visible=overlaySelect.value==="rig";
}
poseSelect.addEventListener("change",()=>{try{updateDiagnostics();}catch(e){error.textContent=String(e)}});
overlaySelect.addEventListener("change",updateDiagnostics);
cameraSelect.addEventListener("change",()=>viewCamera(cameraSelect.value));
viewCamera("front");
const observer=new ResizeObserver(()=>{
  const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
});
observer.observe(viewport);
function render():void{
  if(closed)return;
  frame=requestAnimationFrame(render);
  controls.update();
  renderer.render(scene,camera);
}
render();
async function initialize():Promise<void>{
  try{
    const response=await fetch("/characters/hm08/base.obj");
    if(!response.ok)throw new Error("CC0 human mesh unavailable: HTTP "+response.status);
    const source=await response.text();
    if(closed)return;
    human=createC2Human(source);
    scene.add(human.character.root);
    helper=new THREE.SkeletonHelper(human.character.root);
    (helper.material as THREE.LineBasicMaterial).depthTest=false;
    helper.visible=false;
    scene.add(helper);
    geometryLabel.textContent="Topology: "+human.topology.retainedSourceVertices+
      " body vertices · "+human.topology.triangles+" triangles · "+
      human.topology.connectedComponents+" source components";
    rigLabel.textContent="Rig: "+human.validation.joints+" joints · "+
      "4 influences maximum · "+human.topology.heightMeters.toFixed(2)+" m";
    poseSelect.disabled=false;
    updateDiagnostics();
    status.textContent="C2 geometry loaded · structural validation passed";
    document.documentElement.dataset.c2Ready="true";
  }catch(e){
    error.textContent="C2 initialization failed: "+String(e);
    status.textContent="C2 validation failed";
    document.documentElement.dataset.c2Ready="error";
  }
}
void initialize();
function dispose():void{
  if(closed)return;
  closed=true;
  cancelAnimationFrame(frame);observer.disconnect();controls.dispose();
  if(helper){scene.remove(helper);helper.geometry.dispose();(helper.material as THREE.Material).dispose();}
  human?.dispose();floor.geometry.dispose();(floor.material as THREE.Material).dispose();
  grid.geometry.dispose();(grid.material as THREE.Material).dispose();
  renderer.dispose();renderer.domElement.remove();
}
window.addEventListener("pagehide",dispose,{once:true});
