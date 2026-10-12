type Child = Node | string | number | null | undefined | false;
type Props = {
  class?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  onclick?: (e: MouseEvent) => void;
  html?: string;
  [k: string]: unknown;
};

/** Tiny hyperscript helper. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v as string;
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k === 'html') el.innerHTML = v as string;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const coinIco = () => h('span', { class: 'coin-ico' });
export const gemIco = () => h('span', { class: 'gem-ico' });
export const starIco = (on = true) => h('span', { class: on ? 'star-ico' : 'star-ico off' });

export function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.floor(n));
}

export function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function ring(progress: number, size: number, color: string, width = 4): string {
  const r = size / 2 - width / 2;
  const c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, progress)))}"/></svg>`;
}
