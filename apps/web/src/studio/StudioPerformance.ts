/** Bounded, opt-in Studio performance evidence. Intervals measure main-thread
 * render submission cadence, not GPU execution time. Never mix in hidden tabs. */
export type StudioIntervalStats=Readonly<{
  samples:number;
  medianMs:number|null;
  p95Ms:number|null;
}>;
export interface StudioGenerationMeasurement {
  readonly elapsedMs:number;
  readonly stages:Readonly<Record<string,number>>;
}
export interface StudioPerformanceSnapshot {
  readonly initialLoadMs:number|null;
  readonly edits:StudioIntervalStats;
  /** Most recent three generation attempts, bounded for diagnostics. */
  readonly generations:readonly StudioGenerationMeasurement[];
  readonly frames:StudioIntervalStats;
  /** WebGLRenderer.info counters, not a total GPU memory or leak measurement. */
  readonly gpu:{readonly geometries:number;readonly textures:number}|null;
  readonly suspended:boolean;
}

function summarize(values:readonly number[]):StudioIntervalStats {
  if(!values.length)return {samples:0,medianMs:null,p95Ms:null};
  const sorted=[...values].sort((a,b)=>a-b);
  const quantile=(q:number)=>sorted[Math.ceil((sorted.length-1)*q)]!;
  return {samples:sorted.length,medianMs:quantile(.5),p95Ms:quantile(.95)};
}

export class StudioPerformance {
  private readonly frames:number[]=[];
  private readonly edits:number[]=[];
  private readonly generations:StudioGenerationMeasurement[]=[];
  private lastFrame:number|undefined;
  private load:number|null=null;
  private suspended=false;
  private readonly limit=180;
  recordInitialLoad(ms:number):void {
    if(this.load===null&&Number.isFinite(ms)&&ms>=0)this.load=ms;
  }
  recordEdit(ms:number):void {this.push(this.edits,ms);}
  recordGeneration(measurement:StudioGenerationMeasurement):void {
    if(!Number.isFinite(measurement.elapsedMs)||measurement.elapsedMs<0||
      Object.values(measurement.stages).some(ms=>!Number.isFinite(ms)||ms<0))return;
    this.generations.push({elapsedMs:measurement.elapsedMs,
      stages:{...measurement.stages}});
    if(this.generations.length>3)this.generations.shift();
  }
  recordFrame(time:number):void {
    if(this.suspended||!Number.isFinite(time))return;
    if(this.lastFrame!==undefined){
      const interval=time-this.lastFrame;
      // Ignore browser tab/context suspension, throttling and long tab resumes.
      if(interval>=0&&interval<=250)this.push(this.frames,interval);
    }
    this.lastFrame=time;
  }
  setSuspended(suspended:boolean):void {
    this.suspended=suspended;
    this.lastFrame=undefined;
  }
  snapshot(gpu?:{readonly geometries:number;readonly textures:number}):
    StudioPerformanceSnapshot {
    return {
      initialLoadMs:this.load,edits:summarize(this.edits),
      generations:this.generations.map(m=>({elapsedMs:m.elapsedMs,stages:{...m.stages}})),
      frames:summarize(this.frames),
      gpu:gpu?{geometries:gpu.geometries,textures:gpu.textures}:null,
      suspended:this.suspended,
    };
  }
  private push(values:number[],ms:number):void {
    if(!Number.isFinite(ms)||ms<0)return;
    values.push(ms);
    if(values.length>this.limit)values.shift();
  }
}
