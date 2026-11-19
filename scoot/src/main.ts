import './style.css';
import {keyIcon} from './key-icon';
import {applySolutionMove,describeMove,SEARCH_LIMITS,type SolutionMove,type SearchProgress,type SearchResult} from './solver';
import type {SolverMessage} from './solver.worker';
import {Autoplay,PLAYBACK_SPEEDS} from './autoplay';
import {type Puzzle,type Block,type Exit,type Side,type Key,keyPressed,exitOpen,starter,GREY,clone,fits,slide,canExit,parsePuzzle,cellKey,validExit,paintCells,rectangle} from './engine';
const root=document.querySelector<HTMLDivElement>('#app')!;
type Tool='select'|'draw'|'erase'|'exit'|'key';
let selectedKey='';
let puzzle=starter(),mode:'build'|'play'|'solution'='build',tool:Tool='select',selected='A',selectedExit='',moves=0,won=false,baseline:Puzzle|null=null,newRed=false,exitSide:Side='right';
type Snapshot={p:Puzzle;m:number;won:boolean};let undo:Snapshot[]=[],redo:Snapshot[]=[];
let solverWorker:Worker|null=null,searchStatus='Ready to find the fewest moves from the current layout.',searchProgress:SearchProgress|null=null;
let solution:{source:Puzzle;moves:SolutionMove[];step:number;original:Snapshot;originalMode:'build'|'play';baseline:Puzzle|null;undo:Snapshot[];redo:Snapshot[]}|null=null;
const autoplay=new Autoplay(()=>{
 if(!solution||mode!=='solution'||solution.step>=solution.moves.length)return false;
 showSolutionStep(solution.step+1,false);
 return solution.step<solution.moves.length;
},()=>render());
document.addEventListener('visibilitychange',()=>{if(document.hidden)autoplay.pause();});
window.addEventListener('pagehide',()=>autoplay.pause(false));
const locked=()=>!!solverWorker||mode==='solution';
function invalidateSolver(){autoplay.pause(false);solverWorker?.terminate();solverWorker=null;solution=null;searchProgress=null;searchStatus='Ready to find the fewest moves from the current layout.';}
function progressText(){return searchProgress?`${searchProgress.visited.toLocaleString()} states found · ${searchProgress.expanded.toLocaleString()} checked · depth ${searchProgress.depth} · ${(searchProgress.elapsedMs/1000).toFixed(1)}s`:'';}
function solverPanel(){
 const s=solution,current=s&&s.step>0?s.moves[s.step-1]:null,next=s?.moves[s.step];
 return `<section class="solver-panel" aria-label="Minimum-move solver"><div class="solver-heading"><h2>${s?'Solution playback':'Minimum-move solver'}</h2><span class="solver-badge">${s?`${s.moves.length} minimum moves`:'EXACT SEARCH'}</span></div>
 <p id="solver-status" role="status" aria-live="polite">${searchStatus}</p><p id="solver-progress" class="solver-meta">${progressText()}</p>
 ${s?`<div class="solution-step" aria-live="polite"><strong>Step ${s.step} of ${s.moves.length}</strong><p>${current?describeMove(current):'Starting layout.'}</p><span>${next?`Next: ${describeMove(next)}`:'All red blocks are out.'}</span></div><div class="autoplay-controls"><button id="solution-autoplay" class="solve-button" ${s.moves.length?'':'disabled'}>${autoplay.active?'Pause':s.step===s.moves.length&&s.moves.length?'Replay':s.step>0?'Resume':'Autoplay'}</button><span class="autoplay-status" role="status">${autoplay.active?'Playing':s.step===s.moves.length?'Complete':s.step>0?'Paused':'Ready'}</span><div class="playback-speed" role="group" aria-label="Playback speed"><span>Speed</span>${PLAYBACK_SPEEDS.map(speed=>`<button data-speed="${speed}" aria-label="Playback speed ${speed}x" aria-pressed="${autoplay.speed===speed}" title="${1000/speed} milliseconds per move">${speed}×</button>`).join('')}</div></div><div class="playback-controls"><button id="solution-first" ${s.step===0?'disabled':''}>First</button><button id="solution-prev" ${s.step===0?'disabled':''}>Previous</button><button id="solution-next" ${s.step===s.moves.length?'disabled':''}>Next</button><button id="solution-last" ${s.step===s.moves.length?'disabled':''}>Last</button></div><button id="solution-return" class="secondary">Return to puzzle</button>`:
 `<div class="solver-actions"><button id="solve" class="solve-button" ${solverWorker?'disabled':''}>Find minimum solution</button>${solverWorker?'<button id="cancel-solve" class="secondary">Cancel search</button>':''}</div><p class="solver-meta">One slide = one move. Each escape = one move.<br>Search budget: up to ${SEARCH_LIMITS.maxStates.toLocaleString()} states or ${SEARCH_LIMITS.maxMs/1000} seconds; large boards may stop earlier to limit memory.</p>`}</section>`;
}
function startSolver(){
 if(solverWorker||mode==='solution')return;
 const source=clone(puzzle),original=snap(),originalMode=mode,originalBaseline=clone(baseline),originalUndo=clone(undo),originalRedo=clone(redo);
 searchProgress=null;searchStatus='Searching for the shortest solution…';
 try{
  const job=new Worker(new URL('./solver.worker.ts',import.meta.url),{type:'module'});solverWorker=job;render();
  const finish=(result:SearchResult)=>{
   searchProgress=result;
   if(result.status==='solved'){
    // Validate the entire route before displaying it.
    const final=result.moves.reduce(applySolutionMove,source);
    if(final.blocks.some(b=>b.target))throw Error('The solver returned an incomplete solution.');
    solution={source,moves:result.moves,step:0,original,originalMode,baseline:originalBaseline,undo:originalUndo,redo:originalRedo};
    mode='solution';tool='select';searchStatus=result.moves.length?`Shortest solution found: ${result.moves.length} moves from this layout.`:'Already solved: no red blocks remain.';showSolutionStep(0);
   }else{
    searchStatus=result.status==='unsolvable'?'No solution exists for this layout.':result.status==='cancelled'?'Search cancelled. Your puzzle is unchanged.':`Search limit reached (${result.reason==='states'?'state budget':'time budget'}). This does not mean the puzzle is impossible.`;
    render();
   }
  };
  job.onmessage=(event:MessageEvent<SolverMessage>)=>{
   if(solverWorker!==job)return;
   const message=event.data;
   if(message.type==='progress'){searchProgress=message.progress;const el=document.getElementById('solver-progress');if(el)el.textContent=progressText();return;}
   job.terminate();solverWorker=null;
   try{if(message.type==='error')throw Error(message.message);finish(message.result);}catch(error){solution=null;searchStatus=error instanceof Error?error.message:'Search failed. Please try again.';render();}
  };
  job.onerror=event=>{if(solverWorker!==job)return;event.preventDefault();job.terminate();solverWorker=null;searchStatus='The solver could not run. Your puzzle is unchanged. Please try again.';render();};
  job.onmessageerror=()=>{if(solverWorker!==job)return;job.terminate();solverWorker=null;searchStatus='Could not read the solver result. Please try again.';render();};
  job.postMessage({puzzle:source});
 }catch{solverWorker?.terminate();solverWorker=null;searchStatus='Could not start the background solver. Please try again.';render();}
}
function showSolutionStep(step:number,renderNow=true){
 selectedKey='';
 if(!solution)return;const s=solution;s.step=Math.max(0,Math.min(step,s.moves.length));
 puzzle=clone(s.source);for(let i=0;i<s.step;i++)puzzle=applySolutionMove(puzzle,s.moves[i]);
 moves=s.step;won=!puzzle.blocks.some(b=>b.target);
 const highlight=s.moves[s.step]??s.moves[s.step-1];selected=highlight?.blockId??'';selectedExit=highlight?.kind==='exit'?highlight.exitId:'';if(renderNow)render();
}
function returnFromSolution(edit=false){
 if(!solution)return;const s=solution;
 puzzle=clone(s.source);mode=edit?'build':s.originalMode;moves=edit?0:s.original.m;won=edit?false:s.original.won;baseline=edit?null:s.baseline;
 undo=edit&&s.originalMode==='play'?[]:s.undo;redo=edit&&s.originalMode==='play'?[]:s.redo;selected=puzzle.blocks[0]?.id??'';selectedExit='';
 invalidateSolver();save();render();
}
try{const saved=localStorage.getItem('scoot-puzzle');if(saved)puzzle=parsePuzzle(JSON.parse(saved));}catch{}
const snap=():Snapshot=>({p:clone(puzzle),m:moves,won});
function save(){try{localStorage.setItem('scoot-puzzle',JSON.stringify(mode==='play'&&baseline?baseline:puzzle));}catch{}}
function change(fn:()=>void){invalidateSolver();undo.push(snap());redo=[];fn();save();render();}
function toast(text:string){const el=document.querySelector('#toast')!;el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3500);}
function attempt(fn:()=>void){try{fn();}catch(e){render();toast(e instanceof Error?e.message:'This change is not possible.');}}
function unique(prefix:string,ids:string[]){let n=1;while(ids.includes(`${prefix}${n}`))n++;return `${prefix}${n}`;}
const arrows:Record<Side,string>={right:'→',left:'←',top:'↑',bottom:'↓'};
const sideOptions=(side:Side)=>(['right','bottom','left','top'] as Side[]).map(s=>`<option value="${s}" ${side===s?'selected':''}>${s[0].toUpperCase()+s.slice(1)}</option>`).join('');
const disabled=()=>mode!=='build'||locked()?'disabled':'';
function solutionPreview(cols:number,rows:number){
 const move=solution?.moves[solution.step];
 if(mode!=='solution'||!move)return '';
 const block=puzzle.blocks.find(b=>b.id===move.blockId);if(!block)return '';
 const exit=move.kind==='exit'?puzzle.exits.find(e=>e.id===move.exitId):undefined;
 const to=move.kind==='slide'?move.to:exit?[block.x+(exit.side==='right'?block.w:exit.side==='left'?-block.w:0),block.y+(exit.side==='bottom'?block.h:exit.side==='top'?-block.h:0)]:move.from;
 const dx=to[0]-block.x,dy=to[1]-block.y;
 const startX=block.x+block.w/2,startY=block.y+block.h/2;
 const endX=Math.max(0.08,Math.min(cols-0.08,to[0]+block.w/2)),endY=Math.max(0.08,Math.min(rows-0.08,to[1]+block.h/2));
 // For escape moves, show a partial silhouette leaving the board; keep all artwork inside the board bounds.
 const ghostX=move.kind==='exit'?block.x+Math.sign(dx)*0.55:to[0],ghostY=move.kind==='exit'?block.y+Math.sign(dy)*0.55:to[1];
 return `<div class="solution-preview" role="img" aria-label="Next move: ${describeMove(move)} Dashed silhouette shows ${move.kind==='exit'?'the block leaving the grid':'its destination'}.">
 <div class="destination-ghost ${block.target?'red-ghost':''}" style="left:calc(${ghostX}/var(--cols)*100% + 5px);top:calc(${ghostY}/var(--rows)*100% + 5px);width:calc(${block.w}/var(--cols)*100% - 10px);height:calc(${block.h}/var(--rows)*100% - 10px)"><span>${block.id}</span></div>
 <svg class="move-arrow" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="move-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#263e1d"/></marker></defs><line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#ffffff" stroke-width="0.10"/><line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#263e1d" stroke-width="0.045" marker-end="url(#move-arrowhead)"/></svg>
 </div>`;
}
function boardPerimeter(cols:number,rows:number,pad:number){
 const cells=new Set(puzzle.cells),open=new Set<string>();
 for(const e of puzzle.exits)for(let i=0;i<e.size;i++){
  const horizontal=e.side==='left'||e.side==='right';
  open.add(`${e.x+(horizontal?0:i)},${e.y+(horizontal?i:0)},${e.side}`);
 }
 const segments:string[]=[];
 for(const cell of cells){
  const [x,y]=cell.split(',').map(Number),px=x+pad,py=y+pad;
  const edges:[Side,number,number,number,number,number,number][]=[
   ['left',-1,0,px,py,px,py+1],['right',1,0,px+1,py,px+1,py+1],
   ['top',0,-1,px,py,px+1,py],['bottom',0,1,px,py+1,px+1,py+1]
  ];
  for(const [side,dx,dy,x1,y1,x2,y2] of edges)
   if(!cells.has(cellKey(x+dx,y+dy))&&!open.has(`${x},${y},${side}`))segments.push(`M${x1} ${y1}L${x2} ${y2}`);
 }
 return `<svg class="board-perimeter" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="none" aria-hidden="true"><path d="${segments.join(' ')}" vector-effect="non-scaling-stroke"/></svg>`;
}
function keyInspector(k:Key){
 return `<div class="key-preview">${keyIcon}<strong>Yellow key ${k.id}</strong></div><p class="muted">1 × 1 cell · ${keyPressed(puzzle,k)?'Pressed — exit open':'Uncovered — exit closed'}</p><label>Assigned exit<select id="key-exit" ${disabled()}>${puzzle.exits.filter(e=>e.id===k.exitId||!puzzle.keys?.some(o=>o.exitId===e.id)).map(e=>`<option value="${e.id}" ${e.id===k.exitId?'selected':''}>${e.id} · ${e.side}</option>`).join('')}</select></label><div class="inspector-fields">${(['x','y'] as const).map(axis=>`<label>Key ${axis==='x'?'column':'row'}<input data-key-prop="${axis}" type="number" min="1" max="${axis==='x'?puzzle.cols:puzzle.rows}" value="${k[axis]+1}" ${disabled()}></label>`).join('')}</div><p class="muted">Any block covering this key opens its assigned exit. Moving off the key closes it again. Keys stay on the board.</p><button id="delete-key" class="delete" ${disabled()}>Remove key</button>`;
}
function render(){
 const focusedId=(document.activeElement as HTMLElement|null)?.id;
 const focusedSpeed=(document.activeElement as HTMLElement|null)?.dataset.speed;
 const k=puzzle.keys?.find(k=>k.id===selectedKey),b=puzzle.blocks.find(b=>b.id===selected),exit=puzzle.exits.find(e=>e.id===selectedExit),painting=mode==='build'&&tool!=='select',pad=mode==='build'?1:0,cols=puzzle.cols+pad*2,rows=puzzle.rows+pad*2;
 const cellSet=new Set(puzzle.cells);
 const fields=(items:[string,string,number,number][],attr:string)=>items.map(([key,label,value,max])=>`<label>${label}<input ${attr}="${key}" type="number" min="1" max="${max}" value="${value}" ${disabled()}></label>`).join('');
 root.innerHTML=`<header><a class="brand" href="./" aria-label="Netflix's Scoot home"><span class="logo">▰<i>▰</i></span><span><small>NETFLIX'S</small><strong>scoot<span>.</span></strong></span></a><div class="header-label">A LITTLE SPACE. A LOT OF POSSIBILITIES.</div><button class="quiet" id="how">How to play</button></header>
 <main><div class="intro intro-actions"><button id="example" class="secondary">Load example</button></div>
 <div class="workspace"><aside class="panel settings"><div class="panel-title"><h2>Your playground</h2></div><p class="muted">Build a board that’s entirely yours.</p>
 <div class="field-title">CANVAS SIZE <span>4–16 cells</span></div><div class="two-fields">${fields([['cols','Columns',puzzle.cols,16],['rows','Rows',puzzle.rows,16]],'data-grid')}</div>
 <p class="muted">Resize the canvas, then draw cells in the empty space.</p>
 <div class="field-title">BOARD TOOLS</div><div class="tool-grid">${(['select','draw','erase','exit','key'] as Tool[]).map(t=>`<button data-tool="${t}" aria-pressed="${tool===t}" class="${tool===t?'active':''}" ${disabled()}>${{select:'Move blocks',draw:'Draw cells',erase:'Erase cells',exit:'Place exit',key:'Place key'}[t]}</button>`).join('')}</div>
 <p class="muted">${tool==='draw'?'Click or drag empty cells, including the dotted border, to grow your board.':tool==='erase'?'Click or drag to erase empty cells. Blocks and exits are protected.':tool==='exit'?'Choose a direction, then click an exterior cell edge.':tool==='key'?'Click a playable cell to place a 1 × 1 yellow key. Assign its exit in Key details.':'Drag blocks or exits. Select either to edit its details.'}</p>
 <label class="exit-direction">New exit direction<select id="new-exit-side" ${disabled()}>${sideOptions(exitSide)}</select></label>
 <div class="field-title">EXIT PATHS <span>${puzzle.exits.length}</span></div><div class="exit-list">${puzzle.exits.map(e=>`<button data-select-exit="${e.id}" class="${e.id===selectedExit?'active':''}">${e.id} · ${e.side} · (${e.x+1}, ${e.y+1})${puzzle.keys?.some(k=>k.exitId===e.id)?exitOpen(puzzle,e)?' · Open':' · Locked':''}</button>`).join('')||'<p class="muted">Use Place exit to add a path.</p>'}</div>
 <div class="field-title">YELLOW KEYS <span>${puzzle.keys?.length??0}</span></div><div class="exit-list">${puzzle.keys?.map(k=>`<button data-select-key="${k.id}" class="${k.id===selectedKey?'active':''}">${k.id} → ${k.exitId} · ${keyPressed(puzzle,k)?'Pressed':'Uncovered'}</button>`).join('')||'<p class="muted">Place a key to control one exit.</p>'}</div>
 <div class="divider"></div><div class="field-title">ADD A BLOCK</div><label class="target-toggle"><input id="new-red" type="checkbox" ${newRed?'checked':''} ${disabled()}>Add as a red block</label><div class="shapes"><button data-add="2,1" ${disabled()}><span class="shape horizontal"></span>Horizontal</button><button data-add="1,2" ${disabled()}><span class="shape vertical"></span>Vertical</button><button data-add="2,2" ${disabled()}><span class="shape square"></span>Square</button></div><button id="clear" class="text-button" ${disabled()}>Remove all blocks</button><button id="reset-grid" class="secondary reset-grid-button" ${disabled()}>Reset grid</button><p class="muted">Start fresh with an empty 5 × 5 grid. Removes all blocks, keys, and exits.</p></aside>
 <section class="board-panel">${solverPanel()}<div class="board-toolbar"><div class="segmented"><button id="build" class="${mode==='build'?'active':''}">Build</button><button id="play" class="${mode==='play'?'active':''}">Play</button></div><span class="saved">Saved on this device</span></div><div class="board-caption"><span>${mode==='solution'?'SOLUTION PLAYBACK':mode==='build'?'SHAPE YOUR NEXT CHALLENGE':'GET EVERY RED BLOCK OUT'}</span><span>${puzzle.cells.length} cells</span></div>
 <div class="board-wrap"><div class="board custom-board ${painting?'painting':''}" id="board" style="--cols:${cols};--rows:${rows};aspect-ratio:${cols}/${rows}">
 ${Array.from({length:cols*rows},(_,i)=>{const x=i%cols-pad,y=Math.floor(i/cols)-pad,active=cellSet.has(cellKey(x,y));return `<button class="cell ${active?'':'void'}" data-cell="${x},${y}" aria-label="${active?'Cell':'Empty cell'} column ${x+1}, row ${y+1}" ${mode!=='build'?'disabled':''}>${!active&&mode==='build'?'+':''}</button>`;}).join('')}
 ${puzzle.keys?.map(k=>`<button class="floor-key ${keyPressed(puzzle,k)?'pressed':''} ${selectedKey===k.id?'selected':''}" data-key="${k.id}" aria-label="Key ${k.id}, opens ${k.exitId}, ${keyPressed(puzzle,k)?'pressed':'uncovered'}, column ${k.x+1}, row ${k.y+1}" style="left:calc(${k.x+pad}/var(--cols)*100%);top:calc(${k.y+pad}/var(--rows)*100%);width:calc(100%/var(--cols));height:calc(100%/var(--rows))">${keyIcon}<span>${k.id}</span></button>`).join('')??''}
 ${puzzle.blocks.map(block=>`<button class="block ${selected===block.id?'selected':''} ${block.target?'target':''}" data-block="${block.id}" aria-label="Block ${block.id}${block.target?', red target':''}, ${block.w} by ${block.h}, column ${block.x+1}, row ${block.y+1}" style="left:calc(${block.x+pad}/var(--cols)*100% + 5px);top:calc(${block.y+pad}/var(--rows)*100% + 5px);width:calc(${block.w}/var(--cols)*100% - 10px);height:calc(${block.h}/var(--rows)*100% - 10px);--block-color:${block.target?'#db655d':GREY}"><span class="block-id">${block.id}${block.target?' ★':''}</span><span class="block-direction">${block.w>block.h?'↔':block.h>block.w?'↕':'✥'}</span></button>`).join('')}
 ${puzzle.exits.map(e=>{const h=e.side==='left'||e.side==='right';return `<button class="path-marker ${exitOpen(puzzle,e)?'':'locked-exit'} ${selectedExit===e.id?'chosen':''}" data-exit="${e.id}" aria-label="Exit ${e.id}, ${exitOpen(puzzle,e)?'open':'locked'}, ${e.side}, column ${e.x+1}, row ${e.y+1}, width ${e.size}" style="left:${(e.x+pad+(e.side==='right'?1:0))/cols*100}%;top:${(e.y+pad+(e.side==='bottom'?1:0))/rows*100}%;width:${h?'18px':e.size/cols*100+'%'};height:${h?e.size/rows*100+'%':'18px'};transform:${h?'translateX(-50%)':'translateY(-50%)'}">${exitOpen(puzzle,e)?arrows[e.side]:'🔒'}</button>`;}).join('')}
 ${boardPerimeter(cols,rows,pad)}
 ${solutionPreview(cols,rows)}
 </div></div>${mode==='solution'&&solution?.moves[solution.step]?`<div class="preview-legend"><span class="ghost-key" aria-hidden="true"></span><span><strong>Next move:</strong> ${describeMove(solution.moves[solution.step])}<small>${solution.moves[solution.step].kind==='exit'?'Dashed shape shows the block leaving the grid.':'Dashed shape = destination. Solid outlined block = starting position.'}</small></span></div>`:''}<div class="board-hint">${mode==='solution'?'Watch with Autoplay or inspect each move with the step controls.':won?'Every red block escaped. Puzzle complete!':mode==='build'?tool==='select'?'Drag to move · Select to edit':'Click or drag cells using your selected tool':`${puzzle.blocks.filter(b=>b.target).length} red blocks remaining · Select a red block, then its exit`}</div><div class="board-bottom"><div class="history"><button id="undo" aria-label="Undo" ${undo.length?'':'disabled'}>↶</button><button id="redo" aria-label="Redo" ${redo.length?'':'disabled'}>↷</button><button id="reset" aria-label="Reset play session" ${mode==='build'?'disabled':''}>↻</button></div><div class="move-count"><strong>${String(moves).padStart(2,'0')}</strong> moves</div></div></section>
 <aside class="panel inspector"><h2>${k?'Key details':exit?'Exit details':'Block details'}</h2><p class="muted">Select a block or an exit to edit it.</p>
 ${k?keyInspector(k):exit?`<div class="exit-preview">${arrows[exit.side]} <strong>${exit.id}</strong></div><label>Direction<select id="edit-side" ${disabled()}>${sideOptions(exit.side)}</select></label><div class="inspector-fields">${fields([['x','Exit column',exit.x+1,puzzle.cols],['y','Exit row',exit.y+1,puzzle.rows],['size','Exit width',exit.size,16]],'data-exit-prop')}</div><p class="muted">Position is the first cell along the opening. Width spans rows for left/right exits and columns for top/bottom exits.</p><button class="delete" id="delete-exit" ${disabled()}>Remove exit</button>`:b?`<div class="selected-preview" style="--preview:${b.target?'#db655d':GREY}"><div style="aspect-ratio:${b.w}/${b.h}">${b.id}${b.target?' ★':''}</div></div><div class="block-heading"><h3>${b.target?'Red block':'Grey block'} ${b.id}</h3><span>${b.w} × ${b.h}</span></div><p class="muted">${b.w>b.h?'Moves left and right':b.h>b.w?'Moves up and down':'Moves in all four directions'}</p><div class="divider"></div><div class="inspector-fields">${fields([['w','Width',b.w,puzzle.cols],['h','Height',b.h,puzzle.rows],['x','Column',b.x+1,puzzle.cols],['y','Row',b.y+1,puzzle.rows]],'data-prop')}</div><label class="target-toggle"><input id="target" type="checkbox" ${b.target?'checked':''} ${disabled()}>Red target block</label><button class="delete" id="delete" ${disabled()}>Remove block</button>`:'<div class="empty">Select any block or exit.<br>Draw cells to create more space.</div>'}
 <div class="rule-note"><span>THE OBJECTIVE</span><p>Get <b>all red blocks</b> out through any suitable exit. Grey blocks stay on the board.</p><p>Every slide counts as one move, regardless of distance. Each escape also counts as one move.</p></div></aside></div>
 <section class="under-board"><div><span class="status-pill">SANDBOX</span><span>Build, test, and start again.</span></div><div><button id="import">Import puzzle</button><button id="export">Export puzzle</button><input id="file" type="file" accept=".json,application/json" hidden></div></section><footer><span>Less scrolling. More scooting.</span><span>Made for curious minds.</span></footer></main>
 <div id="toast" role="status" aria-live="polite"></div><dialog id="help"><button id="close-help" aria-label="Close instructions">×</button><h2>Make room for red.</h2><p>In Build, use <b>Draw cells</b> to paint playable cells. Draw into the dotted border to extend the board on any side, up to 16 × 16. Erase cells to make an irregular board. Occupied cells and exit paths are protected.</p><p>Use <b>Place exit</b>, choose its outward direction, then click a boundary cell. Select the green marker to edit its direction, column, row, or width. Drag it to move it, or use Remove exit.</p><p>Use <b>Place key</b> to put a yellow key on one playable cell and assign its exit in Key details. Any red or grey block covering the key opens that exit; moving off closes it. Keys stay on the floor. Each key controls exactly one exit and each controlled exit has one key. Exits without keys remain open. Select covered keys in the Yellow keys list to edit them. Removing an exit also removes its key.</p><p>Add red blocks with the checkbox above the shapes, or toggle any existing block’s Red target block option. You can have as many red blocks as fit.</p><p>In Play, wide blocks move horizontally, tall blocks vertically, and squares on either axis. Blocks cannot cross gaps or other blocks. Select a red block at an exit and click the green marker to escape. Get all red blocks out to win.</p><p>Arrow keys move a selected block or exit one cell. Each slide and each escape counts as one move. Undo, redo, local saving, and JSON import/export include the entire board layout.</p><p>Use <b>Find minimum solution</b> to search the current layout. Exact search runs in the background and can be cancelled. A search limit is not proof that a puzzle is impossible. Step through the shortest solution with First, Previous, Next, and Last. Autoplay advances one move at a time. Pause and Resume keep your place; choose 0.5×, 1×, 2×, or 4× speed (1× is one move per second). Manual stepping pauses autoplay. Playback stops at the end, when you leave the solution, or when this tab is hidden. Replay starts again from step zero. The highlighted block or exit is used by the next move. A dashed silhouette previews the block’s destination, with an arrow showing the direction and the caption showing the distance. Return to puzzle restores the layout you solved.</p></dialog>`;
 bind(pad,cols,rows);
 if(focusedId?.startsWith('solution-'))document.getElementById(focusedId)?.focus({preventScroll:true});
 else if(focusedSpeed)document.querySelector<HTMLButtonElement>(`[data-speed="${focusedSpeed}"]`)?.focus({preventScroll:true});
}
function on(id:string,fn:()=>void){document.getElementById(id)?.addEventListener('click',fn);}
function updateBlock(next:Block){if(!fits(puzzle,next)){toast('Blocks must fit on existing cells without overlapping.');return;}change(()=>{puzzle.blocks=puzzle.blocks.map(b=>b.id===next.id?next:b);});}
function updateExit(next:Exit){if(!validExit(puzzle,next)){render();toast('Place the entire exit along an edge facing empty space all the way out.');return;}if(puzzle.exits.some(e=>e.id!==next.id&&e.side===next.side&&e.x===next.x&&e.y===next.y)){toast('There is already an exit here.');return;}change(()=>{puzzle.exits=puzzle.exits.map(e=>e.id===next.id?next:e);});}
function useExit(id:string){
 selectedKey='';
 if(mode==='build'){selectedExit=id;selected='';tool='select';render();return;}if(won)return;
 const exit=puzzle.exits.find(e=>e.id===id)!;if(!exitOpen(puzzle,exit)){toast('This exit is locked. Cover its yellow key with any block to open it.');return;}const target=puzzle.blocks.find(b=>b.id===selected);
 const candidates=puzzle.blocks.filter(b=>canExit(puzzle,b,exit));const b=target?.target?candidates.find(b=>b.id===target.id):candidates.length===1?candidates[0]:undefined;
 if(!b){toast(candidates.length>1?'Select which red block should escape.':'Select a red block that fits this exit and move it to the opening.');return;}
 change(()=>{puzzle.blocks=puzzle.blocks.filter(o=>o.id!==b.id);moves++;won=!puzzle.blocks.some(o=>o.target);selected='';});
}
function newPuzzle(p:Puzzle){selectedKey='';invalidateSolver();mode='build';baseline=null;tool='select';puzzle=p;selected=p.blocks[0]?.id??'';selectedExit='';moves=0;won=false;undo=[];redo=[];save();render();}
function bind(pad:number,cols:number,rows:number){
 const selectKey=(id:string)=>{selectedKey=id;selected='';selectedExit='';tool='select';render();};
 const updateKey=(next:Key)=>attempt(()=>{const checked=parsePuzzle({...puzzle,keys:puzzle.keys?.map(k=>k.id===next.id?next:k)});change(()=>{puzzle=checked;});});
 document.querySelectorAll<HTMLButtonElement>('[data-select-key]').forEach(el=>el.onclick=()=>selectKey(el.dataset.selectKey!));
 document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(el=>{
  el.onclick=()=>{if(mode==='build'&&tool==='select'&&!locked())selectKey(el.dataset.key!);};
  el.onkeydown=e=>{if(mode!=='build'||locked())return;const d=keyDirection(e.key);if(!d)return;e.preventDefault();const k=puzzle.keys!.find(k=>k.id===el.dataset.key)!;selectedKey=k.id;updateKey({...k,x:k.x+d[0],y:k.y+d[1]});document.querySelector<HTMLButtonElement>(`[data-key="${k.id}"]`)?.focus({preventScroll:true});};
 });
 document.querySelector<HTMLSelectElement>('#key-exit')?.addEventListener('change',e=>updateKey({...puzzle.keys!.find(k=>k.id===selectedKey)!,exitId:(e.target as HTMLSelectElement).value}));
 document.querySelectorAll<HTMLInputElement>('[data-key-prop]').forEach(el=>el.onchange=()=>updateKey({...puzzle.keys!.find(k=>k.id===selectedKey)!,[el.dataset.keyProp!]:Number(el.value)-1}));
 on('delete-key',()=>change(()=>{puzzle.keys=puzzle.keys?.filter(k=>k.id!==selectedKey);selectedKey='';}));
 function placeKey(x:number,y:number){
  if(!puzzle.cells.includes(cellKey(x,y))){toast('Place the key on a playable cell.');return;}
  if(puzzle.keys?.some(k=>k.x===x&&k.y===y)){toast('There is already a key on this cell.');return;}
  const exit=puzzle.exits.find(e=>!puzzle.keys?.some(k=>k.exitId===e.id));
  if(!exit){toast('Add an exit without a key first. Each key controls one different exit.');return;}
  const key:Key={id:unique('K',puzzle.keys?.map(k=>k.id)??[]),x,y,exitId:exit.id};
  change(()=>{puzzle.keys=[...(puzzle.keys??[]),key];selectedKey=key.id;selected='';selectedExit='';tool='select';});
 }
 on('solve',startSolver);
 on('cancel-solve',()=>{solverWorker?.terminate();solverWorker=null;searchStatus='Search cancelled. Your puzzle is unchanged.';render();});
 on('solution-autoplay',()=>{if(!solution||!solution.moves.length)return;if(autoplay.active){autoplay.pause();return;}if(solution.step===solution.moves.length)showSolutionStep(0,false);autoplay.start();});
 document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(button=>button.onclick=()=>autoplay.setSpeed(Number(button.dataset.speed)));
 const seek=(step:number)=>{autoplay.pause(false);showSolutionStep(step);};
 on('solution-first',()=>seek(0));on('solution-prev',()=>seek(solution!.step-1));
 on('solution-next',()=>seek(solution!.step+1));on('solution-last',()=>seek(solution!.moves.length));
 on('solution-return',()=>returnFromSolution());
 if(locked())document.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('.settings button,.settings input,.settings select,.inspector button,.inspector input,.inspector select,.history button,#example,#import,#play').forEach(el=>el.disabled=true);
 if(solverWorker)(document.getElementById('build') as HTMLButtonElement).disabled=true;

 on('how',()=>{autoplay.pause();document.querySelector<HTMLDialogElement>('#help')!.showModal();});on('close-help',()=>document.querySelector<HTMLDialogElement>('#help')!.close());on('example',()=>newPuzzle(starter()));
 on('clear',()=>change(()=>{puzzle.blocks=[];selected='';}));
 on('reset-grid',()=>change(()=>{selectedKey='';puzzle={cols:5,rows:5,cells:rectangle(5,5),blocks:[],exits:[]};selected='';selectedExit='';tool='select';baseline=null;moves=0;won=false;newRed=false;exitSide='right';}));
 on('build',()=>{if(mode==='solution'){returnFromSolution(true);return;}if(mode==='build')return;newPuzzle(clone(baseline??puzzle));});
 on('play',()=>{if(mode==='play')return;if(!puzzle.blocks.some(b=>b.target)||!puzzle.exits.length){toast('Add at least one red block and one exit before playing.');return;}invalidateSolver();baseline=clone(puzzle);mode='play';tool='select';selectedExit='';moves=0;won=false;undo=[];redo=[];render();});
 on('reset',()=>{if(baseline)change(()=>{puzzle=clone(baseline!);moves=0;won=false;});});
 for(const [id,from,to] of [['undo',undo,redo],['redo',redo,undo]] as const)on(id,()=>{const previous=from.pop();if(previous){invalidateSolver();to.push(snap());puzzle=previous.p;moves=previous.m;won=previous.won;save();render();}});
 document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(el=>el.onclick=()=>{tool=el.dataset.tool as Tool;render();});
 document.querySelector<HTMLSelectElement>('#new-exit-side')!.onchange=e=>{exitSide=(e.target as HTMLSelectElement).value as Side;};
 document.querySelector<HTMLInputElement>('#new-red')!.onchange=e=>{newRed=(e.target as HTMLInputElement).checked;};
 document.querySelectorAll<HTMLInputElement>('[data-grid]').forEach(input=>input.onchange=()=>attempt(()=>{const next=clone(puzzle),key=input.dataset.grid as 'cols'|'rows';next[key]=Number(input.value);if(next.cells.some(s=>{const [x,y]=s.split(',').map(Number);return x>=next.cols||y>=next.rows;}))throw Error('Erase cells outside the smaller canvas first.');const checked=parsePuzzle(next);change(()=>{puzzle=checked;});}));
 document.querySelectorAll<HTMLButtonElement>('[data-add]').forEach(btn=>btn.onclick=()=>{const [w,h]=btn.dataset.add!.split(',').map(Number);const b:Block={id:unique('B',puzzle.blocks.map(b=>b.id)),x:0,y:0,w,h,color:GREY,target:newRed};for(let y=0;y<puzzle.rows;y++)for(let x=0;x<puzzle.cols;x++){b.x=x;b.y=y;if(fits(puzzle,b)){change(()=>{puzzle.blocks.push(b);selectedKey='';selected=b.id;selectedExit='';tool='select';});return;}}toast('Draw more cells or move a block to make room.');});
 document.querySelectorAll<HTMLInputElement>('[data-prop]').forEach(input=>input.onchange=()=>{const b=puzzle.blocks.find(b=>b.id===selected)!;const key=input.dataset.prop as 'w'|'h'|'x'|'y',value=Number(input.value);if(!Number.isInteger(value)||value<1){render();return;}updateBlock({...b,[key]:value-(key==='x'||key==='y'?1:0)});render();});
 on('delete',()=>change(()=>{puzzle.blocks=puzzle.blocks.filter(b=>b.id!==selected);selected='';}));
 document.querySelector<HTMLInputElement>('#target')?.addEventListener('change',e=>change(()=>{puzzle.blocks.find(b=>b.id===selected)!.target=(e.target as HTMLInputElement).checked;}));
 document.querySelectorAll<HTMLButtonElement>('[data-select-exit]').forEach(el=>el.onclick=()=>{selectedKey='';selectedExit=el.dataset.selectExit!;selected='';tool='select';render();});
 document.querySelector<HTMLSelectElement>('#edit-side')?.addEventListener('change',e=>updateExit({...puzzle.exits.find(e=>e.id===selectedExit)!,side:(e.target as HTMLSelectElement).value as Side}));
 document.querySelectorAll<HTMLInputElement>('[data-exit-prop]').forEach(input=>input.onchange=()=>{const e=puzzle.exits.find(e=>e.id===selectedExit)!;const key=input.dataset.exitProp as 'x'|'y'|'size';updateExit({...e,[key]:Number(input.value)-(key==='size'?0:1)});});
 on('delete-exit',()=>change(()=>{puzzle.keys=puzzle.keys?.filter(k=>k.exitId!==selectedExit);puzzle.exits=puzzle.exits.filter(e=>e.id!==selectedExit);selectedExit='';}));
 on('export',()=>{const blob=new Blob([JSON.stringify(solution?solution.source:mode==='play'&&baseline?baseline:puzzle,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='scoot-puzzle.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Puzzle exported.');});
 on('import',()=>document.getElementById('file')!.click());document.querySelector<HTMLInputElement>('#file')!.onchange=async e=>{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>100000){toast('Choose a puzzle JSON file under 100 KB.');return;}try{newPuzzle(parsePuzzle(JSON.parse(await file.text())));toast('Your puzzle is ready.');}catch(e){toast(e instanceof Error?e.message:'Could not import puzzle.');}};
 const board=document.getElementById('board')!;
 // Playback and in-flight searches are read-only, including keyboard events.
 if(locked())for(const event of ['pointerdown','keydown','click'])board.addEventListener(event,e=>{e.preventDefault();e.stopImmediatePropagation();},true);
 function position(e:PointerEvent,rect:DOMRect):[number,number]{return [Math.floor((e.clientX-rect.left)/rect.width*cols)-pad,Math.floor((e.clientY-rect.top)/rect.height*rows)-pad];}
 function place(x:number,y:number){const exit:Exit={id:unique('E',puzzle.exits.map(e=>e.id)),x,y,side:exitSide,size:1};if(!validExit(puzzle,exit)){toast('Choose a cell on the outer boundary facing the selected direction.');return;}if(puzzle.exits.some(e=>e.x===x&&e.y===y&&e.side===exitSide)){toast('An exit already exists here.');return;}change(()=>{puzzle.exits.push(exit);selectedKey='';selectedExit=exit.id;selected='';tool='select';});}
 board.onpointerdown=e=>{
  if(mode!=='build'||tool==='select'||e.button!==0)return;e.preventDefault();const rect=board.getBoundingClientRect();let previous=position(e,rect);if(tool==='exit'){place(...previous);return;}if(tool==='key'){placeKey(...previous);return;}
  const points=new Map<string,[number,number]>();const paint=(point:[number,number])=>{const [x,y]=point;if(x< -1||y< -1||x>puzzle.cols||y>puzzle.rows)return;points.set(cellKey(x,y),point);const el=board.querySelector<HTMLElement>(`[data-cell="${x},${y}"]`);el?.classList.add(tool==='draw'?'paint-add':'paint-remove');};paint(previous);board.setPointerCapture(e.pointerId);
  board.onpointermove=ev=>{const current=position(ev,rect);const steps=Math.max(Math.abs(current[0]-previous[0]),Math.abs(current[1]-previous[1]));for(let i=1;i<=steps;i++)paint([Math.round(previous[0]+(current[0]-previous[0])*i/steps),Math.round(previous[1]+(current[1]-previous[1])*i/steps)]);previous=current;};
  board.onpointerup=()=>attempt(()=>{const next=paintCells(puzzle,[...points.values()],tool==='draw');if(JSON.stringify(next)!==JSON.stringify(puzzle))change(()=>{puzzle=next;});else render();});board.onpointercancel=()=>render();
 };
 document.querySelectorAll<HTMLButtonElement>('[data-cell]').forEach(el=>el.onkeydown=e=>{if(mode!=='build'||!['Enter',' '].includes(e.key))return;e.preventDefault();const point=el.dataset.cell!.split(',').map(Number) as [number,number];if(tool==='exit')place(...point);else if(tool==='key')placeKey(...point);else if(tool==='draw'||tool==='erase')attempt(()=>{const next=paintCells(puzzle,[point],tool==='draw');change(()=>{puzzle=next;});});});
 const focus=(selector:string)=>document.querySelector<HTMLButtonElement>(selector)?.focus({preventScroll:true});
 document.querySelectorAll<HTMLButtonElement>('[data-block]').forEach(el=>{
  el.onpointerdown=e=>{if(e.button!==0||won||(mode==='build'&&tool!=='select'))return;e.stopPropagation();const b=puzzle.blocks.find(b=>b.id===el.dataset.block)!;selectedKey='';selected=b.id;selectedExit='';const rect=board.getBoundingClientRect(),startX=e.clientX,startY=e.clientY;let next={...b};el.setPointerCapture(e.pointerId);el.classList.add('dragging');
   el.onpointermove=ev=>{const x=b.x+Math.round((ev.clientX-startX)/(rect.width/cols)),y=b.y+Math.round((ev.clientY-startY)/(rect.height/rows));const candidate=mode==='play'?slide(puzzle,b,x,y):{...b,x,y};if(fits(puzzle,candidate))next=candidate;el.style.transform=`translate(${(next.x-b.x)*rect.width/cols}px,${(next.y-b.y)*rect.height/rows}px)`;};
   el.onpointerup=()=>{if(next.x!==b.x||next.y!==b.y)change(()=>{Object.assign(b,next);if(mode==='play')moves++;});else render();focus(`[data-block="${b.id}"]`);};el.onpointercancel=()=>render();};
  el.onkeydown=e=>{const d=keyDirection(e.key);if(e.key==='Enter'||e.key===' '){e.preventDefault();selectedKey='';selected=el.dataset.block!;selectedExit='';render();focus(`[data-block="${selected}"]`);return;}if(!d||won)return;e.preventDefault();const b=puzzle.blocks.find(b=>b.id===el.dataset.block)!;selectedKey='';selected=b.id;selectedExit='';const next=mode==='play'?slide(puzzle,b,b.x+d[0],b.y+d[1]):{...b,x:b.x+d[0],y:b.y+d[1]};if(fits(puzzle,next)&&(next.x!==b.x||next.y!==b.y))change(()=>{Object.assign(b,next);if(mode==='play')moves++;});focus(`[data-block="${b.id}"]`);};
 });
 document.querySelectorAll<HTMLButtonElement>('[data-exit]').forEach(el=>{
  el.onpointerdown=e=>{if(e.button!==0)return;e.stopPropagation();const exit=puzzle.exits.find(o=>o.id===el.dataset.exit)!;const rect=board.getBoundingClientRect(),sx=e.clientX,sy=e.clientY;let dx=0,dy=0;el.setPointerCapture(e.pointerId);
   el.onpointermove=ev=>{if(mode==='play')return;dx=Math.round((ev.clientX-sx)/(rect.width/cols));dy=Math.round((ev.clientY-sy)/(rect.height/rows));el.style.translate=`${dx*rect.width/cols}px ${dy*rect.height/rows}px`;};
   el.onpointerup=()=>{if(mode==='build'&&(dx||dy)){selectedKey='';selectedExit=exit.id;selected='';updateExit({...exit,x:exit.x+dx,y:exit.y+dy});render();}else useExit(exit.id);};el.onpointercancel=()=>render();};
  el.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();useExit(el.dataset.exit!);}else{const d=keyDirection(e.key);if(mode==='build'&&d){e.preventDefault();const exit=puzzle.exits.find(o=>o.id===el.dataset.exit)!;selectedKey='';selectedExit=exit.id;selected='';updateExit({...exit,x:exit.x+d[0],y:exit.y+d[1]});focus(`[data-exit="${exit.id}"]`);}}};
 });
}
function keyDirection(key:string):[number,number]|undefined{return ({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,[number,number]>)[key];}
render();
