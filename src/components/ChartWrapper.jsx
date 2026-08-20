// src/components/ChartWrapper.jsx
import { onMount, onCleanup, createEffect } from 'solid-js';
import { createChartAdapter } from '../chart/chartAdapter.js';
import { activeTool, clearDrawingsVersion, selectedDrawingId, setActiveTool } from '../services/store.js';

export function ChartWrapper(props) {
  let chartContainerRef; // Переменная для хранения прямой ссылки на DOM-узел
  let chartInstance = null;
  let previousChartKey;

  // Функция-помощник: возвращает нужный сигнал в зависимости от типа графика
  const getCandlesSignal = () => {
    return props.candles || [];
  };

  // Функция-помощник: определяет таймфрейм для передачи в фабрику
  const getTimeframe = () => {
    if (props.type === 'main') return props.timeframe; // берется динамически из хедера
    return props.type; // '1h' или '1d' для нижних графиков
  };

  // 1. ИНИЦИАЛИЗАЦИЯ ЧАРТА В DOM
  onMount(() => {
    if (!chartContainerRef) return;

    // Вызываем оригинальный метод создания графика из вашего binance-backtester
    // Тело компонента выполняется один раз, поэтому график создается строго один раз
    chartInstance = createChartAdapter(chartContainerRef, {
      symbol: props.pair,
      timeframe: getTimeframe(),
      type: props.type,
      isMain: props.type === 'main',
      onToolUsed: () => {
        setActiveTool(null);
        props.onToolUsed?.();
      },
      onDrawingCreated: props.onDrawingCreated,
      onDrawingModified: props.onDrawingModified,
      onDrawingSelected: props.onDrawingSelected,
    });

    // Если на момент монтирования в сторе уже есть свечи — сразу рисуем их
    const currentCandles = getCandlesSignal();
    if (chartInstance) {
      chartInstance.setCandles(currentCandles);
    }
  });

  // 2. РЕАКТИВНОЕ ОБНОВЛЕНИЕ ДАННЫХ СВЕЧЕЙ (Прямой проброс в Canvas)
  createEffect(() => {
    // Вызов getCandlesSignal() автоматически подписывает этот Эффект на изменения нужного массива свечей
    const freshCandles = getCandlesSignal();

    if (chartInstance && freshCandles) {
      // Важно: мы не перерисовываем HTML. Мы вызываем нативный метод вашего Canvas-движка
      // Это работает со скоростью Vanilla JS и не тратит ресурсы процессора Mac на Virtual DOM
      chartInstance.setCandles(freshCandles);
    }
  });

  createEffect(() => {
    const mode = activeTool();
    if (chartInstance && props.type === 'main') chartInstance.setDrawingMode(mode);
  });

  createEffect(() => {
    clearDrawingsVersion();
    if (chartInstance && props.type === 'main') chartInstance.clearDrawings();
  });

  createEffect(() => {
    const currentDrawings = props.drawings || [];
    if (chartInstance) chartInstance.setDrawings(currentDrawings);
  });

  createEffect(() => {
    const drawingId = selectedDrawingId();
    if (chartInstance && props.type === 'main') chartInstance.setSelectedDrawing(drawingId);
  });

  createEffect(() => {
    if (chartInstance) chartInstance.setIndicators(props.maSettings);
  });

  createEffect(() => {
    if (chartInstance) chartInstance.setPositionSettings(props.positionSettings);
  });

  // 3. ОТСЛЕЖИВАНИЕ СМЕНЫ ТОРГОВОЙ ПАРЫ И ТАЙМФРЕЙМА
  createEffect(() => {
    const pair = props.pair;
    const tf = getTimeframe();
    const chartKey = `${pair}:${tf}`;

    if (chartInstance && previousChartKey !== undefined && previousChartKey !== chartKey) {
      // Метод из вашего движка для очистки старой разметки и подготовки под новые данные
      chartInstance.reset(pair, tf);
    }
    previousChartKey = chartKey;
  });

  // 4. ОЧИСТКА ПАМЯТИ (Профилактика утечек Canvas на macOS)
  onCleanup(() => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  // Возвращаем пустой div, в который ваша chartFactory развернет холст
  return (
    <div 
      ref={chartContainerRef} 
      class="chart-container" 
      style={{ width: '100%', height: '100%', position: 'relative' }} 
    />
  );
}
