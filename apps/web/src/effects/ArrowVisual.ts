import * as THREE from "three";

/** Stylized medieval arrow, pointing along local +Y. Shared by both flight renderers. */
export const ARROW_TIP_OFFSET = .70;
export interface ArrowPalette {
  readonly shaft?: number;
  readonly head?: number;
  readonly feathers?: number;
}
export function createArrowVisual(palette:ArrowPalette={}):THREE.Group {
  const arrow=new THREE.Group();
  arrow.name="MedievalArrow";
  const shaftMaterial=new THREE.MeshStandardMaterial({
    color:palette.shaft??0x8d6741,roughness:.84,
  });
  const headMaterial=new THREE.MeshStandardMaterial({
    color:palette.head??0xcbd0c8,metalness:.72,roughness:.3,
  });
  const featherMaterial=new THREE.MeshStandardMaterial({
    color:palette.feathers??0xd9e5cf,roughness:.9,side:THREE.DoubleSide,
  });
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.027,.031,1.05,7),shaftMaterial);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.085,.20,6),headMaterial);
  tip.position.y=.60;
  const nock=new THREE.Mesh(new THREE.CylinderGeometry(.044,.044,.085,6),headMaterial);
  nock.position.y=-.51;
  arrow.add(shaft,tip,nock);
  // Three feather vanes: distinct silhouette even when seen from above.
  // Keep quads translucent-free for stable mobile rendering.
  const featherShape=new THREE.Shape();
  featherShape.moveTo(.027,-.51);
  featherShape.lineTo(.17,-.48);
  featherShape.lineTo(.20,-.40);
  featherShape.lineTo(.125,-.29);
  featherShape.lineTo(.032,-.33);
  featherShape.closePath();
  const geometry=new THREE.ShapeGeometry(featherShape);
  for(let i=0;i<3;i++){
    const vane=new THREE.Mesh(geometry.clone(),featherMaterial.clone());
    vane.rotation.y=i*Math.PI*2/3;
    vane.name="Fletching_"+i;
    arrow.add(vane);
  }
  return arrow;
}
