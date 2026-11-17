import {decodeBowWorkerResult,type BowWorkerInit,
  type BowWorkerRequest,type BowWorkerResponse} from "./StudioArcheryWorkerProtocol";
import type {ArcheryPoseResult} from "./StudioArchery";

export interface BowWorkerPort {
  postMessage(message:BowWorkerRequest):void;
  terminate():void;
  onmessage:((event:MessageEvent<BowWorkerResponse>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
}
type Pending=Readonly<{id:number;draw:number;rootWorld:readonly number[]}>;
export class StudioArcheryWorkerClient {
  private readonly worker:BowWorkerPort;
  private ready=false;
  private busy=false;
  private closed=false;
  private nextId=0;
  private latest?:Pending;
  private inFlight?:Pending;
  constructor(config:BowWorkerInit,
    private readonly onResult:(id:number,draw:number,rootWorld:readonly number[],
      value:ArcheryPoseResult)=>void,
    private readonly onError:(message:string)=>void,
    factory:()=>BowWorkerPort=()=>new Worker(
      new URL("./StudioArcherySolver.worker.ts",import.meta.url),
      {type:"module"})){
    this.worker=factory();
    this.worker.onmessage=event=>this.receive(event.data);
    this.worker.onerror=event=>{
      if(this.closed)return;
      this.onError(event.message||"The background IK solver stopped");
      this.dispose();
    };
    this.worker.postMessage(config);
  }
  request(draw:number,rootWorld:readonly number[]):number{
    if(this.closed)throw new Error("Background IK solver has closed");
    if(!Number.isFinite(draw)||draw<0||draw>1||
      rootWorld.length!==16||!rootWorld.every(Number.isFinite))
      throw new Error("Invalid background bow input");
    this.latest={id:++this.nextId,draw,rootWorld:[...rootWorld]};
    this.flush();
    return this.nextId;
  }
  private flush():void{
    if(this.closed||!this.ready||this.busy||!this.latest||
      this.inFlight?.id===this.latest.id)return;
    this.inFlight=this.latest;
    this.busy=true;
    this.worker.postMessage({type:"solve",...this.inFlight});
  }
  private receive(message:BowWorkerResponse):void{
    if(this.closed)return;
    if(message.type==="ready"){this.ready=true;this.flush();return;}
    if(message.type==="error"){
      if(message.id===0){
        this.onError(message.message);
        this.dispose();return;
      }
      if(this.inFlight?.id!==message.id)return;
      this.busy=false;
      if(this.latest?.id===message.id)this.onError(message.message);
      this.flush();
      return;
    }
    if(!this.inFlight||message.id!==this.inFlight.id)return;
    const current=this.inFlight;
    this.busy=false;
    if(this.latest?.id===message.id&&message.draw===current.draw&&
      message.rootWorld.length===16&&
      message.rootWorld.every((v,i)=>v===current.rootWorld[i])){
      try{this.onResult(message.id,message.draw,current.rootWorld,
        decodeBowWorkerResult(message.result));}
      catch(error){this.onError(String(error));}
    }
    this.flush();
  }
  dispose():void{
    if(this.closed)return;
    this.closed=true;
    this.latest=undefined;
    this.inFlight=undefined;
    this.worker.onmessage=null;
    this.worker.onerror=null;
    this.worker.terminate();
  }
}
