// src/components/Sidebar.jsx
import { createSignal, createEffect, onCleanup, For } from 'solid-js';
import { currentPair, dataMode, setCurrentPair } from '../services/store.js';
import { dataManager } from '../backtester/dataManager.js';
import { loadOfflineSymbols } from '../backtester/offlineMetadata.js';
import { binanceApi } from '../backtester/binanceApi.js';
import { loadFavorites, saveFavorites } from '../backtester/favoritesStorage.js';

export function Sidebar() {
  const [allPairs, setAllPairs] = createSignal([]);       // Все доступные торговые пары
  const [favorites, setFavorites] = createSignal(loadFavorites());
  const [searchQuery, setSearchQuery] = createSignal(''); // Строка поиска
  const [loadError, setLoadError] = createSignal(null);
  let loadController;
  let loadGeneration = 0;

  createEffect(() => {
    const mode = dataMode();
    const generation = ++loadGeneration;
    loadController?.abort();
    loadController = new AbortController();
    setLoadError(null);

    const loadPairs = async () => {
      try {
        const localPairs = await loadOfflineSymbols();
        if (generation !== loadGeneration || loadController.signal.aborted) return;
        const normalizedLocal = Array.isArray(localPairs) ? localPairs : Object.keys(localPairs || {});
        setAllPairs(normalizedLocal);

        if (mode !== 'online') return;

        try {
          const onlinePairs = await binanceApi.getTradingPairs({ signal: loadController.signal });
          if (generation !== loadGeneration || loadController.signal.aborted) return;
          setAllPairs([...new Set([...normalizedLocal, ...onlinePairs])].sort());
        } catch (error) {
          if (error.name !== 'AbortError' && generation === loadGeneration) {
            setLoadError(`Binance: ${error.message || 'не удалось обновить список пар'}`);
          }
        }
      } catch (error) {
        if (error.name !== 'AbortError' && generation === loadGeneration) {
          setLoadError(error.message || 'Не удалось загрузить локальные торговые пары');
        }
      }
    };

    loadPairs();
  });

  onCleanup(() => loadController?.abort());

  // Переключение статуса Избранного
  const toggleFavorite = (symbol, e) => {
    e.stopPropagation(); // Чтобы клик по звездочке не переключал сам график
    
    let updated;
    if (favorites().includes(symbol)) {
      updated = favorites().filter(fav => fav !== symbol);
    } else {
      updated = [...favorites(), symbol];
    }
    
    setFavorites(updated);
    saveFavorites(updated);
  };

  // Переключение торговой пары
  const handleSelectPair = (symbol) => {
    setCurrentPair(symbol);
    dataManager.changeSymbol(symbol); // Дёргаем метод смены символа в движке
  };

  // Фильтруем пары по поисковому запросу, исключая те, что уже в избранном
  const filteredPairs = () => {
    const query = searchQuery().toUpperCase();
    return allPairs().filter(pair => {
      const matchesSearch = pair.includes(query);
      const isNotFavorite = !favorites().includes(pair);
      return matchesSearch && isNotFavorite;
    }).sort();
  };

  // Фильтруем избранные пары по поиску (чтобы поиск работал и по ним)
  const filteredFavorites = () => {
    const query = searchQuery().toUpperCase();
    return favorites().filter(pair => pair.includes(query)).sort();
  };

  return (
    <div class="flex-col" style={{ height: '100%', width: '100%' }}>
      {/* Поле поиска */}
      <div style={{ padding: '10px', "border-bottom": '1px solid #2a2e39' }}>
        <input 
          type="text" 
          placeholder="Поиск пары (напр. BTC)..." 
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', "font-size": '14px' }}
        />
      </div>

      {loadError() && (
        <div class="sidebar-error" role="alert">
          Binance: {loadError()}
        </div>
      )}

      {/* Прокручиваемый список пар */}
      <div style={{ flex: '1', "overflow-y": 'auto' }}>
        
        {/* СЕКЦИЯ: ИЗБРАННОЕ (Показывается, если есть элементы) */}
        {filteredFavorites().length > 0 && (
          <div style={{ "border-bottom": '2px solid #2a2e39', "background-color": '#171b26' }}>
            <div style={{ padding: '6px 12px', "font-size": '11px', color: '#f0b90b', "font-weight": 'bold' }}>
              ⭐ ИЗБРАННОЕ
            </div>
            <For each={filteredFavorites()}>
              {(symbol) => (
                <div 
                  onClick={() => handleSelectPair(symbol)}
                  class={`flex-row align-center justify-between fade-in`}
                  style={{ 
                    padding: '10px 12px', 
                    cursor: 'pointer',
                    "background-color": currentPair() === symbol ? '#2a2e39' : 'transparent',
                    "border-bottom": '1px solid #222634'
                  }}
                >
                  <span style={{ "font-weight": '500', color: currentPair() === symbol ? '#fff' : '#d1d4dc' }}>{symbol}</span>
                  <span onClick={(e) => toggleFavorite(symbol, e)} style={{ cursor: 'pointer', color: '#f0b90b' }}>★</span>
                </div>
              )}
            </For>
          </div>
        )}

        {/* СЕКЦИЯ: ВСЕ ОСТАЛЬНЫЕ ПАРЫ */}
        <div style={{ padding: '6px 12px', "font-size": '11px', color: '#848e9c', "font-weight": 'bold' }}>
          📊 ВСЕ РЫНКИ
        </div>
        <For each={filteredPairs()}>
          {(symbol) => (
            <div 
              onClick={() => handleSelectPair(symbol)}
              class={`flex-row align-center justify-between`}
              style={{ 
                padding: '10px 12px', 
                cursor: 'pointer',
                "background-color": currentPair() === symbol ? '#2a2e39' : 'transparent',
                "border-bottom": '1px solid #222634'
              }}
            >
              <span style={{ "font-weight": '500', color: currentPair() === symbol ? '#fff' : '#d1d4dc' }}>{symbol}</span>
              <span onClick={(e) => toggleFavorite(symbol, e)} style={{ cursor: 'pointer', color: '#474d57' }}>☆</span>
            </div>
          )}
        </For>

        {/* Если ничего не найдено */}
        {filteredPairs().length === 0 && filteredFavorites().length === 0 && (
          <div style={{ padding: '20px', "text-align": 'center', color: '#848e9c' }}>
            Ничего не найдено
          </div>
        )}

      </div>
    </div>
  );
}
