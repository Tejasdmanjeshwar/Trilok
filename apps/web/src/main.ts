import * as THREE from "three";
import { INITIAL_QUALITY } from "@trilok/core";
import {
  beginBattle,
  gradeReaction,
  resolveEnemyTurn,
  strike,
  type BattleState,
} from "@trilok/combat";
import "./style.css";

const host = document.querySelector<HTMLDivElement>("#app");
if (!host) throw new Error("Missing application element.");

host.innerHTML = [
  '<main class="shell">',
  '<header><div class="eyebrow">TRILOK / ENGINE PROTOTYPE 001</div>',
  '<h1>Combat Laboratory</h1>',
  '<p>Renderer-independent turn rules. Timing-based counterplay. Original placeholder presentation.</p></header>',
  '<section class="arena" aria-label="3D combat arena"><div id="viewport"></div>',
  '<div class="windup"><div id="windup-fill"></div></div></section>',
  '<section class="hud">',
  '<div class="health"><div><span>HERO</span><strong id="hero-hp"></strong></div>',
  '<div><span>ENEMY</span><strong id="enemy-hp"></strong></div></div>',
  '<p class="status" id="status" aria-live="polite"></p>',
  '<div class="actions"><button id="attack">Attack <small>Space</small></button>',
  '<button id="react">Parry <small>P</small></button>',
  '<button id="restart" class="secondary">Restart <small>R</small></button></div>',
  '<p class="hint">Press Parry close to the end of the enemy windup. Perfect: ±90 ms; parry: ±200 ms; guard: ±380 ms.</p>',
  '</section><footer>Prototype only · No campaign content or finished animations yet</footer></main>',
].join("");

function required<T extends HTMLElement>(selector: string): T {
  const element = host!.querySelector<T>(selector);
  if (!element) throw new Error("Missing UI element: " + selector);
  return element;
}

const viewport = required<HTMLDivElement>("#viewport");
const attackButton = required<HTMLButtonElement>("#attack");
const reactButton = required<HTMLButtonElement>("#react");
const restartButton = required<HTMLButtonElement>("#restart");
const heroHealth = required<HTMLElement>("#hero-hp");
const enemyHealth = required<HTMLElement>("#enemy-hp");
const statusText = required<HTMLElement>("#status");
const windupFill = required<HTMLDivElement>("#windup-fill");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#172b29");
scene.fog = new THREE.Fog("#172b29", 13, 35);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
camera.position.set(0, 5.8, 11.5);
camera.lookAt(0, 1.3, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, INITIAL_QUALITY.pixelRatioCap));
renderer.shadowMap.enabled = INITIAL_QUALITY.shadowsEnabled;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.append(renderer.domElement);

scene.add(new THREE.HemisphereLight("#dcebdd", "#25332a", 2.2));
const sun = new THREE.DirectionalLight("#ffe9bc", 2.8);
sun.position.set(-3, 8, 4);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(10, 64),
  new THREE.MeshStandardMaterial({ color: "#3f6151", roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);

const hero = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.55, 1.25, 6, 12),
  new THREE.MeshStandardMaterial({ color: "#e2b968", roughness: 0.65 }),
);
hero.position.set(-2.2, 1.2, 0);
scene.add(hero);

const enemyMaterial = new THREE.MeshStandardMaterial({
  color: "#b86661",
  roughness: 0.65,
});
const enemy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 1), enemyMaterial);
enemy.position.set(2.2, 1.55, 0);
scene.add(enemy);

let battle: BattleState = beginBattle();
let impactAt: number | null = null;
let timeoutId: number | null = null;
const WINDUP_MS = 1700;

function updateHud(): void {
  heroHealth.textContent = battle.hero.hp + " / " + battle.hero.maxHp;
  enemyHealth.textContent = battle.enemy.hp + " / " + battle.enemy.maxHp;
  statusText.textContent = "Round " + battle.round + " · " + battle.message;
  attackButton.disabled = battle.phase !== "player_turn";
  reactButton.disabled = battle.phase !== "enemy_windup";
  enemy.visible = battle.enemy.hp > 0;
  hero.visible = battle.hero.hp > 0;
}

function finishReaction(offsetMs: number | null): void {
  if (battle.phase !== "enemy_windup") return;
  if (timeoutId !== null) window.clearTimeout(timeoutId);
  timeoutId = null;
  impactAt = null;
  battle = resolveEnemyTurn(battle, gradeReaction(offsetMs));
  windupFill.style.width = "0%";
  updateHud();
}

function attack(): void {
  if (battle.phase !== "player_turn") return;
  battle = strike(battle);
  updateHud();
  if (battle.phase === "enemy_windup") {
    impactAt = performance.now() + WINDUP_MS;
    timeoutId = window.setTimeout(() => finishReaction(null), WINDUP_MS + 380);
  }
}

function parry(): void {
  if (impactAt === null || battle.phase !== "enemy_windup") return;
  finishReaction(performance.now() - impactAt);
}

function restart(): void {
  if (timeoutId !== null) window.clearTimeout(timeoutId);
  timeoutId = null;
  impactAt = null;
  battle = beginBattle();
  windupFill.style.width = "0%";
  updateHud();
}

function keyDown(event: KeyboardEvent): void {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === "Space") {
    event.preventDefault();
    attack();
  } else if (event.code === "KeyP") {
    parry();
  } else if (event.code === "KeyR") {
    restart();
  }
}

attackButton.addEventListener("click", attack);
reactButton.addEventListener("click", parry);
restartButton.addEventListener("click", restart);
window.addEventListener("keydown", keyDown);

function resize(): void {
  const width = Math.max(viewport.clientWidth, 1);
  const height = Math.max(viewport.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const observer = new ResizeObserver(resize);
observer.observe(viewport);
resize();
updateHud();

renderer.setAnimationLoop((time: number) => {
  if (impactAt !== null) {
    const remaining = Math.max(0, impactAt - performance.now());
    windupFill.style.width = ((1 - remaining / WINDUP_MS) * 100).toFixed(1) + "%";
    enemy.rotation.y = Math.sin(time * 0.006) * 0.18;
  } else {
    enemy.rotation.y += 0.003;
  }
  hero.position.y = 1.2 + Math.sin(time * 0.002) * 0.035;
  renderer.render(scene, camera);
});

window.addEventListener("pagehide", () => {
  if (timeoutId !== null) window.clearTimeout(timeoutId);
  observer.disconnect();
  renderer.setAnimationLoop(null);
  renderer.dispose();
  ground.geometry.dispose();
  (ground.material as THREE.Material).dispose();
  hero.geometry.dispose();
  (hero.material as THREE.Material).dispose();
  enemy.geometry.dispose();
  enemyMaterial.dispose();
}, { once: true });
