import { canExit, clone, parsePuzzle, slide, type Puzzle } from './engine';

export type SolutionMove = { blockId:string; from:[number,number] } & (
  { kind:'slide'; to:[number,number] } | { kind:'exit'; exitId:string }
);
export interface SearchProgress { visited:number; expanded:number; depth:number; elapsedMs:number }
export type SearchResult = SearchProgress & (
  { status:'solved'; moves:SolutionMove[] } |
  { status:'unsolvable' } | { status:'cancelled' } |
  { status:'limit'; reason:'states'|'time' }
);
export interface SearchOptions {
  maxStates?:number; maxMs?:number;
  onProgress?:(progress:SearchProgress)=>void;
  isCancelled?:()=>boolean;
  now?:()=>number;
}
export const SEARCH_LIMITS={maxStates:200_000,maxMs:20_000};

/** Exact breadth-first search. Every legal slide distance and every escape is one edge. */
export function solvePuzzle(input:Puzzle,options:SearchOptions={}):SearchResult {
  const p=parsePuzzle(input),blocks=p.blocks,area=p.cols*p.rows;
  const now=options.now??(()=>performance.now()),start=now();
  const maxStates=Math.max(1,Math.min(options.maxStates??SEARCH_LIMITS.maxStates,
    Math.floor(32_000_000/Math.max(32,blocks.length*2))));
  const maxMs=options.maxMs??SEARCH_LIMITS.maxMs;
  let expanded=0,depth=0;
  // Code 0 means escaped; 1..256 encode the top-left cell. Block order is immutable.
  const initial=String.fromCharCode(...blocks.map(b=>b.y*p.cols+b.x+1));
  const keys=[initial],parents=[-1],seen=new Set([initial]),escapeIds=new Map<number,string>();
  const stats=():SearchProgress=>({visited:seen.size,expanded,depth,elapsedMs:now()-start});
  const targets=blocks.flatMap((b,i)=>b.target?[i]:[]);
  const goal=(key:string)=>targets.every(i=>key.charCodeAt(i)===0);
  if(goal(initial))return {...stats(),status:'solved',moves:[]};
  if(!p.exits.length)return {...stats(),status:'unsolvable'};
  const floor=new Set(p.cells);
  // Static placement and escape tables are shared by every search state.
  type Placement={allowed:Uint8Array;exits:Map<number,string[]>};
  const placements:Placement[]=[],placementCache=new Map<string,Placement>();
  for(const b of blocks){
    if(options.isCancelled?.())return {...stats(),status:'cancelled'};
    if(now()-start>=maxMs)return {...stats(),status:'limit',reason:'time'};
    const signature=`${b.w},${b.h},${b.target}`;
    const cached=placementCache.get(signature);if(cached){placements.push(cached);continue;}
    const allowed=new Uint8Array(area),exits=new Map<number,string[]>();
    for(let y=0;y+b.h<=p.rows;y++)for(let x=0;x+b.w<=p.cols;x++){
      let valid=true;
      for(let yy=y;yy<y+b.h&&valid;yy++)for(let xx=x;xx<x+b.w;xx++)if(!floor.has(`${xx},${yy}`)){valid=false;break;}
      if(!valid)continue;
      const pos=y*p.cols+x;allowed[pos]=1;
      // parsePuzzle already validates the fixed exit paths; only geometry varies here.
      if(b.target){const exitsHere=p.exits.filter(e=>
        e.side==='left'||e.side==='right'
          ? b.w>=b.h&&y>=e.y&&y+b.h<=e.y+e.size&&(e.side==='right'?x+b.w-1===e.x:x===e.x)
          : b.h>=b.w&&x>=e.x&&x+b.w<=e.x+e.size&&(e.side==='bottom'?y+b.h-1===e.y:y===e.y));
        if(exitsHere.length)exits.set(pos,exitsHere.map(e=>e.id));
      }
    }
    const placement={allowed,exits};placements.push(placement);placementCache.set(signature,placement);
  }
  if(targets.some(i=>!placements[i].exits.size))return {...stats(),status:'unsolvable'};
  const reconstruct=(index:number):SolutionMove[]=>{
    const moves:SolutionMove[]=[];
    while(parents[index]!==-1){
      const before=keys[parents[index]],after=keys[index];
      const i=blocks.findIndex((_,j)=>before.charCodeAt(j)!==after.charCodeAt(j));
      const fromPos=before.charCodeAt(i)-1,toPos=after.charCodeAt(i)-1;
      const from:[number,number]=[fromPos%p.cols,Math.floor(fromPos/p.cols)];
      moves.push(toPos<0?{kind:'exit',blockId:blocks[i].id,from,exitId:escapeIds.get(index)!}:
        {kind:'slide',blockId:blocks[i].id,from,to:[toPos%p.cols,Math.floor(toPos/p.cols)]});
      index=parents[index];
    }
    return moves.reverse();
  };
  const occupancy=new Int16Array(area);
  let layerEnd=1;
  options.onProgress?.(stats());
  for(let head=0;head<keys.length;head++){
    if(head===layerEnd){depth++;layerEnd=keys.length;}
    if(options.isCancelled?.())return {...stats(),status:'cancelled'};
    if(now()-start>=maxMs)return {...stats(),status:'limit',reason:'time'};
    if(head%256===0)options.onProgress?.(stats());
    const key=keys[head];occupancy.fill(-1);
    blocks.forEach((b,i)=>{
      const pos=key.charCodeAt(i)-1;if(pos<0)return;
      const x=pos%p.cols,y=Math.floor(pos/p.cols);
      for(let yy=y;yy<y+b.h;yy++)for(let xx=x;xx<x+b.w;xx++)occupancy[yy*p.cols+xx]=i;
    });
    expanded++;
    const enqueue=(i:number,position:number,exitId?:string):SearchResult|undefined=>{
      const next=key.slice(0,i)+String.fromCharCode(position+1)+key.slice(i+1);
      if(seen.has(next))return;
      if(seen.size>=maxStates)return {...stats(),status:'limit',reason:'states'};
      seen.add(next);keys.push(next);parents.push(head);
      if(exitId)escapeIds.set(keys.length-1,exitId);
      if(goal(next))return {...stats(),status:'solved',moves:reconstruct(keys.length-1)};
    };
    for(let i=0;i<blocks.length;i++){
      const pos=key.charCodeAt(i)-1;if(pos<0)continue;
      const b=blocks[i],x=pos%p.cols,y=Math.floor(pos/p.cols);
      // Keys are floor switches: occupancy in this state determines which doors are open.
      const exitId=placements[i].exits.get(pos)?.find(id=>{
        const key=p.keys?.find(k=>k.exitId===id);
        return !key||occupancy[key.y*p.cols+key.x]!==-1;
      });
      if(exitId){const result=enqueue(i,-1,exitId);if(result)return result;}
      const directions:[number,number][]=[];
      if(b.w>=b.h)directions.push([-1,0],[1,0]);
      if(b.h>=b.w)directions.push([0,-1],[0,1]);
      for(const [dx,dy] of directions)for(let distance=1;;distance++){
        const nx=x+dx*distance,ny=y+dy*distance,next=ny*p.cols+nx;
        if(nx<0||ny<0||nx+b.w>p.cols||ny+b.h>p.rows||!placements[i].allowed[next])break;
        let blocked=false;
        for(let yy=ny;yy<ny+b.h&&!blocked;yy++)for(let xx=nx;xx<nx+b.w;xx++){
          const occupant=occupancy[yy*p.cols+xx];if(occupant!==-1&&occupant!==i){blocked=true;break;}
        }
        if(blocked)break;
        const result=enqueue(i,next);if(result)return result;
      }
    }
  }
  return {...stats(),status:'unsolvable'};
}

/** Reuse game rules to validate every playback move rather than trusting search output. */
export function applySolutionMove(p:Puzzle,move:SolutionMove):Puzzle {
  const next=clone(p),b=next.blocks.find(b=>b.id===move.blockId);
  if(!b||b.x!==move.from[0]||b.y!==move.from[1])throw Error('Solution does not match this board.');
  if(move.kind==='exit'){
    const e=next.exits.find(e=>e.id===move.exitId);
    if(!e||!canExit(next,b,e))throw Error('Invalid solution exit.');
    next.blocks=next.blocks.filter(o=>o.id!==b.id);
  }else{
    const moved=slide(next,b,...move.to);
    if(moved.x!==move.to[0]||moved.y!==move.to[1]||(moved.x===b.x&&moved.y===b.y))throw Error('Invalid solution slide.');
    Object.assign(b,moved);
  }
  return next;
}
export function describeMove(move:SolutionMove):string {
  if(move.kind==='exit')return `Exit red block ${move.blockId} through ${move.exitId}.`;
  const dx=move.to[0]-move.from[0],dy=move.to[1]-move.from[1],distance=Math.abs(dx||dy);
  return `Move ${move.blockId} ${dx<0?'left':dx>0?'right':dy<0?'up':'down'} ${distance} ${distance===1?'cell':'cells'}.`;
}
