import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createAnatomyPreset, type AnatomicalGraphV1,
} from "../packages/character-core/src/index";
import { SemanticCharacter } from "../apps/web/src/characters/runtime/SemanticCharacter";
import { LegacyWarriorAdapter } from "../apps/web/src/characters/combat/LegacyWarriorAdapter";
import { createAnimatedWarrior } from "../apps/web/src/actors/AnimatedWarrior";

/** Test-only bone hierarchy; no procedural human mesh is constructed in C1. */
function fixture(graph:AnatomicalGraphV1=createAnatomyPreset()){
  const root=new THREE.Group();
  const map=new Map<string,THREE.Object3D>();
  for(const joint of graph.joints){
    const bone=new THREE.Bone();
    bone.name=joint.id;
    bone.position.set(...joint.bindTranslation);
    bone.quaternion.set(...joint.bindQuaternion);
    const parent=joint.parentId===null?root:map.get(joint.parentId)!;
    parent.add(bone);
    map.set(joint.id,bone);
  }
  const character=new SemanticCharacter(graph,root,map,{detachRootOnDispose:true});
  return {root,map,character};
}
describe("C1 semantic Three runtime",()=>{
  it("resolves unique joints and live rigid socket matrices including moved roots",()=>{
    const {root,character}=fixture();
    const socket=character.graph.sockets.find(s=>s.purpose==="primary_grip")!;
    const base=character.socketWorld(socket.id);
    const original=new THREE.Vector3().setFromMatrixPosition(base);
    const shoulder=character.findJoints("shoulder_left");
    expect(shoulder).toHaveLength(1);
    root.position.set(3,0,-2);
    const moved=new THREE.Vector3().setFromMatrixPosition(character.socketWorld(socket.id));
    expect(moved.x-original.x).toBeCloseTo(3);
    expect(moved.z-original.z).toBeCloseTo(-2);
    expect(()=>character.socketWorld("unknown")).toThrow();
    character.dispose();
    expect(()=>character.joint(socket.parentJointId)).toThrow(/disposed/);
  });
  it("rejects a missing semantic bone and invalid external references",()=>{
    const graph=createAnatomyPreset(),base=fixture(graph);
    const altered=new Map(base.map);
    altered.delete(graph.joints[0]!.id);
    expect(()=>new SemanticCharacter(graph,base.root,altered)).toThrow(/Missing runtime joint/);
    const other=new THREE.Bone();
    altered.set(graph.joints[0]!.id,other);
    expect(()=>new SemanticCharacter(graph,base.root,altered)).toThrow(/Missing runtime joint/);
    base.character.dispose();
  });
  it("disposes only explicit owned resources once and preserves shared geometry",()=>{
    const graph=createAnatomyPreset(),root=new THREE.Group(),map=new Map<string,THREE.Object3D>();
    for(const joint of graph.joints){
      const object=new THREE.Bone();
      (joint.parentId?map.get(joint.parentId)!:root).add(object);
      map.set(joint.id,object);
    }
    const parent=new THREE.Group();parent.add(root);
    const shared=new THREE.BoxGeometry(1,1,1);
    const owned=new THREE.BoxGeometry(1,1,1);
    let sharedDisposed=0,ownedDisposed=0;
    shared.addEventListener("dispose",()=>sharedDisposed++);
    owned.addEventListener("dispose",()=>ownedDisposed++);
    const character=new SemanticCharacter(graph,root,map,{
      ownedResources:[owned,owned],detachRootOnDispose:true,
    });
    character.dispose();character.dispose();
    expect(root.parent).toBeNull();
    expect(sharedDisposed).toBe(0);
    expect(ownedDisposed).toBe(1);
    shared.dispose();
  });
  it("keeps D14 legacy actor motion and weapon socket contract untouched",()=>{
    const warrior=createAnimatedWarrior("archer");
    const adapter=new LegacyWarriorAdapter(warrior,createAnatomyPreset());
    const primary=adapter.graph.joints.find(j=>j.role==="palm_left")!;
    expect(adapter.groupForJoint(primary.id)).toBe(warrior.root.getObjectByName("LeftArm"));
    expect(()=>adapter.groupForJoint("not-a-joint")).toThrow(/Unsupported/);
    const before=warrior.socketWorld(new THREE.Vector3()).clone();
    const viaAdapter=adapter.socketWorld(new THREE.Vector3());
    expect(viaAdapter.distanceTo(before)).toBeLessThan(1e-8);
    adapter.equip("sword");
    expect(adapter.socketWorld(new THREE.Vector3()).distanceTo(
      warrior.socketWorld(new THREE.Vector3()))).toBeLessThan(1e-8);
    adapter.play("rapid_melee");
    adapter.update(.016,720);
    adapter.dispose();
  });
});
