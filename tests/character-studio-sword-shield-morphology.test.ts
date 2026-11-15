import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {make} from "./helpers/studio-two-hand-fixtures";
import {solveIndependentGrips,StudioShieldPreview,SHIELD_STANCES}
  from "../apps/web/src/studio/StudioSwordShield";

/** Body-morph combinations run through the actual MakeHuman target atlas.
 * Never infer contact success from an unmodified reference human.
 */
describe("C5.3 morphed source skin and shield clearance",()=>{
  it.each([
    {name:"infant",morph:{"macro/age":.06}},
    {name:"large abdomen",morph:{"macro/weight":1}},
    {name:"compact powerful",morph:{"macro/height":0,"macro/weight":1,
      "macro/muscle":1}},
    {name:"tall slender",morph:{"macro/height":1,"macro/weight":0,
      "macro/muscle":0}},
  ] as readonly {name:string;morph:Readonly<Record<string,number>>}[])
    ("retargets both independent hands on $name body",({name,morph})=>{
    const {human,model,fk}=make(morph);
    try{
      for(const hand of ["left","right"] as const){
        for(const stance of Object.keys(SHIELD_STANCES) as
          (keyof typeof SHIELD_STANCES)[]){
          const solved=solveIndependentGrips(model,fk,[],hand,stance);
          expect(solved.reason,name+" / "+hand+" / "+stance).toBe("ok");
          expect(solved.reachable).toBe(true);
          expect(solved.swordContactErrorMeters).toBeLessThan(.065*1.2);
          expect(solved.shieldContactErrorMeters).toBeLessThan(.065*1.2);
          expect(solved.minimumClearanceMeters).toBeGreaterThan(-.008);
          expect(solved.forearmContactGapMeters).toBeLessThan(.04);
          expect(solved.shieldWorld.elements.every(Number.isFinite)).toBe(true);
          const forward=human.spike.character.root.getWorldQuaternion(new THREE.Quaternion());
          const front=new THREE.Vector3(0,0,1).applyQuaternion(forward);
          const normal=new THREE.Vector3(0,0,1).transformDirection(solved.shieldWorld);
          expect(normal.dot(front)).toBeGreaterThan(.95);
          const shield=new StudioShieldPreview(model,solved);
          shield.update();
          expect(shield.object.matrix.elements.every(Number.isFinite)).toBe(true);
          shield.dispose();
          fk.apply([]);
        }
      }
    }finally{human.dispose();}
  },120_000);
});
