// Bounded transient retry for immutable upstream MakeHuman source files.
// Callers must verify size, pinned Git blob hash and license before persistence.
const RETRYABLE_HTTP=new Set([408,425,429,500,502,503,504]);
const RETRY_DELAYS_MS=[500,1500,3500,5000];

/** Transport only. Never weaken pinned content-verification invariants. */
export async function fetchPinnedSourceBytes(url,{
  timeoutMs=60_000,retryDelaysMs=RETRY_DELAYS_MS,
}={}){
  let lastError;
  for(let attempt=0;attempt<=retryDelaysMs.length;attempt++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(timeoutMs)});
      if(!response.ok){
        if(!RETRYABLE_HTTP.has(response.status))
          throw new PermanentPinnedSourceError(response.status,url);
        throw new Error("Transient pinned-source HTTP "+response.status);
      }
      return Buffer.from(await response.arrayBuffer());
    }catch(error){
      if(error instanceof PermanentPinnedSourceError)throw error;
      lastError=error;
      if(attempt===retryDelaysMs.length)break;
      const reason=error instanceof Error?error.message:String(error);
      console.warn("Pinned-source transport retry "+(attempt+1)+"/"+
        retryDelaysMs.length+" for "+url+": "+reason);
      await new Promise(resolve=>setTimeout(resolve,retryDelaysMs[attempt]));
    }
  }
  throw new Error("Pinned-source download exhausted "+(retryDelaysMs.length+1)+
    " attempts: "+url,{cause:lastError});
}
class PermanentPinnedSourceError extends Error{
  constructor(status,url){
    super("Pinned-source HTTP "+status+" (non-retryable): "+url);
  }
}
