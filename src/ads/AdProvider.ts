export type InterstitialResult = 'shown' | 'skipped' | 'error' | 'no_fill';
export type RewardedResult = 'rewarded' | 'closed' | 'error' | 'no_fill';

/** Contract every ad platform adapter must implement (Yandex, CrazyGames, Poki, GameDistribution…). */
export interface AdProvider {
  readonly name: string;
  init(): Promise<void>;
  showInterstitial(): Promise<InterstitialResult>;
  showRewarded(): Promise<RewardedResult>;
  /** Optional platform lifecycle hooks. */
  gameplayStart?(): void;
  gameplayStop?(): void;
  loadingStart?(): void;
  loadingFinished?(): void;
  happyTime?(): void;
}
