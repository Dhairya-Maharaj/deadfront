/* =========================================================================
   DEADFRONT: engine (Three.js r128), combat, loadouts, touch + desktop input
   Physics note: positions are plain numbers on purpose (fast, no garbage).
   ========================================================================= */
'use strict';

const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches;
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const EYE = 1.7, RADIUS = 0.45, GRAV = 27, JUMP_V = 9.8, MOVE_SPEED = 10.5;
const DASH_SPEED = 32, DASH_TIME = 0.2, PAD_V = 19.5;

/* ---------- save data ---------- */
class ProfileManager {
  constructor() {
    this.key = 'DEADFRONT_SAVE_v4';
    this.data = {
      credits: 600,
      unlocked: ['sparker', 'chomper', 'stinger', 'tank', 'jetlegs'],
      loadout: { primary: 'sparker', secondary: 'chomper', gear: 'tank' },
      presets: [null, null, null],
      highScore: 0, maxWave: 0, sens: 1, gfx: 'auto'
    };
    this.load();
  }
  load() {
    try {
      const s = localStorage.getItem(this.key);
      if (s) Object.assign(this.data, JSON.parse(s));
    } catch (e) { /* private mode: play without saving */ }
    const d = this.data, lo = d.loadout;
    if (!WEAPONS[lo.primary] || !d.unlocked.includes(lo.primary)) lo.primary = 'sparker';
    if (!WEAPONS[lo.secondary] || !d.unlocked.includes(lo.secondary) || lo.secondary === lo.primary) lo.secondary = lo.primary === 'chomper' ? 'sparker' : 'chomper';
    if (!GEARS[lo.gear] || !d.unlocked.includes(lo.gear)) lo.gear = 'tank';
  }
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {} }
  reset() { try { localStorage.removeItem(this.key); } catch (e) {} location.reload(); }
}
const Profile = new ProfileManager();

/* squared distance from point P to segment AB */
function segDist2(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / l2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const dx = ax + abx * t - px, dy = ay + aby * t - py, dz = az + abz * t - pz;
  return dx * dx + dy * dy + dz * dz;
}

/* ====================================================================== */
class Engine {
  constructor() {
    this.canvas = $('webgl-canvas');
    this.el = {};
    ['shield-bar', 'hp-bar', 'shield-val', 'hp-val', 'hud-wave', 'hud-threats', 'hud-weapon-name', 'hud-ammo-cur', 'hud-ammo-max',
      'reload-indicator', 'hud-swap', 'hud-combo', 'hud-rage', 'boss-bar', 'boss-fill', 'damage-flash', 'dash-flash', 'hitmarker',
      'dash-pips', 'radar-canvas', 'hud', 'crosshair', 'mobile-controls-layer', 'menu-overlay', 'perk-modal', 'pause-screen',
      'gameover-screen', 'perk-cards-container', 'go-wave', 'go-credits', 'go-score', 'go-best', 'go-title', 'go-sub'
    ].forEach(id => { this.el[id] = $(id); });
    this.radarCtx = this.el['radar-canvas'].getContext('2d');

    this.keys = {};
    this.yaw = 0; this.pitch = 0;
    this.firing = false; this.jumpHeld = false;
    this.inSession = false; this.isPaused = false; this.modalOpen = false;
    this.enemies = []; this.bullets = []; this.eproj = []; this.particles = []; this.fx = []; this.pickups = [];
    this.t = 0; this.menuAngle = 0; this.mapIdx = 0;
    this.p = { x: 0, y: 0, z: 0, vy: 0, onGround: true, coyote: 0, hp: 100, maxHp: 100, shield: 100, maxShield: 100 };
    this.perks = new Set();
    this.slots = []; this.cur = 0;
    this.touchMove = { active: false, id: null, sx: 0, sy: 0, dirX: 0, dirY: 0 };
    this.touchLook = { active: false, id: null, lx: 0, ly: 0 };
    this.shake = 0; this.dmgFlash = 0; this.hitOffAt = 0; this.lavaWarn = 0;
    this.camY = EYE; this.fov = 80; this.moveAmt = 0; this.vmKick = 0; this.muzzleT = 0;
    this.hudAcc = 0; this.radarAcc = 0; this.lastTs = 0;
    this.fpsFrames = 0; this.fpsTime = 0;
    this.init();
  }

  /* ---------- setup ---------- */
  init() {
    const lowGfx = Profile.data.gfx === 'low';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a101d);
    this.scene.fog = new THREE.FogExp2(0x0a101d, 0.013);

    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !IS_TOUCH, powerPreference: 'high-performance' });
    this.pixelRatio = this.pickPixelRatio();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !IS_TOUCH && !lowGfx;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.ambient = new THREE.AmbientLight(0x6a82ab, 0.85);
    this.hemi = new THREE.HemisphereLight(0x8fb4ff, 0x1a1020, 0.55);
    this.sun = new THREE.DirectionalLight(0x8fe9ff, 1.0);
    this.sun.position.set(30, 60, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera; sc.left = -65; sc.right = 65; sc.top = 65; sc.bottom = -65; sc.near = 10; sc.far = 160;
    this.scene.add(this.ambient, this.hemi, this.sun);

    this.geo = {
      box: new THREE.BoxGeometry(1, 1, 1), tracer: new THREE.BoxGeometry(0.07, 0.07, 1.1),
      sphere: new THREE.SphereGeometry(1, 12, 9), part: new THREE.BoxGeometry(0.14, 0.14, 0.14),
      orb: new THREE.OctahedronGeometry(0.5), cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
      cylOpen: new THREE.CylinderGeometry(1, 1, 1, 18, 1, true), plane: new THREE.PlaneGeometry(1, 1)
    };
    Object.keys(this.geo).forEach(k => { this.geo[k].userData.shared = true; });
    this.matCache = {};

    this.buildWorld(0);
    this.equipModel(WEAPONS[Profile.data.loadout.primary]);
    this.bindEvents();
    this.setupMobileControls();

    requestAnimationFrame((ts) => this.loop(ts));
  }

  pickPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const g = Profile.data.gfx;
    if (g === 'low') return 1;
    if (g === 'high') return Math.min(dpr, 2);
    return Math.min(dpr, IS_TOUCH ? 1.5 : 2);
  }
  applyGfx() {
    this.pixelRatio = this.pickPixelRatio();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = !IS_TOUCH && Profile.data.gfx !== 'low';
    if (this.worldGroup) this.buildWorld(this.mapIdx);
  }

  mat(color, basic) {
    const k = color + (basic ? 'b' : 'l');
    if (!this.matCache[k]) this.matCache[k] = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
    return this.matCache[k];
  }

  /* ---------- world meshes ---------- */
  buildWorld(idx) {
    this.mapIdx = idx;
    const def = MAP_DEFS[idx], th = def.theme;
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup.traverse(o => {
        if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
        if (o.material && o.material.dispose) o.material.dispose();
      });
    }
    this.world = new World(def);
    const g = new THREE.Group(); this.worldGroup = g;
    const shadows = this.renderer.shadowMap.enabled;
    this.scene.background.setHex(th.sky);
    this.scene.fog.color.setHex(th.sky);
    this.sun.color.setHex(th.sun);

    const lam = (c, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {}));
    const bas = (c, extra) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, extra || {}));
    const platMat = lam(0x1e2638), crateMat = lam(0x2a3550), edgeMat = bas(th.accent);
    const box = (w, h, d, x, y, z, m, cast) => {
      const o = new THREE.Mesh(this.geo.box, m);
      o.scale.set(w, h, d); o.position.set(x, y, z);
      if (cast && shadows) { o.castShadow = true; o.receiveShadow = true; }
      g.add(o); return o;
    };
    const frame = (x, z, w, d, top, t) => {
      box(w + 0.2, 0.12, t, x, top + 0.02, z - d / 2, edgeMat);
      box(w + 0.2, 0.12, t, x, top + 0.02, z + d / 2, edgeMat);
      box(t, 0.12, d, x - w / 2, top + 0.02, z, edgeMat);
      box(t, 0.12, d, x + w / 2, top + 0.02, z, edgeMat);
    };

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), lam(th.floor));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = shadows; g.add(floor);
    const grid = new THREE.GridHelper(120, 60, th.grid, th.gridDim); grid.position.y = 0.03; g.add(grid);

    const wallMat = bas(th.accent, { transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
    [[0, 57, 0], [0, -57, 0], [57, 0, Math.PI / 2], [-57, 0, Math.PI / 2]].forEach(w => {
      const o = new THREE.Mesh(this.geo.plane, wallMat); o.scale.set(116, 14, 1); o.position.set(w[0], 7, w[1]); o.rotation.y = w[2]; g.add(o);
    });

    this.world.boxes.forEach(b => { box(b.w, b.top, b.d, b.x, b.top / 2, b.z, platMat, true); frame(b.x, b.z, b.w, b.d, b.top, 0.3); });
    this.world.crates.forEach(c => { box(c.s, c.top, c.s, c.x, c.top / 2, c.z, crateMat, true); frame(c.x, c.z, c.s, c.s, c.top, 0.14); });

    /* ramps: a real wedge, glowing outline, and chevron stripes so you can read the slope */
    const rampMat = lam(0x263149, { side: THREE.DoubleSide });
    this.world.ramps.forEach(r => {
      const w = r.w, L = r.len, H = r.top;
      const V = {
        a0: [-w / 2, 0, 0], a1: [w / 2, 0, 0], a2: [w / 2, 0, L], a3: [-w / 2, 0, L],
        b2: [w / 2, H, L], b3: [-w / 2, H, L]
      };
      const tris = [
        [V.a0, V.b3, V.b2], [V.a0, V.b2, V.a1],      // sloped top
        [V.a2, V.b2, V.b3], [V.a2, V.b3, V.a3],      // back wall
        [V.a1, V.b2, V.a2], [V.a0, V.a3, V.b3]       // sides
      ];
      const pos = []; tris.forEach(t => t.forEach(v => pos.push(v[0], v[1], v[2])));
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.computeVertexNormals();
      const rg = new THREE.Group(); rg.position.set(r.x, 0, r.z); rg.rotation.y = r.rot;
      const mesh = new THREE.Mesh(geom, rampMat); if (shadows) { mesh.castShadow = true; mesh.receiveShadow = true; } rg.add(mesh);
      rg.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: th.accent })));
      const ang = -Math.atan2(H, L), stripeMat = bas(th.accent);
      for (let s = 1.6; s < L - 0.4; s += 2.6) {
        const st = new THREE.Mesh(this.geo.box, stripeMat);
        st.scale.set(w * 0.86, 0.05, 0.28); st.rotation.x = ang; st.position.set(0, H * s / L + 0.03, s); rg.add(st);
      }
      g.add(rg);
    });

    /* launch pads */
    this.padObjs = [];
    this.world.pads.forEach(p => {
      const disc = new THREE.Mesh(this.geo.cyl, bas(0x39ff88)); disc.scale.set(p.r, 0.14, p.r); disc.position.set(p.x, 0.08, p.z); g.add(disc);
      const beamMat = bas(0x39ff88, { transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
      const beam = new THREE.Mesh(this.geo.cylOpen, beamMat); beam.scale.set(p.r * 0.85, 8, p.r * 0.85); beam.position.set(p.x, 4, p.z); g.add(beam);
      this.padObjs.push(beamMat);
    });

    /* lava */
    this.lavaMats = [];
    this.world.lava.forEach(l => {
      const m = bas(0xff4a10); this.lavaMats.push(m);
      const o = new THREE.Mesh(this.geo.plane, m); o.rotation.x = -Math.PI / 2;
      o.scale.set(l.x1 - l.x0, l.z1 - l.z0, 1); o.position.set((l.x0 + l.x1) / 2, 0.05, (l.z0 + l.z1) / 2); g.add(o);
    });

    /* floodlight masts + stars for atmosphere */
    [[-47, -47], [47, 47], [-47, 47], [47, -47]].forEach(m => {
      box(0.6, 15, 0.6, m[0], 7.5, m[1], platMat);
      box(2.2, 1.0, 2.2, m[0], 15, m[1], edgeMat);
    });
    const sp = [];
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * 6.283, e = 0.15 + Math.random() * 1.2, r = 170;
      sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, fog: false })));

    this.scene.add(g);
  }

  /* ---------- first-person weapon model ---------- */
  equipModel(w) {
    if (this.vm) this.camera.remove(this.vm);
    const g = new THREE.Group();
    const body = this.mat(0x2b3345), dark = this.mat(0x141926), acc = this.mat(w.color, true);
    const add = (m, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(this.geo.box, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); g.add(o); return o; };
    let tip = -0.75;
    switch (w.id) {
      case 'sparker':
        add(body, 0.11, 0.14, 0.5, 0, 0, 0); add(dark, 0.05, 0.05, 0.38, 0, 0.02, -0.4); add(acc, 0.025, 0.025, 0.5, 0, 0.085, -0.05); add(dark, 0.08, 0.2, 0.12, 0, -0.15, 0.1); tip = -0.62; break;
      case 'chomper':
        add(body, 0.17, 0.17, 0.46, 0, 0, 0); add(dark, 0.07, 0.07, 0.5, -0.045, 0.03, -0.44); add(dark, 0.07, 0.07, 0.5, 0.045, 0.03, -0.44); add(acc, 0.19, 0.03, 0.14, 0, 0.1, -0.1); add(dark, 0.09, 0.2, 0.12, 0, -0.16, 0.12); tip = -0.7; break;
      case 'stinger':
        add(body, 0.09, 0.12, 0.46, 0, 0, 0); add(dark, 0.04, 0.04, 0.34, 0, 0.01, -0.38); add(acc, 0.1, 0.02, 0.1, 0, 0.075, -0.2); add(acc, 0.1, 0.02, 0.1, 0, 0.075, -0.05); add(dark, 0.07, 0.18, 0.1, 0, -0.14, 0.1); tip = -0.58; break;
      case 'thumper':
        add(body, 0.2, 0.2, 0.42, 0, 0, 0); add(dark, 0.18, 0.18, 0.3, 0, 0.01, -0.34); add(acc, 0.22, 0.04, 0.22, 0, 0, -0.52); add(dark, 0.09, 0.2, 0.12, 0, -0.18, 0.1); tip = -0.68; break;
      case 'lancer':
        add(body, 0.1, 0.12, 0.7, 0, 0, 0); add(dark, 0.04, 0.04, 0.5, 0, 0.01, -0.58); add(acc, 0.02, 0.02, 0.9, 0, 0.075, -0.1); add(acc, 0.07, 0.07, 0.05, 0, 0.01, -0.84); add(dark, 0.08, 0.18, 0.1, 0, -0.14, 0.18); tip = -0.9; break;
      default: /* zapper */
        add(body, 0.13, 0.15, 0.42, 0, 0, 0); add(dark, 0.025, 0.025, 0.4, -0.06, 0.04, -0.38); add(dark, 0.025, 0.025, 0.4, 0.06, 0.04, -0.38);
        add(acc, 0.03, 0.03, 0.1, -0.06, 0.04, -0.6); add(acc, 0.03, 0.03, 0.1, 0.06, 0.04, -0.6); add(dark, 0.08, 0.18, 0.1, 0, -0.15, 0.1); tip = -0.66;
    }
    const mm = new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.muzzle = new THREE.Mesh(this.geo.plane, mm); this.muzzle.scale.set(0.38, 0.38, 1); this.muzzle.position.set(0, 0.02, tip - 0.05); this.muzzle.visible = false; g.add(this.muzzle);
    g.position.set(0.3, -0.27, -0.55);
    g.visible = this.inSession;
    this.vm = g; this.camera.add(g);
  }

  /* ---------- input ---------- */
  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if (IS_TOUCH && this.inSession && !this.isPaused && window.innerHeight > window.innerWidth) this.setPaused(true);
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.inSession && !this.isPaused && !this.modalOpen) this.setPaused(true); });
    window.addEventListener('blur', () => { this.keys = {}; this.firing = false; this.jumpHeld = false; });

    window.addEventListener('keydown', (e) => {
      if (!this.inSession) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) { this.keys[e.code] = true; return; }
      this.keys[e.code] = true;
      if (e.code === 'KeyP' || e.code === 'Escape') { if (!this.modalOpen) this.setPaused(!this.isPaused); return; }
      if (this.isPaused || this.modalOpen) return;
      if (e.code === 'Space') this.jumpHeld = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') this.dash();
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyQ') this.swapWeapon();
      if (e.code === 'Digit1' && this.cur !== 0) this.swapWeapon();
      if (e.code === 'Digit2' && this.cur !== 1) this.swapWeapon();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; if (e.code === 'Space') this.jumpHeld = false; });
    window.addEventListener('wheel', (e) => { if (this.inSession && !this.isPaused && !this.modalOpen && Math.abs(e.deltaY) > 4) this.swapWeapon(); }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('click', () => {
      if (this.inSession && !this.isPaused && !this.modalOpen && !this.locked() && !IS_TOUCH && this.canvas.requestPointerLock) this.canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!IS_TOUCH && this.inSession && !this.locked() && !this.isPaused && !this.modalOpen) this.setPaused(true);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked() && this.inSession && !this.isPaused) {
        const s = 0.0022 * Profile.data.sens;
        this.yaw -= e.movementX * s;
        this.pitch = clamp(this.pitch - e.movementY * s, -1.5, 1.5);
      }
    });
    window.addEventListener('mousedown', (e) => { if (e.button === 0 && this.locked() && this.inSession && !this.isPaused) { this.firing = true; Sound.init(); } });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.firing = false; });
  }
  locked() { return document.pointerLockElement === this.canvas; }
  lock() { if (!IS_TOUCH && this.canvas.requestPointerLock) { try { this.canvas.requestPointerLock(); } catch (e) {} } }
  unlock() { if (document.exitPointerLock) document.exitPointerLock(); }

  setupMobileControls() {
    const moveZone = $('touch-move-zone'), lookZone = $('touch-look-zone');
    const joyBase = $('joystick-base'), joyThumb = $('joystick-thumb');
    const find = (list, id) => { for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i]; return null; };

    moveZone.addEventListener('touchstart', (e) => {
      e.preventDefault(); Sound.init();
      if (this.touchMove.active) return;
      const t = e.changedTouches[0];
      Object.assign(this.touchMove, { active: true, id: t.identifier, sx: t.clientX, sy: t.clientY, dirX: 0, dirY: 0 });
      joyBase.style.display = 'block'; joyBase.style.left = t.clientX + 'px'; joyBase.style.top = t.clientY + 'px';
      joyThumb.style.transform = 'translate(0px,0px)';
    }, { passive: false });
    moveZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = find(e.changedTouches, this.touchMove.id);
      if (!t || !this.touchMove.active) return;
      const dx = t.clientX - this.touchMove.sx, dy = t.clientY - this.touchMove.sy, R = 48;
      const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
      joyThumb.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px)';
      let ux = dx * k / R, uy = dy * k / R;
      if (Math.hypot(ux, uy) < 0.14) { ux = 0; uy = 0; }
      this.touchMove.dirX = ux; this.touchMove.dirY = uy;
    }, { passive: false });
    const endMove = (e) => {
      if (!find(e.changedTouches, this.touchMove.id)) return;
      this.touchMove.active = false; this.touchMove.dirX = 0; this.touchMove.dirY = 0; joyBase.style.display = 'none';
    };
    moveZone.addEventListener('touchend', endMove); moveZone.addEventListener('touchcancel', endMove);

    lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault(); Sound.init();
      if (this.touchLook.active) return;
      const t = e.changedTouches[0];
      Object.assign(this.touchLook, { active: true, id: t.identifier, lx: t.clientX, ly: t.clientY });
    }, { passive: false });
    lookZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = find(e.changedTouches, this.touchLook.id);
      if (!t || !this.touchLook.active || this.isPaused) return;
      const s = 0.0052 * Profile.data.sens;
      this.yaw -= (t.clientX - this.touchLook.lx) * s;
      this.pitch = clamp(this.pitch - (t.clientY - this.touchLook.ly) * s, -1.5, 1.5);
      this.touchLook.lx = t.clientX; this.touchLook.ly = t.clientY;
    }, { passive: false });
    const endLook = (e) => { if (find(e.changedTouches, this.touchLook.id)) this.touchLook.active = false; };
    lookZone.addEventListener('touchend', endLook); lookZone.addEventListener('touchcancel', endLook);

    const hold = (id, down, up) => {
      const b = $(id);
      b.addEventListener('touchstart', (e) => { e.preventDefault(); Sound.init(); b.classList.add('on'); if (this.inSession && !this.isPaused && !this.modalOpen) down(); }, { passive: false });
      const end = (e) => { e.preventDefault(); b.classList.remove('on'); if (up) up(); };
      b.addEventListener('touchend', end, { passive: false }); b.addEventListener('touchcancel', end, { passive: false });
    };
    hold('m-btn-fire', () => { this.firing = true; }, () => { this.firing = false; });
    hold('m-btn-jump', () => { this.jumpHeld = true; }, () => { this.jumpHeld = false; });
    hold('m-btn-dash', () => this.dash());
    hold('m-btn-reload', () => this.startReload());
    hold('m-btn-swap', () => this.swapWeapon());
    hold('m-btn-pause', () => this.setPaused(true));
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scrolls')) e.preventDefault(); }, { passive: false });
  }

  /* ---------- session control ---------- */
  startSession() {
    Sound.init();
    const lo = Profile.data.loadout;
    this.slots = [{ w: WEAPONS[lo.primary], mag: WEAPONS[lo.primary].mag }, { w: WEAPONS[lo.secondary], mag: WEAPONS[lo.secondary].mag }];
    this.cur = 0; this.gear = lo.gear;
    this.perks.clear();
    const p = this.p;
    p.maxHp = 100 + (this.gear === 'medic' ? 30 : 0);
    p.maxShield = 100 + (this.gear === 'tank' ? 50 : 0);
    p.hp = p.maxHp; p.shield = p.maxShield;
    this.maxDash = 2 + (this.gear === 'jetlegs' ? 1 : 0);
    this.dashCharges = this.maxDash; this.dashRecharge = 0; this.dashTime = 0; this.dashDx = 0; this.dashDz = 0;
    this.buildDashPips();

    if (this.world.def.id !== this.mapIdx) this.buildWorld(this.mapIdx);
    const sp = this.world.def.spawn;
    p.x = sp[0]; p.z = sp[1]; p.y = this.world.topAt(p.x, p.z); p.vy = 0; p.onGround = true; p.coyote = 0.1;
    this.camY = p.y + EYE; this.yaw = 0; this.pitch = 0;

    this.t = 0; this.nextShot = 0; this.burstLeft = 0; this.burstTimer = 0; this.reloading = 0; this.reloadTotal = 1;
    this.invulnUntil = 0; this.lastHurt = -10; this.padCd = 0; this.rageT = 0;
    this.combo = 0; this.comboT = 0; this.score = 0; this.kills = 0; this.credits = 0;
    this.wave = 1; this.firing = false; this.jumpHeld = false; this.shake = 0;
    this.cleanEntities();
    this.inSession = true; this.isPaused = false; this.modalOpen = false;
    this.equipModel(this.slots[0].w); this.vm.visible = true;

    this.el['menu-overlay'].style.display = 'none';
    this.el['gameover-screen'].style.display = 'none';
    this.el['hud'].style.display = 'flex';
    this.el['crosshair'].style.display = 'block';
    if (IS_TOUCH) this.el['mobile-controls-layer'].style.display = 'block'; else this.lock();
    this.startWave();
    this.syncHUD();
    if (!IS_TOUCH) GameApp.toast('WASD move  SPACE jump  SHIFT dash  Q swap');
  }

  cleanEntities() {
    [this.enemies.map(e => e.group), this.bullets.map(b => b.mesh), this.eproj.map(b => b.mesh), this.particles.map(b => b.mesh), this.pickups.map(b => b.mesh)]
      .forEach(list => list.forEach(m => this.scene.remove(m)));
    this.fx.forEach(f => this.removeFx(f));
    this.enemies = []; this.bullets = []; this.eproj = []; this.particles = []; this.fx = []; this.pickups = [];
  }

  setPaused(v) {
    if (!this.inSession || this.modalOpen) return;
    this.isPaused = v;
    this.firing = false; this.jumpHeld = false;
    this.el['pause-screen'].style.display = v ? 'flex' : 'none';
    if (v) this.unlock(); else this.lock();
  }
  resumeGame() { this.setPaused(false); }

  endSession(dead) {
    if (!this.inSession) return;
    this.inSession = false; this.isPaused = false; this.modalOpen = false; this.firing = false;
    this.unlock();
    const d = Profile.data;
    d.credits += this.credits;
    d.highScore = Math.max(d.highScore, Math.floor(this.score));
    d.maxWave = Math.max(d.maxWave, this.wave - (dead ? 1 : 0));
    Profile.save();
    ['hud', 'pause-screen', 'perk-modal', 'mobile-controls-layer'].forEach(id => { this.el[id].style.display = 'none'; });
    this.el['crosshair'].style.display = 'none'; this.el['boss-bar'].style.display = 'none';
    this.vm.visible = false;
    if (dead) {
      this.el['go-wave'].innerText = Math.max(0, this.wave - 1);
      this.el['go-credits'].innerText = '+' + this.credits;
      this.el['go-score'].innerText = Math.floor(this.score).toLocaleString();
      this.el['go-best'].innerText = d.maxWave;
      this.el['gameover-screen'].style.display = 'flex';
    } else {
      this.cleanEntities();
      this.el['menu-overlay'].style.display = 'flex';
      GameApp.refresh();
    }
  }
  quitToMenu() {
    this.el['gameover-screen'].style.display = 'none';
    if (this.inSession) { this.endSession(false); return; }
    this.cleanEntities();
    this.el['menu-overlay'].style.display = 'flex';
    GameApp.refresh();
  }

  /* ---------- waves ---------- */
  buildQueue(w) {
    const total = Math.round(8 + w * 4.5);
    const boss = w % 5 === 0;
    const n = boss ? Math.round(total * 0.6) : total;
    const brute = w >= 3 ? Math.min(0.18, 0.04 + w * 0.012) : 0;
    const spit = w >= 2 ? Math.min(0.28, 0.10 + w * 0.02) : 0;
    const run = w >= 2 ? Math.min(0.30, 0.12 + w * 0.015) : 0;
    const q = [];
    for (let i = 0; i < n; i++) {
      const r = Math.random(); let t = 'swarmer';
      if (r < brute) t = 'brute'; else if (r < brute + spit) t = 'spitter'; else if (r < brute + spit + run) t = 'runner';
      q.push(t);
    }
    if (boss) q.splice(Math.min(3, q.length), 0, 'boss');
    return q;
  }
  startWave() {
    this.queue = this.buildQueue(this.wave);
    this.waveActive = true; this.spawnTimer = 1.2;
    GameApp.toast(this.wave % 5 === 0 ? 'WAVE ' + this.wave + '  BOSS INCOMING' : 'WAVE ' + this.wave);
    Sound.play('wave'); this.hudDirty = true;
  }
  updateWave(dt) {
    if (!this.waveActive) return;
    const cap = IS_TOUCH ? 18 : 24;
    this.spawnTimer -= dt;
    if (this.queue.length && this.enemies.length < cap && this.spawnTimer <= 0) {
      this.spawnEnemy(this.queue.shift());
      this.spawnTimer = Math.max(0.22, 0.7 - this.wave * 0.03);
    }
    if (!this.queue.length && this.enemies.length === 0) this.waveClear();
  }
  waveClear() {
    this.waveActive = false;
    const bonus = Math.round((40 + this.wave * 10) * (this.gear === 'scav' ? 1.6 : 1));
    this.credits += bonus; this.score += 500 * this.wave;
    this.modalOpen = true; this.firing = false; this.jumpHeld = false;
    this.unlock();
    GameApp.toast('WAVE CLEAR  +' + bonus);
    this.showPerks();
  }
  showPerks() {
    const box = this.el['perk-cards-container']; box.innerHTML = '';
    const pool = PERKS.filter(p => !this.perks.has(p.id)).sort(() => Math.random() - 0.5).slice(0, 3);
    if (pool.length < 3) pool.push(PERK_REPAIR);
    pool.forEach(perk => {
      const c = document.createElement('button'); c.className = 'perk-card';
      c.innerHTML = '<div class="perk-icon">' + perk.icon + '</div><h3>' + perk.name + '</h3><p>' + perk.desc + '</p>';
      c.addEventListener('click', () => {
        if (perk.id === 'repair') { this.p.hp = this.p.maxHp; this.p.shield = this.p.maxShield; }
        else { this.perks.add(perk.id); if (perk.id === 'nanite') { this.p.maxShield += 60; this.p.shield = this.p.maxShield; } }
        this.el['perk-modal'].style.display = 'none';
        this.modalOpen = false; this.wave++; this.lock(); this.startWave(); this.hudDirty = true;
      });
      box.appendChild(c);
    });
    this.el['perk-modal'].style.display = 'flex';
  }

  /* ---------- enemies ---------- */
  makeEnemy(type) {
    const T = ENEMY_TYPES[type], s = T.size, g = new THREE.Group();
    const body = this.mat(T.color), dark = this.mat(0x1a1f2e), eye = this.mat(T.eye, true);
    const part = (m, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(this.geo.box, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); g.add(o); return o; };
    const legL = part(dark, s * 0.3, s * 0.6, s * 0.3, -s * 0.22, s * 0.3, 0);
    const legR = part(dark, s * 0.3, s * 0.6, s * 0.3, s * 0.22, s * 0.3, 0);
    const torso = part(body, s * 0.95, s * 0.8, s * 0.62, 0, s * 1.0, 0);
    part(body, s * 0.55, s * 0.42, s * 0.5, 0, s * 1.55, s * 0.04);
    part(eye, s * 0.4, s * 0.09, s * 0.06, 0, s * 1.58, s * 0.3);
    if (type === 'spitter') part(this.mat(0x39ff14, true), s * 0.5, s * 0.5, s * 0.5, 0, s * 1.05, -s * 0.4);
    if (type === 'brute') { part(dark, s * 0.4, s * 0.35, s * 0.7, -s * 0.65, s * 1.35, 0); part(dark, s * 0.4, s * 0.35, s * 0.7, s * 0.65, s * 1.35, 0); }
    if (type === 'boss') { part(dark, s * 0.12, s * 0.5, s * 0.12, -s * 0.2, s * 1.95, 0); part(dark, s * 0.12, s * 0.5, s * 0.12, s * 0.2, s * 1.95, 0); part(eye, s * 0.3, s * 0.3, s * 0.1, 0, s * 1.0, s * 0.33); }
    return { group: g, legL, legR, torso, baseY: torso.position.y };
  }
  spawnEnemy(type) {
    const T = ENEMY_TYPES[type], w = this.wave;
    let x = 0, z = 0;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.283, d = 38 + Math.random() * 14;
      x = clamp(Math.cos(a) * d, -ARENA + 1, ARENA - 1); z = clamp(Math.sin(a) * d, -ARENA + 1, ARENA - 1);
      if (this.world.topAt(x, z) < 0.3 && !this.world.inLava(x, z)) break;
    }
    const m = this.makeEnemy(type);
    m.group.position.set(x, 0, z); this.scene.add(m.group);
    const hp = T.hp(w);
    this.enemies.push({ group: m.group, legL: m.legL, legR: m.legR, torso: m.torso, baseY: m.baseY, type, T, hp, maxHp: hp, speed: T.speed(w),
      r: T.r, cy: T.size * 0.9, phase: Math.random() * 6, pulse: 0, lastAtk: 0, lastShot: this.t + rand(0.5, 2) });
    this.hudDirty = true;
  }
  updateEnemies(dt) {
    const P = this.p, W = this.world, list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const en = list[i], g = en.group.position;
      let dx = P.x - g.x, dz = P.z - g.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist, nz = dz / dist;
      let mv = 0;
      if (en.type === 'spitter') { mv = dist > 20 ? 1 : (dist < 11 ? -0.8 : 0); }
      else if (en.type === 'boss') { mv = dist > 11 ? 1 : 0; }
      else { mv = dist > 1.5 ? 1 : 0; }
      let sp = en.speed;
      if (en.type === 'brute' && dist < 13 && dist > 3) sp *= 1.9;
      let x = g.x + nx * mv * sp * dt, z = g.z + nz * mv * sp * dt;
      for (let j = i + 1; j < list.length; j++) {
        const o = list[j].group.position, sx = x - o.x, sz = z - o.z, d2 = sx * sx + sz * sz, min = (en.r + list[j].r) * 0.7;
        if (d2 < min * min && d2 > 0.0001) { const d = Math.sqrt(d2), push = (min - d) * 0.5; x += sx / d * push; z += sz / d * push; o.x -= sx / d * push; o.z -= sz / d * push; }
      }
      const target = W.topAt(x, z);
      let y = g.y;
      y = target > y ? Math.min(target, y + 9 * dt) : Math.max(target, y - 24 * dt);
      en.group.position.set(x, y, z);
      en.group.rotation.y = Math.atan2(dx, dz);
      en.phase += dt * (3 + en.speed * 1.4);
      const sw = Math.sin(en.phase) * 0.7 * (mv !== 0 ? 1 : 0.2);
      en.legL.rotation.x = sw; en.legR.rotation.x = -sw;
      en.torso.position.y = en.baseY + Math.abs(Math.sin(en.phase)) * 0.06 * en.T.size;
      en.pulse = Math.max(0, en.pulse - dt);
      const sc = 1 + en.pulse * 0.9; en.group.scale.set(sc, sc, sc);

      const dy = (P.y + 1) - (y + en.cy);
      if (en.type === 'spitter' || en.type === 'boss') {
        if (this.t - en.lastShot > (en.type === 'boss' ? 2.4 : 2.3) && dist < 45) {
          en.lastShot = this.t; Sound.play('spit');
          const fan = en.type === 'boss' ? [-0.28, -0.14, 0, 0.14, 0.28] : (this.wave >= 6 ? [-0.08, 0.08] : [0]);
          const base = Math.atan2(P.x - x, P.z - z);
          fan.forEach(off => this.spawnSpit(x, y + en.cy + 0.5, z, base + off, P.y + 1.1 - (y + en.cy + 0.5), dist, en.type === 'boss' ? 18 : 14));
        }
      }
      if (en.T.dmg > 0 && dist < en.r + 0.9 && Math.abs(dy) < 2.6 && this.t - en.lastAtk > 0.9) {
        en.lastAtk = this.t; this.hurt(en.T.dmg);
      }
    }
  }
  spawnSpit(x, y, z, ang, dyTotal, dist, dmg) {
    const m = new THREE.Mesh(this.geo.sphere, this.mat(0x39ff14, true));
    m.scale.set(0.32, 0.32, 0.32); m.position.set(x, y, z); this.scene.add(m);
    const sp = 17, t = Math.max(0.2, dist / sp);
    this.eproj.push({ mesh: m, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, vy: dyTotal / t, dmg, life: 4 });
  }
  updateEnemyProjectiles(dt) {
    const P = this.p;
    for (let i = this.eproj.length - 1; i >= 0; i--) {
      const e = this.eproj[i], m = e.mesh.position;
      m.set(m.x + e.vx * dt, m.y + e.vy * dt, m.z + e.vz * dt);
      e.life -= dt;
      let dead = e.life <= 0 || m.y < this.world.topAt(m.x, m.z);
      if (!dead && Math.hypot(m.x - P.x, m.z - P.z) < 0.9 && m.y > P.y - 0.2 && m.y < P.y + 2.1) { this.hurt(e.dmg); dead = true; this.burst(m.x, m.y, m.z, 0x39ff14, 6, 5); }
      if (dead) { this.scene.remove(e.mesh); this.eproj.splice(i, 1); }
    }
  }

  hitEnemy(en, dmg, x, y, z, color) {
    en.hp -= dmg; en.pulse = 0.12;
    this.burst(x, y, z, color || 0x00f0ff, 4, 5);
    this.el['hitmarker'].classList.add('active'); this.hitOffAt = this.t + 0.09;
    Sound.play('hit');
    if (en.hp <= 0) this.killEnemy(en);
  }
  killEnemy(en) {
    const i = this.enemies.indexOf(en); if (i < 0) return;
    this.enemies.splice(i, 1); this.scene.remove(en.group);
    const gp = en.group.position;
    this.burst(gp.x, gp.y + en.cy, gp.z, en.T.color, en.type === 'boss' ? 40 : 14, 8);
    this.kills++; Sound.play('kill');
    this.combo++; this.comboT = 3.5;
    const mult = 1 + Math.min(3, Math.floor(this.combo / 6) * 0.5);
    this.score += en.T.score * mult;
    this.credits += Math.round(en.T.credit * (this.gear === 'scav' ? 1.6 : 1));
    if (this.perks.has('leech')) this.p.hp = Math.min(this.p.maxHp, this.p.hp + 5);
    const chance = en.type === 'boss' ? 1 : 0.07 * (this.gear === 'scav' ? 2 : 1);
    if (Math.random() < chance) this.dropPickup(gp.x, gp.z, en.type === 'boss' ? 'heal' : (Math.random() < 0.6 ? 'heal' : 'rage'));
    if (en.type === 'boss') this.dropPickup(gp.x + 2, gp.z, 'rage');
    this.hudDirty = true;
  }
  dropPickup(x, z, type) {
    const m = new THREE.Mesh(this.geo.orb, this.mat(type === 'heal' ? 0x44ff88 : 0xffaa22, true));
    const y = this.world.topAt(x, z) + 1.0; m.position.set(x, y, z); m.scale.set(1, 1.4, 1); this.scene.add(m);
    this.pickups.push({ mesh: m, type, ttl: 16, baseY: y });
  }
  updatePickups(dt) {
    const P = this.p;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i]; k.ttl -= dt;
      k.mesh.rotation.y += dt * 3; k.mesh.position.y = k.baseY + Math.sin(this.t * 4 + i) * 0.15;
      const near = Math.hypot(k.mesh.position.x - P.x, k.mesh.position.z - P.z) < 1.9 && Math.abs(k.baseY - 1 - P.y) < 2.6;
      if (near) {
        if (k.type === 'heal') { P.hp = Math.min(P.maxHp, P.hp + 35); P.shield = Math.min(P.maxShield, P.shield + 35); GameApp.toast('REPAIRED'); }
        else { this.rageT = 8; GameApp.toast('RAGE: double damage'); }
        Sound.play('pickup'); this.hudDirty = true;
      }
      if (near || k.ttl <= 0) { this.scene.remove(k.mesh); this.pickups.splice(i, 1); }
    }
  }

  /* ---------- player ---------- */
  hurt(amount, soft) {
    if (!soft && this.t < this.invulnUntil) return;
    const p = this.p;
    this.lastHurt = this.t;
    if (p.shield > 0) { p.shield -= amount; if (p.shield < 0) { p.hp += p.shield; p.shield = 0; } } else p.hp -= amount;
    if (!soft) { this.dmgFlash = 0.85; this.shake = Math.min(1.2, this.shake + 0.3); Sound.play('hurt'); if (navigator.vibrate) navigator.vibrate(40); }
    this.hudDirty = true;
    if (p.hp <= 0) { p.hp = 0; this.endSession(true); }
  }

  dash() {
    if (!this.inSession || this.dashCharges <= 0 || this.dashTime > 0) return;
    this.dashCharges--; this.dashTime = DASH_TIME; this.invulnUntil = this.t + 0.4;
    const [wx, wz] = this.wishDir();
    if (wx === 0 && wz === 0) { this.dashDx = -Math.sin(this.yaw); this.dashDz = -Math.cos(this.yaw); } else { this.dashDx = wx; this.dashDz = wz; }
    const df = this.el['dash-flash']; df.style.opacity = '1'; setTimeout(() => { df.style.opacity = '0'; }, 160);
    Sound.play('dash'); if (navigator.vibrate) navigator.vibrate(25);
    this.hudDirty = true;
  }

  wishDir() {
    let ix = 0, iz = 0; const k = this.keys;
    if (k.KeyW || k.ArrowUp) iz += 1; if (k.KeyS || k.ArrowDown) iz -= 1;
    if (k.KeyD || k.ArrowRight) ix += 1; if (k.KeyA || k.ArrowLeft) ix -= 1;
    if (this.touchMove.active) { ix += this.touchMove.dirX; iz -= this.touchMove.dirY; }
    const m = Math.hypot(ix, iz); if (m > 1) { ix /= m; iz /= m; }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return [-s * iz + c * ix, -c * iz - s * ix];
  }

  jump() {
    const p = this.p;
    p.vy = JUMP_V * (this.gear === 'jetlegs' ? 1.12 : 1) * (this.perks.has('springs') ? 1.25 : 1);
    p.onGround = false; p.coyote = 0; Sound.play('jump');
  }

  tryMove(dx, dz) {
    const p = this.p, W = this.world, step = p.onGround ? 0.65 : 0.4;
    const ok = (x, z) => W.topAtR(x, z, RADIUS) <= p.y + step;
    const nx = p.x + dx, nz = p.z + dz;
    if (ok(nx, nz)) { p.x = nx; p.z = nz; }
    else { if (ok(nx, p.z)) p.x = nx; if (ok(p.x, nz)) p.z = nz; }
    p.x = clamp(p.x, -ARENA, ARENA); p.z = clamp(p.z, -ARENA, ARENA);
  }

  updatePlayer(dt) {
    const p = this.p, W = this.world;
    const [wx, wz] = this.wishDir();
    let vx = wx * MOVE_SPEED, vz = wz * MOVE_SPEED;
    if (this.dashTime > 0) { this.dashTime -= dt; vx = this.dashDx * DASH_SPEED; vz = this.dashDz * DASH_SPEED; }
    this.tryMove(vx * dt, vz * dt);
    const speedNow = Math.hypot(wx, wz);
    this.moveAmt += ((speedNow > 0.1 && p.onGround ? 1 : 0) - this.moveAmt) * Math.min(1, dt * 10);

    if (p.onGround) p.coyote = 0.12; else p.coyote -= dt;
    if (this.jumpHeld && p.coyote > 0) this.jump();

    const gh = W.topAt(p.x, p.z);
    if (p.onGround) {
      if (p.y - gh > 0.9) p.onGround = false; else p.y = gh;
    }
    if (!p.onGround) {
      p.vy -= GRAV * dt; p.y += p.vy * dt;
      if (p.y <= gh) {
        p.y = gh;
        if (p.vy <= 0) {
          const impact = -p.vy; p.vy = 0; p.onGround = true;
          if (impact > 7) { Sound.play('land'); this.shake = Math.min(1.2, this.shake + 0.12); }
          if (impact > 12 && this.perks.has('stomp')) this.explode(p.x, p.y + 0.3, p.z, 7, 70, 0.55, true);
        }
      }
    }
    if (p.onGround) {
      this.padCd -= dt;
      if (this.padCd <= 0 && W.padAt(p.x, p.z)) { p.vy = PAD_V; p.onGround = false; this.padCd = 0.7; Sound.play('pad'); this.burst(p.x, p.y + 0.2, p.z, 0x39ff88, 14, 6); }
      if (p.y < 0.3 && W.inLava(p.x, p.z)) { this.hurt(16 * dt, true); Sound.play('lava'); this.lavaWarn = 0.2; }
    }

    if (this.t - this.lastHurt > 2.5 && p.shield < p.maxShield) { p.shield = Math.min(p.maxShield, p.shield + (this.perks.has('nanite') ? 22 : 12) * dt); this.hudDirty = true; }
    if (this.gear === 'medic' && this.t - this.lastHurt > 3 && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 1.5 * dt); this.hudDirty = true; }

    if (this.dashCharges < this.maxDash) {
      this.dashRecharge += dt * (this.perks.has('thrust') ? 1.7 : 1);
      if (this.dashRecharge >= 2.2) { this.dashRecharge = 0; this.dashCharges++; this.hudDirty = true; }
    }
    if (this.rageT > 0) { this.rageT -= dt; if (this.rageT <= 0) this.hudDirty = true; }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; this.hudDirty = true; } }
  }

  updateCamera(dt) {
    const p = this.p;
    this.camY += (p.y + EYE - this.camY) * Math.min(1, dt * 22);
    this.shake = Math.max(0, this.shake - dt * 3);
    const sh = this.shake * 0.22;
    this.camera.position.set(p.x + (Math.random() - 0.5) * sh, this.camY + (Math.random() - 0.5) * sh, p.z + (Math.random() - 0.5) * sh);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    const wantFov = this.dashTime > 0 ? 92 : 80;
    if (Math.abs(this.fov - wantFov) > 0.1) { this.fov += (wantFov - this.fov) * Math.min(1, dt * 14); this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }

    this.vmKick = Math.max(0, this.vmKick - dt * 9);
    const bob = Math.sin(this.t * 11) * 0.012 * this.moveAmt;
    let ry = 0, rz = 0;
    if (this.reloading > 0) { const pr = 1 - this.reloading / this.reloadTotal; ry = Math.sin(pr * Math.PI) * 0.14; rz = Math.sin(pr * Math.PI) * 0.5; }
    this.vm.position.set(0.3 + Math.cos(this.t * 5.5) * 0.006 * this.moveAmt, -0.27 + bob - ry, -0.55 + this.vmKick * 0.1);
    this.vm.rotation.set(this.vmKick * 0.09, 0, rz);
    if (this.muzzleT > 0) { this.muzzleT -= dt; this.muzzle.visible = this.muzzleT > 0; this.muzzle.rotation.z = Math.random() * 6; }
  }

  /* ---------- weapons ---------- */
  dmgMult() { return (this.perks.has('hot') ? 1.35 : 1) * (this.rageT > 0 ? 2 : 1); }
  rateMult() { return (this.perks.has('clock') ? 1.25 : 1) * (this.rageT > 0 ? 1.3 : 1); }

  swapWeapon() {
    if (!this.inSession) return;
    this.cur ^= 1; this.reloading = 0; this.burstLeft = 0; this.nextShot = this.t + 0.22;
    this.el['reload-indicator'].style.display = 'none';
    this.equipModel(this.slots[this.cur].w); this.vm.visible = true;
    Sound.play('swap'); this.hudDirty = true;
  }
  startReload() {
    const s = this.slots[this.cur];
    if (this.reloading > 0 || s.mag >= s.w.mag) return;
    this.reloadTotal = s.w.reload * (this.perks.has('clock') ? 0.7 : 1);
    this.reloading = this.reloadTotal; this.burstLeft = 0;
    this.el['reload-indicator'].style.display = 'block'; Sound.play('reload');
  }
  updateWeapon(dt) {
    const s = this.slots[this.cur], w = s.w;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { this.reloading = 0; s.mag = w.mag; this.el['reload-indicator'].style.display = 'none'; this.hudDirty = true; }
    }
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) { this.fireOne(); this.burstLeft--; this.burstTimer = w.burstGap; }
    }
    if (this.firing && this.reloading <= 0 && this.burstLeft <= 0 && this.t >= this.nextShot) {
      if (s.mag <= 0) { Sound.play('empty'); this.startReload(); this.nextShot = this.t + 0.2; return; }
      this.nextShot = this.t + 60 / (w.rpm * this.rateMult());
      if (w.kind === 'burst') { this.burstLeft = w.burst - 1; this.burstTimer = w.burstGap; }
      this.fireOne();
    }
    if (this.hitOffAt && this.t > this.hitOffAt) { this.el['hitmarker'].classList.remove('active'); this.hitOffAt = 0; }
  }

  basis() {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    return { f: [-sy * cp, sp, -cy * cp], r: [cy, 0, -sy], u: [sy * sp, cp, cy * sp] };
  }

  fireOne() {
    const s = this.slots[this.cur], w = s.w;
    if (s.mag <= 0) { this.burstLeft = 0; return; }
    s.mag--; this.hudDirty = true;
    Sound.play(w.id);
    this.vmKick = Math.min(1.4, this.vmKick + (w.kind === 'grenade' ? 1.4 : (w.id === 'chomper' ? 1.2 : 0.55)));
    this.muzzleT = 0.05; this.muzzle.visible = true;
    this.shake = Math.min(1.2, this.shake + (w.id === 'chomper' || w.kind === 'grenade' ? 0.18 : 0.04));
    if (IS_TOUCH && navigator.vibrate && w.rpm < 200) navigator.vibrate(12);

    const B = this.basis(), dmg = w.dmg * this.dmgMult();
    const cx = this.camera.position.x, cy = this.camera.position.y, cz = this.camera.position.z;
    const ox = cx + B.f[0] * 0.6 + B.r[0] * 0.2 - B.u[0] * 0.14, oy = cy + B.f[1] * 0.6 - B.u[1] * 0.14, oz = cz + B.f[2] * 0.6 + B.r[2] * 0.2 - B.u[2] * 0.14;

    if (w.kind === 'chain') { this.fireChain(w, dmg, cx, cy, cz, B, ox, oy, oz); }
    else if (w.kind === 'grenade') {
      const m = new THREE.Mesh(this.geo.sphere, this.mat(w.color, true)); m.scale.set(0.3, 0.3, 0.3); m.position.set(ox, oy, oz); this.scene.add(m);
      this.bullets.push({ mesh: m, grenade: true, vx: B.f[0] * w.speed, vy: B.f[1] * w.speed + 3.5, vz: B.f[2] * w.speed, dmg, life: 3, color: w.color, radius: w.radius });
    } else {
      for (let i = 0; i < w.pellets; i++) {
        const sp = w.spread;
        let dx = B.f[0] + (Math.random() - 0.5) * sp * 2 * B.r[0] + (Math.random() - 0.5) * sp * 2 * B.u[0];
        let dy = B.f[1] + (Math.random() - 0.5) * sp * 2 * B.u[1];
        let dz = B.f[2] + (Math.random() - 0.5) * sp * 2 * B.r[2] + (Math.random() - 0.5) * sp * 2 * B.u[2];
        const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        const m = new THREE.Mesh(this.geo.tracer, this.mat(w.color, true)); m.position.set(ox, oy, oz); m.lookAt(ox + dx, oy + dy, oz + dz); this.scene.add(m);
        const pierce = w.kind === 'pierce';
        this.bullets.push({ mesh: m, dx, dy, dz, speed: w.speed, dmg, pierce, hit: pierce ? [] : null, life: pierce ? 1.0 : 1.3, color: w.color });
      }
    }
    if (s.mag === 0) this.startReload();
  }

  rayBlocked(ax, ay, az, bx, by, bz) {
    const d = Math.hypot(bx - ax, by - ay, bz - az), n = Math.ceil(d / 0.8);
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (y < this.world.topAt(x, z)) return true;
    }
    return false;
  }

  fireChain(w, dmg, cx, cy, cz, B, ox, oy, oz) {
    let best = null, bestT = 1e9;
    for (const en of this.enemies) {
      const g = en.group.position, ex = g.x - cx, ey = g.y + en.cy - cy, ez = g.z - cz;
      const t = ex * B.f[0] + ey * B.f[1] + ez * B.f[2];
      if (t < 0.5 || t > 80 || t >= bestT) continue;
      const perp2 = ex * ex + ey * ey + ez * ez - t * t, rr = en.r + 0.3;
      if (perp2 > rr * rr) continue;
      if (this.rayBlocked(cx, cy, cz, g.x, g.y + en.cy, g.z)) continue;
      best = en; bestT = t;
    }
    const pts = [[ox, oy, oz]];
    if (!best) { pts.push([cx + B.f[0] * 40, cy + B.f[1] * 40, cz + B.f[2] * 40]); this.lightning(pts, w.color); return; }
    const hits = [best];
    let cur = best;
    for (let k = 0; k < w.chain; k++) {
      let near = null, nd = w.range * w.range;
      for (const en of this.enemies) {
        if (hits.includes(en)) continue;
        const a = cur.group.position, b = en.group.position;
        const d2 = (a.x - b.x) ** 2 + (a.y + cur.cy - b.y - en.cy) ** 2 + (a.z - b.z) ** 2;
        if (d2 < nd && !this.rayBlocked(a.x, a.y + cur.cy, a.z, b.x, b.y + en.cy, b.z)) { nd = d2; near = en; }
      }
      if (!near) break;
      hits.push(near); cur = near;
    }
    hits.forEach(h => pts.push([h.group.position.x, h.group.position.y + h.cy, h.group.position.z]));
    this.lightning(pts, w.color);
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i], g = h.group.position;
      this.hitEnemy(h, i === 0 ? dmg : dmg * 0.7, g.x, g.y + h.cy, g.z, w.color);
    }
  }

  lightning(pts, color) {
    const arr = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], n = 7;
      for (let s = 0; s <= n; s++) {
        const t = s / n, j = (s === 0 || s === n) ? 0 : 0.35;
        arr.push(a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * j, a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * j, a[2] + (b[2] - a[2]) * t + (Math.random() - 0.5) * j);
      }
    }
    const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xe6d6ff }));
    this.scene.add(line); this.fx.push({ kind: 'line', mesh: line, ttl: 0.09, life: 0.09 });
  }

  updateBullets(dt) {
    const W = this.world;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i], m = b.mesh.position;
      let dead = false;
      b.life -= dt; if (b.life <= 0) dead = true;
      if (!dead) {
        let vx, vy, vz;
        if (b.grenade) { b.vy -= 20 * dt; vx = b.vx; vy = b.vy; vz = b.vz; } else { vx = b.dx * b.speed; vy = b.dy * b.speed; vz = b.dz * b.speed; }
        const n = Math.max(1, Math.ceil(Math.hypot(vx, vy, vz) * dt / 0.9)), sdt = dt / n;
        for (let k = 0; k < n && !dead; k++) {
          const px = m.x, py = m.y, pz = m.z;
          m.set(px + vx * sdt, py + vy * sdt, pz + vz * sdt);
          if (m.y <= W.topAt(m.x, m.z) || m.y < 0) {
            dead = true;
            if (b.grenade) this.explode(m.x, Math.max(m.y, 0.2), m.z, b.radius, b.dmg, 1, false); else this.burst(m.x, m.y, m.z, b.color, 3, 4);
            break;
          }
          if (Math.abs(m.x) > 90 || Math.abs(m.z) > 90) { dead = true; break; }
          for (let j = this.enemies.length - 1; j >= 0; j--) {
            const en = this.enemies[j];
            if (b.hit && b.hit.includes(en)) continue;
            const g = en.group.position, rr = en.r + 0.1;
            if (segDist2(g.x, g.y + en.cy, g.z, px, py, pz, m.x, m.y, m.z) < rr * rr) {
              if (b.grenade) { this.explode(m.x, m.y, m.z, b.radius, b.dmg, 1, false); dead = true; break; }
              this.hitEnemy(en, b.dmg, m.x, m.y, m.z, b.color);
              if (b.pierce) b.hit.push(en); else { dead = true; break; }
            }
          }
        }
      }
      if (dead) { this.scene.remove(b.mesh); this.bullets.splice(i, 1); }
    }
  }

  explode(x, y, z, radius, dmg, power, ground) {
    for (let j = this.enemies.length - 1; j >= 0; j--) {
      const en = this.enemies[j], g = en.group.position;
      const d = Math.hypot(g.x - x, g.y + en.cy - y, g.z - z);
      if (d < radius + en.r) {
        const f = 1 - clamp(d / (radius + en.r), 0, 1) * 0.6;
        this.hitEnemy(en, dmg * f, g.x, g.y + en.cy, g.z, 0xffa040);
      }
    }
    const col = ground ? 0x39ff88 : 0xff8a30;
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false });
    const s = new THREE.Mesh(this.geo.sphere, mat); s.position.set(x, y, z); s.scale.set(0.5, 0.5, 0.5); this.scene.add(s);
    this.fx.push({ kind: 'blast', mesh: s, ttl: 0.35, life: 0.35, r1: radius, ownMat: true });
    this.burst(x, y, z, col, ground ? 16 : 24, 10);
    this.shake = Math.min(1.2, this.shake + 0.5 * power); Sound.play('boom');
  }

  burst(x, y, z, color, n, speed) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 160) { const o = this.particles.shift(); this.scene.remove(o.mesh); }
      const m = new THREE.Mesh(this.geo.part, this.mat(color, true)); m.position.set(x, y, z); this.scene.add(m);
      const a = Math.random() * 6.283, sp = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({ mesh: m, vx: Math.cos(a) * sp, vy: (Math.random() * 1.4 - 0.2) * sp * 0.8 + 2, vz: Math.sin(a) * sp, ttl: 0.55, life: 0.55 });
    }
  }
  updateFx(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i], m = p.mesh.position;
      p.vy -= 14 * dt; let y = m.y + p.vy * dt; if (y < 0.06) { y = 0.06; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; }
      m.set(m.x + p.vx * dt, y, m.z + p.vz * dt);
      p.ttl -= dt; const s = Math.max(0.01, p.ttl / p.life); p.mesh.scale.set(s, s, s);
      if (p.ttl <= 0) { this.scene.remove(p.mesh); this.particles.splice(i, 1); }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.ttl -= dt;
      if (f.kind === 'blast') { const k = 1 - f.ttl / f.life, r = 0.5 + (f.r1 - 0.5) * Math.sqrt(k); f.mesh.scale.set(r, r, r); f.mesh.material.opacity = 0.7 * (1 - k); }
      if (f.ttl <= 0) { this.removeFx(f); this.fx.splice(i, 1); }
    }
  }
  removeFx(f) {
    this.scene.remove(f.mesh);
    if (f.kind === 'line') { f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
    if (f.ownMat) f.mesh.material.dispose();
  }

  /* ---------- HUD ---------- */
  buildDashPips() {
    const c = this.el['dash-pips']; c.innerHTML = '';
    for (let i = 0; i < this.maxDash; i++) { const s = document.createElement('span'); s.className = 'dash-pip'; c.appendChild(s); }
  }
  syncHUD() {
    const p = this.p, e = this.el;
    e['hp-bar'].style.width = Math.max(0, p.hp / p.maxHp * 100) + '%';
    e['shield-bar'].style.width = Math.max(0, p.shield / p.maxShield * 100) + '%';
    e['hp-val'].innerText = Math.ceil(p.hp); e['shield-val'].innerText = Math.ceil(p.shield);
    e['hud-wave'].innerText = 'WAVE ' + (this.wave < 10 ? '0' : '') + this.wave;
    e['hud-threats'].innerText = 'Hostiles ' + (this.enemies.length + (this.queue ? this.queue.length : 0));
    const s = this.slots[this.cur], o = this.slots[this.cur ^ 1];
    e['hud-weapon-name'].innerText = s.w.name; e['hud-ammo-cur'].innerText = s.mag; e['hud-ammo-max'].innerText = '/ ' + s.w.mag;
    e['hud-swap'].innerText = (IS_TOUCH ? 'SWAP ' : 'Q ') + o.w.name + '  ' + o.mag;
    const pips = e['dash-pips'].children;
    for (let i = 0; i < pips.length; i++) pips[i].className = 'dash-pip' + (i < this.dashCharges ? '' : ' recharging');
    const mult = 1 + Math.min(3, Math.floor(this.combo / 6) * 0.5);
    e['hud-combo'].innerText = this.combo >= 3 ? this.combo + ' kills  x' + mult.toFixed(1) : '';
    e['hud-rage'].style.display = this.rageT > 0 ? 'block' : 'none';
    if (this.rageT > 0) e['hud-rage'].innerText = 'RAGE ' + Math.ceil(this.rageT) + 's';
    let boss = null; for (const en of this.enemies) if (en.type === 'boss') boss = en;
    e['boss-bar'].style.display = boss ? 'block' : 'none';
    if (boss) e['boss-fill'].style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
  }
  drawRadar() {
    const c = this.radarCtx, B = this.basis(), P = this.p;
    c.clearRect(0, 0, 100, 100);
    c.strokeStyle = 'rgba(0,240,255,0.18)'; c.beginPath(); c.arc(50, 50, 25, 0, 6.283); c.stroke();
    const plot = (wx, wz, col, sz) => {
      const rx = wx - P.x, rz = wz - P.z;
      const right = rx * B.r[0] + rz * B.r[2], fwd = rx * B.f[0] + rz * B.f[2];
      const x = 50 + right * 1.25, y = 50 - fwd * 1.25;
      if (Math.hypot(x - 50, y - 50) > 46) return;
      c.fillStyle = col; c.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    };
    this.enemies.forEach(en => plot(en.group.position.x, en.group.position.z, en.type === 'spitter' ? '#ffb020' : (en.type === 'boss' ? '#ffffff' : '#ff2e63'), en.type === 'boss' ? 6 : 4));
    this.pickups.forEach(k => plot(k.mesh.position.x, k.mesh.position.z, k.type === 'heal' ? '#44ff88' : '#ffaa22', 4));
    c.fillStyle = '#00f0ff'; c.beginPath(); c.moveTo(50, 44); c.lineTo(46, 54); c.lineTo(54, 54); c.closePath(); c.fill();
  }

  /* ---------- main loop ---------- */
  update(dt) {
    this.t += dt;
    this.updatePlayer(dt);
    if (!this.inSession) return;
    this.updateWeapon(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    if (!this.inSession) return;
    this.updateEnemyProjectiles(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    this.updateWave(dt);
    this.updateCamera(dt);
    if (this.dmgFlash > 0 || this.lavaWarn > 0) {
      this.dmgFlash = Math.max(0, this.dmgFlash - dt * 4); this.lavaWarn = Math.max(0, this.lavaWarn - dt);
      this.el['damage-flash'].style.opacity = Math.max(this.dmgFlash, this.lavaWarn > 0 ? 0.35 : 0);
    }
    this.hudAcc += dt;
    if (this.hudDirty || this.hudAcc > 0.25) { this.hudAcc = 0; this.hudDirty = false; this.syncHUD(); }
    this.radarAcc += dt;
    if (this.radarAcc > 0.05) { this.radarAcc = 0; this.drawRadar(); }
  }

  menuCam(dt) {
    this.menuAngle += dt * 0.12;
    const a = this.menuAngle;
    this.camera.position.set(Math.cos(a) * 46, 17, Math.sin(a) * 46);
    this.camera.lookAt(0, 3, 0);
    if (this.vm) this.vm.visible = false;
  }

  loop(ts) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (ts - this.lastTs) / 1000; this.lastTs = ts;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);

    if (this.inSession && !this.isPaused && !this.modalOpen) this.update(dt);
    else if (!this.inSession) this.menuCam(dt);

    const tt = ts / 1000;
    if (this.lavaMats) this.lavaMats.forEach(m => m.color.setHSL(0.045 + Math.sin(tt * 2) * 0.012, 1, 0.5 + Math.sin(tt * 3.1) * 0.07));
    if (this.padObjs) this.padObjs.forEach(m => { m.opacity = 0.14 + Math.sin(tt * 4) * 0.06; });

    this.fpsFrames++; this.fpsTime += dt;
    if (this.fpsTime > 2.5) {
      const fps = this.fpsFrames / this.fpsTime; this.fpsFrames = 0; this.fpsTime = 0;
      if (Profile.data.gfx === 'auto' && this.inSession && fps < 38 && this.pixelRatio > 0.8) {
        this.pixelRatio = Math.max(0.8, this.pixelRatio - 0.2);
        this.renderer.setPixelRatio(this.pixelRatio); this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}

let GameEngine = null;
