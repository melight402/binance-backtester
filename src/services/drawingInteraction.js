export const DEFAULT_TOOL = 'cursor';

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return dist(px, py, cx, cy);
}

export function hitTestDrawing(pointer, drawings, geometry) {
  if (!pointer || !Array.isArray(drawings) || !geometry) return null;

  for (let index = drawings.length - 1; index >= 0; index -= 1) {
    const drawing = drawings[index];
    if (!drawing) continue;

    if (drawing.type === 'hline') {
      const y0 = geometry.toY?.(drawing.price);
      if (y0 != null && Math.abs(pointer.y - y0) <= 6) {
        return { id: drawing.id, mode: 'hline-price' };
      }
    }

    if (drawing.type === 'ray') {
      const y0 = geometry.toY?.(drawing.price);
      const x0 = geometry.toX?.(drawing.time);
      if (y0 == null) continue;
      if (x0 != null && dist(pointer.x, pointer.y, x0, y0) <= 8) {
        return { id: drawing.id, mode: 'ray-anchor' };
      }
      if (x0 != null && pointer.x >= x0 && Math.abs(pointer.y - y0) <= 6) {
        return {
          id: drawing.id,
          mode: 'ray-body',
          anchorTime: geometry.fromX ? geometry.fromX(pointer.x) : pointer.x,
          anchorPrice: geometry.fromY ? geometry.fromY(pointer.y) : pointer.y,
        };
      }
    }

    if (drawing.type === 'trendline') {
      const p1 = drawing.p1 || {};
      const p2 = drawing.p2 || {};
      const x1 = geometry.toX?.(p1.time);
      const y1 = geometry.toY?.(p1.price);
      const x2 = geometry.toX?.(p2.time);
      const y2 = geometry.toY?.(p2.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
      if (dist(pointer.x, pointer.y, x1, y1) <= 8) {
        return { id: drawing.id, mode: 'trend-p1' };
      }
      if (dist(pointer.x, pointer.y, x2, y2) <= 8) {
        return { id: drawing.id, mode: 'trend-p2' };
      }
      if (segDist(pointer.x, pointer.y, x1, y1, x2, y2) <= 6) {
        return {
          id: drawing.id,
          mode: 'trend-body',
          anchorTime: geometry.fromX ? geometry.fromX(pointer.x) : pointer.x,
          anchorPrice: geometry.fromY ? geometry.fromY(pointer.y) : pointer.y,
        };
      }
    }

    if (drawing.type === 'range') {
      const p1 = drawing.p1 || {};
      const p2 = drawing.p2 || {};
      const x1 = geometry.toX?.(p1.time);
      const y1 = geometry.toY?.(p1.price);
      const x2 = geometry.toX?.(p2.time);
      const y2 = geometry.toY?.(p2.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
      if (dist(pointer.x, pointer.y, x1, y1) <= 8) return { id: drawing.id, mode: 'range-p1' };
      if (dist(pointer.x, pointer.y, x2, y2) <= 8) return { id: drawing.id, mode: 'range-p2' };
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      if (pointer.x >= left && pointer.x <= right && pointer.y >= top && pointer.y <= bottom) {
        return {
          id: drawing.id,
          mode: 'range-body',
          anchorTime: geometry.fromX ? geometry.fromX(pointer.x) : pointer.x,
          anchorPrice: geometry.fromY ? geometry.fromY(pointer.y) : pointer.y,
        };
      }
    }

    if (drawing.type === 'long' || drawing.type === 'short') {
      const entryX = geometry.toX?.(drawing.entryTime);
      const entryY = geometry.toY?.(drawing.entry);
      const stopY = geometry.toY?.(drawing.stop);
      const ptY = geometry.toY?.(drawing.pt);
      if (entryX == null || entryY == null || stopY == null || ptY == null) continue;
      const endX = geometry.toX?.(drawing.endTime) ?? (geometry.width ?? entryX + 100);
      const minY = Math.min(entryY, stopY, ptY);
      const maxY = Math.max(entryY, stopY, ptY);
      if (dist(pointer.x, pointer.y, entryX, entryY) <= 10) {
        return { id: drawing.id, mode: 'position-entry' };
      }
      if (dist(pointer.x, pointer.y, endX, ptY) <= 10) {
        return { id: drawing.id, mode: 'position-pt' };
      }
      if (dist(pointer.x, pointer.y, endX, stopY) <= 10) {
        return { id: drawing.id, mode: 'position-stop' };
      }
      if (pointer.x >= entryX && pointer.x <= endX && pointer.y >= minY && pointer.y <= maxY) {
        return { id: drawing.id, mode: 'position-body', anchorTime: geometry.fromX ? geometry.fromX(pointer.x) : pointer.x, anchorPrice: geometry.fromY ? geometry.fromY(pointer.y) : pointer.y };
      }
    }
  }

  return null;
}

export function createDrawingFromTool(tool, pointer, geometry, base = {}) {
  if (!pointer || !geometry || !tool) return null;

  const price = geometry.fromY ? geometry.fromY(pointer.y) : pointer.y;
  const time = geometry.fromX ? geometry.fromX(pointer.x) : pointer.x;

  if (tool === 'hline') {
    return { id: base.id, type: 'hline', price };
  }

  if (tool === 'ray') {
    return { id: base.id, type: 'ray', time, price };
  }

  if (tool === 'trendline') {
    const pointTime = Number.isFinite(time) ? time : base.time;
    return {
      id: base.id,
      type: 'trendline',
      p1: { time: pointTime, price },
      p2: { time: pointTime, price },
    };
  }

  if (tool === 'long' || tool === 'short') {
    const isLong = tool === 'long';
    const risk = Math.max(price * 0.005, 0.0001);
    return {
      id: base.id,
      type: tool,
      entryTime: time ?? base.time,
      endTime: (time ?? base.time) + (base.step ?? 3000),
      entry: price,
      stop: isLong ? price - risk : price + risk,
      pt: isLong ? price + risk * 2 : price - risk * 2,
    };
  }

  return null;
}

export function toggleTool(tool, currentTool) {
  return currentTool === tool ? DEFAULT_TOOL : tool;
}

export function resetDrawingLifecycle({ setActiveTool, setSelectedId, setDraft = null } = {}) {
  if (typeof setActiveTool === 'function') setActiveTool(DEFAULT_TOOL);
  if (typeof setSelectedId === 'function') setSelectedId(null);
  if (typeof setDraft === 'function') setDraft(null);
  return { activeTool: DEFAULT_TOOL, selectedId: null };
}

export function handleDeleteSelection({ selectedId, onDelete, removeDrawing, setSelectedId } = {}) {
  if (!selectedId) return false;
  if (typeof onDelete === 'function') onDelete(selectedId);
  else if (typeof removeDrawing === 'function') removeDrawing(selectedId);
  if (typeof setSelectedId === 'function') setSelectedId(null);
  return true;
}

export function createDrawingLifecycle({
  drawings = [],
  setDrawings = null,
  setSelectedId = null,
  setActiveTool = null,
  setDraft = null,
  onCreate = null,
} = {}) {
  const updateDrawings = (nextDrawings) => {
    if (typeof setDrawings === 'function') setDrawings(nextDrawings);
    return nextDrawings;
  };

  return {
    handlePointerDown(pointer, geometry, tool, base = {}) {
      if (!pointer || !geometry || !tool || tool === DEFAULT_TOOL) return null;
      const nextDrawing = createDrawingFromTool(tool, pointer, geometry, base);
      if (!nextDrawing) return null;
      const nextDrawings = [...drawings, nextDrawing];
      updateDrawings(nextDrawings);
      if (typeof setSelectedId === 'function') setSelectedId(nextDrawing.id);
      if (typeof setActiveTool === 'function') setActiveTool(DEFAULT_TOOL);
      if (typeof onCreate === 'function') onCreate(nextDrawing);
      if (typeof setDraft === 'function') setDraft(null);
      return nextDrawing;
    },

    handleKeyDown(event) {
      if (!event || typeof event.key !== 'string') return false;
      if (event.key === 'Escape') {
        resetDrawingLifecycle({ setActiveTool, setSelectedId, setDraft });
        return true;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && typeof setSelectedId === 'function') {
        const currentId = typeof setSelectedId === 'function' ? null : null;
        if (currentId == null) return false;
        return handleDeleteSelection({ selectedId: currentId, onDelete: (id) => {
          const nextDrawings = drawings.filter((drawing) => drawing.id !== id);
          updateDrawings(nextDrawings);
        }, setSelectedId });
      }
      return false;
    },
  };
}
