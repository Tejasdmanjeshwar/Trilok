import * as THREE from "three";
import {
  aimBallisticAt, sampleTrajectory, effectsForAttack,
  type DamageBreakdown,
  type ProjectileTrajectory, type ProjectileAttackGeometry,
  type InterceptionPlan,
  type ReactionResolution, type PendingCounter, type ProjectileClash,
} from "@trilok/combat";
import { EnemyCombatBrain, ENEMY_PROFILES, type DefenseIntent } from "@trilok/combat-ai";
import { SequencePlayer } from "@trilok/choreography";
import { createArena, type ArenaInstance, type ArenaQuality } from "./world/arena";
import { createAnimatedWarrior, type AnimatedWarrior } from "./actors/AnimatedWarrior";
import { CombatCameraDirector, type CameraShot } from "./camera/CombatCameraDirector";
import { CombatEffects } from "./effects/CombatEffects";
import { ProjectileClashEffects } from "./effects/ProjectileClashEffects";
import { SurfaceMarks } from "./effects/SurfaceMarks";
import { CombatFeedback } from "./feedback/CombatFeedback";
import { ImpactEffectDirector, type ImpactVisualContext } from "./feedback/ImpactEffectDirector";
import { CombatAudio } from "./feedback/CombatAudio";
import {
  ARCHERY_ATTACK, MELEE_ATTACK, HEAVY_ATTACK, ARCHERY_REACTION, ENEMY_STRIKE,
  SWORD_RIPOSTE_COUNTER, type CombatCue,
} from "./combat/sequences";
import { EncounterSession } from "./combat/EncounterSession";
import { CombatCommandDeck } from "./ui/CombatCommandDeck";
import {
  CombatHitVolumes, type AimSnapshot, type SpatialImpact,
} from "./combat/CombatHitVolumes";
import { AimCursor } from "@trilok/input";
import { BrowserAimInput } from "./input/BrowserAimInput";

import { CombatMovementController } from "./movement/CombatMovementController";
import { getBuildIdentity, compactBuildLabel, formatBuildReport } from "./build-info";
import "./style.css";

const buildIdentity = getBuildIdentity();
const host = document.querySelector<HTMLDivElement>("#app");
if (!host) throw new Error("Missing application element.");
host.innerHTML = [
  '<main class="game"><div id="viewport" class="viewport"></div><div class="vignette"></div>',
  '<header class="top"><div class="brand-stack"><div class="brand">✦ <strong>TRILOK</strong><span id="playable-version"></span></div>',
  '<details class="build-picker"><summary id="build-summary" aria-label="Show build version and commit details"></summary>',
  '<div class="build-popover"><div class="build-field"><b>PLAYABLE</b><span id="build-playable"></span></div>',
  '<div class="build-field"><b>COMBAT CORE</b><span id="build-core"></span></div>',
  '<div class="build-field"><b>CHANNEL</b><span id="build-channel"></span></div>',
  '<div class="build-field"><b>COMMIT</b><code id="build-commit"></code></div>',
  '<div class="build-field"><b>BUILT (UTC)</b><span id="build-time"></span></div>',
  '<div class="build-field"><b>BUILD ID</b><code id="build-id"></code></div>',
  '<div class="build-actions"><button type="button" id="copy-build">COPY DETAILS</button><a href="/build-info.json" target="_blank" rel="noopener noreferrer">MANIFEST</a></div>',
  '</div></details></div>',
  '<div class="tools"><span id="fps">— FPS</span><button id="quality" type="button" aria-label="Toggle graphics quality">⚙ HIGH</button>',
  '<button id="audio" aria-label="Toggle sound">♫</button></div></header>',
  '<div class="location">ARANYA · THE FORGOTTEN SHRINE</div>',
  '<section class="enemy"><div>RAKSHASA <small>THE GUARDIAN · HFSM + UTILITY AI</small></div><div class="bar"><span id="enemy-bar"></span></div><p id="enemy-hp"></p><p id="enemy-energy"></p><p id="enemy-weapon"></p><p id="enemy-intent"></p></section>',
  '<section id="telegraph" class="telegraph"><b id="timing-title">⚔ INCOMING STRIKE</b><div class="timing"><span id="timing-fill"></span><i id="timing-feasible"></i><i id="timing-perfect"></i></div><small>PARRY AT THE FLASH</small></section>',
  '<div id="feedback" class="feedback" role="status" aria-live="polite"></div>',
  '<section class="command-panel" aria-label="Combat command deck">',
  '<div class="command-heading"><span class="command-ornament">✦</span><div><b>CHOOSE YOUR ACTION</b><small>THE WARRIOR’S DECREE</small></div><span class="command-key">Q · CYCLE</span></div>',
  '<div id="move-deck" class="move-deck" role="group" aria-label="Available combat actions"></div>',
  '<div id="aim-controls" class="aim-controls"><span id="aim-instructions">MOVE CROSSHAIR · CLICK OR FIRE</span>',
  '<span id="aim-armor-hint" role="status"></span></div><span id="move-hint"></span></section>',
  '<div id="aim-marker" class="aim-marker" aria-hidden="true"><span>⊕</span><small id="aim-marker-label"></small></div>',
  '<footer class="hud"><section class="hero"><div class="sigil">✶</div><div class="hero-info"><strong>TRIAL WARRIOR</strong><small>THE WAYFARER · ARMS <span class="weapon-keys">[1 / 2]</span></small>',
  '<div id="weapon-deck" class="weapon-deck" role="group" aria-label="Equipped arms"></div>',
  '<div class="bar hero-bar"><span id="hero-bar"></span></div><p id="hero-hp"></p>',
  '<div class="energy-info"><b id="hero-energy-label">ENERGY</b><span id="actions-left"></span></div>',
  '<div class="energy-track"><span id="hero-energy-bar"></span></div></div></section>',
  '<div class="actions"><button id="attack" class="primary">➶ <span>STRIKE<small>SPACE</small></span></button>',
  '<button id="react">✦ <span>PARRY<small>P</small></span></button>',
  '<button id="dodge">↝ <span>DODGE<small>D</small></span></button>',
  '<button id="end-turn">✓ <span>END TURN<small>E</small></span></button>',
  '<button id="restart">↻ <span>RESTART<small>R</small></span></button></div></footer>',
  '<aside class="status"><b id="phase">THE DUEL BEGINS</b><span id="message">Select STRIKE to begin.</span></aside>',
  '<div id="loading" class="loading">✦ <span>ENTERING THE SHRINE</span></div></main>',
].join("");

function query<T extends HTMLElement>(selector: string): T {
  const result = host!.querySelector<T>(selector);
  if (!result) throw new Error("Missing element " + selector);
  return result;
}
query<HTMLElement>("#playable-version").textContent =
  "COMBAT ARENA · V" + buildIdentity.playableVersion;
query<HTMLElement>("#build-summary").textContent = compactBuildLabel(buildIdentity);
query<HTMLElement>("#build-playable").textContent = "v" + buildIdentity.playableVersion;
query<HTMLElement>("#build-core").textContent = "v" + buildIdentity.combatEngineVersion;
query<HTMLElement>("#build-channel").textContent = buildIdentity.channel;
query<HTMLElement>("#build-commit").textContent = buildIdentity.commitSha;
query<HTMLElement>("#build-time").textContent = buildIdentity.builtAtUtc;
query<HTMLElement>("#build-id").textContent = buildIdentity.buildId;
const copyBuildButton = query<HTMLButtonElement>("#copy-build");
copyBuildButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(formatBuildReport(buildIdentity));
    copyBuildButton.textContent = "COPIED";
  } catch {
    copyBuildButton.textContent = "COPY UNAVAILABLE";
  }
});
const viewport = query<HTMLDivElement>("#viewport");
const qualityButton = query<HTMLButtonElement>("#quality");
const attackButton = query<HTMLButtonElement>("#attack");
const parryButton = query<HTMLButtonElement>("#react");
const dodgeButton = query<HTMLButtonElement>("#dodge");
const moveDeckRoot = query<HTMLElement>("#move-deck");
const weaponDeckRoot = query<HTMLElement>("#weapon-deck");
const moveHint = query<HTMLElement>("#move-hint");
const aimControls = query<HTMLElement>("#aim-controls");
const aimArmorHint = query<HTMLElement>("#aim-armor-hint");
const aimMarker = query<HTMLElement>("#aim-marker");
const aimMarkerLabel = query<HTMLElement>("#aim-marker-label");
const endTurnButton = query<HTMLButtonElement>("#end-turn");
const heroEnergyBar = query<HTMLElement>("#hero-energy-bar");
const heroEnergyLabel = query<HTMLElement>("#hero-energy-label");
const enemyEnergyLabel = query<HTMLElement>("#enemy-energy");
const enemyWeaponLabel = query<HTMLElement>("#enemy-weapon");
const enemyIntentLabel = query<HTMLElement>("#enemy-intent");
const actionsLeftLabel = query<HTMLElement>("#actions-left");
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
const defenseHint = query<HTMLElement>("#telegraph small");
const timingFill = query<HTMLElement>("#timing-fill");
const timingFeasible = query<HTMLElement>("#timing-feasible");
const timingPerfect = query<HTMLElement>("#timing-perfect");
const timingTitle = query<HTMLElement>("#timing-title");
const feedback = query<HTMLElement>("#feedback");
const loading = query<HTMLElement>("#loading");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let quality: ArenaQuality = /Android|iPhone|iPad/i.test(navigator.userAgent) ? "low" : "high";
qualityButton.textContent = "⚙ " + (quality === "high" ? "HIGH" : "MOBILE");
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
const projectiles = new ProjectileClashEffects(scene);
const surfaceMarks = new SurfaceMarks();
const visualFeedback = new CombatFeedback(scene, host!, reduceMotion);
const sound = new CombatAudio();
const impactDirector = new ImpactEffectDirector();
impactDirector
  .register("blood_splat", context => visualFeedback.emit(
    "blood",context.point,context.presentAtMs))
  .register("wound_mark", context => {
    if(context.attachment)surfaceMarks.add("wound",{
      point:context.point,normal:context.normal,anchor:context.attachment,
    });
  })
  .register("embed_arrow", context => {
    if(context.projectileId && context.attachment)
      projectiles.embed(context.projectileId,context.attachment,
        context.point,context.velocity,.12);
  });
const heroSocket = new THREE.Vector3();
const targetPoint = new THREE.Vector3();
const effectPoint = new THREE.Vector3();
const choreography = new SequencePlayer<CombatCue>();
type Presentation =
  | "intro" | "choice" | "attack" | "windup" | "reaction"
  | "enemy_pause" | "counter" | "projectile" | "victory" | "defeat";

const session = new EncounterSession();
const commandDeck = new CombatCommandDeck(moveDeckRoot, weaponDeckRoot, {
  onMoveSelected: () => updateHud(),
  onEquip: id => changeWeapon(id),
});
const heroHitVolumes = new CombatHitVolumes(hero.root, session.state.actors.hero!, session.catalog);
const enemyHitVolumes = new CombatHitVolumes(enemy.root, session.state.actors.enemy!, session.catalog);
const aimCursor = new AimCursor();
let hoveredRegion: string | null = null;
let shotSnapshot: AimSnapshot | null = null;
let pendingSpatialImpact: SpatialImpact | null = null;
let followthroughAim: AimSnapshot | null = null;
let incomingProjectileId: string | null = null;
let interceptorProjectileId: string | null = null;
let pendingInterceptRelease: { id:string; plan:InterceptionPlan } | null = null;
let lastClashTick=0;
const clashPoint = new THREE.Vector3();
const projectileTarget = new THREE.Vector3();
let impactWorldPoint: THREE.Vector3 | null = null;
let enemyBrain = new EnemyCombatBrain(ENEMY_PROFILES.capable, 119);
let plannedEnemyDefense: DefenseIntent | null = null;
let enemyIntent = "OBSERVING";
let presentation: Presentation = "intro";
let phaseAt = performance.now();
let noticeUntil = 0;
let enemyPauseUntil = 0;
let lastMessage = "Choose a move. Energy and actions determine whether you may continue.";
const INTRO_MS = reduceMotion ? 250 : 1500;
const browserAim = new BrowserAimInput(renderer.domElement, aimCursor, {
  active: () => isAimActive(),
  fire: () => startPlayerAttack(),
});
function isAimActive(): boolean {
  return isPlayerDecision() && !aimControls.hidden;
}

function dust(actor: AnimatedWarrior, now: number): void {
  effectPoint.set(actor.root.position.x, .18, actor.root.position.z);
  visualFeedback.emit("step", effectPoint, now);
}

function notice(message: string, warning = false): void {
  feedback.textContent = message;
  feedback.className = warning ? "feedback visible warning" : "feedback visible";
  noticeUntil = performance.now() + 1250;
}

function setPhase(next: Presentation, shot: CameraShot, now = performance.now()): void {
  presentation = next;
  phaseAt = now;
  director.setShot(shot);
  if (next === "choice" || next === "victory" || next === "defeat" || next === "enemy_pause") {
    choreography.cancel();
  }
  updateHud();
}

function isPlayerDecision(): boolean {
  return presentation === "choice" &&
    session.state.phase === "decision" && session.state.activeActorId === "hero";
}

const MOVE_NAMES: Readonly<Record<string, string>> = {
  arrow: "Arrow",
  recover_shot: "Recovery shot",
  slash: "Quick slash",
  heavy_crush: "Heavy crush",
};
function moveDescription(moveId: string): string {
  const move = session.catalog.attacks[moveId]!;
  const cost = move.resourceCost === 0 ? "FREE" : move.resourceCost + " EN";
  const policy = move.turnPolicy?.continuation === "continue" ? "CONTINUE" : "ENDS TURN";
  const gain = move.turnPolicy?.energyGainOnCompletion
    ? " · +" + move.turnPolicy.energyGainOnCompletion + " EN"
    : "";
  return cost + " · " + policy + gain;
}

/** Use the same domain legality query as the scripted opponent and future AI. */
function updateMovePicker(): void {
  const player = session.state.actors.hero!;
  const available = isPlayerDecision()
    ? session.legalAttacks("enemy", movement.separation(hero.root, enemy.root))
    : [];
  commandDeck.update({
    catalog: session.catalog,
    equippedId: player.equippedId,
    equipmentIds: player.loadoutIds,
    legalMoveIds: available,
    legalSwitchIds: isPlayerDecision() ? session.legalSwitches("hero") : [],
    canDecide: isPlayerDecision(),
  });
  const selected = commandDeck.selectedMoveId;
  const move = session.catalog.attacks[selected];
  const canAim = isPlayerDecision() &&
    move?.targeting?.mode === "free_aim" && available.includes(selected);
  aimControls.hidden = !canAim;
  aimMarker.hidden = !canAim;
  if (canAim) director.setShot("aim");
  else if (isPlayerDecision()) director.setShot("decision");
  moveHint.textContent = move ? moveDescription(selected) :
    "No move available · End turn to recover Energy";
  attackButton.disabled = !isPlayerDecision() || !available.includes(selected);
  const action = query<HTMLElement>("#attack span");
  if (action.firstChild) action.firstChild.textContent = canAim ? "FIRE" : "STRIKE";
}

function heroRig(): AnimatedWarrior { return hero; }

function updateHud(): void {
  const state = session.state;
  const player = state.actors.hero!;
  const opponent = state.actors.enemy!;
  heroHp.textContent = player.hp + " / " + player.maxHp + " HP";
  enemyHp.textContent = opponent.hp + " / " + opponent.maxHp + " HP";
  heroBar.style.width = 100 * player.hp / player.maxHp + "%";
  enemyBar.style.width = 100 * opponent.hp / opponent.maxHp + "%";
  heroEnergyBar.style.width = 100 * player.resource / player.maxResource + "%";
  heroEnergyLabel.textContent = "ENERGY " + player.resource + " / " + player.maxResource;
  enemyEnergyLabel.textContent = "ENERGY " + opponent.resource + " / " + opponent.maxResource;
  enemyWeaponLabel.textContent = session.catalog.equipment[opponent.equippedId]?.label ?? opponent.equippedId;
  enemyIntentLabel.textContent = "AI · " + enemyIntent;
  const remaining = state.rules.maxActionsPerTurn - state.turnBudget.actionsUsed;
  actionsLeftLabel.textContent = remaining + " / " + state.rules.maxActionsPerTurn + " ACTIONS";
  phaseDisplay.textContent = state.phase === "complete"
    ? state.victorId === "hero" ? "VICTORY" : "DEFEAT"
    : "TURN " + state.turn + (state.activeActorId === "hero" ? " · YOUR ACTION" : " · ENEMY");
  messageDisplay.textContent = lastMessage;
  endTurnButton.disabled = !isPlayerDecision();
  const reactions = presentation === "windup" ? session.legalReactions() : [];
  const parry = reactions.find(option => option.technique !== "dodge");
  const dodge = reactions.find(option => option.technique === "dodge");
  const already = session.activeDefense !== null;
  parryButton.disabled = !parry || already || presentation !== "windup";
  dodgeButton.disabled = !dodge || already || presentation !== "windup";
  const parryName = parry?.technique === "projectile_intercept" ? "INTERCEPT" : "PARRY";
  query<HTMLElement>("#react span").firstChild!.textContent = parryName;
  const hints: string[] = [];
  if (dodge) hints.push("DODGE " + (dodge.timing.earlyTicks + dodge.timing.lateTicks) +
    "ms · " + dodge.resourceCost + " EN");
  if (parry) hints.push(parryName + " " + (parry.timing.earlyTicks + parry.timing.lateTicks) +
    "ms · " + parry.resourceCost + " EN");
  const window=parry?.feasibleWindow;
  timingFeasible.hidden=!window;
  timingPerfect.hidden=!window;
  if(window&&state.pending){
    const start=state.pending.startedTick;
    const length=Math.max(1,state.pending.impactTick-start);
    const percent=(tick:number)=>Math.max(0,Math.min(100,(tick-start)/length*100));
    timingFeasible.style.left=percent(window.firstTick)+"%";
    timingFeasible.style.width=(percent(window.lastTick)-percent(window.firstTick))+"%";
    timingPerfect.style.left=percent(window.perfectStartTick)+"%";
    timingPerfect.style.width=Math.max(1.2,
      percent(window.perfectEndTick)-percent(window.perfectStartTick))+"%";
    timingTitle.textContent="➶ INTERCEPT THE INCOMING ARROW";
    defenseHint.textContent="FIRE INSIDE GOLD · "+(window.preferredDualTarget
      ? "COUNTER TRAJECTORY POSSIBLE" : "INTERCEPT TRAJECTORY POSSIBLE")+
      " · "+parry!.resourceCost+" ENERGY";
  }else{
    timingTitle.textContent="⚔ INCOMING STRIKE";
    defenseHint.textContent=hints.length?hints.join(" · ")+" AT IMPACT":"NO LEGAL DEFENSE";
  }
  telegraph.classList.toggle("show", presentation === "windup");
  hero.root.visible = true;
  enemy.root.visible = true;
  updateMovePicker();
}

function sequenceFor(moveId: string) {
  if (moveId === "heavy_crush" || moveId === "rakshasa_heavy") return HEAVY_ATTACK;
  if (session.catalog.attacks[moveId]?.delivery === "ranged_projectile") {
    return ARCHERY_ATTACK;
  }
  return MELEE_ATTACK;
}

/** One immutable snapshot shared by the reaction planner, renderer and hit test. */
function projectileGeometry(
  attacker:AnimatedWarrior, defender:AnimatedWarrior,
  startTick:number,aimAt?:THREE.Vector3,
):ProjectileAttackGeometry {
  const origin=attacker.socketWorld(new THREE.Vector3());
  const defenderHit=defender===hero?heroHitVolumes:enemyHitVolumes;
  const attackerHit=attacker===hero?heroHitVolumes:enemyHitVolumes;
  const destination=aimAt ?? defenderHit.worldCenter("torso",new THREE.Vector3());
  const stationaryTarget=attackerHit.worldCenter("torso",new THREE.Vector3());
  const plain=(v:THREE.Vector3)=>({x:v.x,y:v.y,z:v.z});
  return {
    incoming:aimBallisticAt(startTick+715,plain(origin),plain(destination),
      startTick+1150,{x:0,y:-9.81,z:0}),
    defenderLaunchOrigin:plain(defender.socketWorld(new THREE.Vector3())),
    attackerPosition:{
      kind:"ballistic",startTick,
      origin:plain(stationaryTarget),
      velocity:{x:0,y:0,z:0},
      acceleration:{x:0,y:0,z:0},
    },
  };
}

function releaseScheduledInterception(now:number):void {
  const pending=pendingInterceptRelease;
  if(!pending||now<pending.plan.releaseTick)return;
  pendingInterceptRelease=null;
  projectiles.launchTrajectory(pending.id,pending.plan.flight,now);
  sound.play("release");
}

function startPlayerAttack(now = performance.now()): void {
  if (!isPlayerDecision()) return;
  const moveId = commandDeck.selectedMoveId;
  const move = session.catalog.attacks[moveId];
  if (!move) return;
  try {
    // A manual aim ray is selected in screen space, never snapped to a
    // preselected region. The core still resolves actual contact at impact.
    const manualAim = move.targeting?.mode === "free_aim";
    const aimPoint = aimCursor.value;
    const candidate = manualAim
      ? enemyHitVolumes.snapshotCameraAim(camera, aimPoint.x, aimPoint.y,
          hero.socketWorld(heroSocket), move.reachMeters)
      : move.delivery === "ranged_projectile"
        ? enemyHitVolumes.snapshot(hero.socketWorld(heroSocket),
            "torso", move.reachMeters)
        : null;
    session.attack("hero", "enemy", moveId,
      movement.separation(hero.root, enemy.root), now,
      manualAim ? candidate?.regionId ?? null : null,
      move.delivery==="ranged_projectile" ?
        projectileGeometry(hero,enemy,Math.floor(now),candidate?.toward) : undefined);
    shotSnapshot = candidate;
    impactWorldPoint = null;
    pendingSpatialImpact = null;
  } catch (error) {
    notice(error instanceof Error ? error.message : "Attack unavailable", true);
    updateHud();
    return;
  }
  plannedEnemyDefense = enemyBrain.planReaction(
    session.state, session.catalog, "enemy", Math.floor(now));
  enemyIntent = plannedEnemyDefense ? "DEFENSE READY" : "WATCHING ATTACK";
  setPhase("attack", "attack", now);
  choreography.start(sequenceFor(moveId), now);
  if (move.delivery === "melee_contact") {
    movement.approach(hero.root, enemy.root, move.reachMeters, now, 1080);
    dust(hero, now);
  }
  hero.play(move.delivery === "melee_contact" ? "melee" : "attack");
  enemy.play("idle");
  effects.clear();
  projectiles.clear();
  incomingProjectileId = null;
  interceptorProjectileId = null;
  followthroughAim = null;
  pendingInterceptRelease=null;
  sound.play(move.delivery === "melee_contact" ? "step" : "draw");
  lastMessage = (MOVE_NAMES[moveId] ?? moveId) + " committed. " +
    move.resourceCost + " Energy spent.";
  updateHud();
}

function showEnemyIntent(text: string): void {
  enemyIntent = text;
  enemyIntentLabel.textContent = "AI · " + enemyIntent;
}

function beginEnemyAttack(moveId: string, now: number): void {
  const move = session.catalog.attacks[moveId]!;
  const targetRegion=enemyBrain.selectTargetRegion(session.state,session.catalog,"hero",moveId);
  const enemyShot=move.delivery==="ranged_projectile"
    ? heroHitVolumes.snapshot(enemy.socketWorld(heroSocket),targetRegion??"torso",move.reachMeters)
    : null;
  session.attack("enemy", "hero", moveId,
    movement.separation(enemy.root, hero.root), now, targetRegion,
    enemyShot?projectileGeometry(enemy,hero,Math.floor(now),enemyShot.toward):undefined);
  shotSnapshot=enemyShot;
  impactWorldPoint = null;
  pendingSpatialImpact = null;
  enemyBrain.markCommitted();
  plannedEnemyDefense = null;
  projectiles.clear();
  incomingProjectileId = null;
  interceptorProjectileId = null;
  followthroughAim = null;
  pendingInterceptRelease=null;
  setPhase("windup", "defense", now);
  const sequence = moveId === "overhead_slash" ? ENEMY_STRIKE : sequenceFor(moveId);
  choreography.start(sequence, now);
  if (move.delivery === "melee_contact") {
    movement.approach(enemy.root, hero.root, move.reachMeters, now, 1050);
    dust(enemy, now);
    sound.play("step");
    enemy.play(moveId === "overhead_slash" ? "windup" : "melee");
    showEnemyIntent("MELEE · " + moveId.replaceAll("_", " ").toUpperCase());
    lastMessage = "Rakshasa melee attack incoming. React at the impact!";
  } else {
    enemy.play("attack");
    sound.play("draw");
    showEnemyIntent("RANGED · " + moveId.replaceAll("_", " ").toUpperCase());
    lastMessage = "Rakshasa arrow incoming. Ranged timing is tighter!";
  }
  hero.play("idle");
  updateHud();
}

/** B1: bounded tactical HFSM + utility choice, never hardcoded attack IDs. */
function beginEnemyDecision(now: number): void {
  if (session.state.phase !== "decision" || session.state.activeActorId !== "enemy") return;
  const intent = enemyBrain.decide({
    state: session.state, catalog: session.catalog,
    actorId: "enemy", targetId: "hero",
    distanceMeters: movement.separation(enemy.root, hero.root),
    tick: Math.floor(now),
  });
  if (intent.kind === "equip") {
    session.equip("enemy", intent.equipmentId);
    const newClass = intent.equipmentId === "rakshasa_bow" ? "bow" : "sword";
    enemy.equip(newClass);
    enemy.play("idle");
    showEnemyIntent("SWITCHING TO " + newClass.toUpperCase());
    lastMessage = "The guardian changes to " + newClass.toUpperCase() +
      ". It costs Energy and is restricted to one switch per turn.";
    enemyPauseUntil = now + 640;
    setPhase("enemy_pause", "defense", now);
    return;
  }
  if (intent.kind === "end_turn") {
    session.end("enemy");
    enemyBrain.markRecovering();
    showEnemyIntent("RECOVERING");
    lastMessage = "Guardian conserves Energy. Your turn.";
    enemyPauseUntil = now + 470;
    setPhase("enemy_pause", "decision", now);
    return;
  }
  beginEnemyAttack(intent.moveId, now);
}

function showEnding(now: number): void {
  if (session.state.phase !== "complete") return;
  const won = session.state.victorId === "hero";
  lastMessage = won ? "Victory! The guardian has fallen." : "Defeat. Restart to try again.";
  setPhase(won ? "victory" : "defeat", won ? "victory" : "reaction", now);
  if (won) hero.play("victory");
  else hero.play("hit");
  updateHud();
}

function enterNextTurn(now: number): void {
  if (session.state.phase === "complete") {
    showEnding(now);
  } else if (session.state.activeActorId === "enemy") {
    if (presentation === "enemy_pause") {
      beginEnemyDecision(now);
    } else {
      enemyPauseUntil = now + enemyBrain.profile.minThinkTicks;
      setPhase("enemy_pause", "defense", now);
    }
  } else {
    hero.play("idle");
    enemy.play("idle");
    lastMessage = "Your turn. Choose another move or end your turn.";
    setPhase("choice", "decision", now);
  }
}

function activeIncomingId(): string | null {
  const attack = session.state.pending;
  if (!attack) return null;
  return "attack:" + attack.attackerId + ":" +
    attack.startedTick + ":" + attack.hits[attack.hitIndex]!.id;
}

/**
 * Both arrows must already exist before collision. The interceptor launches
 * once, from its actual bow socket, aimed at the incoming flight's projected
 * clash location. No animation or arrow is created after a perfect clash.
 */
function launchInterception(defenderId:"hero"|"enemy",inputTick:number):void {
  const pending=session.state.pending;
  const plan=session.activeInterceptionPlan;
  const incomingId=activeIncomingId();
  if(!pending||!plan||!incomingId)return;
  interceptorProjectileId="intercept:"+defenderId+":"+
    pending.startedTick+":"+pending.hits[pending.hitIndex]!.id;
  // The original arrow is already moving along the exact ballistic model.
  // The defender's one authored release will follow this solved intercept arc.
  pendingInterceptRelease={id:interceptorProjectileId,plan};
  releaseScheduledInterception(inputTick);
}

function attemptDefense(kind: "dodge" | "parry"): void {
  if (presentation !== "windup" || session.state.pending?.defenderId !== "hero") return;
  const now = performance.now();
  const available = session.legalReactions();
  const option = kind === "dodge"
    ? available.find(o => o.technique === "dodge")
    : available.find(o => o.technique !== "dodge");
  if (!option) {
    notice("DEFENSE UNAVAILABLE · CHECK EQUIPMENT/ENERGY", true);
    return;
  }
  const capture = session.captureDefense(option.technique, now);
  if (!capture.accepted) {
    if (capture.reason !== "already_selected") {
      notice(capture.reason === "too_early" ? "TOO EARLY" :
        capture.reason === "too_late" ? "TOO LATE" : "DEFENSE UNAVAILABLE", true);
    }
    return;
  }
  if (kind === "dodge") {
    movement.dodge(hero.root, enemy.root, now, 750);
    dust(hero, now);
  }
  hero.play(option.technique === "projectile_intercept" ? "intercept" : kind);
  if (option.technique === "projectile_intercept") {
    launchInterception("hero", now);
  } else {
    sound.play(kind);
  }
  notice((kind === "dodge" ? "DODGE" : "PARRY") +
    " TIMED · " + option.resourceCost + " ENERGY");
  updateHud();
  finishEnemyImpact(now);
}

function changeWeapon(id: string): void {
  if (!isPlayerDecision() || (id !== "bow" && id !== "sword")) return;
  try {
    session.equip("hero", id);
  } catch (error) {
    notice(error instanceof Error ? error.message : "Cannot equip weapon", true);
    updateHud();
    return;
  }
  hero.equip(id);
  lastMessage = "Equipped " + session.catalog.equipment[id]!.label +
    ". Switch cost paid from Energy.";
  sound.play("ui");
  updateHud();
}

function playerEndTurn(): void {
  if (!isPlayerDecision()) return;
  session.end("hero");
  lastMessage = "Turn ended. The guardian considers its next move.";
  enterNextTurn(performance.now());
}

function reset(): void {
  choreography.cancel();
  effects.clear();
  projectiles.clear();
  surfaceMarks.clear();
  incomingProjectileId = null;
  interceptorProjectileId = null;
  followthroughAim = null;
  pendingInterceptRelease=null;
  impactDirector.clear();
  visualFeedback.reset();
  movement.reset();
  session.reset();
  shotSnapshot = null;
  aimCursor.recenter();
  hoveredRegion = null;
  pendingSpatialImpact = null;
  impactWorldPoint = null;
  enemyBrain = new EnemyCombatBrain(ENEMY_PROFILES.capable, 119);
  plannedEnemyDefense = null;
  enemyIntent = "OBSERVING";
  hero.equip("bow");
  enemy.equip("sword");
  hero.play("idle");
  enemy.play("idle");
  feedback.classList.remove("visible");
  noticeUntil = 0;
  lastMessage = "Choose a move. Energy and actions determine whether you may continue.";
  loading.classList.add("hidden");
  setPhase("choice", "decision");
}

/** One contact event controls presentation; authors select effects by ID. */
function presentConfirmedHit(
  breakdown:DamageBreakdown,
  spatial:SpatialImpact|null,
  projectileId:string|null,
  now:number,
):void {
  const isHero=breakdown.defenderId==="hero";
  const target=isHero?hero:enemy;
  if(spatial)targetPoint.copy(spatial.impactPoint);
  else{
    target.root.getWorldPosition(targetPoint);
    targetPoint.y+=1.65;
  }
  const kind=breakdown.critical?"critical":
    breakdown.reasons.some(reason=>reason.startsWith("armor:"))?"armor":
    breakdown.reasons.includes("weak_point")?"weakpoint":"hit";
  effects.impact(targetPoint,now);
  visualFeedback.emit(kind,targetPoint,now,breakdown.finalDamage,isHero);
  const region=breakdown.actualRegionId;
  target.play(breakdown.critical?"hit_heavy":
    region==="head"?"hit_head":
    region==="left_arm"||region==="right_arm"?"hit_arm":"hit");
  sound.play("hit");
  director.impact(breakdown.critical?.23:isHero?.15:.12);
  const context:ImpactVisualContext={
    projectileId,point:targetPoint.clone(),
    normal:spatial?.contactNormal?.clone()??new THREE.Vector3(0,1,0),
    velocity:spatial?.velocity?.clone()??new THREE.Vector3(),
    regionId:region,attachment:spatial?.attachment??null,
    tick:spatial?.contactTick??Math.floor(now),presentAtMs:now,
  };
  impactDirector.dispatch(
    (projectileId??"melee")+":"+breakdown.hitId+":"+
      breakdown.attackerId+":"+session.state.turn,
    effectsForAttack(session.catalog,breakdown.moveId,breakdown),context);
  if(projectileId)projectiles.stop(projectileId);
}

/** Find actual first contact, not a guessed hit at the authored deadline. */
function trajectoryImpact(
  pending:NonNullable<typeof session.state.pending>,
  volumes:CombatHitVolumes,
  now:number,
):SpatialImpact|null {
  const path=pending.projectileGeometry?.incoming;
  if(!path)return null;
  const release=path.kind==="ballistic"?path.startTick:path.segments[0]!.startTick;
  if(now<release)return null;
  const end=Math.min(Math.floor(now),pending.impactTick);
  const hit=volumes.firstTrajectoryContact(path,release,end);
  if(hit)return hit;
  if(now<pending.impactTick)return null;
  const p=sampleTrajectory(path,pending.impactTick).position;
  return {actualRegionId:null,contact:false,
    impactPoint:new THREE.Vector3(p.x,p.y,p.z)};
}

/**
 * One authoritative midair clash: two launched arrows meet, one or both
 * shatter, and the SAME survivor mesh continues without a new release clip.
 */
function playProjectileClash(clash: ProjectileClash, now: number): void {
  const time=clash.clashTick;
  lastClashTick=time;
  const computedPoint=clash.interceptionPlan?.clashPoint;
  if(computedPoint){
    clashPoint.set(computedPoint.x,computedPoint.y,computedPoint.z);
  }else{
    projectiles.position(clash.incomingProjectileId,time,clashPoint);
  }
  projectiles.clash(clash.incomingProjectileId,clash.interceptorProjectileId,
    clash.verdict,clashPoint,now);
  visualFeedback.emit("intercept",clashPoint,now,0,false);
  sound.play("clash");
  director.impact(.13);
  if (clash.continuation && clash.survivingProjectileId) {
    const continued=clash.continuation;
    const target=continued.defenderId==="hero" ? hero : enemy;
    const hitVolumes=continued.defenderId==="hero" ? heroHitVolumes : enemyHitVolumes;
    target.root.getWorldPosition(projectileTarget);
    projectileTarget.y+=1.7;
    // Solved projectile flight continues unchanged, with the SAME object,
    // velocity, gravity and ID. Never redirect to the opponent after clash.
    if(continued.trajectory){
      followthroughAim=null;
    }else{
      followthroughAim=continued.source==="incoming"
        ? shotSnapshot : hitVolumes.snapshot(clashPoint,"torso",36);
      const destination=followthroughAim?.toward ?? projectileTarget;
      projectiles.continue(continued.projectileId,destination,
        time,Math.max(1,continued.impactTick-time));
    }
    setPhase("projectile","counter",now);
    choreography.cancel();
    lastMessage=continued.source==="interceptor"
      ? "CLASH · Interception arrow survived and is continuing toward the attacker!"
      : "CLASH · Incoming arrow survived and is still approaching!";
    notice(continued.source==="interceptor" ? "INTERCEPT SURVIVES · COUNTER!" :
      "INCOMING ARROW SURVIVES",continued.source==="incoming");
  } else {
    // A move can win the clash yet suppress follow-through. Retire the visual
    // survivor rather than leaving a frozen arrow hanging in the world.
    if(clash.survivingProjectileId)projectiles.stop(clash.survivingProjectileId);
    followthroughAim=null;
    setPhase("reaction","reaction",now);
    choreography.start(ARCHERY_REACTION,now);
    lastMessage=clash.verdict==="mutual_destruction"
      ? "CLASH · Both projectiles shattered in midair."
      : "CLASH · Interception won, but this move prohibits follow-through.";
    notice(clash.verdict==="mutual_destruction"
      ? "MID-AIR CLASH · BOTH ARROWS DESTROYED"
      : "PROJECTILE NEUTRALIZED · NO COUNTER");
  }
  updateHud();
}

function finishSurvivingProjectile(now:number):void {
  const pending=session.state.pendingProjectile;
  if(!pending || presentation!=="projectile")return;
  const volumes=pending.defenderId==="hero"?heroHitVolumes:enemyHitVolumes;
  const end=Math.min(Math.floor(now),pending.impactTick);
  const hit=pending.trajectory && end>=lastClashTick
    ? volumes.firstTrajectoryContact(pending.trajectory,lastClashTick,end)
    : null;
  if(!hit && now<pending.impactTick)return;
  const spatial=hit ?? (pending.trajectory
    ? volumes.impactTrajectory(pending.trajectory,lastClashTick,pending.impactTick)
    : followthroughAim?volumes.impact(followthroughAim):null);
  const from=pending.attackerId==="hero"?hero:enemy;
  const to=pending.defenderId==="hero"?hero:enemy;
  const result=session.projectileIfReady(now,{
    projectileId:pending.projectileId,
    distanceAtImpactMeters:movement.separationForHit(from.root,to.root),
    ...(spatial?{
      actualRegionId:spatial.actualRegionId,contact:spatial.contact,
      ...(spatial.contactTick!==undefined?{contactTick:spatial.contactTick}:{})
    }:{contact:false,actualRegionId:null}),
  });
  if(!result)return;
  if(result.outcome.damage>0){
    presentConfirmedHit(result.outcome.breakdown,spatial,
      pending.projectileId,now);
    notice((pending.source==="interceptor"?"COUNTER HIT · ":"ARROW HIT · ")+
      result.outcome.damage+" DAMAGE");
  }else{
    projectiles.stop(pending.projectileId);
    if(spatial)targetPoint.copy(spatial.impactPoint);
    else{to.root.getWorldPosition(targetPoint);targetPoint.y+=1.7;}
    sound.play("miss");
    visualFeedback.emit("miss",targetPoint,now,0,pending.defenderId==="hero");
    notice("SURVIVING PROJECTILE MISSED",true);
  }
  lastMessage="Surviving projectile resolved at its first contact or miss.";
  followthroughAim=null;
  shotSnapshot=null;
  setPhase("reaction","reaction",now);
  choreography.start(ARCHERY_REACTION,now);
}

function playOutcome(result: ReactionResolution, now: number): void {
  const out = result.outcome;
  if(out.projectileClash){
    playProjectileClash(out.projectileClash,now);
    return;
  }
  const projectileId=incomingProjectileId;
  incomingProjectileId=null;
  const target = out.defenderId === "hero" ? hero : enemy;
  const isHero = out.defenderId === "hero";
  target.root.getWorldPosition(targetPoint);
  targetPoint.y += 1.7;
  if (impactWorldPoint) targetPoint.copy(impactWorldPoint);
  if (out.result === "out_of_reach" || out.result === "missed") {
    notice(out.result === "out_of_reach" ? "OUT OF REACH" : "MISSED", true);
    sound.play("miss");
  } else if (out.technique && out.grade !== "miss") {
    const kind = out.technique === "dodge" ? "dodge" :
      out.technique === "projectile_intercept" ? "intercept" : "parry";
    target.play(kind === "dodge" ? "dodge" :
      kind === "intercept" ? "intercept" : "parry");
    director.setShot("counter");
    visualFeedback.emit(kind, targetPoint, now, out.damage, isHero);
    if (kind !== "dodge") effects.impact(targetPoint, now);
    notice((isHero ? "" : "ENEMY ") +
      kind.toUpperCase() + " · " + out.grade.toUpperCase());
    sound.play(kind);
  } else if (out.damage > 0) {
    presentConfirmedHit(out.breakdown,pendingSpatialImpact,projectileId,now);
    notice((out.breakdown.critical?"PRECISION CRITICAL · ":"")+
      out.damage+" DAMAGE");
  }
  if(projectileId && out.damage===0)projectiles.stop(projectileId);
  impactWorldPoint = null;
  const trace = out.breakdown.reasons;
  const mitigation = trace.some(reason => reason.startsWith("armor:"))
    ? " · ARMOR" : "";
  lastMessage = out.damage + " damage" + mitigation + ". " +
    (session.state.phase === "complete" ? "Encounter complete." :
     out.attackerId === "hero" ? "Continue if you have actions." : "Recover and respond.");
  updateHud();
}

/** AI reactions are scheduled from the telegraph, not granted at impact. */
function applyEnemyDefense(now: number): number | undefined {
  const pending = session.state.pending;
  if (!pending || pending.defenderId !== "enemy" || !plannedEnemyDefense) return undefined;
  const scheduled = plannedEnemyDefense.atTick;
  if (Math.floor(now) < scheduled) return scheduled;
  const chosen = plannedEnemyDefense;
  plannedEnemyDefense = null;
  const capture = session.captureDefense(chosen.technique, chosen.atTick, "enemy");
  if (capture.accepted) {
    if (chosen.technique === "dodge") {
      movement.dodge(enemy.root, hero.root, now, 700);
      dust(enemy, now);
    }
    enemy.play(chosen.technique === "dodge" ? "dodge" :
      chosen.technique === "projectile_intercept" ? "intercept" : "parry");
    if (chosen.technique === "projectile_intercept") {
      launchInterception("enemy", chosen.atTick);
    } else {
      sound.play(chosen.technique === "dodge" ? "dodge" : "parry");
    }
    showEnemyIntent(chosen.technique === "dodge" ? "DODGING" : "PARRYING");
  }
  return undefined;
}

/**
 * A perfect counter is authored gameplay with its own delayed impact.
 * It is not a second player attack, costs no extra action and can never be
 * dodged, intercepted or recursively countered.
 */
function beginPerfectCounter(counter: PendingCounter, now: number): void {
  const fighter = counter.attackerId === "hero" ? hero : enemy;
  const target = counter.defenderId === "hero" ? hero : enemy;
  const ranged = counter.presentation === "bow_shot";
  if (ranged) throw new Error("Ranged interception continues its existing arrow, not a second attack.");
  setPhase("counter", "counter", now);
  fighter.face(target.root.position);
  fighter.play("riposte");
  sound.play("slash");
  effects.swing(fighter.root.position, fighter.root.rotation.y, now);
  choreography.start(SWORD_RIPOSTE_COUNTER, now);
  showEnemyIntent(counter.attackerId === "enemy" ? "AUTOMATIC COUNTER" : "COUNTERED");
  lastMessage = "PERFECT PARRY · Strong sword riposte!";
  notice("PERFECT PARRY · RIPOSTE");
  updateHud();
}

function finishPerfectCounter(now: number): void {
  const queued = session.state.pendingCounter;
  if (!queued || presentation !== "counter" || now < queued.impactTick) return;
  const result = session.counterIfReady(now);
  if (!result) return;
  const victim = result.outcome.defenderId === "hero" ? hero : enemy;
  victim.root.getWorldPosition(targetPoint);
  targetPoint.y += 1.65;
  effects.impact(targetPoint, now);
  visualFeedback.emit("critical", targetPoint, now,
    result.outcome.damage, result.outcome.defenderId === "hero");
  victim.play("hit");
  director.impact(.20);
  sound.play("hit");
  notice("COUNTER STRIKE · " + result.outcome.damage + " DAMAGE");
  lastMessage = "Automatic counter dealt " + result.outcome.damage +
    " damage. The original attack was neutralized.";
  updateHud();
}

function landPlayerHit(now: number): void {
  const pending = session.state.pending;
  if(!pending || pending.attackerId!=="hero" || presentation!=="attack")return;
  const waitingForDefense=applyEnemyDefense(now);
  const option=session.activeDefense
    ? session.legalReactions().find(x=>x.moveId===session.activeDefense!.moveId &&
      x.technique==="projectile_intercept") : undefined;
  const clashTick=session.activeInterceptionPlan?.clashTick ?? option?.clashTick;
  if(clashTick!==undefined){
    if(now<clashTick)return;
  }else if(pending.projectileGeometry){
    if(!pendingSpatialImpact)
      pendingSpatialImpact=trajectoryImpact(pending,enemyHitVolumes,now);
    if(!pendingSpatialImpact)return; // Projectile has not touched or expired.
  }else if(now<pending.impactTick)return;
  const move=session.catalog.attacks[pending.moveId]!;
  const distance=movement.separationForHit(hero.root,enemy.root);
  if(!option && !pending.projectileGeometry && !pendingSpatialImpact && shotSnapshot)
    pendingSpatialImpact=enemyHitVolumes.impact(shotSnapshot);
  if(pendingSpatialImpact)impactWorldPoint=pendingSpatialImpact.impactPoint;
  const result=session.resolveIfReady(now,distance,waitingForDefense,
    pendingSpatialImpact??undefined);
  if(!result)return;
  enemyBrain.observeAttack(result.outcome.attackerId,result.outcome.breakdown.intendedRegionId??result.outcome.breakdown.actualRegionId);
  if(move.delivery==="melee_contact")
    effects.swing(hero.root.position,hero.root.rotation.y,now);
  playOutcome(result,now);
  pendingSpatialImpact=null;
  plannedEnemyDefense=null;
  if(result.outcome.counter)beginPerfectCounter(result.outcome.counter,now);
}

function finishEnemyImpact(now: number): void {
  const pending=session.state.pending;
  if(!pending || pending.attackerId!=="enemy" || presentation!=="windup")return;
  const option=session.activeDefense
    ? session.legalReactions().find(x=>x.moveId===session.activeDefense!.moveId &&
      x.technique==="projectile_intercept") : undefined;
  const clashTick=session.activeInterceptionPlan?.clashTick??option?.clashTick;
  if(clashTick!==undefined){
    if(now<clashTick)return;
  }else if(pending.projectileGeometry){
    if(!pendingSpatialImpact)
      pendingSpatialImpact=trajectoryImpact(pending,heroHitVolumes,now);
    if(!pendingSpatialImpact)return;
  }else if(now<pending.impactTick)return;
  const distance=movement.separationForHit(enemy.root,hero.root);
  if(!pending.projectileGeometry && pending.intendedRegionId &&
      distance<=session.catalog.attacks[pending.moveId]!.reachMeters+.0001) {
    pendingSpatialImpact=heroHitVolumes.impact(heroHitVolumes.snapshot(
      enemy.socketWorld(new THREE.Vector3()),pending.intendedRegionId,4));
  }
  if(!option && !pending.projectileGeometry && !pendingSpatialImpact && shotSnapshot)
    pendingSpatialImpact=heroHitVolumes.impact(shotSnapshot);
  if(pendingSpatialImpact)impactWorldPoint=pendingSpatialImpact.impactPoint;
  const result=session.resolveIfReady(now,distance,undefined,
    pendingSpatialImpact??undefined);
  if(!result)return;
  enemyBrain.observeAttack(result.outcome.attackerId,result.outcome.breakdown.intendedRegionId??result.outcome.breakdown.actualRegionId);
  playOutcome(result,now);
  pendingSpatialImpact=null;
  if(result.outcome.projectileClash)return;
  if(result.outcome.counter){
    beginPerfectCounter(result.outcome.counter,now);
    return;
  }
  movement.retreat(enemy.root,now,ARCHERY_REACTION.durationMs);
  dust(enemy,now);
  enemyBrain.markRecovering();
  setPhase("reaction","reaction",now);
  choreography.start(ARCHERY_REACTION,now);
  enemy.play("idle");
}

function onCue(cue: CombatCue, at: number, now: number): void {
  switch (cue) {
    case "counter_impact":
      finishPerfectCounter(now);
      break;
    case "camera_draw":
    case "melee_draw":
      director.setShot(session.state.pending?.attackerId === "enemy" ? "enemy_attack" : "attack");
      break;
    case "bow_release": {
      const enemyAttacks = session.state.pending?.attackerId === "enemy";
      const attacker = enemyAttacks ? enemy : hero;
      const defender = enemyAttacks ? hero : enemy;
      attacker.socketWorld(heroSocket);
      defender.root.getWorldPosition(targetPoint);
      targetPoint.y += 1.7;
      const pending=session.state.pending;
      if(!pending)break;
      const id=activeIncomingId();
      if(!id)break;
      incomingProjectileId=id;
      if(pending.projectileGeometry){
        projectiles.launchTrajectory(id,pending.projectileGeometry.incoming,at);
      }else{
        projectiles.launch(id,heroSocket,shotSnapshot?.toward ?? targetPoint,
          at,Math.max(1,pending.impactTick-at));
      }
      sound.play("release");
      break;
    }
    case "melee_impact":
      if (session.state.pending?.attackerId === "enemy") finishEnemyImpact(now);
      else landPlayerHit(now);
      break;
    case "arrow_hit":
      // Deadline fallback only. Swept projectile-body contact normally wins
      // and resolves earlier, using the exact hit point and contact tick.
      if (session.state.pending?.attackerId === "enemy") finishEnemyImpact(now);
      else landPlayerHit(now);
      break;
    case "melee_recover":
      if (session.state.pending?.attackerId === "enemy") {
        movement.retreat(enemy.root, now, 675);
        dust(enemy, now);
      } else {
        movement.retreat(hero.root, now, 675);
        dust(hero, now);
      }
      director.setShot("decision");
      break;
    case "camera_defense":
      director.setShot("defense");
      break;
    case "enemy_swing":
      director.setShot("windup");
      sound.play("slash");
      break;
    case "enemy_impact":
      effects.swing(enemy.root.position, enemy.root.rotation.y, now);
      finishEnemyImpact(now);
      break;
    case "reaction_close":
      finishEnemyImpact(now);
      break;
    case "camera_recover":
      director.setShot("decision");
      break;
  }
}

function keyDown(event: KeyboardEvent): void {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === "Space") { event.preventDefault(); startPlayerAttack(); }
  if (event.code === "KeyP") attemptDefense("parry");
  if (event.code === "KeyD") attemptDefense("dodge");
  if (event.code === "KeyE") playerEndTurn();
  if (event.code === "Digit1") changeWeapon("bow");
  if (event.code === "Digit2") changeWeapon("sword");
  if (event.code === "KeyR") reset();
  if (event.code === "KeyQ") commandDeck.cycle(1);
}
attackButton.addEventListener("click", () => startPlayerAttack());
parryButton.addEventListener("click", () => attemptDefense("parry"));
dodgeButton.addEventListener("click", () => attemptDefense("dodge"));
endTurnButton.addEventListener("click", playerEndTurn);
restartButton.addEventListener("click", reset);
audioButton.addEventListener("click", () => {
  const enabled = sound.toggle();
  audioButton.textContent = enabled ? "♪" : "♫";
  audioButton.setAttribute("aria-pressed", String(enabled));
});
qualityButton.addEventListener("click", () => {
  quality = quality === "high" ? "low" : "high";
  qualityButton.textContent = "⚙ " + (quality === "high" ? "HIGH" : "MOBILE");
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
    enterNextTurn(now);
  }
  if (presentation === "enemy_pause" && now >= enemyPauseUntil) {
    enterNextTurn(now);
  }
  movement.update(now);
  releaseScheduledInterception(now);
  const sequenceId = choreography.sequenceId;
  const sample = choreography.advance(now);
  if (sample) {
    const base = now - sample.elapsedMs;
    for (const cue of sample.cues) {
      if (choreography.sequenceId !== null &&
          choreography.sequenceId !== sequenceId) break;
      onCue(cue.type, base + cue.atMs, now);
    }
    if (sample.finished && choreography.sequenceId === null) {
      if (presentation === "attack") {
        // Normal attacks resolve on their authored impact cue.
        // This fallback handles an interrupted/very slow render callback.
        landPlayerHit(now);
        if (!session.state.pending) enterNextTurn(now);
      } else if (presentation === "windup") {
        finishEnemyImpact(now);
      } else if (presentation === "reaction") {
        enterNextTurn(now);
      } else if (presentation === "counter") {
        finishPerfectCounter(now);
        if (!session.state.pendingCounter) enterNextTurn(now);
      }
    }
  }
  // A late AI reaction may outlast the final animation cue. Keep the pending
  // hit alive until the scheduled input resolves, not until a render frame.
  if (presentation === "attack" && session.state.pending?.attackerId === "hero") {
    // The enemy's arrow must launch BEFORE the clash, not when damage is due.
    applyEnemyDefense(now);
    releaseScheduledInterception(now);
    landPlayerHit(now);
  }
  if (presentation === "attack" && !choreography.running && session.state.pending === null) {
    enterNextTurn(now);
  }
  if (presentation === "counter") finishPerfectCounter(now);
  if (presentation === "projectile") finishSurvivingProjectile(now);
  if (presentation === "windup") {
    const pending = session.state.pending;
    const length = pending ? pending.impactTick - pending.startedTick : 1;
    timingFill.style.width = Math.min(100, Math.max(0,
      (now - phaseAt) / length * 100)) + "%";
    releaseScheduledInterception(now);
    finishEnemyImpact(now);
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
  hero.setLocomotion(movement.activity(hero.root) === "approach" ||
                     movement.activity(hero.root) === "retreat");
  enemy.setLocomotion(movement.activity(enemy.root) === "approach" ||
                      movement.activity(enemy.root) === "retreat");
  const frozen = now < visualFeedback.frozenUntil;
  if (!frozen) {
    const attackerMove = session.state.pending?.moveId;
    const heroClipTime = presentation === "attack" && attackerMove === "heavy_crush"
      ? motionElapsed * 1450 / 1850 : motionElapsed;
    const counter = session.state.pendingCounter;
    hero.update(delta,
      counter && counter.attackerId === "hero" ? motionElapsed :
      presentation === "attack" || presentation === "reaction" ? heroClipTime : undefined);
    enemy.update(delta,
      counter && counter.attackerId === "enemy" ? motionElapsed :
      presentation === "windup" ? motionElapsed : undefined);
  }
  movement.update(now);
  effects.update(now);
  projectiles.update(now);
  director.update(frozen ? delta * .18 : delta);
  browserAim.update(delta);
  if (!aimMarker.hidden) {
    const point = aimCursor.value;
    aimMarker.style.opacity = "1";
    aimMarker.style.left = ((point.x * .5 + .5) * viewport.clientWidth) + "px";
    aimMarker.style.top = ((1 - (point.y * .5 + .5)) * viewport.clientHeight) + "px";
    const region = enemyHitVolumes.pickCamera(camera, point.x, point.y);
    if (region !== hoveredRegion) {
      hoveredRegion = region;
      aimMarkerLabel.textContent = region
        ? region.replaceAll("_", " ").toUpperCase() : "MISS";
      const armor = region !== null && (
        session.state.actors.enemy!.equippedArmorIds?.some(id =>
          session.catalog.armor?.[id]?.coverage.some(cover =>
            cover.regionId === region && cover.protection > 0)) ?? false);
      const weakness = region !== null &&
        session.catalog.anatomies?.humanoid?.regions[region]?.criticalEligible;
      aimArmorHint.textContent = armor ? "ARMORED · CRITICAL BLOCKED" :
        weakness ? "WEAK POINT · PRECISION SHOT" :
        region ? "TARGET: " + region.replaceAll("_", " ").toUpperCase() :
        "NO TARGET · SHOT WILL MISS";
      aimMarker.classList.toggle("aim-on-target", region !== null);
    }
  } else {
    hoveredRegion = null;
  }
  visualFeedback.update(now, camera);
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
  projectiles.dispose();
  surfaceMarks.dispose();
  visualFeedback.dispose();
  sound.dispose();
  commandDeck.dispose();
  browserAim.dispose();
  heroHitVolumes.dispose();
  enemyHitVolumes.dispose();
  hero.dispose();
  enemy.dispose();
  renderer.dispose();
}, { once: true });
