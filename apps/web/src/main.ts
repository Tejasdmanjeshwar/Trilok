import * as THREE from "three";
import { beginBattle, gradeReaction, resolveEnemyTurn, strike, type BattleState } from "@trilok/combat";
import { createArena, type ArenaInstance, type ArenaQuality } from "./world/arena";
import { createWarrior, type WarriorPose } from "./actors/warrior";
import { CombatCameraDirector, type CameraShot } from "./camera/CombatCameraDirector";
import "./style.css";

const host = document.querySelector<HTMLDivElement>("#app");
if (!host) throw new Error("Missing application element.");
host.innerHTML = [
  '<main class="game"><div id="viewport" class="viewport"></div><div class="vignette"></div>',
  '<header class="top"><div class="brand">✦ <strong>TRILOK</strong><span>COMBAT ARENA · V0.2</span></div>',
  '<div class="tools"><span id="fps">— FPS</span><label>QUALITY <select id="quality"><option value="high">HIGH</option><option value="low">MOBILE</option></select></label>',
  '<button id="audio" aria-label="Toggle sound">♫</button></div></header>',
  '<div class="location">ARANYA · THE FORGOTTEN SHRINE</div>',
  '<section class="enemy"><div>RAKSHASA <small>THE GUARDIAN</small></div><div class="bar"><span id="enemy-bar"></span></div><p id="enemy-hp"></p></section>',
  '<section id="telegraph" class="telegraph"><b>⚔ INCOMING STRIKE</b><div class="timing"><span id="timing-fill"></span><i></i></div><small>PARRY AT THE FLASH</small></section>',
  '<div id="feedback" class="feedback" role="status" aria-live="polite"></div>',
  '<footer class="hud"><section class="hero"><div class="sigil">✶</div><div><strong>THE ARCHER</strong><small>TRIAL WARRIOR · FIRST ENCOUNTER</small>',
  '<div class="bar hero-bar"><span id="hero-bar"></span></div><p id="hero-hp"></p></div></section>',
  '<div class="actions"><button id="attack" class="primary">➶ <span>STRIKE<small>SPACE</small></span></button>',
  '<button id="react">✦ <span>PARRY<small>P</small></span></button>',
  '<button id="restart">↻ <span>RESTART<small>R</small></span></button></div></footer>',
  '<aside class="status"><b id="phase">THE DUEL BEGINS</b><span id="message">Select STRIKE to begin.</span></aside>',
  '<div id="loading" class="loading">✦ <span>ENTERING THE SHRINE</span></div></main>',
].join("");

function query<T extends HTMLElement>(selector: string): T {
  const result = host!.querySelector<T>(selector);
  if (!result) throw new Error("Missing element " + selector);
  return result;
}
const viewport = query<HTMLDivElement>("#viewport");
const qualitySelect = query<HTMLSelectElement>("#quality");
const attackButton = query<HTMLButtonElement>("#attack");
const parryButton = query<HTMLButtonElement>("#react");
const restartButton = query<HTMLButtonElement>("#restart");
const audioButton = query<HTMLButtonElement>("#audio");
const fpsDisplay = query<HTMLElement>("#fps");
const phaseDisplay = query<HTMLElement>("#phase");
const messageDisplay = query<HTMLElement>("#message");
const heroHp = query<HTMLElement>("#hero-hp");
const enemyHp = query<HTMLElement>("#enemy-hp");
const heroBar = query<HTMLElement>("#hero-bar");
const enemyBar = query<HTMLElement>("#enemy-bar");
const telegraph = query<HTMLElement>("#telegraph");
const timingFill = query<HTMLElement>("#timing-fill");
const feedback = query<HTMLElement>("#feedback");
const loading = query<HTMLElement>("#loading");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let quality: ArenaQuality = /Android|iPhone|iPad/i.test(navigator.userAgent) ? "low" : "high";
qualitySelect.value = quality;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ca497);
scene.fog = new THREE.FogExp2(0x8ca497, 0.0095);
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 220);
const renderer = new THREE.WebGLRenderer({ antialias: quality === "high", powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
viewport.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc5dced, 0x314337, 2.1));
scene.add(new THREE.AmbientLight(0xacc7ae, 0.2));
const sun = new THREE.DirectionalLight(0xffd8a0, 3.5);
sun.position.set(-23, 31, 19);
sun.target.position.set(0, 0, 0);
scene.add(sun, sun.target);

function applyQuality(): void {
  const high = quality === "high";
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, high ? 1.5 : 1));
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = high;
  sun.shadow.mapSize.set(high ? 2048 : 512, high ? 2048 : 512);
  sun.shadow.camera.left = -23;
  sun.shadow.camera.right = 23;
  sun.shadow.camera.top = 23;
  sun.shadow.camera.bottom = -23;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.00015;
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
}
applyQuality();

let arena: ArenaInstance = createArena(119, quality);
scene.add(arena.root);
const hero = createWarrior("archer");
const enemy = createWarrior("rakshasa");
hero.root.position.set(-3.8, 0.15, 2.7);
enemy.root.position.set(3.3, 0.12, -3.8);
scene.add(hero.root, enemy.root);
hero.face(enemy.root.position);
enemy.face(hero.root.position);
const director = new CombatCameraDirector(camera, hero.root, enemy.root);

type Presentation = "intro" | "choice" | "attack" | "windup" | "reaction" | "victory" | "defeat";
let presentation: Presentation = "intro";
let started = performance.now();
let battle: BattleState = beginBattle();
let hasHit = false;
let parryOffset: number | null = null;
let noticeUntil = 0;
let soundEnabled = false;
let soundContext: AudioContext | null = null;
const INTRO_MS = reducedMotion ? 250 : 1500;
const ATTACK_MS = 1100;
const WINDUP_MS = 1850;
const RECOVER_MS = 680;

function audio(frequency: number): void {
  if (!soundEnabled) return;
  try {
    soundContext ??= new AudioContext();
    if (soundContext.state === "suspended") void soundContext.resume();
    const o = soundContext.createOscillator();
    const g = soundContext.createGain();
    o.frequency.setValueAtTime(frequency, soundContext.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(70, frequency * 0.65), soundContext.currentTime + 0.18);
    g.gain.setValueAtTime(0.055, soundContext.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, soundContext.currentTime + 0.18);
    o.connect(g);
    g.connect(soundContext.destination);
    o.start();
    o.stop(soundContext.currentTime + 0.18);
  } catch { /* Sound never blocks gameplay. */ }
}
function phase(next: Presentation, shot: CameraShot): void {
  presentation = next;
  started = performance.now();
  hasHit = false;
  director.setShot(shot);
  hud();
}
function notice(message: string, warning = false): void {
  feedback.textContent = message;
  feedback.className = warning ? "feedback visible warning" : "feedback visible";
  noticeUntil = performance.now() + 1050;
}
function hud(): void {
  heroHp.textContent = battle.hero.hp + " / " + battle.hero.maxHp;
  enemyHp.textContent = battle.enemy.hp + " / " + battle.enemy.maxHp;
  heroBar.style.width = (battle.hero.hp / battle.hero.maxHp * 100) + "%";
  enemyBar.style.width = (battle.enemy.hp / battle.enemy.maxHp * 100) + "%";
  phaseDisplay.textContent = battle.phase === "victory" ? "VICTORY" : battle.phase === "defeat" ? "DEFEAT" : "ROUND " + battle.round;
  messageDisplay.textContent = battle.message;
  attackButton.disabled = presentation !== "choice";
  parryButton.disabled = presentation !== "windup";
  telegraph.classList.toggle("show", presentation === "windup");
  enemy.root.visible = battle.enemy.hp > 0;
  hero.root.visible = battle.hero.hp > 0;
}
function strikeAction(): void {
  if (presentation !== "choice" || battle.phase !== "player_turn") return;
  phase("attack", "attack");
  audio(290);
}
function damageEnemy(): void {
  if (hasHit || battle.phase !== "player_turn") return;
  hasHit = true;
  battle = strike(battle);
  director.impact();
  notice(battle.phase === "victory" ? "VICTORY" : "PRECISION STRIKE");
  audio(140);
  hud();
}
function resolveDefense(): void {
  if (presentation !== "windup" || battle.phase !== "enemy_windup") return;
  const grade = gradeReaction(parryOffset);
  battle = resolveEnemyTurn(battle, grade);
  director.impact(grade === "perfect" ? 0.11 : 0.18);
  notice(grade === "perfect" ? "PERFECT PARRY" : grade === "parry" ? "PARRIED" : grade === "guard" ? "GUARDED" : "HIT!", grade === "miss");
  audio(grade === "miss" ? 110 : 480);
  parryOffset = null;
  phase("reaction", "reaction");
}
function parryAction(): void {
  if (presentation !== "windup" || battle.phase !== "enemy_windup") return;
  const offset = performance.now() - (started + WINDUP_MS);
  if (offset < -380 || offset > 280) {
    notice("TOO EARLY", true);
    return;
  }
  parryOffset = offset;
  resolveDefense();
}
function reset(): void {
  battle = beginBattle();
  parryOffset = null;
  phase("choice", "decision");
}
function keyDown(event: KeyboardEvent): void {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === "Space") { event.preventDefault(); strikeAction(); }
  if (event.code === "KeyP") parryAction();
  if (event.code === "KeyR") reset();
}
attackButton.addEventListener("click", strikeAction);
parryButton.addEventListener("click", parryAction);
restartButton.addEventListener("click", reset);
audioButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  audioButton.textContent = soundEnabled ? "♪" : "♫";
  if (soundEnabled) audio(520);
});
qualitySelect.addEventListener("change", () => {
  quality = qualitySelect.value as ArenaQuality;
  arena.dispose();
  arena = createArena(119, quality);
  scene.add(arena.root);
  applyQuality();
  resize();
});
window.addEventListener("keydown", keyDown);

function resize(): void {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
const observer = new ResizeObserver(resize);
observer.observe(viewport);
resize();
hud();

let previous = performance.now();
let frames = 0;
let frameSeconds = 0;
function frame(time: number): void {
  const delta = Math.min(0.06, Math.max(0, (time - previous) / 1000));
  previous = time;
  let ms = time - started;
  if (presentation === "intro" && ms > INTRO_MS) {
    loading.classList.add("hidden");
    phase("choice", "decision");
  }
  if (presentation === "attack") {
    if (ms > ATTACK_MS * 0.65) damageEnemy();
    if (ms >= ATTACK_MS) {
      phase(battle.phase === "victory" ? "victory" : "windup", battle.phase === "victory" ? "victory" : "defense");
    }
  }
  if (presentation === "windup") {
    timingFill.style.width = Math.min(100, ms / WINDUP_MS * 100) + "%";
    if (ms >= WINDUP_MS + 280) resolveDefense();
  } else {
    timingFill.style.width = "0%";
  }
  if (presentation === "reaction" && ms >= RECOVER_MS) {
    phase(battle.phase === "defeat" ? "defeat" : "choice", battle.phase === "defeat" ? "victory" : "decision");
  }
  if (noticeUntil && time > noticeUntil) {
    feedback.classList.remove("visible");
    noticeUntil = 0;
  }
  ms = time - started;
  const heroPose: WarriorPose = presentation === "attack" ? "attack" : presentation === "reaction" ? "parry" : presentation === "victory" ? "victory" : "idle";
  const enemyPose: WarriorPose = presentation === "windup" ? "windup" : presentation === "attack" && hasHit ? "hit" : "idle";
  hero.animate(heroPose, Math.min(1, ms / (presentation === "attack" ? ATTACK_MS : RECOVER_MS)), time / 1000);
  enemy.animate(enemyPose, Math.min(1, ms / (presentation === "windup" ? WINDUP_MS : ATTACK_MS)), time / 1000);
  director.update(delta);
  renderer.render(scene, camera);
  frames++;
  frameSeconds += delta;
  if (frameSeconds > 0.8) {
    fpsDisplay.textContent = Math.round(frames / frameSeconds) + " FPS";
    frames = 0;
    frameSeconds = 0;
  }
}
renderer.setAnimationLoop(frame);
window.addEventListener("pagehide", () => {
  renderer.setAnimationLoop(null);
  observer.disconnect();
  window.removeEventListener("keydown", keyDown);
  arena.dispose();
  hero.dispose();
  enemy.dispose();
  renderer.dispose();
  void soundContext?.close();
}, { once: true });
