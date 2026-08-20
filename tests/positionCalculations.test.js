import { describe, expect, it } from 'vitest';
import {
  calculatePositionNotional,
  calculatePositionQuantity,
  resolvePositionToolPrices,
} from '../src/backtester/positionCalculations.js';

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
