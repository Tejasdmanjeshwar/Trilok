import * as THREE from "three";
import {STUDIO_VIEWS,type StudioView} from "./StudioPresentation";

export interface FittedStudioView {
  readonly position:THREE.Vector3;
  readonly target:THREE.Vector3;
}

/**
 * Fit the real skinned geometry into the available perspective field of view.
 * Camera movement is presentation-only: it never scales the anatomy, changes
 * the skeletal root, or substitutes a fixed "tall character" zoom constant.
 * A fraction of the frustum is reserved for the Studio overlay.
 */
export function fittedStudioView(view:StudioView,
  bounds:THREE.Box3|undefined,aspect:number,verticalFovDegrees:number):FittedStudioView {
  if(!Number.isFinite(aspect)||aspect<=0||
    !Number.isFinite(verticalFovDegrees)||verticalFovDegrees<=0||
    verticalFovDegrees>=170)throw new Error("Invalid Studio camera projection");
  const preset=STUDIO_VIEWS[view];
  const baseTarget=new THREE.Vector3(...preset.target);
  const basePosition=new THREE.Vector3(...preset.position);
  if(!bounds||bounds.isEmpty())return {position:basePosition,target:baseTarget};
  const center=bounds.getCenter(new THREE.Vector3());
  const size=bounds.getSize(new THREE.Vector3());
  if(![center.x,center.y,center.z,size.x,size.y,size.z]
    .every(Number.isFinite))throw new Error("Invalid skinned view bounds");
  const halfFov=THREE.MathUtils.degToRad(verticalFovDegrees)*.5;
  const horizontalHalfFov=Math.atan(Math.tan(halfFov)*aspect);
  // 88% of the field of view accommodates gait poses and editor overlays.
  const frustumFraction=.88;
  const distance=Math.max(
    basePosition.distanceTo(baseTarget),
    size.y*.5/(Math.tan(halfFov)*frustumFraction),
    Math.hypot(size.x,size.z)*.5/
      (Math.tan(horizontalHalfFov)*frustumFraction),
  );
  const direction=basePosition.sub(baseTarget).normalize();
  return {target:center,position:center.clone().addScaledVector(direction,distance)};
}
