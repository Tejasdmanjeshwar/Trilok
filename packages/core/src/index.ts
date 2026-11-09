/** Common interfaces belong here; core does not import any renderer. */
export interface Clock {
  nowMilliseconds(): number;
}

export interface Disposable {
  dispose(): void;
}

export interface QualitySettings {
  readonly pixelRatioCap: number;
  readonly shadowsEnabled: boolean;
}

export const INITIAL_QUALITY: QualitySettings = Object.freeze({
  pixelRatioCap: 1.5,
  shadowsEnabled: false,
});
