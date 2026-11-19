# Netflix's Scoot

A TypeScript + Vite sliding-block puzzle sandbox. Run `npm install`, then `npm run dev`. `npm run build` checks TypeScript and produces the production build; `npm test` checks the puzzle engine.

## Build

- All non-target blocks are grey. Check **Add as a red block** before adding a shape, or toggle **Red target block** on any existing block. Multiple targets are supported.
- **Draw cells** paints playable space. Drag across the dotted border to grow the canvas on any edge, up to 16 × 16. Canvas resizing creates empty space to draw into. **Erase cells** makes holes or irregular boundaries. Occupied cells and existing exit routes are protected; move or remove the block/exit first.
- **Place exit** creates an exit on a boundary cell facing the chosen direction. An exit must have a clear straight path into the exterior. Select a marker or its list entry to edit column, row, direction, and width. Drag the marker or use arrow keys to move it; **Remove exit** deletes it. Exit width spans rows for left/right exits and columns for top/bottom exits.
- Drag blocks in Move blocks mode; edit their dimensions and positions in the inspector.

## Play

Wide blocks move horizontally, tall blocks vertically, and squares on either axis (one axis per move). Gaps and blocks obstruct movement. Select a red block at a fitting opening, then click its exit. Grey blocks cannot escape. Every red block must escape to win. A slide of any distance counts as one move; each escape also counts as one move.

Undo/redo includes cell strokes, block edits, exits, and escapes. Returning to Build restores the original play layout. Loading a new puzzle or changing modes starts a fresh history. Build layouts are saved locally. JSON import/export preserves irregular cells and multiple exits/targets; the original single-exit puzzle format is migrated automatically.

## Solver

Choose **Find minimum solution** from Build or Play to solve the current layout. Exact breadth-first search runs in a dedicated Web Worker and minimizes total slides plus escapes. All legal slide distances cost one move. The solver respects irregular cells, block axes, square movement, and multiple red blocks and exits.

Use **First**, **Previous**, **Next**, and **Last** to inspect the solution. The board highlights the block/exit for the next move; the panel describes the last completed move and the upcoming move. The solution starts at step zero. **Return to puzzle** restores the pre-search board, mode, move count, and undo history. **Build** during playback restores the searched layout for editing. Playback never overwrites the locally saved puzzle. Editing or changing modes invalidates results.

**Autoplay** advances the solution automatically. **Pause** and **Resume** preserve your position. Choose **0.5×**, **1×**, **2×**, or **4×** playback speed; 1× advances one move per second. Speed changes apply to the next move without skipping steps. Manual stepping pauses autoplay. Playback stops after the final move; **Replay** starts again from step zero. Leaving the solution, opening help, or hiding the tab pauses playback. Zero-move solutions cannot autoplay.

Searches can be cancelled immediately by terminating the worker. The default budget is 200,000 distinct states or 20 seconds, with a smaller state budget for layouts with many blocks. A budget stop is explicitly reported as inconclusive, not impossible. An exhausted search reports that no solution exists. Any returned solution is guaranteed shortest; each move is validated against the game engine before playback.

`npm test` covers the engine, known optimal solutions, comparison with an independent reference search, all exit directions, irregular cells, multiple targets, playback legality, limits, and real-worker completion/cancellation. The starter puzzle has an eight-move minimum.
