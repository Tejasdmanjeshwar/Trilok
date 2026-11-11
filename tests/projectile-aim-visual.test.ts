import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {aimBallisticAt} from "../packages/combat/src/index";
import {createWarrior} from "../apps/web/src/actors/warrior";
import {CombatHitVolumes} from "../apps/web/src/combat/CombatHitVolumes";
import {createPreviewEncounter,PREVIEW_CATALOG} from "../apps/web/src/combat/preview-encounter";
import {createArrowVisual,ARROW_TIP_OFFSET} from "../apps/web/src/effects/ArrowVisual";
import {ProjectileClashEffects} from "../apps/web/src/effects/ProjectileClashEffects";
import {SurfaceMarks} from "../apps/web/src/effects/SurfaceMarks";

describe("v0.4-D7: deterministic aiming and a correctly rendered arrow",()=>{
  it("the same reticle, rig pose, origin and ballistic flight hit consistently",()=>{
    const rig=createWarrior("rakshasa");
    const volumes=new CombatHitVolumes(rig.root,
      createPreviewEncounter().actors.enemy!,PREVIEW_CATALOG);
    const center=volumes.worldCenter("torso").clone();
    const camera=new THREE.PerspectiveCamera(48,1.5,.05,100);
    camera.position.copy(center).add(new THREE.Vector3(0,0,9));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const origin=center.clone().add(new THREE.Vector3(3,.6,6));
    const fire=()=>{
      const target=volumes.snapshotCameraAim(camera,0,0,origin,36);
      expect(target.regionId).toBe("torso");
      const path=aimBallisticAt(100,{
        x:origin.x,y:origin.y,z:origin.z,
      },{
        x:target.toward.x,y:target.toward.y,z:target.toward.z,
      },650,{x:0,y:-9.81,z:0});
      const hit=volumes.firstTrajectoryContact(path,100,650);
      expect(hit?.actualRegionId).toBe("torso");
      expect(hit?.contactTick).toBeLessThan(650);
      return {toward:target.toward,contact:hit!.contactTick};
    };
    const first=fire(),second=fire();
    expect(first.contact).toBe(second.contact);
    expect(first.toward.equals(second.toward)).toBe(true);
    volumes.dispose();rig.dispose();
  });
  it("aiming at empty space does not create a target or fabricated contact",()=>{
    const rig=createWarrior("rakshasa");
    const volumes=new CombatHitVolumes(rig.root,
      createPreviewEncounter().actors.enemy!,PREVIEW_CATALOG);
    const center=volumes.worldCenter("torso").clone();
    const camera=new THREE.PerspectiveCamera(48,1,.05,100);
    camera.position.copy(center).add(new THREE.Vector3(0,0,9));
    camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const origin=center.clone().add(new THREE.Vector3(1,0,6));
    const snapshot=volumes.snapshotCameraAim(camera,.95,.95,origin,36);
    expect(snapshot.regionId).toBeNull();
    volumes.dispose();rig.dispose();
  });
  it("flight mesh has distinct arrowhead, shaft, nock and three feather vanes",()=>{
    const arrow=createArrowVisual();
    expect(arrow.name).toBe("MedievalArrow");
    expect(arrow.children.filter(child=>child.name.startsWith("Fletching_"))).toHaveLength(3);
    expect(arrow.children).toHaveLength(6);
    expect(ARROW_TIP_OFFSET).toBeCloseTo(.7);
    arrow.traverse(object=>{
      if(object instanceof THREE.Mesh){
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
  });
  it("flight visual places its TIP on the authoritative trajectory (not the shaft center)",()=>{
    const scene=new THREE.Scene();
    const effects=new ProjectileClashEffects(scene);
    effects.launch("flight",new THREE.Vector3(1,2,3),
      new THREE.Vector3(11,2,3),0,200);
    effects.update(100);
    const arrow=scene.children[0]!.children[0] as THREE.Group;
    const worldTip=arrow.localToWorld(new THREE.Vector3(0,ARROW_TIP_OFFSET,0));
    expect(worldTip.distanceTo(new THREE.Vector3(6,2,3))).toBeLessThan(1e-6);
    effects.dispose();
  });
});
describe("v0.4-D7: persistent anatomical wound surface marks",()=>{
  it("places the wound at the exact supplied point and follows the animated anchor",()=>{
    const rig=new THREE.Group(),arm=new THREE.Group();
    arm.position.set(.4,1.5,0);
    rig.add(arm);
    const scene=new THREE.Scene();
    scene.add(rig);
    rig.updateWorldMatrix(true,true);
    const world=new THREE.Vector3(.6,1.5,.2);
    const marks=new SurfaceMarks(2);
    const wound=marks.add("wound",{
      point:world,normal:new THREE.Vector3(0,0,1),anchor:arm,
    });
    expect(wound.parent).toBe(arm);
    const point=wound.getWorldPosition(new THREE.Vector3());
    expect(point.distanceTo(world)).toBeLessThan(.02);
    rig.position.x=3;
    rig.updateWorldMatrix(true,true);
    const moved=wound.getWorldPosition(new THREE.Vector3());
    expect(moved.x).toBeGreaterThan(3);
    marks.clear();
    expect(marks.count).toBe(0);
    expect(wound.parent).toBeNull();
    marks.dispose();
  });
  it("caps persistent marks and accepts future scorch/frost styling without game rule changes",()=>{
    const root=new THREE.Group(),scene=new THREE.Scene();
    scene.add(root);
    const marks=new SurfaceMarks(2);
    marks.register("bless",{innerColor:0xf1d29e,rimColor:0x9bb6d7,radius:.08});
    const make=(id:string)=>marks.add(id,{
      point:new THREE.Vector3(),normal:new THREE.Vector3(0,0,1),anchor:root,
    });
    const first=make("wound");
    make("scorch");make("bless");
    expect(marks.count).toBe(2);
    expect(first.parent).toBeNull();
    marks.dispose();
  });
});
