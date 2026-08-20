import { DEFAULT_TVX_VALUE, TVX_OPTIONS } from '../constants/tvxOptions.js';
import { readStorage, removeStorage, writeStorage } from '../services/storage.js';

const TVX_VALUE_KEY = 'tradingFront_tvxValue';
const validValues = new Set(TVX_OPTIONS.map((option) => option.value));

export function loadTvxValue() {
  const value = readStorage(TVX_VALUE_KEY);
  return value && validValues.has(value) ? value : DEFAULT_TVX_VALUE;
}

export function saveTvxValue(value) {
  if (value && validValues.has(value)) writeStorage(TVX_VALUE_KEY, value);
  else removeStorage(TVX_VALUE_KEY);
}
