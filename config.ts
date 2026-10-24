// ─────────────────────────────────────────────────────────────
// Shared data + types for DEADFRONT
// ─────────────────────────────────────────────────────────────

export type WeaponId = 'pulse' | 'rifle' | 'scatter' | 'rail' | 'plasma' | 'hail';
export type EnemyKind = 'scout' | 'trooper' | 'hunter' | 'brute' | 'titan';
export type PickupKind = 'repair' | 'ammo' | 'overcharge' | 'haste' | 'aegis' | 'nova';
export type Phase = 'menu' | 'playing' | 'paused' | 'shop' | 'dead';
export type BulletShape = 'bolt' | 'slug' | 'ball' | 'orb';
export type SystemId = 'repair' | 'hull' | 'shield' | 'cap';
export type MetaId = 'frame' | 'tuning' | 'salvage' | 'coldstart' | 'capacitor';

// ── Weapons ──────────────────────────────────────────────────
export interface WeaponDef {
  id: WeaponId;
  name: string;
  tag: string;
  cost: number;
  damage: number; // per pellet
  rate: number; // shots per second
  mag: number;
  reload: number; // seconds
  spread: number; // radians
  pellets: number;
  speed: number;
  life: number; // projectile lifetime (s)
  pierce: number;
  splash: number; // explosion radius, 0 = none
  color: number;
  auto: boolean;
  reserveMax: number;
  packSize: number;
  packCost: number;
  kick: number; // camera kick
  shape: BulletShape;
}

export const WEAPON_ORDER: WeaponId[] = ['pulse', 'rifle', 'scatter', 'rail', 'plasma', 'hail'];
export const MAX_UPGRADE = 4;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pulse: {
    id: 'pulse', name: 'Pulse Sidearm', tag: 'Reliable and never runs dry.',
    cost: 0, damage: 22, rate: 4.5, mag: 14, reload: 1.0, spread: 0.02, pellets: 1,
    speed: 64, life: 0.9, pierce: 0, splash: 0, color: 0x3df2ff, auto: false,
    reserveMax: Infinity, packSize: 0, packCost: 0, kick: 0.1, shape: 'bolt',
  },
  rifle: {
    id: 'rifle', name: 'Arc Rifle', tag: 'Steady full-auto fire.',
    cost: 450, damage: 15, rate: 9, mag: 30, reload: 1.4, spread: 0.045, pellets: 1,
    speed: 74, life: 0.9, pierce: 0, splash: 0, color: 0x8dff6a, auto: true,
    reserveMax: 270, packSize: 60, packCost: 70, kick: 0.12, shape: 'bolt',
  },
  scatter: {
    id: 'scatter', name: 'Scatter Cannon', tag: 'Devastating up close.',
    cost: 650, damage: 12, rate: 1.4, mag: 6, reload: 1.9, spread: 0.2, pellets: 9,
    speed: 54, life: 0.42, pierce: 0, splash: 0, color: 0xffb02e, auto: false,
    reserveMax: 66, packSize: 12, packCost: 80, kick: 0.45, shape: 'bolt',
  },
  rail: {
    id: 'rail', name: 'Rail Lance', tag: 'Punches through a whole line of enemies.',
    cost: 1100, damage: 130, rate: 0.95, mag: 4, reload: 2.2, spread: 0, pellets: 1,
    speed: 150, life: 0.7, pierce: 6, splash: 0, color: 0xc07bff, auto: false,
    reserveMax: 32, packSize: 8, packCost: 110, kick: 0.5, shape: 'slug',
  },
  plasma: {
    id: 'plasma', name: 'Plasma Launcher', tag: 'Explosive area damage.',
    cost: 1600, damage: 80, rate: 1.6, mag: 8, reload: 2.0, spread: 0.01, pellets: 1,
    speed: 34, life: 1.6, pierce: 0, splash: 5, color: 0xff4fd8, auto: false,
    reserveMax: 48, packSize: 8, packCost: 130, kick: 0.4, shape: 'ball',
  },
  hail: {
    id: 'hail', name: 'Hailstorm Minigun', tag: 'A wall of bullets.',
    cost: 2200, damage: 9, rate: 22, mag: 120, reload: 3.0, spread: 0.1, pellets: 1,
    speed: 78, life: 0.8, pierce: 0, splash: 0, color: 0xfff3b0, auto: true,
    reserveMax: 600, packSize: 120, packCost: 150, kick: 0.08, shape: 'bolt',
  },
};

export const upgradeCost = (level: number) => 220 * (level + 1);

// ── Run upgrades bought in the armory ────────────────────────
export const SYSTEMS: Record<SystemId, { name: string; desc: string; max: number }> = {
  repair: { name: 'Field repair', desc: 'Restore all hull and shield.', max: Infinity },
  hull: { name: 'Hull plating', desc: '+25 max hull.', max: 5 },
  shield: { name: 'Shield matrix', desc: '+20 max shield.', max: 4 },
  cap: { name: 'Capacitor bank', desc: '+20 energy, faster recharge.', max: 4 },
};

export function systemCost(id: SystemId, owned: number): number {
  switch (id) {
    case 'repair': return 120;
    case 'hull': return 350 + 250 * owned;
    case 'shield': return 300 + 220 * owned;
    case 'cap': return 300 + 200 * owned;
  }
}

// ── Enemies ──────────────────────────────────────────────────
export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  ai: 'rush' | 'ranged' | 'smasher' | 'boss';
  model: 'spider' | 'biped';
  hp: number;
  speed: number;
  radius: number;
  contact: number; // melee / slam damage
  credits: number;
  cost: number; // wave budget cost
  minWave: number;
  drop: number; // pickup drop chance
  scale: number;
  body: number;
  dark: number;
  accent: number;
  pref?: number; // preferred range
  rate?: number; // shots/s
  burst?: number;
  pdmg?: number;
  pspeed?: number;
}

export const KIND_ORDER: EnemyKind[] = ['scout', 'trooper', 'hunter', 'brute', 'titan'];

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  scout: {
    kind: 'scout', name: 'Skitter', ai: 'rush', model: 'spider',
    hp: 38, speed: 8.6, radius: 1.0, contact: 9, credits: 12, cost: 1, minWave: 1, drop: 0.05,
    scale: 0.8, body: 0x3a2a24, dark: 0x1a1412, accent: 0xff7a1a,
  },
  trooper: {
    kind: 'trooper', name: 'Trooper', ai: 'ranged', model: 'biped',
    hp: 85, speed: 4.8, radius: 1.2, contact: 0, credits: 30, cost: 2, minWave: 2, drop: 0.09,
    scale: 1.1, body: 0x2b3446, dark: 0x141a26, accent: 0xff2a4d,
    pref: 14, rate: 0.7, burst: 1, pdmg: 7, pspeed: 26,
  },
  hunter: {
    kind: 'hunter', name: 'Hunter', ai: 'ranged', model: 'spider',
    hp: 210, speed: 6.2, radius: 1.5, contact: 0, credits: 55, cost: 4, minWave: 5, drop: 0.14,
    scale: 1.45, body: 0x2c3128, dark: 0x14170f, accent: 0xffd21a,
    pref: 18, rate: 0.42, burst: 3, pdmg: 6, pspeed: 30,
  },
  brute: {
    kind: 'brute', name: 'Brute', ai: 'smasher', model: 'biped',
    hp: 430, speed: 3.5, radius: 2.1, contact: 28, credits: 85, cost: 6, minWave: 4, drop: 0.35,
    scale: 1.9, body: 0x40261f, dark: 0x1c100d, accent: 0xff5a1f,
  },
  titan: {
    kind: 'titan', name: 'Titan Prime', ai: 'boss', model: 'biped',
    hp: 3200, speed: 3.2, radius: 3.8, contact: 35, credits: 700, cost: 0, minWave: 5, drop: 1,
    scale: 2.8, body: 0x231a33, dark: 0x0f0a18, accent: 0xb26bff,
    pref: 16, rate: 0.7, burst: 3, pdmg: 9, pspeed: 24,
  },
};

// ── Pickups ──────────────────────────────────────────────────
export const PICKUPS: Record<PickupKind, { label: string; desc: string; color: number; weight: number }> = {
  repair: { label: 'Repair kit', desc: '+45 hull', color: 0x3dff9a, weight: 28 },
  ammo: { label: 'Ammo cache', desc: 'Reserves restocked', color: 0xffd21a, weight: 26 },
  overcharge: { label: 'Overcharge', desc: 'Double damage', color: 0xff4fd8, weight: 14 },
  haste: { label: 'Haste', desc: 'Faster movement and fire rate', color: 0x3df2ff, weight: 14 },
  aegis: { label: 'Aegis', desc: 'Invulnerable', color: 0xa678ff, weight: 10 },
  nova: { label: 'Nova charge', desc: 'Blast clears the area', color: 0xff7a1a, weight: 8 },
};

// ── Rogue-lite meta upgrades (persist between runs) ──────────
export interface MetaDef {
  id: MetaId;
  name: string;
  desc: string;
  max: number;
  base: number;
  step: number;
}

export const META_DEFS: MetaDef[] = [
  { id: 'frame', name: 'Reinforced frame', desc: '+12 starting hull per level', max: 8, base: 3, step: 2 },
  { id: 'tuning', name: 'Weapon tuning', desc: '+5% damage per level', max: 8, base: 4, step: 3 },
  { id: 'salvage', name: 'Salvage rig', desc: '+8% credits per level', max: 6, base: 3, step: 3 },
  { id: 'coldstart', name: 'Cold start', desc: '+150 starting credits per level', max: 6, base: 2, step: 2 },
  { id: 'capacitor', name: 'Deep capacitors', desc: '+15 max energy per level', max: 5, base: 3, step: 3 },
];

export interface MetaMods {
  hp: number;
  dmg: number;
  credit: number;
  start: number;
  energy: number;
}

// ── Snapshot sent from the engine to the React UI ────────────
export interface WeaponView {
  id: WeaponId;
  owned: boolean;
  level: number;
  mag: number;
  reserve: number;
}

export interface RunSummary {
  wave: number;
  score: number;
  kills: number;
  bossKills: number;
  cores: number;
  time: number;
}

export interface Snapshot {
  phase: Phase;
  muted: boolean;
  bloom: boolean;
  fps: number;
  wave: number;
  waveState: 'countdown' | 'active';
  countdown: number;
  left: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  energy: number;
  maxEnergy: number;
  credits: number;
  score: number;
  kills: number;
  weapons: WeaponView[];
  current: WeaponId;
  reload: number; // 0..1 progress, -1 when not reloading
  buffs: { overcharge: number; haste: number; aegis: number };
  boss: { name: string; hp: number; max: number } | null;
  banner: { id: number; text: string; sub: string } | null;
  toast: { id: number; text: string; color: number } | null;
  hurt: number;
  hitMarker: number;
  radar: { x: number; z: number; k: number }[];
  px: number;
  pz: number;
  upgrades: { hull: number; shield: number; cap: number };
  summary: RunSummary | null;
}
