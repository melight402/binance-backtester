function positiveNumber(value) {
  const number = Number(value);
  return number > 0 && Number.isFinite(number) ? number : 0;
}

export function roundDownToStep(value, step) {
  const amount = positiveNumber(value);
  const increment = positiveNumber(step);
  if (!amount) return 0;
  if (!increment) return amount;
  return Math.floor((amount + Number.EPSILON) / increment) * increment;
}

export function roundToTick(value, tickSize) {
  const price = positiveNumber(value);
  const tick = positiveNumber(tickSize);
  if (!price || !tick) return price;
  return Math.round((price + Number.EPSILON) / tick) * tick;
}

export function calculateRiskDistance(side, entryPrice, stopLossPrice) {
  const entry = positiveNumber(entryPrice);
  const stop = positiveNumber(stopLossPrice);
  if (!entry || !stop) return 0;
  const distance = side === 'short' ? stop - entry : entry - stop;
  return distance > 0 ? distance : 0;
}

export function calculateRewardDistance(side, entryPrice, takeProfitPrice) {
  const entry = positiveNumber(entryPrice);
  const target = positiveNumber(takeProfitPrice);
  if (!entry || !target) return 0;
  const distance = side === 'short' ? entry - target : target - entry;
  return distance > 0 ? distance : 0;
}

export function calculateRiskReward(side, entryPrice, stopLossPrice, takeProfitPrice) {
  const risk = calculateRiskDistance(side, entryPrice, stopLossPrice);
  const reward = calculateRewardDistance(side, entryPrice, takeProfitPrice);
  return risk > 0 && reward > 0 ? reward / risk : 0;
}