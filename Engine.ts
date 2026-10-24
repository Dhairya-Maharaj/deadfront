import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  ENEMIES, KIND_ORDER, MAX_UPGRADE, PICKUPS, SYSTEMS, WEAPONS, WEAPON_ORDER,
  systemCost, upgradeCost,
  type BulletShape, type EnemyDef, type EnemyKind, type MetaMods, type Phase,
  type PickupKind, type RunSummary, type Snapshot, type SystemId, type WeaponId,
} from './config';
import { buildBiped, buildSpider, type Rig } from './mechs';
import { Sfx } from './audio';

// ─────────────────────────────────────────────────────────────
// Constants + helpers
// ─────────────────────────────────────────────────────────────
const ARENA = 58;
const DASH_COST = 34;
const JUMP_COST = 22;
const MAX_ALIVE = 26;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const lerpAngle = (a: number, b: number, t: number) => {
  const d = b - a;
  return a + Math.atan2(Math.sin(d), Math.cos(d)) * t;
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** squared distance from point P to segment AB (XZ plane) */
function segDist2(ax: number, az: number, bx: number, bz: number, px: number, pz: number) {
  const abx = bx - ax, abz = bz - az;
  const l2 = abx * abx + abz * abz;
  let t = l2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t - px, cz = az + abz * t - pz;
  return cx * cx + cz * cz;
}

// ─────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────
interface Obstacle { x: number; z: number; r: number }

interface WeaponState {
  id: WeaponId;
  owned: boolean;
  level: number;
  mag: number;
  reserve: number;
}

interface PlayerState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  py: number;
  vy: number;
  hp: number; maxHp: number;
  shield: number; maxShield: number;
  energy: number; maxEnergy: number; regen: number;
  dashT: number; dashCd: number; dashDir: THREE.Vector3;
  lastHit: number; lastEnergy: number;
  yaw: number;
  over: number; haste: number; aegis: number;
  hull: number; shieldLv: number; capLv: number;
}

interface Enemy {
  id: number;
  def: EnemyDef;
  rig: Rig;
  hp: number; maxHp: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  cd: number;
  windup: number;
  strafe: number; strafeT: number;
  burst: number; burstT: number;
  flash: number;
  ring: THREE.Group | null;
  t: number;
  spawnT: number;
  ringCd: number;
  spawnCd: number;
  dead: boolean;
  speedMul: number;
  dmgMul: number;
}

interface Bullet {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  dmg: number;
  radius: number;
  pierce: number;
  splash: number;
  hit: Set<Enemy>;
  friendly: boolean;
  color: number;
}

interface Pickup {
  group: THREE.Group;
  kind: PickupKind;
  life: number;
  t: number;
  mats: THREE.Material[];
}

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grav: number;
  size: number;
}

interface Wave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  max: number;
  from: number;
  to: number;
}

export interface EngineCallbacks {
  onSnapshot: (s: Snapshot) => void;
  onRunEnd: (s: RunSummary) => void;
  onError?: (msg: string) => void;
}

// shared geometry
const G_SPHERE = new THREE.SphereGeometry(1, 16, 12);
const G_RING = new THREE.RingGeometry(0.9, 1, 56);
const G_DISC = new THREE.CircleGeometry(1, 48);
const G_PART = new THREE.BoxGeometry(1, 1, 1);
const G_BULLET: Record<BulletShape, THREE.BufferGeometry> = {
  bolt: new THREE.BoxGeometry(0.14, 0.14, 1.2),
  slug: new THREE.BoxGeometry(0.1, 0.1, 3.4),
  ball: new THREE.SphereGeometry(0.55, 12, 10),
  orb: new THREE.SphereGeometry(0.34, 10, 8),
};

function makeFloorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a1222';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(120,170,220,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  g.strokeStyle = '#1a3a5c';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 508, 508);
  g.strokeStyle = '#102640';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(256, 0); g.lineTo(256, 512);
  g.moveTo(0, 256); g.lineTo(512, 256);
  g.stroke();
  g.fillStyle = '#2d7a9c';
  for (const [x, y] of [[10, 10], [494, 10], [10, 494], [494, 494]]) g.fillRect(x, y, 8, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ─────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────
export class Engine {
  private host: HTMLElement;
  private cb: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private sun: THREE.DirectionalLight;
  private playerLight: THREE.PointLight;
  private muzzleLight: THREE.PointLight;
  private ro: ResizeObserver;
  private raf = 0;
  private lastT = performance.now();
  private disposed = false;
  private useComposer = true;
  private reported = false;

  private sfx = new Sfx();
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private mouse = new THREE.Vector2(0, -0.3);
  private aim = new THREE.Vector3(0, 0, 10);
  private camTarget = new THREE.Vector3();
  private shake = 0;
  private tmpV = new THREE.Vector3();

  // input
  private keys = new Set<string>();
  private mouseDown = false;
  private fireBuf = 0;
  private wantDash = false;
  private wantJump = false;
  private wantReload = false;

  // world
  private obstacles: Obstacle[] = [];
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];
  private pIndex = 0;
  private waves: Wave[] = [];
  private bulletMats = new Map<number, THREE.MeshBasicMaterial>();
  private enemyId = 0;

  // player
  private p: PlayerState = this.newPlayer();
  private rig: Rig;
  private weapons: Record<WeaponId, WeaponState> = this.newWeapons();
  private cur: WeaponId = 'pulse';
  private fireCd = 0;
  private reloadT = 0;
  private reloadDur = 1;

  // run state
  private phase: Phase = 'menu';
  private mods: MetaMods = { hp: 0, dmg: 1, credit: 1, start: 0, energy: 0 };
  private time = 0;
  private wave = 0;
  private waveState: 'countdown' | 'active' = 'countdown';
  private countdown = 4;
  private queue: EnemyKind[] = [];
  private spawnT = 0;
  private credits = 0;
  private score = 0;
  private kills = 0;
  private bossKills = 0;
  private summary: RunSummary | null = null;
  private hurtCount = 0;
  private hitCount = 0;
  private bannerId = 0;
  private banner: Snapshot['banner'] = null;
  private toastId = 0;
  private toast: Snapshot['toast'] = null;
  private snapT = 0;
  private fps = 60;
  private orbit = 0;

  constructor(host: HTMLElement, cb: EngineCallbacks) {
    this.host = host;
    this.cb = cb;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x04060d);
    this.scene.fog = new THREE.Fog(0x04060d, 60, 135);

    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.5, 400);
    this.camera.position.set(0, 30, 21);

    // post
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.75, 0.55, 0.92);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.setSize(w, h);

    // lights
    this.scene.add(new THREE.HemisphereLight(0x5b7fb8, 0x0a0f1a, 1.3));
    this.sun = new THREE.DirectionalLight(0xa9c8ff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 5; sc.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);
    this.playerLight = new THREE.PointLight(0x3df2ff, 260, 30, 2);
    this.scene.add(this.playerLight);
    this.muzzleLight = new THREE.PointLight(0xffffff, 0, 22, 2);
    this.scene.add(this.muzzleLight);

    this.buildWorld();
    this.buildParticles();

    // player rig
    this.rig = buildBiped(
      { body: 0x1e3550, dark: 0x0e1a2a, accent: 0x3df2ff },
      { scale: 1, bulk: 1, guns: 'single', jets: true },
    );
    this.scene.add(this.rig.root);

    // events
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('contextmenu', this.onContext);
    this.ro = new ResizeObserver(() => {
      const hw = host.clientWidth, hh = host.clientHeight;
      if (hw > 0 && hh > 0) this.setSize(hw, hh);
    });
    this.ro.observe(host);

    this.emit();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ───────────────────────── public API ─────────────────────────
  start(mods: MetaMods) {
    this.sfx.unlock();
    this.clearWorld();
    this.mods = mods;
    this.p = this.newPlayer();
    this.p.maxHp = 100 + mods.hp;
    this.p.hp = this.p.maxHp;
    this.p.maxEnergy = 100 + mods.energy;
    this.p.energy = this.p.maxEnergy;
    this.weapons = this.newWeapons();
    this.cur = 'pulse';
    this.fireCd = 0;
    this.reloadT = 0;
    this.time = 0;
    this.wave = 0;
    this.waveState = 'countdown';
    this.countdown = 4;
    this.queue = [];
    this.credits = 200 + mods.start;
    this.score = 0;
    this.kills = 0;
    this.bossKills = 0;
    this.summary = null;
    this.rig.root.visible = true;
    this.camTarget.set(0, 0, 0);
    this.phase = 'playing';
    this.say('Deadfront', 'Hold the line. Press B for the armory.');
    this.emit();
  }

  pause() { if (this.phase === 'playing') this.setPhase('paused'); }
  resume() { if (this.phase === 'paused' || this.phase === 'shop') this.setPhase('playing'); }
  openShop() { if (this.phase === 'playing') this.setPhase('shop'); }
  closeShop() { if (this.phase === 'shop') this.setPhase('playing'); }
  quitToMenu() {
    this.clearWorld();
    this.rig.root.visible = true;
    this.setPhase('menu');
  }
  setMuted(m: boolean) { this.sfx.setMuted(m); this.emit(); }
  toggleBloom() {
    this.bloomPass.enabled = !this.bloomPass.enabled;
    this.emit();
  }
  selectWeapon(id: WeaponId) {
    const w = this.weapons[id];
    if (!w.owned || id === this.cur) return;
    this.cur = id;
    this.reloadT = 0;
    this.fireCd = 0.15;
    this.sfx.switch();
    this.emit();
  }

  buyWeapon(id: WeaponId) {
    const w = this.weapons[id], def = WEAPONS[id];
    if (w.owned || this.credits < def.cost) return this.deny();
    this.credits -= def.cost;
    w.owned = true;
    w.mag = def.mag;
    w.reserve = Math.floor(def.reserveMax * 0.5);
    this.cur = id;
    this.sfx.buy();
    this.emit();
  }
  upgradeWeapon(id: WeaponId) {
    const w = this.weapons[id];
    if (!w.owned || w.level >= MAX_UPGRADE) return this.deny();
    const c = upgradeCost(w.level);
    if (this.credits < c) return this.deny();
    this.credits -= c;
    w.level++;
    this.sfx.buy();
    this.emit();
  }
  buyAmmo(id: WeaponId) {
    const w = this.weapons[id], def = WEAPONS[id];
    if (!w.owned || !isFinite(def.reserveMax) || w.reserve >= def.reserveMax || this.credits < def.packCost) {
      return this.deny();
    }
    this.credits -= def.packCost;
    w.reserve = Math.min(def.reserveMax, w.reserve + def.packSize);
    this.sfx.buy();
    this.emit();
  }
  buySystem(id: SystemId) {
    const p = this.p;
    const owned = id === 'hull' ? p.hull : id === 'shield' ? p.shieldLv : id === 'cap' ? p.capLv : 0;
    if (owned >= SYSTEMS[id].max) return this.deny();
    const c = systemCost(id, owned);
    if (this.credits < c) return this.deny();
    if (id === 'repair' && p.hp >= p.maxHp && p.shield >= p.maxShield) return this.deny();
    this.credits -= c;
    switch (id) {
      case 'repair': p.hp = p.maxHp; p.shield = p.maxShield; break;
      case 'hull': p.hull++; p.maxHp += 25; p.hp += 25; break;
      case 'shield': p.shieldLv++; p.maxShield += 20; p.shield += 20; break;
      case 'cap': p.capLv++; p.maxEnergy += 20; p.regen += 7; p.energy += 20; break;
    }
    this.sfx.buy();
    this.emit();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContext);
    this.ro.disconnect();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ───────────────────────── setup ─────────────────────────
  private setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private newPlayer(): PlayerState {
    return {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), py: 0, vy: 0,
      hp: 100, maxHp: 100, shield: 50, maxShield: 50,
      energy: 100, maxEnergy: 100, regen: 28,
      dashT: 0, dashCd: 0, dashDir: new THREE.Vector3(0, 0, 1),
      lastHit: -99, lastEnergy: -99, yaw: 0,
      over: 0, haste: 0, aegis: 0, hull: 0, shieldLv: 0, capLv: 0,
    };
  }

  private newWeapons(): Record<WeaponId, WeaponState> {
    const out = {} as Record<WeaponId, WeaponState>;
    for (const id of WEAPON_ORDER) {
      const def = WEAPONS[id];
      const starter = id === 'pulse';
      out[id] = { id, owned: starter, level: 0, mag: starter ? def.mag : 0, reserve: starter ? Infinity : 0 };
    }
    return out;
  }

  private buildWorld() {
    const scene = this.scene;

    // floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ map: makeFloorTexture(), metalness: 0.85, roughness: 0.4 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // center emblem
    const emblem = new THREE.Mesh(
      new THREE.RingGeometry(9, 9.35, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3df2ff).multiplyScalar(1.4), transparent: true, opacity: 0.55 }),
    );
    emblem.rotation.x = -Math.PI / 2;
    emblem.position.y = 0.03;
    scene.add(emblem);

    // perimeter walls + neon edge
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d1626, metalness: 0.8, roughness: 0.45 });
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3df2ff).multiplyScalar(1.8) });
    const L = ARENA * 2 + 4;
    const defs: [number, number, number, number][] = [
      [0, -ARENA - 2, L, 2], [0, ARENA + 2, L, 2],
      [-ARENA - 2, 0, 2, L], [ARENA + 2, 0, 2, L],
    ];
    for (const [x, z, sx, sz] of defs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 4, sz), wallMat);
      wall.position.set(x, 2, z);
      wall.receiveShadow = true;
      scene.add(wall);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(sx > sz ? sx : 0.25, 0.25, sz > sx ? sz : 0.25), edgeMat);
      strip.position.set(x + (sx > sz ? 0 : Math.sign(x) * -1), 4.05, z + (sz > sx ? 0 : Math.sign(z) * -1));
      scene.add(strip);
    }

    // obstacles
    const rng = mulberry32(1337);
    let tries = 0;
    while (this.obstacles.length < 14 && tries++ < 500) {
      const a = rng() * Math.PI * 2;
      const d = 14 + rng() * 38;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const r = 2 + rng() * 1.5;
      if (Math.abs(x) > ARENA - r - 4 || Math.abs(z) > ARENA - r - 4) continue;
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 9)) continue;
      this.obstacles.push({ x, z, r });
    }
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x16243a, metalness: 0.85, roughness: 0.4 });
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d5a).multiplyScalar(1.6) });
    for (const o of this.obstacles) {
      const h = 4 + (o.r - 2) * 4;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.92, o.r, h, 6), pillarMat);
      body.position.set(o.x, h / 2, o.z);
      body.castShadow = body.receiveShadow = true;
      scene.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.75, o.r * 0.75, 0.18, 6), ringMat);
      cap.position.set(o.x, h + 0.05, o.z);
      scene.add(cap);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.96, o.r * 0.98, 0.12, 6), ringMat);
      band.position.set(o.x, h * 0.55, o.z);
      scene.add(band);
    }

    // distant skyline
    const skyMat = new THREE.MeshStandardMaterial({ color: 0x0a1020, metalness: 0.6, roughness: 0.7 });
    const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2b8cff).multiplyScalar(1.3) });
    const srng = mulberry32(42);
    for (let i = 0; i < 70; i++) {
      const a = srng() * Math.PI * 2;
      const d = 95 + srng() * 60;
      const bw = 8 + srng() * 12, bh = 20 + srng() * 70;
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw), skyMat);
      b.position.set(Math.cos(a) * d, bh / 2, Math.sin(a) * d);
      scene.add(b);
      if (srng() < 0.5) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.2, 0.5, bw + 0.2), winMat);
        s.position.set(b.position.x, bh * (0.4 + srng() * 0.5), b.position.z);
        scene.add(s);
      }
    }
  }

  private buildParticles() {
    for (let i = 0; i < 520; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(G_PART, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particles.push({ mesh, mat, vel: new THREE.Vector3(), life: 0, max: 1, grav: 0, size: 0.1 });
    }
  }

  private clearWorld() {
    for (const e of this.enemies) this.removeEnemyVisuals(e);
    this.enemies = [];
    for (const b of this.bullets) this.scene.remove(b.mesh);
    this.bullets = [];
    for (const pk of this.pickups) this.removePickup(pk);
    this.pickups = [];
    for (const w of this.waves) { this.scene.remove(w.mesh); w.mat.dispose(); }
    this.waves = [];
    for (const pt of this.particles) { pt.life = 0; pt.mesh.visible = false; }
    this.muzzleLight.intensity = 0;
    this.queue = [];
    this.banner = null;
    this.toast = null;
  }

  // ───────────────────────── input ─────────────────────────
  private onKeyDown = (e: KeyboardEvent) => {
    const c = e.code;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(c);

    if (c === 'KeyM') this.setMuted(!this.sfx.muted);
    if (c === 'KeyQ' && this.phase !== 'menu') this.toggleBloom();

    if (c === 'Escape' || c === 'KeyP') {
      if (this.phase === 'playing') this.setPhase('paused');
      else if (this.phase === 'paused' || this.phase === 'shop') this.setPhase('playing');
      return;
    }
    if (c === 'KeyB') {
      if (this.phase === 'playing') this.setPhase('shop');
      else if (this.phase === 'shop') this.setPhase('playing');
      return;
    }
    if (this.phase !== 'playing') return;
    if (c === 'ShiftLeft' || c === 'ShiftRight') this.wantDash = true;
    if (c === 'Space') this.wantJump = true;
    if (c === 'KeyR') this.wantReload = true;
    const m = /^Digit([1-6])$/.exec(c);
    if (m) this.selectWeapon(WEAPON_ORDER[Number(m[1]) - 1]);
  };

  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  private onBlur = () => {
    this.keys.clear();
    this.mouseDown = false;
    if (this.phase === 'playing') this.setPhase('paused');
  };

  private onPointerMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || e.target !== this.renderer.domElement) return;
    this.sfx.unlock();
    if (this.phase === 'playing') {
      this.mouseDown = true;
      this.fireBuf = 0.18;
    }
  };

  private onPointerUp = () => { this.mouseDown = false; };
  private onContext = (e: Event) => e.preventDefault();

  private setPhase(ph: Phase) {
    this.phase = ph;
    this.mouseDown = false;
    this.emit();
  }

  // ───────────────────────── main loop ─────────────────────────
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    try {
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

      if (this.phase === 'playing') this.step(dt);
      else if (this.phase === 'dead') {
        this.time += dt;
        this.updateBullets(dt);
        this.updateFx(dt);
      } else if (this.phase === 'menu') {
        this.menuIdle(dt);
      }
      this.updateCamera(dt);

      this.snapT += dt;
      if (this.snapT > 0.066) { this.snapT = 0; this.emit(); }
    } catch (err) {
      this.report(err);
    }
    this.draw();
  };

  private draw() {
    try {
      if (this.useComposer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    } catch (err) {
      if (this.useComposer) {
        // post-processing failed on this GPU: fall back to a plain render
        this.useComposer = false;
        console.warn('Post-processing disabled:', err);
      } else {
        this.report(err);
      }
    }
  }

  private report(err: unknown) {
    console.error(err);
    if (this.reported) return;
    this.reported = true;
    this.cb.onError?.(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
  }

  private step(dt: number) {
    this.time += dt;
    this.updatePlayer(dt);
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateBuffs(dt);
    this.updateFx(dt);
  }

  private menuIdle(dt: number) {
    this.orbit += dt * 0.12;
    this.rig.root.position.set(0, 0, 0);
    this.rig.root.rotation.y = this.orbit * 0.6 + 0.6;
    this.rig.update(dt, 0, 0);
    this.rig.setThrust(0);
    this.playerLight.position.set(0, 4, 0);
    this.updateFx(dt);
  }

  // ───────────────────────── player ─────────────────────────
  private updateAim() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, this.tmpV);
    if (hit) {
      const dx = hit.x - this.p.pos.x, dz = hit.z - this.p.pos.z;
      const d = Math.hypot(dx, dz);
      const k = d > 42 ? 42 / d : 1;
      this.aim.set(this.p.pos.x + dx * k, 0, this.p.pos.z + dz * k);
    }
  }

  private updatePlayer(dt: number) {
    const p = this.p, k = this.keys;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }

    this.updateAim();
    const ax = this.aim.x - p.pos.x, az = this.aim.z - p.pos.z;
    if (Math.hypot(ax, az) > 0.6) p.yaw = Math.atan2(ax, az);

    // dash + jump
    if (this.wantDash) {
      this.wantDash = false;
      if (p.dashCd <= 0 && p.energy >= DASH_COST) {
        p.energy -= DASH_COST;
        p.lastEnergy = this.time;
        p.dashT = 0.2;
        p.dashCd = 0.6;
        if (ml > 0) p.dashDir.set(mx, 0, mz);
        else p.dashDir.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
        this.sfx.dash();
        this.addShake(0.25);
        this.burst(p.pos.x, 1, p.pos.z, 0x3df2ff, 16, 6, 0.12, 0.35, 1);
      } else this.sfx.deny();
    }
    if (this.wantJump) {
      this.wantJump = false;
      if (p.py <= 0.01 && p.energy >= JUMP_COST) {
        p.energy -= JUMP_COST;
        p.lastEnergy = this.time;
        p.vy = 15;
        p.py = 0.02;
        this.sfx.jump();
        this.burst(p.pos.x, 0.2, p.pos.z, 0x9fdcff, 14, 5, 0.1, 0.4, 0);
      } else if (p.py > 0.01) {
        // already airborne
      } else this.sfx.deny();
    }

    p.dashCd -= dt;
    const haste = p.haste > 0 ? 1.45 : 1;
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vel.set(p.dashDir.x * 40, 0, p.dashDir.z * 40);
      if (Math.random() < 0.7) this.burst(p.pos.x, 0.9, p.pos.z, 0x3df2ff, 1, 1, 0.2, 0.3, 0);
    } else {
      const a = 1 - Math.exp(-dt * (p.py > 0 ? 6 : 14));
      p.vel.x += (mx * 11 * haste - p.vel.x) * a;
      p.vel.z += (mz * 11 * haste - p.vel.z) * a;
    }
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    this.pushOut(p.pos, 1.1);

    if (p.py > 0 || p.vy > 0) {
      p.vy -= 42 * dt;
      p.py += p.vy * dt;
      if (p.py <= 0) {
        p.py = 0; p.vy = 0;
        this.sfx.land();
        this.burst(p.pos.x, 0.2, p.pos.z, 0x9fdcff, 10, 4, 0.1, 0.3, 0);
      }
    }
    if (this.time - p.lastEnergy > 0.7) p.energy = Math.min(p.maxEnergy, p.energy + p.regen * dt);
    if (this.time - p.lastHit > 4) p.shield = Math.min(p.maxShield, p.shield + 20 * dt);

    // rig
    this.rig.root.position.set(p.pos.x, p.py, p.pos.z);
    this.rig.root.rotation.y = p.yaw;
    this.rig.update(dt, Math.hypot(p.vel.x, p.vel.z), 0);
    this.rig.setThrust(p.dashT > 0 ? 1 : p.py > 0.1 ? 0.7 : 0);
    this.playerLight.position.set(p.pos.x, 4.5, p.pos.z);
    this.sun.position.set(p.pos.x - 24, 55, p.pos.z + 20);
    this.sun.target.position.set(p.pos.x, 0, p.pos.z);

    this.updateWeapon(dt);
    this.muzzleLight.intensity *= Math.exp(-dt * 26);
  }

  private dmgMul(ws: WeaponState) {
    return (1 + 0.22 * ws.level) * this.mods.dmg * (this.p.over > 0 ? 2 : 1);
  }

  private updateWeapon(dt: number) {
    const ws = this.weapons[this.cur], def = WEAPONS[this.cur];
    this.fireCd -= dt;
    this.fireBuf -= dt;

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = def.mag - ws.mag;
        const take = Math.min(need, ws.reserve);
        ws.mag += take;
        ws.reserve -= take;
        this.reloadT = 0;
        this.sfx.reloadDone();
      }
    } else {
      if (this.wantReload && ws.mag < def.mag && ws.reserve > 0) this.startReload();
      const wants = def.auto ? this.mouseDown : this.fireBuf > 0;
      if (wants && this.fireCd <= 0) {
        if (ws.mag > 0) {
          this.fire(ws, def);
          this.fireBuf = 0;
        } else if (ws.reserve > 0) {
          this.startReload();
        } else {
          this.sfx.empty();
          this.fireCd = 0.25;
          this.fireBuf = 0;
        }
      }
    }
    this.wantReload = false;
  }

  private startReload() {
    const def = WEAPONS[this.cur];
    this.reloadDur = def.reload;
    this.reloadT = def.reload;
    this.sfx.reload();
  }

  private fire(ws: WeaponState, def: (typeof WEAPONS)[WeaponId]) {
    const p = this.p;
    const mz = this.rig.muzzle.getWorldPosition(new THREE.Vector3());
    let dx = this.aim.x - mz.x, dz = this.aim.z - mz.z;
    if (Math.hypot(dx, dz) < 2) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw); }
    const base = Math.atan2(dx, dz);
    const dmg = def.damage * this.dmgMul(ws);

    for (let i = 0; i < def.pellets; i++) {
      let ang = base;
      if (def.pellets > 1) {
        ang += (i / (def.pellets - 1) - 0.5) * def.spread * 2 + rand(-0.03, 0.03);
      } else {
        ang += rand(-def.spread, def.spread);
      }
      const spd = def.speed * (def.pellets > 1 ? rand(0.9, 1.1) : 1);
      const vel = new THREE.Vector3(Math.sin(ang) * spd, 0, Math.cos(ang) * spd);
      this.spawnBullet(mz, vel, {
        dmg, friendly: true, color: def.color, shape: def.shape, life: def.life,
        pierce: def.pierce, splash: def.splash, radius: def.shape === 'ball' ? 0.6 : 0.35,
      });
    }

    ws.mag--;
    this.fireCd = 1 / (def.rate * (p.haste > 0 ? 1.35 : 1));
    this.muzzleLight.color.setHex(def.color);
    this.muzzleLight.position.copy(mz);
    this.muzzleLight.intensity = 420;
    this.burst(mz.x, mz.y, mz.z, def.color, 4, 7, 0.09, 0.14, 0);
    this.addShake(def.kick);
    this.sfx.shoot(def.id);
    if (ws.mag === 0 && ws.reserve > 0) this.startReload();
  }

  private damagePlayer(amount: number) {
    const p = this.p;
    if (p.aegis > 0 || p.dashT > 0 || this.phase !== 'playing') return;
    p.lastHit = this.time;
    this.hurtCount++;
    this.addShake(0.5);
    this.sfx.hurt();
    let rem = amount;
    if (p.shield > 0) {
      const a = Math.min(p.shield, rem);
      p.shield -= a;
      rem -= a;
    }
    p.hp -= rem;
    this.burst(p.pos.x, 2, p.pos.z, 0xff3d5a, 8, 5, 0.1, 0.3, 2);
    if (p.hp <= 0) { p.hp = 0; this.die(); }
  }

  private die() {
    const p = this.p;
    this.phase = 'dead';
    this.mouseDown = false;
    this.rig.root.visible = false;
    this.rig.setThrust(0);
    this.explosionFx(p.pos.x, 1.5, p.pos.z, 0x3df2ff, 6);
    this.burst(p.pos.x, 1.5, p.pos.z, 0x3df2ff, 60, 12, 0.18, 1.2, 8);
    this.addShake(1.4);
    this.sfx.explosion();
    const cores = Math.max(1, Math.round((this.wave - 1) * 2 + this.kills / 25 + this.bossKills * 5));
    this.summary = {
      wave: this.wave, score: this.score, kills: this.kills,
      bossKills: this.bossKills, cores, time: this.time,
    };
    this.cb.onRunEnd(this.summary);
    this.emit();
  }

  private updateBuffs(dt: number) {
    const p = this.p;
    p.over = Math.max(0, p.over - dt);
    p.haste = Math.max(0, p.haste - dt);
    p.aegis = Math.max(0, p.aegis - dt);
  }

  // ───────────────────────── waves ─────────────────────────
  private say(text: string, sub = '') {
    this.banner = { id: ++this.bannerId, text, sub };
  }
  private toastMsg(text: string, color: number) {
    this.toast = { id: ++this.toastId, text, color };
  }

  private composeWave(n: number): EnemyKind[] {
    const list: EnemyKind[] = [];
    let budget = 4 + n * 3.2 + Math.floor(n * n * 0.12);
    const boss = n % 5 === 0;
    if (boss) { list.push('titan'); budget *= 0.55; }
    const pool = (['scout', 'trooper', 'hunter', 'brute'] as EnemyKind[]).filter((k) => ENEMIES[k].minWave <= n);
    let guard = 0;
    const rest: EnemyKind[] = [];
    while (budget >= 1 && guard++ < 250) {
      const opts = pool.filter((k) => ENEMIES[k].cost <= budget);
      if (!opts.length) break;
      const weights = opts.map((k) => 1 / ENEMIES[k].cost + (k === 'trooper' ? 0.15 : 0));
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      let pick = opts[0];
      for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r <= 0) { pick = opts[i]; break; } }
      rest.push(pick);
      budget -= ENEMIES[pick].cost;
    }
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return list.concat(rest);
  }

  private startWave(n: number) {
    this.wave = n;
    this.waveState = 'active';
    this.queue = this.composeWave(n);
    this.spawnT = 0.5;
    const boss = n % 5 === 0;
    this.say(`Wave ${n}`, boss ? 'Titan Prime inbound' : `${this.queue.length} hostiles detected`);
    this.sfx.wave();
  }

  private updateWaves(dt: number) {
    if (this.waveState === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startWave(this.wave + 1);
      return;
    }
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0 && this.enemies.length < MAX_ALIVE) {
      this.spawnEnemy(this.queue.shift()!);
      this.spawnT = clamp(1.0 - this.wave * 0.035, 0.28, 1.0);
    }
    if (!this.queue.length && this.enemies.length === 0) {
      const bonus = 50 + 15 * this.wave;
      const gain = Math.round(bonus * this.mods.credit);
      this.credits += gain;
      this.score += bonus * 5;
      this.p.hp = Math.min(this.p.maxHp, this.p.hp + 25);
      this.waveState = 'countdown';
      this.countdown = 9;
      this.say(`Wave ${this.wave} cleared`, `+${gain} credits. Press B to visit the armory.`);
      this.sfx.clear();
    }
  }

  // ───────────────────────── enemies ─────────────────────────
  private spawnEnemy(kind: EnemyKind, at?: THREE.Vector3) {
    const def = ENEMIES[kind];
    const p = this.p;
    const pos = new THREE.Vector3();
    if (at) pos.copy(at);
    else {
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        pos.set(Math.cos(a) * 52, 0, Math.sin(a) * 52);
        pos.x = clamp(pos.x, -ARENA + 3, ARENA - 3);
        pos.z = clamp(pos.z, -ARENA + 3, ARENA - 3);
        if (Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) > 28) break;
      }
    }
    const small = kind === 'scout' || kind === 'trooper';
    const pal = { body: def.body, dark: def.dark, accent: def.accent };
    let rig: Rig;
    if (def.model === 'spider') {
      rig = buildSpider(pal, { scale: def.scale, legPairs: kind === 'scout' ? 3 : 2, turret: kind === 'hunter', shadows: !small });
    } else if (kind === 'brute') {
      rig = buildBiped(pal, { scale: def.scale, bulk: 1.5, guns: 'none', fists: true, shadows: true });
    } else if (kind === 'titan') {
      rig = buildBiped(pal, { scale: def.scale, bulk: 1.35, guns: 'dual', heavy: true, pods: true, shadows: true });
    } else {
      rig = buildBiped(pal, { scale: def.scale, bulk: 1, guns: 'single', shadows: false });
    }
    rig.root.position.copy(pos);
    rig.root.scale.setScalar(0.2);
    this.scene.add(rig.root);

    const w = this.wave;
    let hpScale = 1 + 0.11 * (w - 1);
    if (kind === 'titan') hpScale = 1 + 0.4 * (w / 5 - 1);
    const hp = def.hp * hpScale;
    const e: Enemy = {
      id: ++this.enemyId, def, rig, hp, maxHp: hp, pos, vel: new THREE.Vector3(),
      yaw: Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z),
      cd: rand(0.3, 1.2), windup: 0, strafe: Math.random() < 0.5 ? -1 : 1, strafeT: rand(1, 3),
      burst: 0, burstT: 0, flash: 0, ring: null, t: Math.random() * 10, spawnT: 0.7,
      ringCd: 3, spawnCd: 8, dead: false,
      speedMul: 1 + Math.min(0.5, 0.015 * (w - 1)),
      dmgMul: 1 + 0.03 * (w - 1),
    };
    this.enemies.push(e);
    this.fxRing(pos.x, 0.08, pos.z, def.accent, 0.5, def.radius * 2.4, 0.6);
    this.burst(pos.x, 0.5, pos.z, def.accent, 10, 5, 0.12, 0.5, 2);
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) this.updateEnemy(e, dt);
    // separation
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = (a.def.radius + b.def.radius) * 0.9;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          const wa = b.def.radius / (a.def.radius + b.def.radius);
          a.pos.x -= nx * push * 2 * wa; a.pos.z -= nz * push * 2 * wa;
          b.pos.x += nx * push * 2 * (1 - wa); b.pos.z += nz * push * 2 * (1 - wa);
        }
      }
    }
    for (const e of list) {
      e.pos.x = clamp(e.pos.x, -ARENA + 1, ARENA - 1);
      e.pos.z = clamp(e.pos.z, -ARENA + 1, ARENA - 1);
      e.rig.root.position.set(e.pos.x, 0, e.pos.z);
    }
  }

  private updateEnemy(e: Enemy, dt: number) {
    const p = this.p, def = e.def;
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt * 6);
    e.rig.flash(e.flash);

    if (e.spawnT > 0) {
      e.spawnT -= dt;
      e.rig.root.scale.setScalar(0.2 + 0.8 * easeOut(1 - Math.max(0, e.spawnT) / 0.7));
      e.rig.root.rotation.y = e.yaw;
      e.rig.update(dt, 0, 0);
      return;
    }
    e.rig.root.scale.setScalar(1);

    const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist, nz = dz / dist;
    e.yaw = lerpAngle(e.yaw, Math.atan2(nx, nz), 1 - Math.exp(-dt * (def.ai === 'smasher' ? 4 : 8)));

    let tx = 0, tz = 0, attack = 0;
    const speed = def.speed * e.speedMul;
    e.cd -= dt;

    switch (def.ai) {
      case 'rush': {
        const w = Math.sin(e.t * 5 + e.id) * 0.35;
        tx = (nx - nz * w) * speed;
        tz = (nz + nx * w) * speed;
        if (dist < def.radius + 1.3 && e.cd <= 0 && p.py < 1.3) {
          this.damagePlayer(def.contact * e.dmgMul);
          e.cd = 0.8;
          this.burst(p.pos.x, 1.5, p.pos.z, def.accent, 6, 5, 0.1, 0.25, 1);
        }
        break;
      }
      case 'ranged': {
        const pref = def.pref ?? 14;
        if (dist > pref + 2) { tx = nx * speed; tz = nz * speed; }
        else if (dist < pref - 4) { tx = -nx * speed * 0.8; tz = -nz * speed * 0.8; }
        else {
          e.strafeT -= dt;
          if (e.strafeT <= 0) { e.strafe = Math.random() < 0.5 ? -1 : 1; e.strafeT = rand(1.5, 3.5); }
          tx = -nz * e.strafe * speed * 0.7;
          tz = nx * e.strafe * speed * 0.7;
        }
        if (e.burst > 0) {
          e.burstT -= dt;
          if (e.burstT <= 0) { this.enemyShot(e, 0); e.burst--; e.burstT = 0.13; }
        } else if (e.cd <= 0 && dist < pref + 12) {
          e.burst = def.burst ?? 1;
          e.burstT = 0;
          e.cd = 1 / (def.rate ?? 0.7) + rand(0, 0.4);
        }
        break;
      }
      case 'smasher': {
        if (e.windup > 0) {
          e.windup -= dt;
          attack = 1 - clamp(e.windup / 0.9, 0, 1);
          if (e.ring) {
            const fill = e.ring.children[0] as THREE.Mesh;
            (fill.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.35 * attack;
          }
          if (e.windup <= 0) this.slam(e);
        } else {
          tx = nx * speed; tz = nz * speed;
          if (dist < def.radius + 3.4 && e.cd <= 0) {
            e.windup = 0.9;
            this.makeRing(e, 6.5);
          }
        }
        break;
      }
      case 'boss': {
        const enraged = e.hp < e.maxHp * 0.5;
        if (dist > 19) { tx = nx * speed; tz = nz * speed; }
        else if (dist < 10) { tx = -nx * speed * 0.8; tz = -nz * speed * 0.8; }
        else {
          e.strafeT -= dt;
          if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = rand(2, 4); }
          tx = -nz * e.strafe * speed * 0.6;
          tz = nx * e.strafe * speed * 0.6;
        }
        if (e.burst > 0) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            for (const off of [-0.14, 0, 0.14]) this.enemyShot(e, off);
            e.burst--;
            e.burstT = 0.2;
          }
        } else if (e.cd <= 0) {
          e.burst = enraged ? 3 : 2;
          e.burstT = 0;
          e.cd = enraged ? 1.6 : 2.4;
        }
        e.ringCd -= dt;
        if (e.ringCd <= 0) {
          this.bossRing(e, enraged ? 30 : 20);
          e.ringCd = enraged ? 3.4 : 4.8;
        }
        e.spawnCd -= dt;
        if (e.spawnCd <= 0) {
          e.spawnCd = enraged ? 6 : 9;
          if (this.enemies.length < MAX_ALIVE + 6) {
            for (let i = 0; i < 3; i++) {
              const a = Math.random() * Math.PI * 2;
              this.spawnEnemy('scout', new THREE.Vector3(
                clamp(e.pos.x + Math.cos(a) * 6, -ARENA + 3, ARENA - 3), 0,
                clamp(e.pos.z + Math.sin(a) * 6, -ARENA + 3, ARENA - 3)));
            }
          }
        }
        if (dist < def.radius + 3 && e.windup <= 0 && p.py < 1.3 && e.t % 4 < 0.03) {
          this.damagePlayer(def.contact * e.dmgMul);
        }
        attack = e.ringCd < 0.5 ? 0.4 : 0;
        break;
      }
    }

    const a = 1 - Math.exp(-dt * 6);
    e.vel.x += (tx - e.vel.x) * a;
    e.vel.z += (tz - e.vel.z) * a;
    e.pos.x += e.vel.x * dt;
    e.pos.z += e.vel.z * dt;
    this.pushOut(e.pos, def.radius * 0.8);

    e.rig.root.rotation.y = e.yaw;
    e.rig.update(dt, Math.hypot(e.vel.x, e.vel.z), attack);
    if (e.ring) e.ring.position.set(e.pos.x, 0.07, e.pos.z);
  }

  private makeRing(e: Enemy, radius: number) {
    const g = new THREE.Group();
    const fill = new THREE.Mesh(G_DISC, new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff2a4d).multiplyScalar(1.4), transparent: true, opacity: 0.1, depthWrite: false,
    }));
    const edge = new THREE.Mesh(G_RING, new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff2a4d).multiplyScalar(2), transparent: true, opacity: 0.9, depthWrite: false,
    }));
    fill.rotation.x = edge.rotation.x = -Math.PI / 2;
    g.add(fill, edge);
    g.scale.setScalar(radius);
    g.position.set(e.pos.x, 0.07, e.pos.z);
    this.scene.add(g);
    e.ring = g;
  }

  private removeRing(e: Enemy) {
    if (!e.ring) return;
    this.scene.remove(e.ring);
    for (const c of e.ring.children) ((c as THREE.Mesh).material as THREE.Material).dispose();
    e.ring = null;
  }

  private slam(e: Enemy) {
    const p = this.p;
    this.removeRing(e);
    e.cd = 1.5;
    const r = 6.5;
    if (Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) < r + 0.8 && p.py < 1.4) {
      this.damagePlayer(e.def.contact * e.dmgMul);
    }
    this.fxRing(e.pos.x, 0.1, e.pos.z, 0xff5a1f, 1, r, 0.45);
    this.burst(e.pos.x, 0.3, e.pos.z, 0xff5a1f, 24, 9, 0.14, 0.5, 4);
    this.addShake(0.6);
    this.sfx.slam();
  }

  private enemyShot(e: Enemy, off: number) {
    const def = e.def, p = this.p;
    const o = e.rig.muzzle.getWorldPosition(new THREE.Vector3());
    const spd = def.pspeed ?? 24;
    const dist = Math.hypot(p.pos.x - o.x, p.pos.z - o.z);
    const lead = Math.min(0.6, dist / spd) * 0.7;
    const tx = p.pos.x + p.vel.x * lead, tz = p.pos.z + p.vel.z * lead;
    const ang = Math.atan2(tx - o.x, tz - o.z) + off + rand(-0.05, 0.05);
    this.spawnBullet(o, new THREE.Vector3(Math.sin(ang) * spd, 0, Math.cos(ang) * spd), {
      dmg: (def.pdmg ?? 7) * e.dmgMul, friendly: false, color: def.accent, shape: 'orb',
      life: 3.5, pierce: 0, splash: 0, radius: 0.4,
    });
    this.sfx.shoot('pulse');
  }

  private bossRing(e: Enemy, n: number) {
    const o = e.rig.torso.getWorldPosition(new THREE.Vector3());
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = start + (i / n) * Math.PI * 2;
      this.spawnBullet(o, new THREE.Vector3(Math.sin(a) * 17, 0, Math.cos(a) * 17), {
        dmg: (e.def.pdmg ?? 8) * e.dmgMul, friendly: false, color: e.def.accent, shape: 'orb',
        life: 4, pierce: 0, splash: 0, radius: 0.45,
      });
    }
    this.fxRing(e.pos.x, 1.5, e.pos.z, e.def.accent, 1.5, 9, 0.5);
    this.sfx.slam();
  }

  private damageEnemy(e: Enemy, dmg: number, crit: boolean) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 1;
    this.hitCount++;
    this.sfx.hit();
    this.burst(e.pos.x, 1.6, e.pos.z, crit ? 0xffe14d : e.def.accent, crit ? 8 : 4, 6, 0.1, 0.25, 3);
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    if (e.dead) return;
    e.dead = true;
    const def = e.def;
    const big = def.kind === 'brute' || def.kind === 'titan';
    const gain = Math.round(def.credits * this.mods.credit);
    this.credits += gain;
    this.score += def.credits * 10;
    this.kills++;
    if (def.kind === 'titan') this.bossKills++;
    this.explosionFx(e.pos.x, 1.4, e.pos.z, def.accent, big ? def.radius * 2.2 : def.radius * 2);
    this.burst(e.pos.x, 1.5, e.pos.z, def.accent, big ? 50 : 20, big ? 11 : 8, 0.16, 0.9, 7);
    this.burst(e.pos.x, 1.5, e.pos.z, 0x888fa0, big ? 22 : 8, 7, 0.22, 1.1, 12);
    this.addShake(big ? 0.9 : 0.15);
    this.sfx.kill(big);

    if (def.kind === 'titan') {
      for (let i = 0; i < 3; i++) this.dropPickup(e.pos.x + rand(-4, 4), e.pos.z + rand(-4, 4));
      this.say('Titan Prime destroyed', 'Core fragments recovered.');
    } else if (Math.random() < def.drop) {
      this.dropPickup(e.pos.x, e.pos.z);
    }
    this.removeEnemyVisuals(e);
    this.enemies.splice(this.enemies.indexOf(e), 1);
  }

  private removeEnemyVisuals(e: Enemy) {
    this.removeRing(e);
    this.scene.remove(e.rig.root);
    e.rig.dispose();
  }

  // ───────────────────────── projectiles ─────────────────────────
  private bulletMaterial(color: number): THREE.MeshBasicMaterial {
    let m = this.bulletMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4) });
      this.bulletMats.set(color, m);
    }
    return m;
  }

  private spawnBullet(
    pos: THREE.Vector3, vel: THREE.Vector3,
    o: { dmg: number; friendly: boolean; color: number; shape: BulletShape; life: number; pierce: number; splash: number; radius: number },
  ) {
    const mesh = new THREE.Mesh(G_BULLET[o.shape], this.bulletMaterial(o.color));
    mesh.position.copy(pos);
    mesh.lookAt(pos.x + vel.x, pos.y + vel.y, pos.z + vel.z);
    this.scene.add(mesh);
    this.bullets.push({
      mesh, vel, life: o.life, dmg: o.dmg, radius: o.radius, pierce: o.pierce,
      splash: o.splash, hit: new Set(), friendly: o.friendly, color: o.color,
    });
  }

  private removeBullet(i: number) {
    this.scene.remove(this.bullets[i].mesh);
    this.bullets.splice(i, 1);
  }

  private updateBullets(dt: number) {
    const p = this.p;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const ox = b.mesh.position.x, oz = b.mesh.position.z;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;
      const nx = b.mesh.position.x, nz = b.mesh.position.z;

      if (b.life <= 0) {
        if (b.splash > 0) this.explode(nx, nz, b.splash, b.dmg, b.color);
        this.removeBullet(i);
        continue;
      }
      if (Math.abs(nx) > ARENA + 1 || Math.abs(nz) > ARENA + 1 || this.hitsObstacle(nx, nz, 0.3)) {
        if (b.splash > 0) this.explode(nx, nz, b.splash, b.dmg, b.color);
        else this.burst(nx, b.mesh.position.y, nz, b.color, 5, 5, 0.08, 0.25, 2);
        this.removeBullet(i);
        continue;
      }

      if (b.friendly) {
        let dead = false;
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0.35 || b.hit.has(e)) continue;
          const r = e.def.radius + b.radius;
          if (segDist2(ox, oz, nx, nz, e.pos.x, e.pos.z) < r * r) {
            if (b.splash > 0) {
              this.explode(nx, nz, b.splash, b.dmg, b.color);
              dead = true;
              break;
            }
            const crit = Math.random() < 0.08;
            this.damageEnemy(e, b.dmg * (crit ? 1.8 : 1), crit);
            b.hit.add(e);
            b.pierce--;
            if (b.pierce < 0) { dead = true; break; }
          }
        }
        if (dead) { this.removeBullet(i); continue; }
      } else if (this.phase === 'playing') {
        const r = 1.0 + b.radius;
        if (p.py < 2.6 && segDist2(ox, oz, nx, nz, p.pos.x, p.pos.z) < r * r) {
          this.damagePlayer(b.dmg);
          this.burst(nx, 1.5, nz, b.color, 6, 5, 0.1, 0.25, 1);
          this.removeBullet(i);
        }
      }
    }
  }

  private explode(x: number, z: number, radius: number, dmg: number, color: number) {
    for (const e of [...this.enemies]) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z) - e.def.radius;
      if (d < radius) {
        this.damageEnemy(e, dmg * (1 - clamp(d / radius, 0, 1) * 0.55), false);
      }
    }
    this.explosionFx(x, 1.2, z, color, radius * 0.9);
    this.burst(x, 1.2, z, color, 22, 9, 0.14, 0.6, 5);
    this.addShake(0.35);
    this.sfx.explosion();
  }

  private hitsObstacle(x: number, z: number, r: number) {
    for (const o of this.obstacles) {
      const dx = x - o.x, dz = z - o.z, m = o.r + r;
      if (dx * dx + dz * dz < m * m) return true;
    }
    return false;
  }

  private pushOut(pos: THREE.Vector3, r: number) {
    for (const o of this.obstacles) {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const d = Math.hypot(dx, dz), m = o.r + r;
      if (d < m && d > 0.0001) {
        pos.x = o.x + (dx / d) * m;
        pos.z = o.z + (dz / d) * m;
      }
    }
    pos.x = clamp(pos.x, -ARENA + r, ARENA - r);
    pos.z = clamp(pos.z, -ARENA + r, ARENA - r);
  }

  // ───────────────────────── pickups ─────────────────────────
  private dropPickup(x: number, z: number) {
    const entries = Object.entries(PICKUPS) as [PickupKind, (typeof PICKUPS)[PickupKind]][];
    let r = Math.random() * entries.reduce((a, [, v]) => a + v.weight, 0);
    let kind: PickupKind = 'repair';
    for (const [k, v] of entries) { r -= v.weight; if (r <= 0) { kind = k; break; } }
    const info = PICKUPS[kind];

    const group = new THREE.Group();
    const core = new THREE.MeshStandardMaterial({
      color: info.color, emissive: info.color, emissiveIntensity: 2.2, metalness: 0.3, roughness: 0.3,
    });
    const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(info.color).multiplyScalar(2), transparent: true, opacity: 0.8 });
    const beamM = new THREE.MeshBasicMaterial({
      color: new THREE.Color(info.color).multiplyScalar(1.5), transparent: true, opacity: 0.22,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), core);
    gem.position.y = 1.4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 8, 32), ringM);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 8, 12, 1, true), beamM);
    beam.position.y = 4;
    group.add(gem, ring, beam);
    group.position.set(clamp(x, -ARENA + 2, ARENA - 2), 0, clamp(z, -ARENA + 2, ARENA - 2));
    this.scene.add(group);
    this.pickups.push({ group, kind, life: 18, t: Math.random() * 6, mats: [core, ringM, beamM] });
  }

  private removePickup(pk: Pickup) {
    this.scene.remove(pk.group);
    pk.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    pk.mats.forEach((m) => m.dispose());
  }

  private updatePickups(dt: number) {
    const p = this.p;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt;
      pk.life -= dt;
      const gem = pk.group.children[0];
      gem.rotation.y += dt * 2;
      gem.position.y = 1.4 + Math.sin(pk.t * 3) * 0.2;
      pk.group.children[1].rotation.z += dt * 1.5;
      pk.group.visible = pk.life > 3 || Math.floor(pk.life * 6) % 2 === 0;

      const dx = p.pos.x - pk.group.position.x, dz = p.pos.z - pk.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 6 && d > 0.01) {
        const s = Math.min(d, (6 - d) * 4 + 6) * dt;
        pk.group.position.x += (dx / d) * s;
        pk.group.position.z += (dz / d) * s;
      }
      if (d < 1.8) {
        this.collect(pk.kind);
        this.removePickup(pk);
        this.pickups.splice(i, 1);
      } else if (pk.life <= 0) {
        this.removePickup(pk);
        this.pickups.splice(i, 1);
      }
    }
  }

  private collect(kind: PickupKind) {
    const p = this.p, info = PICKUPS[kind];
    switch (kind) {
      case 'repair': p.hp = Math.min(p.maxHp, p.hp + 45); p.shield = Math.min(p.maxShield, p.shield + 20); break;
      case 'ammo':
        for (const id of WEAPON_ORDER) {
          const w = this.weapons[id], def = WEAPONS[id];
          if (w.owned && isFinite(def.reserveMax)) w.reserve = Math.min(def.reserveMax, w.reserve + Math.ceil(def.reserveMax * 0.4));
        }
        break;
      case 'overcharge': p.over = 12; break;
      case 'haste': p.haste = 10; break;
      case 'aegis': p.aegis = 7; p.shield = p.maxShield; break;
      case 'nova':
        this.explode(p.pos.x, p.pos.z, 18, 220, info.color);
        this.fxRing(p.pos.x, 0.3, p.pos.z, info.color, 1, 18, 0.6);
        for (const b of this.bullets) if (!b.friendly) b.life = 0;
        break;
    }
    this.toastMsg(`${info.label}: ${info.desc}`, info.color);
    this.sfx.pickup();
    this.burst(p.pos.x, 1.5, p.pos.z, info.color, 22, 7, 0.12, 0.6, 3);
  }

  // ───────────────────────── fx ─────────────────────────
  private addShake(v: number) { this.shake = Math.min(1.6, this.shake + v); }

  private burst(
    x: number, y: number, z: number, color: number,
    n: number, speed: number, size: number, life: number, up: number,
  ) {
    const c = new THREE.Color(color).multiplyScalar(2);
    for (let i = 0; i < n; i++) {
      const pt = this.particles[this.pIndex];
      this.pIndex = (this.pIndex + 1) % this.particles.length;
      pt.mesh.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const s = speed * rand(0.3, 1);
      pt.vel.set(Math.cos(a) * s, rand(0, 1) * speed * 0.5 + up * rand(0.3, 1), Math.sin(a) * s);
      pt.life = pt.max = life * rand(0.6, 1);
      pt.size = size * rand(0.6, 1.3);
      pt.grav = 14;
      pt.mat.color.copy(c);
      pt.mesh.visible = true;
      pt.mesh.scale.setScalar(pt.size);
    }
  }

  private fxRing(x: number, y: number, z: number, color: number, from: number, to: number, dur: number) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: 0.8,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(G_RING, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(from);
    this.scene.add(mesh);
    this.waves.push({ mesh, mat, life: dur, max: dur, from, to });
  }

  private explosionFx(x: number, y: number, z: number, color: number, radius: number) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(G_SPHERE, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.3);
    this.scene.add(mesh);
    this.waves.push({ mesh, mat, life: 0.4, max: 0.4, from: 0.3, to: radius });
    this.fxRing(x, 0.1, z, color, 0.5, radius * 1.3, 0.45);
  }

  private updateFx(dt: number) {
    for (const pt of this.particles) {
      if (pt.life <= 0) continue;
      pt.life -= dt;
      if (pt.life <= 0) { pt.mesh.visible = false; continue; }
      pt.vel.y -= pt.grav * dt;
      const m = pt.mesh;
      m.position.addScaledVector(pt.vel, dt);
      if (m.position.y < 0.05) {
        m.position.y = 0.05;
        pt.vel.y *= -0.3;
        pt.vel.x *= 0.7;
        pt.vel.z *= 0.7;
      }
      m.scale.setScalar(pt.size * (pt.life / pt.max));
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.life -= dt;
      if (w.life <= 0) {
        this.scene.remove(w.mesh);
        w.mat.dispose();
        this.waves.splice(i, 1);
        continue;
      }
      const t = 1 - w.life / w.max;
      w.mesh.scale.setScalar(w.from + (w.to - w.from) * easeOut(t));
      w.mat.opacity = 0.85 * (1 - t);
    }
  }

  // ───────────────────────── camera ─────────────────────────
  private updateCamera(dt: number) {
    const cam = this.camera;
    if (this.phase === 'menu') {
      const a = this.orbit;
      cam.position.set(Math.cos(a) * 20, 8.5, Math.sin(a) * 20);
      cam.lookAt(0, 2.6, 0);
      return;
    }
    const p = this.p;
    const tx = p.pos.x + (this.aim.x - p.pos.x) * 0.16;
    const tz = p.pos.z + (this.aim.z - p.pos.z) * 0.16;
    const k = 1 - Math.exp(-dt * 7);
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.z += (tz - this.camTarget.z) * k;
    this.shake *= Math.exp(-dt * 8);
    const sx = (Math.random() - 0.5) * this.shake * 0.7;
    const sz = (Math.random() - 0.5) * this.shake * 0.7;
    cam.position.set(this.camTarget.x + sx, 30, this.camTarget.z + 21 + sz);
    cam.lookAt(this.camTarget.x, 0, this.camTarget.z);
    cam.updateMatrixWorld();
  }

  // ───────────────────────── snapshot ─────────────────────────
  private emit() {
    this.cb.onSnapshot(this.snapshot());
  }

  private snapshot(): Snapshot {
    const p = this.p;
    const boss = this.enemies.find((e) => e.def.kind === 'titan' && !e.dead);
    return {
      phase: this.phase,
      muted: this.sfx.muted,
      bloom: this.bloomPass.enabled,
      fps: Math.round(this.fps),
      wave: this.wave,
      waveState: this.waveState,
      countdown: Math.max(0, this.countdown),
      left: this.queue.length + this.enemies.length,
      hp: p.hp, maxHp: p.maxHp,
      shield: p.shield, maxShield: p.maxShield,
      energy: p.energy, maxEnergy: p.maxEnergy,
      credits: this.credits, score: this.score, kills: this.kills,
      weapons: WEAPON_ORDER.map((id) => {
        const w = this.weapons[id];
        return { id, owned: w.owned, level: w.level, mag: w.mag, reserve: w.reserve };
      }),
      current: this.cur,
      reload: this.reloadT > 0 ? 1 - this.reloadT / this.reloadDur : -1,
      buffs: { overcharge: p.over, haste: p.haste, aegis: p.aegis },
      boss: boss ? { name: boss.def.name, hp: boss.hp, max: boss.maxHp } : null,
      banner: this.banner,
      toast: this.toast,
      hurt: this.hurtCount,
      hitMarker: this.hitCount,
      radar: this.enemies.map((e) => ({ x: e.pos.x, z: e.pos.z, k: KIND_ORDER.indexOf(e.def.kind) })),
      px: p.pos.x, pz: p.pos.z,
      upgrades: { hull: p.hull, shield: p.shieldLv, cap: p.capLv },
      summary: this.summary,
    };
  }

  private deny() {
    this.sfx.deny();
  }
}
