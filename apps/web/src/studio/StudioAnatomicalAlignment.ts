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


/** The bow hand cannot simply extend to full reach while the other hand is
 * required to touch an almost-resting string. The nock is behind the bow
 * grip, so derive the longest legal bow-arm target from the DRAW arm's reach
 * envelope in the actual shooting direction, including shoulder offset.
 *
 * This is a deterministic initialization bound, not an arbitrary wrist/
 * string teleport: subsequent source-skinned contact IK remains authoritative
 * and may reject a nominally feasible target when joint limits or collisions
 * prevent reaching it.
 */
export function feasibleBowArmExtension(
  bowShoulder:THREE.Vector3,drawShoulder:THREE.Vector3,
  aimDirection:THREE.Vector3,bowArmReachMeters:number,
  drawArmReachMeters:number,stringBehindGripMeters:number,
  transverseGripOffset:THREE.Vector3,drawReachReserveMeters:number,
):number{
  if(![bowArmReachMeters,drawArmReachMeters,stringBehindGripMeters,
    drawReachReserveMeters].every(Number.isFinite)||
    bowArmReachMeters<=0||drawArmReachMeters<=0||
    stringBehindGripMeters<0||drawReachReserveMeters<0||
    drawReachReserveMeters>=drawArmReachMeters||
    Math.abs(aimDirection.lengthSq()-1)>1e-5)
    throw new Error("Invalid anatomical reach envelope");
  const relative=bowShoulder.clone().add(transverseGripOffset)
    .sub(drawShoulder);
  const forwardOffset=relative.dot(aimDirection);
  const lateralSquared=Math.max(0,relative.lengthSq()-forwardOffset*forwardOffset);
  const usableDrawReach=drawArmReachMeters-drawReachReserveMeters;
  // No transverse intersection is reachable; let the contact IK reject
  // the best bounded fallback instead of claiming a valid hand position.
  const forwardReach=Math.sqrt(Math.max(0,usableDrawReach*usableDrawReach-
    lateralSquared));
  const longest=stringBehindGripMeters-forwardOffset+forwardReach;
  return THREE.MathUtils.clamp(longest,0,bowArmReachMeters);
}


/** Horizontal-planar arm alignment, independent of elevation. The 3D elbow
 * interior alone does not detect a visibly kinked overhead shooting line.
 * Up and forward are character-local WORLD unit vectors, so this also works
 * under a non-identity character root transform.
 */
export interface ProjectedArmAlignment {
  readonly elbowInteriorRadians:number;
  readonly reachAlongForwardMeters:number;
  readonly wristLateralOffsetMeters:number;
  readonly projectedLengthMeters:number;
}
export function measureProjectedArmAlignment(
  shoulder:THREE.Vector3,elbow:THREE.Vector3,wrist:THREE.Vector3,
  up:THREE.Vector3,forward:THREE.Vector3,
):ProjectedArmAlignment{
  if(Math.abs(up.lengthSq()-1)>1e-5||
    Math.abs(forward.lengthSq()-1)>1e-5||
    Math.abs(up.dot(forward))>1e-5)
    throw new Error("Invalid shooting-plane basis");
  const horizontal=(value:THREE.Vector3)=>value
    .addScaledVector(up,-value.dot(up));
  const a=horizontal(shoulder.clone().sub(elbow));
  const b=horizontal(wrist.clone().sub(elbow));
  const wristDelta=horizontal(wrist.clone().sub(shoulder));
  const aLength=a.length(),bLength=b.length();
  // Elevation may hide the projected elbow. Return finite diagnostics and
  // let the caller keep its 3D constraint when the projection degenerates.
  const elbowInterior=aLength<1e-5||bLength<1e-5?Math.PI:
    Math.acos(THREE.MathUtils.clamp(a.dot(b)/(aLength*bLength),-1,1));
  const lateral=wristDelta.clone()
    .addScaledVector(forward,-wristDelta.dot(forward)).length();
  return {
    elbowInteriorRadians:elbowInterior,
    reachAlongForwardMeters:wristDelta.dot(forward),
    wristLateralOffsetMeters:lateral,
    projectedLengthMeters:wristDelta.length(),
  };
}

/** Keep the projected bow elbow softly extended. The target is a minimum
 * angle, not a locked elbow or a visual-space wrist translation. */
export function planarExtensionResidual(
  alignment:ProjectedArmAlignment,minimumInteriorRadians:number,
):number{
  if(!Number.isFinite(minimumInteriorRadians)||
    minimumInteriorRadians<0||minimumInteriorRadians>Math.PI)
    throw new Error("Invalid projected elbow target");
  return Math.max(0,minimumInteriorRadians-alignment.elbowInteriorRadians)*
    alignment.projectedLengthMeters*.32;
}
