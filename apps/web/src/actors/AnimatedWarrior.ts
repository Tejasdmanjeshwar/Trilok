import * as THREE from "three";
import { createWarrior, type WarriorRole } from "./warrior";
import type { WeaponId } from "@trilok/combat";

export type Motion = "idle" | "attack" | "melee" | "windup" | "parry" | "intercept" | "riposte" | "dodge" | "hit" | "hit_heavy" | "hit_arm" | "hit_head" | "victory";
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
    melee: clip("melee", 2.35, {
      LeftArm: [[0,0,0,-.1],[.65,-.45,0,-.3],[1.18,-.8,0,-.28],[1.42,-1.05,0,-.15],[1.75,0,0,-.1],[2.35,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.9,-.5,0,.2],[1.15,-2.35,0,.18],[1.4,-2.55,0,.15],[1.55,.75,0,-.15],[1.9,.12,0,.12],[2.35,0,0,.1]],
      Torso: [[0,0,0,0],[1.1,-.1,-.2,0],[1.43,.14,.25,0],[1.85,0,0,0],[2.35,0,0,0]],
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
  let gait = 0;
  let stride = 0;
  active.play();
  return {
    root: rig.root,
    face: rig.face,
    equip(weapon) {
      equipped = weapon;
      rig.equip(weapon);
    },
    setLocomotion(value) { moving = value; },
    play(name) {
      if (current === name) return;
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
      gait += ((moving ? 1 : 0) - gait) * (1 - Math.exp(-11 * dt));
      stride += dt * 14;
      const step = Math.sin(stride);
      if (leftLeg) leftLeg.rotation.x = step * gait * .57;
      if (rightLeg) rightLeg.rotation.x = -step * gait * .57;
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
      mixer.stopAllAction();
      mixer.uncacheRoot(rig.root);
      rig.dispose();
    },
  };
}
