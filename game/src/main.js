// main.js — Sunset Neon City 3D: game bootstrap, the frame loop, third-person
// chase camera, entering and stealing cars, combat (punch + hitscan shooting),
// cash/health pickups, wanted heat, menus, the results screen and the save.
// One Game owns the world; the systems in the other modules do one job each.
import * as THREE from 'three';
import { buildCity, randomRoadPoint } from './city.js';
import { createCarMesh, Car, makeTrafficCar, updateTrafficCar, updatePlayerCar } from './vehicles.js';
import { createPersonMesh, Player, spawnPedestrians } from './actors.js';
import { Police } from './police.js';
import { MissionManager } from './missions.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { loadSave, saveGame, clearSave } from './save.js';
import { RunStats } from './stats.js';
import { applyShot } from './shots.js';
import { makeRng, clamp, dist2, formatCash } from './util.js';

const SEED = 20261119;
const CAR_COLORS = [0xd94f3d, 0x3d7bd9, 0xe8b93c, 0x7a4fd9, 0x39b37a, 0xd9d9d9, 0x2b2f36, 0xe07a3c, 0x4fd9c7];
const SCREENS = ['screen-start', 'screen-pause', 'screen-dead', 'screen-results'];

export class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | dead | results
    this.cash = 0;
    this.bestCash = 0;
    this.time = 0;
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.32;
    this.playerCar = null;
    this.shotMode = null;
    this.shotReady = false;
    this.bootWall = performance.now();
    this.dialogueOpen = false;
    this.interactUntil = 0;
    this.shootCd = 0;
    this.punchCd = 0;
    this.saveTimer = 0;
    this.tracer = null;
    this.tracerLife = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc3e8);
    this.scene.fog = new THREE.Fog(0x9fc3e0, 120, 520);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(30, 12, 60);

    const sun = new THREE.DirectionalLight(0xffe3b3, 2.2);
    sun.position.set(120, 180, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160;
    sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160;
    sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 500;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a6f5a, 0.85));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    this.audio = new AudioEngine();
    this.stats = new RunStats();
    this.rng = makeRng(SEED + 7);
    this.input = new Input(this.renderer.domElement);
    this.input.onFirstGesture = () => this.audio.ensure();
    this.input.onPauseKey = () => this.togglePause();
    this.input.onLockLost = () => {
      if (this.state === 'playing' && !this.shotMode && !this.dialogueOpen) this.pauseGame();
    };

    this.hud = new Hud();
    this.city = buildCity(this.scene, SEED);
    this.police = new Police(this.scene);
    this.police.onWantedChange = (level) => this.stats.noteWanted(level);
    this.missions = new MissionManager(this.scene, this.city);

    const playerMesh = createPersonMesh(0xff5a7a, 0x2c3e50);
    this.scene.add(playerMesh);
    this.player = new Player(playerMesh, this.city.spawn.x, this.city.spawn.z);

    const rng = this.rng;
    this.traffic = [];
    for (let i = 0; i < 9; i++) this.traffic.push(makeTrafficCar(this.scene, this.city, rng, CAR_COLORS));
    this.peds = spawnPedestrians(this.scene, this.city, 16, SEED + 21);

    this.pickups = [];
    this.spawnPickups(rng);

    this.raycaster = new THREE.Raycaster();
    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    this.tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0 }));
    this.scene.add(this.tracer);

    this.bindScreens();
    this.applySaveToMenu();
    this.hud.setCash(0);
    this.hud.setHealth(100);
    this.hud.setWanted(0);
    this.hud.setObjective('按 M 开始第一个任务，或先在城里逛逛');
    window.addEventListener('resize', () => this.onResize());
    this.clock = new THREE.Clock();
    this.loop();
  }

  // ---- screens ------------------------------------------------------------
  bindScreens() {
    const show = (id) => {
      for (const s of SCREENS) {
        document.getElementById(s).classList.toggle('hidden', s !== id);
      }
      const hud = document.getElementById('hud');
      hud.classList.toggle('hidden', id !== null);
    };
    this.showScreen = show;
    document.getElementById('btn-start').addEventListener('click', () => this.startGame(false));
    document.getElementById('btn-continue').addEventListener('click', () => this.startGame(true));
    document.getElementById('btn-resume').addEventListener('click', () => this.resumeGame());
    document.getElementById('btn-revive').addEventListener('click', () => this.restartAfterDeath());
    document.getElementById('btn-play-again').addEventListener('click', () => this.restartRun());
    document.getElementById('btn-play-again-dead').addEventListener('click', () => this.restartRun());
    document.getElementById('btn-free').addEventListener('click', () => this.continueFreeRoam());
    document.getElementById('btn-quit').addEventListener('click', () => this.quitToMenu());
    document.getElementById('btn-quit2').addEventListener('click', () => this.quitToMenu());
    document.getElementById('btn-save-quit').addEventListener('click', () => {
      this.saveGame();
      this.quitToMenu();
    });
    document.getElementById('dialogue-next').addEventListener('click', () => this.advanceDialogue());
  }

  applySaveToMenu() {
    const s = loadSave();
    document.getElementById('btn-continue').style.display = s ? 'inline-block' : 'none';
    if (s) {
      document.getElementById('save-info').textContent = `存档：${formatCash(s.cash)} · 已完成 ${s.completedCount}/3 个任务`;
      this.bestCash = s.bestCash || 0;
    } else {
      document.getElementById('save-info').textContent = '';
    }
    this.pendingSave = s;
  }

  startGame(useSave) {
    const s = useSave ? this.pendingSave : null;
    if (s) {
      this.cash = s.cash;
      this.missions.index = s.missionIndex;
      this.missions.completedCount = s.completedCount;
      this.stats.missionsDone = s.completedCount;
      if (s.x !== null) {
        this.player.x = s.x;
        this.player.z = s.z;
        this.player.syncMesh();
      }
      this.player.health = s.health || 100;
      this.missions.resetForLoad();
    } else {
      this.cash = 0;
      this.missions.index = 0;
      this.missions.completedCount = 0;
      this.missions.storyDone = false;
      this.missions.resetForLoad();
      this.player.x = this.city.spawn.x;
      this.player.z = this.city.spawn.z;
      this.player.health = 100;
      this.player.syncMesh();
    }
    this.stats.begin(this.time);
    this.police.clear();
    this.state = 'playing';
    this.showScreen(null);
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health);
    this.hud.setWanted(0);
    this.hud.setObjective(this.missions.index < 3 ? '按 M 开始下一个任务' : '故事完成！');
    this.hud.toast(s ? '欢迎回来，阿杰。' : '欢迎来到落日港，阿杰。按 M 接老K的任务。');
    this.audio.ensure();
    this.input.requestLock();
    this.saveGame();
  }

  // Full restart from scratch: fresh cash, fresh missions, fresh stats.
  restartRun() {
    this.cash = 0;
    this.bestCash = Math.max(this.bestCash, 0);
    this.missions.index = 0;
    this.missions.completedCount = 0;
    this.missions.storyDone = false;
    this.missions.resetForLoad();
    this.stats.begin(this.time);
    this.player.health = 100;
    this.player.x = this.city.spawn.x;
    this.player.z = this.city.spawn.z;
    this.player.syncMesh();
    this.exitCar(false);
    this.police.clear();
    this.state = 'playing';
    this.showScreen(null);
    this.hud.setCash(0);
    this.hud.setHealth(100);
    this.hud.setWanted(0);
    this.hud.setObjective('按 M 开始第一个任务');
    this.hud.toast('新的一局开始了，阿杰。');
    this.input.requestLock();
    this.saveGame();
  }

  // After the story ends, keep playing the open city with what you earned.
  continueFreeRoam() {
    this.state = 'playing';
    this.showScreen(null);
    this.hud.setObjective('自由探索：刷钱、飙车、甩条子');
    this.hud.toast('落日港是你的了，继续逛逛吧。');
    this.input.requestLock();
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.showScreen('screen-pause');
    this.input.releaseLock();
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.showScreen(null);
    this.input.requestLock();
  }

  togglePause() {
    if (this.state === 'playing') this.pauseGame();
    else if (this.state === 'paused') this.resumeGame();
  }

  quitToMenu() {
    this.state = 'menu';
    this.exitCar(false);
    this.police.clear();
    this.missions.resetForLoad();
    this.showScreen('screen-start');
    this.applySaveToMenu();
    this.input.releaseLock();
  }

  // Revive after death: lose 10% of your cash, respawn near the harbour.
  restartAfterDeath() {
    this.player.health = 100;
    this.cash = Math.floor(this.cash * 0.9);
    this.player.x = 30;
    this.player.z = 60;
    this.player.syncMesh();
    this.exitCar(false);
    this.police.clear();
    this.state = 'playing';
    this.showScreen(null);
    this.hud.setCash(this.cash);
    this.hud.setHealth(100);
    this.hud.setWanted(0);
    this.hud.toast('医院账单：你损失了 10% 现金。小心点，阿杰。');
    this.input.requestLock();
    this.saveGame();
  }

  // The settlement screen: every number is this run's real RunStats.
  showResultsScreen() {
    if (this.stats.elapsed === 0) this.stats.finish(this.time);
    this.state = 'results';
    this.hud.fillStatsTable('results-stats', this.stats.rows(this.cash), 'results-cash', formatCash(this.cash));
    this.showScreen('screen-results');
    this.input.releaseLock();
    this.saveGame();
  }

  onStoryComplete() {
    this.audio.jingle();
    this.showResultsScreen();
  }

  onDeath() {
    this.state = 'dead';
    this.stats.deaths += 1;
    this.stats.finish(this.time);
    this.audio.fail();
    this.audio.stopSiren();
    this.hud.fillStatsTable('dead-stats', this.stats.rows(this.cash), 'dead-cash', formatCash(this.cash));
    this.showScreen('screen-dead');
    this.input.releaseLock();
    this.saveGame();
  }

  // ---- dialogue / objectives ---------------------------------------------
  showDialogue(name, text) {
    this.dialogueOpen = true;
    this.hud.showDialogue(name, text);
    document.getElementById('dialogue-next').focus();
  }

  hideDialogue() {
    this.dialogueOpen = false;
    this.hud.hideDialogue();
    this.input.pressed.clear();
  }

  advanceDialogue() {
    if (this.missions.dialogue) this.missions.advanceDialogue(this);
  }

  setObjective(t) {
    this.hud.setObjective(t);
  }

  toast(t, ms) {
    this.hud.toast(t, ms);
  }

  saveGame() {
    this.bestCash = Math.max(this.bestCash, this.cash);
    saveGame({
      cash: this.cash,
      missionIndex: this.missions.index,
      completedCount: this.missions.completedCount,
      x: this.playerCar ? this.playerCar.x : this.player.x,
      z: this.playerCar ? this.playerCar.z : this.player.z,
      health: this.player.health,
      bestCash: this.bestCash,
    });
  }

  // ---- pickups ------------------------------------------------------------
  spawnPickups(rng) {
    const cashGeo = new THREE.BoxGeometry(0.9, 0.35, 0.6);
    const cashMat = new THREE.MeshStandardMaterial({ color: 0x2fae4e, emissive: 0x1a5a2a, emissiveIntensity: 0.7 });
    const medGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const medMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0x881111, emissiveIntensity: 0.5 });
    const mk = (kind, x, z) => {
      const mesh = new THREE.Mesh(kind === 'cash' ? cashGeo : medGeo, kind === 'cash' ? cashMat : medMat);
      mesh.position.set(x, 0.8, z);
      this.scene.add(mesh);
      this.pickups.push({ kind, x, z, mesh, taken: false, bob: rng.range(0, 6) });
    };
    for (let i = 0; i < 12; i++) {
      const p = randomRoadPoint(this.city, rng);
      mk('cash', p.x + rng.range(-6, 6), p.z + rng.range(-6, 6));
    }
    for (let i = 0; i < 6; i++) {
      const p = randomRoadPoint(this.city, rng);
      mk('health', p.x + rng.range(-6, 6), p.z + rng.range(-6, 6));
    }
  }

  collectPickups() {
    const px = this.playerCar ? this.playerCar.x : this.player.x;
    const pz = this.playerCar ? this.playerCar.z : this.player.z;
    for (const p of this.pickups) {
      if (p.taken) continue;
      if (dist2(px, pz, p.x, p.z) < 2.6) {
        p.taken = true;
        p.mesh.visible = false;
        this.stats.pickupsTaken += 1;
        if (p.kind === 'cash') {
          const amount = 25 + Math.floor(Math.random() * 50);
          this.cash += amount;
          this.stats.noteCash(amount);
          this.hud.setCash(this.cash);
          this.hud.toast(`捡到现金 +$${amount}`);
          this.audio.cash();
        } else {
          this.player.health = clamp(this.player.health + 35, 0, 100);
          this.hud.setHealth(this.player.health);
          this.hud.toast('急救包：生命 +35');
          this.audio.pickup();
        }
        this.saveGame();
      }
    }
  }

  // ---- cars ---------------------------------------------------------------
  nearestCar(maxD) {
    const px = this.player.x;
    const pz = this.player.z;
    let best = null;
    let bd = maxD;
    const all = [...this.traffic, ...this.police.cars];
    if (this.missions.van) all.push(this.missions.van);
    for (const c of all) {
      if (c.dead) continue;
      const d = dist2(px, pz, c.x, c.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  enterCar(car) {
    const stolen = car.kind !== 'player';
    this.playerCar = car;
    car.kind = 'player';
    this.player.mesh.visible = false;
    this.audio.ensure();
    this.hud.toast('上车了。W 加速，S 刹车/倒车，A/D 转向，空格手刹。');
    if (stolen) {
      this.stats.carsStolen += 1;
      if (this.police.wanted < 1) {
        this.police.raiseTo(1);
        this.hud.toast('你偷了辆车！通缉 1 星。');
        this.audio.denied();
      }
    }
  }

  exitCar() {
    if (!this.playerCar) return;
    const car = this.playerCar;
    this.playerCar = null;
    const fx = -Math.sin(car.angle);
    const fz = -Math.cos(car.angle);
    this.player.x = car.x + fx * 3;
    this.player.z = car.z + fz * 3;
    this.player.mesh.visible = true;
    this.player.syncMesh();
    if (car.kind === 'player') car.kind = 'traffic';
  }

  // ---- combat ---------------------------------------------------------------
  shoot() {
    if (this.shootCd > 0 || this.state !== 'playing') return;
    this.shootCd = 0.28;
    this.stats.shotsFired += 1;
    this.audio.shot();
    const from = new THREE.Vector3();
    this.camera.getWorldPosition(from);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.raycaster.set(from, dir);
    this.raycaster.far = 90;
    const targets = [];
    for (const t of this.missions.thugs) if (!t.dead) targets.push(t.mesh);
    for (const p of this.peds) if (!p.dead) targets.push(p.mesh);
    for (const c of this.traffic) targets.push(c.mesh);
    for (const c of this.police.cars) targets.push(c.mesh);
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = from.clone().add(dir.clone().multiplyScalar(60));
    let hitSomething = false;
    if (hits.length > 0) {
      const h = hits[0];
      end = h.point.clone();
      hitSomething = true;
      let obj = h.object;
      while (obj && !obj.userData.owner) obj = obj.parent;
      const owner = obj ? obj.userData.owner : null;
      if (owner) {
        this.damageActor(owner, 34);
      } else {
        let g = h.object;
        while (g.parent && g.parent !== this.scene) g = g.parent;
        const car = [...this.traffic, ...this.police.cars].find((c) => c.mesh === g);
        if (car) {
          car.health -= 20;
          if (car.health <= 0 && !car.dead) {
            car.dead = true;
            car.mesh.rotation.z = 0.12;
            this.police.raiseTo(Math.max(this.police.wanted, 2));
          }
        }
      }
    }
    const start = this.playerCar
      ? new THREE.Vector3(this.playerCar.x, 1.4, this.playerCar.z)
      : new THREE.Vector3(this.player.x, 1.5, this.player.z);
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, start.x, start.y, start.z);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    this.tracer.material.opacity = 0.9;
    this.tracerLife = 0.09;
    if (!hitSomething) this.police.raiseTo(Math.max(this.police.wanted, 1));
    for (const p of this.peds) {
      if (!p.dead && dist2(p.x, p.z, this.player.x, this.player.z) < 16) p.flee = 2.5;
    }
  }

  damageActor(owner, amount) {
    if (owner.kind === 'thug') {
      owner.damage(amount);
      this.audio.punch();
      if (owner.dead) {
        if (!owner.counted) {
          owner.counted = true;
          this.stats.thugsBeaten += 1;
        }
        this.hud.toast('打手倒下了！');
      }
    } else if (owner.kind === 'ped') {
      owner.dead = true;
      owner.mesh.rotation.x = -Math.PI / 2;
      owner.mesh.position.y = 0.25;
      this.police.raiseTo(Math.max(this.police.wanted, 2));
      this.hud.toast('你击中了路人！通缉上升。');
    }
  }

  punch() {
    if (this.punchCd > 0 || this.state !== 'playing' || this.playerCar) return;
    this.punchCd = 0.45;
    this.audio.punch();
    const fx = Math.sin(this.player.angle);
    const fz = Math.cos(this.player.angle);
    for (const t of this.missions.thugs) {
      if (t.dead) continue;
      const d = dist2(this.player.x, this.player.z, t.x, t.z);
      const dot = ((t.x - this.player.x) * fx + (t.z - this.player.z) * fz) / Math.max(0.1, d);
      if (d < 2.4 && dot > 0.3) {
        t.damage(25);
        t.x += fx * 1.2;
        t.z += fz * 1.2;
        t.syncMesh();
        if (t.dead) {
          if (!t.counted) {
            t.counted = true;
            this.stats.thugsBeaten += 1;
          }
          this.hud.toast('打手倒下了！');
        }
      }
    }
    for (const p of this.peds) {
      if (p.dead) continue;
      const d = dist2(this.player.x, this.player.z, p.x, p.z);
      if (d < 2.2) {
        p.dead = true;
        p.mesh.rotation.x = -Math.PI / 2;
        p.mesh.position.y = 0.25;
        this.police.raiseTo(Math.max(this.police.wanted, 2));
        this.hud.toast('你打倒了路人！通缉上升。');
      }
    }
  }

  hurtPlayer(amount) {
    if (this.state !== 'playing') return;
    this.player.health -= amount;
    this.hud.setHealth(this.player.health);
    this.hud.flashDamage();
    this.audio.hurt();
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.onDeath();
    }
  }

  // ---- camera ---------------------------------------------------------------
  updateCamera(dt) {
    const look = this.input.consumeLook();
    this.cameraYaw -= look.dx * 0.0032;
    this.cameraPitch = clamp(this.cameraPitch + look.dy * 0.0026, -0.1, 1.1);
    const focus = this.playerCar
      ? new THREE.Vector3(this.playerCar.x, 1.6, this.playerCar.z)
      : new THREE.Vector3(this.player.x, 1.7, this.player.z);
    const dist = this.playerCar ? 10 : 8;
    const cx = focus.x + Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch) * dist;
    const cz = focus.z + Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch) * dist;
    const cy = focus.y + Math.sin(this.cameraPitch) * dist + 1.2;
    const target = new THREE.Vector3(cx, cy, cz);
    if (this.shotMode) {
      this.camera.position.copy(target);
    } else {
      this.camera.position.lerp(target, Math.min(1, dt * 8));
    }
    this.camera.lookAt(focus);
    if (this.camera.position.y < 2.2) this.camera.position.y = 2.2;
  }

  updateMenuCamera(dt) {
    this.time += dt;
    const a = this.time * 0.06;
    const r = 150;
    this.camera.position.set(Math.sin(a) * r, 55 + Math.sin(this.time * 0.11) * 8, Math.cos(a) * r);
    this.camera.lookAt(-30, 40, -30);
  }

  // ---- frame loop -----------------------------------------------------------
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.punchCd = Math.max(0, this.punchCd - dt);
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      if (this.tracerLife <= 0) this.tracer.material.opacity = 0;
    }

    if (this.state === 'menu') {
      if (this.input.consumePress('Enter')) this.startGame(false);
      this.updateMenuCamera(dt);
      this.renderer.render(this.scene, this.camera);
      this.markShotReady();
      return;
    }
    if (this.state === 'paused' || this.state === 'dead' || this.state === 'results') {
      if (this.state === 'dead' && this.input.consumePress('Enter')) this.restartAfterDeath();
      if (this.state === 'results' && this.input.consumePress('Enter')) this.restartRun();
      this.renderer.render(this.scene, this.camera);
      this.markShotReady();
      return;
    }

    // ---- playing ----
    if (this.dialogueOpen) {
      if (this.input.consumePress('KeyE') && performance.now() >= this.interactUntil) {
        this.interactUntil = performance.now() + 350;
        this.advanceDialogue();
      }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.updateCamera(dt);
    const rng = this.rng;
    // Staged screenshots (?shot=...): freeze traffic and the police so a
    // posed scene stays in frame. The player car is frozen only for the
    // police shot, where it would otherwise drive into the staged police
    // cars; in the drive shot it rolls forward normally, away from the
    // street lamp at its spawn. Real play is unaffected: shotMode is only
    // set by the ?shot= query.
    const freezeWorld = !!this.shotMode;
    const freezePlayer = this.shotMode === 'police';
    for (const c of this.traffic) {
      if (!c.dead && !freezeWorld) {
        updateTrafficCar(c, dt, this.city, rng, [...this.traffic, ...this.police.cars, this.playerCar].filter(Boolean));
      }
    }
    const threat = this.shootCd > 0.1 ? this.player : null;
    for (const p of this.peds) p.update(dt, this.city, rng, threat);

    if (this.playerCar) {
      if (!freezePlayer) {
        const crash = updatePlayerCar(this.playerCar, this.input, dt, this.city, [...this.traffic, ...this.police.cars]);
        if (crash === 'crash') {
          this.audio.punch();
          this.hurtPlayer(4);
        }
      }
      this.audio.setEngine(Math.abs(this.playerCar.speed) / 33, true);
      this.stats.noteSpeed(Math.abs(this.playerCar.speed) * 3.6);
      this.player.x = this.playerCar.x;
      this.player.z = this.playerCar.z;
    } else {
      this.player.update(this.input, this.cameraYaw, dt, this.city, [...this.peds, ...this.traffic]);
      this.audio.setEngine(0, false);
    }

    this.missions.update(dt, this, this.time);
    for (const t of this.missions.thugs) {
      const res = t.update(dt, this.city, this.player);
      if (res === 'hit' && !this.playerCar) this.hurtPlayer(8);
    }
    const policePos = {
      x: this.playerCar ? this.playerCar.x : this.player.x,
      z: this.playerCar ? this.playerCar.z : this.player.z,
    };
    const pol = freezeWorld
      ? { nearest: Infinity, ramming: false }
      : this.police.update(dt, this.city, policePos, !!this.playerCar, this.audio, this.time);
    if (pol.ramming) {
      this.hurtPlayer(this.playerCar ? 2 : 10);
      this.police.bustTimer = 0;
    }
    this.collectPickups();

    if (this.input.consumePress('KeyE') && performance.now() >= this.interactUntil) {
      this.interactUntil = performance.now() + 350;
      if (this.missions.dialogue) this.advanceDialogue();
      else if (this.playerCar) this.exitCar();
      else {
        const car = this.nearestCar(4.5);
        if (car) this.enterCar(car);
      }
    }
    if (this.input.consumePress('KeyM') && performance.now() >= this.interactUntil) {
      this.interactUntil = performance.now() + 350;
      if (!this.missions.active && !this.missions.dialogue) {
        if (!this.missions.startMission(this)) this.hud.toast('没有更多任务了。');
      }
    }
    if (this.input.consumePress('KeyF')) this.punch();
    if (this.input.consumeClick() && !this.playerCar) this.shoot();
    if (this.input.down('KeyR') && this.playerCar) {
      this.playerCar.x = clamp(this.playerCar.x, -200, 200);
      this.playerCar.speed = 0;
    }

    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      this.saveGame();
    }

    this.hud.setCash(this.cash);
    this.hud.setHealth(this.player.health);
    this.hud.setWanted(this.police.wanted);
    this.hud.setSpeed(this.playerCar ? this.playerCar.speed * 3.6 : 0, !!this.playerCar);
    this.hud.showCrosshair(!this.playerCar);
    this.hud.drawMinimap(this.city, this.player, this.playerCar, this.traffic, this.police.cars, this.pickups, this.missions.beacon);

    for (const p of this.pickups) {
      if (p.taken) continue;
      p.bob += dt;
      p.mesh.position.y = 0.8 + Math.sin(p.bob * 2.5) * 0.25;
      p.mesh.rotation.y += dt * 1.5;
    }

    this.renderer.render(this.scene, this.camera);
    this.markShotReady();
  }

  // Staged screenshots signal readiness on wall-clock time, so a slow
  // software renderer still gets a settled scene. The police chase is
  // staged with the pursuit ahead of the player, so it is ready sooner —
  // by 6 s the police cars would have caught up and bunched behind the
  // camera instead of reading as a chase.
  markShotReady() {
    if (this.shotMode && !this.shotReady) {
      const waitMs = this.shotMode === 'police' ? 2500 : 6000;
      if (performance.now() - this.bootWall > waitMs) {
        this.shotReady = true;
        window.__shotReady = true;
      }
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

export function boot() {
  const game = new Game();
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) applyShot(game, shot);
  window.__game = game;
  return game;
}

boot();
