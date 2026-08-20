import { calculateRiskDistance, roundDownToStep, roundToTick } from './risk.js';

export function calculatePositionQuantity(riskUsdt, entryPrice, stopLossPrice, stepSize) {
  const risk = Number(riskUsdt);
  const entry = Number(entryPrice);
  const stop = Number(stopLossPrice);
  const distance = Math.abs(calculateRiskDistance('long', entry, stop)) || Math.abs(entry - stop);
  if (!(risk > 0) || !(entry > 0) || !(stop > 0) || !(distance > 0)) return 0;
  return roundDownToStep(risk / distance, stepSize);
}

export function calculatePositionNotional(entryPrice, quantity) {
  const entry = Number(entryPrice);
  const amount = Number(quantity);
  if (!(entry > 0) || !(amount > 0)) return 0;
  return Math.round(entry * amount * 100) / 100;
}

export function normalizePositionPrices(entryPrice, stopLossPrice, takeProfitPrice, tickSize) {
  return {
    entryPrice: roundToTick(entryPrice, tickSize),
    stopLossPrice: roundToTick(stopLossPrice, tickSize),
    takeProfitPrice: roundToTick(takeProfitPrice, tickSize),
  };
}

export function resolvePositionToolPrices(drawings, lineToolId, fallback = null) {
  const drawing = (drawings || []).find((item) => item.type === 'position' && item.id === lineToolId);
  if (drawing) {
    return { stopLossPrice: drawing.stopPrice, takeProfitPrice: drawing.targetPrice };
  }
  const stopLossPrice = Number(fallback?.stopLossPrice);
  const takeProfitPrice = Number(fallback?.takeProfitPrice);
  if (Number.isFinite(stopLossPrice) && Number.isFinite(takeProfitPrice)) {
    return { stopLossPrice, takeProfitPrice };
  }
  return null;
}
