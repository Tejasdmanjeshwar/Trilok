import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {StudioBodyCollision} from "../apps/web/src/studio/StudioBodyCollision";
import {generateStudioCharacter} from "../apps/web/src/studio/StudioGenerator";
import {make} from "./helpers/studio-two-hand-fixtures";

/** Cache ownership is tied to the actual generated human and attributes.
 * Fresh collision instances still sample and calibrate the current posed
 * MakeHuman skin; neither stale world transforms nor old topology are legal.
 */
describe("C5.5 source torso topology reuse",()=>{
  it.each([undefined,2929832126] as const)(
    "preserves source envelope and root-invariant clearance (seed %s)",seed=>{
      const generated=seed===undefined?undefined:generateStudioCharacter(seed);
      const {human,model}=generated?
        make(generated.morphology.body,generated.morphology.shape):make();
      const root=human.spike.character.root;
      const before=root.position.clone(),turn=root.quaternion.clone();
      try{
        root.updateWorldMatrix(true,true);
        const pelvis=human.spike.graph.joints.find(j=>j.role==="pelvis")!;
        const anchor=human.spike.bones.get(pelvis.id)!;
        const point=anchor.getWorldPosition(new THREE.Vector3());
        const first=new StudioBodyCollision(model);
        const second=new StudioBodyCollision(model);
        expect(second.sourceVertices).toBe(first.sourceVertices);
        expect(second.sourceTriangleCount).toBe(first.sourceTriangleCount);
        const baselineClearance=first.clearance(point);
        expect(second.clearance(point)).toBeCloseTo(baselineClearance,9);

        root.position.add(new THREE.Vector3(.43,.19,-.3));
        root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0,1,0),.37));
        root.updateWorldMatrix(true,true);
        const transformed=anchor.getWorldPosition(new THREE.Vector3());
        const moved=new StudioBodyCollision(model);
        expect(moved.sourceVertices).toBe(first.sourceVertices);
        expect(moved.sourceTriangleCount).toBe(first.sourceTriangleCount);
        // The earlier collision object has bind-root transforms for the
        // ORIGINAL pose and must not be queried after moving the root.
        expect(moved.clearance(transformed))
          .toBeCloseTo(baselineClearance,6);

        // A geometry version change invalidates the immutable classification.
        // Recalibration continues to use the same actual skin and contact.
        const position=human.mesh.geometry.getAttribute("position");
        position.needsUpdate=true;
        const invalidated=new StudioBodyCollision(model);
        expect(invalidated.sourceVertices).toBe(first.sourceVertices);
        expect(invalidated.sourceTriangleCount).toBe(first.sourceTriangleCount);
        expect(invalidated.clearance(transformed))
          .toBeCloseTo(moved.clearance(transformed),9);
      }finally{
        root.position.copy(before);
        root.quaternion.copy(turn);
        root.updateWorldMatrix(true,true);
        human.dispose();
      }
    },120_000);
});
