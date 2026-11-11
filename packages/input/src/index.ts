/**
 * Device-independent tactical aim state. No DOM, WebGL, or combat dependencies.
 * Platform adapters submit absolute pointers, relative drags, or analog axes.
 * A future console adapter can feed the same normalized actions.
 */
export interface AimPoint {
  readonly x: number;
  readonly y: number;
}
export type AimDevice = "mouse" | "touch" | "keyboard" | "gamepad" | "programmatic";
export interface AimInputFrame extends AimPoint {
  readonly device: AimDevice;
}
export interface AimPreferences {
  readonly touchSensitivity: number;
  readonly analogSpeed: number;
  readonly deadzone: number;
}
export const DEFAULT_AIM_PREFERENCES: AimPreferences = {
  touchSensitivity: 1.25,
  analogSpeed: 1.45,
  deadzone: .18,
};
function clamp(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Aim input must be finite.");
  return Math.max(-1,Math.min(1,value));
}
export class AimCursor {
  private point: AimInputFrame = {x:0,y:0,device:"programmatic"};
  constructor(readonly preferences: AimPreferences = DEFAULT_AIM_PREFERENCES) {
    if (![preferences.touchSensitivity,preferences.analogSpeed,preferences.deadzone].every(
      value => Number.isFinite(value) && value >= 0 && value <= 10
    ) || preferences.deadzone >= 1) throw new Error("Invalid aim preferences.");
  }
  get value(): AimInputFrame { return this.point; }
  recenter(x = 0, y = 0): void {
    this.point = {x:clamp(x),y:clamp(y),device:"programmatic"};
  }
  absolute(x: number, y: number, device: AimDevice = "mouse"): void {
    this.point = {x:clamp(x),y:clamp(y),device};
  }
  relative(dx: number, dy: number, width: number, height: number, device: AimDevice = "touch"): void {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error("Invalid aim viewport.");
    }
    const factor = device === "touch" ? this.preferences.touchSensitivity : 1;
    this.absolute(
      this.point.x + dx * 2 / width * factor,
      this.point.y - dy * 2 / height * factor, device,
    );
  }
  axis(horizontal: number, vertical: number, deltaSeconds: number,
    device: AimDevice = "gamepad"): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error("Invalid aim timestep.");
    const dead = this.preferences.deadzone;
    const normalized = (v: number) => {
      if (!Number.isFinite(v)) throw new Error("Invalid analog input.");
      const magnitude = Math.abs(v);
      return magnitude <= dead ? 0 : Math.sign(v) *
        Math.min(1,(magnitude-dead)/(1-dead));
    };
    const dx = normalized(horizontal), dy = normalized(vertical);
    if (!dx && !dy) return;
    // Time-based (not framerate-based). Clamp slow-frame spikes to keep input usable.
    const dt = Math.min(deltaSeconds,.05);
    this.absolute(this.point.x + dx * dt * this.preferences.analogSpeed,
      this.point.y - dy * dt * this.preferences.analogSpeed, device);
  }
}
