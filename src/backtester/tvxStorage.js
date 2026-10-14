import { DEFAULT_TVX_VALUE } from '../constants/tvxOptions.js';
import { readStorage, removeStorage, writeStorage } from '../services/storage.js';

const TVX_VALUE_KEY = 'tradingFront_tvxValue';
export function loadTvxValue() {
  const value = readStorage(TVX_VALUE_KEY);
  return value || DEFAULT_TVX_VALUE;
}

export function saveTvxValue(value) {
  if (value) writeStorage(TVX_VALUE_KEY, value);
  else removeStorage(TVX_VALUE_KEY);
}

export async function fetchTvxOptions() {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
  const response = await fetch(`${baseUrl}/strategies`);
  if (!response.ok) throw new Error(`Failed to fetch strategies: ${response.statusText}`);
  const data = await response.json();
  return data.strategies || [];
}
