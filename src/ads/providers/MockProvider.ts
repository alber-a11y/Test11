import type { AdProvider, InterstitialResult, RewardedResult } from '../AdProvider';
import { t } from '../../i18n/i18n';

type Sim = 'normal' | 'nofill' | 'error' | 'fast';

/**
 * Stand-in for a real ad network: shows a full-screen fake ad.
 * Simulate failures with ?ads=nofill | error | fast in the URL.
 */
export class MockProvider implements AdProvider {
  readonly name = 'mock';
  private sim: Sim;

  constructor(private root: HTMLElement) {
    const p = new URLSearchParams(location.search).get('ads');
    this.sim = (['nofill', 'error', 'fast'].includes(p ?? '') ? p : 'normal') as Sim;
  }

  async init() {
    /* nothing to load */
  }

  showInterstitial(): Promise<InterstitialResult> {
    if (this.sim === 'nofill') return Promise.resolve('no_fill');
    if (this.sim === 'error') return Promise.resolve('error');
    return this.overlay(false, this.sim === 'fast' ? 1 : 4).then(() => 'shown' as const);
  }

  showRewarded(): Promise<RewardedResult> {
    if (this.sim === 'nofill') return Promise.resolve('no_fill');
    if (this.sim === 'error') return Promise.resolve('error');
    return this.overlay(true, this.sim === 'fast' ? 1 : 6).then((done) => (done ? 'rewarded' : 'closed'));
  }

  gameplayStart() {
    console.debug('[ads] gameplayStart');
  }
  gameplayStop() {
    console.debug('[ads] gameplayStop');
  }
  loadingFinished() {
    console.debug('[ads] loadingFinished');
  }
  happyTime() {
    console.debug('[ads] happyTime');
  }

  /** Resolves true if the ad was watched to the end. */
  private overlay(rewarded: boolean, seconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'mock-ad';
      el.innerHTML = `
        <div class="mock-ad__label">${t('ad.label')}</div>
        <div class="mock-ad__body">
          <div class="mock-ad__logo">AD</div>
          <div class="mock-ad__title">${rewarded ? t('ad.mock.rewarded') : t('ad.mock.interstitial')}</div>
          <div class="mock-ad__sub">${t('ad.mock.sub')}</div>
        </div>
        <div class="mock-ad__timer"></div>
        <button class="mock-ad__close" aria-label="close">✕</button>`;
      this.root.appendChild(el);
      const timer = el.querySelector('.mock-ad__timer') as HTMLElement;
      const close = el.querySelector('.mock-ad__close') as HTMLButtonElement;
      let left = seconds;
      let finished = false;
      // interstitials can be skipped only after the countdown; rewarded can be closed any time (forfeits reward)
      close.style.visibility = rewarded ? 'visible' : 'hidden';
      const tick = () => {
        timer.textContent = left > 0 ? String(left) : '';
        if (left <= 0) {
          finished = true;
          close.style.visibility = 'visible';
          close.classList.add('ready');
          if (rewarded) done();
        }
        left--;
      };
      tick();
      const iv = window.setInterval(tick, 1000);
      const done = () => {
        clearInterval(iv);
        el.classList.add('out');
        setTimeout(() => el.remove(), 200);
        resolve(finished);
      };
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        done();
      });
    });
  }
}
