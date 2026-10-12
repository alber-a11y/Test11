/**
 * Page-level rules common to web game portals:
 * no context menu (RMB / long press), no text selection or dragging, no zoom,
 * no page scrolling / pull-to-refresh, pause + mute when the tab is hidden.
 */
export function installPageGuard(cb: { onHidden(): void; onVisible(): void }) {
  const prevent = (e: Event) => e.preventDefault();
  document.addEventListener('contextmenu', prevent);
  document.addEventListener('selectstart', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
  });
  document.addEventListener('dragstart', prevent);
  // iOS Safari pinch-zoom gestures
  document.addEventListener('gesturestart', prevent as EventListener);
  document.addEventListener('gesturechange', prevent as EventListener);
  // double-tap zoom
  let lastTouch = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouch < 300) e.preventDefault();
      lastTouch = now;
    },
    { passive: false },
  );
  // block page scroll / pull-to-refresh except inside scrollable UI lists
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && t.closest('.map-scroll, .grid, .tabs, .upg-list, .modal .panel')) return;
      e.preventDefault();
    },
    { passive: false },
  );
  // ctrl + wheel / ctrl + +/- zoom
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
  });
  // middle-click autoscroll & back/forward mouse buttons
  window.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  window.addEventListener('auxclick', prevent);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cb.onHidden();
    else cb.onVisible();
  });
  window.addEventListener('blur', () => cb.onHidden());
  window.addEventListener('focus', () => cb.onVisible());
}
