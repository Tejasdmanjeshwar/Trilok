import {loadBodyAtlas,type BodyAtlas} from "./MakeHumanBodyTargets";

/** Versioned one-shot worker. Owns decoded JSON until its buffers are
 * transferred; no renderer, active character or global simulation state. */
type PrepareRequest=Readonly<{version:1;type:"prepare"}>;
type AtlasWire=Readonly<{version:1;type:"prepared";atlas:BodyAtlas}>;
type ErrorWire=Readonly<{version:1;type:"error";message:string}>;
self.onmessage=(event:MessageEvent<PrepareRequest>):void=>{
  const data=event.data;
  if(data?.version!==1||data.type!=="prepare"){
    self.postMessage({version:1,type:"error",message:"Invalid atlas request"} satisfies ErrorWire);
    return;
  }
  void (async()=>{
    try{
      // Calling the shared loader INSIDE the worker uses the original pinned
      // byte/hash/JSON validation with no independent implementation.
      const atlas=await loadBodyAtlas();
      const transfers:ArrayBuffer[]=[];
      const targets=atlas.payload.targets.map(t=>{
        const rows=Float64Array.from(t.rows);
        transfers.push(rows.buffer as ArrayBuffer);
        return {id:t.id,rows};
      });
      const payload:BodyAtlas={...atlas,
        payload:{...atlas.payload,targets}};
      const response:AtlasWire={version:1,type:"prepared",atlas:payload};
      self.postMessage(response,transfers);
    }catch(error){
      self.postMessage({version:1,type:"error",
        message:error instanceof Error?error.message:String(error)} satisfies ErrorWire);
    }
  })();
};
