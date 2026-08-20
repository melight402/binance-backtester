import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

export function HeaderDropdown(props) {
  const [open, setOpen] = createSignal(false);
  const [panelStyle, setPanelStyle] = createSignal(null);
  let rootRef;
  let triggerRef;
  let panelRef;

  const syncPanelPosition = () => {
    if (!triggerRef) return;
    const rect = triggerRef.getBoundingClientRect();
    setPanelStyle({
      position: 'fixed',
      top: `${rect.bottom + 6}px`,
      right: 0,
      'min-width': `240px`,
      'z-index': '1000',
    });
  };

  const isInside = (target) => {
    if (!target) return false;
    return rootRef?.contains(target) || panelRef?.contains(target);
  };

  const handleDocumentClick = (event) => {
    if (!open() || isInside(event.target)) return;
    setOpen(false);
  };

  const handleDocumentKeyDown = (event) => {
    if (event.key === 'Escape') setOpen(false);
  };

  const toggle = (event) => {
    event.stopPropagation();
    const next = !open();
    if (next) {
      syncPanelPosition();
      setOpen(true);
      return;
    }
    setOpen(false);
  };

  onMount(() => {
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeyDown);
    window.addEventListener('resize', syncPanelPosition);
    window.addEventListener('scroll', syncPanelPosition, true);
  });

  onCleanup(() => {
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('keydown', handleDocumentKeyDown);
    window.removeEventListener('resize', syncPanelPosition);
    window.removeEventListener('scroll', syncPanelPosition, true);
  });

  return (
    <>
      <div class="header-dropdown" ref={rootRef}>
        <button
          type="button"
          ref={triggerRef}
          class={`header-dropdown-trigger${open() ? ' is-open' : ''}`}
          onClick={toggle}
          aria-expanded={open()}
          aria-haspopup="true"
          title={props.title}
        >
          <span class="header-dropdown-label">{props.label}</span>
          <Show when={props.summary}>
            <span class="header-dropdown-summary">{props.summary()}</span>
          </Show>
          <span class="header-dropdown-chevron" aria-hidden="true">▾</span>
        </button>
      </div>
      <Show when={open()}>
        <Portal mount={document.body}>
          <div
            class="header-dropdown-panel"
            ref={panelRef}
            style={panelStyle() || undefined}
            onClick={(event) => event.stopPropagation()}
          >
            {props.children}
          </div>
        </Portal>
      </Show>
    </>
  );
}
