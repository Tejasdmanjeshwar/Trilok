import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CombatCameraDirector } from "../apps/web/src/camera/CombatCameraDirector";

describe("combat camera never crosses into opponent POV",()=>{
  it("keeps the camera behind the hero for telegraph, enemy attack and defense",()=>{
    vi.stubGlobal("window",{matchMedia:()=>({matches:false})});
    try {
      const hero = new THREE.Group();
      hero.position.set(-3.8,0,2.7);
      const enemy = new THREE.Group();
      enemy.position.set(3.3,0,-3.8);
      const camera = new THREE.PerspectiveCamera(44,1.5,.1,180);
      const director = new CombatCameraDirector(camera,hero,enemy);
      for(const shot of ["decision","aim","enemy_attack","windup","defense","counter","reaction"] as const){
        director.setShot(shot);
        director.update(.016,true);
        expect(camera.position.z,shot).toBeGreaterThan(hero.position.z);
        const direction=camera.getWorldDirection(new THREE.Vector3());
        expect(direction.z,shot).toBeLessThan(0);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("aiming view stays stable while aim cursor changes elsewhere",()=>{
    vi.stubGlobal("window",{matchMedia:()=>({matches:true})});
    try{
      const hero=new THREE.Group();
      hero.position.set(-3.8,0,2.7);
      const enemy=new THREE.Group();
      enemy.position.set(3.3,0,-3.8);
      const camera=new THREE.PerspectiveCamera();
      const director=new CombatCameraDirector(camera,hero,enemy);
      director.setShot("aim");
      director.update(.016,true);
      const position=camera.position.clone(), quaternion=camera.quaternion.clone();
      director.update(.016,true);
      expect(camera.position.distanceTo(position)).toBeLessThan(1e-6);
      expect(camera.quaternion.angleTo(quaternion)).toBeLessThan(1e-6);
    } finally{vi.unstubAllGlobals();}
  });
});
