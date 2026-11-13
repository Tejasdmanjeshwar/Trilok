import * as THREE from "three";

/** Explicit, presentation-only frame of a selected semantic anatomical joint.
 * Does not subscribe to selection/recipe changes: manual orbit and pan persist
 * until the user presses Focus or chooses an existing camera preset. */
export function frameSelectedAnatomicalBone(
  camera:THREE.PerspectiveCamera,
  target:THREE.Vector3,
  selection:{readonly role:string;readonly position:THREE.Vector3},
):void {
  const offset=camera.position.clone().sub(target);
  const direction=offset.lengthSq()>1e-8?
    offset.normalize():new THREE.Vector3(0,.08,1).normalize();
  const role=selection.role;
  const range=role.startsWith("finger_")?.15:
    /^(jaw|head|neck)$/.test(role)?.36:
    /^(wrist|palm_)/.test(role)?.26:
    /^(shoulder|elbow|hip|knee|ankle)/.test(role)?.48:.58;
  const distance=Math.max(range,camera.near*3);
  target.copy(selection.position);
  camera.position.copy(selection.position).addScaledVector(direction,distance);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}
