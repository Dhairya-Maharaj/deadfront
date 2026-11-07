/* =========================================================================
   DEADFRONT DATA: weapons, gear, perks. All original.
   ========================================================================= */
const WEAPONS = {
  sparker: {
    id: 'sparker', name: 'SPARKER', tag: 'Fast and friendly', kind: 'bolt',
    dmg: 19, rpm: 640, mag: 36, reload: 1.25, spread: 0.012, pellets: 1, speed: 150,
    color: 0xffe14a, cost: 0, stats: [3, 4, 4],
    desc: 'Rapid-fire energy rifle. Never lets you down.'
  },
  chomper: {
    id: 'chomper', name: 'CHOMPER', tag: 'Door-to-face', kind: 'bolt',
    dmg: 15, rpm: 95, mag: 6, reload: 1.7, spread: 0.09, pellets: 9, speed: 110,
    color: 0xff7a2a, cost: 0, stats: [5, 2, 1],
    desc: 'Nine fangs per shot. Best when they are close enough to smell.'
  },
  stinger: {
    id: 'stinger', name: 'STINGER', tag: 'Triple tap', kind: 'burst',
    dmg: 24, rpm: 180, mag: 18, reload: 1.3, spread: 0.006, pellets: 1, speed: 170, burst: 3, burstGap: 0.065,
    color: 0x6dff6d, cost: 0, stats: [3, 3, 3],
    desc: 'Three precise bolts per pull. Great at range.'
  },
  thumper: {
    id: 'thumper', name: 'THUMPER', tag: 'Boom ball', kind: 'grenade',
    dmg: 125, rpm: 75, mag: 4, reload: 2.0, spread: 0, pellets: 1, speed: 34, radius: 6.2,
    color: 0xff4fd8, cost: 500, stats: [5, 1, 1],
    desc: 'Lobs a blast orb that explodes on contact. Clears whole packs.'
  },
  lancer: {
    id: 'lancer', name: 'LANCER', tag: 'Pokes through everything', kind: 'pierce',
    dmg: 170, rpm: 70, mag: 5, reload: 1.9, spread: 0.002, pellets: 1, speed: 260,
    color: 0x4fd8ff, cost: 900, stats: [5, 1, 1],
    desc: 'A needle of light that passes through every enemy in the line.'
  },
  zapper: {
    id: 'zapper', name: 'ZAPPER', tag: 'Lightning that jumps', kind: 'chain',
    dmg: 24, rpm: 420, mag: 32, reload: 1.5, spread: 0.004, pellets: 1, speed: 0, chain: 3, range: 9,
    color: 0xb48cff, cost: 1200, stats: [4, 3, 3],
    desc: 'Instant bolt that hops to three nearby enemies.'
  }
};

const GEARS = {
  tank:    { id: 'tank',    name: 'TANK PLATES', tag: '+50 armor',                        cost: 0,   color: 0x00f0ff },
  jetlegs: { id: 'jetlegs', name: 'JET LEGS',    tag: '+1 dash charge, higher jump',      cost: 0,   color: 0x6dff6d },
  medic:   { id: 'medic',   name: 'MEDIC CORE',  tag: '+30 health, slow regeneration',    cost: 300, color: 0xff4d6d },
  scav:    { id: 'scav',    name: 'SCAVENGER',   tag: '+60% credits, more drops',         cost: 450, color: 0xffb020 }
};

const PERKS = [
  { id: 'nanite',   icon: '🛡️', name: 'Nanite Shell',     desc: '+60 max armor and faster armor recovery.' },
  { id: 'thrust',   icon: '⚡', name: 'Hyper Thrusters',  desc: 'Dash recharges 70% faster.' },
  { id: 'hot',      icon: '💥', name: 'Hot Rounds',       desc: '+35% damage with everything.' },
  { id: 'leech',    icon: '🩸', name: 'Leech Cells',      desc: 'Each kill heals 5 health.' },
  { id: 'clock',    icon: '🔥', name: 'Overclock',        desc: '+25% fire rate and 30% faster reloads.' },
  { id: 'stomp',    icon: '🦶', name: 'Stomp Boots',      desc: 'Land from a high jump to shockwave nearby enemies.' },
  { id: 'springs',  icon: '🦘', name: 'Spring Legs',      desc: 'Jump 25% higher.' }
];
const PERK_REPAIR = { id: 'repair', icon: '🔧', name: 'Full Repair', desc: 'Restore all health and armor right now.' };

const ENEMY_TYPES = {
  swarmer: { size: 1.1, color: 0xff2e63, eye: 0xffee88, hp: (w) => 36 + w * 7,   speed: (w) => 4.6 + w * 0.12, dmg: 12, credit: 8,   score: 100,  r: 0.95 },
  runner:  { size: 0.8, color: 0x2dffa0, eye: 0xffffff, hp: (w) => 24 + w * 4,   speed: (w) => Math.min(11, 8.4 + w * 0.1), dmg: 9, credit: 10, score: 130, r: 0.7 },
  spitter: { size: 1.0, color: 0xffb020, eye: 0xff3030, hp: (w) => 46 + w * 7,   speed: (w) => 3.6,                 dmg: 0,  credit: 14,  score: 180,  r: 0.9 },
  brute:   { size: 1.8, color: 0x8a3cff, eye: 0xff66ff, hp: (w) => 170 + w * 24, speed: (w) => 3.2,                 dmg: 26, credit: 35,  score: 400,  r: 1.6 },
  boss:    { size: 3.2, color: 0xff1744, eye: 0xffffff, hp: (w) => 700 + w * 130, speed: (w) => 2.8,                dmg: 38, credit: 250, score: 2500, r: 2.9 }
};
