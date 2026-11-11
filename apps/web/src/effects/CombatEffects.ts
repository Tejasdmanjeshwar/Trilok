import * as THREE from "three";
import {createArrowVisual,ARROW_TIP_OFFSET} from "./ArrowVisual";

/** Reusable arrow, slash and impact geometry: no allocations during attack updates. */
export class CombatEffects {
  private readonly group = new THREE.Group();
  private readonly arrow = new THREE.Group();
  private readonly trail: THREE.Line;
  private readonly ring: THREE.Mesh;
  private readonly slash: THREE.Mesh;
  private readonly slashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe2a0, transparent: true, opacity: .82,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  private readonly ringMaterial = new THREE.MeshBasicMaterial({ color: 0xf8d194, transparent: true, opacity: .8, depthWrite: false });
  private readonly start = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0,1,0);
  private readonly direction = new THREE.Vector3();
  private flightAt = -1;
  private flightDuration = 1;
  private burstAt = -1;
  private slashAt = -1;

  constructor(scene: THREE.Scene) {
    this.arrow.add(createArrowVisual());
    this.arrow.visible = false;
    this.group.add(this.arrow);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(13*3),3));
    this.trail = new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xfbe0a6,transparent:true,opacity:.48,depthWrite:false}));
    this.trail.visible = false;
    this.group.add(this.trail);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(.35,.04,6,28),this.ringMaterial);
    this.ring.visible = false;
    this.group.add(this.ring);

    // A single curved weapon streak reused for each melee swing.
    const path = new THREE.CatmullRomCurve3(Array.from({length: 8}, (_, i) => {
      const a = -0.85 + (i / 7) * 2.7;
      return new THREE.Vector3(Math.cos(a) * 1.2, 1.65 + Math.sin(a) * 1.1, 1.25);
    }));
    this.slash = new THREE.Mesh(new THREE.TubeGeometry(path, 26, .045, 5, false), this.slashMaterial);
    this.slash.visible = false;
    this.slash.renderOrder = 2;
    this.group.add(this.slash);
    scene.add(this.group);
  }

  launch(from:THREE.Vector3,to:THREE.Vector3,time:number,duration:number):void {
    this.start.copy(from);
    this.end.copy(to);
    this.flightAt = time;
    this.flightDuration = duration;
    this.arrow.visible = this.trail.visible = true;
  }
  impact(at:THREE.Vector3,time:number):void {
    this.arrow.visible = this.trail.visible = false;
    this.flightAt = -1;
    this.burstAt = time;
    this.ring.position.copy(at);
    this.ring.visible = true;
  }
  swing(origin: THREE.Vector3, facingRadians: number, time: number): void {
    this.slash.position.copy(origin);
    this.slash.rotation.y = facingRadians;
    this.slash.visible = true;
    this.slashAt = time;
  }
  clear():void {
    this.flightAt = this.burstAt = this.slashAt = -1;
    this.arrow.visible = this.trail.visible = this.ring.visible = this.slash.visible = false;
  }
  private interpolate(t:number):void {
    this.point.copy(this.start).lerp(this.end,t);
    this.point.y += Math.sin(t*Math.PI)*.6;
    this.point.addScaledVector(this.direction,-ARROW_TIP_OFFSET);
  }
  update(now:number):void {
    if(this.flightAt >= 0) {
      const t=Math.min(1,Math.max(0,(now-this.flightAt)/this.flightDuration));
      this.direction.copy(this.end).sub(this.start).normalize();
      this.interpolate(t);
      this.arrow.position.copy(this.point);
      this.arrow.quaternion.setFromUnitVectors(this.up,this.direction);
      const positions=this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
      for(let i=0;i<13;i++){
        this.interpolate(Math.max(0,t-(12-i)*.014));
        positions.setXYZ(i,this.point.x,this.point.y,this.point.z);
      }
      positions.needsUpdate=true;
      if(t>=1){this.flightAt=-1;this.arrow.visible=this.trail.visible=false;}
    }
    if(this.slashAt>=0){
      const t=Math.min(1,Math.max(0,(now-this.slashAt)/380));
      this.slash.visible=t<1;
      this.slashMaterial.opacity=.82*Math.pow(1-t,2);
      if(t>=1)this.slashAt=-1;
    }
    if(this.burstAt>=0){
      const t=Math.min(1,(now-this.burstAt)/480);
      this.ring.visible=t<1;
      this.ring.scale.setScalar(.4+t*3.1);
      this.ringMaterial.opacity=Math.max(0,.8*(1-t));
      if(t>=1)this.burstAt=-1;
    }
  }
  dispose():void {
    this.group.traverse(o=>{
      if(!(o instanceof THREE.Mesh || o instanceof THREE.Line)) return;
      o.geometry.dispose();
      const materials=Array.isArray(o.material)?o.material:[o.material];
      for(const material of materials)material.dispose();
    });
    this.group.removeFromParent();
  }
}
