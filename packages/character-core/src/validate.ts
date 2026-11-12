import { moduleOfAnatomyId, validAnatomyId, validateModuleId } from "./ids";
import {
  CHARACTER_COORDINATES, type AnatomicalGraphV1, type CharacterInjuryStateV1,
  type CharacterRecipeV1, type Quat, type Vec3,
} from "./schema";

const nonEmpty = (s: string): boolean => typeof s === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(s);
const finite = (n: number): boolean => typeof n === "number" && Number.isFinite(n);
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("Invalid character data: " + message);
}
function unique(items: readonly string[], label: string): void {
  check(new Set(items).size === items.length, "duplicate " + label);
}
function vector(v: Vec3, label: string): void {
  check(Array.isArray(v) && v.length === 3 && v.every(finite), "invalid " + label);
}
function quaternion(q: Quat, label: string): void {
  check(Array.isArray(q) && q.length === 4 && q.every(finite), "invalid " + label);
  const norm = Math.hypot(...q);
  check(Math.abs(norm - 1) <= 1e-5, "non-unit " + label);
}
function noCycles<T extends { readonly id: string; readonly parentId: string | null }>(
  nodes: readonly T[], label: string,
): void {
  const map = new Map(nodes.map(node => [node.id, node]));
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string): void {
    if (visited.has(id)) return;
    check(!visiting.has(id), "cycle in " + label + ": " + id);
    const node = map.get(id);
    check(node !== undefined, "missing " + label + " node " + id);
    visiting.add(id);
    if (node.parentId !== null) {
      check(map.has(node.parentId), "missing " + label + " parent " + node.parentId);
      visit(node.parentId);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const node of nodes) visit(node.id);
}
const purposes = new Set(["primary_grip","secondary_grip","shield","bow_nock","bow_string",
  "projectile_origin","back","hip","effect","ik_target"]);
const moduleKinds = new Set(["humanoid","extra_arm","extra_leg","head","tail","wing"]);

/** Strict structural validation: no Three.js, no DOM, no combat behavior. */
export function validateAnatomicalGraph(graph: AnatomicalGraphV1,
  knownCombatRegionIds: readonly string[] = []): void {
  check(graph !== null && typeof graph === "object", "graph object");
  check(graph.schemaVersion === 1 && graph.coordinates === CHARACTER_COORDINATES,
    "schema or coordinate system");
  check(nonEmpty(graph.topologyFamilyId) && nonEmpty(graph.headTopologyFamilyId), "topology family");
  check(Array.isArray(graph.modules) && graph.modules.length > 0 && graph.modules.length <= 64, "module count");
  check(Array.isArray(graph.segments) && graph.segments.length > 0 && graph.segments.length <= 1024, "segment count");
  check(Array.isArray(graph.joints) && graph.joints.length > 0 && graph.joints.length <= 4096, "joint count");
  check(Array.isArray(graph.sockets) && graph.sockets.length <= 4096, "socket count");
  check(Array.isArray(graph.skinBindings) && graph.skinBindings.length <= 1024, "skin binding count");
  check(Array.isArray(graph.severZones) && graph.severZones.length <= 1024, "sever count");

  unique(graph.modules.map(m=>m.id),"module ID");
  unique(graph.segments.map(s=>s.id),"segment ID");
  unique(graph.joints.map(j=>j.id),"joint ID");
  unique(graph.sockets.map(s=>s.id),"socket ID");
  unique(graph.skinBindings.map(s=>s.meshId),"mesh binding");
  unique(graph.severZones.map(s=>s.id),"sever zone ID");
  const modules = new Map(graph.modules.map(m=>[m.id,m]));
  const segments = new Map(graph.segments.map(s=>[s.id,s]));
  const joints = new Map(graph.joints.map(j=>[j.id,j]));
  check(graph.modules.filter(m=>m.kind==="humanoid" && m.attachedToSegment===null).length===1,
    "exactly one foundational humanoid");
  for(const module of graph.modules) {
    validateModuleId(module.id);
    check(moduleKinds.has(module.kind) && nonEmpty(module.topologyFamilyId), "module kind/family");
    if(module.attachedToSegment === null) check(module.kind==="humanoid", "detached extension module");
    else {
      const parent=segments.get(module.attachedToSegment);
      check(parent && parent.moduleId !== module.id, "module anchor");
    }
    unique(module.segmentIds,"module segment reference");
    unique(module.jointIds,"module joint reference");
    check(module.segmentIds.length>0 && module.jointIds.length>0, "empty module");
    for(const id of module.segmentIds) check(segments.get(id)?.moduleId===module.id, "module segment membership " + id);
    for(const id of module.jointIds) check(joints.get(id)?.segmentId &&
      segments.get(joints.get(id)!.segmentId)?.moduleId===module.id, "module joint membership " + id);
  }

  for (const segment of graph.segments) {
    check(validAnatomyId(segment.id) && moduleOfAnatomyId(segment.id)===segment.moduleId,
      "segment namespace " + segment.id);
    check(modules.has(segment.moduleId), "missing module");
    if(segment.parentId===null) check(modules.get(segment.moduleId)?.attachedToSegment===null, "extra segment root");
    else check(segments.has(segment.parentId), "missing segment parent");
    check(joints.get(segment.proximalJointId)?.segmentId===segment.id, "segment proximal joint");
    unique(segment.combatRegionIds,"combat region");
    unique(segment.capabilityIds,"segment capability");
    for(const id of segment.combatRegionIds)
      check(nonEmpty(id) && (!knownCombatRegionIds.length || knownCombatRegionIds.includes(id)),
        "unknown combat region: " + id);
    for(const id of segment.capabilityIds) check(nonEmpty(id), "capability ID");
    check(modules.get(segment.moduleId)!.segmentIds.includes(segment.id), "orphan segment " + segment.id);
  }
  noCycles(graph.segments,"segments");
  check(graph.segments.filter(s=>s.parentId===null).length===1, "segment root count");
  for(const module of graph.modules) {
    if(module.attachedToSegment === null) continue;
    const roots=graph.segments.filter(s=>s.moduleId===module.id && s.parentId &&
      segments.get(s.parentId)?.moduleId!==module.id);
    check(roots.length===1 && roots[0]!.parentId===module.attachedToSegment,
      "extension must attach once to declared parent");
  }
  for(const joint of graph.joints) {
    check(validAnatomyId(joint.id) && moduleOfAnatomyId(joint.id)===
      segments.get(joint.segmentId)?.moduleId, "joint namespace");
    check(nonEmpty(joint.role) && typeof joint.exported === "boolean", "joint role/export flag");
    vector(joint.bindTranslation,"joint translation");
    quaternion(joint.bindQuaternion,"joint quaternion");
    if(joint.parentId!==null) check(joints.has(joint.parentId), "missing joint parent");
    check(modules.get(segments.get(joint.segmentId)!.moduleId)!.jointIds.includes(joint.id),
      "orphan joint");
  }
  noCycles(graph.joints,"joints");
  check(graph.joints.filter(j=>j.parentId===null).length===1,"joint root count");
  // Every joint must descend from the segment's proximal joint, and segment
  // anchors must share their parent or an ancestor of that parent's segment.
  for(const segment of graph.segments) {
    const proximal=joints.get(segment.proximalJointId)!;
    if(segment.parentId===null) check(proximal.parentId===null, "root proximal joint");
    else {
      check(proximal.parentId!==null, "unparented segment proximal joint");
      let cursor = joints.get(proximal.parentId)!;
      const seen=new Set<string>();
      while(cursor.segmentId!==segment.parentId && cursor.parentId!==null) {
        check(!seen.has(cursor.id),"joint hierarchy cycle");
        seen.add(cursor.id);
        cursor=joints.get(cursor.parentId)!;
      }
      check(cursor.segmentId===segment.parentId,"joint segment parent mismatch");
    }
  }
  for(const joint of graph.joints) {
    if(joint.parentId!==null && joints.get(joint.parentId)!.segmentId!==joint.segmentId) {
      check(joint.id===segments.get(joint.segmentId)!.proximalJointId,"joint crosses segment at non-root");
    }
  }
  for(const socket of graph.sockets) {
    check(socket.id.startsWith(socket.ownerSegmentId+"/socket/") &&
      nonEmpty(socket.id.slice((socket.ownerSegmentId+"/socket/").length)) &&
      purposes.has(socket.purpose), "socket ID/purpose");
    const joint=joints.get(socket.parentJointId);
    check(joint?.segmentId===socket.ownerSegmentId, "socket owner must match parent joint segment");
    vector(socket.localTranslation,"socket translation");
    quaternion(socket.localQuaternion,"socket quaternion");
    unique(socket.requiredCapabilityIds,"socket required capability");
    const caps=new Set(graph.segments.flatMap(s=>s.capabilityIds));
    for(const cap of socket.requiredCapabilityIds) check(caps.has(cap),"unknown socket capability " + cap);
  }
  for(const skin of graph.skinBindings) {
    check(nonEmpty(skin.meshId) && skin.maxInfluencesPerVertex>=1 &&
      skin.maxInfluencesPerVertex<=4 && Number.isSafeInteger(skin.maxInfluencesPerVertex),
      "skin binding influence limit");
    unique(skin.jointIds,"skin joints");
    check(skin.jointIds.length>0, "skin binding empty");
    for(const id of skin.jointIds) check(joints.get(id)?.exported===true,"skin joint not exportable");
  }
  const severSegmentIds=new Set<string>();
  for(const zone of graph.severZones) {
    check(nonEmpty(zone.id) && nonEmpty(zone.seamLoopId) && nonEmpty(zone.capAssetId),
      "sever metadata");
    check(segments.get(zone.segmentId)?.parentId!==null,"sever root/unknown segment");
    check(!severSegmentIds.has(zone.segmentId),"duplicate sever segment");
    severSegmentIds.add(zone.segmentId);
  }
}
/** Resolve the post-injury capabilities of surviving segments without modifying gameplay. */
export function remainingCapabilities(graph: AnatomicalGraphV1,
  injury: CharacterInjuryStateV1): ReadonlySet<string> {
  validateCharacterInjuryState(injury,graph);
  const missing=new Set(injury.missingSegmentIds);
  let changed=true;
  while(changed) {
    changed=false;
    for(const seg of graph.segments) {
      if(seg.parentId!==null && missing.has(seg.parentId) && !missing.has(seg.id)) {
        missing.add(seg.id);
        changed=true;
      }
    }
  }
  return new Set(graph.segments.filter(s=>!missing.has(s.id)).flatMap(s=>s.capabilityIds));
}
export function validateCharacterInjuryState(state: CharacterInjuryStateV1,
  graph: AnatomicalGraphV1): void {
  check(state?.schemaVersion===1 && nonEmpty(state.characterInstanceId), "injury schema/instance");
  check(Array.isArray(state.missingSegmentIds) &&
    Array.isArray(state.severEvents) && state.disfigurement &&
    typeof state.disfigurement==="object" && !Array.isArray(state.disfigurement),"injury state");
  unique(state.missingSegmentIds,"missing segments");
  const segments=new Set(graph.segments.map(s=>s.id));
  const zones=new Map(graph.severZones.map(z=>[z.id,z]));
  for(const id of state.missingSegmentIds) check(segments.has(id),"unknown missing segment");
  for(const [key,value] of Object.entries(state.disfigurement))
    check(nonEmpty(key) && finite(value) && Math.abs(value)<=1,"disfigurement value");
  unique(state.severEvents.map(e=>e.id),"sever events");
  for(const e of state.severEvents) {
    check(nonEmpty(e.id) && zones.has(e.zoneId) && Number.isSafeInteger(e.turn) && e.turn>=0,
      "sever event");
    check(state.missingSegmentIds.includes(zones.get(e.zoneId)!.segmentId),
      "sever event not represented in missing segments");
  }
}
export function validateCharacterRecipe(recipe: CharacterRecipeV1): void {
  check(recipe?.schemaVersion===1 && nonEmpty(recipe.generatorVersion) &&
    nonEmpty(recipe.archetypeId) && nonEmpty(recipe.topologyFamilyId),"recipe identity");
  check(Number.isSafeInteger(recipe.seed) && recipe.seed>=0 && recipe.seed<=0xffffffff,"recipe seed");
  check(Array.isArray(recipe.modules) && recipe.modules.length<=64 &&
    Array.isArray(recipe.materialPresetIds),"recipe modules/materials");
  unique(recipe.modules.map(m=>m.id),"recipe module");
  unique(recipe.materialPresetIds,"material preset");
  for(const module of recipe.modules) {
    validateModuleId(module.id);
    check(nonEmpty(module.familyId) && (module.attachTo===null ||
      validAnatomyId(module.attachTo)), "recipe module reference");
  }
  check(recipe.parameters!==null && typeof recipe.parameters==="object" &&
    !Array.isArray(recipe.parameters),"recipe parameters");
  for(const [key,value] of Object.entries(recipe.parameters))
    check(nonEmpty(key) && finite(value) && Math.abs(value)<=1000, "recipe numeric parameter");
  for(const id of recipe.materialPresetIds) check(nonEmpty(id),"material ID");
}
/** Stable key-order canonical JSON (the schema rejects all nonfinite recipe values). */
export function canonicalRecipeJSON(recipe: CharacterRecipeV1): string {
  validateCharacterRecipe(recipe);
  const sort=(value:unknown):unknown=>Array.isArray(value)?value.map(sort):
    value!==null && typeof value==="object" ? Object.fromEntries(
      Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,sort(v)])
    ):value;
  return JSON.stringify(sort(recipe));
}
/** Noncryptographic deterministic fingerprint, not an asset integrity/security digest. */
export function recipeFingerprint(recipe: CharacterRecipeV1): string {
  const json=canonicalRecipeJSON(recipe);
  let hash=2166136261;
  for(const byte of new TextEncoder().encode(json)) {
    hash=Math.imul(hash^byte,16777619)>>>0;
  }
  return hash.toString(16).padStart(8,"0");
}
/** Version-1 only: future schema versions MUST use explicit migration functions. */
export function parseCharacterRecipe(json: string): CharacterRecipeV1 {
  const parsed: unknown=JSON.parse(json);
  check(parsed!==null && typeof parsed==="object" && !Array.isArray(parsed),"recipe JSON root");
  const recipe=parsed as CharacterRecipeV1;
  validateCharacterRecipe(recipe);
  return recipe;
}
