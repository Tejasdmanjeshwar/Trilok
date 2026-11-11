import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createWarrior } from "../apps/web/src/actors/warrior";
import {
  CombatHitVolumes, normalizedPointer,
} from "../apps/web/src/combat/CombatHitVolumes";
import { EncounterSession } from "../apps/web/src/combat/EncounterSession";
import { createPreviewEncounter, PREVIEW_CATALOG } from "../apps/web/src/combat/preview-encounter";

function fixture() {
  const rig = createWarrior("rakshasa");
  const enemy = createPreviewEncounter().actors.enemy!;
  const volumes = new CombatHitVolumes(rig.root, enemy, PREVIEW_CATALOG);
  return { rig, volumes };
}
describe("v0.4-C rig-following precision impact", () => {
  it("exposes validated anatomy zones with named positions", () => {
    const {rig,volumes} = fixture();
    expect(volumes.visibleRegionIds).toContain("head");
    expect(volumes.visibleRegionIds).toContain("left_arm");
    const head = volumes.worldCenter("head");
    const torso = volumes.worldCenter("torso");
    expect(head.y).toBeGreaterThan(torso.y);
    expect(() => volumes.worldCenter("wings")).toThrow();
    volumes.dispose(); rig.dispose();
  });

  it("raycasts an aimed head at impact and returns a real hit region", () => {
    const {rig,volumes} = fixture();
    const head = volumes.worldCenter("head");
    const from = head.clone().add(new THREE.Vector3(0, .2, 8));
    const shot = volumes.snapshot(from,"head",36);
    const actual = volumes.impact(shot);
    expect(actual.contact).toBe(true);
    expect(actual.actualRegionId).toBe("head");
    expect(actual.impactPoint.distanceTo(head)).toBeLessThan(1);
    volumes.dispose(); rig.dispose();
  });

  it("does not grant aimed head damage after the defender leaves the shot path", () => {
    const {rig,volumes} = fixture();
    const head = volumes.worldCenter("head");
    const shot = volumes.snapshot(head.clone().add(new THREE.Vector3(0,0,9)),"head",36);
    rig.root.position.x += 5;
    const hit = volumes.impact(shot);
    expect(hit).toMatchObject({ contact:false, actualRegionId:null });
    volumes.dispose(); rig.dispose();
  });

  it("uses actual collider region when applying helmet mitigation", () => {
    const session = new EncounterSession();
    const {rig,volumes} = fixture();
    const head = volumes.worldCenter("head");
    const aimed = volumes.snapshot(head.clone().add(new THREE.Vector3(0,0,9)),"head",36);
    session.attack("hero","enemy","arrow",9,100,"head");
    const spatial = volumes.impact(aimed);
    expect(spatial.actualRegionId).toBe("head");
    const outcome = session.resolveIfReady(1250,9,undefined,spatial)!;
    expect(outcome.outcome.breakdown).toMatchObject({
      intendedRegionId:"head",actualRegionId:"head",critical:false,
    });
    expect(outcome.outcome.breakdown.reasons).toContain("critical_suppressed");
    expect(outcome.outcome.damage).toBe(12);
    volumes.dispose(); rig.dispose();
  });

  it("records a spatial miss rather than awarding intended-region damage", () => {
    const session = new EncounterSession();
    session.attack("hero","enemy","arrow",8,100,"head");
    const outcome=session.resolveIfReady(1250,8,undefined,{
      actualRegionId:null,contact:false,
    })!;
    expect(outcome.outcome).toMatchObject({result:"missed",damage:0});
    expect(outcome.outcome.breakdown.critical).toBe(false);
  });

  it("uses the actual screen crosshair ray, not a preselected region", () => {
    const { rig, volumes } = fixture();
    const head=volumes.worldCenter("head");
    const camera=new THREE.PerspectiveCamera(45,1,0.1,120);
    camera.position.copy(head).add(new THREE.Vector3(0,0,8));
    camera.lookAt(head);
    camera.updateMatrixWorld(true);
    const from=head.clone().add(new THREE.Vector3(0,0,7));
    const aimed=volumes.snapshotCameraAim(camera,0,0,from,36);
    expect(aimed.regionId).toBe("head");
    expect(volumes.impact(aimed).actualRegionId).toBe("head");
    const air=volumes.snapshotCameraAim(camera,.95,.95,from,36);
    expect(air.regionId).toBeNull();
    expect(volumes.impact(air)).toMatchObject({contact:false,actualRegionId:null});
    volumes.dispose(); rig.dispose();
  });

  it("preserves an unsnapped trajectory even when the target moves", () => {
    const {rig,volumes}=fixture();
    const head=volumes.worldCenter("head");
    const camera=new THREE.PerspectiveCamera(45,1,0.1,120);
    camera.position.copy(head).add(new THREE.Vector3(0,0,8));
    camera.lookAt(head);
    camera.updateMatrixWorld(true);
    const snapshot=volumes.snapshotCameraAim(camera,0,0,camera.position,36);
    rig.root.position.x+=7;
    expect(volumes.impact(snapshot).contact).toBe(false);
    volumes.dispose(); rig.dispose();
  });

  it("selects target regions from a camera ray and rejects invalid pointer values", () => {
    const {rig,volumes} = fixture();
    const head = volumes.worldCenter("head");
    const camera = new THREE.PerspectiveCamera(45,1,0.1,100);
    camera.position.copy(head).add(new THREE.Vector3(0,0,8));
    camera.lookAt(head);
    camera.updateMatrixWorld(true);
    expect(volumes.pickCamera(camera,0,0)).toBe("head");
    expect(volumes.pickCamera(camera,Number.NaN,0)).toBeNull();
    const pointer = normalizedPointer({
      getBoundingClientRect:()=>({left:10,top:20,width:200,height:100}),
    } as Pick<HTMLElement,"getBoundingClientRect">,110,70);
    expect(pointer).toEqual({x:0,y:0});
    volumes.dispose(); rig.dispose();
  });
});
