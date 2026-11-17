import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {StudioArcheryWorkerClient,type BowWorkerPort}
  from "../apps/web/src/studio/StudioArcheryWorkerClient";
import {encodeBowWorkerResult,type BowWorkerInit,type BowWorkerRequest,
  type BowWorkerResponse,type BowResultWire,decodeBowWorkerResult}
  from "../apps/web/src/studio/StudioArcheryWorkerProtocol";
import type {ArcheryPoseResult} from "../apps/web/src/studio/StudioArchery";
import {defaultStudioMorphState} from "../apps/web/src/studio/StudioMorphCatalog";

class FakePort implements BowWorkerPort{
  readonly posted:BowWorkerRequest[]=[];
  terminated=false;
  onmessage:BowWorkerPort["onmessage"]=null;
  onerror:BowWorkerPort["onerror"]=null;
  postMessage(data:BowWorkerRequest):void{this.posted.push(data);}
  terminate():void{this.terminated=true;}
  emit(message:BowWorkerResponse):void{
    this.onmessage?.({data:message} as MessageEvent<BowWorkerResponse>);
  }
}
const root=new THREE.Matrix4().toArray();
const config:BowWorkerInit={type:"init",morphology:defaultStudioMorphState(),
  expression:"neutral",pose:"neutral",equipment:"bow-left"};
const example=():ArcheryPoseResult=>({
  reachable:true,reason:"ok",hand:"left",state:"partial",
  commands:[],iterations:2,solverAttempts:1,bowHandErrorMeters:0,
  bowSkinContact:[],drawHandErrorMeters:0,bodyClearanceMeters:1,
  drawMeters:0,actualDrawFraction:0,bowWorld:new THREE.Matrix4(),
  nockWorld:new THREE.Vector3(),drawContactWorld:new THREE.Vector3(),
  arrowDirectionWorld:new THREE.Vector3(0,0,1),
  arrowAimDeviationRadians:0,descriptor:{
    schemaVersion:1,id:"bow/left",kind:"bow",hand:"left",socketId:"socket",
    limbLengthMeters:.64,handleRadiusMeters:.01,handleLengthMeters:.1,
    arrowLengthMeters:.7,stringRestMeters:.07,maximumDrawMeters:.28,
    arrowRest:{schemaVersion:1,kind:"hand-supported",
      support:"index-knuckle",shaftRadiusMeters:.0035,
      supportGapMeters:.005,lateralOffsetMeters:.015},
  },
  arrowShaftClearance:[{region:"index",vertices:4,
    nearestSurfaceClearanceMeters:.005,closestPointLocal:new THREE.Vector3(1,2,3)}],
});
describe("C5.5 latest-only bow worker ownership",()=>{
  it("coalesces busy input, rejects stale results and terminates on disposal",()=>{
    const port=new FakePort(),accepted:number[]=[],errors:string[]=[];
    const client=new StudioArcheryWorkerClient(config,
      (id)=>accepted.push(id),message=>errors.push(message),()=>port);
    expect(port.posted).toEqual([config]);
    expect(client.request(0,root)).toBe(1);
    expect(client.request(.25,root)).toBe(2);
    expect(port.posted).toHaveLength(1);
    port.emit({type:"ready"});
    expect(port.posted).toHaveLength(2);
    expect(port.posted[1]).toEqual({type:"solve",id:2,draw:.25,rootWorld:root});
    client.request(.5,root);
    client.request(.75,root);
    expect(port.posted).toHaveLength(2);
    const wire=encodeBowWorkerResult(example());
    port.emit({type:"solved",id:2,draw:.25,rootWorld:root,result:wire});
    expect(accepted).toEqual([]);
    expect(port.posted[2]).toEqual({type:"solve",id:4,draw:.75,rootWorld:root});
    port.emit({type:"solved",id:4,draw:.75,rootWorld:root,result:wire});
    expect(accepted).toEqual([4]);
    expect(errors).toEqual([]);
    client.dispose();
    expect(port.terminated).toBe(true);
    port.emit({type:"solved",id:4,draw:.75,rootWorld:root,result:wire});
    expect(accepted).toEqual([4]);
    expect(()=>client.request(.9,root)).toThrow("closed");
  });
  it("discards wrong root ownership and recovers after a current error",()=>{
    const port=new FakePort(),accepted:number[]=[],errors:string[]=[];
    const client=new StudioArcheryWorkerClient(config,
      id=>accepted.push(id),message=>errors.push(message),()=>port);
    port.emit({type:"ready"});
    const id=client.request(.1,root);
    const moved=[...root];moved[12]=1;
    port.emit({type:"solved",id,draw:.1,rootWorld:moved,
      result:encodeBowWorkerResult(example())});
    expect(accepted).toEqual([]);
    const second=client.request(.2,root);
    port.emit({type:"error",id:second,message:"source-contact failure"});
    expect(errors).toEqual(["source-contact failure"]);
    client.dispose();
  });
  it("rehydrates true Three.js math and rejects malformed vertex vectors",()=>{
    const result=decodeBowWorkerResult(encodeBowWorkerResult(example()));
    expect(result.bowWorld).toBeInstanceOf(THREE.Matrix4);
    expect(result.nockWorld).toBeInstanceOf(THREE.Vector3);
    expect(result.arrowShaftClearance?.[0]?.closestPointLocal)
      .toBeInstanceOf(THREE.Vector3);
    const malformed={...encodeBowWorkerResult(example()),
      bowWorld:[1,2,3]} as BowResultWire;
    expect(()=>decodeBowWorkerResult(malformed)).toThrow("bow frame");
  });
});
