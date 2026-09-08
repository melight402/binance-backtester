import { createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';

// Lightweight drawing state model migrated from futures-app.
// Kept separate from the legacy backtester state to avoid breaking the active chart engine.
export const [drawingSymbol, setDrawingSymbol] = createSignal('BTCUSDT');
export const [drawingActiveTool, setDrawingActiveTool] = createSignal('cursor');
export const [drawingsBySymbol, setDrawingsBySymbol] = createStore({});
export const [selectedId, setSelectedId] = createSignal(null);

export function drawingsFor(sym = drawingSymbol()) {
  return drawingsBySymbol[sym] || [];
}

export function addDrawing(sym, drawing) {
  setDrawingsBySymbol(
    produce((store) => {
      if (!store[sym]) store[sym] = [];
      store[sym].push(drawing);
    })
  );
  setSelectedId(drawing.id);
  return drawing;
}

export function updateDrawing(sym, id, patch) {
  setDrawingsBySymbol(
    sym,
    (drawing) => drawing.id === id,
    patch
  );
}

export function removeDrawing(sym, id) {
  setDrawingsBySymbol(
    sym,
    produce((items) => {
      const index = items.findIndex((drawing) => drawing.id === id);
      if (index !== -1) items.splice(index, 1);
    })
  );

  if (selectedId() === id) {
    setSelectedId(null);
  }
}

export function clearDrawings(sym) {
  setDrawingsBySymbol(sym, []);
  setSelectedId(null);
}

let idCounter = 1;
export function nextId() {
  return `d${Date.now()}_${idCounter++}`;
}

export function selectedDrawing() {
  const currentId = selectedId();
  if (currentId == null) return null;
  return drawingsFor(drawingSymbol()).find((drawing) => drawing.id === currentId) || null;
}
