// save.js — localStorage save: cash, story progress and the player's last
// position. One small JSON object, nothing sensitive.
const KEY = 'sunset-neon-city-3d-save-v2';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return {
      cash: data.cash,
      missionIndex: data.missionIndex || 0,
      completedCount: data.completedCount || 0,
      x: typeof data.x === 'number' ? data.x : null,
      z: typeof data.z === 'number' ? data.z : null,
      health: typeof data.health === 'number' ? data.health : 100,
      bestCash: typeof data.bestCash === 'number' ? data.bestCash : 0,
    };
  } catch (e) {
    return null;
  }
}

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      completedCount: state.completedCount,
      x: state.x,
      z: state.z,
      health: state.health,
      bestCash: state.bestCash || 0,
      savedAt: new Date().toISOString(),
    }));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {}
}

export function hasSave() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch (e) {
    return false;
  }
}
