// audio.js — every sound is synthesized with WebAudio; there are no audio
// files, so the game stays fully offline. Engine drone, gunshots, punches,
// sirens, cash chimes and mission jingles are all oscillators + noise.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenNodes = null;
    this.muted = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopSiren();
        this.setEngine(0, false);
      }
    });
  }

  // Call from a user gesture at least once; later calls are no-ops.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      this.startEngineLoop();
      return true;
    } catch (e) {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.35;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.now();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      gain.gain.setValueAtTime(vol || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (e) {
      // Audio is decoration, never fatal.
    }
  }

  noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.now();
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t);
    } catch (e) {}
  }

  shot() {
    this.noise(0.14, 0.5, 2800);
    this.tone(160, 0.1, 'square', 0.18, 60);
  }

  punch() {
    this.noise(0.1, 0.4, 500);
    this.tone(90, 0.12, 'sine', 0.3, 45);
  }

  hurt() {
    this.tone(220, 0.18, 'sawtooth', 0.2, 110);
  }

  pickup() {
    this.tone(880, 0.09, 'sine', 0.22);
    setTimeout(() => this.tone(1320, 0.14, 'sine', 0.22), 70);
  }

  cash() {
    this.tone(988, 0.1, 'triangle', 0.25);
    setTimeout(() => this.tone(1319, 0.1, 'triangle', 0.25), 90);
    setTimeout(() => this.tone(1760, 0.18, 'triangle', 0.25), 180);
  }

  click() {
    this.tone(660, 0.05, 'square', 0.12);
  }

  denied() {
    this.tone(180, 0.16, 'square', 0.16, 120);
  }

  jingle() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.22, 'triangle', 0.26), i * 110));
  }

  fail() {
    [392, 330, 262].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.25, 'sawtooth', 0.15), i * 140));
  }

  startEngineLoop() {
    try {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start();
      this.engineOsc = osc;
      this.engineGain = gain;
    } catch (e) {}
  }

  // speed01: 0 idle .. 1 flat out. Called every frame while driving.
  setEngine(speed01, on) {
    if (!this.engineOsc || !this.ctx) return;
    const t = this.now();
    const target = on ? 0.05 + speed01 * 0.09 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.08);
  }

  startSiren() {
    if (!this.ctx || this.sirenNodes) return;
    try {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 750;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.05;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    } catch (e) {}
  }

  stopSiren() {
    if (!this.sirenNodes) return;
    try {
      this.sirenNodes.osc.stop();
      this.sirenNodes.lfo.stop();
    } catch (e) {}
    this.sirenNodes = null;
  }
}
