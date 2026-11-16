import * as THREE from "three";

/** Model-space anatomical line-of-force diagnostics shared by equipment and
 * upper-body contact solvers. Pure functions; no FK writes or extra rig.
 * Straightness is measured at actual joint landmarks, not a rendered prop.
 */
export interface ArmAlignment {
  /** Interior angle: PI is straight, without being hyperextended. */
  readonly elbowInteriorRadians:number;
  /** Missing shoulder-to-wrist reach compared with two segment lengths. */
  readonly extensionDeficitMeters:number;
  readonly segmentLengthMeters:number;
}
export function measureArmAlignment(shoulder:THREE.Vector3,
  elbow:THREE.Vector3,wrist:THREE.Vector3):ArmAlignment{
  const upper=shoulder.distanceTo(elbow);
  const lower=elbow.distanceTo(wrist);
  if(upper<1e-6||lower<1e-6)
    throw new Error("Degenerate anatomical arm alignment");
  const cosine=shoulder.clone().sub(elbow).normalize().dot(
    wrist.clone().sub(elbow).normalize());
  return {
    elbowInteriorRadians:Math.acos(THREE.MathUtils.clamp(cosine,-1,1)),
    extensionDeficitMeters:Math.max(0,upper+lower-shoulder.distanceTo(wrist)),
    segmentLengthMeters:upper+lower,
  };
}

/** A drawing elbow should fall behind the hook along the grip -> hook axis,
 * with only style- and morphology-appropriate lateral/vertical variation.
 * Project all points onto the real bow-hand/arrow axis: no fake arrow motion.
 */
export interface PullLineAlignment {
  readonly behindHookMeters:number;
  readonly perpendicularMeters:number;
}
export function measurePullLineAlignment(bowGrip:THREE.Vector3,
  hook:THREE.Vector3,drawElbow:THREE.Vector3):PullLineAlignment{
  const axis=bowGrip.clone().sub(hook);
  if(axis.lengthSq()<1e-8)
    throw new Error("Degenerate bow/string line of force");
  axis.normalize();
  const offset=drawElbow.clone().sub(hook);
  const along=offset.dot(axis);
  return {behindHookMeters:-along,
    perpendicularMeters:offset.addScaledVector(axis,-along).length()};
}

/** Smooth, physically scaled residual for near-straight bow arms.
 * A small soft elbow bend remains preferable to a locked joint. No minimum
 * angle is ever imposed by a joint override; the FK owns anatomical limits.
 */
export function bowArmExtensionResidual(alignment:ArmAlignment,
  desiredBendRadians:number):number{
  if(!Number.isFinite(desiredBendRadians)||desiredBendRadians<0||
    desiredBendRadians>Math.PI/2)
    throw new Error("Invalid bow arm bend target");
  const desiredInterior=Math.PI-desiredBendRadians;
  const difference=Math.max(0,desiredInterior-alignment.elbowInteriorRadians);
  return difference*alignment.segmentLengthMeters*.45;
}
