import {
  initialStudioRecipe,reduceStudioRecipe,studioRecipeFingerprint,
  type StudioEditCommand,type StudioRecipeV1,
} from "./StudioRecipe";

export interface StudioHistoryStatus {
  readonly recipe:StudioRecipeV1;
  readonly revision:number;
  readonly canUndo:boolean;
  readonly canRedo:boolean;
  readonly changed:boolean;
  readonly length:number;
}
/** Pure, session-local editor history; no browser storage, side effects or timers.
 * A range gesture edits one history entry regardless of intermediate preview
 * frames, and a failed latest render rolls back to the last proven-good recipe.
 */
export class StudioHistory {
  private entries:StudioRecipeV1[];
  private index=0;
  private revision=0;
  private readonly capacity:number;
  private good:StudioRecipeV1;
  private gesture?:{key:string;index:number};
  constructor(capacity=48,initial:StudioRecipeV1=initialStudioRecipe()) {
    if(!Number.isSafeInteger(capacity)||capacity<2||capacity>512)
      throw new Error("Invalid editor history capacity");
    this.capacity=capacity;
    this.entries=[initial];
    this.good=initial;
  }
  get current():StudioRecipeV1{return this.entries[this.index]!;}
  get status():StudioHistoryStatus {
    return {
      recipe:this.current,revision:this.revision,
      canUndo:this.index>0,canRedo:this.index<this.entries.length-1,
      changed:studioRecipeFingerprint(this.current)!==
        studioRecipeFingerprint(initialStudioRecipe()),
      length:this.entries.length,
    };
  }
  beginGesture(key:string):void {
    if(!key)throw new Error("Missing gesture key");
    if(this.gesture?.key!==key)this.gesture={key,index:-1};
  }
  endGesture():void {this.gesture=undefined;}
  apply(command:StudioEditCommand):boolean {
    const next=reduceStudioRecipe(this.current,command);
    if(studioRecipeFingerprint(next)===studioRecipeFingerprint(this.current))
      return false;
    if(this.gesture&&this.gesture.index===this.index){
      this.entries[this.index]=next;
    }else{
      this.entries.splice(this.index+1);
      this.entries.push(next);
      this.index=this.entries.length-1;
      if(this.gesture)this.gesture.index=this.index;
      if(this.entries.length>this.capacity){
        this.entries.shift();
        this.index--;
        if(this.gesture)this.gesture.index--;
      }
    }
    this.revision++;
    return true;
  }
  undo():boolean {
    this.endGesture();
    if(this.index===0)return false;
    this.index--;this.revision++;return true;
  }
  redo():boolean {
    this.endGesture();
    if(this.index===this.entries.length-1)return false;
    this.index++;this.revision++;return true;
  }
  /** A stale result is never allowed to mutate the editing timeline. */
  resolve(revision:number,success:boolean):boolean {
    if(revision!==this.revision)return false;
    this.endGesture();
    if(success){
      this.good=this.current;
    }else{
      const signature=studioRecipeFingerprint(this.good);
      let target=-1;
      for(let i=this.entries.length-1;i>=0;i--)
        if(studioRecipeFingerprint(this.entries[i]!)===signature){target=i;break;}
      if(target<0){
        this.entries=[this.good];this.index=0;
      }else{
        this.entries.splice(target+1);
        this.index=target;
      }
      this.revision++;
    }
    return true;
  }
}
