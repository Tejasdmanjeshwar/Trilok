import * as THREE from "three";
import { createWarrior, type WarriorRole } from "./warrior";
import type { WeaponId } from "@trilok/combat";

export type Motion = "idle" | "attack" | "melee" | "windup" | "parry" | "dodge" | "hit" | "victory";
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
    dodge: clip("dodge", .73, {
      LeftArm: [[0,0,0,-.1],[.13,.45,0,-.55],[.4,.45,0,-.6],[.73,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.13,.35,0,.5],[.4,.35,0,.6],[.73,0,0,.1]],
      Torso: [[0,0,0,0],[.17,.07,0,-.32],[.36,.1,0,-.43],[.73,0,0,0]],
    }),
    hit: clip("hit", .73, {
      LeftArm: [[0,0,0,-.1],[.2,.4,0,-.38],[.73,0,0,-.1]],
      RightArm: [[0,0,0,.1],[.2,.6,0,.45],[.73,0,0,.1]],
      Torso: [[0,0,0,0],[.16,.32,0,.14],[.73,0,0,0]],
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
  let current: Motion = "idle";
  let active = actions.idle;
  active.play();
  return {
    root: rig.root,
    face: rig.face,
    equip: rig.equip,
    play(name) {
      if (current === name) return;
      active.fadeOut(0.13);
      current = name;
      active = actions[name];
      active.reset();
      active.enabled = true;
      active.setEffectiveWeight(1);
      active.setLoop(name === "idle" ? THREE.LoopRepeat : THREE.LoopOnce, name === "idle" ? Infinity : 1);
      active.clampWhenFinished = name !== "idle";
      active.fadeIn(0.13);
      active.play();
    },
    update(delta, elapsedMs) {
      mixer.update(Math.max(0, Math.min(.05, delta)));
      if (current !== "idle" && elapsedMs !== undefined && Number.isFinite(elapsedMs)) {
        const time = Math.min(library[current].duration, Math.max(0, elapsedMs / 1000));
        if (Math.abs(active.time - time) > .05) {
          active.time = time;
          mixer.update(0);
        }
      }
    },
    socketWorld(out) {
      const anchor = rig.root.getObjectByName(role === "archer" ? "LeftArm" : "RightArm");
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
