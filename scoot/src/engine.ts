export type Side = 'left' | 'right' | 'top' | 'bottom';
export interface Block { id:string; x:number; y:number; w:number; h:number; color:string; target:boolean }
export interface Exit { id:string; x:number; y:number; side:Side; size:number }
export interface Puzzle { cols:number; rows:number; cells:string[]; exits:Exit[]; blocks:Block[] }
export const GREY='#adb1b5';
export const clone=<T>(v:T):T=>structuredClone(v);
export const cellKey=(x:number,y:number)=>`${x},${y}`;
export const rectangle=(cols:number,rows:number)=>Array.from({length:cols*rows},(_,i)=>cellKey(i%cols,Math.floor(i/cols)));
export const directions:Record<Side,[number,number]>={left:[-1,0],right:[1,0],top:[0,-1],bottom:[0,1]};
export const starter=():Puzzle=>({cols:6,rows:6,cells:rectangle(6,6),exits:[{id:'E1',x:5,y:2,side:'right',size:1}],blocks:[
 {id:'A',x:0,y:2,w:2,h:1,color:'#db655d',target:true},
 {id:'B',x:2,y:0,w:1,h:3,color:GREY,target:false},
 {id:'C',x:3,y:0,w:2,h:1,color:GREY,target:false},
 {id:'D',x:5,y:1,w:1,h:3,color:GREY,target:false},
 {id:'E',x:3,y:3,w:2,h:2,color:GREY,target:false},
 {id:'F',x:0,y:4,w:2,h:1,color:GREY,target:false},
 {id:'G',x:1,y:5,w:3,h:1,color:GREY,target:false}]});
export function fits(p:Puzzle,b:Block){
 if(b.x<0||b.y<0||b.x+b.w>p.cols||b.y+b.h>p.rows)return false;
 const cells=new Set(p.cells);
 for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)if(!cells.has(cellKey(x,y)))return false;
 return !p.blocks.some(o=>o.id!==b.id&&b.x<o.x+o.w&&b.x+b.w>o.x&&b.y<o.y+o.h&&b.y+b.h>o.y);
}
export function slide(p:Puzzle,b:Block,x:number,y:number):Block{
 let dx=x-b.x,dy=y-b.y;
 if(b.w>b.h)dy=0;else if(b.h>b.w)dx=0;else if(Math.abs(dx)>=Math.abs(dy))dy=0;else dx=0;
 const moved={...b};
 for(let i=0;i<Math.max(Math.abs(dx),Math.abs(dy));i++){const next={...moved,x:moved.x+Math.sign(dx),y:moved.y+Math.sign(dy)};if(!fits(p,next))break;Object.assign(moved,next);}return moved;
}
export function validExit(p:Puzzle,e:Exit){
 const horizontal=e.side==='left'||e.side==='right';const d=directions[e.side];if(!Object.hasOwn(directions,e.side)||!d||!Number.isInteger(e.size)||e.size<1||e.size>16)return false;
 const cells=new Set(p.cells);
 for(let i=0;i<e.size;i++){
  let x=e.x+(horizontal?0:i),y=e.y+(horizontal?i:0);
  if(!cells.has(cellKey(x,y)))return false;
  // A straight, unobstructed route through the exterior, not into a hole.
  x+=d[0];y+=d[1];
  while(x>=0&&y>=0&&x<p.cols&&y<p.rows){if(cells.has(cellKey(x,y)))return false;x+=d[0];y+=d[1];}
 }
 return true;
}
export function canExit(p:Puzzle,b:Block,e:Exit){
 if(!b.target||!validExit(p,e))return false;
 if(e.side==='right'||e.side==='left')return b.w>=b.h&&b.y>=e.y&&b.y+b.h<=e.y+e.size&&(e.side==='right'?b.x+b.w-1===e.x:b.x===e.x);
 return b.h>=b.w&&b.x>=e.x&&b.x+b.w<=e.x+e.size&&(e.side==='bottom'?b.y+b.h-1===e.y:b.y===e.y);
}
export function paintCells(p:Puzzle,points:[number,number][],add:boolean):Puzzle{
 const next=clone(p);const cells=new Set(p.cells);
 for(const [x,y] of points){if(!Number.isInteger(x)||!Number.isInteger(y)||x< -1||y< -1||x>p.cols||y>p.rows)continue;const key=cellKey(x,y);if(add)cells.add(key);else cells.delete(key);}
 if(!cells.size)throw Error('Keep at least one cell on the board.');
 const coords=[...cells].map(s=>s.split(',').map(Number));const ox=Math.max(0,-Math.min(...coords.map(c=>c[0]))),oy=Math.max(0,-Math.min(...coords.map(c=>c[1])));
 next.cols=Math.max(p.cols+ox,Math.max(...coords.map(c=>c[0]))+ox+1);next.rows=Math.max(p.rows+oy,Math.max(...coords.map(c=>c[1]))+oy+1);
 if(next.cols>16||next.rows>16)throw Error('The canvas can be at most 16 × 16 cells.');
 next.cells=coords.map(([x,y])=>cellKey(x+ox,y+oy));next.blocks.forEach(b=>{b.x+=ox;b.y+=oy;});next.exits.forEach(e=>{e.x+=ox;e.y+=oy;});
 if(next.blocks.some(b=>!fits(next,b)))throw Error('Move the block before erasing its cells.');
 if(next.exits.some(e=>!validExit(next,e)))throw Error('Move or remove the exit before changing its path.');
 return next;
}
export function parsePuzzle(raw:unknown):Puzzle{
 const source=raw as Puzzle & {exit?:Side;lane?:number};const int=(v:unknown,min:number,max:number)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;
 if(!source||!int(source.cols,4,16)||!int(source.rows,4,16)||!Array.isArray(source.blocks)||source.blocks.length>256)throw Error('Invalid puzzle. Use a 4–16 cell canvas.');
 const p=clone(source);
 // Upgrade puzzles saved by the original single-exit sandbox.
 if(!Object.hasOwn(source,'cells'))p.cells=rectangle(p.cols,p.rows);
 if(!Object.hasOwn(source,'exits')){
  if(!source.exit||!directions[source.exit]||!int(source.lane,0,(source.exit==='left'||source.exit==='right'?p.rows:p.cols)-1))throw Error('Invalid legacy exit.');
  const side=source.exit,horizontal=side==='left'||side==='right',t=p.blocks.find(b=>b.target);
  p.exits=[{id:'E1',side,x:horizontal?(side==='left'?0:p.cols-1):source.lane!,y:horizontal?source.lane!:(side==='top'?0:p.rows-1),size:t?(horizontal?t.h:t.w):1}];
 }
 if(!Array.isArray(p.cells)||!p.cells.length||p.cells.length>256||new Set(p.cells).size!==p.cells.length||p.cells.some(s=>typeof s!=='string'||!/^\d+,\d+$/.test(s)||s.split(',').some((v,i)=>!int(Number(v),0,(i?p.rows:p.cols)-1))))throw Error('Invalid grid cells.');
 const ids=new Set<string>();for(const b of p.blocks){if(!b||typeof b.id!=='string'||! /^[A-Za-z0-9_-]{1,12}$/.test(b.id)||ids.has(b.id)||!int(b.x,0,15)||!int(b.y,0,15)||!int(b.w,1,p.cols)||!int(b.h,1,p.rows)||typeof b.target!=='boolean'||!fits(p,b))throw Error('Blocks must occupy existing cells without overlapping.');ids.add(b.id);b.color=b.target?'#db655d':GREY;}
 if(!Array.isArray(p.exits)||p.exits.length>256)throw Error('Invalid exits.');ids.clear();
 for(const e of p.exits){if(!e||typeof e.id!=='string'||!/^[A-Za-z0-9_-]{1,12}$/.test(e.id)||ids.has(e.id)||!int(e.x,0,p.cols-1)||!int(e.y,0,p.rows-1)||!validExit(p,e))throw Error('Exits must face an unobstructed exterior edge.');ids.add(e.id);}
 return {cols:p.cols,rows:p.rows,cells:p.cells,exits:p.exits,blocks:p.blocks};
}
