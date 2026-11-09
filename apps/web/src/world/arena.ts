import * as THREE from "three";
import { SeededRandom, terrainHeight, valueNoise } from "./terrain";

export type ArenaQuality = "high" | "low";

export interface ArenaInstance {
  readonly root: THREE.Group;
  dispose(): void;
}

function addColumn(
  parent: THREE.Group,
  x: number,
  z: number,
  seed: number,
  stone: THREE.Material,
  accents: THREE.Material,
  broken = false,
): void {
  const root = new THREE.Group();
  root.position.set(x, terrainHeight(x, z, seed), z);
  root.rotation.y = (x * 0.13 + z * 0.3) % Math.PI;
  parent.add(root);
  const height = broken ? 2.3 : 4.3;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.35, 1.25), accents);
  base.position.y = 0.18;
  base.castShadow = true;
  root.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, height, 8, 1), stone);
  shaft.position.y = 0.4 + height / 2;
  shaft.castShadow = true;
  root.add(shaft);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 1.2), accents);
  cap.position.y = 0.4 + height + 0.14;
  cap.rotation.z = broken ? 0.2 : 0;
  cap.castShadow = true;
  root.add(cap);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 8), accents);
  ring.position.y = 0.55;
  root.add(ring);
}

export function createArena(seed: number, quality: ArenaQuality): ArenaInstance {
  const random = new SeededRandom(seed);
  const root = new THREE.Group();
  root.name = "ProceduralForestShrine";

  const groundGeometry = new THREE.PlaneGeometry(180, 180, quality === "high" ? 144 : 80, quality === "high" ? 144 : 80);
  groundGeometry.rotateX(-Math.PI / 2);
  const positions = groundGeometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const base = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const h = terrainHeight(x, z, seed);
    positions.setY(i, h - 0.09);
    const variation = valueNoise(x * 0.17, z * 0.17, seed + 417);
    const patch = Math.sin(x * 0.34 + z * 0.49) * 0.04;
    base.setRGB(0.19 + variation * 0.10 + patch, 0.29 + variation * 0.14 + patch, 0.21 + variation * 0.085);
    colors[i * 3] = base.r;
    colors[i * 3 + 1] = base.g;
    colors[i * 3 + 2] = base.b;
  }
  groundGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  groundGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 }));
  ground.receiveShadow = true;
  root.add(ground);

  // Old stone rings define a safe center with generous camera sight lines.
  const sandstone = new THREE.MeshStandardMaterial({ color: 0x988970, roughness: 0.95 });
  const stoneLight = new THREE.MeshStandardMaterial({ color: 0xc0ae8c, roughness: 0.9 });
  const moss = new THREE.MeshStandardMaterial({ color: 0x576f4d, roughness: 1 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(11.3, 11.7, 0.16, 64), sandstone);
  plinth.position.y = -0.04;
  plinth.receiveShadow = true;
  root.add(plinth);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10.8, 0.11, 6, 80), stoneLight);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.07;
  root.add(ring);
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.055, 5, 70), moss);
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.055;
  root.add(innerRing);

  const ruins = [
    [-13.8, -9.8, false], [13.5, -10, false],
    [-15.6, 4.8, true], [14.2, 7.0, true],
    [-8.3, -18, true], [8.7, -19, false],
  ] as const;
  for (const [x, z, broken] of ruins) addColumn(root, x, z, seed, sandstone, stoneLight, broken);

  const treeCount = quality === "high" ? 160 : 72;
  const trunkGeometry = new THREE.CylinderGeometry(0.17, 0.37, 1, 7);
  const foliageGeometry = new THREE.IcosahedronGeometry(1, quality === "high" ? 1 : 0);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x544435, roughness: 1 });
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96 });
  const trunk = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCount);
  const crownLow = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, treeCount);
  const crownHigh = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, treeCount);
  const matrix = new THREE.Object3D();
  const canopyColor = new THREE.Color();
  for (let i = 0; i < treeCount; i++) {
    const angle = random.range(-Math.PI, Math.PI);
    const radius = Math.sqrt(random.range(0.085, 1)) * 78;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // Keep the near-player and primary camera corridors free of foliage.
    const y = terrainHeight(x, z, seed);
    const height = random.range(4.6, 9);
    const spread = random.range(1.4, 2.7);
    matrix.position.set(x, y + height * 0.31, z);
    matrix.rotation.set(0, angle, 0);
    matrix.scale.set(0.8 + spread * 0.25, height * 0.62, 0.8 + spread * 0.25);
    matrix.updateMatrix();
    trunk.setMatrixAt(i, matrix.matrix);
    matrix.position.set(x, y + height * 0.72, z);
    matrix.scale.set(spread, height * 0.30, spread);
    matrix.updateMatrix();
    crownLow.setMatrixAt(i, matrix.matrix);
    matrix.position.set(x + 0.25, y + height * 0.91, z - 0.12);
    matrix.scale.set(spread * 0.76, height * 0.26, spread * 0.74);
    matrix.updateMatrix();
    crownHigh.setMatrixAt(i, matrix.matrix);
    canopyColor.setHSL(random.range(0.27, 0.36), random.range(0.25, 0.47), random.range(0.22, 0.38));
    crownLow.setColorAt(i, canopyColor);
    canopyColor.offsetHSL(0.005, 0, 0.075);
    crownHigh.setColorAt(i, canopyColor);
  }
  trunk.instanceMatrix.needsUpdate = true;
  crownLow.instanceMatrix.needsUpdate = true;
  crownHigh.instanceMatrix.needsUpdate = true;
  if (crownLow.instanceColor) crownLow.instanceColor.needsUpdate = true;
  if (crownHigh.instanceColor) crownHigh.instanceColor.needsUpdate = true;
  trunk.computeBoundingSphere();
  crownLow.computeBoundingSphere();
  crownHigh.computeBoundingSphere();
  root.add(trunk, crownLow, crownHigh);

  const rockCount = quality === "high" ? 105 : 48;
  const rock = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x7b7d70, roughness: 1 }),
    rockCount,
  );
  for (let i = 0; i < rockCount; i++) {
    const a = random.range(0, Math.PI * 2);
    const r = Math.sqrt(random.range(0.018, 1)) * 75;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const scale = random.range(0.3, 1.6);
    matrix.position.set(x, terrainHeight(x, z, seed) + scale * 0.14, z);
    matrix.rotation.set(random.range(0, 0.2), a, random.range(-0.3, 0.3));
    matrix.scale.set(scale, scale * random.range(0.35, 0.75), scale * 0.8);
    matrix.updateMatrix();
    rock.setMatrixAt(i, matrix.matrix);
  }
  rock.instanceMatrix.needsUpdate = true;
  rock.computeBoundingSphere();
  root.add(rock);

  const grassCount = quality === "high" ? 240 : 86;
  const shrub = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.55, 1.5, 5),
    new THREE.MeshStandardMaterial({ color: 0x4d7651, roughness: 1, side: THREE.DoubleSide }),
    grassCount,
  );
  for (let i = 0; i < grassCount; i++) {
    const a = random.range(0, Math.PI * 2);
    const r = Math.sqrt(random.range(0.12, 1)) * 64;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const scale = random.range(0.4, 1.2);
    matrix.position.set(x, terrainHeight(x, z, seed) + 0.6 * scale, z);
    matrix.rotation.set(0, a, 0);
    matrix.scale.set(scale, scale, scale);
    matrix.updateMatrix();
    shrub.setMatrixAt(i, matrix.matrix);
  }
  shrub.instanceMatrix.needsUpdate = true;
  shrub.computeBoundingSphere();
  root.add(shrub);

  // Distant mountains are inexpensive silhouettes, softened by scene fog.
  const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x566f67, roughness: 1, flatShading: true });
  for (let i = 0; i < 19; i++) {
    const angle = (i / 19) * Math.PI * 2;
    const radius = 89 + random.range(-5, 7);
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(random.range(10, 22), random.range(24, 43), 5), mountainMaterial);
    mountain.position.set(Math.cos(angle) * radius, -2, Math.sin(angle) * radius);
    mountain.rotation.y = angle;
    root.add(mountain);
  }

  return {
    root,
    dispose() {
      const geometry = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometry.add(object.geometry);
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        entries.forEach((material) => materials.add(material));
      });
      geometry.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      root.removeFromParent();
    },
  };
}
