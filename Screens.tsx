import { META_DEFS, type MetaId, type Snapshot } from './config';
import { metaCost, type MetaSave } from './meta';

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse / Left click', 'Aim / Fire'],
  ['Shift', 'Thruster dash (brief invulnerability)'],
  ['Space', 'High jump (dodges slams and melee)'],
  ['R', 'Reload'],
  ['1 to 6', 'Switch weapon'],
  ['B', 'Armory (pauses the fight)'],
  ['P / Esc', 'Pause'],
];

export function Menu({
  save, onDeploy, onBuy,
}: { save: MetaSave; onDeploy: () => void; onBuy: (id: MetaId) => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center p-6 md:p-14 overflow-auto"
      style={{ background: 'linear-gradient(90deg, rgba(5,8,17,0.92) 0%, rgba(5,8,17,0.55) 55%, rgba(5,8,17,0.15) 100%)' }}>
      <div className="w-full max-w-[1200px] mx-auto grid lg:grid-cols-[1fr_440px] gap-10 items-center">
        <div>
          <h1 className="title-glitch text-6xl md:text-8xl text-white leading-none">DEADFRONT</h1>
          <p className="font-display font-bold text-xl md:text-2xl text-cyan-core mt-3">Apex Cyber Protocol</p>
          <p className="font-ui text-xl text-slate-300 mt-5 max-w-[34rem]">
            Hold the arena against waves of hostile mechs. Spend credits on weapons between fights,
            and bank cores from every run to upgrade your rig for the next one.
          </p>
          <div className="flex gap-4 mt-8 items-center flex-wrap">
            <button className="btn btn-primary text-lg" onClick={onDeploy} autoFocus>Deploy</button>
            <div className="font-mono text-sm text-slate-400">
              Best wave {save.bestWave} · Best score {save.bestScore.toLocaleString()} · Runs {save.runs}
            </div>
          </div>
          <dl className="mt-10 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 font-ui text-[17px] max-w-[34rem]">
            {CONTROLS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-cyan-core">{k}</dt>
                <dd className="text-slate-300">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="panel p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display font-bold text-xl text-white">Rig upgrades</h2>
            <div className="font-display font-bold text-xl text-violet-core">{save.cores} cores</div>
          </div>
          <div className="space-y-2.5">
            {META_DEFS.map((d) => {
              const lv = save.levels[d.id];
              const maxed = lv >= d.max;
              const cost = metaCost(d.id, lv);
              return (
                <div key={d.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-ui font-bold text-lg text-white leading-tight">{d.name}</div>
                    <div className="font-ui text-[15px] text-slate-400 leading-tight">{d.desc}</div>
                    <div className="flex gap-[3px] mt-1.5">
                      {Array.from({ length: d.max }).map((_, k) => (
                        <span key={k} className="h-[5px] w-[16px]" style={{ background: k < lv ? '#a678ff' : 'rgba(255,255,255,0.12)' }} />
                      ))}
                    </div>
                  </div>
                  <button className="btn btn-sm w-[88px]" disabled={maxed || save.cores < cost} onClick={() => onBuy(d.id)}>
                    {maxed ? 'Maxed' : `${cost} cores`}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="font-ui text-[15px] text-slate-500 mt-4">
            Cores are earned when your rig is destroyed. Reach later waves and defeat bosses for more.
          </p>
        </div>
      </div>
    </div>
  );
}

export function PauseScreen({
  snap, onResume, onQuit, onMute, onBloom,
}: { snap: Snapshot; onResume: () => void; onQuit: () => void; onMute: () => void; onBloom: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center">
      <div className="panel p-8 w-[380px] text-center">
        <h2 className="font-display font-black text-3xl text-white mb-6">Paused</h2>
        <div className="flex flex-col gap-3">
          <button className="btn btn-primary" onClick={onResume} autoFocus>Resume</button>
          <button className="btn" onClick={onMute}>Sound: {snap.muted ? 'Off' : 'On'}</button>
          <button className="btn" onClick={onBloom}>Bloom: {snap.bloom ? 'On' : 'Off'}</button>
          <button className="btn btn-amber" onClick={onQuit}>Abandon run</button>
        </div>
        <p className="font-mono text-[13px] text-slate-500 mt-5">Abandoning a run does not award cores.</p>
      </div>
    </div>
  );
}

export function GameOver({
  snap, save, onRedeploy, onMenu,
}: { snap: Snapshot; save: MetaSave; onRedeploy: () => void; onMenu: () => void }) {
  const s = snap.summary;
  if (!s) return null;
  const mins = Math.floor(s.time / 60), secs = Math.floor(s.time % 60);
  const rows: [string, string][] = [
    ['Wave reached', String(s.wave)],
    ['Score', s.score.toLocaleString()],
    ['Hostiles destroyed', String(s.kills)],
    ['Titans destroyed', String(s.bossKills)],
    ['Survived', `${mins}:${String(secs).padStart(2, '0')}`],
  ];
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="panel panel-hot p-8 w-[460px]">
        <h2 className="font-display font-black text-4xl text-hot">Rig destroyed</h2>
        <dl className="mt-6 space-y-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between font-ui text-xl">
              <dt className="text-slate-400">{k}</dt>
              <dd className="font-mono text-white">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 panel px-4 py-3 flex justify-between items-baseline">
          <span className="font-ui text-xl text-slate-300">Cores earned</span>
          <span className="font-display font-bold text-2xl text-violet-core">+{s.cores}</span>
        </div>
        <p className="font-mono text-sm text-slate-400 mt-2">
          {save.cores} cores banked. Spend them on rig upgrades from the main menu.
        </p>
        <div className="flex gap-3 mt-6">
          <button className="btn btn-primary flex-1" onClick={onRedeploy} autoFocus>Redeploy</button>
          <button className="btn flex-1" onClick={onMenu}>Rig upgrades</button>
        </div>
      </div>
    </div>
  );
}
