export const OFFLINE_SYMBOLS = [
  'TRADOORUSDT', 'LABUSDT', 'VELVETUSDT', 'BILLUSDT', 'BANKUSDT',
  'ESPORTSUSDT', 'RIVERUSDT', 'RAVEUSDT', 'AAVEUSDT', 'JTOUSDT',
  'XPLUSDT', 'INJUSDT', 'FIDAUSDT', 'EDENUSDT', 'BEATUSDT',
  'FARTCOINUSDT', 'AEROUSDT', 'UBUSDT', 'NEARUSDT', 'AKEUSDT',
  'WLDUSDT', 'ALLOUSDT', 'BTCUSDT', 'ETHUSDT',
];

export const OFFLINE_INTERVALS = ['5m', '1h', '1d'];
export const OFFLINE_PACKAGE_URL = '/historical-data';
export const OFFLINE_SCHEMA_VERSION = 1;
export const OFFLINE_DEFAULT_MODE = 'local';

export const OFFLINE_MODES = Object.freeze({
  LOCAL: 'local',
  ONLINE: 'online',
});