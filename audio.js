/* =========================================================================
   SYNTH AUDIO: everything is generated with Web Audio, no files to load.
   ========================================================================= */
class SoundEngine {
  constructor() { this.ctx = null; this.master = null; this.noiseBuf = null; this.stamp = {}; }

  init() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* audio is optional */ }
  }

  tone(f0, f1, dur, type, vol, delay) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, lowpass) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass || 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  /* limit how often a sound can fire so stacked hits do not turn to mush */
  ok(name, gap) {
    const n = performance.now();
    if (this.stamp[name] && n - this.stamp[name] < gap) return false;
    this.stamp[name] = n; return true;
  }

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'sparker': this.tone(520, 90, 0.11, 'triangle', 0.5); break;
      case 'chomper': this.tone(170, 35, 0.22, 'sawtooth', 0.7); this.noise(0.16, 0.5, 2600); break;
      case 'stinger': this.tone(700, 160, 0.07, 'square', 0.22); break;
      case 'thumper': this.tone(140, 45, 0.25, 'sine', 0.8); this.tone(420, 120, 0.12, 'triangle', 0.3); break;
      case 'lancer':  this.tone(1300, 90, 0.34, 'sawtooth', 0.35); this.tone(320, 60, 0.3, 'sine', 0.6); break;
      case 'zapper':  this.tone(1000, 200, 0.12, 'sawtooth', 0.22); this.noise(0.1, 0.25, 6000); break;
      case 'boom':    this.noise(0.55, 0.9, 900); this.tone(110, 30, 0.45, 'sine', 0.9); break;
      case 'jump':    this.tone(260, 520, 0.12, 'sine', 0.35); break;
      case 'land':    this.tone(120, 50, 0.1, 'sine', 0.45); break;
      case 'dash':    this.tone(240, 700, 0.17, 'sine', 0.55); this.noise(0.14, 0.25, 4000); break;
      case 'pad':     this.tone(200, 1100, 0.3, 'triangle', 0.55); break;
      case 'hit':     if (this.ok('hit', 35)) this.tone(1500, 650, 0.05, 'sine', 0.25); break;
      case 'kill':    this.tone(700, 1500, 0.09, 'triangle', 0.35); break;
      case 'hurt':    if (this.ok('hurt', 90)) { this.tone(180, 60, 0.18, 'sawtooth', 0.55); } break;
      case 'reload':  this.tone(220, 460, 0.1, 'sine', 0.25); this.tone(460, 300, 0.08, 'sine', 0.25, 0.55); break;
      case 'empty':   if (this.ok('empty', 160)) this.tone(300, 250, 0.04, 'square', 0.2); break;
      case 'pickup':  this.tone(600, 1200, 0.08, 'sine', 0.35); this.tone(900, 1600, 0.1, 'sine', 0.3, 0.08); break;
      case 'spit':    this.tone(430, 90, 0.22, 'sawtooth', 0.28); break;
      case 'wave':    this.tone(300, 600, 0.3, 'triangle', 0.4); this.tone(450, 900, 0.3, 'triangle', 0.35, 0.18); break;
      case 'swap':    this.tone(500, 800, 0.05, 'square', 0.15); break;
      case 'lava':    if (this.ok('lava', 300)) this.noise(0.15, 0.3, 700); break;
    }
  }
}
const Sound = new SoundEngine();
