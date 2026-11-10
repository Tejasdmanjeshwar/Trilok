import * as THREE from "three";
import { beginBattle, gradeReaction, resolveEnemyTurn, strike, equipWeapon, equippedWeapon, availableDefenses, WEAPONS, type BattleState, type DefenseAction, type WeaponId } from "@trilok/combat";
import { ReactionBuffer, SequencePlayer } from "@trilok/choreography";
import { createArena, type ArenaInstance, type ArenaQuality } from "./world/arena";
import { createAnimatedWarrior, type AnimatedWarrior, type Motion } from "./actors/AnimatedWarrior";
import { CombatCameraDirector, type CameraShot } from "./camera/CombatCameraDirector";
import { CombatEffects } from "./effects/CombatEffects";
import { ARCHERY_ATTACK, MELEE_ATTACK, ARCHERY_REACTION, ENEMY_STRIKE, type CombatCue } from "./combat/sequences";
import { CombatMovementController } from "./movement/CombatMovementController";
import "./style.css";

const host = document.querySelector<HTMLDivElement>("#app");
if (!host) throw new Error("Missing application element.");
host.innerHTML = [
  '<main class="game"><div id="viewport" class="viewport"></div><div class="vignette"></div>',
  '<header class="top"><div class="brand">✦ <strong>TRILOK</strong><span>COMBAT ARENA · V0.3.1</span></div>',
  '<div class="tools"><span id="fps">— FPS</span><label>QUALITY <select id="quality"><option value="high">HIGH</option><option value="low">MOBILE</option></select></label>',
  '<button id="audio" aria-label="Toggle sound">♫</button></div></header>',
  '<div class="location">ARANYA · THE FORGOTTEN SHRINE</div>',
  '<section class="enemy"><div>RAKSHASA <small>THE GUARDIAN</small></div><div class="bar"><span id="enemy-bar"></span></div><p id="enemy-hp"></p></section>',
  '<section id="telegraph" class="telegraph"><b>⚔ INCOMING STRIKE</b><div class="timing"><span id="timing-fill"></span><i></i></div><small>PARRY AT THE FLASH</small></section>',
  '<div id="feedback" class="feedback" role="status" aria-live="polite"></div>',
  '<footer class="hud"><section class="hero"><div class="sigil">✶</div><div><strong>TRIAL WARRIOR</strong><small>WEAPON <select id="weapon" aria-label="Equipped weapon"><option value="bow">LONGBOW</option><option value="sword">SWORD</option></select> <span class="weapon-keys">[1/2]</span></small>',
  '<div class="bar hero-bar"><span id="hero-bar"></span></div><p id="hero-hp"></p></div></section>',
  '<div class="actions"><button id="attack" class="primary">➶ <span>STRIKE<small>SPACE</small></span></button>',
  '<button id="react">✦ <span>PARRY<small>P</small></span></button>',
  '<button id="dodge">↝ <span>DODGE<small>D</small></span></button>',
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
const dodgeButton = query<HTMLButtonElement>("#dodge");
const weaponSelect = query<HTMLSelectElement>("#weapon");
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

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
const hero: AnimatedWarrior = createAnimatedWarrior("archer");
const enemy: AnimatedWarrior = createAnimatedWarrior("rakshasa");
hero.root.position.set(-3.8, 0.15, 2.7);
enemy.root.position.set(3.3, 0.12, -3.8);
scene.add(hero.root, enemy.root);
hero.face(enemy.root.position);
enemy.face(hero.root.position);
const director = new CombatCameraDirector(camera, hero.root, enemy.root);
const movement = new CombatMovementController();
movement.register(hero.root);
movement.register(enemy.root);
hero.equip("bow");
enemy.equip("sword");
const effects = new CombatEffects(scene);
const heroSocket = new THREE.Vector3();
const targetPoint = new THREE.Vector3();
const effectPoint = new THREE.Vector3();
const choreography = new SequencePlayer<CombatCue>();
type Presentation = "intro" | "choice" | "attack" | "windup" | "reaction" | "victory" | "defeat";
let presentation: Presentation = "intro";
let phaseAt = performance.now();
let battle: BattleState = beginBattle();
let reaction: ReactionBuffer | null = null;
let chosenDefense: DefenseAction | null = null;
let noticeUntil = 0;
let soundEnabled = false;
let soundContext: AudioContext | null = null;
const INTRO_MS = reduceMotion ? 250 : 1500;

function audio(frequency: number): void {
  if (!soundEnabled) return;
  try {
    soundContext ??= new AudioContext();
    if (soundContext.state === "suspended") void soundContext.resume();
    const oscillator = soundContext.createOscillator();
    const gain = soundContext.createGain();
    oscillator.frequency.setValueAtTime(frequency, soundContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(70, frequency * .65), soundContext.currentTime + .18);
    gain.gain.setValueAtTime(.055, soundContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, soundContext.currentTime + .18);
    oscillator.connect(gain);
    gain.connect(soundContext.destination);
    oscillator.start();
    oscillator.stop(soundContext.currentTime + .18);
  } catch { /* Audio is optional. */ }
}

function setPhase(next: Presentation, shot: CameraShot, now = performance.now()): void {
  presentation = next;
  phaseAt = now;
  director.setShot(shot);
  if (next !== "attack" && next !== "windup" && next !== "reaction") choreography.cancel();
  updateHud();
}
function notice(message: string, warning = false): void {
  feedback.textContent = message;
  feedback.className = warning ? "feedback visible warning" : "feedback visible";
  noticeUntil = performance.now() + 1150;
}
function updateHud(): void {
  heroHp.textContent = battle.hero.hp + " / " + battle.hero.maxHp;
  enemyHp.textContent = battle.enemy.hp + " / " + battle.enemy.maxHp;
  heroBar.style.width = (battle.hero.hp / battle.hero.maxHp * 100) + "%";
  enemyBar.style.width = (battle.enemy.hp / battle.enemy.maxHp * 100) + "%";
  phaseDisplay.textContent = battle.phase === "victory" ? "VICTORY" : battle.phase === "defeat" ? "DEFEAT" : "ROUND " + battle.round;
  messageDisplay.textContent = battle.message;
  attackButton.disabled = presentation !== "choice";
  const defenses = availableDefenses(battle.hero);
  parryButton.disabled = presentation !== "windup" || !defenses.includes("parry") || reaction?.captured === true;
  dodgeButton.disabled = presentation !== "windup" || !defenses.includes("dodge") || reaction?.captured === true;
  weaponSelect.value = battle.hero.weaponId;
  weaponSelect.disabled = presentation !== "choice";
  telegraph.classList.toggle("show", presentation === "windup");
  enemy.root.visible = battle.enemy.hp > 0;
  hero.root.visible = battle.hero.hp > 0;
}
function startAttack(now = performance.now()): void {
  if (presentation !== "choice" || battle.phase !== "player_turn") return;
  setPhase("attack", "attack", now);
  const weapon = equippedWeapon(battle.hero);
  const melee = weapon.weaponClass === "melee";
  choreography.start(melee ? MELEE_ATTACK : ARCHERY_ATTACK, now);
  if (melee) movement.approach(hero.root, enemy.root, weapon.reachMeters, now, 1080);
  hero.play(melee ? "melee" : "attack");
  enemy.play("idle");
  effects.clear();
  audio(310);
}
function startEnemy(now: number): void {
  if (battle.phase !== "enemy_windup") return;
  setPhase("windup", "defense", now);
  choreography.start(ENEMY_STRIKE, now);
  reaction = new ReactionBuffer(now + 1850);
  chosenDefense = null;
  const enemyWeapon = equippedWeapon(battle.enemy);
  if (enemyWeapon.weaponClass === "melee") {
    movement.approach(enemy.root, hero.root, enemyWeapon.reachMeters, now, 1060);
  }
  hero.play("idle");
  enemy.play("windup");
}
function resolveDefense(now: number): void {
  if (presentation !== "windup" || battle.phase !== "enemy_windup") return;
  const grade = gradeReaction(reaction?.offsetMs ?? null);
  const defense = chosenDefense ?? "dodge";
  battle = resolveEnemyTurn(battle, grade, defense);
  director.impact(grade === "perfect" ? .10 : .17);
  const defenseLabel = defense === "dodge"
    ? { perfect: "PERFECT DODGE", parry: "DODGED", guard: "GLANCING DODGE", miss: "HIT!" }
    : { perfect: "PERFECT PARRY", parry: "PARRIED", guard: "GUARDED", miss: "HIT!" };
  notice(defenseLabel[grade], grade === "miss");
  audio(grade === "miss" ? 110 : 480);
  movement.retreat(enemy.root, now, ARCHERY_REACTION.durationMs);
  enemy.root.getWorldPosition(effectPoint).y += 1.4;
  if (grade !== "miss") {
    hero.root.getWorldPosition(effectPoint).y += 1.5;
    effects.impact(effectPoint, now);
  }
  setPhase("reaction", "reaction", now);
  choreography.start(ARCHERY_REACTION, now);
  reaction = null;
  chosenDefense = null;
  hero.play(grade === "miss" ? "hit" : defense === "dodge" ? "dodge" : "parry");
  enemy.play("idle");
  updateHud();
}
function attemptDefense(kind: DefenseAction): void {
  if (presentation !== "windup" || !reaction) return;
  if (!availableDefenses(battle.hero).includes(kind)) return;
  const now = performance.now();
  if (!reaction.capture(now)) {
    if (!reaction.captured) notice(now < reaction.impactAtMs ? "TOO EARLY" : "TOO LATE", true);
    return;
  }
  chosenDefense = kind;
  if (kind === "dodge") movement.dodge(hero.root, enemy.root, now, 750);
  hero.play(kind);
  notice(kind === "dodge" ? "DODGE TIMED" : "PARRY TIMED");
  updateHud();
  if (now >= reaction.impactAtMs) resolveDefense(now);
}
function changeWeapon(id: WeaponId): void {
  if (presentation !== "choice" || battle.phase !== "player_turn") return;
  battle = equipWeapon(battle, id);
  hero.equip(id);
  updateHud();
}
function reset(): void {
  choreography.cancel();
  effects.clear();
  reaction = null;
  chosenDefense = null;
  movement.reset();
  battle = beginBattle();
  hero.equip(battle.hero.weaponId);
  hero.play("idle");
  enemy.play("idle");
  feedback.classList.remove("visible");
  noticeUntil = 0;
  setPhase("choice", "decision");
}
function onCue(cue: CombatCue, at: number): void {
  switch (cue) {
    case "camera_draw": director.setShot("attack"); break;
    case "melee_draw": director.setShot("attack"); break;
    case "melee_impact":
      if (presentation !== "attack" || battle.phase !== "player_turn") break;
      // This is a real melee hit: the root must be within the equipped weapon's reach.
      if (movement.separation(hero.root, enemy.root) > equippedWeapon(battle.hero).reachMeters + .15) {
        notice("OUT OF REACH", true);
        break;
      }
      enemy.root.getWorldPosition(targetPoint);
      targetPoint.y += 1.7;
      effects.impact(targetPoint, at);
      battle = strike(battle, movement.separation(hero.root, enemy.root));
      director.impact(.18);
      enemy.play("hit");
      notice(battle.phase === "victory" ? "VICTORY" : "MELEE STRIKE");
      audio(160);
      updateHud();
      break;
    case "melee_recover":
      movement.retreat(hero.root, at, 675);
      director.setShot("decision");
      break;
    case "bow_release":
      hero.socketWorld(heroSocket);
      enemy.root.getWorldPosition(targetPoint);
      targetPoint.y += 1.7;
      effects.launch(heroSocket, targetPoint, at, 435);
      director.setShot("attack");
      audio(650);
      break;
    case "arrow_hit":
      if (presentation !== "attack" || battle.phase !== "player_turn") break;
      enemy.root.getWorldPosition(targetPoint);
      targetPoint.y += 1.7;
      effects.impact(targetPoint, at);
      battle = strike(battle, movement.separation(hero.root, enemy.root));
      director.impact(.15);
      enemy.play("hit");
      notice(battle.phase === "victory" ? "VICTORY" : "PRECISION STRIKE");
      audio(145);
      updateHud();
      break;
    case "camera_defense": director.setShot("defense"); break;
    case "enemy_swing": director.setShot("windup"); audio(235); break;
    case "enemy_impact":
      if (reaction?.captured) resolveDefense(at);
      break;
    case "reaction_close": resolveDefense(at); break;
    case "camera_recover": director.setShot("decision"); break;
  }
}
function keyDown(event: KeyboardEvent): void {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === "Space") { event.preventDefault(); startAttack(); }
  if (event.code === "KeyP") attemptDefense("parry");
  if (event.code === "KeyD") attemptDefense("dodge");
  if (event.code === "Digit1") changeWeapon("bow");
  if (event.code === "Digit2") changeWeapon("sword");
  if (event.code === "KeyR") reset();
}
attackButton.addEventListener("click", () => startAttack());
parryButton.addEventListener("click", () => attemptDefense("parry"));
dodgeButton.addEventListener("click", () => attemptDefense("dodge"));
weaponSelect.addEventListener("change", () => changeWeapon(weaponSelect.value as WeaponId));
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
updateHud();
let previous = performance.now();
let frames = 0;
let frameSeconds = 0;

function frame(now: number): void {
  const delta = Math.min(.05, Math.max(0, (now - previous) / 1000));
  previous = now;
  if (presentation === "intro" && now - phaseAt >= INTRO_MS) {
    loading.classList.add("hidden");
    setPhase("choice", "decision", now);
  }

  // Capture the sequence ID before callbacks, because callbacks can start a new sequence.
  movement.update(now);
  const activeSequence = choreography.sequenceId;
  const sample = choreography.advance(now);
  if (sample) {
    const baseTime = now - sample.elapsedMs;
    for (const cue of sample.cues) {
      // Stop processing stale events if a cue transitioned to a new sequence.
      if (activeSequence !== choreography.sequenceId && choreography.sequenceId !== null) break;
      if (presentation === "reaction" && activeSequence !== ARCHERY_REACTION.id) break;
      onCue(cue.type, baseTime + cue.atMs);
    }
    if (sample.finished && choreography.sequenceId === null) {
      if (presentation === "attack") {
        if (battle.phase === "victory") {
          setPhase("victory", "victory", now);
          hero.play("victory");
        } else if (battle.phase === "enemy_windup") {
          startEnemy(now);
        } else {
          // A melee attack blocked by invalid geometry returns control safely.
          setPhase("choice", "decision", now);
          hero.play("idle");
        }
      } else if (presentation === "windup") {
        resolveDefense(now);
      } else if (presentation === "reaction") {
        setPhase(battle.phase === "defeat" ? "defeat" : "choice",
          battle.phase === "defeat" ? "victory" : "decision", now);
        hero.play("idle");
        enemy.play("idle");
      }
    }
  }
  if (presentation === "windup") {
    const progress = Math.min(100, (now - phaseAt) / 1850 * 100);
    timingFill.style.width = progress + "%";
  } else {
    timingFill.style.width = "0%";
  }
  if (noticeUntil && now > noticeUntil) {
    feedback.classList.remove("visible");
    noticeUntil = 0;
  }
  const motionElapsed = Math.max(0, now - phaseAt);
  hero.face(enemy.root.position);
  enemy.face(hero.root.position);
  hero.update(delta, presentation === "attack" || presentation === "reaction" ? motionElapsed : undefined);
  enemy.update(delta, presentation === "windup" ? motionElapsed : undefined);
  // Apply moves started by timeline cues before updating camera tracking.
  movement.update(now);
  effects.update(now);
  director.update(delta);
  renderer.render(scene, camera);
  frames++;
  frameSeconds += delta;
  if (frameSeconds >= .8) {
    fpsDisplay.textContent = Math.round(frames / frameSeconds) + " FPS";
    frameSeconds = 0;
    frames = 0;
  }
}
renderer.setAnimationLoop(frame);
window.addEventListener("pagehide", () => {
  renderer.setAnimationLoop(null);
  observer.disconnect();
  window.removeEventListener("keydown", keyDown);
  choreography.cancel();
  arena.dispose();
  effects.dispose();
  hero.dispose();
  enemy.dispose();
  renderer.dispose();
  void soundContext?.close();
}, { once: true });
