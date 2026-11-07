/* =========================================================================
   DEADFRONT UI: menu, loadout screen, presets, settings, toasts, boot
   ========================================================================= */
'use strict';

const GameApp = {
  slot: 'primary',

  init() {
    this.buildMaps();
    this.bindNav();
    this.bindButtons();
    this.refresh();
    this.selectMap(0);
    const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (!fsOk) document.querySelectorAll('.fs-btn').forEach(b => { b.style.display = 'none'; });
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !window.navigator.standalone) $('ios-tip').style.display = 'block';
  },

  bindNav() {
    const tabs = document.querySelectorAll('.nav-btn');
    tabs.forEach(btn => btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.menu-page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(btn.getAttribute('data-tab')).classList.add('active');
    }));
  },

  bindButtons() {
    $('btn-start-match').addEventListener('click', () => GameEngine.startSession());
    $('btn-resume').addEventListener('click', () => GameEngine.resumeGame());
    $('btn-abort').addEventListener('click', () => GameEngine.quitToMenu());
    $('btn-hub').addEventListener('click', () => GameEngine.quitToMenu());
    $('btn-retry').addEventListener('click', () => { $('gameover-screen').style.display = 'none'; GameEngine.startSession(); });
    document.querySelectorAll('.fs-btn').forEach(b => b.addEventListener('click', () => this.toggleFullscreen()));

    const sens = $('set-sens');
    sens.value = Profile.data.sens;
    $('set-sens-val').innerText = Number(Profile.data.sens).toFixed(1) + 'x';
    sens.addEventListener('input', () => { Profile.data.sens = parseFloat(sens.value); $('set-sens-val').innerText = Profile.data.sens.toFixed(1) + 'x'; Profile.save(); });
    document.querySelectorAll('#gfx-row button').forEach(b => {
      b.classList.toggle('active', b.dataset.gfx === Profile.data.gfx);
      b.addEventListener('click', () => {
        Profile.data.gfx = b.dataset.gfx; Profile.save();
        document.querySelectorAll('#gfx-row button').forEach(x => x.classList.toggle('active', x === b));
        GameEngine.applyGfx();
      });
    });
    let armed = false;
    $('btn-reset').addEventListener('click', (e) => {
      if (!armed) { armed = true; e.target.innerText = 'Tap again to erase all progress'; setTimeout(() => { armed = false; e.target.innerText = 'Reset progress'; }, 3500); return; }
      Profile.reset();
    });
  },

  toggleFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (req) { const r = req.call(el); const lock = () => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }; if (r && r.then) r.then(lock).catch(() => {}); else lock(); }
    } else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  },

  /* ---------- maps ---------- */
  buildMaps() {
    const box = $('map-picker'); box.innerHTML = '';
    MAP_DEFS.forEach((m, i) => {
      const c = document.createElement('button');
      c.className = 'map-card'; c.dataset.i = i;
      c.style.setProperty('--ac', '#' + m.theme.accent.toString(16).padStart(6, '0'));
      c.innerHTML = '<span class="map-name">' + m.name + '</span><span class="map-sub">' + m.blurb + '</span>';
      c.addEventListener('click', () => this.selectMap(i));
      box.appendChild(c);
    });
  },
  selectMap(i) {
    document.querySelectorAll('.map-card').forEach((c, k) => c.classList.toggle('selected', k === i));
    $('selected-map-title').innerText = MAP_DEFS[i].title;
    $('selected-map-desc').innerText = MAP_DEFS[i].desc;
    document.documentElement.style.setProperty('--map-ac', '#' + MAP_DEFS[i].theme.accent.toString(16).padStart(6, '0'));
    GameEngine.buildWorld(i);
  },

  /* ---------- screens ---------- */
  refresh() {
    const d = Profile.data;
    $('topbar-credits').innerText = d.credits.toLocaleString();
    $('hero-best').innerText = d.maxWave > 0 ? 'Best: wave ' + d.maxWave + ', ' + d.highScore.toLocaleString() + ' pts' : 'No runs yet. Your first one starts at wave 1.';
    const lo = d.loadout;
    $('hero-loadout').innerHTML = '<b>' + WEAPONS[lo.primary].name + '</b> + <b>' + WEAPONS[lo.secondary].name + '</b> with ' + GEARS[lo.gear].name;
    this.renderLoadout(); this.renderPresets();
  },

  renderLoadout() {
    const d = Profile.data, lo = d.loadout;
    const row = $('slot-row'); row.innerHTML = '';
    [['primary', 'Primary', WEAPONS[lo.primary].name], ['secondary', 'Secondary', WEAPONS[lo.secondary].name], ['gear', 'Gear', GEARS[lo.gear].name]].forEach(s => {
      const b = document.createElement('button');
      b.className = 'slot-btn' + (this.slot === s[0] ? ' active' : '');
      b.innerHTML = '<span class="slot-label">' + s[1] + '</span><span class="slot-name">' + s[2] + '</span>';
      b.addEventListener('click', () => { this.slot = s[0]; this.renderLoadout(); });
      row.appendChild(b);
    });

    const list = $('loadout-list'); list.innerHTML = '';
    const items = this.slot === 'gear' ? Object.values(GEARS) : Object.values(WEAPONS);
    items.forEach(it => {
      const owned = d.unlocked.includes(it.id);
      const on = lo[this.slot] === it.id;
      const hex = '#' + it.color.toString(16).padStart(6, '0');
      const card = document.createElement('div');
      card.className = 'gear-card' + (on ? ' active' : '');
      card.style.setProperty('--ac', hex);
      let stats = '';
      if (it.stats) {
        stats = '<div class="stats">' + ['Power', 'Rate', 'Mag'].map((n, k) => {
          let pips = ''; for (let i = 0; i < 5; i++) pips += '<i class="' + (i < it.stats[k] ? 'f' : '') + '"></i>';
          return '<span>' + n + '<em>' + pips + '</em></span>';
        }).join('') + '</div>';
      }
      const label = on ? 'Equipped' : (owned ? 'Equip' : 'Buy ' + it.cost);
      card.innerHTML = '<div class="gear-main"><strong>' + it.name + '</strong><span class="tagline">' + it.tag + '</span>' +
        (it.desc ? '<span class="desc">' + it.desc + '</span>' : '') + stats + '</div>' +
        '<button class="btn-mini' + (owned ? '' : ' buy') + '"' + (on ? ' disabled' : '') + '>' + label + '</button>';
      card.querySelector('button').addEventListener('click', () => this.choose(it));
      list.appendChild(card);
    });
  },

  choose(it) {
    const d = Profile.data, lo = d.loadout;
    if (!d.unlocked.includes(it.id)) {
      if (d.credits < it.cost) { this.toast('Need ' + (it.cost - d.credits) + ' more credits'); return; }
      d.credits -= it.cost; d.unlocked.push(it.id); this.toast('Unlocked ' + it.name);
    }
    if (this.slot === 'gear') lo.gear = it.id;
    else {
      const other = this.slot === 'primary' ? 'secondary' : 'primary';
      if (lo[other] === it.id) lo[other] = lo[this.slot];
      lo[this.slot] = it.id;
    }
    Profile.save(); this.refresh();
  },

  renderPresets() {
    const d = Profile.data, row = $('preset-row'); row.innerHTML = '';
    ['A', 'B', 'C'].forEach((n, i) => {
      const p = d.presets[i];
      const c = document.createElement('div'); c.className = 'preset';
      c.innerHTML = '<div class="preset-name">Loadout ' + n + '</div><div class="preset-sum">' + (p ? WEAPONS[p.primary].name + ' + ' + WEAPONS[p.secondary].name + '<br>' + GEARS[p.gear].name : 'Empty') + '</div>' +
        '<div class="preset-btns"><button class="btn-mini" data-act="load"' + (p ? '' : ' disabled') + '>Load</button><button class="btn-mini" data-act="save">Save</button></div>';
      c.querySelector('[data-act=save]').addEventListener('click', () => { d.presets[i] = Object.assign({}, d.loadout); Profile.save(); this.toast('Saved to loadout ' + n); this.renderPresets(); });
      c.querySelector('[data-act=load]').addEventListener('click', () => {
        const q = d.presets[i];
        if (!q || ![q.primary, q.secondary, q.gear].every(id => d.unlocked.includes(id))) { this.toast('That loadout has locked items'); return; }
        d.loadout = Object.assign({}, q); Profile.save(); this.toast('Loaded loadout ' + n); this.refresh();
      });
      row.appendChild(c);
    });
  },

  toast(msg) {
    const c = $('toast-container');
    while (c.children.length > 3) c.removeChild(c.firstChild);
    const t = document.createElement('div'); t.className = 'toast'; t.innerText = msg; c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2400);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  const boot = $('boot-msg');
  if (typeof THREE === 'undefined') {
    boot.innerHTML = 'Could not load the 3D engine.<br>Check your connection and reload the page.';
    boot.classList.add('error'); return;
  }
  try {
    GameEngine = new Engine();
    GameApp.init();
    boot.style.display = 'none';
  } catch (err) {
    console.error(err);
    boot.innerHTML = 'This browser could not start WebGL.<br>Try Chrome, Safari or Firefox, with hardware acceleration on.';
    boot.classList.add('error');
  }
});
