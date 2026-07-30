import { BINANCE_FAPI_BASE, KLINES_PAGE_LIMIT } from './config.js';

/**
 * List every tradable USDT-margined perpetual future on Binance.
 * Returns [{ symbol, baseAsset, quoteAsset }]
 */
export async function fetchFuturesSymbols() {
  const res = await fetch(`${BINANCE_FAPI_BASE}/fapi/v1/exchangeInfo`);
  if (!res.ok) throw new Error(`exchangeInfo HTTP ${res.status}`);
  const data = await res.json();
  return data.symbols
    .filter((s) => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
    .map((s) => ({ symbol: s.symbol, baseAsset: s.baseAsset, quoteAsset: s.quoteAsset }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Fetch one page of klines and normalise it into
 * { time (unix seconds), open, high, low, close, volume }.
 * Pass either { endTime } to page backwards or { startTime } to page forwards.
 */
export async function fetchKlines(symbol, interval, { startTime, endTime, limit = KLINES_PAGE_LIMIT } = {}) {
  const params = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (startTime != null) params.set('startTime', String(Math.round(startTime)));
  if (endTime != null) params.set('endTime', String(Math.round(endTime)));

  const res = await fetch(`${BINANCE_FAPI_BASE}/fapi/v1/klines?${params.toString()}`);
  if (!res.ok) throw new Error(`klines HTTP ${res.status} for ${symbol} ${interval}`);
  const rows = await res.json();
  return rows.map((r) => ({
    time: Math.round(r[0] / 1000),
    open: parseFloat(r[1]),
    high: parseFloat(r[2]),
    low: parseFloat(r[3]),
    close: parseFloat(r[4]),
    volume: parseFloat(r[5]),
  }));
}
