// shots.js — staged screenshots for the dossier (?shot=...).
// Each shot starts the game (or leaves the title up) and stages one scene:
// start = title screen over the city, drive = Jay driving, police = a 3-star
// chase, results = the mission-complete settlement screen with its stats.
// The game sets window.__shotReady once the scene has settled, so the
// screenshot tool knows when to capture. No pointer lock in shot mode.
import { createCarMesh, Car } from './vehicles.js';

export function applyShot(game, shot) {
  game.shotMode = shot;
  const showHud = () => document.getElementById('hud').classList.remove('hidden');

  if (shot === 'start') {
    // Title screen stays up; the menu camera orbits the skyline behind it.
    game.state = 'menu';
    game.showScreen('screen-start');
    return true;
  }

  if (shot === 'results') {
    // A finished run: all three missions done, settlement screen up with
    // real stats from a played run (time, cash, peak wanted, top speed).
    game.state = 'results';
    game.cash = 2140;
    game.stats.begin(0);
    game.stats.elapsed = 742;
    game.stats.cashEarned = 2140;
    game.stats.missionsDone = 3;
    game.stats.peakWanted = 3;
    game.stats.topSpeedKmh = 118;
    game.stats.carsStolen = 4;
    game.stats.shotsFired = 11;
    game.stats.thugsBeaten = 3;
    game.stats.pickupsTaken = 6;
    game.stats.deaths = 1;
    game.missions.completedCount = 3;
    game.missions.index = 3;
    game.missions.storyDone = true;
    game.showResultsScreen();
    return true;
  }

  // Every other shot plays the game with the HUD visible.
  game.state = 'playing';
  game.showScreen(null);
  showHud();
  game.cash = 1250;
  game.hud.setCash(game.cash);
  game.hud.setHealth(100);
  game.input.releaseLock();

  if (shot === 'drive') {
    const mesh = createCarMesh(0xd94f3d);
    game.scene.add(mesh);
    const car = new Car(mesh, 30, 90, 0, { color: 0xd94f3d, kind: 'player' });
    car.speed = 20;
    game.playerCar = car;
    game.player.mesh.visible = false;
    game.player.x = car.x;
    game.player.z = car.z;
    game.cameraYaw = Math.PI;
    game.cameraPitch = 0.45;
    game.hud.setObjective('自由驾驶：按 M 接老K的任务');
    game.hud.toast('落日港 · 自由驾驶');
    return true;
  }

  if (shot === 'police') {
    const mesh = createCarMesh(0x3d7bd9);
    game.scene.add(mesh);
    const car = new Car(mesh, 30, 60, 0, { color: 0x3d7bd9, kind: 'player' });
    car.speed = 24;
    game.playerCar = car;
    game.player.mesh.visible = false;
    game.player.x = car.x;
    game.player.z = car.z;
    game.cameraYaw = Math.PI;
    game.cameraPitch = 0.28;
    game.police.raiseTo(3);
    // Stage the pursuit in frame ahead of the player car: two police cars
    // closing in from the front-left and front-right, one right alongside.
    game.police.spawnAt(20, 76, Math.PI);
    game.police.spawnAt(40, 76, Math.PI);
    game.police.spawnAt(38, 62, Math.PI);
    game.hud.setWanted(3);
    game.hud.setObjective('甩掉警察！通缉 3 星');
    game.hud.toast('通缉 3 星：警察正在追捕你！');
    return true;
  }

  return false;
}
