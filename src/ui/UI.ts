import { h } from './dom';

export interface Screen {
  el: HTMLElement;
  onShow?(): void;
  onHide?(): void;
  update?(dt: number): void;
}

/** Screen stack manager + modals + toasts. */
export class UI {
  readonly root: HTMLElement;
  current: Screen | null = null;
  currentName = '';
  private modals: HTMLElement[] = [];
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(name: string, screen: Screen) {
    this.closeAllModals();
    if (this.current) {
      this.current.onHide?.();
      this.current.el.remove();
    }
    this.current = screen;
    this.currentName = name;
    this.root.appendChild(screen.el);
    screen.onShow?.();
  }

  modal(content: HTMLElement, opts: { onClose?: () => void; dismissable?: boolean } = {}): () => void {
    const wrap = h('div', { class: 'modal' }, content);
    const close = () => {
      if (!wrap.isConnected) return;
      wrap.remove();
      this.modals = this.modals.filter((m) => m !== wrap);
      opts.onClose?.();
    };
    if (opts.dismissable !== false)
      wrap.addEventListener('pointerdown', (e) => {
        if (e.target === wrap) close();
      });
    this.root.appendChild(wrap);
    this.modals.push(wrap);
    return close;
  }

  get hasModal() {
    return this.modals.length > 0;
  }

  closeAllModals() {
    for (const m of this.modals) m.remove();
    this.modals = [];
  }

  toast(msg: string, ms = 2200) {
    this.toastEl?.remove();
    clearTimeout(this.toastTimer);
    this.toastEl = h('div', { class: 'toast' }, msg);
    document.getElementById('app')!.appendChild(this.toastEl);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl?.remove();
      this.toastEl = null;
    }, ms);
  }

  update(dt: number) {
    this.current?.update?.(dt);
  }
}
