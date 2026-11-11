import * as THREE from "three";

export type CameraShot = "intro" | "decision" | "attack" | "aim" | "enemy_attack" | "counter" | "windup" | "defense" | "reaction" | "victory";

/** Presentation-only director. Camera movement never determines combat outcomes. */
export class CombatCameraDirector {
  private readonly focus = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredFocus = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly heroPosition = new THREE.Vector3();
  private readonly enemyPosition = new THREE.Vector3();
  // Aim stays player-side. A screen reticle, not a region lock, determines aim.
  private shot: CameraShot = "intro";
  private shake = 0;
  private strikeFocus = 0;
  private windupTension = 0;
  private elapsed = 0;
  private readonly reduceMotion: boolean;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly hero: THREE.Object3D,
    private readonly enemy: THREE.Object3D,
  ) {
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.update(0.016, true);
  }

  setShot(shot: CameraShot): void {
    this.shot = shot;
  }

  impact(strength = 0.12,focus = 0): void {
    if (this.reduceMotion) return;
    this.shake = Math.max(this.shake, Math.min(.35,strength));
    this.strikeFocus=Math.max(this.strikeFocus,Math.min(1.5,focus));
  }
  anticipate(weight:number):void {
    if(!this.reduceMotion)this.windupTension=Math.max(this.windupTension,
      Math.min(1.5,Math.max(0,weight)));
  }
  resetAccents():void {
    this.shake=0;this.strikeFocus=0;this.windupTension=0;
  }

  update(delta: number, immediate = false): void {
    this.elapsed += delta;
    this.hero.getWorldPosition(this.heroPosition);
    this.enemy.getWorldPosition(this.enemyPosition);

    const hero = this.heroPosition;
    const enemy = this.enemyPosition;
    const middle = this.scratch.copy(hero).add(enemy).multiplyScalar(0.5);
    const p = this.desiredPosition;
    const t = this.desiredFocus;
    let fov = 47;
    let speed = 3.7;
    switch (this.shot) {
      case "intro":
        p.copy(middle).add(new THREE.Vector3(2.5, 8.0, 15.5));
        t.copy(middle).add(new THREE.Vector3(0, 1.25, 0));
        fov = 55;
        speed = 2.6;
        break;
      case "decision": {
        // Quiet breathing composition: never crosses the combat axis.
        // The camera pans a few centimeters, without chasing UI selection.
        const sway = this.reduceMotion ? 0 : Math.sin(this.elapsed * .43) * .19;
        const rise = this.reduceMotion ? 0 : Math.cos(this.elapsed * .31) * .055;
        p.copy(hero).add(new THREE.Vector3(-3.2 + sway, 2.9 + rise, 6.4));
        t.copy(enemy).lerp(hero, 0.16)
          .add(new THREE.Vector3(sway * .08, 1.5 + rise * .3, 0));
        fov = 44;
        speed = 3.5;
        break;
      }
      case "aim":
        p.copy(hero).add(new THREE.Vector3(-1.0, 2.6, 4.3));
        t.copy(enemy).add(new THREE.Vector3(0, 1.76, 0));
        fov = 39;
        speed = 5.4;
        break;
      case "enemy_attack":
        // Never cross behind the opponent: player remains foreground.
        p.copy(hero).add(new THREE.Vector3(-2.3, 2.7, 5.25));
        t.copy(enemy).lerp(hero, 0.22).add(new THREE.Vector3(0, 1.55, 0));
        fov = 44;
        speed = 5.2;
        break;
      case "counter":
        p.copy(middle).add(new THREE.Vector3(1.1, 2.6, 4.7));
        t.copy(middle).add(new THREE.Vector3(0, 1.55, 0));
        fov = 43;
        speed = 7.1;
        break;
      case "attack":
        p.copy(hero).add(new THREE.Vector3(-0.35, 2.15, 3.45));
        t.copy(enemy).add(new THREE.Vector3(0, 1.55, 0));
        fov = 41;
        speed = 5.2;
        break;
      case "windup":
        p.copy(hero).add(new THREE.Vector3(-2.2, 3.05, 6.0));
        t.copy(enemy).lerp(hero, 0.30).add(new THREE.Vector3(0, 1.55, 0));
        fov = 48;
        speed = 4.6;
        break;
      case "defense":
        p.copy(hero).add(new THREE.Vector3(-2.7, 2.7, 5.1));
        t.copy(enemy).lerp(hero, 0.24).add(new THREE.Vector3(0, 1.5, 0));
        fov = 44;
        speed = 6;
        break;
      case "reaction":
        p.copy(hero).add(new THREE.Vector3(-1.4, 2.4, 4.4));
        t.copy(middle).add(new THREE.Vector3(0, 1.65, 0));
        fov = 43;
        speed = 6;
        break;
      case "victory":
        p.copy(hero).add(new THREE.Vector3(2.7, 2.8, 6.4));
        t.copy(hero).add(new THREE.Vector3(0, 1.6, 0));
        fov = 46;
        speed = 2.7;
        break;
    }
    const factor = immediate || this.reduceMotion ? 1 : 1 - Math.exp(-speed * Math.min(delta, 0.1));
    this.camera.position.lerp(p, factor);
    this.focus.lerp(t, factor);
    if (this.shake > 0.0005) {
      this.camera.position.x += Math.sin(this.elapsed * 97) * this.shake;
      this.camera.position.y += Math.cos(this.elapsed * 71) * this.shake * 0.4;
      this.shake *= Math.exp(-11 * delta);
    }
    if(!this.reduceMotion){
      fov-=this.windupTension*1.1+this.strikeFocus*2.2;
      this.windupTension*=Math.exp(-6*Math.max(0,delta));
      this.strikeFocus*=Math.exp(-10*Math.max(0,delta));
    }
    this.camera.fov += (fov - this.camera.fov) * factor;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.focus);
  }
}
