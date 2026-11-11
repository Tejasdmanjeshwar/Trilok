import * as THREE from "three";
import { sampleTrajectory, type ProjectileTrajectory } from "@trilok/combat";
import type { CombatCatalog, EncounterActor } from "@trilok/combat";

export interface AimSnapshot {
  readonly regionId: string | null;
  readonly from: THREE.Vector3;
  readonly toward: THREE.Vector3;
  readonly maxRange: number;
}
export interface SpatialImpact {
  readonly actualRegionId: string | null;
  readonly contact: boolean;
  readonly impactPoint: THREE.Vector3;
  /** First swept contact (integer simulation tick); absent on a miss. */
  readonly contactTick?: number;
  readonly contactNormal?: THREE.Vector3;
  readonly velocity?: THREE.Vector3;
  /** Parent bone/rig socket for persistent effects; never sent into pure combat. */
  readonly attachment?: THREE.Object3D;
}

/**
 * Rig-following authored coarse hit volumes. The geometry is deliberately not
 * rendered; it is an inexpensive spatial query proxy, not the visual mesh.
 * The combat domain receives only stable region IDs.
 */
export class CombatHitVolumes {
  private readonly proxies: THREE.Mesh[] = [];
  private readonly byRegion = new Map<string, THREE.Mesh>();
  private readonly caster = new THREE.Raycaster();
  private readonly screenPoint = new THREE.Vector2();
  private readonly worldPoint = new THREE.Vector3();
  private readonly rayDirection = new THREE.Vector3();
  constructor(
    readonly rig: THREE.Object3D,
    readonly actor: EncounterActor,
    catalog: CombatCatalog,
  ) {
    const anatomy = actor.anatomyId ? catalog.anatomies?.[actor.anatomyId] : undefined;
    if (!anatomy) throw new Error("Hit volumes require an authored anatomy.");
    const torso = rig.getObjectByName("Torso") ?? rig;
    const anchors: Readonly<Record<string, [string, number, number, number, number]>> = {
      head: ["Torso", 0, 2.40, 0, .35],
      neck: ["Torso", 0, 2.04, .35, .17],
      torso: ["Torso", 0, 1.46, 0, .57],
      left_arm: ["LeftArm", -.03, -.40, 0, .25],
      right_arm: ["RightArm", .03, -.40, 0, .25],
      left_leg: ["LeftLeg", 0, -.33, 0, .24],
      right_leg: ["RightLeg", 0, -.33, 0, .24],
      body: ["Torso", 0, 1.40, 0, .70],
      horn: ["Torso", 0, 2.72, .10, .24],
      tail: ["Torso", 0, .85, -.65, .26],
    };
    for (const regionId of Object.keys(anatomy.regions)) {
      const spec = anchors[regionId] ?? ["Torso", 0, 1.5, 0, .32];
      const [anchorName,x,y,z,radius] = spec;
      const anchor = rig.getObjectByName(anchorName) ?? torso;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 10, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      mesh.position.set(x,y,z);
      mesh.name = "HitVolume_" + regionId;
      mesh.userData.regionId = regionId;
      mesh.layers.set(13);
      // Keep visible to Raycaster even when parent animations advance,
      // but material visible:false prevents GPU draws.
      anchor.add(mesh);
      this.proxies.push(mesh);
      this.byRegion.set(regionId, mesh);
    }
    this.caster.layers.set(13);
  }

  get visibleRegionIds(): readonly string[] {
    return [...this.byRegion.keys()].filter(id =>
      this.actor.regionExposure?.[id] !== "hidden");
  }

  worldCenter(regionId: string, target = new THREE.Vector3()): THREE.Vector3 {
    const mesh = this.byRegion.get(regionId);
    if (!mesh || this.actor.regionExposure?.[regionId] === "hidden") {
      throw new Error("Unknown or hidden region: " + regionId);
    }
    this.rig.updateWorldMatrix(true, true);
    return mesh.getWorldPosition(target);
  }

  /** Exact rig collider raycast for mouse/touch selecting a body region. */
  pickCamera(camera: THREE.Camera, nx: number, ny: number): string | null {
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || Math.abs(nx) > 1 || Math.abs(ny) > 1) {
      return null;
    }
    this.rig.updateWorldMatrix(true,true);
    this.caster.setFromCamera(this.screenPoint.set(nx,ny), camera);
    this.caster.near=.001;this.caster.far=Infinity;
    const hit = this.firstVisibleHit();
    return hit ? (hit.object.userData.regionId as string) : null;
  }

  snapshot(from: THREE.Vector3, regionId: string, maxRange: number): AimSnapshot {
    if (!Number.isFinite(maxRange) || maxRange <= 0) throw new Error("Invalid attack range.");
    const point = this.worldCenter(regionId, this.worldPoint);
    return {
      regionId,
      from: from.clone(),
      toward: point.clone(),
      maxRange,
    };
  }

  /**
   * Manual screen-space aim. No auto-snap: the cursor ray either intersects a
   * visible region or aims into empty space. Weapon-origin impact is resolved
   * later, so an intended headshot is not automatically a successful headshot.
   */
  snapshotCameraAim(camera: THREE.Camera, nx: number, ny: number,
    weaponOrigin: THREE.Vector3, maxRange: number): AimSnapshot {
    if (![nx,ny,maxRange].every(Number.isFinite) ||
        nx < -1 || nx > 1 || ny < -1 || ny > 1 || maxRange <= 0) {
      throw new Error("Invalid screen aim or range.");
    }
    this.rig.updateWorldMatrix(true,true);
    this.caster.setFromCamera(this.screenPoint.set(nx,ny),camera);
    this.caster.near=.001;this.caster.far=Infinity;
    const hit=this.firstVisibleHit();
    const toward=new THREE.Vector3();
    if (hit) {
      toward.copy(hit.point);
    } else {
      const center=this.rig.getWorldPosition(new THREE.Vector3())
        .add(new THREE.Vector3(0,1.6,0));
      const normal=camera.getWorldDirection(new THREE.Vector3());
      const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,center);
      if (!this.caster.ray.intersectPlane(plane,toward)) {
        toward.copy(this.caster.ray.origin)
          .addScaledVector(this.caster.ray.direction,
            Math.max(4,this.caster.ray.origin.distanceTo(center)));
      }
    }
    return {
      regionId: hit ? (hit.object.userData.regionId as string) : null,
      from: weaponOrigin.clone(),
      toward,
      maxRange,
    };
  }

  /**
   * Swept first-contact query. All impact consumers share this one timestamp,
   * region and point. Raycasting uses the same deterministic trajectory model
   * as the visual projectile; frame skipping cannot pass through a limb.
   */
  firstTrajectoryContact(
    trajectory:ProjectileTrajectory,startTick:number,endTick:number,
  ):SpatialImpact | null {
    if(!Number.isFinite(startTick)||!Number.isFinite(endTick)||
       endTick<startTick)throw new Error("Invalid projectile contact interval.");
    this.rig.updateWorldMatrix(true,true);
    const start=sampleTrajectory(trajectory,startTick).position;
    const previous=new THREE.Vector3(start.x,start.y,start.z);
    const current=new THREE.Vector3();
    const iterations=Math.max(1,Math.ceil((endTick-startTick)/12));
    for(let i=1;i<=iterations;i++){
      const t0=startTick+(endTick-startTick)*(i-1)/iterations;
      const t1=startTick+(endTick-startTick)*i/iterations;
      const p=sampleTrajectory(trajectory,t1).position;
      current.set(p.x,p.y,p.z);
      this.rayDirection.copy(current).sub(previous);
      const segmentLength=this.rayDirection.length();
      if(segmentLength>1e-6){
        this.caster.set(previous,this.rayDirection.multiplyScalar(1/segmentLength));
        this.caster.near=.00001;
        this.caster.far=segmentLength;
        const hit=this.firstVisibleHit();
        if(hit){
          const fraction=Math.max(0,Math.min(1,hit.distance/segmentLength));
          const contactTick=Math.ceil(t0+(t1-t0)*fraction);
          const at=sampleTrajectory(trajectory,contactTick);
          const center=hit.object.getWorldPosition(new THREE.Vector3());
          const normal=hit.point.clone().sub(center).normalize();
          return {
            actualRegionId:hit.object.userData.regionId as string,
            contact:true,impactPoint:hit.point.clone(),
            contactTick,contactNormal:normal,
            velocity:new THREE.Vector3(at.velocity.x,at.velocity.y,at.velocity.z),
            attachment:hit.object.parent ?? this.rig,
          };
        }
      }
      previous.copy(current);
    }
    return null;
  }

  /** Backwards-compatible spatial query for callers needing an explicit miss. */
  impactTrajectory(
    trajectory:ProjectileTrajectory,startTick:number,endTick:number,
  ):SpatialImpact {
    const hit=this.firstTrajectoryContact(trajectory,startTick,endTick);
    if(hit)return hit;
    const p=sampleTrajectory(trajectory,endTick).position;
    return {actualRegionId:null,contact:false,
      impactPoint:new THREE.Vector3(p.x,p.y,p.z)};
  }

  /** Contact is resolved at impact, NOT inferred from the intended region. */
  impact(aim: AimSnapshot): SpatialImpact {
    this.rig.updateWorldMatrix(true,true);
    const distance = aim.from.distanceTo(aim.toward);
    if (distance < .001 || distance > aim.maxRange) {
      return { actualRegionId: null, contact: false, impactPoint: aim.toward.clone() };
    }
    this.rayDirection.copy(aim.toward).sub(aim.from).normalize();
    this.caster.set(aim.from,this.rayDirection);
    this.caster.near = .001;
    this.caster.far = Math.min(aim.maxRange, distance + .65);
    const hit = this.firstVisibleHit();
    return {
      actualRegionId: hit?.object.userData.regionId as string | undefined ?? null,
      contact: !!hit,
      impactPoint: hit ? hit.point.clone() : aim.toward.clone(),
    };
  }

  private firstVisibleHit(): THREE.Intersection | null {
    const candidates = this.caster.intersectObjects(this.proxies, false);
    return candidates.find(hit =>
      this.actor.regionExposure?.[hit.object.userData.regionId as string] !== "hidden") ?? null;
  }

  dispose(): void {
    for (const proxy of this.proxies) {
      proxy.removeFromParent();
      proxy.geometry.dispose();
      (proxy.material as THREE.Material).dispose();
    }
    this.byRegion.clear();
    this.proxies.length = 0;
  }
}

export function normalizedPointer(
  element: Pick<HTMLElement, "getBoundingClientRect">, x: number, y: number,
): { x: number; y: number } | null {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: (x - rect.left) * 2 / rect.width - 1,
    y: 1 - (y - rect.top) * 2 / rect.height,
  };
}
