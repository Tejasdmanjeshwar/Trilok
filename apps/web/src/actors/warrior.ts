import * as THREE from "three";
import type { WeaponId } from "@trilok/combat";

export type WarriorRole = "archer" | "rakshasa";
export type WarriorPose = "idle" | "attack" | "windup" | "parry" | "hit" | "victory";

export interface WarriorRig {
  readonly root: THREE.Group;
  readonly role: WarriorRole;
  animate(pose: WarriorPose, progress: number, elapsed: number): void;
  face(position: THREE.Vector3): void;
  equip(weapon: WeaponId): void;
  dispose(): void;
}

function attach(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  castShadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  parent.add(mesh);
  return mesh;
}

/** Geometry-only character stand-ins; can be replaced by rigged GLB assets. */
export function createWarrior(role: WarriorRole): WarriorRig {
  const hero = role === "archer";
  const root = new THREE.Group();
  root.name = hero ? "ArcherHero" : "RakshasaOpponent";
  const body = new THREE.Group();
  body.name = "Torso";
  root.add(body);

  const skin = new THREE.MeshStandardMaterial({ color: hero ? 0x9f6843 : 0x79564d, roughness: 0.91 });
  const fabric = new THREE.MeshStandardMaterial({ color: hero ? 0xdbb26d : 0x713b3b, roughness: 0.94 });
  const clothDark = new THREE.MeshStandardMaterial({ color: hero ? 0x43594c : 0x452a37, roughness: 0.92 });
  const metal = new THREE.MeshStandardMaterial({ color: hero ? 0xbd9c63 : 0x9d8b7c, metalness: 0.65, roughness: 0.34 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x48392e, roughness: 0.95 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xeee0b8, roughness: 0.71 });
  const scale = hero ? 1 : 1.21;
  body.scale.setScalar(scale);

  attach(body, new THREE.CylinderGeometry(0.36, 0.47, 0.96, 10), fabric, [0, 1.57, 0]);
  attach(body, new THREE.CylinderGeometry(0.48, 0.61, 0.74, 9), clothDark, [0, 0.87, 0]);
  attach(body, new THREE.CylinderGeometry(0.41, 0.39, 0.13, 10), metal, [0, 1.16, 0]);
  attach(body, new THREE.SphereGeometry(0.34, 12, 9), skin, [0, 2.41, 0]);
  attach(body, new THREE.CylinderGeometry(0.37, 0.36, 0.19, 12), clothDark, [0, 2.65, 0]);
  attach(body, new THREE.CylinderGeometry(0.38, 0.38, 0.12, 12), metal, [0, 2.69, 0]);
  attach(body, new THREE.BoxGeometry(0.20, 0.12, 0.035), leather, [0, 2.39, 0.322]);
  attach(body, new THREE.BoxGeometry(0.12, 0.08, 0.05), ivory, [-0.15, 2.46, 0.327]);
  attach(body, new THREE.BoxGeometry(0.12, 0.08, 0.05), ivory, [0.15, 2.46, 0.327]);
  attach(body, new THREE.BoxGeometry(0.55, 0.12, 0.56), metal, [0, 1.95, 0]);

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.name = "LeftLeg";
  rightLeg.name = "RightLeg";
  leftLeg.position.set(-0.23, 0.83, 0);
  rightLeg.position.set(0.23, 0.83, 0);
  body.add(leftLeg, rightLeg);
  attach(leftLeg, new THREE.CylinderGeometry(0.15, 0.12, 0.73, 8), clothDark, [0, -0.34, 0]);
  attach(rightLeg, new THREE.CylinderGeometry(0.15, 0.12, 0.73, 8), clothDark, [0, -0.34, 0]);
  attach(leftLeg, new THREE.BoxGeometry(0.32, 0.16, 0.50), leather, [0, -0.69, 0.16]);
  attach(rightLeg, new THREE.BoxGeometry(0.32, 0.16, 0.50), leather, [0, -0.69, 0.16]);

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.name = "LeftArm";
  rightArm.name = "RightArm";
  leftArm.position.set(-0.56, 1.94, 0);
  rightArm.position.set(0.56, 1.94, 0);
  body.add(leftArm, rightArm);
  attach(leftArm, new THREE.CylinderGeometry(0.16, 0.12, 0.74, 9), fabric, [-0.05, -0.37, 0]);
  attach(rightArm, new THREE.CylinderGeometry(0.16, 0.12, 0.74, 9), fabric, [0.05, -0.37, 0]);
  attach(leftArm, new THREE.SphereGeometry(0.21, 9, 7), metal, [0, 0, 0]);
  attach(rightArm, new THREE.SphereGeometry(0.21, 9, 7), metal, [0, 0, 0]);
  attach(leftArm, new THREE.SphereGeometry(0.125, 9, 7), skin, [-0.05, -0.77, 0]);
  attach(rightArm, new THREE.SphereGeometry(0.125, 9, 7), skin, [0.05, -0.77, 0]);

  let heroBow: THREE.Group | null = null;
  let heroSword: THREE.Group | null = null;
  let enemyBow: THREE.Group | null = null;
  let enemySword: THREE.Group | null = null;
  if (hero) {
    const bow = new THREE.Group();
    heroBow = bow;
    bow.position.set(-0.13, -0.82, 0.2);
    leftArm.add(bow);
    const points = [
      new THREE.Vector3(0, -0.92, 0.1),
      new THREE.Vector3(-0.25, -0.49, 0.38),
      new THREE.Vector3(-0.38, 0, 0.57),
      new THREE.Vector3(-0.25, 0.49, 0.38),
      new THREE.Vector3(0, 0.92, 0.1),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    attach(bow, new THREE.TubeGeometry(curve, 24, 0.055, 6, false), leather, [0, 0, 0]);
    const stringPoints = [points[0]!.clone(), points[4]!.clone()];
    const string = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(stringPoints),
      new THREE.LineBasicMaterial({ color: 0xe4d8b1 }),
    );
    bow.add(string);
    attach(body, new THREE.CylinderGeometry(0.13, 0.17, 1, 8), leather, [0.55, 1.65, -0.38]);
    for (let i = 0; i < 4; i++) attach(body, new THREE.CylinderGeometry(0.018, 0.018, 1.25, 4), ivory, [0.47 + i * 0.055, 2.13, -0.40], false);
    const sword = new THREE.Group();
    sword.position.set(0.05, -0.8, 0.28);
    rightArm.add(sword);
    attach(sword, new THREE.CylinderGeometry(0.04, 0.06, 0.45, 7), leather, [0, -0.11, 0]);
    attach(sword, new THREE.BoxGeometry(0.46, 0.09, 0.14), metal, [0, 0.12, 0]);
    attach(sword, new THREE.ConeGeometry(0.105, 1.55, 4), ivory, [0, 0.91, 0]);
    heroSword = sword;
    heroSword.visible = false;
  } else {
    const sword = new THREE.Group();
    enemySword = sword;
    sword.position.set(0.05, -0.8, 0.28);
    rightArm.add(sword);
    attach(sword, new THREE.CylinderGeometry(0.04, 0.06, 0.45, 7), leather, [0, -0.11, 0]);
    attach(sword, new THREE.BoxGeometry(0.46, 0.09, 0.14), metal, [0, 0.12, 0]);
    attach(sword, new THREE.ConeGeometry(0.105, 1.55, 4), ivory, [0, 0.91, 0]);
    const shield = attach(leftArm, new THREE.CylinderGeometry(0.53, 0.53, 0.15, 12), metal, [-0.06, -0.6, 0.32]);
    shield.rotation.x = Math.PI / 2;
    attach(body, new THREE.ConeGeometry(0.18, 0.6, 7), ivory, [-0.31, 2.94, 0]);
    attach(body, new THREE.ConeGeometry(0.18, 0.6, 7), ivory, [0.31, 2.94, 0]);
    // Low-cost alternate weapon, not an invisible equipment-state switch.
    const bow = new THREE.Group();
    enemyBow = bow;
    bow.position.set(-0.12, -0.77, 0.2);
    leftArm.add(bow);
    const bowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -.9, .1),
      new THREE.Vector3(-.35, -.48, .38),
      new THREE.Vector3(-.45, 0, .52),
      new THREE.Vector3(-.35, .48, .38),
      new THREE.Vector3(0, .9, .1),
    ]);
    attach(bow, new THREE.TubeGeometry(bowCurve, 20, .06, 6, false), leather, [0, 0, 0]);
    bow.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -.9, .1), new THREE.Vector3(0, .9, .1),
    ]), new THREE.LineBasicMaterial({ color: 0xe8d8ae })));
    enemyBow.visible = false;
  }

  return {
    root,
    role,
    equip(weapon) {
      if (heroBow) heroBow.visible = weapon === "bow";
      if (heroSword) heroSword.visible = weapon === "sword";
      if (enemyBow) enemyBow.visible = weapon === "bow";
      if (enemySword) enemySword.visible = weapon === "sword";
    },
    face(position) {
      root.rotation.y = Math.atan2(position.x - root.position.x, position.z - root.position.z);
    },
    animate(pose, progress, elapsed) {
      const wave = Math.sin(elapsed * 1.7) * 0.027;
      body.position.y = wave;
      body.rotation.set(0, 0, 0);
      leftArm.rotation.set(0, 0, -0.13);
      rightArm.rotation.set(0, 0, 0.13);
      leftLeg.rotation.x = wave * 0.4;
      rightLeg.rotation.x = -wave * 0.4;
      if (pose === "attack") {
        const lift = Math.sin(Math.min(1, progress) * Math.PI);
        rightArm.rotation.x = -lift * 1.35;
        leftArm.rotation.x = -lift * 1.18;
        body.rotation.x = -lift * 0.08;
      } else if (pose === "windup") {
        const lift = Math.sin(Math.min(1, progress) * Math.PI * 0.9);
        rightArm.rotation.x = -lift * 2.1;
        rightArm.rotation.z = -lift * 0.55;
        body.rotation.y = lift * 0.12;
      } else if (pose === "parry") {
        leftArm.rotation.x = -1.25;
        rightArm.rotation.x = -0.9;
        body.rotation.z = -0.18 * (1 - progress);
      } else if (pose === "hit") {
        body.rotation.x = Math.sin(progress * Math.PI) * 0.16;
      } else if (pose === "victory") {
        rightArm.rotation.x = -1.5;
      }
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          geometries.add(object.geometry);
          const slots = Array.isArray(object.material) ? object.material : [object.material];
          slots.forEach((material) => materials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      root.removeFromParent();
    },
  };
}
