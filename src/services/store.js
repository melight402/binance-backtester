// # Глобальное состояние (вместо React Context)
// # Реактивные сигналы плеера (время, скорость, пара)// src/services/store.js
import { createSignal } from 'solid-js';

// 1. ГЛОБАЛЬНЫЕ СИГНАЛЫ (СОСТОЯНИЕ ИНТЕРФЕЙСА)
export const [currentPair, setCurrentPair] = createSignal('BTCUSDT');
export const [timeframe, setTimeframe] = createSignal('1h');
export const [isPlaying, setIsPlaying] = createSignal(false);
export const [showSidebar, setShowSidebar] = createSignal(true);
export const [showSubCharts, setShowSubCharts] = createSignal(true);
export const [selectedStartTime, setSelectedStartTime] = createSignal(null);
export const [positionSettings, setPositionSettings] = createSignal({ rr: 2, riskUsdt: 10 });

// 2. ГЛОБАЛЬНЫЕ СИГНАЛЫ (ДАННЫЕ СВЕЧЕЙ)
export const [mainCandles, setMainCandles] = createSignal([]);
export const [hourlyCandles, setHourlyCandles] = createSignal([]);
export const [dailyCandles, setDailyCandles] = createSignal([]);
export const [dataStatus, setDataStatus] = createSignal('idle');
export const [dataError, setDataError] = createSignal(null);

// 3. ДОПОЛНИТЕЛЬНЫЕ СОСТОЯНИЯ (НАПРИМЕР, ДЛЯ РЕЖИМОВ РИСОВАНИЯ ИЗ БЭКТЕСТЕРА)
export const [activeTool, setActiveTool] = createSignal(null); // 'long', 'short', 'level' или null
export const [simulationSpeed, setSimulationSpeed] = createSignal(1); // скорость воспроизведения
export const [clearDrawingsVersion, setClearDrawingsVersion] = createSignal(0);
export const [drawings, setDrawings] = createSignal([]);
export const [selectedDrawingId, setSelectedDrawingId] = createSignal(null);
export const [tvxValue, setTvxValue] = createSignal('level_breakout');
export const [maSettings, setMaSettings] = createSignal({
	hma50: { visible: true, period: 50 },
	hma200: { visible: true, period: 200 },
	sessions: true,
});
