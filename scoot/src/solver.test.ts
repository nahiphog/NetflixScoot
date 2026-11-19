import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import type {SolverMessage} from './solver.worker';
import {type Puzzle,type Block,rectangle,GREY,canExit,slide,clone,starter} from './engine';
import {solvePuzzle,applySolutionMove,describeMove} from './solver';

const block=(id:string,x:number,y:number,w=2,h=1,target=true):Block=>({id,x,y,w,h,target,color:GREY});
const board=(blocks:Block[]):Puzzle=>({cols:4,rows:4,cells:rectangle(4,4),exits:[{id:'E1',side:'right',x:3,y:1,size:1}],blocks});
function check(p:Puzzle,minimum:number){
 const original=clone(p),r=solvePuzzle(p);
 assert.equal(r.status,'solved');if(r.status!=='solved')throw Error('Expected solution');
 assert.equal(r.moves.length,minimum);
 let current=clone(p);for(const move of r.moves)current=applySolutionMove(current,move);
 assert.equal(current.blocks.filter(b=>b.target).length,0);assert.deepEqual(p,original);
 return r;
}
test('slide of any distance costs one move, escape costs another',()=>{
 const p=board([block('A',0,1)]);const r=check(p,2);
 assert.deepEqual(r.moves[0],{kind:'slide',blockId:'A',from:[0,1],to:[2,1]});
 assert.equal(describeMove(r.moves[0]),'Move A right 2 cells.');
 assert.equal(describeMove(r.moves[1]),'Exit red block A through E1.');
});
test('blocked target requires a minimum of three moves',()=>{
 const p=board([block('A',0,1),block('B',2,0,1,2,false)]);const r=check(p,3);
 assert.equal(r.moves[0].blockId,'B');
});
test('all red blocks must escape, including when one initially blocks another',()=>{
 const p=board([block('A',0,1),block('B',2,1)]);check(p,3);
 const q=board([block('A',0,0),block('B',0,1)]);q.exits[0].y=0;q.exits[0].size=2;check(q,4);
});

test('three red blocks must all escape with a globally minimal route',()=>{
 const p=board([block('A',0,0),block('B',0,1),block('C',0,2)]);
 p.exits[0].y=0;p.exits[0].size=3;
 const result=check(p,6);
 assert.equal(result.moves.filter(m=>m.kind==='exit').length,3);
 assert.equal(result.moves.length,referenceMinimum(p));
});

test('escaping one red block is not success when another cannot escape',()=>{
 const p=board([block('A',2,1),block('B',0,0)]);
 assert.equal(canExit(p,p.blocks[0],p.exits[0]),true);
 assert.equal(solvePuzzle(p).status,'unsolvable');
});

test('solver moves a grey block onto a key before using the locked exit',()=>{
 const p=board([block('A',2,1),block('G',0,2,1,1,false)]);
 p.keys=[{id:'K1',x:1,y:2,exitId:'E1'}];
 const result=check(p,2);assert.equal(result.moves[0].blockId,'G');
 assert.equal(referenceMinimum(p),2);
 assert.throws(()=>applySolutionMove(p,{kind:'exit',blockId:'A',from:[2,1],exitId:'E1'}));
 const pressed=applySolutionMove(p,result.moves[0]);
 const released=applySolutionMove(pressed,{kind:'slide',blockId:'G',from:[1,2],to:[2,2]});
 assert.equal(canExit(released,released.blocks[0],released.exits[0]),false);
});

test('key coverage forces escape ordering for multiple red blocks',()=>{
 const p=board([block('A',2,1),block('B',0,0)]);
 p.exits.push({id:'E2',side:'right',x:3,y:0,size:1});
 p.keys=[{id:'K1',x:2,y:1,exitId:'E2'}];
 const result=check(p,3);assert.equal(referenceMinimum(p),3);
 assert.deepEqual(result.moves.filter(m=>m.kind==='exit').map(m=>m.blockId),['B','A']);
 const tooEarly=applySolutionMove(p,{kind:'exit',blockId:'A',from:[2,1],exitId:'E1'});
 assert.equal(solvePuzzle(tooEarly).status,'unsolvable');
});

test('an exiting block can press its own key and overlapping exits select an open door',()=>{
 const p=board([block('A',2,1)]);p.keys=[{id:'K1',x:2,y:1,exitId:'E1'}];check(p,1);
 p.keys[0].y=0;
 assert.equal(solvePuzzle(p).status,'unsolvable');
 p.exits.push({...p.exits[0],id:'E2'});
 const result=check(p,1);assert.equal(result.moves[0].kind,'exit');
 if(result.moves[0].kind==='exit')assert.equal(result.moves[0].exitId,'E2');
});
test('squares can change axes but each axis is a separate move',()=>{
 const p=board([block('S',0,0,2,2)]);p.exits[0].y=2;p.exits[0].size=2;check(p,3);
});
test('multiple exits, all four directions, and irregular cells',()=>{
 for(const side of ['left','right','top','bottom'] as const){
  const horizontal=side==='left'||side==='right';
  const p=board([block('A',horizontal?1:0,horizontal?0:1,horizontal?2:1,horizontal?1:2)]);
  p.exits=[{id:'E1',side,x:side==='right'?3:0,y:side==='bottom'?3:0,size:1}];
  p.cells=p.cells.filter(c=>c!=='3,3');check(p,2);
 }
 const p=board([block('A',0,1)]);p.exits.push({id:'E2',side:'left',x:0,y:1,size:1});check(p,1);
});
test('gaps cannot be jumped, grey blocks cannot escape, incompatible exits are impossible',()=>{
 const p=board([block('A',0,1)]);p.cells=p.cells.filter(c=>c!=='2,1');assert.equal(solvePuzzle(p).status,'unsolvable');
 const q=board([block('A',0,1),block('B',2,1,2,1,false)]);assert.equal(solvePuzzle(q).status,'unsolvable');
 const r=board([block('A',0,0,1,2)]);assert.equal(solvePuzzle(r).status,'unsolvable');
});
test('no targets is zero moves; no exit with remaining targets is impossible',()=>{
 check(board([]),0);check(board([block('B',0,0,1,2,false)]),0);
 const p=board([block('A',0,1)]);p.exits=[];assert.equal(solvePuzzle(p).status,'unsolvable');
});
test('cancellation, state limit, and time limit are distinct from impossibility',()=>{
 const p=board([block('A',0,1)]);
 assert.equal(solvePuzzle(p,{isCancelled:()=>true}).status,'cancelled');
 const a=solvePuzzle(p,{maxStates:1});assert.equal(a.status,'limit');if(a.status==='limit')assert.equal(a.reason,'states');
 const b=solvePuzzle(p,{maxMs:0});assert.equal(b.status,'limit');if(b.status==='limit')assert.equal(b.reason,'time');
 const progress:number[]=[];solvePuzzle(p,{onProgress:p=>progress.push(p.visited)});assert.ok(progress.length>0);
});
test('playback rejects a stale layout, a blocked slide, and an invalid exit',()=>{
 const p=board([block('A',0,1),block('B',2,0,1,2,false)]);
 assert.throws(()=>applySolutionMove(p,{kind:'slide',blockId:'A',from:[0,0],to:[2,1]}));
 assert.throws(()=>applySolutionMove(p,{kind:'slide',blockId:'A',from:[0,1],to:[2,1]}));
 assert.throws(()=>applySolutionMove(p,{kind:'exit',blockId:'A',from:[0,1],exitId:'E1'}));
});

// Independent, deliberately simple reference search uses the game's own movement rules.
function referenceMinimum(p:Puzzle):number|null{
 const queue=[{p:clone(p),depth:0}],seen=new Set<string>();
 for(let head=0;head<queue.length;head++){
  const {p:current,depth}=queue[head];if(!current.blocks.some(b=>b.target))return depth;
  const successors:Puzzle[]=[];
  for(const b of current.blocks){
   for(const e of current.exits)if(canExit(current,b,e)){const next=clone(current);next.blocks=next.blocks.filter(o=>o.id!==b.id);successors.push(next);}
   for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])for(let n=1;n<=4;n++){
    const moved=slide(current,b,b.x+dx*n,b.y+dy*n);if(moved.x===b.x&&moved.y===b.y)continue;
    const next=clone(current);next.blocks=next.blocks.map(o=>o.id===b.id?moved:o);successors.push(next);
   }
  }
  for(const next of successors){const key=JSON.stringify(next.blocks);if(!seen.has(key)){seen.add(key);queue.push({p:next,depth:depth+1});}}
 }
 return null;
}
test('optimized search agrees with independent reference search across small boards',()=>{
 for(let redX=0;redX<=2;redX++)for(let obstacleY=0;obstacleY<=2;obstacleY++){
  const p=board([block('A',redX,1),block('B',3,obstacleY,1,2,false)]);
  if(redX+2>3&&obstacleY<=1)continue;
  const expected=referenceMinimum(p),actual=solvePuzzle(p);
  assert.equal(actual.status,expected===null?'unsolvable':'solved');
  if(actual.status==='solved')assert.equal(actual.moves.length,expected);
 }
});
test('starter has an eight-move minimum and every playback prefix is legal',()=>{
 check(starter(),8);
});

function backgroundWorker(){
 return new Worker(`
  require('tsx/cjs');
  const {parentPort,workerData}=require('node:worker_threads');
  globalThis.postMessage=message=>parentPort.postMessage(message);
  require(workerData);
  parentPort.on('message',data=>globalThis.onmessage({data}));
 `,{eval:true,workerData:fileURLToPath(new URL('./solver.worker.ts',import.meta.url))});
}
test('real worker reports progress and solves multiple targets', {timeout:10000},async()=>{
 const worker=backgroundWorker(),p=board([block('A',0,1),block('B',2,1)]);let progress=false;
 try{
  const result=await new Promise<SolverMessage>((resolve,reject)=>{
   worker.on('error',reject);worker.on('message',(message:SolverMessage)=>{if(message.type==='progress')progress=true;else resolve(message);});
   worker.postMessage({puzzle:p});
  });
  assert.equal(progress,true);assert.equal(result.type,'result');
  if(result.type==='result'){assert.equal(result.result.status,'solved');if(result.result.status==='solved')assert.equal(result.result.moves.length,3);}
 }finally{await worker.terminate();}
});
test('terminating a running worker cancels it without returning a late solution', {timeout:10000},async()=>{
 const worker=backgroundWorker();let completed=false;
 const p:Puzzle={cols:16,rows:16,cells:rectangle(16,16),exits:[{id:'E1',side:'right',x:15,y:6,size:1}],blocks:[block('A',0,5),...Array.from({length:10},(_,i)=>block(`G${i}`,i%5*3,Math.floor(i/5)*3,1,1,false))]};
 try{
  await new Promise<void>((resolve,reject)=>{
   worker.on('error',reject);worker.on('message',(message:SolverMessage)=>{if(message.type==='progress')resolve();else completed=true;});
   worker.postMessage({puzzle:p});
  });
  const code=await worker.terminate();assert.equal(code,1);assert.equal(completed,false);
 }finally{await worker.terminate();}
});
