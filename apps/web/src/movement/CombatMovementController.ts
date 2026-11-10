import * as THREE from "three";

interface Move {
  readonly actor: THREE.Object3D;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  readonly beganAt: number;
  readonly endsAt: number;
  readonly dodge: boolean;
}

function ease(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Presentation-only root movement. Gameplay reach is defined by equipment.
 * Moves sample absolute timestamps, independent of the number of rendered frames.
 */
export class CombatMovementController {
  private readonly home = new Map<THREE.Object3D, THREE.Vector3>();
  private readonly moves = new Map<THREE.Object3D, Move>();

  register(actor: THREE.Object3D): void {
    this.home.set(actor, actor.position.clone());
  }

  approach(
    actor: THREE.Object3D,
    target: THREE.Object3D,
    reachMeters: number,
    now: number,
    durationMs: number,
  ): void {
    this.update(now);
    const toward = actor.position.clone().sub(target.position);
    toward.y = 0;
    const distance = toward.length();
    if (distance < 0.0001 || distance <= reachMeters) {
      this.moves.delete(actor);
      return;
    }
    toward.multiplyScalar(1 / distance);
    const desired = target.position.clone().addScaledVector(toward, reachMeters);
    desired.y = actor.position.y;
    this.begin(actor, desired, now, durationMs, false);
  }

  retreat(actor: THREE.Object3D, now: number, durationMs: number): void {
    const destination = this.home.get(actor);
    if (!destination) throw new Error("Unregistered combatant.");
    this.update(now);
    this.begin(actor, destination, now, durationMs, false);
  }

  dodge(
    actor: THREE.Object3D,
    attacker: THREE.Object3D,
    now: number,
    durationMs: number,
    distance = 2,
  ): void {
    this.update(now);
    const toward = attacker.position.clone().sub(actor.position);
    toward.y = 0;
    toward.normalize();
    const perpendicular = new THREE.Vector3(-toward.z, 0, toward.x);
    const destination = actor.position.clone().addScaledVector(perpendicular, distance);
    this.begin(actor, destination, now, durationMs, true);
  }

  private begin(actor: THREE.Object3D, destination: THREE.Vector3, now: number, durationMs: number, dodge: boolean): void {
    if (!this.home.has(actor)) throw new Error("Unregistered combatant.");
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("Invalid movement duration.");
    this.moves.set(actor, {
      actor,
      from: actor.position.clone(),
      to: destination.clone(),
      beganAt: now,
      endsAt: now + durationMs,
      dodge,
    });
  }

  update(now: number): void {
    for (const [actor, movement] of this.moves) {
      const t = Math.max(0, Math.min(1, (now - movement.beganAt) / (movement.endsAt - movement.beganAt)));
      // Dodge returns after the sidestep. Melee approach and retreat use a simple ease.
      const blend = movement.dodge
        ? t < 0.35 ? ease(t / 0.35) : 1 - ease((t - 0.35) / 0.65)
        : ease(t);
      actor.position.copy(movement.from).lerp(movement.to, blend);
      if (t >= 1) this.moves.delete(actor);
    }
  }

  reset(): void {
    this.moves.clear();
    for (const [actor, home] of this.home) actor.position.copy(home);
  }

  separation(a: THREE.Object3D, b: THREE.Object3D): number {
    return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
  }
}
