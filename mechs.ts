import * as THREE from 'three';

export interface Palette {
  body: number;
  dark: number;
  accent: number;
}

export interface Rig {
  root: THREE.Group;
  torso: THREE.Group;
  muzzle: THREE.Object3D;
  /** speed in world units/s, attack 0..1 raises the arms / rears the body */
  update(dt: number, speed: number, attack: number): void;
  /** 0..1 white hit flash */
  flash(v: number): void;
  /** 0..1 jet flame length (player only) */
  setThrust(v: number): void;
  dispose(): void;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CONE = new THREE.ConeGeometry(0.5, 1, 8);
const BLOB = new THREE.PlaneGeometry(1, 1);
let blobTex: THREE.CanvasTexture | null = null;

function blobTexture(): THREE.CanvasTexture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

interface Mats {
  body: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
}

function makeMats(p: Palette): Mats {
  return {
    body: new THREE.MeshStandardMaterial({ color: p.body, metalness: 0.7, roughness: 0.38 }),
    dark: new THREE.MeshStandardMaterial({ color: p.dark, metalness: 0.8, roughness: 0.5 }),
    glow: new THREE.MeshStandardMaterial({
      color: p.accent,
      emissive: p.accent,
      emissiveIntensity: 2.4,
      metalness: 0,
      roughness: 0.4,
    }),
  };
}

function part(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  parent: THREE.Object3D,
  sx: number, sy: number, sz: number,
  x: number, y: number, z: number,
  shadow: boolean,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

function addBlob(root: THREE.Group, size: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map: blobTexture(), transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(BLOB, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.scale.set(size, size, 1);
  root.add(m);
  return mat;
}

function makeRig(
  root: THREE.Group,
  torso: THREE.Group,
  muzzle: THREE.Object3D,
  m: Mats,
  extra: THREE.Material[],
  anim: (dt: number, speed: number, attack: number) => void,
  setThrust: (v: number) => void,
): Rig {
  return {
    root, torso, muzzle,
    update: anim,
    flash(v: number) {
      m.body.emissive.setHex(0xffffff);
      m.body.emissiveIntensity = v * 0.9;
      m.dark.emissive.setHex(0xffffff);
      m.dark.emissiveIntensity = v * 0.35;
    },
    setThrust,
    dispose() {
      m.body.dispose();
      m.dark.dispose();
      m.glow.dispose();
      extra.forEach((x) => x.dispose());
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Biped
// ─────────────────────────────────────────────────────────────
export interface BipedOpts {
  scale: number;
  bulk: number;
  guns: 'single' | 'dual' | 'none';
  fists?: boolean;
  pods?: boolean;
  jets?: boolean;
  heavy?: boolean;
  shadows?: boolean;
}

export function buildBiped(p: Palette, o: BipedOpts): Rig {
  const m = makeMats(p);
  const sh = o.shadows !== false;
  const b = o.bulk;
  const P = (g: THREE.BufferGeometry, mat: THREE.Material, par: THREE.Object3D,
    sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) =>
    part(g, mat, par, sx, sy, sz, x, y, z, sh);

  const root = new THREE.Group();
  const blob = addBlob(root, 3.2 * o.scale);
  const body = new THREE.Group();
  body.scale.setScalar(o.scale);
  root.add(body);

  // legs
  const legs: { hip: THREE.Group; knee: THREE.Group; off: number }[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.5 * b, 1.75, 0);
    body.add(hip);
    P(BOX, m.dark, hip, 0.42 * b, 0.95, 0.5, 0, -0.45, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -0.9, 0);
    hip.add(knee);
    P(BOX, m.body, knee, 0.38 * b, 0.95, 0.42, 0, -0.45, 0.05);
    P(BOX, m.dark, knee, 0.52 * b, 0.18, 0.85, 0, -0.93, 0.18);
    P(BOX, m.glow, knee, 0.06, 0.4, 0.05, s * 0.2 * b, -0.45, 0.28);
    legs.push({ hip, knee, off: s > 0 ? 0 : Math.PI });
  }
  P(BOX, m.dark, body, 1.0 * b, 0.4, 0.7, 0, 1.8, 0);

  // torso
  const torso = new THREE.Group();
  torso.position.y = 2.35;
  body.add(torso);
  P(BOX, m.body, torso, 1.5 * b, 1.1, 0.95, 0, 0.35, 0);
  P(BOX, m.dark, torso, 1.1 * b, 0.75, 0.32, 0, 0.25, -0.58);
  P(BOX, m.glow, torso, 0.45 * b, 0.3, 0.08, 0, 0.4, 0.5);
  for (const s of [-1, 1]) P(BOX, m.dark, torso, 0.6 * b, 0.4, 0.8, s * 0.95 * b, 0.85, 0);

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.18, 0.05);
  torso.add(head);
  P(BOX, m.dark, head, 0.6, 0.42, 0.6, 0, 0, 0);
  P(BOX, m.glow, head, 0.46, 0.1, 0.08, 0, 0.03, 0.31);

  // arms / guns
  const arms: { pivot: THREE.Group; off: number }[] = [];
  let muzzle: THREE.Object3D | null = null;
  for (const s of [1, -1]) {
    const hasGun = o.guns !== 'none' && (s === 1 || o.guns === 'dual');
    const ax = s * (0.95 * b + 0.25);
    if (hasGun) {
      const gs = o.heavy ? 1.5 : 1;
      const g = new THREE.Group();
      g.position.set(ax, 0.35, 0.15);
      torso.add(g);
      P(BOX, m.dark, g, 0.4 * gs, 0.4 * gs, 1.3, 0, 0, 0.55);
      P(BOX, m.body, g, 0.18 * gs, 0.18 * gs, 1.0, 0, 0, 1.35);
      P(BOX, m.glow, g, 0.46 * gs, 0.12, 0.1, 0, 0, 0.95);
      if (!muzzle) {
        muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0, 1.95);
        g.add(muzzle);
      }
    } else {
      const pivot = new THREE.Group();
      pivot.position.set(ax, 0.8, 0);
      torso.add(pivot);
      P(BOX, m.dark, pivot, 0.34, 0.9, 0.36, 0, -0.45, 0);
      const f = o.fists ? 0.8 : 0.4;
      P(BOX, m.body, pivot, f, f * 1.1, f, 0, -1.05, 0.05);
      if (o.fists) P(BOX, m.glow, pivot, f * 0.85, 0.1, 0.1, 0, -1.05, 0.5);
      arms.push({ pivot, off: s > 0 ? 0 : Math.PI });
    }
  }
  if (!muzzle) {
    muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.5, 1.0);
    torso.add(muzzle);
  }

  if (o.pods) {
    for (const s of [-1, 1]) {
      P(BOX, m.dark, torso, 0.5, 0.5, 0.9, s * (0.95 * b + 0.65), 1.3, -0.2);
      P(BOX, m.glow, torso, 0.3, 0.3, 0.06, s * (0.95 * b + 0.65), 1.3, 0.27);
    }
  }

  // jets (player)
  const flames: THREE.Mesh[] = [];
  const extra: THREE.Material[] = [blob];
  if (o.jets) {
    const flameMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x3df2ff).multiplyScalar(2.5),
      transparent: true, opacity: 0.85, depthWrite: false,
    });
    extra.push(flameMat);
    for (const s of [-1, 1]) {
      P(BOX, m.dark, torso, 0.3, 0.3, 0.4, s * 0.4, 0.05, -0.7);
      const fl = new THREE.Mesh(CONE, flameMat);
      fl.rotation.x = Math.PI;
      fl.position.set(s * 0.4, -0.15, -0.7);
      fl.scale.set(0.34, 0.01, 0.34);
      torso.add(fl);
      flames.push(fl);
    }
  }

  let phase = 0;
  let time = Math.random() * 10;
  const anim = (dt: number, speed: number, attack: number) => {
    time += dt;
    const sp = Math.min(speed, 14);
    const f = Math.min(1, sp / 7);
    phase += dt * sp * 0.85 / Math.sqrt(o.scale);
    for (const l of legs) {
      l.hip.rotation.x = Math.sin(phase + l.off) * 0.7 * f;
      l.knee.rotation.x = Math.max(0, Math.sin(phase + l.off + 1.3)) * 0.95 * f;
    }
    torso.position.y = 2.35 + Math.abs(Math.sin(phase)) * 0.1 * f + Math.sin(time * 1.8) * 0.02;
    torso.rotation.z = Math.sin(phase) * 0.05 * f;
    torso.rotation.x = -attack * 0.25;
    for (const a of arms) {
      a.pivot.rotation.x = attack > 0
        ? -attack * 2.6
        : -Math.sin(phase + a.off) * 0.55 * f;
    }
  };
  const setThrust = (v: number) => {
    const L = 0.01 + v * 1.7;
    for (const fl of flames) {
      fl.scale.y = L;
      fl.position.y = -0.15 - L * 0.5;
    }
  };

  return makeRig(root, torso, muzzle, m, extra, anim, setThrust);
}

// ─────────────────────────────────────────────────────────────
// Spider
// ─────────────────────────────────────────────────────────────
export interface SpiderOpts {
  scale: number;
  legPairs: number;
  turret: boolean;
  shadows?: boolean;
}

export function buildSpider(p: Palette, o: SpiderOpts): Rig {
  const m = makeMats(p);
  const sh = o.shadows !== false;
  const P = (g: THREE.BufferGeometry, mat: THREE.Material, par: THREE.Object3D,
    sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) =>
    part(g, mat, par, sx, sy, sz, x, y, z, sh);

  const root = new THREE.Group();
  const blob = addBlob(root, 3.6 * o.scale);
  const body = new THREE.Group();
  body.scale.setScalar(o.scale);
  root.add(body);

  const torso = new THREE.Group();
  torso.position.y = 1.2;
  body.add(torso);
  P(BOX, m.body, torso, 1.3, 0.55, 1.9, 0, 0, -0.1);
  P(BOX, m.dark, torso, 0.8, 0.45, 0.7, 0, 0.05, 1.0);
  P(BOX, m.glow, torso, 0.6, 0.14, 0.08, 0, 0.08, 1.37);
  P(BOX, m.glow, torso, 0.22, 0.08, 1.2, 0, 0.3, -0.2);

  let muzzle: THREE.Object3D = new THREE.Object3D();
  if (o.turret) {
    const t = new THREE.Group();
    t.position.set(0, 0.5, -0.1);
    torso.add(t);
    P(BOX, m.dark, t, 0.7, 0.35, 0.7, 0, 0, 0);
    P(BOX, m.body, t, 0.2, 0.2, 1.3, 0, 0.05, 0.85);
    P(BOX, m.glow, t, 0.3, 0.1, 0.08, 0, 0.05, 0.4);
    muzzle.position.set(0, 0.05, 1.6);
    t.add(muzzle);
  } else {
    muzzle.position.set(0, 0, 1.4);
    torso.add(muzzle);
  }

  const legs: { pivot: THREE.Group; s: number; off: number }[] = [];
  const pairs = o.legPairs;
  for (let i = 0; i < pairs; i++) {
    const z = pairs === 1 ? 0 : 0.85 - (1.75 * i) / (pairs - 1);
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.6, 0, z);
      torso.add(pivot);
      P(BOX, m.body, pivot, 1.12, 0.12, 0.12, s * 0.5, 0.25, 0).rotation.z = s * 0.46;
      P(BOX, m.dark, pivot, 1.84, 0.1, 0.1, s * 1.35, -0.35, 0).rotation.z = s * -1.18;
      P(BOX, m.glow, pivot, 0.16, 0.16, 0.16, s * 1.0, 0.5, 0);
      legs.push({ pivot, s, off: ((i + (s > 0 ? 1 : 0)) % 2) * Math.PI });
    }
  }

  let phase = 0;
  let time = Math.random() * 10;
  const anim = (dt: number, speed: number, attack: number) => {
    time += dt;
    const sp = Math.min(speed, 12);
    const f = Math.min(1, sp / 5);
    phase += dt * sp * 1.15 / Math.sqrt(o.scale);
    for (const l of legs) {
      l.pivot.rotation.y = Math.sin(phase + l.off) * 0.5 * f * l.s;
      l.pivot.rotation.z = l.s * Math.max(0, Math.cos(phase + l.off)) * 0.38 * f;
    }
    torso.position.y = 1.2 + Math.sin(time * 2.2) * 0.03 + Math.abs(Math.sin(phase)) * 0.05 * f;
    torso.rotation.x = -attack * 0.35;
  };

  return makeRig(root, torso, muzzle, m, [blob], anim, () => {});
}
