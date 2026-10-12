import type { AdProvider } from './AdProvider';
import { AdPolicy, policyFromUrl } from './AdPolicy';
import { t } from '../i18n/i18n';
import { track } from '../meta/Analytics';

export interface AdGuardHooks {
  /** pause game loop, mute audio, block input */
  begin(): void;
  /** restore previous state */
  end(): void;
  toast(msg: string): void;
}

/** Facade used by the game. Knows nothing about a concrete ad network. */
export class AdService {
  private busy = false;
  readonly policy: AdPolicy;

  constructor(private provider: AdProvider, private hooks: AdGuardHooks, policy = new AdPolicy(policyFromUrl())) {
    this.policy = policy;
  }

  init() {
    return this.provider.init().catch(() => {});
  }

  get isBusy() {
    return this.busy;
  }

  /** Shows an interstitial at a natural break if the policy allows. Resolves when gameplay may continue. */
  async interstitial(placement: string, playerLevel: number): Promise<boolean> {
    if (this.busy || !this.policy.canInterstitial(playerLevel)) return false;
    this.busy = true;
    this.hooks.begin();
    track('ad_interstitial_request', { placement });
    try {
      // short "Advertisement" notice before the ad (required by many platforms)
      await this.notice();
      const res = await this.provider.showInterstitial();
      track('ad_interstitial_result', { placement, res });
      if (res === 'shown' || res === 'skipped') this.policy.markInterstitial();
      return res === 'shown';
    } catch {
      return false;
    } finally {
      this.hooks.end();
      this.busy = false;
    }
  }

  /** Rewarded video. Resolves true ONLY if the user watched it to the end. */
  async rewarded(placement: string): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.hooks.begin();
    track('ad_rewarded_request', { placement });
    let ok = false;
    try {
      const res = await this.provider.showRewarded();
      track('ad_rewarded_result', { placement, res });
      ok = res === 'rewarded';
      if (res === 'no_fill' || res === 'error') this.hooks.toast(t('ad.unavailable'));
      else if (res === 'closed') this.hooks.toast(t('ad.notCompleted'));
      if (ok) this.policy.markRewarded();
    } catch {
      this.hooks.toast(t('ad.unavailable'));
    } finally {
      this.hooks.end();
      this.busy = false;
    }
    return ok;
  }

  gameplayStart() {
    this.provider.gameplayStart?.();
  }
  gameplayStop() {
    this.provider.gameplayStop?.();
  }
  loadingFinished() {
    this.provider.loadingFinished?.();
  }
  happyTime() {
    this.provider.happyTime?.();
  }

  private notice(): Promise<void> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'ad-notice';
      el.textContent = t('ad.label');
      document.getElementById('ad-root')!.appendChild(el);
      setTimeout(() => {
        el.remove();
        resolve();
      }, 900);
    });
  }
}
