// src/components/Header.jsx
import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { isPlaying, setIsPlaying, timeframe, setTimeframe, currentPair, showSidebar, setShowSidebar, showSubCharts, setShowSubCharts, simulationSpeed, setSimulationSpeed, activeTool, setActiveTool, maSettings, setMaSettings, selectedStartTime, setSelectedStartTime, positionSettings, setPositionSettings, drawings, selectedDrawingId, setSelectedDrawingId, tvxValue, setTvxValue } from '../services/store.js';
import { TVX_OPTIONS } from '../constants/tvxOptions.js';
import { TOP_TIMEFRAME_OPTIONS } from '../backtester/config.js';
import { dataManager } from '../backtester/dataManager.js';
import { calculatePositionNotional, calculatePositionQuantity, normalizePositionPrices, resolvePositionToolPrices } from '../backtester/positionCalculations.js';
import { getSymbolPrecision } from '../backtester/precisionCache.js';
import { roundToTick } from '../backtester/risk.js';
import { captureScreenshot } from '../services/screenshot.js';
import { closeHistoryPosition, openHistoryPosition } from '../services/positionApi.js';
import { readJson, removeStorage, writeJson } from '../services/storage.js';
import { HeaderDropdown } from './HeaderDropdown.jsx';

export function Header() {
  const [positionStatus, setPositionStatus] = createSignal(null);
  const [clearPositions, setClearPositions] = createSignal(true);
  const [isOpeningPosition, setIsOpeningPosition] = createSignal(false);
  const [isClosingPosition, setIsClosingPosition] = createSignal(false);
  const [profitLoss, setProfitLoss] = createSignal('profit');
  const [tradeNote, setTradeNote] = createSignal('');
  let workflowController = null;

  const cancelWorkflow = () => {
    workflowController?.abort();
    workflowController = null;
  };

  createEffect(() => {
    currentPair();
    cancelWorkflow();
    setPositionStatus(null);
  });

  onCleanup(cancelWorkflow);

  onMount(() => {
    const handleSpaceKey = (event) => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement
        || target instanceof HTMLTextAreaElement || target.isContentEditable
        || target instanceof HTMLButtonElement) return;
      event.preventDefault();
      togglePlay();
    };

    window.addEventListener('keydown', handleSpaceKey);
    onCleanup(() => window.removeEventListener('keydown', handleSpaceKey));
  });
  
  // 1. Управление плеером симуляции
  const togglePlay = () => {
    const nextState = !isPlaying();
    setIsPlaying(nextState);
    if (nextState) {
      dataManager.startSimulation();
    } else {
      dataManager.pauseSimulation();
    }
  };

  // 2. Изменение таймфрейма основного графика
  const handleTimeframeChange = (e) => {
    const newTf = e.target.value;
    setTimeframe(newTf);
    dataManager.changeTimeframe(newTf);
  };

  // 3. Изменение скорости воспроизведения
  const handleSpeedChange = (e) => {
    const speed = parseFloat(e.target.value);
    setSimulationSpeed(speed);
    dataManager.setSpeed(speed);
  };

  // 4. Переключение инструментов рисования (Long / Short / Уровни)
  const toggleTool = (toolName) => {
    if (activeTool() === toolName) {
      setActiveTool(null);
      dataManager.setMode(null); // Сбрасываем режим в движке бэктестера
    } else {
      setActiveTool(toolName);
      dataManager.setMode(toolName); // 'long', 'short' или 'level'
    }
  };

  // 5. Очистка выбранного типа рисунков текущей котировки
  const handleClearSelectedType = () => {
    dataManager.clearDrawingsByType(clearPositions() ? 'position' : 'level');
    setSelectedDrawingId(null);
  };

  const handleDeleteSelected = () => {
    const drawingId = selectedDrawingId();
    if (!drawingId) {
      setPositionStatus({ type: 'error', text: 'Выберите уровень или позицию на графике' });
      return;
    }
    if (dataManager.removeDrawing(drawingId)) {
      setSelectedDrawingId(null);
      setPositionStatus(null);
    }
  };

  // 6. Обработка выбора даты в календаре
  const handleDateChange = (e) => {
    const selectedDate = e.target.value; // формат YYYY-MM-DDTHH:mm
    if (selectedDate) {
      const timestamp = new Date(selectedDate + "Z").getTime(); // Переводим в UTC timestamp
      dataManager.setStartTime(timestamp);
      setSelectedStartTime(timestamp / 1000);
    }
  };

  const updateMa = (key, patch) => {
    setMaSettings({ ...maSettings(), [key]: { ...maSettings()[key], ...patch } });
  };

  const updatePosition = (key, value) => {
    const limits = key === 'riskUsdt'
        ? { min: 0.01, max: 1000000 }
        : { min: 0.1, max: 20 };
    const fallback = key === 'riskUsdt' ? 10 : limits.min;
    const nextValue = Math.max(limits.min, Math.min(limits.max, Number(value) || fallback));
    setPositionSettings({ ...positionSettings(), [key]: nextValue });
  };

  const indicatorSummary = () => {
    const settings = maSettings();
    const active = ['hma50', 'hma200'].filter((key) => settings[key].visible);
    const parts = active.map((key) => `${key.toUpperCase()} ${settings[key].period}`);
    if (settings.sessions) parts.push('Sessions');
    return parts.length ? parts.join(' · ') : 'Off';
  };

  const riskSummary = () => {
    const settings = positionSettings();
    return `${settings.riskUsdt} USDT · ${settings.rr}R`;
  };

  const timeframeLabel = (value) => ({
    '1m': '1 мин',
    '3m': '3 мин',
    '5m': '5 мин',
    '15m': '15 мин',
    '30m': '30 мин',
    '1h': '1 час',
    '4h': '4 часа',
    '1d': '1 день',
    '1w': '1 неделя',
    '1M': '1 месяц',
  }[value] || value);

  const openLatestPosition = async () => {
    const drawing = [...drawings()].reverse().find((item) => item.type === 'position');
    if (!drawing) {
      setPositionStatus({ type: 'error', text: 'Сначала создайте Long или Short на графике' });
      return;
    }
    setIsOpeningPosition(true);
    setPositionStatus(null);
    cancelWorkflow();
    workflowController = new AbortController();
    let precision;
    try {
      precision = await getSymbolPrecision(currentPair(), { signal: workflowController.signal });
      const prices = normalizePositionPrices(drawing.entryPrice, drawing.stopPrice, drawing.targetPrice, precision?.tickSize);
      const quantity = calculatePositionQuantity(positionSettings().riskUsdt, prices.entryPrice, prices.stopLossPrice, precision?.stepSize);
      if (!(quantity > 0)) {
        setPositionStatus({ type: 'error', text: 'Невозможно рассчитать размер позиции' });
        return;
      }
      const screenshot = await captureScreenshot();
      const positionData = {
        dateTime: selectedStartTime() ? new Date(selectedStartTime() * 1000).toISOString() : new Date().toISOString(),
        positionSide: drawing.side === 'long' ? 'LONG' : 'SHORT',
        timeframe: timeframe(),
        price: prices.entryPrice,
        quantity,
        positionUsdt: calculatePositionNotional(prices.entryPrice, quantity),
        stopLossPrice: prices.stopLossPrice,
        takeProfitPrice: prices.takeProfitPrice,
        symbol: currentPair(),
        risk: positionSettings().riskUsdt,
        tvx: tvxValue(),
        lineToolId: drawing.id || null,
      };
      await openHistoryPosition(positionData, screenshot, undefined, workflowController.signal);
      writeJson(`lastOpenPosition_${currentPair()}`, positionData);
      setPositionStatus({ type: 'success', text: 'Позиция открыта' });
    } catch (error) {
      if (error.name !== 'AbortError' && error.message !== 'Position API request was cancelled') {
        setPositionStatus({ type: 'error', text: error.message });
      }
    } finally {
      setIsOpeningPosition(false);
      workflowController = null;
    }
  };

  const closeOpenPosition = async () => {
    const outcome = profitLoss();
    if (!outcome) {
      setPositionStatus({ type: 'error', text: 'Выберите прибыль или убыток' });
      return;
    }

    const storageKey = `lastOpenPosition_${currentPair()}`;
    const lastOpenPositionData = readJson(storageKey);
    if (!lastOpenPositionData) {
      setPositionStatus({ type: 'error', text: 'Не найдена открытая позиция для этого символа' });
      return;
    }

    const positionData = lastOpenPositionData;

    if (!positionData.lineToolId) {
      setPositionStatus({ type: 'error', text: 'Не найден ID инструмента в данных позиции' });
      return;
    }

    const toolPrices = resolvePositionToolPrices(drawings(), positionData.lineToolId, {
      stopLossPrice: positionData.stopLossPrice,
      takeProfitPrice: positionData.takeProfitPrice,
    });
    if (!toolPrices) {
      setPositionStatus({ type: 'error', text: 'Не найден инструмент рисования на графике' });
      return;
    }

    setIsClosingPosition(true);
    setPositionStatus(null);
    cancelWorkflow();
    workflowController = new AbortController();
    try {
      let screenshot = null;
      try {
        screenshot = await captureScreenshot();
      } catch {
        const shouldContinue = window.confirm('Не удалось создать скриншот при закрытии. Продолжить закрытие позиции без скриншота?');
        if (!shouldContinue) return;
      }

      const precision = await getSymbolPrecision(currentPair(), { signal: workflowController.signal });

      const closeData = {
        symbol: positionData.symbol,
        lineToolId: positionData.lineToolId,
        dateTime: selectedStartTime() ? new Date(selectedStartTime() * 1000).toISOString() : new Date().toISOString(),
        profitLoss: outcome,
        stopLossPrice: roundToTick(toolPrices.stopLossPrice, precision?.tickSize),
        takeProfitPrice: roundToTick(toolPrices.takeProfitPrice, precision?.tickSize),
        note: tradeNote() || null,
      };

      await closeHistoryPosition(closeData, screenshot, undefined, workflowController.signal);
      removeStorage(storageKey);
      setSelectedDrawingId(null);
      setTradeNote('');
      setPositionStatus({
        type: 'success',
        text: `Позиция закрыта с ${outcome === 'profit' ? 'прибылью' : 'убытком'}`,
      });
    } catch (error) {
      if (error.name !== 'AbortError' && error.message !== 'Position API request was cancelled') {
        setPositionStatus({ type: 'error', text: error.message });
      }
    } finally {
      setIsClosingPosition(false);
      workflowController = null;
    }
  };

  return (
    <header class="terminal-header">
      <div class="terminal-header-inner">
      {/* Левая часть: Календарь и Выбор даты */}
      <div class="flex-row align-center" style={{ gap: '10px' }}>
        <input 
          type="datetime-local" 
          value={selectedStartTime() ? new Date(selectedStartTime() * 1000).toISOString().slice(0, 16) : ''}
          onChange={handleDateChange}
          style={{ cursor: 'pointer' }}
        />
      </div>

      {/* Кнопки Торговых инструментов (Long / Short / Уровень) */}
      <div class="flex-row align-center" style={{ gap: '6px' }}>
        <button 
          onClick={() => toggleTool('long')} 
          class={activeTool() === 'long' ? 'active' : ''}
          style={{ "background-color": activeTool() === 'long' ? '#00c853' : '#2a2e39' }}
        >
          🟢 Long
        </button>
        <button 
          onClick={() => toggleTool('short')} 
          class={activeTool() === 'short' ? 'active' : ''}
          style={{ "background-color": activeTool() === 'short' ? '#ff3d00' : '#2a2e39' }}
        >
          🔴 Short
        </button>
        <button 
          onClick={() => toggleTool('level')} 
          class={activeTool() === 'level' ? 'active' : ''}
          style={{ "background-color": activeTool() === 'level' ? '#2962ff' : '#2a2e39' }}
        >
          📍 Уровень
        </button>
        <button 
          onClick={handleDeleteSelected}
          style={{ "background-color": "#5d4037", "font-size": "12px" }}
          title="Удалить выбранный инструмент (Delete)"
        >
          ⌫ Удалить
        </button>
        <button 
          onClick={handleClearSelectedType}
          style={{ "background-color": "#b71c1c", "font-size": "12px" }}
          title={clearPositions() ? 'Удалить все позиции текущей котировки' : 'Удалить все горизонтальные уровни текущей котировки'}
        >
          🗑️ Очистить
        </button>
        <input
          type="checkbox"
          checked={!clearPositions()}
          onChange={(event) => setClearPositions(!event.currentTarget.checked)}
          title={clearPositions() ? 'Переключить на удаление горизонтальных уровней' : 'Переключить на удаление позиций'}
          aria-label="Тип рисунков для очистки"
        />
      </div>

      <div class="flex-row align-center" style={{ gap: '6px' }}>
        <label for="tvx-strategy" style={{ "font-size": "12px", color: '#848e9c' }}>Стратегия</label>
        <select
          id="tvx-strategy"
          value={tvxValue()}
          onChange={(e) => setTvxValue(e.currentTarget.value)}
          style={{ "max-width": "220px", "font-size": "12px" }}
        >
          {TVX_OPTIONS.map((option) => (
            <option value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <HeaderDropdown label="Indicators" title="HMA and sessions" summary={indicatorSummary}>
        <div class="header-dropdown-section">
          <div class="header-dropdown-section-title">Moving averages</div>
          {['hma50', 'hma200'].map((key) => (
            <label class="header-dropdown-row" for={`toggle-${key}`}>
              <span class="header-dropdown-row-label">{key.toUpperCase()}</span>
              <span class="header-dropdown-row-controls">
                <input
                  id={`toggle-${key}`}
                  type="checkbox"
                  checked={maSettings()[key].visible}
                  onChange={(e) => updateMa(key, { visible: e.currentTarget.checked })}
                />
                <input
                  class="header-dropdown-input"
                  type="number"
                  min="1"
                  max="1000"
                  value={maSettings()[key].period}
                  onInput={(e) => updateMa(key, { period: Math.max(1, Number(e.currentTarget.value) || 1) })}
                  aria-label={`${key.toUpperCase()} period`}
                />
              </span>
            </label>
          ))}
        </div>
        <div class="header-dropdown-section">
          <div class="header-dropdown-section-title">Chart overlays</div>
          <label class="header-dropdown-row" for="toggle-sessions">
            <span class="header-dropdown-row-label">Sessions (Asia / New York)</span>
            <span class="header-dropdown-row-controls">
              <input
                id="toggle-sessions"
                type="checkbox"
                checked={maSettings().sessions}
                onChange={(e) => setMaSettings({ ...maSettings(), sessions: e.currentTarget.checked })}
              />
            </span>
          </label>
        </div>
      </HeaderDropdown>

      <HeaderDropdown label="Risk / Reward" title="Position sizing and trade workflow" summary={riskSummary}>
        <div class="header-dropdown-section">
          <div class="header-dropdown-section-title">Drawing defaults</div>
          <label class="header-dropdown-row" for="risk-rr">
            <span class="header-dropdown-row-label">Reward ratio (R)</span>
            <input
              id="risk-rr"
              class="header-dropdown-input header-dropdown-input-wide"
              type="number"
              min="0.1"
              max="20"
              step="0.1"
              value={positionSettings().rr}
              onInput={(e) => updatePosition('rr', e.currentTarget.value)}
            />
          </label>
          <label class="header-dropdown-row" for="risk-usdt">
            <span class="header-dropdown-row-label">Risk USDT</span>
            <input
              id="risk-usdt"
              class="header-dropdown-input header-dropdown-input-wide"
              type="number"
              min="0.01"
              step="0.01"
              value={positionSettings().riskUsdt}
              onInput={(e) => updatePosition('riskUsdt', e.currentTarget.value)}
            />
          </label>
        </div>
        <div class="header-dropdown-section">
          <div class="header-dropdown-section-title">Close trade</div>
          <label class="header-dropdown-row" for="profit-loss">
            <span class="header-dropdown-row-label">Result</span>
            <select
              id="profit-loss"
              class="header-dropdown-input header-dropdown-input-wide"
              value={profitLoss()}
              onChange={(e) => setProfitLoss(e.currentTarget.value)}
            >
              <option value="profit">Profit</option>
              <option value="loss">Loss</option>
            </select>
          </label>
          <label class="header-dropdown-row" for="trade-note">
            <span class="header-dropdown-row-label">Note</span>
            <input
              id="trade-note"
              class="header-dropdown-input header-dropdown-input-wide"
              type="text"
              placeholder="Описание сделки"
              value={tradeNote()}
              onInput={(e) => setTradeNote(e.currentTarget.value)}
            />
          </label>
        </div>
      </HeaderDropdown>

      <div class="flex-row align-center" style={{ gap: '6px' }}>
        <button
          onClick={openLatestPosition}
          disabled={isOpeningPosition() || isClosingPosition()}
          title="Открыть последнюю позицию"
        >
          {isOpeningPosition() ? 'Открытие...' : 'Открыть позицию'}
        </button>        
        <div class="flex-row align-center" style={{ gap: '6px' }}>
          <label class="header-dropdown-row" for="profit-loss">
            <span class="header-dropdown-row-label">Result</span>
            <select
              id="profit-loss"
              class="header-dropdown-input header-dropdown-input-wide"
              value={profitLoss()}
              onChange={(e) => setProfitLoss(e.currentTarget.value)}
            >
              <option value="profit">Profit</option>
              <option value="loss">Loss</option>
            </select>
          </label>
          <label class="header-dropdown-row" for="trade-note">
            <span class="header-dropdown-row-label">Note</span>
            <input
              id="trade-note"
              class="header-dropdown-input header-dropdown-input-wide"
              type="text"
              placeholder="Описание сделки"
              value={tradeNote()}
              onInput={(e) => setTradeNote(e.currentTarget.value)}
            />
          </label>
        </div>
        <button
          onClick={closeOpenPosition}
          disabled={isClosingPosition() || isOpeningPosition()}
          title="Закрыть открытую позицию"
          style={{ 'background-color': '#455a64' }}
        >
          {isClosingPosition() ? 'Закрытие...' : 'Закрыть позицию'}
        </button>
      </div>

      {positionStatus() && <span class={`position-status position-status-${positionStatus().type}`}>{positionStatus().text}</span>}

      {/* Центр: Выбор таймфрейма, Скорость и Название пары */}
      <div class="flex-row align-center" style={{ gap: '15px', "margin-left": "auto", "margin-right": "auto" }}>
        <span style={{ "font-weight": "bold", "color": "#fff", "font-size": "16px" }}>
          {currentPair()}
        </span>

        <select value={timeframe()} onChange={handleTimeframeChange}>
          {TOP_TIMEFRAME_OPTIONS.map((option) => (
            <option value={option}>{timeframeLabel(option)}</option>
          ))}
        </select>

        {/* Управление плеером симуляции */}
        <button onClick={togglePlay} class={isPlaying() ? 'active' : ''}>
          {isPlaying() ? '⏸ Пауза' : '▶ Старт'}
        </button>

        {/* Ползунок скорости */}
        <div class="flex-row align-center" style={{ gap: '6px' }}>
          <span style={{ "font-size": "12px" }}>Скорость:</span>
          <input 
            type="range" 
            min="1" 
            max="10" 
            step="1"
            value={simulationSpeed()} 
            onInput={handleSpeedChange}
            style={{ width: '80px', cursor: 'pointer' }}
          />
          <span style={{ "font-size": "12px", "min-width": "25px" }}>{simulationSpeed()}x</span>
        </div>
      </div>

      {/* Правая часть: управление боковой панелью и нижними графиками */}
      <div class="flex-row align-center" style={{ gap: '6px' }}>
        <button
          onClick={() => setShowSubCharts(!showSubCharts())}
          style={{ "background-color": "#2a2e39", "color": "#d1d4dc" }}
        >
          {showSubCharts() ? '👇 Скрыть нижние графики' : '👆 Показать нижние графики'}
        </button>
        <button 
          onClick={() => setShowSidebar(!showSidebar())}
          style={{ "background-color": "#2a2e39", "color": "#d1d4dc" }}
        >
          {showSidebar() ? '👉 Скрыть панели' : '👈 Показать пары'}
        </button>
      </div>
      </div>
    </header>
  );
}
