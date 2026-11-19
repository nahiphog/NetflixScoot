export const PLAYBACK_SPEEDS=[0.5,1,2,4] as const;
type Scheduler={set:(callback:()=>void,delay:number)=>unknown;clear:(handle:unknown)=>void};

/** A single cancellable timer. Stale callbacks cannot advance a newer playback session. */
export class Autoplay {
  active=false;
  speed=1;
  private timer:unknown;
  private generation=0;
  constructor(private advance:()=>boolean,private changed:()=>void,private scheduler:Scheduler={
    set:(callback,delay)=>globalThis.setTimeout(callback,delay),
    clear:handle=>globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  }){}
  start(){if(this.active)return;this.active=true;this.schedule();this.changed();}
  pause(notify=true){
    this.generation++;
    if(this.timer!==undefined)this.scheduler.clear(this.timer);
    this.timer=undefined;const wasActive=this.active;this.active=false;
    if(notify&&wasActive)this.changed();
  }
  setSpeed(speed:number){
    if(!PLAYBACK_SPEEDS.some(value=>value===speed))return;
    this.speed=speed;
    if(this.active){this.pause(false);this.active=true;this.schedule();}
    this.changed();
  }
  private schedule(){
    const generation=++this.generation;
    this.timer=this.scheduler.set(()=>{
      if(!this.active||generation!==this.generation)return;
      this.timer=undefined;
      try{if(!this.advance()){this.pause(false);this.changed();return;}}
      catch(error){this.pause(false);this.changed();throw error;}
      // advance may itself cancel playback.
      if(this.active&&generation===this.generation)this.schedule();
      this.changed();
    },1000/this.speed);
  }
}
