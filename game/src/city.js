// city.js — Sunset Harbor: a seeded procedural 3D harbour city.
// An 8x8 grid of blocks split by streets, buildings of varied height with
// lit windows, neon signs, street lamps, palm trees, two parks and a tall
// beacon tower. The ground is one canvas texture (asphalt, lane dashes,
// crosswalks) so the street grid reads from the chase camera and the minimap.
import * as THREE from 'three';
import { makeRng } from './util.js';

export const PITCH = 60; // distance between block centres
export const BLOCK = 44; // building block size
export const GRID = 4; // blocks run from -GRID .. GRID-1
export const CITY_HALF = GRID * PITCH; // 240, playable bounds

function groundTexture() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  const toPx = (v) => ((v + CITY_HALF) / (CITY_HALF * 2)) * S;
  g.fillStyle = '#23262f';
  g.fillRect(0, 0, S, S);
  // Block interiors: slightly lighter sidewalk slabs, one park green.
  for (let i = -GRID; i < GRID; i++) {
    for (let j = -GRID; j < GRID; j++) {
      const cx = i * PITCH;
      const cz = j * PITCH;
      const x0 = toPx(cx - BLOCK / 2);
      const z0 = toPx(cz - BLOCK / 2);
      const w = toPx(cx + BLOCK / 2) - x0;
      const isPark = (i === -3 && j === 2) || (i === 2 && j === -3);
      g.fillStyle = isPark ? '#33502e' : (i + j) % 3 === 0 ? '#39424a' : '#333945';
      g.fillRect(x0, z0, w, w);
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = 2;
      g.strokeRect(x0, z0, w, w);
    }
  }
  // Yellow centre dashes along every street.
  g.fillStyle = '#d8b93a';
  const roads = [];
  for (let k = -GRID; k < GRID; k++) roads.push(k * PITCH + PITCH / 2);
  for (const c of roads) {
    for (let v = -CITY_HALF; v < CITY_HALF; v += 16) {
      g.fillRect(toPx(v), toPx(c) - 1.5, toPx(v + 8) - toPx(v), 3);
      g.fillRect(toPx(c) - 1.5, toPx(v), 3, toPx(v + 8) - toPx(v));
    }
  }
  // Crosswalk stripes at every intersection.
  g.fillStyle = 'rgba(230,235,240,0.55)';
  for (const cx of roads) {
    for (const cz of roads) {
      for (let s = -3; s <= 3; s++) {
        g.fillRect(toPx(cx + s * 3) - 2, toPx(cz - 9), 4, 18);
        g.fillRect(toPx(cx - 9), toPx(cz + s * 3) - 2, 18, 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function windowTexture(rng, litRatio) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#1f232d';
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit
        ? rng.pick(['#ffd27a', '#ffe9b0', '#9fd8ff', '#ffb46b'])
        : '#10131a';
      g.fillRect(x, y, 10, 12);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  group.name = 'SunsetHarbor';
  scene.add(group);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 80, CITY_HALF * 2 + 80),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Harbour water: a flat blue plane just below the ground, past the edge.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500),
    new THREE.MeshStandardMaterial({ color: 0x2a6a8c, roughness: 0.35, metalness: 0.15 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.5;
  group.add(sea);

  const winTexes = [windowTexture(rng, 0.55), windowTexture(rng, 0.4), windowTexture(rng, 0.68)];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const palette = [0xd8a08c, 0x9fb4c7, 0xc7b299, 0xa8b89a, 0xc98f7a, 0x8fa3b8, 0xd9c08a, 0xb08a9a, 0x7fa3a0, 0xe0cfa8];
  const neonColors = [0xff2e88, 0x22d3ee, 0xffb020, 0x7c3aed, 0x39ff88];
  const colliders = [];
  let neonCount = 0;

  for (let i = -GRID; i < GRID; i++) {
    for (let j = -GRID; j < GRID; j++) {
      const cx = i * PITCH;
      const cz = j * PITCH;
      const isPark = (i === -3 && j === 2) || (i === 2 && j === -3);
      if (isPark) {
        const lawn = new THREE.Mesh(
          new THREE.CylinderGeometry(11, 11, 0.6, 20),
          new THREE.MeshStandardMaterial({ color: 0x47753d, roughness: 1 }),
        );
        lawn.position.set(cx, 0.3, cz);
        group.add(lawn);
        continue;
      }
      const n = rng.int(1, 2);
      for (let b = 0; b < n; b++) {
        const w = rng.range(16, 26);
        const d = rng.range(16, 26);
        const h = rng.pick([rng.range(10, 18), rng.range(18, 34), rng.range(34, 58), rng.range(58, 88)]);
        const ox = n === 1 ? 0 : (b === 0 ? -9 : 9);
        const oz = n === 1 ? 0 : (b === 0 ? -9 : 9);
        const x = cx + ox;
        const z = cz + oz;
        const mat = new THREE.MeshStandardMaterial({
          map: winTexes[rng.int(0, 2)],
          color: rng.pick(palette),
          roughness: 0.85,
          metalness: 0.05,
        });
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        const rim = new THREE.Mesh(
          boxGeo,
          new THREE.MeshStandardMaterial({ color: 0x2b2e37, roughness: 0.9 }),
        );
        rim.scale.set(w + 0.6, 0.8, d + 0.6);
        rim.position.set(x, h + 0.4, z);
        group.add(rim);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        if (h > 30 && neonCount < 16) {
          neonCount += 1;
          const col = neonColors[neonCount % neonColors.length];
          const sign = new THREE.Mesh(
            boxGeo,
            new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 2.4 }),
          );
          sign.scale.set(0.6, rng.range(6, 12), rng.range(3, 6));
          sign.position.set(x + w / 2 + 0.4, h * 0.7, z);
          group.add(sign);
        }
      }
    }
  }

  // Street lamps (emissive heads, no extra lights — cheap glow).
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.7 });
  const headGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe9a8, emissiveIntensity: 2.5 });
  const lampSpots = [];
  for (let k = -GRID; k < GRID; k++) {
    const c = k * PITCH + PITCH / 2;
    for (let v = -CITY_HALF + 30; v < CITY_HALF; v += 60) {
      lampSpots.push([c + 7, v]);
      lampSpots.push([v, c - 7]);
    }
  }
  for (const [x, z] of lampSpots) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 3, z);
    group.add(pole);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x, 6.2, z);
    group.add(head);
  }

  // Palm trees on sidewalks and in parks, never on a road lane.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const leafGeo = new THREE.IcosahedronGeometry(2.2, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a34, roughness: 1 });
  for (let t = 0; t < 48; t++) {
    const x = rng.range(-CITY_HALF + 10, CITY_HALF - 10);
    const z = rng.range(-CITY_HALF + 10, CITY_HALF - 10);
    const onRoadX = Math.abs((((x + PITCH / 2) % PITCH) + PITCH) % PITCH - PITCH / 2) < 9;
    const onRoadZ = Math.abs((((z + PITCH / 2) % PITCH) + PITCH) % PITCH - PITCH / 2) < 9;
    if (onRoadX || onRoadZ) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2.5, z);
    trunk.castShadow = true;
    group.add(trunk);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(x, 6, z);
    leaf.castShadow = true;
    group.add(leaf);
  }

  // Beacon tower — the skyline landmark the menu camera orbits.
  const tower = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({ map: winTexes[0], color: 0xffd27a, emissive: 0x442200, roughness: 0.8 }),
  );
  tower.scale.set(22, 112, 22);
  tower.position.set(-30, 56, -30);
  tower.castShadow = true;
  group.add(tower);
  colliders.push({ minX: -41, maxX: -19, minZ: -41, maxZ: -19 });
  const beaconTop = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2e88, emissiveIntensity: 3 }),
  );
  beaconTop.position.set(-30, 114, -30);
  group.add(beaconTop);

  return {
    group,
    colliders,
    bounds: CITY_HALF,
    roadCenters: (() => {
      const a = [];
      for (let k = -GRID; k < GRID; k++) a.push(k * PITCH + PITCH / 2);
      return a;
    })(),
    spawn: { x: 30, z: 44 },
    towerPos: { x: -30, z: -30 },
  };
}

// A random point on a road, for car / pedestrian / pickup spawns.
export function randomRoadPoint(city, rng) {
  const axis = rng.next() < 0.5 ? 'x' : 'z';
  const c = rng.pick(city.roadCenters);
  const v = rng.range(-city.bounds + 20, city.bounds - 20);
  return axis === 'x' ? { x: v, z: c } : { x: c, z: v };
}
