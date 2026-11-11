import * as THREE from "three";
import {
  aimBallisticAt, sampleTrajectory, type ProjectileTrajectory,
  type ProjectileClashVerdict, type Vector3,
} from "@trilok/combat";
const plain=(v:THREE.Vector3):Vector3=>({x:v.x,y:v.y,z:v.z});

interface Flight {
  id: string | null;
  readonly root: THREE.Group;
  readonly trail: THREE.Line;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  readonly point: THREE.Vector3;
  readonly direction: THREE.Vector3;
  start: number;
  duration: number;
  flying: boolean;
  trajectory: ProjectileTrajectory | null;
}
function createFlight(color: number): Flight {
  const material=new THREE.MeshStandardMaterial({
    color, emissive:color, emissiveIntensity:.25, roughness:.42, metalness:.28,
  });
  const root=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.023,.023,1.05,6),material);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.074,.20,6),material);
  tip.position.y=.6;
  root.add(shaft,tip);
  root.visible=false;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.BufferAttribute(new Float32Array(9*3),3));
  const trail=new THREE.Line(geo,new THREE.LineBasicMaterial({
    color,transparent:true,opacity:.54,depthWrite:false,
  }));
  trail.visible=false;
  return {
    id:null,root,trail,from:new THREE.Vector3(),to:new THREE.Vector3(),
    point:new THREE.Vector3(),direction:new THREE.Vector3(),
    start:0,duration:1,flying:false,trajectory:null,
  };
}
/**
 * Two stable, pooled visual projectile identities. A surviving arrow
 * redirects the SAME mesh, instead of being respawned as an extra attack.
 * Pure domain chooses the outcome; Three.js only renders it.
 */
export class ProjectileClashEffects {
  private readonly group=new THREE.Group();
  private readonly flights: readonly Flight[]=[
    createFlight(0xf2dcae),createFlight(0x9de3d7),
  ];
  private readonly up=new THREE.Vector3(0,1,0);
  private readonly ringMaterial=new THREE.MeshBasicMaterial({
    color:0xffedbf,transparent:true,opacity:0,depthWrite:false,
    blending:THREE.AdditiveBlending,
  });
  private readonly ring=new THREE.Mesh(new THREE.TorusGeometry(.27,.055,7,20),this.ringMaterial);
  private readonly shards: THREE.Mesh[]=[];
  private burstAt=-1;
  private readonly burstPoint=new THREE.Vector3();
  private readonly temp=new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    for(const f of this.flights)this.group.add(f.root,f.trail);
    this.ring.visible=false;
    this.group.add(this.ring);
    const material=new THREE.MeshBasicMaterial({
      color:0xf6dc9b,transparent:true,opacity:.94,depthWrite:false,
      blending:THREE.AdditiveBlending,
    });
    const geometry=new THREE.TetrahedronGeometry(.09,0);
    for(let i=0;i<8;i++){
      const shard=new THREE.Mesh(geometry,material);
      shard.visible=false;
      this.group.add(shard);
      this.shards.push(shard);
    }
    scene.add(this.group);
  }
  private find(id:string):Flight | undefined{return this.flights.find(f=>f.id===id);}
  private acquire(id:string):Flight{
    const existing=this.find(id);
    if(existing)return existing;
    const free=this.flights.find(f=>f.id===null || !f.flying);
    if(!free)throw new Error("Only two concurrent clash projectiles are supported.");
    free.id=id;return free;
  }
  launch(id:string,from:THREE.Vector3,to:THREE.Vector3,start:number,duration:number):void{
    if(!id || !Number.isFinite(duration) || duration<=0)throw new Error("Invalid projectile flight.");
    const f=this.acquire(id);
    f.from.copy(from); f.to.copy(to);
    f.start=start; f.duration=duration; f.flying=true;
    f.trajectory=null;
    f.root.visible=f.trail.visible=true;
    this.place(f,start);
  }
  /** Renderer consumes the same mathematical trajectory as the combat domain. */
  launchTrajectory(id:string,path:ProjectileTrajectory,now:number):void {
    const f=this.acquire(id);
    f.trajectory=path;
    f.start=path.kind==="ballistic"?path.startTick:path.segments[0]!.startTick;
    f.duration=1;
    f.flying=true;
    f.root.visible=f.trail.visible=true;
    this.place(f,now);
  }

  /**
   * Redirect a previously launched projectile from its current position.
   * This operation retains the same ID and mesh instance.
   */
  continue(id:string,to:THREE.Vector3,at:number,duration:number):void{
    const f=this.find(id);
    if(!f || !f.flying)throw new Error("Cannot continue missing projectile: "+id);
    this.place(f,at);
    this.temp.copy(f.root.position);
    this.launch(id,this.temp,to,at,duration);
  }
  position(id:string,at:number,target=new THREE.Vector3()):THREE.Vector3{
    const f=this.find(id);
    if(!f || !f.flying)throw new Error("No in-flight projectile: "+id);
    const t=Math.min(1,Math.max(0,(at-f.start)/f.duration));
    if(f.trajectory){
      const position=sampleTrajectory(f.trajectory,at).position;
      return target.set(position.x,position.y,position.z);
    }
    return target.copy(f.from).lerp(f.to,t);
  }
  stop(id:string):void{
    const f=this.find(id);
    if(!f)return;
    f.flying=false;f.id=null;f.trajectory=null;
    f.root.visible=f.trail.visible=false;
  }
  clash(
    incomingId:string,interceptorId:string,
    verdict:ProjectileClashVerdict,point:THREE.Vector3,at:number,
  ):void{
    // The stronger arrow survives the collision as the exact same visual.
    if(verdict!=="incoming_survives")this.stop(incomingId);
    if(verdict!=="interceptor_survives")this.stop(interceptorId);
    this.burstPoint.copy(point);this.burstAt=at;
    this.ring.position.copy(point);this.ring.scale.setScalar(.3);
    this.ring.visible=true;
    this.ring.lookAt(point.x,point.y,point.z+1);
    this.ringMaterial.opacity=1;
    for(let i=0;i<this.shards.length;i++){
      const shard=this.shards[i]!;
      shard.visible=true;
      shard.position.copy(point);
      shard.rotation.set(i*.35,i*.7,0);
    }
  }
  clear():void{
    for(const f of this.flights){
      f.id=null;f.flying=false;f.trajectory=null;
      f.root.visible=f.trail.visible=false;
    }
    this.burstAt=-1;this.ring.visible=false;
    for(const shard of this.shards)shard.visible=false;
  }
  private place(f:Flight,now:number):void{
    if(f.trajectory){
      const sample=sampleTrajectory(f.trajectory,now);
      f.root.position.set(sample.position.x,sample.position.y,sample.position.z);
      f.direction.set(sample.velocity.x,sample.velocity.y,sample.velocity.z).normalize();
    }else{
      const t=Math.min(1,Math.max(0,(now-f.start)/f.duration));
      f.root.position.copy(f.from).lerp(f.to,t);
      f.direction.copy(f.to).sub(f.from).normalize();
    }
    f.root.quaternion.setFromUnitVectors(this.up,f.direction);
  }
  update(now:number):void{
    for(const f of this.flights){
      if(!f.flying)continue;
      this.place(f,now);
      const t=Math.min(1,Math.max(0,(now-f.start)/f.duration));
      const positions=f.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
      for(let i=0;i<9;i++){
        const t0=Math.max(0,t-(8-i)*.015);
        if(f.trajectory){
          const pos=sampleTrajectory(f.trajectory,Math.max(f.start,now-(8-i)*14)).position;
          f.point.set(pos.x,pos.y,pos.z);
        }else{
          f.point.copy(f.from).lerp(f.to,t0);
        }
        positions.setXYZ(i,f.point.x,f.point.y,f.point.z);
      }
      positions.needsUpdate=true;
      // Stop only once the impact resolver has consumed the flight. At t=1
      // the arrow stays at its destination for slow frames/reaction grace.
    }
    if(this.burstAt<0)return;
    const t=Math.min(1,(now-this.burstAt)/430);
    this.ring.visible=t<1;
    this.ring.scale.setScalar(.3+t*3.7);
    this.ringMaterial.opacity=(1-t)*.9;
    for(let i=0;i<this.shards.length;i++){
      const shard=this.shards[i]!;
      shard.visible=t<1;
      const angle=i*Math.PI*2/this.shards.length;
      const radius=t*1.4;
      shard.position.set(this.burstPoint.x+Math.cos(angle)*radius,
        this.burstPoint.y+Math.sin(angle*1.5)*radius,
        this.burstPoint.z+Math.sin(angle)*radius);
      shard.scale.setScalar(Math.max(.08,1-t));
    }
    if(t>=1)this.burstAt=-1;
  }
  dispose():void{
    for(const f of this.flights){
      f.root.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      });
      f.trail.geometry.dispose();
      (f.trail.material as THREE.Material).dispose();
    }
    this.ring.geometry.dispose();
    this.ringMaterial.dispose();
    if(this.shards.length){
      this.shards[0]!.geometry.dispose();
      (this.shards[0]!.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }
}
