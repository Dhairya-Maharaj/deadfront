/* =========================================================================
   DEADFRONT WORLD: map layouts + collision/height queries (no rendering here)
   Everything the player can stand on is a solid box or a ramp.
   ========================================================================= */
const ARENA = 55;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* boxes:  [centerX, centerZ, width, depth, topHeight]
   ramps:  [lowX, lowZ, dirX, dirZ, width, length, topHeight]  (rises along dir)
   pads:   [x, z, radius]       launch pads
   lava:   [x0, x1, z0, z1]     hurts when you stand on the floor in it        */
const MAP_DEFS = [
  {
    id: 0, name: 'DISTRICT 09', title: 'DISTRICT 09: NEON DECK',
    desc: 'A raised neon deck with four long ramps. Hold the high ground, kite the swarm down the slopes.',
    blurb: 'Ramps & outposts',
    theme: { floor: 0x141a29, grid: 0x00f0ff, gridDim: 0x24324f, sky: 0x0a101d, accent: 0x00f0ff, sun: 0x8fe9ff },
    spawn: [0, 0], crates: 12, seed: 9,
    boxes: [[0, 0, 24, 24, 2.6], [32, 28, 14, 14, 4.2], [-32, 28, 14, 14, 4.2], [32, -28, 14, 14, 4.2], [-32, -28, 14, 14, 4.2]],
    ramps: [
      [0, 26, 0, -1, 7, 14, 2.6], [0, -26, 0, 1, 7, 14, 2.6], [26, 0, -1, 0, 7, 14, 2.6], [-26, 0, 1, 0, 7, 14, 2.6],
      [5, 28, 1, 0, 7, 20, 4.2], [-5, 28, -1, 0, 7, 20, 4.2], [5, -28, 1, 0, 7, 20, 4.2], [-5, -28, -1, 0, 7, 20, 4.2]
    ],
    pads: [], lava: []
  },
  {
    id: 1, name: 'MAGMA CORE', title: 'MAGMA CORE: LAVA TRENCH',
    desc: 'Lava burns anything standing in it. Two long walkways, one central tower. Stay off the floor glow.',
    blurb: 'Lava floors',
    theme: { floor: 0x1c1210, grid: 0xff5500, gridDim: 0x4a2418, sky: 0x1a0c08, accent: 0xff6a1a, sun: 0xffb27a },
    spawn: [0, 0], crates: 9, seed: 21,
    boxes: [[0, 0, 10, 10, 5.0], [0, 22, 50, 9, 3.0], [0, -22, 50, 9, 3.0]],
    ramps: [
      [27, 0, -1, 0, 7, 22, 5.0], [-27, 0, 1, 0, 7, 22, 5.0],
      [40, 22, -1, 0, 7, 15, 3.0], [-40, 22, 1, 0, 7, 15, 3.0],
      [40, -22, -1, 0, 7, 15, 3.0], [-40, -22, 1, 0, 7, 15, 3.0]
    ],
    pads: [],
    lava: [[-17, -9, -14, 14], [9, 17, -14, 14]]
  },
  {
    id: 2, name: 'ORBITAL BASTION', title: 'ORBITAL BASTION: SKY RING',
    desc: 'Launch pads fling you onto the tall central block. Four mid decks, ramps up each.',
    blurb: 'Launch pads',
    theme: { floor: 0x0c1424, grid: 0x9d00ff, gridDim: 0x2a1d4a, sky: 0x0b0716, accent: 0xb44dff, sun: 0xd2a3ff },
    spawn: [0, 0], crates: 10, seed: 33,
    boxes: [[0, 0, 12, 12, 6.0], [26, 26, 14, 14, 3.0], [-26, 26, 14, 14, 3.0], [26, -26, 14, 14, 3.0], [-26, -26, 14, 14, 3.0]],
    ramps: [
      [5, 26, 1, 0, 7, 14, 3.0], [-5, 26, -1, 0, 7, 14, 3.0], [5, -26, 1, 0, 7, 14, 3.0], [-5, -26, -1, 0, 7, 14, 3.0]
    ],
    pads: [[0, 14, 2.2], [0, -14, 2.2], [14, 0, 2.2], [-14, 0, 2.2]],
    lava: []
  }
];

class World {
  constructor(def) {
    this.def = def;
    this.boxes = def.boxes.map(b => ({
      x: b[0], z: b[1], w: b[2], d: b[3], top: b[4],
      x0: b[0] - b[2] / 2, x1: b[0] + b[2] / 2, z0: b[1] - b[3] / 2, z1: b[1] + b[3] / 2
    }));
    this.ramps = def.ramps.map(r => {
      const l = Math.hypot(r[2], r[3]);
      const rot = Math.atan2(r[2] / l, r[3] / l);
      return { x: r[0], z: r[1], rot, cos: Math.cos(rot), sin: Math.sin(rot), w: r[4], len: r[5], top: r[6] };
    });
    this.pads = def.pads.map(p => ({ x: p[0], z: p[1], r: p[2] }));
    this.lava = def.lava.map(l => ({ x0: l[0], x1: l[1], z0: l[2], z1: l[3] }));
    this.crates = [];
    this._makeCrates();
  }

  _makeCrates() {
    const rnd = mulberry32(this.def.seed);
    let tries = 0;
    while (this.crates.length < this.def.crates && tries++ < 400) {
      const x = (rnd() * 2 - 1) * 48, z = (rnd() * 2 - 1) * 48;
      const s = 2.0 + rnd() * 1.2, top = 1.0 + rnd() * 0.6;
      if (this.topAtR(x, z, s + 3) > 0) continue;       // keep clear of everything else
      if (this.inLava(x, z) || this.inLavaPad(x, z, s + 3)) continue;
      if (this.padAt(x, z, 4)) continue;
      if (Math.hypot(x, z) < 8) continue;
      let ok = true;
      for (const c of this.crates) if (Math.hypot(c.x - x, c.z - z) < c.s + s + 2) ok = false;
      if (!ok) continue;
      this.crates.push({ x, z, s, top, x0: x - s / 2, x1: x + s / 2, z0: z - s / 2, z1: z + s / 2 });
    }
  }

  inLavaPad(x, z, m) {
    for (const l of this.lava) if (x > l.x0 - m && x < l.x1 + m && z > l.z0 - m && z < l.z1 + m) return true;
    return false;
  }

  /* Height of the solid ground at this exact point (0 = floor). */
  topAt(x, z) {
    let h = 0;
    for (const b of this.boxes) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.top > h) h = b.top;
    for (const c of this.crates) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && c.top > h) h = c.top;
    for (const r of this.ramps) {
      const dx = x - r.x, dz = z - r.z;
      const lx = dx * r.cos - dz * r.sin;
      const lz = dx * r.sin + dz * r.cos;
      if (lz >= 0 && lz <= r.len && Math.abs(lx) <= r.w / 2) {
        const hh = r.top * lz / r.len;
        if (hh > h) h = hh;
      }
    }
    return h;
  }

  /* Highest ground within a body radius (used to block walking into walls). */
  topAtR(x, z, r) {
    let h = this.topAt(x, z);
    let t = this.topAt(x + r, z); if (t > h) h = t;
    t = this.topAt(x - r, z); if (t > h) h = t;
    t = this.topAt(x, z + r); if (t > h) h = t;
    t = this.topAt(x, z - r); if (t > h) h = t;
    return h;
  }

  inLava(x, z) {
    for (const l of this.lava) if (x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1) return true;
    return false;
  }

  padAt(x, z, extra) {
    for (const p of this.pads) if (Math.hypot(x - p.x, z - p.z) < p.r + (extra || 0)) return p;
    return null;
  }
}
