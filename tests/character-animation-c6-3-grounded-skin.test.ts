import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {createSkinningSpike} from "../apps/web/src/characters/geometry/SkinningSpike";
import {GroundedFootContacts} from "../apps/web/src/studio/GroundedFootContacts";
import {AnatomicalFK} from "../apps/web/src/characters/geometry/AnatomicalFK";

const finitePose=(spike:ReturnType<typeof createSkinningSpike>)=>{
  for(const bone of spike.skeleton.bones){
    const q=bone.quaternion;
    expect([q.x,q.y,q.z,q.w].every(Number.isFinite)).toBe(true);
    expect(Math.abs(q.length()-1)).toBeLessThan(1e-5);
  }
};
describe("C6.3 calibrated skinned-foot contact presentation",()=>{
  it("does not move the gameplay actor root on uneven terrain or while airborne",()=>{
    const spike=createSkinningSpike();
    const root=spike.character.root;
    const fk=new AnatomicalFK(spike.graph,spike.bones);
    const contacts=new GroundedFootContacts(spike.character,{
      heightAt:(x,z)=>.01*x+.02*z,
    },fk.frames);
    try{
      root.position.set(.4,.15,-.7);
      const before=root.position.clone();
      for(let i=0;i<24;i++){
        const status=contacts.apply(1/60,true);
        expect(status.unreachableFeet).toBeGreaterThanOrEqual(0);
        expect(status.maxPenetrationMeters).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(status.pelvisOffsetMeters)).toBe(true);
        finitePose(spike);
      }
      expect(root.position).toEqual(before);
      root.position.set(2,.15,.7);
      const moved=contacts.apply(1/30,true);
      expect(Number.isFinite(moved.maxAnchorSlipMeters)).toBe(true);
      expect(root.position).toEqual(new THREE.Vector3(2,.15,.7));
      expect(contacts.apply(1/60,false).plantedFeet).toBe(0);
      contacts.reset();
      expect(contacts.status.plantedFeet).toBe(0);
    }finally{contacts.dispose();spike.dispose();}
  });
  it("handles missing height samples and regeneration independently",()=>{
    const a=createSkinningSpike(),b=createSkinningSpike();
    let available=false;
    const contacts=new GroundedFootContacts(a.character,{
      heightAt:()=>available?0:undefined,
    });
    const other=new GroundedFootContacts(b.character);
    try{
      expect(contacts.apply(1/60,true).plantedFeet).toBe(0);
      available=true;
      for(let i=0;i<8;i++)contacts.apply(1/60,true);
      contacts.dispose();
      expect(()=>contacts.apply(1/60,true)).toThrow(/disposed/i);
      expect(Number.isFinite(other.apply(1/60,true).maxAnchorSlipMeters)).toBe(true);
    }finally{
      contacts.dispose();other.dispose();a.dispose();b.dispose();
    }
  });
  it("preserves measured world anchors under authorized actor translation and releases on lift",()=>{
    const spike=createSkinningSpike();
    const root=spike.character.root;
    const fk=new AnatomicalFK(spike.graph,spike.bones);
    const calibration=new GroundedFootContacts(spike.character,undefined,fk.frames);
    // The terrain is located at the actual current anatomical sole, not at
    // a hard-coded zero plane or a fabricated authored phase marker.
    const rest=calibration.contactSnapshots();
    expect(rest).toHaveLength(2);
    const height=rest[0]!.worldPoint[1];
    calibration.dispose();
    const contacts=new GroundedFootContacts(spike.character,{
      heightAt:()=>height,
    },fk.frames);
    try {
      expect(contacts.apply(1/60,true).plantedFeet).toBeGreaterThanOrEqual(1);
      const before=contacts.contactSnapshots();
      expect(before.some(foot=>foot.planted)).toBe(true);
      for(let frame=0;frame<5;frame++){
        // Actor translation comes from the caller. Foot IK must never alter
        // this simulation-owned root, even when retaining a support anchor.
        root.position.z+=.001;
        const authorized=root.position.clone();
        contacts.apply(1/60,true);
        expect(root.position).toEqual(authorized);
        const after=contacts.contactSnapshots();
        for(let side=0;side<2;side++){
          if(before[side]!.planted&&after[side]!.planted){
            for(let axis=0;axis<3;axis++)
              expect(after[side]!.worldAnchor[axis])
                .toBeCloseTo(before[side]!.worldAnchor[axis]!,10);
          }
        }
        finitePose(spike);
      }
      root.position.y+=2; // Authorized airborne displacement; no root correction.
      const above=contacts.apply(1/60,true);
      expect(above.plantedFeet).toBe(0);
      expect(contacts.contactSnapshots().every(s=>!s.planted)).toBe(true);
      expect(root.position.y).toBe(2);
    }finally{contacts.dispose();spike.dispose();}
  });

});
