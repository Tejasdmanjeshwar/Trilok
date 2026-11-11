import * as THREE from "three";

export type FeedbackKind = "hit" | "parry" | "dodge" | "miss" | "step" | "armor" | "critical" | "weakpoint" | "intercept" | "blood";

interface Particle {
  activeUntil: number;
  beganAt: number;
  lifetime: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}
interface DamageView {
  readonly element: HTMLDivElement;
  readonly world: THREE.Vector3;
  beganAt: number;
  amount: number;
}

const MAX_PARTICLES = 64;
const MAX_NUMBERS = 6;

export function falloff(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const t = Math.max(0, Math.min(1, elapsedMs / durationMs));
  return (1 - t) * (1 - t);
}

/**
 * Presentation-only, pooled impact feedback. Gameplay damage is received as
 * an argument and never calculated here. No per-frame geometry allocations.
 */
export class CombatFeedback {
  private readonly particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    activeUntil: -1, beganAt: 0, lifetime: 0,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  }));
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.PointsMaterial({
    size: 0.23,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
  });
  private readonly points: THREE.Points;
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly overlay = document.createElement("div");
  private readonly damageViews: DamageView[] = [];
  private readonly projected = new THREE.Vector3();
  private readonly tint = new THREE.Color();
  private cursor = 0;
  private nextDamage = 0;
  private flashAt = -1;
  private flashDuration = 1;
  private flashStrength = 0;
  private holdUntil = -1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly screen: HTMLElement,
    private readonly reducedMotion: boolean,
  ) {
    this.positions.fill(9999);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = "CombatSparksPool";
    this.scene.add(this.points);

    this.overlay.className = "combat-impact-overlay";
    this.overlay.setAttribute("aria-hidden", "true");
    this.screen.appendChild(this.overlay);

    for (let i = 0; i < MAX_NUMBERS; i++) {
      const element = document.createElement("div");
      element.className = "combat-damage-number";
      element.setAttribute("aria-hidden", "true");
      element.style.opacity = "0";
      this.screen.appendChild(element);
      this.damageViews.push({
        element, world: new THREE.Vector3(), beganAt: -1, amount: 0,
      });
    }
  }

  emit(
    kind: FeedbackKind,
    position: THREE.Vector3,
    nowMs: number,
    amount = 0,
    isHeroDamage = false,
  ): void {
    const tint = kind === "blood" ? 0x8f2334
      : kind === "parry" || kind === "dodge" || kind === "intercept" ? 0x91dddc
      : kind === "armor" ? 0xa8c9df
      : kind === "critical" ? 0xffe09c
      : kind === "weakpoint" ? 0xf6a3a8
      : kind === "miss" ? 0xf19a76
      : kind === "step" ? 0xa1a18a : 0xffd18a;
    const count = kind === "step" ? 7 : kind === "dodge" ? 13 :
      kind === "blood" ? 20 : 26;
    this.tint.setHex(tint);

    for (let i = 0; i < count; i++) {
      const index = (this.cursor++ % MAX_PARTICLES);
      const particle = this.particles[index]!;
      const angle = i * 2.399963 + (this.cursor % 9) * 0.37;
      const speed = 1.2 + (i % 7) * 0.37;
      particle.beganAt = nowMs;
      particle.lifetime = (kind === "blood" ? 190 : 260) + (i % 6) * 48;
      particle.activeUntil = nowMs + particle.lifetime;
      particle.x = position.x;
      particle.y = position.y;
      particle.z = position.z;
      particle.vx = Math.cos(angle) * speed;
      particle.vy = kind === "step" ? .25 + (i % 4) * .11 :
        kind === "blood" ? .18 + (i % 5) * .33 : 1.2 + (i % 5) * .41;
      particle.vz = Math.sin(angle) * speed;
      this.colors[index * 3] = this.tint.r;
      this.colors[index * 3 + 1] = this.tint.g;
      this.colors[index * 3 + 2] = this.tint.b;
    }
    (this.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    if (kind !== "step" && kind !== "blood") {
      this.flashAt = nowMs;
      this.flashDuration = kind === "critical" ? 390 : kind === "hit" || kind === "miss" ? 290 : 200;
      this.flashStrength = kind === "critical" ? .55 : kind === "hit" ? .44 : kind === "parry" ? .38 : .25;
      this.overlay.className = "combat-impact-overlay " + kind;
      if (!this.reducedMotion && (kind === "hit" || kind === "critical" || kind === "parry" || kind === "miss")) {
        this.holdUntil = Math.max(this.holdUntil, nowMs + (kind === "parry" ? 55 : 45));
      }
    }

    if (amount > 0) {
      const view = this.damageViews[this.nextDamage++ % MAX_NUMBERS]!;
      view.beganAt = nowMs;
      view.amount = amount;
      view.world.copy(position);
      view.element.textContent = String(amount);
      view.element.className = "combat-damage-number " +
        (isHeroDamage ? "hero-damage" : "enemy-damage") +
        (kind === "critical" ? " critical-damage" : kind === "armor" ? " armor-damage" : "");
    }
  }

  get frozenUntil(): number { return this.holdUntil; }

  update(nowMs: number, camera: THREE.Camera): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i]!;
      const offset = i * 3;
      if (nowMs >= p.activeUntil) {
        this.positions[offset] = 9999;
        this.positions[offset + 1] = 9999;
        this.positions[offset + 2] = 9999;
        continue;
      }
      const age = (nowMs - p.beganAt) / 1000;
      this.positions[offset] = p.x + p.vx * age;
      this.positions[offset + 1] = p.y + p.vy * age - 3.6 * age * age;
      this.positions[offset + 2] = p.z + p.vz * age;
    }
    (this.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

    const flash = this.flashAt < 0 ? 0
      : this.flashStrength * falloff(nowMs - this.flashAt, this.flashDuration);
    this.overlay.style.opacity = String(flash);

    const width = this.screen.clientWidth;
    const height = this.screen.clientHeight;
    for (const view of this.damageViews) {
      const age = nowMs - view.beganAt;
      if (view.beganAt < 0 || age < 0 || age >= 950) {
        view.element.style.opacity = "0";
        continue;
      }
      this.projected.copy(view.world).project(camera);
      if (this.projected.z < -1 || this.projected.z > 1) {
        view.element.style.opacity = "0";
        continue;
      }
      const x = (this.projected.x * .5 + .5) * width;
      const y = (1 - (this.projected.y * .5 + .5)) * height - age * .060;
      view.element.style.left = x.toFixed(1) + "px";
      view.element.style.top = y.toFixed(1) + "px";
      view.element.style.opacity = String(Math.min(1, age / 80, (950 - age) / 360));
      view.element.style.transform = "translate(-50%, -50%) scale(" + (1 + .19 * falloff(age, 330)).toFixed(3) + ")";
    }
  }

  reset(): void {
    this.holdUntil = -1;
    this.flashAt = -1;
    this.flashStrength = 0;
    this.overlay.style.opacity = "0";
    for (const particle of this.particles) particle.activeUntil = -1;
    for (const view of this.damageViews) {
      view.beganAt = -1;
      view.element.style.opacity = "0";
    }
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.overlay.remove();
    for (const view of this.damageViews) view.element.remove();
  }
}
