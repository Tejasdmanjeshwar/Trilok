import * as THREE from "three";
import type { AnatomicalHuman } from "./AnatomicalTemplate";

/** C3.3 shape-derived presentation metadata. Never replaces C1 socket IDs or
 * creates IK targets in authoritative combat. All distances are in meters. */
export type HumanIKChainId = "arm_left" | "arm_right" | "leg_left" | "leg_right";
export interface HumanIKChain {
  readonly id: HumanIKChainId;
  readonly proximalJointId: string;
  readonly middleJointId: string;
  readonly distalJointId: string;
  readonly upperMeters: number;
  readonly lowerMeters: number;
  readonly maxReachMeters: number;
}
export interface HumanMorphologyAlignment {
  readonly sockets: ReadonlyMap<string, readonly [number, number, number]>;
  readonly chains: ReadonlyMap<HumanIKChainId, HumanIKChain>;
  /** Live presentation transform following the morphed/posed parent joint. */
  socketWorld(id: string, out?: THREE.Matrix4): THREE.Matrix4;
  /** Measured joint centers, not a C5/C6 solver or gameplay hit proxy. */
  chainWorld(id: HumanIKChainId): readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}
interface RestSocket {
  readonly parentIndex: number;
  readonly rootPosition: THREE.Vector3;
}

/** Snapshot canonical C1 rest socket anchors before modifying any bone. */
export function captureHumanRestSockets(human: AnatomicalHuman): ReadonlyMap<string, RestSocket> {
  const { graph, skeleton, character } = human.spike;
  character.root.updateMatrixWorld(true);
  const inverseRoot = character.root.matrixWorld.clone().invert();
  const result = new Map<string, RestSocket>();
  for (const socket of graph.sockets) {
    const index = graph.joints.findIndex(j => j.id === socket.parentJointId);
    if (index < 0) throw new Error("Unknown socket parent: " + socket.id);
    const parent = skeleton.bones[index]!;
    const rootPosition = new THREE.Vector3(...socket.localTranslation)
      .applyMatrix4(parent.matrixWorld).applyMatrix4(inverseRoot);
    result.set(socket.id, { parentIndex: index, rootPosition });
  }
  return result;
}

/** Refit immutable, non-authoritative socket offsets and two-link IK reach to
 * the actual shaped skeleton, including local C3.2 proportion changes. */
export function calibrateHumanMorphologyAlignment(
  human: AnatomicalHuman,
  originals: ReadonlyMap<string, RestSocket>,
  mapRestPoint: (position: THREE.Vector3, parentIndex: number) => THREE.Vector3,
): HumanMorphologyAlignment {
  const { graph, character, bones } = human.spike;
  character.root.updateMatrixWorld(true);
  const sockets = new Map<string, readonly [number, number, number]>();
  for (const socket of graph.sockets) {
    const before = originals.get(socket.id);
    if (!before) throw new Error("Missing rest socket " + socket.id);
    const parent = bones.get(socket.parentJointId);
    if (!parent) throw new Error("Missing shaped socket bone " + socket.id);
    const mapped = mapRestPoint(before.rootPosition.clone(), before.parentIndex);
    if (!mapped.toArray().every(Number.isFinite))
      throw new Error("Nonfinite morphology socket " + socket.id);
    const local = parent.worldToLocal(mapped.applyMatrix4(character.root.matrixWorld));
    sockets.set(socket.id, Object.freeze(local.toArray() as [number, number, number]));
  }
  const roleId = (role: string): string => {
    const joint = graph.joints.find(j => j.role === role);
    if (!joint) throw new Error("Missing C3.3 chain joint " + role);
    return joint.id;
  };
  const chains = new Map<HumanIKChainId, HumanIKChain>();
  for (const kind of ["arm", "leg"] as const) {
    for (const side of ["left", "right"] as const) {
      const id: HumanIKChainId = `${kind}_${side}`;
      const roles = kind === "arm"
        ? ["shoulder_", "elbow_", "wrist_"]
        : ["hip_", "knee_", "ankle_"];
      const ids = roles.map(r => roleId(r + side));
      const positions = ids.map(j => bones.get(j)!.getWorldPosition(new THREE.Vector3()));
      const upperMeters = positions[0]!.distanceTo(positions[1]!);
      const lowerMeters = positions[1]!.distanceTo(positions[2]!);
      // Infant and nonstandard humanoid limbs can be shorter than 8 cm.
      // Reject only numerically collapsed chains; source-derived anatomy sets size.
      if (![upperMeters, lowerMeters].every(n => Number.isFinite(n) && n > 1e-5))
        throw new Error("Invalid shaped IK chain " + id);
      chains.set(id, Object.freeze({
        id, proximalJointId: ids[0]!, middleJointId: ids[1]!,
        distalJointId: ids[2]!, upperMeters, lowerMeters,
        maxReachMeters: upperMeters + lowerMeters,
      }));
    }
  }
  return Object.freeze({
    sockets,
    chains,
    socketWorld(id: string, out = new THREE.Matrix4()): THREE.Matrix4 {
      const socket = graph.sockets.find(s => s.id === id);
      const offset = sockets.get(id);
      if (!socket || !offset) throw new Error("Unknown C3.3 socket " + id);
      const parent = character.joint(socket.parentJointId);
      character.root.updateMatrixWorld(true);
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(...offset),
        new THREE.Quaternion(...socket.localQuaternion),
        new THREE.Vector3(1, 1, 1));
      return out.multiplyMatrices(parent.matrixWorld, local);
    },
    chainWorld(id: HumanIKChainId): readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
      const chain = chains.get(id);
      if (!chain) throw new Error("Unknown C3.3 IK chain " + id);
      character.root.updateMatrixWorld(true);
      return [
        character.joint(chain.proximalJointId).getWorldPosition(new THREE.Vector3()),
        character.joint(chain.middleJointId).getWorldPosition(new THREE.Vector3()),
        character.joint(chain.distalJointId).getWorldPosition(new THREE.Vector3()),
      ];
    },
  });
}
