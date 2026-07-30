function pad(n) { return String(n).padStart(2, '0'); }

function formatDisplay(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function toDateInputValue(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function toTimeInputValue(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * @param {HTMLElement} container
 * @param {{ initial: number, onApply: (unixSeconds:number)=>void }} opts
 */
export function createDateTimeControl(container, { initial, onApply }) {
  let current = initial;

  container.classList.add('dt-control');
  container.innerHTML = `
    <button type="button" class="dt-trigger">
      <span class="dt-icon">📅</span>
      <span class="dt-text"></span>
    </button>
    <div class="dt-popover hidden">
      <label class="dt-field">
        <span>Дата</span>
        <input type="date" class="dt-date" />
      </label>
      <label class="dt-field">
        <span>Время (UTC)</span>
        <input type="time" step="60" class="dt-time" />
      </label>
      <div class="dt-actions">
        <button type="button" class="btn btn-ghost dt-now">Сейчас</button>
        <button type="button" class="btn btn-primary dt-apply">Применить</button>
      </div>
    </div>
  `;

  const trigger = container.querySelector('.dt-trigger');
  const textEl = container.querySelector('.dt-text');
  const popover = container.querySelector('.dt-popover');
  const dateInput = container.querySelector('.dt-date');
  const timeInput = container.querySelector('.dt-time');
  const nowBtn = container.querySelector('.dt-now');
  const applyBtn = container.querySelector('.dt-apply');

  function syncInputs() {
    textEl.textContent = formatDisplay(current);
    dateInput.value = toDateInputValue(current);
    timeInput.value = toTimeInputValue(current);
  }

  function openPopover() {
    syncInputs();
    popover.classList.remove('hidden');
  }
  function closePopover() {
    popover.classList.add('hidden');
  }

  trigger.addEventListener('click', (ev) => {
    ev.stopPropagation();
    popover.classList.contains('hidden') ? openPopover() : closePopover();
  });
  popover.addEventListener('click', (ev) => ev.stopPropagation());
  document.addEventListener('click', () => closePopover());

  nowBtn.addEventListener('click', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    dateInput.value = toDateInputValue(nowSec);
    timeInput.value = toTimeInputValue(nowSec);
  });

  applyBtn.addEventListener('click', () => {
    if (!dateInput.value || !timeInput.value) return;
    const [y, m, d] = dateInput.value.split('-').map(Number);
    const [hh, mm] = timeInput.value.split(':').map(Number);
    const seconds = Math.floor(Date.UTC(y, m - 1, d, hh, mm, 0) / 1000);
    current = seconds;
    syncInputs();
    closePopover();
    onApply(seconds);
  });

  syncInputs();

  return {
    getUnixSeconds: () => current,
    setUnixSeconds(seconds) {
      current = seconds;
      syncInputs();
    },
  };
}
