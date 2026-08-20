# Solid Backtest

SolidJS history backtester with three synchronized chart panels.

## Architecture

- `src/backtester/engine.js` owns simulation time, loading, aggregation, and drawings.
- `src/backtester/dataManager.js` provides candle normalization, cache paging, and request cancellation.
- `src/backtester/risk.js` and `src/backtester/positionCalculations.js` contain pure position sizing and precision logic.
- `src/chart/chartAdapter.js` and `src/chart/drawingAdapter.js` isolate chart and drawing contracts from Solid components.
- `src/services/store.js` is the serializable reactive bridge for Solid components.
- `src/services/storage.js` is the only local persistence boundary.
- `src/chartFactory.js` owns the chart library instance and drawing overlays.
- `src/services/positionApi.js` owns multipart position requests and timeout/error normalization.

Components call engine commands or update store state. They do not own playback timers, Binance requests, or chart lifecycle.

The engine API is `initialize`, `changeSymbol`, `changeTimeframe`, `seek`, `setSpeed`, `play`, `pause`, `subscribe`, and `dispose`. Internal market time is Unix seconds; browser date inputs and backend payloads use UTC ISO strings only at the boundary.

## Configuration

The frontend uses Binance Futures public endpoints through the existing market API. Set `VITE_API_URL` when the position backend is not available at `http://localhost:3001/api`.

The backend must expose `/api/positions/history/open`, `/api/positions/history/close`, and `/api/screenshots/upload`. Position screenshots are PNG multipart uploads and are limited by the backend to 10 MB.

Binance can reject requests because of rate limits, regional restrictions, or unavailable symbols. Those failures remain visible in the UI. The backtester uses Unix seconds internally and converts to UTC `Date` values only for browser inputs and API payloads.

## Persistence

- `solidBacktest:appSettings` stores symbol, timeframe, playback, sidebar, start time, and risk settings.
- `solidBacktest:indicatorSettings` stores HMA periods/visibility and sessions visibility.
- `solidBacktest:drawings:<symbol>` stores synchronized drawing tools.
- `solidBacktest:chartState:<symbol>:<interval>:<type>` stores visible chart ranges.
- `lastOpenPosition_<symbol>` stores the local position reference used by close workflow.

Malformed storage entries are ignored and replaced by defaults or empty state.

## Troubleshooting

If the position backend is stopped, opening and closing report `Position backend is unavailable` and clear their loading state. If a request becomes obsolete because the symbol changes or the component unmounts, it is cancelled and its result is ignored.

The project currently has no lint script. Dependency installation, build, tests, and browser acceptance checks are intentionally tracked separately in `MIGRATION_STATUS.md`.

## Verification phase

After the code migration is accepted, run dependency installation, build, unit tests, and browser acceptance in that order. Do not treat a successful build as proof of chart lifecycle correctness: verify symbol changes, reload persistence, playback cancellation, three-panel synchronization, drawing tools, screenshot capture, and backend-unavailable recovery.