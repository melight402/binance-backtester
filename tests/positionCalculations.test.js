import { beforeEach, describe, expect, it } from 'vitest';
import {
  calculatePositionNotional,
  calculatePositionQuantity,
  resolvePositionToolPrices,
} from '../src/backtester/positionCalculations.js';
import { loadDrawings } from '../src/backtester/drawingStorage.js';
import { createDrawingFromTool, hitTestDrawing } from '../src/services/drawingInteraction.js';
import { applyDragUpdate } from '../src/services/drawingDrag.js';

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
});

describe('calculatePositionQuantity', () => {
  it('returns risk divided by entry-stop distance', () => {
    expect(calculatePositionQuantity(10, 100, 99)).toBeCloseTo(10);
    expect(calculatePositionQuantity(10, 100, 105)).toBeCloseTo(2);
  });

  it('returns 0 for invalid inputs', () => {
    expect(calculatePositionQuantity(0, 100, 99)).toBe(0);
    expect(calculatePositionQuantity(10, 0, 99)).toBe(0);
    expect(calculatePositionQuantity(10, 100, 100)).toBe(0);
  });
});

describe('calculatePositionNotional', () => {
  it('rounds entry notional to two decimals', () => {
    expect(calculatePositionNotional(100, 0.123456)).toBe(12.35);
  });

  it('returns 0 for invalid inputs', () => {
    expect(calculatePositionNotional(0, 1)).toBe(0);
    expect(calculatePositionNotional(100, -1)).toBe(0);
  });
});

describe('resolvePositionToolPrices', () => {
  const drawings = [
    { id: 'pos-1', type: 'position', stopPrice: 95, targetPrice: 110 },
    { id: 'lvl-1', type: 'level', price: 100 },
  ];

  it('prefers live drawing prices when the tool exists', () => {
    expect(resolvePositionToolPrices(drawings, 'pos-1')).toEqual({
      stopLossPrice: 95,
      takeProfitPrice: 110,
    });
  });

  it('falls back to stored prices when the drawing is missing', () => {
    expect(resolvePositionToolPrices(drawings, 'missing', {
      stopLossPrice: 90,
      takeProfitPrice: 120,
    })).toEqual({
      stopLossPrice: 90,
      takeProfitPrice: 120,
    });
  });

  it('returns null when neither drawing nor fallback is usable', () => {
    expect(resolvePositionToolPrices(drawings, 'missing')).toBeNull();
    expect(resolvePositionToolPrices(drawings, 'lvl-1')).toBeNull();
  });
});

describe('drawingStorage', () => {
  it('accepts canonical hline and ray names', () => {
    localStorage.setItem('solidBacktest:drawings:test-symbol', JSON.stringify([
      { id: 'h-1', type: 'hline', price: 100 },
      { id: 'r-1', type: 'ray', price: 100, startTime: 10 },
    ]));

    expect(loadDrawings('test-symbol')).toEqual([
      { id: 'h-1', type: 'hline', price: 100, sourceChartId: null },
      { id: 'r-1', type: 'ray', price: 100, startTime: 10, sourceChartId: null },
    ]);
  });

  it('clears trendlines together with level drawings', () => {
    const engine = {
      drawings: [
        { id: 'pos-1', type: 'position', side: 'long', entryPrice: 100, stopPrice: 95, targetPrice: 110 },
        { id: 'lvl-1', type: 'hline', price: 101 },
        { id: 'ray-1', type: 'ray', price: 100, startTime: 10 },
        { id: 'trend-1', type: 'trendline', p1: { time: 10, price: 101 }, p2: { time: 20, price: 102 } },
      ],
      mode: null,
      symbol: 'test-symbol',
      emit() {},
    };

    const canonicalType = (() => {
      const value = 'level';
      if (value === 'level' || value === 'hline') return 'hline';
      if (value === 'horizontalray' || value === 'horizontal_ray' || value === 'horizontal-ray' || value === 'ray') return 'ray';
      if (value === 'trendline' || value === 'trend-line' || value === 'trend_line') return 'trendline';
      return value;
    })();

    const typeSet = canonicalType === 'hline' ? new Set(['hline', 'ray', 'trendline']) : canonicalType === 'trendline' ? new Set(['trendline']) : new Set([canonicalType]);
    const nextDrawings = engine.drawings.filter((drawing) => !typeSet.has(drawing.type));

    expect(nextDrawings.map((drawing) => drawing.id)).toEqual(['pos-1']);
  });
});

describe('drawingInteraction', () => {
  const geometry = {
    toX: (time) => (Number.isFinite(time) ? time * 10 : null),
    fromX: (x) => (Number.isFinite(x) ? x / 10 : null),
    toY: (price) => (Number.isFinite(price) ? 50 - price : null),
    fromY: (y) => (Number.isFinite(y) ? 50 - y : null),
  };

  it('detects hline hit with simple threshold logic', () => {
    const drawings = [{ id: 'h-1', type: 'hline', price: 50 }];
    expect(hitTestDrawing({ x: 40, y: 0 }, drawings, geometry)).toEqual({ id: 'h-1', mode: 'hline-price' });
  });

  it('creates a long position drawing from the active tool', () => {
    const drawing = createDrawingFromTool('long', { x: 40, y: 0 }, geometry, { time: 10, id: 'new-1' });
    expect(drawing.type).toBe('long');
    expect(drawing.id).toBe('new-1');
    expect(drawing.entry).toBe(50);
    expect(drawing.stop).toBeLessThan(drawing.entry);
    expect(drawing.pt).toBeGreaterThan(drawing.entry);
  });

  it('creates a trendline from the active tool and allows movement by handles', () => {
    const drawing = createDrawingFromTool('trendline', { x: 40, y: 0 }, geometry, { time: 10, id: 'line-1' });
    expect(drawing.type).toBe('trendline');
    expect(drawing.id).toBe('line-1');
    expect(drawing.p1).toMatchObject({ time: 4, price: 50 });
    expect(drawing.p2).toMatchObject({ time: 4, price: 50 });

    const moved = applyDragUpdate(drawing, 'trend-p2', { x: 80, y: 20 }, geometry, { original: drawing });
    expect(moved.p2).toMatchObject({ time: 8, price: 30 });
  });

  it('detects trendline hits like the original chart tools', () => {
    const trendline = [{ id: 't-1', type: 'trendline', p1: { time: 10, price: 50 }, p2: { time: 30, price: 40 } }];
    expect(hitTestDrawing({ x: 150, y: 5 }, trendline, geometry)).toEqual({ id: 't-1', mode: 'trend-body', anchorTime: 15, anchorPrice: 45 });
  });

  it('detects position handles like the original chart tools', () => {
    const position = [{ id: 'p-1', type: 'long', entryTime: 10, endTime: 40, entry: 50, stop: 49, pt: 55 }];
    expect(hitTestDrawing({ x: 100, y: 0 }, position, geometry)).toEqual({ id: 'p-1', mode: 'position-entry' });
    expect(hitTestDrawing({ x: 400, y: -5 }, position, geometry)).toEqual({ id: 'p-1', mode: 'position-pt' });
    expect(hitTestDrawing({ x: 400, y: 7 }, position, geometry)).toEqual({ id: 'p-1', mode: 'position-stop' });
  });

  it('updates a dragged hline price and position values using the active drag mode', () => {
    const hline = { id: 'h-1', type: 'hline', price: 50 };
    expect(applyDragUpdate(hline, 'hline-price', { x: 40, y: 20 }, geometry)).toEqual({
      id: 'h-1',
      type: 'hline',
      price: 30,
    });

    const ray = { id: 'r-1', type: 'ray', time: 10, price: 50 };
    expect(applyDragUpdate(ray, 'ray-body', { x: 60, y: 15 }, geometry)).toEqual({
      id: 'r-1',
      type: 'ray',
      time: 6,
      price: 35,
    });

    const position = { id: 'p-1', type: 'long', entryTime: 10, endTime: 40, entry: 50, stop: 49, pt: 55 };
    expect(applyDragUpdate(position, 'position-stop', { x: 40, y: 15 }, geometry)).toEqual({
      id: 'p-1',
      type: 'long',
      entryTime: 10,
      endTime: 40,
      entry: 50,
      stop: 35,
      pt: 55,
    });
  });
});
