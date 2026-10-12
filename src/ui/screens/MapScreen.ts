import { h, starIco } from '../dom';
import { t } from '../../i18n/i18n';
import type { Screen } from '../UI';
import type { Game } from '../../core/Game';
import { backButton, currencyBar } from './common';
import { biomeForLevel, isBossLevel, LEVELS_PER_BIOME } from '../../world/biomes/Biomes';
import { chestEvery } from '../../meta/Economy';
import { openChest } from './Popups';

const STEP = 112;
const PAD = 120;

export class MapScreen implements Screen {
  el: HTMLElement;
  private scroll: HTMLElement;
  private inner: HTMLElement;
  private maxLevel: number;
  private cur: ReturnType<typeof currencyBar>;

  constructor(private game: Game) {
    this.cur = currencyBar(game);
    this.scroll = h('div', { class: 'map-scroll' });
    this.inner = h('div', { class: 'map-inner' });
    this.scroll.append(this.inner);
    this.maxLevel = Math.max(30, game.save.data.level + 25);
    this.el = h(
      'div',
      { class: 'screen map' },
      h('div', { class: 'header' }, backButton(() => game.goMenu(), game), h('h1', { class: 'title' }, t('map')), this.cur.el),
      this.scroll,
    );
    this.scroll.addEventListener('scroll', () => {
      if (this.scroll.scrollTop < 300) this.extend();
    });
    this.render();
  }

  private y(level: number) {
    // level 1 at the bottom
    return (this.maxLevel - level) * STEP + PAD;
  }

  private x(level: number) {
    return 50 + Math.sin(level * 0.85) * 28;
  }

  private extend() {
    const prevH = this.inner.offsetHeight;
    const prevTop = this.scroll.scrollTop;
    this.maxLevel += 30;
    this.render();
    this.scroll.scrollTop = prevTop + (this.inner.offsetHeight - prevH);
  }

  private render() {
    const d = this.game.save.data;
    const total = this.maxLevel * STEP + PAD * 2;
    this.inner.innerHTML = '';
    this.inner.style.height = `${total}px`;
    // biome bands
    for (let b = 0; b * LEVELS_PER_BIOME < this.maxLevel; b++) {
      const first = b * LEVELS_PER_BIOME + 1;
      const biome = biomeForLevel(first);
      const top = this.y(first + LEVELS_PER_BIOME - 1) - STEP / 2;
      const height = STEP * LEVELS_PER_BIOME;
      const c1 = `#${biome.sky.top.toString(16).padStart(6, '0')}`;
      const c2 = `#${biome.groundColor.toString(16).padStart(6, '0')}`;
      const band = h('div', { class: 'map-band', style: `top:${top}px;height:${height}px;background:linear-gradient(180deg, ${c1}55, ${c2}55)` }, h('span', null, t(biome.nameKey)));
      this.inner.append(band);
    }
    // path
    const pts: string[] = [];
    for (let l = 1; l <= this.maxLevel; l++) pts.push(`${this.x(l)},${this.y(l)}`);
    const w = 100;
    const svg = `<svg class="map-svg" viewBox="0 0 ${w} ${total}" preserveAspectRatio="none" style="height:${total}px">
      <polyline points="${pts.join(' ')}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="5" vector-effect="non-scaling-stroke" transform="translate(0,4)"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
    this.inner.insertAdjacentHTML('beforeend', svg);
    // nodes
    for (let l = 1; l <= this.maxLevel; l++) {
      const unlocked = l <= d.level;
      const current = l === d.level;
      const stars = d.stars[l] ?? 0;
      const node = h(
        'div',
        {
          class: `node ${unlocked ? '' : 'locked'} ${current ? 'current' : ''} ${isBossLevel(l) ? 'boss' : ''}`,
          style: `left:${this.x(l)}%;top:${this.y(l)}px`,
        },
        unlocked ? String(l) : '🔒',
        unlocked && !current ? h('div', { class: 'stars' }, starIco(stars >= 1), starIco(stars >= 2), starIco(stars >= 3)) : null,
      );
      if (unlocked)
        node.addEventListener('click', () => {
          this.game.audio.sfx.play('click');
          this.game.goPreRace(l);
        });
      this.inner.append(node);
      if (l % chestEvery === 0) {
        const st = this.game.eco.chestState(l);
        const cx = this.x(l) > 50 ? this.x(l) - 26 : this.x(l) + 26;
        const chest = h('div', { class: `chest-node ${st}`, style: `left:${cx}%;top:${this.y(l) - STEP / 2}px` }, st === 'opened' ? '📭' : isBossLevel(l) ? '💎' : '🎁');
        chest.addEventListener('click', () => {
          if (st === 'ready') openChest(this.game, l, () => this.render());
          else if (st === 'locked') this.game.ui.toast(t('chest.locked', { n: l }));
        });
        this.inner.append(chest);
      }
    }
    this.cur.refresh();
  }

  onShow() {
    requestAnimationFrame(() => {
      const target = this.y(this.game.save.data.level) - this.scroll.clientHeight * 0.6;
      this.scroll.scrollTop = Math.max(0, target);
    });
  }
}
