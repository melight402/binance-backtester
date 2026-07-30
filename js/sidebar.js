import { fetchFuturesSymbols } from './binanceApi.js';
import { loadFavorites, saveFavorites } from './storage.js';

/**
 * @param {{ listEl: HTMLElement, searchEl: HTMLInputElement, onSelect: (symbol:string)=>void }} opts
 */
export async function initSidebar({ listEl, searchEl, onSelect }) {
  let symbols = [];
  const favorites = new Set(loadFavorites());
  let activeSymbol = null;
  let filterText = '';

  function toggleFavorite(symbol, ev) {
    ev.stopPropagation();
    if (favorites.has(symbol)) favorites.delete(symbol);
    else favorites.add(symbol);
    saveFavorites(Array.from(favorites));
    render();
  }

  function render() {
    const filter = filterText.trim().toUpperCase();
    const list = symbols
      .filter((s) => !filter || s.symbol.includes(filter))
      .sort((a, b) => {
        const fa = favorites.has(a.symbol);
        const fb = favorites.has(b.symbol);
        if (fa !== fb) return fa ? -1 : 1;
        return a.symbol.localeCompare(b.symbol);
      });

    listEl.innerHTML = '';
    for (const s of list) {
      const row = document.createElement('div');
      row.className = `pair-row${s.symbol === activeSymbol ? ' active' : ''}`;

      const star = document.createElement('button');
      star.className = `star-btn${favorites.has(s.symbol) ? ' favorited' : ''}`;
      star.type = 'button';
      star.textContent = favorites.has(s.symbol) ? '★' : '☆';
      star.title = 'В избранное';
      star.addEventListener('click', (ev) => toggleFavorite(s.symbol, ev));

      const name = document.createElement('span');
      name.className = 'pair-name';
      name.textContent = s.symbol;

      row.append(star, name);
      row.addEventListener('click', () => onSelect(s.symbol));
      listEl.appendChild(row);
    }
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'pair-empty';
      empty.textContent = symbols.length ? 'Ничего не найдено' : 'Загрузка...';
      listEl.appendChild(empty);
    }
  }

  searchEl.addEventListener('input', () => {
    filterText = searchEl.value;
    render();
  });

  render();
  try {
    symbols = await fetchFuturesSymbols();
  } catch (err) {
    console.error('Failed to load Binance Futures symbol list', err);
    listEl.innerHTML = '<div class="pair-empty">Не удалось загрузить список пар.<br>Проверьте подключение к api Binance.</div>';
    symbols = [];
  }
  render();

  return {
    setActiveSymbol(symbol) {
      activeSymbol = symbol;
      render();
    },
  };
}
