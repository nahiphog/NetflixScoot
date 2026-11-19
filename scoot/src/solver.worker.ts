import { solvePuzzle, type SearchProgress, type SearchResult } from './solver';
import type { Puzzle } from './engine';

export type SolverMessage = {type:'progress'; progress:SearchProgress} |
  {type:'result'; result:SearchResult} | {type:'error'; message:string};
// Use a small structural interface so the application can share DOM TypeScript settings.
const worker=globalThis as unknown as {
  onmessage:((event:MessageEvent<{puzzle:Puzzle}>)=>void)|null;
  postMessage:(message:SolverMessage)=>void;
};
worker.onmessage=event=>{
  try {
    const result=solvePuzzle(event.data.puzzle,{onProgress:progress=>worker.postMessage({type:'progress',progress})});
    worker.postMessage({type:'result',result});
  }catch(error){worker.postMessage({type:'error',message:error instanceof Error?error.message:'The solver could not complete this search.'});}
};
