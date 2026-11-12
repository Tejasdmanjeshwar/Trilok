import * as THREE from "three";
import type { AnimatedWarrior, Motion } from "../../actors/AnimatedWarrior";
import type { AnatomicalGraphV1 } from "@trilok/character-core";

/** Test-only bridge for the D14 group-driven renderer. This is NOT a new skinned actor. */
export class LegacyWarriorAdapter implements AnimatedWarrior {
  private readonly jointGroups: ReadonlyMap<string, THREE.Object3D>;
  get root():THREE.Group {return this.warrior.root;}
  constructor(readonly warrior:AnimatedWarrior, readonly graph:AnatomicalGraphV1) {
    const legacyNames:Readonly<Record<string,string>>={
      chest:"Torso", pelvis:"Torso", spine_lower:"Torso",
      shoulder_left:"LeftArm",shoulder_right:"RightArm",
      elbow_left:"LeftArm",elbow_right:"RightArm",
      wrist_left:"LeftArm",wrist_right:"RightArm",
      palm_left:"LeftArm",palm_right:"RightArm",
      hip_left:"LeftLeg",hip_right:"RightLeg",
      knee_left:"LeftLeg",knee_right:"RightLeg",
      ankle_left:"LeftLeg",ankle_right:"RightLeg",
    };
    const groups=new Map<string,THREE.Object3D>();
    for(const joint of graph.joints) {
      const name=legacyNames[joint.role];
      if(!name)continue;
      const object=warrior.root.getObjectByName(name);
      if(!object)throw new Error("Legacy warrior missing group: "+name);
      groups.set(joint.id,object);
    }
    this.jointGroups=groups;
  }
  groupForJoint(id:string):THREE.Object3D {
    const group=this.jointGroups.get(id);
    if(!group)throw new Error("Unsupported legacy joint: "+id);
    return group;
  }
  /** Delegates without altering the D14 action clock, weapon origin or clip sequence. */
  play(motion:Motion):void { this.warrior.play(motion); }
  update(deltaSeconds:number,actionElapsedMs?:number):void {
    this.warrior.update(deltaSeconds,actionElapsedMs);
  }
  face(target:THREE.Vector3):void { this.warrior.face(target); }
  equip(weapon:Parameters<AnimatedWarrior["equip"]>[0]):void {this.warrior.equip(weapon);}
  setLocomotion(moving:boolean):void {this.warrior.setLocomotion(moving);}
  socketWorld(out:THREE.Vector3):THREE.Vector3 {return this.warrior.socketWorld(out);}
  /** Existing Warrior still owns its mixer, meshes and full disposal. */
  dispose():void {this.warrior.dispose();}
}
