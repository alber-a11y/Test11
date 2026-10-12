/** Frequency rules for ads. Tuned "above average" aggressiveness. */
export interface AdPolicyConfig {
  interstitialCooldown: number; // seconds between interstitials
  firstInterstitialDelay: number; // seconds after session start
  afterRewardedCooldown: number; // no interstitial right after a rewarded
  minLevelForInterstitial: number; // player must have reached this level
  freeCoinsPerDay: number;
  maxRevives: number;
}

export const DEFAULT_POLICY: AdPolicyConfig = {
  interstitialCooldown: 45,
  firstInterstitialDelay: 60,
  afterRewardedCooldown: 30,
  minLevelForInterstitial: 3,
  freeCoinsPerDay: 10,
  maxRevives: 3,
};

/** ?adpolicy=test — interstitials as often as possible (QA). */
export function policyFromUrl(): AdPolicyConfig {
  const p = new URLSearchParams(location.search).get('adpolicy');
  if (p === 'test') return { ...DEFAULT_POLICY, interstitialCooldown: 5, firstInterstitialDelay: 0, afterRewardedCooldown: 0, minLevelForInterstitial: 1 };
  return DEFAULT_POLICY;
}

export class AdPolicy {
  private sessionStart = performance.now();
  private lastInterstitial = -Infinity;
  private lastRewarded = -Infinity;

  constructor(readonly cfg: AdPolicyConfig = DEFAULT_POLICY) {}

  private now() {
    return (performance.now() - this.sessionStart) / 1000;
  }

  canInterstitial(playerLevel: number): boolean {
    const n = this.now();
    if (playerLevel < this.cfg.minLevelForInterstitial) return false;
    if (n < this.cfg.firstInterstitialDelay) return false;
    if (n - this.lastInterstitial < this.cfg.interstitialCooldown) return false;
    if (n - this.lastRewarded < this.cfg.afterRewardedCooldown) return false;
    return true;
  }

  markInterstitial() {
    this.lastInterstitial = this.now();
  }

  markRewarded() {
    this.lastRewarded = this.now();
  }
}
