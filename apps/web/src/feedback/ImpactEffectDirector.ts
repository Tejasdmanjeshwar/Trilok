import * as THREE from "three";
import type { DamageBreakdown } from "@trilok/combat";

/** An emitted contact is immutable. The same contact drives all presentation. */
export interface ImpactVisualContext {
  readonly projectileId: string | null;
  readonly point: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly regionId: string | null;
  readonly attachment: THREE.Object3D | null;
  readonly tick: number;
  readonly presentAtMs: number;
  /** Optional authoritative impact facts for lifecycle-aware renderers. */
  readonly breakdown?: DamageBreakdown;
  readonly turn?: number;
}
export type ImpactEffectHandler = (context:ImpactVisualContext)=>void;
/** OCP registry: a new effect only registers another handler. */
export class ImpactEffectDirector {
  private readonly handlers=new Map<string,ImpactEffectHandler>();
  private readonly consumed=new Set<string>();
  private readonly history:string[]=[];
  constructor(private readonly maxHistory=256){}
  register(id:string,handler:ImpactEffectHandler):this{
    if(!id||this.handlers.has(id))throw new Error("Duplicate or invalid impact handler.");
    this.handlers.set(id,handler);
    return this;
  }
  dispatch(eventId:string,ids:readonly string[],context:ImpactVisualContext):boolean{
    if(!eventId||this.consumed.has(eventId))return false;
    this.consumed.add(eventId);
    this.history.push(eventId);
    if(this.history.length>this.maxHistory){
      this.consumed.delete(this.history.shift()!);
    }
    for(const id of ids)this.handlers.get(id)?.(context);
    return true;
  }
  clear():void{this.consumed.clear();this.history.length=0;}
}
