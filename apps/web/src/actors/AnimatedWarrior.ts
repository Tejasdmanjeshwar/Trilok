import * as THREE from "three";
import { createWarrior, type WarriorRole } from "./warrior";
import type { WeaponId } from "@trilok/combat";
import type { LocomotionIntent } from "@trilok/character-core";
import {LegacyCanonicalLegProjection} from "./LegacyCanonicalLegProjection";

export type Motion = "idle" | "attack" | "flurry_melee" | "feint_melee" | "delayed_melee" | "rapid_melee" | "heavy_melee" | "melee" | "windup" | "parry" | "intercept" | "riposte" | "dodge" | "hit" | "hit_heavy" | "hit_arm" | "hit_head" | "victory";
type Key = readonly [number, number, number, number];
type Joint = "LeftArm" | "RightArm" | "Torso";
type Pose = Partial<Record<Joint, readonly Key[]>>;

function clip(name: Motion, duration: number, pose: Pose): THREE.AnimationClip {
  const tracks = Object.entries(pose).map(([joint, frames]) => {
    const values: number[] = [];
    for (const [, x, y, z] of frames) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
      values.push(q.x, q.y, q.z, q.w);
    }
    return new THREE.QuaternionKeyframeTrack(
      joint + ".quaternion", frames.map(frame => frame[0]), values,
    );
  });
  return new THREE.AnimationClip(name, duration, tracks);
}

function clips(): Record<Motion, THREE.AnimationClip> {
  return {
    idle: clip("idle", 2, {
      LeftArm: [[0,0,0,-.1],[1,0,0,-.17],[2,0,0,-.1]],
      RightArm: [[0,0,0,.1],[1,0,0,.17],[2,0,0,.1]],
      Torso: [[0,0,0,0],[1,.016,0,0],[2,0,0,0]],
    }),
    attack: clip("attack", 1.5, {
      LeftArm: [[0,0,0,-.1],[.35,-.55,0,-.28],[.67,-1.1,0,-.5],[.85,-1.15,0,-.55],[1.2,-.45,0,-.2],[1.5,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.38,-.7,0,.45],[.68,-1.35,0,.75],[.8,-1.65,0,.1],[1.2,-.35,0,.1],[1.5,0,0,.1]],
      Torso: [[0,0,0,0],[.54,-.12,.2,0],[.9,.06,-.09,0],[1.5,0,0,0]],
    }),
    rapid_melee: clip("rapid_melee", 1.19, {
      LeftArm: [[0,0,0,-.1],[.18,-.32,-.1,-.22],[.47,-.82,0,-.37],[.62,-1.02,0,-.42],[.72,-.38,0,-.14],[.85,-.24,0,-.18],[1.19,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.2,-.96,.15,.25],[.48,-1.95,-.23,.55],[.62,-2.30,-.25,.5],[.72,.85,.2,-.23],[.86,.31,0,.08],[1.19,0,0,.1]],
      Torso: [[0,0,0,0],[.34,-.16,-.28,-.17],[.58,-.33,-.38,-.2],[.72,.32,.3,.2],[.91,.10,.08,.05],[1.19,0,0,0]],
    }),
    heavy_melee: clip("heavy_melee", 2.75, {
      LeftArm: [[0,0,0,-.1],[.36,-.6,-.2,-.33],[.88,-1.12,-.12,-.47],[1.34,-1.42,0,-.53],[1.62,-1.66,0,-.37],[1.85,.65,.12,-.17],[2.08,.28,0,-.07],[2.75,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.36,-1.05,.25,.34],[.92,-2.35,.23,.62],[1.36,-2.66,.16,.68],[1.62,-2.85,-.26,.47],[1.85,1.15,-.15,-.22],[2.06,.43,0,.1],[2.75,0,0,.1]],
      Torso: [[0,0,0,0],[.46,-.12,-.23,-.1],[1.2,-.31,-.52,-.2],[1.63,-.46,-.63,-.24],[1.85,.55,.44,.22],[2.1,.15,.09,.05],[2.75,0,0,0]],
    }),
    melee: clip("melee", 2.35, {
      LeftArm: [[0,0,0,-.1],[.5,-.4,-.12,-.23],[1.1,-.7,0,-.3],[1.31,-1.12,0,-.22],[1.45,-.2,.1,-.08],[1.72,.25,0,-.10],[2.35,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.56,-.75,.14,.25],[1.05,-2.13,0,.3],[1.27,-2.53,-.16,.26],[1.45,.93,.2,-.18],[1.7,.31,0,.10],[2.35,0,0,.1]],
      Torso: [[0,0,0,0],[.96,-.14,-.25,-.07],[1.30,-.29,-.36,-.12],[1.45,.30,.27,.12],[1.80,.08,.06,0],[2.35,0,0,0]],
    }),
    flurry_melee: clip("flurry_melee", 2.16, {
      LeftArm: [[0,0,0,-.1],[.5,-.45,0,-.3],[.9,-1.1,0,-.45],[1.08,.2,0,.1],[1.35,-.6,0,-.2],[1.74,.4,0,-.2],[2.16,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.55,-1.3,.1,.32],[.91,-2.3,-.2,.4],[1.08,.8,.1,-.2],[1.45,-1.9,.3,.5],[1.74,.9,-.1,-.15],[2.16,0,0,.1]],
      Torso: [[0,0,0,0],[.75,-.22,-.3,-.12],[1.08,.35,.25,.16],[1.5,-.33,.29,-.2],[1.74,.36,-.2,.16],[2.16,0,0,0]],
    }),
    feint_melee: clip("feint_melee", 2.66, {
      LeftArm: [[0,0,0,-.1],[.6,-.75,0,-.4],[.92,-.25,0,-.1],[1.25,-.2,0,-.12],[1.83,-.85,0,-.33],[2.24,.3,0,-.1],[2.66,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.7,-1.8,.3,.35],[.92,-2.3,0,.4],[1.18,-.65,0,.2],[1.82,-2.5,.2,.48],[2.24,1.05,-.2,-.12],[2.66,0,0,.1]],
      Torso: [[0,0,0,0],[.8,-.35,-.3,-.17],[.96,.2,.1,.12],[1.5,-.2,-.12,-.06],[2.02,-.35,-.3,-.18],[2.24,.4,.32,.2],[2.66,0,0,0]],
    }),
    delayed_melee: clip("delayed_melee", 2.86, {
      LeftArm: [[0,0,0,-.1],[.7,-.8,0,-.45],[1.45,-1.15,0,-.55],[2.12,-1.5,0,-.53],[2.4,.65,0,-.1],[2.86,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.6,-1.4,.3,.4],[1.6,-2.7,.15,.55],[2.17,-2.9,-.25,.5],[2.4,1.2,0,-.15],[2.86,0,0,.1]],
      Torso: [[0,0,0,0],[.8,-.25,-.3,-.14],[1.82,-.43,-.5,-.2],[2.15,-.47,-.6,-.21],[2.4,.58,.37,.22],[2.86,0,0,0]],
    }),
    windup: clip("windup", 2.18, {
      LeftArm: [[0,0,0,-.1],[.7,-.5,0,-.4],[1.4,-.8,0,-.43],[1.88,.1,0,-.15],[2.18,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.6,-1.6,0,.15],[1.3,-2.5,0,.3],[1.66,-2.35,0,.3],[1.88,.85,0,-.12],[2.18,0,0,.1]],
      Torso: [[0,0,0,0],[1.4,-.14,-.22,0],[1.86,.2,.18,0],[2.18,0,0,0]],
    }),
    parry: clip("parry", .73, {
      LeftArm: [[0,0,0,-.1],[.18,-1.35,0,-.5],[.43,-1.2,0,-.5],[.73,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.2,-.95,0,.55],[.43,-.85,0,.45],[.73,0,0,.1]],
      Torso: [[0,0,0,0],[.24,-.2,0,-.12],[.73,0,0,0]],
    }),
    intercept: clip("intercept", .74, {
      // Bow-hand rises and returns a fast release. It must not reuse sword parry.
      LeftArm: [[0,0,0,-.1],[.16,-.65,-.08,-.38],[.37,-1.23,0,-.4],[.55,-.3,0,-.2],[.74,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.18,-.7,0,.35],[.38,-1.1,0,.6],[.50,-1.35,0,.1],[.74,0,0,.1]],
      Torso: [[0,0,0,0],[.32,-.16,.12,0],[.74,0,0,0]],
    }),
    riposte: clip("riposte", .92, {
      // Weapon recoils from the deflection then lunges into an immediate cut.
      LeftArm: [[0,0,0,-.1],[.15,-.8,0,-.35],[.46,-.6,0,-.2],[.92,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.16,-1.3,0,.3],[.38,-2.4,0,.35],[.6,.75,0,-.15],[.92,0,0,.1]],
      Torso: [[0,0,0,0],[.3,-.17,-.25,0],[.6,.22,.18,0],[.92,0,0,0]],
    }),
    dodge: clip("dodge", .73, {
      LeftArm: [[0,0,0,-.1],[.07,.54,0,-.48],[.18,.75,0,-.6],[.4,.42,0,-.48],[.73,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.07,.44,0,.48],[.18,.64,0,.65],[.4,.38,0,.46],[.73,0,0,.1]],
      Torso: [[0,0,0,0],[.08,.13,-.08,-.38],[.24,.14,-.1,-.50],[.48,-.08,0,-.18],[.73,0,0,0]],
    }),
    hit: clip("hit", .73, {
      LeftArm: [[0,0,0,-.1],[.06,.65,0,-.55],[.22,.58,0,-.35],[.5,.22,0,-.20],[.73,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.06,.85,0,.58],[.22,.70,0,.43],[.5,.32,0,.17],[.73,0,0,.1]],
      Torso: [[0,0,0,0],[.06,.50,0,.17],[.24,.35,0,.22],[.44,-.10,0,-.07],[.73,0,0,0]],
    }),
    hit_heavy: clip("hit_heavy", .88, {
      LeftArm: [[0,0,0,-.1],[.07,.85,0,-.68],[.22,.70,0,-.48],[.52,.20,0,-.17],[.88,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.07,.92,0,.72],[.24,.71,0,.48],[.53,.19,0,.14],[.88,0,0,.1]],
      Torso: [[0,0,0,0],[.065,.65,0,.25],[.25,.51,0,.25],[.52,-.10,0,-.08],[.88,0,0,0]],
    }),
    hit_arm: clip("hit_arm", .72, {
      LeftArm: [[0,0,0,-.1],[.06,.90,.30,-.73],[.22,.7,.15,-.49],[.72,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.08,.45,0,.21],[.72,0,0,.1]],
      Torso: [[0,0,0,0],[.08,.3,.1,.27],[.34,.13,0,.12],[.72,0,0,0]],
    }),
    hit_head: clip("hit_head", .76, {
      LeftArm: [[0,0,0,-.1],[.05,.9,0,-.58],[.3,.5,0,-.42],[.76,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.05,.95,0,.61],[.3,.48,0,.34],[.76,0,0,.1]],
      Torso: [[0,0,0,0],[.05,.75,-.2,0],[.25,.45,-.1,0],[.76,0,0,0]],
    }),
    victory: clip("victory", 1.5, {
      LeftArm: [[0,0,0,-.1],[.6,-.55,0,-.2],[1.5,-.55,0,-.2]],
      RightArm: [[0,0,0,.1],[.6,-2.1,0,.1],[1.5,-2.1,0,.1]],
      Torso: [[0,0,0,0],[.7,-.07,0,0],[1.5,-.07,0,0]],
    }),
  };
}

export interface AnimatedWarrior {
  readonly root: THREE.Group;
  play(name: Motion): void;
  update(deltaSeconds: number, actionElapsedMs?: number): void;
  socketWorld(target: THREE.Vector3): THREE.Vector3;
  face(target: THREE.Vector3): void;
  equip(weapon: WeaponId): void;
  setLocomotion(moving: boolean): void;
  /** Presentation input sampled from authorized movement; never changes root. */
  setLocomotionIntent(intent:LocomotionIntent):void;
  dispose(): void;
}

/** Clip-driven articulated stand-in. Drop-in GLB actors can use the same motion contract. */
export function createAnimatedWarrior(role: WarriorRole): AnimatedWarrior {
  const rig = createWarrior(role);
  const mixer = new THREE.AnimationMixer(rig.root);
  const library = clips();
  const actions = Object.fromEntries(
    (Object.entries(library) as [Motion, THREE.AnimationClip][]).map(([key, value]) => [key, mixer.clipAction(value)]),
  ) as Record<Motion, THREE.AnimationAction>;
  let equipped: WeaponId = role === "archer" ? "bow" : "sword";
  let current: Motion = "idle";
  let active = actions.idle;
  const leftLeg = rig.root.getObjectByName("LeftLeg");
  const rightLeg = rig.root.getObjectByName("RightLeg");
  const leftArm = rig.root.getObjectByName("LeftArm");
  const rightArm = rig.root.getObjectByName("RightArm");
  const torso = rig.root.getObjectByName("Torso");
  let moving = false;
  let intent:LocomotionIntent={forward:0,lateral:0,turn:0,grounded:true};
  let gait = 0;
  let stride = 0;
  let canonical:LegacyCanonicalLegProjection|undefined;
  let pendingCanonical:Promise<void>|undefined;
  let canonicalBlend=0;
  let disposed=false;
  const requestCanonical=():void=>{
    if(canonical||pendingCanonical||disposed)return;
    pendingCanonical=LegacyCanonicalLegProjection.load().then(instance=>{
      if(disposed)instance.dispose();
      else canonical=instance;
    }).catch(error=>{
      // Explicitly retain the legacy gait if an optional lazy chunk fails.
      // Combat authority and action animations must never depend on an
      // animation-resource download completing successfully.
      console.warn("Canonical combat locomotion unavailable",error);
    });
  };
  active.play();
  return {
    root: rig.root,
    face: rig.face,
    equip(weapon) {
      equipped = weapon;
      rig.equip(weapon);
    },
    setLocomotion(value) { moving = value; },
    setLocomotionIntent(value) {
      if(![value.forward,value.lateral,value.turn].every(Number.isFinite)||
        typeof value.grounded!=="boolean")
        throw new Error("Invalid actor locomotion presentation input");
      intent={...value};
      moving=value.grounded&&Math.hypot(value.forward,value.lateral)>1e-3;
      if(moving||Math.abs(value.turn)>1e-3)requestCanonical();
    },
    play(name) {
      if (current === name) {
        if (name !== "idle") active.reset().play();
        return;
      }
      active.fadeOut(name.startsWith("hit") ? .025 : .13);
      current = name;
      active = actions[name];
      active.reset();
      active.enabled = true;
      active.setEffectiveWeight(1);
      active.setLoop(name === "idle" ? THREE.LoopRepeat : THREE.LoopOnce, name === "idle" ? Infinity : 1);
      active.clampWhenFinished = name !== "idle";
      active.fadeIn(name.startsWith("hit") ? .025 : .13);
      active.play();
    },
    update(delta, elapsedMs) {
      const dt = Math.max(0, Math.min(.05, delta));
      mixer.update(dt);
      if (current !== "idle" && elapsedMs !== undefined && Number.isFinite(elapsedMs)) {
        const time = Math.min(library[current].duration, Math.max(0, elapsedMs / 1000));
        if (Math.abs(active.time - time) > .05) {
          active.time = time;
          mixer.update(0);
        }
      }
      // A small procedural gait layer prevents root-motion slides while moving.
      // Leg joints are not animated by the authored upper-body clips.
      // Legacy combat mesh compatibility: gait follows observed movement,
      // not intended travel. Canonical C5 skinned locomotion remains in Studio;
      // this proxy only has one hinge per leg and cannot run its foot IK.
      const magnitude=Math.min(1,Math.hypot(intent.forward,intent.lateral));
      const amplitude=moving?(magnitude>1e-3?magnitude:1):0;
      gait += (amplitude - gait) * (1 - Math.exp(-11 * dt));
      const direction=intent.forward<-.01?-1:1;
      stride += dt * (7+7*magnitude) * direction;
      const step = Math.sin(stride);
      canonicalBlend+=((canonical?1:0)-canonicalBlend)*
        (1-Math.exp(-dt/.2));
      let authored:{leftPitch:number;rightPitch:number;leftRoll:number;rightRoll:number}|undefined;
      if(canonical){
        canonical.setIntent(intent);
        authored=canonical.sample(dt);
      }
      const fallbackRoll=Math.max(-.15,Math.min(.15,intent.lateral*.15))*gait;
      const sourceAmplitude=Math.max(gait,Math.abs(intent.turn));
      if (leftLeg) {
        leftLeg.rotation.x=THREE.MathUtils.lerp(step*gait*.57,
          (authored?.leftPitch??0)*sourceAmplitude,canonicalBlend);
        leftLeg.rotation.z=THREE.MathUtils.lerp(fallbackRoll,
          (authored?.leftRoll??0)*sourceAmplitude,canonicalBlend);
      }
      if (rightLeg) {
        rightLeg.rotation.x=THREE.MathUtils.lerp(-step*gait*.57,
          (authored?.rightPitch??0)*sourceAmplitude,canonicalBlend);
        rightLeg.rotation.z=THREE.MathUtils.lerp(fallbackRoll,
          (authored?.rightRoll??0)*sourceAmplitude,canonicalBlend);
      }
      if (torso) torso.position.y = Math.abs(step) * gait * .045;
      if (current === "idle") {
        if (leftArm) leftArm.rotation.x += -step * gait * .22;
        if (rightArm) rightArm.rotation.x += step * gait * .22;
      }
    },
    socketWorld(out) {
      const anchor = rig.root.getObjectByName(equipped === "bow" ? "LeftArm" : "RightArm");
      if (!anchor) return rig.root.getWorldPosition(out);
      rig.root.updateMatrixWorld(true);
      return anchor.localToWorld(out.set(0, -.78, .28));
    },
    dispose() {
      disposed=true;
      canonical?.dispose();
      mixer.stopAllAction();
      mixer.uncacheRoot(rig.root);
      rig.dispose();
    },
  };
}
