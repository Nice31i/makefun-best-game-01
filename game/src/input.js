// input.js — keyboard and mouse state for the third-person game.
// Keys are queued on keydown so a short tap is never lost between frames;
// mouse deltas only count while the pointer is locked over the canvas.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.locked = false;
    this.onFirstGesture = null;
    this.onPauseKey = null;
    this.onLockLost = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.onPauseKey) this.onPauseKey();
      }
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
      }
      this.fireGesture();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
      this.fireGesture();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.onLockLost) this.onLockLost();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  fireGesture() {
    if (this.onFirstGesture) {
      const f = this.onFirstGesture;
      this.onFirstGesture = null;
      f();
    }
  }

  requestLock() {
    try {
      if (!this.locked) {
        const r = this.canvas.requestPointerLock();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }
    } catch (e) {
      // Pointer lock is a nicety, never a fatal error.
    }
  }

  releaseLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (e) {}
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once per physical keypress.
  consumePress(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  // WASD / arrow keys as a -1..1 pair, relative to the camera.
  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, y };
  }

  consumeLook() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }
}
