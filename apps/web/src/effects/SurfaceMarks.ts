import * as THREE from "three";

/** Future burn/frost decals use profiles, not specialized wound renderers. */
export interface SurfaceMarkStyle {
  readonly innerColor: number;
  readonly rimColor: number;
  readonly radius: number;
  readonly opacity?: number;
}
export interface SurfaceMarkContact {
  readonly point: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly anchor: THREE.Object3D;
}
const DEFAULT_STYLES: Readonly<Record<string,SurfaceMarkStyle>>={
  wound: {innerColor:0x561f29,rimColor:0x9b3543,radius:.12,opacity:.95},
  scorch: {innerColor:0x292528,rimColor:0x63433c,radius:.18},
  frost: {innerColor:0x9cdae1,rimColor:0x4b9cb2,radius:.17,opacity:.8},
};
/**
 * Lightweight anatomical surface marks, parented to the actual contact bone.
 * Rendering alone: no implicit bleeding, burning or freezing gameplay effects.
 */
export class SurfaceMarks {
  private readonly marks: THREE.Group[]=[];
  private readonly styles=new Map(Object.entries(DEFAULT_STYLES));
  private readonly disc=new THREE.CircleGeometry(1,18);
  private readonly front=new THREE.Vector3(0,0,1);
  constructor(private readonly maxMarks=12){}
  register(id:string,style:SurfaceMarkStyle):this {
    if(!id||this.styles.has(id)||!Number.isFinite(style.radius)||style.radius<=0)
      throw new Error("Invalid or duplicate surface mark style.");
    this.styles.set(id,style);
    return this;
  }
  add(id:string,contact:SurfaceMarkContact):THREE.Group {
    const style=this.styles.get(id);
    if(!style)throw new Error("Unknown surface mark style: "+id);
    const anchor=contact.anchor;
    const normal=contact.normal.clone().normalize();
    if(normal.lengthSq()<.1) throw new Error("Invalid wound surface normal.");
    const root=new THREE.Group();
    root.name="SurfaceMark_"+id;
    const layers=[
      {scale:1,color:style.rimColor,opacity:(style.opacity??1)*.8,offset:.008},
      {scale:.63,color:style.innerColor,opacity:style.opacity??1,offset:.011},
      {scale:.30,color:style.innerColor,opacity:(style.opacity??1)*.7,offset:.014},
    ];
    for(const layer of layers){
      const material=new THREE.MeshBasicMaterial({
        color:layer.color,transparent:true,opacity:layer.opacity,
        side:THREE.DoubleSide,depthWrite:false,
        polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
      });
      const mesh=new THREE.Mesh(this.disc,material);
      mesh.scale.set(style.radius*layer.scale,style.radius*layer.scale,1);
      mesh.position.z=layer.offset;
      mesh.renderOrder=3;
      root.add(mesh);
    }
    root.position.copy(contact.point).addScaledVector(normal,.011);
    root.quaternion.setFromUnitVectors(this.front,normal);
    // Preserve the world contact location and facing before parenting to bone.
    anchor.updateWorldMatrix(true,false);
    anchor.attach(root);
    this.marks.push(root);
    if(this.marks.length>this.maxMarks)this.remove(this.marks.shift()!);
    return root;
  }
  get count():number{return this.marks.length;}
  private remove(group:THREE.Group):void{
    group.traverse(object=>{
      if(object instanceof THREE.Mesh){
        (object.material as THREE.Material).dispose();
      }
    });
    group.removeFromParent();
  }
  clear():void {
    for(const group of this.marks)this.remove(group);
    this.marks.length=0;
  }
  dispose():void {
    this.clear();
    this.disc.dispose();
  }
}
