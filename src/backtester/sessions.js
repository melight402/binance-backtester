import { SESSIONS } from './config.js';

function hourInWindow(hour, startHour, endHour) {
  return endHour > startHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour; // wrap-around window, future-proofing
}

/**
 * Builds a single HistogramSeries dataset that shades Asia/New-York session
 * hours. Histogram bars are discrete per data point (no interpolation like a
 * Line/Area series would do), so every candle gets its own solid 0-or-1-height
 * column - exactly the crisp rectangular bands seen on real trading terminals.
 * Paired with a dedicated, hidden, zero-margin price scale, a bar of value 1
 * fills the full pane height and value 0 is invisible.
 *
 * @param {{time:number}[]} candles
 * @returns {{time:number, value:number, color?:string}[]}
 */
export function buildSessionSeriesData(candles) {
  const { asia, newyork } = SESSIONS;
  return candles.map((c) => {
    const hour = new Date(c.time * 1000).getUTCHours();
    if (hourInWindow(hour, asia.startHour, asia.endHour)) {
      return { time: c.time, value: 1, color: asia.color };
    }
    if (hourInWindow(hour, newyork.startHour, newyork.endHour)) {
      return { time: c.time, value: 1, color: newyork.color };
    }
    return { time: c.time, value: 0 };
  });
}
