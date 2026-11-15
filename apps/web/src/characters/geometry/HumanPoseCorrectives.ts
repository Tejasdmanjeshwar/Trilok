import * as THREE from "three";
import type { AnatomicalHuman } from "./AnatomicalTemplate";
import type { JointTarget } from "./AnatomicalFK";

export type CorrectiveJointRole = "shoulder_left" | "shoulder_right" |
  "hip_left" | "hip_right";
const ROLES: readonly CorrectiveJointRole[] =
  ["shoulder_left", "shoulder_right", "hip_left", "hip_right"];
/** Opt-in C3.3 morph-target corrections are purely presentation. Source mesh,
 * skin weights, C1 IDs, rest pose and the combat authority remain untouched. */
export class HumanPoseCorrectives {
  readonly roles = ROLES;
  private readonly mesh: THREE.SkinnedMesh;
  private readonly roleJointIds = new Map<CorrectiveJointRole, string>();
  private readonly originalTargets: readonly (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[];
  private readonly originalRelative: boolean;
  private disposed = false;

  constructor(human: AnatomicalHuman) {
    const {mesh, spike, template} = human;
    const geom = mesh.geometry;
    if (geom !== template.geometry || geom.morphAttributes.position?.length)
      throw new Error("C3.3 requires an unmodified morphed CC0 geometry");
    const positions = geom.getAttribute("position");
    const skinIndices = geom.getAttribute("skinIndex");
    const skinWeights = geom.getAttribute("skinWeight");
    if (!positions || !skinIndices || !skinWeights ||
        skinIndices.itemSize !== 4 || skinWeights.itemSize !== 4)
      throw new Error("Invalid C3.3 surface ownership");
    spike.character.root.updateMatrixWorld(true);
    const inverseRoot = spike.character.root.matrixWorld.clone().invert();
    const centers = new Map<CorrectiveJointRole, THREE.Vector3>();
    const distal = new Map<CorrectiveJointRole, THREE.Vector3>();
    const indices = new Map<CorrectiveJointRole, number>();
    for (const role of ROLES) {
      const jointIndex = spike.graph.joints.findIndex(j => j.role === role);
      if (jointIndex < 0) throw new Error("Missing C3.3 joint " + role);
      const id = spike.graph.joints[jointIndex]!.id;
      const nextRole = role.startsWith("shoulder") ? "elbow" : "knee";
      const nextJoint = spike.graph.joints.find(j =>
        j.role === nextRole + role.slice(role.indexOf("_")));
      if (!nextJoint) throw new Error("Missing C3.3 distal joint " + role);
      centers.set(role, spike.bones.get(id)!.getWorldPosition(new THREE.Vector3())
        .applyMatrix4(inverseRoot));
      distal.set(role, spike.bones.get(nextJoint.id)!.getWorldPosition(new THREE.Vector3())
        .applyMatrix4(inverseRoot));
      indices.set(role, jointIndex);
      this.roleJointIds.set(role, id);
    }
    const targets: (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[] = [];
    for (const role of ROLES) {
      const center = centers.get(role)!;
      const axis = distal.get(role)!.clone().sub(center);
      const length = axis.length();
      // A fixed adult 15 cm cutoff rejects valid infant-generated limbs.
      // The same source skeleton permits any finite, noncollapsed two-link
      // segment; short limbs receive proportionately smaller correctives.
      if (!Number.isFinite(length) || length <= 1e-5)
        throw new Error("C3.3 collapsed limb " + role);
      axis.divideScalar(length);
      const data = new Float32Array(positions.count * 3);
      const isArm = role.startsWith("shoulder");
      const maxDistance = Math.min(length * .32, isArm ? .105 : .13);
      const jointIndex = indices.get(role)!;
      const side = role.endsWith("_left") ? "left" : "right";
      for (let i = 0; i < positions.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, i);
        const fromCenter = p.sub(center);
        const along = fromCenter.dot(axis);
        const radial = fromCenter.addScaledVector(axis, -along);
        const radialLength = radial.length();
        if (radialLength < 1e-5 || Math.abs(along) > maxDistance ||
            radialLength > (isArm ? .18 : .23)) continue;
        let ownership = 0;
        for (let k = 0; k < 4; k++) {
          const index = skinIndices.getComponent(i,k);
          const joint = spike.graph.joints[index];
          const matching = index === jointIndex ||
            (joint?.role === (isArm ? "clavicle_" : "pelvis") + side) ||
            (joint?.role === (isArm ? "elbow_" : "knee_") + side) ||
            (joint?.role === "pelvis" && !isArm) ||
            (isArm && index >= spike.graph.joints.length &&
              spike.skeleton.bones[index]?.name ===
              "C2_SKIN_SHOULDER_CONNECTOR_" + side.toUpperCase());
          if (matching) ownership += skinWeights.getComponent(i,k);
        }
        // Fixed bounded and smooth radial correction around the actual joint
        // while preserving UV-seam duplicates and uncorrected hand/foot geometry.
        const u = Math.abs(along) / maxDistance;
        const envelope = (1 - u*u)**2 * Math.min(1, ownership);
        const amplitude = (isArm ? .012 : .015) *
          Math.min(1,length/.15) * envelope;
        const offset = radial.multiplyScalar(amplitude / radialLength);
        data[i*3] = offset.x;
        data[i*3+1] = offset.y;
        data[i*3+2] = offset.z;
      }
      targets.push(new THREE.Float32BufferAttribute(data,3));
    }
    this.mesh = mesh;
    this.originalTargets = geom.morphAttributes.position ?? [];
    this.originalRelative = geom.morphTargetsRelative;
    geom.morphTargetsRelative = true;
    geom.morphAttributes.position = targets;
    mesh.updateMorphTargets();
    this.apply([]);
  }
  /** Input is the exact validated FK command used to pose the same skeleton.
   * No separate RNG, camera, physics state or frame-time accumulation. */
  apply(targets: readonly JointTarget[]): void {
    if (this.disposed) throw new Error("Disposed C3.3 pose correctives");
    const influences = this.mesh.morphTargetInfluences;
    if (!influences || influences.length !== ROLES.length)
      throw new Error("Missing C3.3 morph influences");
    const strength = new Map<string, number>();
    for (const target of targets) {
      if (!Number.isFinite(target.radians)) throw new Error("Nonfinite C3.3 angle");
      if (target.motion !== "flexion" && target.motion !== "abduction") continue;
      const intensity = THREE.MathUtils.clamp(Math.abs(target.radians) / 1.45,0,1);
      strength.set(target.jointId,Math.max(strength.get(target.jointId)??0,intensity));
    }
    for (let i = 0; i < ROLES.length; i++)
      influences[i] = strength.get(this.roleJointIds.get(ROLES[i]!)!) ?? 0;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.applyReset();
    this.mesh.geometry.morphAttributes.position = [...this.originalTargets];
    this.mesh.geometry.morphTargetsRelative = this.originalRelative;
    this.mesh.updateMorphTargets();
  }
  private applyReset(): void {
    for (let i=0; i<(this.mesh.morphTargetInfluences?.length??0); i++)
      this.mesh.morphTargetInfluences![i]=0;
  }
}
