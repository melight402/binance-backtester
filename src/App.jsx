// src/App.jsx
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';

// Импортируем будущие UI-компоненты
import { Header } from './components/Header.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { ChartWrapper } from './components/ChartWrapper.jsx';
import {
  currentPair,
  setCurrentPair,
  timeframe,
  setTimeframe,
  isPlaying,
  setIsPlaying,
  showSidebar,
  setShowSidebar,
  showSubCharts,
  setShowSubCharts,
  selectedStartTime,
  setSelectedStartTime,
  positionSettings,
  setPositionSettings,
  mainCandles,
  setMainCandles,
  hourlyCandles,
  setHourlyCandles,
  dailyCandles,
  setDailyCandles,
  dataStatus,
  dataError,
  setDataStatus,
  setDataError,
  simulationSpeed,
  setSimulationSpeed,
  setClearDrawingsVersion,
  setActiveTool,
  setDrawings,
  drawings,
  selectedDrawingId,
  setSelectedDrawingId,
  tvxValue,
  setTvxValue,
  maSettings,
  setMaSettings,
} from './services/store.js';

// Импортируем менеджер данных из вашего бэктестера
import { dataManager } from './backtester/dataManager.js';
import { loadIndicatorSettings, saveIndicatorSettings } from './backtester/indicatorStorage.js';
import { loadAppSettings, saveAppSettings } from './backtester/appSettingsStorage.js';
import { loadTvxValue, saveTvxValue } from './backtester/tvxStorage.js';

export function App() {
  const [indicatorSettingsHydrated, setIndicatorSettingsHydrated] = createSignal(false);
  const [appSettingsHydrated, setAppSettingsHydrated] = createSignal(false);

  createEffect(() => {
    const settings = maSettings();
    if (indicatorSettingsHydrated()) saveIndicatorSettings(settings);
  });

  createEffect(() => {
    if (!appSettingsHydrated()) return;
    saveAppSettings({
      symbol: currentPair(),
      timeframe: timeframe(),
      speed: simulationSpeed(),
      sidebarOpen: showSidebar(),
      subChartsOpen: showSubCharts(),
      startTime: selectedStartTime(),
      ...positionSettings(),
    });
  });

  createEffect(() => {
    if (!appSettingsHydrated()) return;
    saveTvxValue(tvxValue());
  });

  // Store is the single reactive bridge between the engine and Solid components.
  onMount(() => {
    const savedAppSettings = loadAppSettings();
    setCurrentPair(savedAppSettings.symbol);
    setTimeframe(savedAppSettings.timeframe);
    setSimulationSpeed(savedAppSettings.speed);
    setShowSidebar(savedAppSettings.sidebarOpen);
    setShowSubCharts(savedAppSettings.subChartsOpen);
    setSelectedStartTime(savedAppSettings.startTime);
    setPositionSettings({ rr: savedAppSettings.rr, riskUsdt: savedAppSettings.riskUsdt });
    setTvxValue(loadTvxValue());
    setAppSettingsHydrated(true);
    setMaSettings(loadIndicatorSettings());
    setIndicatorSettingsHydrated(true);
    const unsubscribe = dataManager.onDataUpdate((state) => {
      setCurrentPair(state.symbol);
      setTimeframe(state.interval);
      setIsPlaying(state.isPlaying);
      setSimulationSpeed(state.speed);
      setSelectedStartTime(state.simTime);
      setClearDrawingsVersion(state.clearDrawingsVersion);
      setActiveTool(state.mode);
      setDrawings(state.drawings);
      setMainCandles(state.main);
      setHourlyCandles(state.hourly);
      setDailyCandles(state.daily);
      setDataStatus(state.dataStatus);
      setDataError(state.dataError);
      if (!state.drawings.some((drawing) => drawing.id === selectedDrawingId())) {
        setSelectedDrawingId(null);
      }
    });

    dataManager.init({ symbol: currentPair(), interval: timeframe(), startTime: selectedStartTime() });
    dataManager.setSpeed(savedAppSettings.speed);

    const handleDeleteKey = (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return;
      }
      event.preventDefault();
      const drawingId = selectedDrawingId();
      if (drawingId && dataManager.removeDrawing(drawingId)) {
        setSelectedDrawingId(null);
      }
    };
    window.addEventListener('keydown', handleDeleteKey);

    onCleanup(() => {
      window.removeEventListener('keydown', handleDeleteKey);
      unsubscribe();
      dataManager.dispose();
    });
  });

  // 3. ФУНКЦИИ УПРАВЛЕНИЯ ПЛЕЕРОМ
  const handleTogglePlay = () => {
    const nextState = !isPlaying();
    if (nextState) {
      dataManager.startSimulation(); // Метод из вашего движка бэктестера
    } else {
      dataManager.pauseSimulation();
    }
  };

  const handlePairChange = (newPair) => {
    dataManager.changeSymbol(newPair); // Метод смены торговой пары из бэктестера
  };

  const handleTimeframeChange = (newTf) => {
    dataManager.changeTimeframe(newTf); // Метод смены основного таймфрейма
  };

  // 4. РЕНДЕРИНГ ИНТЕРФЕЙСА (Сетка из global.css)
  return (
    <div class="terminal-layout">
      {/* Шапка управления терминалом */}
      <Header 
        pair={currentPair()} 
        timeframe={timeframe()} 
        isPlaying={isPlaying()} 
        onTogglePlay={handleTogglePlay}
        onTimeframeChange={handleTimeframeChange}
        onToggleSidebar={() => setShowSidebar(!showSidebar())}
        isSidebarOpen={showSidebar()}
      />

      <main class="terminal-body">
        {/* Рабочая область с 3 графиками Canvas */}
        <div class="charts-workspace">
          {dataStatus() === 'loading' && (
            <div class="data-loading" role="status">Загрузка рыночных данных...</div>
          )}
          {dataError() && (
            <div class="data-error" role="alert">
              Binance: {dataError().message}
            </div>
          )}
          
          {/* Верхний большой график (основной таймфрейм) */}
          <div class="main-chart-row">
            <ChartWrapper 
              type="main" 
              pair={currentPair()} 
              timeframe={timeframe()} 
              candles={mainCandles()} 
              drawings={drawings()}
              onToolUsed={() => dataManager.setMode(null)}
              onDrawingCreated={(drawing) => dataManager.addDrawing(drawing)}
              onDrawingModified={(id, options) => dataManager.updateDrawing(id, options)}
              onDrawingSelected={setSelectedDrawingId}
              maSettings={maSettings()}
              positionSettings={positionSettings()}
            />
          </div>

          {/* Нижний ряд с двумя вспомогательными графиками */}
          <Show when={appSettingsHydrated() && showSubCharts()}>
            <div class="sub-charts-row">
              <ChartWrapper 
                type="1h" 
                pair={currentPair()} 
                timeframe="1h" 
                candles={hourlyCandles()} 
                drawings={drawings()}
                maSettings={maSettings()}
                positionSettings={positionSettings()}
              />
              <ChartWrapper 
                type="1d" 
                pair={currentPair()} 
                timeframe="1d" 
                candles={dailyCandles()} 
                drawings={drawings()}
                maSettings={{ ...maSettings(), sessions: false }}
                positionSettings={positionSettings()}
              />
            </div>
          </Show>

        </div>

        <Show when={appSettingsHydrated() && showSidebar()}>
          <div class="terminal-sidebar">
            <Sidebar 
              activePair={currentPair()} 
              onSelectPair={handlePairChange} 
            />
          </div>
        </Show>
      </main>
    </div>
  );
}
