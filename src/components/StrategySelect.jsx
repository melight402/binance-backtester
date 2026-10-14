import { createEffect, createSignal, For, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';

export function StrategySelect(props) {
  const [open, setOpen] = createSignal(false);
  const [style, setStyle] = createSignal({});
  let root;
  let button;
  let menu;

  const selected = () => props.options.find((option) => option.value === props.value);
  const updatePosition = () => {
    if (!button || !open()) return;
    const rect = button.getBoundingClientRect();
    const padding = 8;
    const gap = 4;
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - padding * 2);
    const height = Math.min(300, Math.max(120, props.options.length * 42 + 48));
    const below = window.innerHeight - rect.bottom - padding - gap;
    const above = rect.top - padding - gap;
    const openAbove = below < height && above > below;
    const maxHeight = Math.max(100, Math.min(height, openAbove ? above : below));
    const top = openAbove ? Math.max(padding, rect.top - maxHeight - gap) : Math.min(window.innerHeight - maxHeight - padding, rect.bottom + gap);
    const left = Math.min(Math.max(padding, rect.left), window.innerWidth - width - padding);
    setStyle({ position: 'fixed', top: `${top}px`, left: `${left}px`, width: `${width}px`, 'max-height': `${maxHeight}px` });
  };

  onMount(() => {
    const outside = (event) => {
      if (root && !root.contains(event.target) && !menu?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    onCleanup(() => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    });
  });

  createEffect(updatePosition);

  return (
    <div ref={root} class="strategy-select">
      <button ref={button} type="button" class="strategy-select-button" onClick={() => setOpen(!open())} title={selected()?.description || 'Выберите стратегию'}>
        <span>{selected()?.label || 'Без стратегии'}</span><span class="strategy-select-arrow">{open() ? '▲' : '▼'}</span>
      </button>
      {open() && (
        <Portal>
          <div ref={menu} class="strategy-select-menu" style={style()}>
          <button type="button" class={`strategy-select-option ${!props.value ? 'selected' : ''}`} onClick={() => { props.onChange(''); setOpen(false); }}>Без стратегии</button>
          <For each={props.options}>{(option) => (
            <button type="button" class={`strategy-select-option ${option.value === props.value ? 'selected' : ''}`} title={option.description} onClick={() => { props.onChange(option.value); setOpen(false); }}>
              {option.label}
            </button>
          )}</For>
          </div>
        </Portal>
      )}
    </div>
  );
}