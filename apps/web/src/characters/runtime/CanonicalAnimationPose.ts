import * as THREE from "three";
import {
  createAnimationSampler, type AnimationClipV1, type AnimationSampler,
  type SampledJointV1,
} from "@trilok/character-core";
import { SemanticCharacter } from "./SemanticCharacter";

/**
 * C6.1 reference renderer bridge: rest-local deltas on an existing
 * SemanticCharacter. Not a new rig or combat actor; never dispatches events.
 * C5 FK/IK owns the Studio pose while active; a caller must explicitly opt
 * into this mutually exclusive simple reference playback.
 */
export class CanonicalAnimationPose {
  private readonly sampler: AnimationSampler;
  private readonly rest = new Map<string, {
    readonly joint: THREE.Object3D;
    readonly quaternion: THREE.Quaternion;
    readonly position: THREE.Vector3;
  }>();
  private disposed = false;

  constructor(character: SemanticCharacter, clip: AnimationClipV1,
    private readonly applyCalibratedPose?: (samples: readonly SampledJointV1[]) => void) {
    this.sampler = createAnimationSampler(clip, character.graph);
    for (const id of this.sampler.jointIds) {
      const joint = character.joint(id);
      this.rest.set(id, {
        joint, quaternion: joint.quaternion.clone(), position: joint.position.clone(),
      });
    }
  }

  /** Sample is independent of render delta time; no allocations retained per frame. */
  sample(seconds: number): readonly SampledJointV1[] {
    if (this.disposed) throw new Error("Animation pose disposed");
    return this.sampler.sample(seconds);
  }

  apply(seconds: number): void {
    if (this.disposed) throw new Error("Animation pose disposed");
    const poses = this.sampler.sample(seconds);
    if (this.applyCalibratedPose) {
      this.applyCalibratedPose(poses);
      return;
    }
    // All samples are validated and calculated before any scene mutation.
    for (const pose of poses) {
      const rest = this.rest.get(pose.jointId)!;
      rest.joint.quaternion.copy(rest.quaternion);
      rest.joint.position.copy(rest.position);
      if (pose.rotation) {
        const delta = new THREE.Quaternion(...pose.rotation);
        rest.joint.quaternion.multiply(delta);
      }
      if (pose.translation)
        rest.joint.position.add(new THREE.Vector3(...pose.translation));
    }
  }

  reset(): void {
    if (this.disposed) throw new Error("Animation pose disposed");
    if (this.applyCalibratedPose) {
      this.applyCalibratedPose([]);
      return;
    }
    for (const rest of this.rest.values()) {
      rest.joint.quaternion.copy(rest.quaternion);
      rest.joint.position.copy(rest.position);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.rest.clear();
    this.disposed = true;
  }
}
