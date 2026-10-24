import type { WeaponId } from './config';

/** Tiny WebAudio synth so the game needs no audio assets. */
export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last: Record<string, number> = {};

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.4;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.4;
  }

  private gate(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.last[key] ?? 0) < ms) return false;
    this.last[key] = now;
    return true;
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', delay = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.03);
  }

  shoot(id: WeaponId) {
    if (!this.gate('shoot' + id, id === 'hail' ? 35 : 25)) return;
    switch (id) {
      case 'pulse': this.tone(900, 260, 0.11, 'square', 0.1); break;
      case 'rifle': this.tone(620, 180, 0.08, 'sawtooth', 0.08); this.noise(0.05, 0.05, 4000, 'highpass'); break;
      case 'scatter': this.noise(0.22, 0.28, 2600); this.tone(160, 50, 0.2, 'square', 0.14); break;
      case 'rail': this.tone(1800, 120, 0.35, 'sawtooth', 0.12); this.noise(0.18, 0.1, 6000, 'highpass'); break;
      case 'plasma': this.tone(300, 90, 0.3, 'sine', 0.2); this.tone(500, 160, 0.2, 'triangle', 0.08); break;
      case 'hail': this.tone(520, 220, 0.05, 'square', 0.06); this.noise(0.04, 0.05, 3000, 'highpass'); break;
    }
  }

  hit() {
    if (!this.gate('hit', 40)) return;
    this.tone(1200, 500, 0.04, 'square', 0.04);
  }
  kill(big = false) {
    if (!this.gate('kill', 30)) return;
    this.noise(big ? 0.5 : 0.22, big ? 0.35 : 0.2, big ? 1400 : 2200);
    this.tone(big ? 120 : 220, 40, big ? 0.5 : 0.25, 'sawtooth', 0.1);
  }
  explosion() {
    if (!this.gate('boom', 50)) return;
    this.noise(0.6, 0.4, 1100);
    this.tone(90, 30, 0.5, 'sine', 0.3);
  }
  hurt() {
    if (!this.gate('hurt', 90)) return;
    this.tone(180, 60, 0.18, 'sawtooth', 0.18);
    this.noise(0.1, 0.12, 900);
  }
  pickup() {
    this.tone(520, 1040, 0.12, 'triangle', 0.14);
    this.tone(780, 1560, 0.14, 'triangle', 0.1, 0.08);
  }
  dash() {
    this.noise(0.25, 0.18, 5000, 'bandpass');
    this.tone(300, 900, 0.18, 'sine', 0.08);
  }
  jump() {
    this.tone(200, 520, 0.2, 'sine', 0.1);
    this.noise(0.18, 0.08, 3500, 'bandpass');
  }
  land() {
    if (!this.gate('land', 120)) return;
    this.noise(0.12, 0.12, 700);
  }
  reload() {
    this.tone(300, 200, 0.05, 'square', 0.08);
    this.tone(500, 380, 0.06, 'square', 0.08, 0.12);
  }
  reloadDone() {
    this.tone(260, 520, 0.08, 'square', 0.1);
  }
  empty() {
    if (!this.gate('empty', 150)) return;
    this.tone(160, 120, 0.05, 'square', 0.08);
  }
  switch() {
    this.tone(400, 700, 0.06, 'square', 0.07);
  }
  buy() {
    this.tone(660, 990, 0.08, 'triangle', 0.12);
    this.tone(990, 1320, 0.1, 'triangle', 0.1, 0.07);
  }
  deny() {
    this.tone(200, 140, 0.12, 'square', 0.1);
  }
  wave() {
    this.tone(220, 330, 0.25, 'sawtooth', 0.12);
    this.tone(330, 495, 0.25, 'sawtooth', 0.1, 0.18);
    this.tone(440, 660, 0.4, 'sawtooth', 0.1, 0.36);
  }
  clear() {
    this.tone(440, 660, 0.15, 'triangle', 0.12);
    this.tone(660, 990, 0.15, 'triangle', 0.12, 0.12);
    this.tone(880, 1320, 0.3, 'triangle', 0.12, 0.24);
  }
  slam() {
    if (!this.gate('slam', 100)) return;
    this.noise(0.4, 0.35, 700);
    this.tone(80, 30, 0.4, 'sine', 0.3);
  }
}
