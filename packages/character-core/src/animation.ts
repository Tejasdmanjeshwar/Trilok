import {
  CHARACTER_COORDINATES, type AnatomicalGraphV1, type Quat, type Vec3,
} from "./schema";
import { validateAnatomicalGraph } from "./validate";

/**
 * C6.1 motion contracts. The C1 graph remains the *only* semantic skeleton:
 * these are portable descriptors and rest-relative pose deltas, not another rig.
 * Units: meters, seconds, right-handed Y-up, +Z forward.
 */
export const ANIMATION_CLIP_SCHEMA_VERSION = 1 as const;
export const MAX_ANIMATION_TRACKS = 256;
export const MAX_ANIMATION_KEYS = 8192;

export interface CanonicalRigIdentityV1 {
  readonly schemaVersion: 1;
  readonly coordinates: typeof CHARACTER_COORDINATES;
  readonly topologyFamilyId: string;
  readonly headTopologyFamilyId: string;
  readonly rootJointId: string;
  /** FNV-1a-64 over C1 semantic structure. Compatibility ID, NOT a security hash. */
  readonly bindPoseId: string;
}
export interface CanonicalSkeletonV1 {
  readonly rig: CanonicalRigIdentityV1;
  /** Exact semantic IDs, parent hierarchy and nominal C1 rest transforms. */
  readonly joints: AnatomicalGraphV1["joints"];
  readonly sockets: AnatomicalGraphV1["sockets"];
}
export interface AnimationSourceV1 {
  readonly kind: "internal" | "external";
  readonly creator: string;
  readonly revision: string;
  readonly license: string;
  /** External provenance URL only; never a local path or runtime dependency. */
  readonly origin?: string;
  /** SHA-256 of original source bytes when actually obtained and verified. */
  readonly sha256?: string;
}
export type AnimationTrackV1 =
  | { readonly jointId: string; readonly channel: "rotation";
      readonly timesSeconds: readonly number[]; readonly values: readonly Quat[] }
  | { readonly jointId: string; readonly channel: "translation";
      readonly timesSeconds: readonly number[]; readonly values: readonly Vec3[] };
export interface AnimationContactV1 {
  readonly id: string;
  readonly atSeconds: number;
  readonly socketId: string;
  /** Presentation annotation only; never creates attacks or hit events. */
  readonly kind: "plant" | "lift" | "grip" | "release";
}
export interface AnimationClipV1 {
  readonly schemaVersion: typeof ANIMATION_CLIP_SCHEMA_VERSION;
  readonly id: string;
  readonly rig: CanonicalRigIdentityV1;
  readonly durationSeconds: number;
  readonly source: AnimationSourceV1;
  /** Root translation cannot affect gameplay. Locked forbids root translation. */
  readonly rootMotion: "locked" | "visual_only";
  /** Masks/additive intent are metadata; composing layers is deferred to C6.4. */
  readonly layer: { readonly mode: "base" | "additive"; readonly jointMask: readonly string[] };
  /** Rest-local deltas, NOT absolute bone transforms. */
  readonly retarget: { readonly mode: "rest_delta"; readonly authoredBindPoseId: string };
  readonly tracks: readonly AnimationTrackV1[];
  readonly contacts: readonly AnimationContactV1[];
}
export interface SampledJointV1 {
  readonly jointId: string;
  readonly rotation?: Quat;
  readonly translation?: Vec3;
}
export interface AnimationSampler {
  readonly clipId: string;
  readonly jointIds: readonly string[];
  sample(seconds: number): readonly SampledJointV1[];
}

const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
function requireValid(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error("Invalid animation clip: " + detail);
}
function tuple(value: unknown, length: number, name: string): asserts value is number[] {
  requireValid(Array.isArray(value) && value.length === length &&
    value.every(finite), name);
}
function dot(a: Quat, b: Quat): number {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3];
}
function unit(q: readonly number[]): Quat {
  const length = Math.hypot(q[0]!, q[1]!, q[2]!, q[3]!);
  return [q[0]!/length, q[1]!/length, q[2]!/length, q[3]!/length];
}

/** Stable ordering is the C1 graph ordering, never a Three.js bone index. */
export function canonicalRigIdentity(graph: AnatomicalGraphV1): CanonicalRigIdentityV1 {
  validateAnatomicalGraph(graph);
  const root = graph.joints.find(j => j.parentId === null)!;
  const canonical = JSON.stringify([
    graph.schemaVersion, graph.coordinates, graph.topologyFamilyId,
    graph.headTopologyFamilyId,
    graph.joints.map(j => [j.id, j.parentId, j.role, j.exported,
      j.bindTranslation, j.bindQuaternion]),
    graph.sockets.map(s => [s.id, s.parentJointId, s.purpose,
      s.localTranslation, s.localQuaternion]),
  ]);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < canonical.length; i++) {
    hash = (hash ^ BigInt(canonical.charCodeAt(i))) * 0x100000001b3n;
    hash = BigInt.asUintN(64, hash);
  }
  return {
    schemaVersion: 1, coordinates: CHARACTER_COORDINATES,
    topologyFamilyId: graph.topologyFamilyId,
    headTopologyFamilyId: graph.headTopologyFamilyId,
    rootJointId: root.id, bindPoseId: "fnv1a64:" + hash.toString(16).padStart(16, "0"),
  };
}
export function canonicalSkeleton(graph: AnatomicalGraphV1): CanonicalSkeletonV1 {
  return { rig: canonicalRigIdentity(graph), joints: graph.joints, sockets: graph.sockets };
}

/** Fail closed on hostile/untrusted imports before clip sampling or rig mutation. */
export function validateAnimationClip(value: unknown, graph: AnatomicalGraphV1):
  asserts value is AnimationClipV1 {
  requireValid(value !== null && typeof value === "object" && !Array.isArray(value),
    "object");
  const clip = value as AnimationClipV1;
  const identity = canonicalRigIdentity(graph);
  requireValid(clip.schemaVersion === 1 && validId(clip.id), "schema or id");
  requireValid(clip.rig !== null && typeof clip.rig === "object" &&
    clip.rig.schemaVersion === 1 &&
    clip.rig.coordinates === identity.coordinates &&
    clip.rig.topologyFamilyId === identity.topologyFamilyId &&
    clip.rig.headTopologyFamilyId === identity.headTopologyFamilyId &&
    clip.rig.rootJointId === identity.rootJointId &&
    clip.rig.bindPoseId === identity.bindPoseId, "canonical rig/bind mismatch");
  requireValid(finite(clip.durationSeconds) && clip.durationSeconds > 0 &&
    clip.durationSeconds <= 120, "duration");
  requireValid(clip.rootMotion === "locked" || clip.rootMotion === "visual_only",
    "root motion policy");
  requireValid(clip.retarget !== null && typeof clip.retarget === "object" &&
    clip.retarget.mode === "rest_delta" &&
    clip.retarget.authoredBindPoseId === identity.bindPoseId, "retarget contract");
  const source = clip.source;
  requireValid(source !== null && typeof source === "object" &&
    (source.kind === "internal" || source.kind === "external") &&
    validId(source.creator) && validId(source.revision) &&
    typeof source.license === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9.+ -]{0,95}$/.test(source.license), "source provenance");
  requireValid(source.origin === undefined ||
    (typeof source.origin === "string" && source.origin.length <= 1024 &&
      /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(source.origin) &&
      !/(^|\/)\.\.(\/|$)/.test(source.origin)), "source origin");
  requireValid(source.kind !== "external" || source.origin !== undefined,
    "missing external origin");
  requireValid(source.sha256 === undefined ||
    (typeof source.sha256 === "string" && /^[a-f0-9]{64}$/.test(source.sha256)),
    "source SHA-256");
  const joints = new Map(graph.joints.map(j => [j.id, j]));
  const sockets = new Set(graph.sockets.map(s => s.id));
  const layer = clip.layer;
  requireValid(layer !== null && typeof layer === "object" &&
    (layer.mode === "base" || layer.mode === "additive") &&
    Array.isArray(layer.jointMask) && layer.jointMask.length <= graph.joints.length,
    "layer/mask");
  const mask = new Set<string>();
  for (const id of layer.jointMask) {
    requireValid(typeof id === "string" && joints.has(id) && !mask.has(id),
      "mask joint");
    mask.add(id);
  }
  requireValid(Array.isArray(clip.tracks) && clip.tracks.length > 0 &&
    clip.tracks.length <= MAX_ANIMATION_TRACKS, "track count");
  const channels = new Set<string>();
  let keyCount = 0;
  for (const track of clip.tracks) {
    requireValid(track !== null && typeof track === "object" &&
      typeof track.jointId === "string" && joints.get(track.jointId)?.exported &&
      (track.channel === "rotation" || track.channel === "translation"),
      "track joint/channel");
    requireValid(mask.size === 0 || mask.has(track.jointId), "track outside mask");
    const key = track.jointId + ":" + track.channel;
    requireValid(!channels.has(key), "duplicate track");
    channels.add(key);
    if (track.channel === "translation") {
      requireValid(track.jointId === identity.rootJointId &&
        clip.rootMotion === "visual_only", "unauthorized translation");
    }
    requireValid(Array.isArray(track.timesSeconds) &&
      Array.isArray(track.values) &&
      track.timesSeconds.length >= 2 &&
      track.timesSeconds.length === track.values.length &&
      track.timesSeconds.length <= MAX_ANIMATION_KEYS, "key count");
    keyCount += track.timesSeconds.length;
    requireValid(keyCount <= MAX_ANIMATION_KEYS, "total key budget");
    let previous = -1;
    let previousQuat: Quat | undefined;
    for (let i = 0; i < track.timesSeconds.length; i++) {
      const time = track.timesSeconds[i];
      requireValid(finite(time) && time > previous && time <= clip.durationSeconds,
        "key time");
      if (i === 0) requireValid(time === 0, "first key must be zero");
      previous = time;
      const value = track.values[i];
      if (track.channel === "rotation") {
        tuple(value, 4, "rotation quaternion");
        requireValid(Math.abs(Math.hypot(...value) - 1) <= 1e-5,
          "non-unit rotation");
        const q = value as unknown as Quat;
        requireValid(!previousQuat || dot(previousQuat, q) >= -1e-8,
          "quaternion sign discontinuity");
        previousQuat = q;
      } else tuple(value, 3, "translation vector");
    }
    requireValid(previous === clip.durationSeconds, "last key must equal duration");
  }
  requireValid(Array.isArray(clip.contacts) && clip.contacts.length <= 256,
    "contact count");
  const seen = new Set<string>();
  let lastContactTime = -1;
  for (const c of clip.contacts) {
    requireValid(c !== null && typeof c === "object" &&
      validId(c.id) && !seen.has(c.id) &&
      finite(c.atSeconds) && c.atSeconds >= lastContactTime &&
      c.atSeconds >= 0 && c.atSeconds <= clip.durationSeconds &&
      typeof c.socketId === "string" && sockets.has(c.socketId) &&
      (c.kind === "plant" || c.kind === "lift" ||
       c.kind === "grip" || c.kind === "release"), "contact marker");
    seen.add(c.id);
    lastContactTime = c.atSeconds;
  }
}

function interpolateQuaternion(a: Quat, b: Quat, alpha: number): Quat {
  let cosine = dot(a, b);
  const sign = cosine < 0 ? -1 : 1;
  cosine = Math.min(1, Math.max(0, Math.abs(cosine)));
  if (cosine > .9995)
    return unit(a.map((v, i) => v + alpha * (sign * b[i]! - v)));
  const angle = Math.acos(cosine);
  const divisor = Math.sin(angle);
  const left = Math.sin((1 - alpha) * angle) / divisor;
  const right = sign * Math.sin(alpha * angle) / divisor;
  return unit(a.map((v, i) => left * v + right * b[i]!));
}
function sampleTrack(track: AnimationTrackV1, seconds: number): Quat | Vec3 {
  const times = track.timesSeconds;
  const values = track.values;
  if (seconds <= 0) return values[0]!;
  if (seconds >= times[times.length - 1]!) return values[values.length - 1]!;
  let lo = 0, hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (hi + lo) >>> 1;
    if (times[mid]! <= seconds) lo = mid;
    else hi = mid;
  }
  const ratio = (seconds - times[lo]!) / (times[hi]! - times[lo]!);
  if (track.channel === "rotation")
    return interpolateQuaternion(track.values[lo]!, track.values[hi]!, ratio);
  const start = track.values[lo]!, end = track.values[hi]!;
  return [start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio,
    start[2] + (end[2] - start[2]) * ratio];
}

/** Validates once; samples only poses, never consumes or fires combat events. */
export function createAnimationSampler(clip: AnimationClipV1,
  graph: AnatomicalGraphV1): AnimationSampler {
  validateAnimationClip(clip, graph);
  const jointIds = [...new Set(clip.tracks.map(t => t.jointId))];
  const byJoint = new Map<string, AnimationTrackV1[]>();
  for (const track of clip.tracks) {
    const entries = byJoint.get(track.jointId) ?? [];
    entries.push(track);
    byJoint.set(track.jointId, entries);
  }
  return {
    clipId: clip.id, jointIds,
    sample(seconds) {
      if (!finite(seconds)) throw new Error("Invalid animation sample time");
      const clamped = Math.min(clip.durationSeconds, Math.max(0, seconds));
      return jointIds.map(jointId => {
        const result: {jointId: string; rotation?: Quat; translation?: Vec3} = {jointId};
        for (const track of byJoint.get(jointId)!) {
          if (track.channel === "rotation")
            result.rotation = sampleTrack(track, clamped) as Quat;
          else result.translation = sampleTrack(track, clamped) as Vec3;
        }
        return result;
      });
    },
  };
}

/** JSON is deliberately plain and canonical; no Three.js objects or hidden state. */
export function serializeAnimationClip(clip: AnimationClipV1, graph: AnatomicalGraphV1): string {
  validateAnimationClip(clip, graph);
  return JSON.stringify(clip);
}
export function parseAnimationClip(source: string, graph: AnatomicalGraphV1): AnimationClipV1 {
  requireValid(typeof source === "string" && source.length > 0 &&
    source.length <= 2_000_000, "serialized clip size");
  const value: unknown = JSON.parse(source);
  validateAnimationClip(value, graph);
  return value;
}
