/**
 * C6.3 diagnostic ONLY: project the real MakeHuman skinned vertex positions
 * with Three.js's own CPU skinning path. Does not invent BVH palm surfaces,
 * replace the browser's renderer, or qualify a clip for owner acceptance.
 * Views deliberately include source skeleton next to actual weighted skin.
 */
import * as THREE from "three";

const round = value => +value.toFixed(6);
const degrees = radians => round(radians * 180 / Math.PI);
const clamp = value => Math.max(-1, Math.min(1, value));
const vec = array => new THREE.Vector3(...array);
const unit = value => value.clone().normalize();
const xml = value => String(value).replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&apos;");

function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {count: sorted.length,
    p95: sorted.length ? round(sorted[Math.ceil(sorted.length * .95) - 1]) : null,
    max: sorted.length ? round(sorted.at(-1)) : null};
}

const viewAxes = {
  front: [1, 0], rear: [-1, 0], side: [0, 1],
  "three-quarter": [Math.SQRT1_2, Math.SQRT1_2],
};
function screen(point, anchor, view, originX) {
  const [x, z] = viewAxes[view];
  const local = point.clone().sub(anchor);
  return [round(originX + (x * local.x + z * local.z) * 305),
    round(386 - local.y * 305)];
}
function skeletonLines(sourceJoints, positions, root, view, originX, color) {
  const parts = [];
  for (let i = 0; i < sourceJoints.length; i++) {
    const j = sourceJoints[i];
    if (j.parent === null) continue;
    const a = screen(positions[j.parent], root, view, originX);
    const b = screen(positions[i], root, view, originX);
    const arm = /Shoulder|Elbow|Wrist/.test(j.name);
    parts.push('<path d="M' + a.join(" ") + " L" + b.join(" ") +
      '" stroke="' + (arm ? "#fb7185" : color) +
      '" stroke-width="' + (arm ? 4 : 2.7) + '" stroke-linecap="round"/>');
  }
  return parts.join("");
}
function makeSvg({title, view, sourceJoints, sourcePositions, sourceRoot,
  posed, targetRoot, targetBones}) {
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1150 780">',
    '<rect width="1150" height="780" fill="#0c1423"/>',
    '<path d="M575 0 V780" stroke="#41516b" stroke-width="2"/>',
    '<text x="30" y="35" font-family="sans-serif" fill="white" font-size="21">' +
      xml(title) + " · " + xml(view) + '</text>',
    '<text x="30" y="65" font-family="sans-serif" fill="#aabbd5" font-size="15">Official BVH joint hierarchy (no palm skin)</text>',
    '<text x="590" y="65" font-family="sans-serif" fill="#aabbd5" font-size="15">Actual MakeHuman weighted vertices / C1 rig</text>',
    '<path d="M10 710 H1140" stroke="#37465c" stroke-dasharray="6 5"/>'];
  // This is a point-cloud projection of the ACTUAL deforming body surface.
  // No synthesized capsule, proxy skeleton, or unweighted OBJ is substituted.
  for (let i = 0; i < posed.length; i += 5) {
    const [x, y] = screen(posed[i], targetRoot, view, 862);
    if (x < 578 || x > 1148 || y < 65 || y > 750) continue;
    parts.push('<circle cx="' + x + '" cy="' + y +
      '" r="1.05" fill="#b4d1ec" fill-opacity="0.68"/>');
  }
  parts.push(skeletonLines(sourceJoints, sourcePositions, sourceRoot, view, 290, "#60a5fa"));
  for (const side of ["left", "right"]) {
    const chain = ["clavicle", "shoulder", "elbow", "wrist"];
    for (let i = 0; i < chain.length - 1; i++) {
      const a = targetBones.get(chain[i] + "_" + side);
      const b = targetBones.get(chain[i + 1] + "_" + side);
      if (!a || !b) throw Error("Missing target arm joint for CPU projection");
      const pa = screen(a.getWorldPosition(new THREE.Vector3()), targetRoot, view, 862);
      const pb = screen(b.getWorldPosition(new THREE.Vector3()), targetRoot, view, 862);
      parts.push('<path d="M' + pa.join(" ") + " L" + pb.join(" ") +
        '" stroke="#fbbf24" stroke-width="2" fill="none"/>');
    }
  }
  parts.push('<text x="24" y="770" font-family="sans-serif" fill="#fbbf24" font-size="13">' +
    'CPU pose evidence only — not shaded WebGL or visual acceptance</text></svg>');
  return parts.join("\n") + "\n";
}

export function captureC63SkinnedPose({
  human, fk, samples, sourceJoints, sourcePositions, label,
}) {
  fk.applyRestDeltas(samples);
  human.spike.character.root.updateMatrixWorld(true);
  human.mesh.updateMatrixWorld(true);
  human.spike.skeleton.update();
  const mesh = human.mesh;
  if (mesh.name !== "C2_MAKEHUMAN_CC0_WEIGHTED_SKINNING")
    throw Error("C6.3 evidence requires official weighted MakeHuman skin");
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const skinIndex = geometry.getAttribute("skinIndex");
  const skinWeight = geometry.getAttribute("skinWeight");
  const triangles = geometry.getIndex();
  if (!position || !skinIndex || !skinWeight || !triangles)
    throw Error("Missing official skinned vertex inputs");
  const rest = [], posed = [];
  const local = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    local.fromBufferAttribute(position, i);
    rest.push(local.clone().applyMatrix4(mesh.matrixWorld));
    // SkinnedMesh.getVertexPosition includes the actual C3 morph correctives
    // BEFORE the same bone transform used by GPU skinned presentation.
    const p = mesh.getVertexPosition(i, local.clone()).applyMatrix4(mesh.matrixWorld);
    if (!p.toArray().every(Number.isFinite)) throw Error("Nonfinite skinned vertex " + i);
    posed.push(p);
  }
  const byRole = new Map(human.spike.graph.joints.map(j =>
    [j.role, human.spike.bones.get(j.id)]));
  const targetRoot = byRole.get("pelvis").getWorldPosition(new THREE.Vector3());
  const sourceRoot = sourcePositions[0];
  const indices = new Map(human.spike.skeleton.bones.map((bone, i) => [bone, i]));
  const perSide = {};
  for (const side of ["left", "right"]) {
    const shoulder = byRole.get("shoulder_" + side);
    const elbow = byRole.get("elbow_" + side);
    const wrist = byRole.get("wrist_" + side);
    const clavicle = byRole.get("clavicle_" + side);
    const helper = human.spike.forearmSkinBones.get(side);
    const connector = human.spike.shoulderSkinBones.get(side);
    if (![shoulder, elbow, wrist, clavicle, helper, connector].every(Boolean))
      throw Error("Incomplete official arm chain " + side);
    const pick = bone => {
      const p = bone.getWorldPosition(new THREE.Vector3());
      const q = bone.getWorldQuaternion(new THREE.Quaternion());
      return {position: p.toArray().map(round), worldRotation: q.toArray().map(round)};
    };
    const a = shoulder.getWorldPosition(new THREE.Vector3());
    const b = elbow.getWorldPosition(new THREE.Vector3());
    const c = wrist.getWorldPosition(new THREE.Vector3());
    const upper = b.clone().sub(a).normalize();
    const lower = c.clone().sub(b).normalize();
    const bendDegrees = degrees(Math.acos(clamp(upper.dot(lower))));
    const twistAxis = fk.frames.get(human.spike.graph.joints.find(j =>
      j.role === "elbow_" + side).id).freedoms.get("rotation").axis;
    const delta = fk.frames.get(human.spike.graph.joints.find(j =>
      j.role === "elbow_" + side).id).rest.clone().invert().multiply(elbow.quaternion);
    const signed = delta.x * twistAxis.x + delta.y * twistAxis.y + delta.z * twistAxis.z;
    const signedTwist = 2 * Math.atan2(signed, delta.w) * 180 / Math.PI;
    const helperWeightIndex = indices.get(helper);
    const connectorWeightIndex = indices.get(connector);
    const assigned = {forearm: 0, shoulder: 0};
    for (let i = 0; i < position.count; i++) {
      for (let k = 0; k < 4; k++) {
        const index = skinIndex.getComponent(i, k);
        const weight = skinWeight.getComponent(i, k);
        if (index === helperWeightIndex) assigned.forearm += weight;
        if (index === connectorWeightIndex) assigned.shoulder += weight;
      }
    }
    perSide[side] = {
      clavicle: pick(clavicle), shoulder: pick(shoulder),
      elbow: pick(elbow), proximalForearmSkin: pick(helper),
      wrist: pick(wrist), shoulderConnectorSkin: pick(connector),
      elbowBendDegrees: bendDegrees,
      elbowSignedAxialDegrees: round(((signedTwist + 540) % 360) - 180),
      helperToElbowWorldDegrees: degrees(
        helper.getWorldQuaternion(new THREE.Quaternion()).angleTo(
          elbow.getWorldQuaternion(new THREE.Quaternion()))),
      connectorToShoulderWorldDegrees: degrees(
        connector.getWorldQuaternion(new THREE.Quaternion()).angleTo(
          shoulder.getWorldQuaternion(new THREE.Quaternion()))),
      sumWeightedForearmVertices: round(assigned.forearm),
      sumWeightedConnectorVertices: round(assigned.shoulder),
    };
  }
  const measures = [];
  for (let i = 0; i < triangles.count; i += 21) {
    const a = triangles.getX(i), b = triangles.getX(i + 1);
    if (b === undefined) continue;
    const initial = rest[a].distanceTo(rest[b]);
    if (initial < 1e-4) continue;
    const ratio = posed[a].distanceTo(posed[b]) / initial;
    if (!Number.isFinite(ratio)) throw Error("Nonfinite skinned edge deformation");
    measures.push(ratio);
  }
  // A global mesh mean hides the wrist-to-proximal-forearm skin transition.
  // Measure real original-geometry edge deformation in weighted ARM regions,
  // using the SAME bound mesh and skin indices as the actual Studio character.
  const regions={};
  for(const side of ["left","right"]){
    const armId=role=>{
      const bone=byRole.get(role+"_"+side);
      if(!bone)throw Error("Missing calibrated arm region bone "+role+"/"+side);
      const id=indices.get(bone);
      if(id===undefined)throw Error("Missing skin index for "+role+"/"+side);
      return id;
    };
    const armRegions={
      forearm:[indices.get(human.spike.forearmSkinBones.get(side)),
        armId("elbow"),armId("wrist")],
      shoulder:[indices.get(human.spike.shoulderSkinBones.get(side)),
        armId("clavicle"),armId("shoulder")],
    };
    for(const [name,bones] of Object.entries(armRegions)){
      if(bones.some(id=>id===undefined))
        throw Error("Missing real weighted arm helper "+side+"/"+name);
      const boneSet=new Set(bones);
      const mass=new Float32Array(position.count);
      for(let i=0;i<position.count;i++)
        for(let k=0;k<4;k++)
          if(boneSet.has(skinIndex.getComponent(i,k)))
            mass[i]+=skinWeight.getComponent(i,k);
      const ratios=[];
      for(let i=0;i<triangles.count;i+=3){
        const a=triangles.getX(i),b=triangles.getX(i+1),d=triangles.getX(i+2);
        for(const [first,second] of [[a,b],[b,d],[d,a]]){
          if(mass[first]<.5||mass[second]<.5)continue;
          const initial=rest[first].distanceTo(rest[second]);
          if(initial<1e-4)continue;
          const value=posed[first].distanceTo(posed[second])/initial;
          if(!Number.isFinite(value))
            throw Error("Nonfinite official "+side+" "+name+" weighted edge");
          ratios.push(value);
        }
      }
      if(ratios.length<24)
        throw Error("Missing real weighted skin edges "+side+"/"+name);
      ratios.sort((a,b)=>a-b);
      regions[side+"_"+name]={
        edgeCount:ratios.length,min:round(ratios[0]),p05:round(
          ratios[Math.ceil(ratios.length*.05)-1]),
        p95:round(ratios[Math.ceil(ratios.length*.95)-1]),
        max:round(ratios.at(-1)),
        // Descriptive only: no arbitrary numeric acceptance threshold is
        // weakened or silently converted into a pass.
        fractionBelow80Percent:round(
          ratios.filter(x=>x<.8).length/ratios.length),
        fractionAbove120Percent:round(
          ratios.filter(x=>x>1.2).length/ratios.length),
      };
    }
  }
  const svg = {};
  for (const view of Object.keys(viewAxes))
    svg[view] = makeSvg({title: label, view, sourceJoints,
      sourcePositions, sourceRoot, posed, targetRoot, targetBones: byRole});
  return {measurements: {
    label, sourceVertexCount: position.count, weightedMesh: mesh.name,
    surfaceEdgeStretchSample: stats(measures),
    armRegionEdgeStretch: regions,
    left: perSide.left, right: perSide.right,
    note: "True CPU-skinned MakeHuman vertex positions and real helper transforms. " +
      "No independent source palm surface, no shadow/material rendering, no visual acceptance.",
  }, svg};
}
