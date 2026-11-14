import * as THREE from "three";
import type {AnatomicalHuman} from "../characters/geometry/AnatomicalTemplate";
import {FACIAL_PRESETS,type FacialWeights} from "../characters/geometry/MakeHumanFacialTargets";

/** Presentation choices are not part of the character recipe or combat state. */
export const STUDIO_FOCUS = {
  face:{label:"Face",role:"head",distance:.48},
  head:{label:"Head and neck",role:"neck",distance:.73},
  torso:{label:"Torso",role:"chest",distance:1.25},
  "left-shoulder":{label:"Left shoulder",role:"shoulder_left",distance:.68},
  "right-shoulder":{label:"Right shoulder",role:"shoulder_right",distance:.68},
  "left-hand":{label:"Left hand",role:"wrist_left",distance:.40},
  "right-hand":{label:"Right hand",role:"wrist_right",distance:.40},
  hips:{label:"Hips",role:"pelvis",distance:1.1},
  "left-knee":{label:"Left knee",role:"knee_left",distance:.63},
  "right-knee":{label:"Right knee",role:"knee_right",distance:.63},
  feet:{label:"Feet",role:"ankle_left",distance:.85},
} as const;
export type StudioFocus = keyof typeof STUDIO_FOCUS;

export const STUDIO_POSES = {
  neutral:"Relaxed",
  tpose:"Arms out",
  shoulder:"Shoulder lift",
  "shoulder-combined":"Arms and elbows",
  crouch:"Crouch",
  "knee-stress":"Knee bend",
  fist:"Closed hands",
  jaw:"Open jaw",
  "neck-jaw":"Head and jaw",
  "whole-extreme":"Full-body stretch",
} as const;
export type StudioPose = keyof typeof STUDIO_POSES;

export const STUDIO_EXPRESSIONS = {
  neutral:"Natural",
  smile:"Smile",
  surprised:"Surprised",
  blink:"Eyes closed",
  asymmetric:"Asymmetric",
} as const;
export type StudioExpression = keyof typeof STUDIO_EXPRESSIONS;

export interface StudioInspectionOptions {
  readonly skeleton:boolean;
  readonly wireframe:boolean;
  readonly joints:boolean;
}
export const DEFAULT_INSPECTION:StudioInspectionOptions=
  Object.freeze({skeleton:false,wireframe:false,joints:false});

/** Expression temporarily overrides only the involved source controls. Resetting
 * the preview reconstructs the exact recipe values without authoring history. */
export function previewExpression(base:FacialWeights,expression:StudioExpression):FacialWeights{
  const overrides=FACIAL_PRESETS[expression];
  if(!overrides)throw new Error("Unsupported expression preview");
  return expression==="neutral"?{...base}:{...base,...overrides};
}

export function focusPosition(human:AnatomicalHuman,area:StudioFocus):
  {target:THREE.Vector3;distance:number}|undefined {
  const choice=STUDIO_FOCUS[area];
  const joint=human.spike.graph.joints.find(j=>j.role===choice.role);
  if(!joint)return undefined;
  const bone=human.spike.bones.get(joint.id);
  if(!bone)return undefined;
  human.spike.character.root.updateWorldMatrix(true,true);
  const target=bone.getWorldPosition(new THREE.Vector3());
  // The head's anatomical joint is near its base; a small offset centers the face.
  if(area==="face")target.y+=.07;
  if(area==="head")target.y+=.09;
  if(area==="feet")target.y-=.09;
  return {target,distance:choice.distance};
}

/** Friendly list; never expose raw semantic IDs in the creator. */
export function inspectionJoints(human:AnatomicalHuman):
  readonly {id:string;label:string}[] {
  return human.spike.graph.joints
    .filter(j=>!j.role.startsWith("finger_")||j.role.endsWith("_0"))
    .map(j=>{
      const side=/arm\[(left|right),|leg\[(left|right),/.exec(j.id);
      const label=j.role.replace(/_[0-2]$/,"").replace(/_(left|right)$/,"")
        .replace(/_/g," ");
      const name=label.charAt(0).toUpperCase()+label.slice(1);
      return {id:j.id,label:(side?.[1]??side?.[2]??
        (j.role.endsWith("_left")?"left":j.role.endsWith("_right")?"right":""))
        .replace(/^./,c=>c.toUpperCase())+" "+name};
    }).map(item=>({id:item.id,label:item.label.trim()}));
}
