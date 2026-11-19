import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Autoplay} from './autoplay';

function fixture(total=3){
 let step=0,changed=0,nextId=0;
 const pending=new Map<number,{callback:()=>void;delay:number}>();
 const clock=new Autoplay(()=>++step<total,()=>changed++,{
  set:(callback,delay)=>{const id=++nextId;pending.set(id,{callback,delay});return id;},
  clear:handle=>{pending.delete(handle as number);},
 });
 const tick=()=>{assert.equal(pending.size,1);const [id,timer]=[...pending][0];pending.delete(id);timer.callback();};
 return {clock,pending,tick,step:()=>step,changed:()=>changed};
}
test('autoplay advances once per interval and stops exactly at the last move',()=>{
 const f=fixture();f.clock.start();assert.equal(f.step(),0);assert.equal([...f.pending.values()][0].delay,1000);
 f.tick();f.tick();assert.equal(f.step(),2);assert.equal(f.clock.active,true);
 f.tick();assert.equal(f.step(),3);assert.equal(f.clock.active,false);assert.equal(f.pending.size,0);
});
test('pause cancels pending work and resume keeps the current step',()=>{
 const f=fixture();f.clock.start();f.tick();const stale=[...f.pending.values()][0].callback;
 f.clock.pause();assert.equal(f.pending.size,0);stale();assert.equal(f.step(),1);
 f.clock.start();stale();assert.equal(f.step(),1);f.tick();assert.equal(f.step(),2);
});
test('speed changes replace the running timer without advancing or duplicating moves',()=>{
 const f=fixture();f.clock.start();const stale=[...f.pending.values()][0].callback;
 for(const [speed,delay] of [[0.5,2000],[2,500],[4,250],[1,1000]]){
  f.clock.setSpeed(speed);assert.equal(f.pending.size,1);assert.equal([...f.pending.values()][0].delay,delay);assert.equal(f.step(),0);
 }
 stale();assert.equal(f.step(),0);f.tick();assert.equal(f.step(),1);
 f.clock.pause();f.clock.setSpeed(4);assert.equal(f.pending.size,0);assert.equal(f.clock.active,false);
 f.clock.start();assert.equal([...f.pending.values()][0].delay,250);
});
test('repeated starts, invalid speeds, and cleanup do not create stray timers',()=>{
 const f=fixture();f.clock.start();f.clock.start();assert.equal(f.pending.size,1);
 f.clock.setSpeed(0);f.clock.setSpeed(NaN);assert.equal(f.clock.speed,1);
 const stale=[...f.pending.values()][0].callback;const before=f.changed();f.clock.pause(false);
 assert.equal(f.changed(),before);stale();assert.equal(f.step(),0);assert.equal(f.pending.size,0);
});
