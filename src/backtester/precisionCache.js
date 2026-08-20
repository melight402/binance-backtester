import { fetchFuturesExchangeInfo } from './binanceApi.js';

let precisionBySymbol = null;
let precisionLoadedAt = 0;
const PRECISION_TTL_MS = 5 * 60 * 1000;

function readFilter(filters, filterType, field) {
  const filter = filters?.find((item) => item.filterType === filterType);
  const value = Number(filter?.[field]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function getSymbolPrecision(symbol, options) {
  if (!precisionBySymbol || Date.now() - precisionLoadedAt >= PRECISION_TTL_MS) {
    const data = await fetchFuturesExchangeInfo(options);
    precisionBySymbol = new Map(
      data.symbols.map((item) => [item.symbol, {
        stepSize: readFilter(item.filters, 'LOT_SIZE', 'stepSize'),
        tickSize: readFilter(item.filters, 'PRICE_FILTER', 'tickSize'),
      }]),
    );
    precisionLoadedAt = Date.now();
  }
  return precisionBySymbol.get(symbol) || null;
}

export function clearPrecisionCache() {
  precisionBySymbol = null;
  precisionLoadedAt = 0;
}