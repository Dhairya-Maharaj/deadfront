import { useEffect, useRef } from 'react';
import { WEAPONS, type Snapshot } from './config';

const KIND_COLORS = ['#ff7a1a', '#ff2a4d', '#ffd21a', '#ff5a1f', '#b26bff'];
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between font-mono text-[13px] leading-none mb-1 text-slate-300">
        <span>{label}</span>
        <span>{Math.ceil(value)} / {Math.round(max)}</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

export function Radar({ snap }: { snap: Snapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const S = c.width, R = S / 2, range = 48, sc = R / range;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(5,12,24,0.8)';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(61,242,255,0.14)';
    g.lineWidth = 1;
    for (const r of [R * 0.33, R * 0.66]) { g.beginPath(); g.arc(R, R, r, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(R, 0); g.lineTo(R, S); g.moveTo(0, R); g.lineTo(S, R); g.stroke();
    g.strokeStyle = 'rgba(61,242,255,0.55)';
    g.lineWidth = 2;
    g.strokeRect(R + (-58 - snap.px) * sc, R + (-58 - snap.pz) * sc, 116 * sc, 116 * sc);
    for (const e of snap.radar) {
      const x = R + (e.x - snap.px) * sc, y = R + (e.z - snap.pz) * sc;
      g.fillStyle = KIND_COLORS[e.k] ?? '#ff2a4d';
      const s = e.k === 4 ? 6 : e.k === 3 ? 4.5 : 3;
      g.fillRect(x - s / 2, y - s / 2, s, s);
    }
    g.fillStyle = '#3df2ff';
    g.beginPath();
    g.moveTo(R, R - 6); g.lineTo(R + 5, R + 5); g.lineTo(R - 5, R + 5);
    g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(61,242,255,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.stroke();
  }, [snap]);
  return <canvas ref={ref} width={160} height={160} className="w-[160px] h-[160px]" aria-label="Radar" />;
}

export function Crosshair({ snap }: { snap: Snapshot }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (ref.current) ref.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  const col = hex(WEAPONS[snap.current].color);
  return (
    <div ref={ref} className="fixed left-0 top-0 pointer-events-none z-30" style={{ transform: 'translate(-100px,-100px)' }}>
      <div className="absolute -translate-x-1/2 -translate-y-1/2 w-[34px] h-[34px] rounded-full" style={{ boxShadow: `0 0 0 1.5px ${col}aa` }} />
      <div className="absolute -translate-x-1/2 -translate-y-1/2 w-[4px] h-[4px] rounded-full" style={{ background: col }} />
      {snap.hitMarker > 0 && (
        <div key={snap.hitMarker} className="anim-hit absolute -translate-x-1/2 -translate-y-1/2 w-[26px] h-[26px]">
          <div className="absolute inset-[5px] rotate-45 border-2 border-white" />
        </div>
      )}
    </div>
  );
}

export function Hud({ snap }: { snap: Snapshot }) {
  const lowHp = snap.hp / snap.maxHp < 0.3;
  const wdef = WEAPONS[snap.current];
  const cur = snap.weapons.find((w) => w.id === snap.current)!;
  const boss = snap.boss;
  const buffs: { label: string; t: number; color: string }[] = [
    { label: 'Overcharge', t: snap.buffs.overcharge, color: '#ff4fd8' },
    { label: 'Haste', t: snap.buffs.haste, color: '#3df2ff' },
    { label: 'Aegis', t: snap.buffs.aegis, color: '#a678ff' },
  ].filter((b) => b.t > 0);

  return (
    <div className="fixed inset-0 pointer-events-none z-20">
      {snap.hurt > 0 && (
        <div key={snap.hurt} className="anim-hurt absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(255,40,70,0.55) 100%)' }} />
      )}
      {lowHp && (
        <div className="anim-lowhp absolute inset-0"
          style={{ boxShadow: 'inset 0 0 120px 20px rgba(255,40,70,0.55)' }} />
      )}

      {/* vitals */}
      <div className="absolute left-4 top-4 w-[280px] panel p-3.5 space-y-2.5">
        <Bar label="Hull" value={snap.hp} max={snap.maxHp} color={lowHp ? '#ff3d5a' : '#6dff9a'} />
        <Bar label="Shield" value={snap.shield} max={snap.maxShield} color="#3df2ff" />
        <Bar label="Energy" value={snap.energy} max={snap.maxEnergy} color="#ffb02e" />
      </div>

      {/* wave */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 text-center">
        <div className="panel px-8 py-2">
          <div className="font-display font-black text-2xl text-white">Wave {Math.max(1, snap.wave)}</div>
          <div className="font-mono text-[14px] text-slate-300">
            {snap.waveState === 'countdown'
              ? `Next wave in ${Math.ceil(snap.countdown)}s. B opens the armory.`
              : `${snap.left} hostiles remaining`}
          </div>
        </div>
        {boss && (
          <div className="panel panel-hot mt-2 px-4 py-2 w-[460px]">
            <div className="flex justify-between font-display text-[13px] text-hot mb-1">
              <span>{boss.name}</span><span>{Math.ceil((boss.hp / boss.max) * 100)}%</span>
            </div>
            <div className="bar-track" style={{ height: 12 }}>
              <div className="bar-fill" style={{ width: `${Math.max(0, boss.hp / boss.max) * 100}%`, background: 'linear-gradient(90deg,#ff3d5a,#b26bff)' }} />
            </div>
          </div>
        )}
      </div>

      {/* economy */}
      <div className="absolute right-4 top-4 panel px-5 py-3 text-right min-w-[190px]">
        <div className="font-display font-bold text-2xl text-amber-core leading-none">{snap.credits.toLocaleString()}</div>
        <div className="font-mono text-[13px] text-slate-400 mb-1.5">credits</div>
        <div className="font-mono text-[14px] text-slate-200">Score {snap.score.toLocaleString()}</div>
        <div className="font-mono text-[14px] text-slate-200">Kills {snap.kills}</div>
        <div className="font-mono text-[11px] text-slate-500 mt-1">{snap.fps} fps</div>
      </div>

      {/* radar */}
      <div className="absolute left-4 bottom-4"><Radar snap={snap} /></div>

      {/* banner + toast */}
      {snap.banner && (
        <div key={snap.banner.id} className="anim-banner absolute left-1/2 top-[24%] -translate-x-1/2 text-center">
          <div className="font-display font-black text-5xl md:text-6xl text-white" style={{ textShadow: '0 0 28px rgba(61,242,255,0.8)' }}>
            {snap.banner.text}
          </div>
          <div className="font-ui font-semibold text-xl text-cyan-core mt-1">{snap.banner.sub}</div>
        </div>
      )}
      {snap.toast && (
        <div key={snap.toast.id} className="anim-toast absolute left-1/2 top-[40%] -translate-x-1/2 panel px-5 py-2 font-ui font-bold text-lg"
          style={{ color: hex(snap.toast.color) }}>
          {snap.toast.text}
        </div>
      )}

      {/* weapons */}
      <div className="absolute left-1/2 bottom-4 -translate-x-1/2 flex flex-col items-center gap-2">
        <div className="panel px-5 py-2 min-w-[300px] text-center">
          <div className="flex items-baseline justify-center gap-3">
            <span className="font-display font-bold text-sm" style={{ color: hex(wdef.color) }}>{wdef.name}</span>
            <span className="font-display font-black text-3xl text-white">{cur.mag}</span>
            <span className="font-mono text-lg text-slate-400">/ {isFinite(cur.reserve) ? cur.reserve : '∞'}</span>
          </div>
          {snap.reload >= 0 ? (
            <div className="bar-track mt-1" style={{ height: 6 }}>
              <div className="bar-fill" style={{ width: `${snap.reload * 100}%`, background: '#ffb02e', transition: 'none' }} />
            </div>
          ) : cur.mag === 0 && cur.reserve === 0 ? (
            <div className="font-mono text-sm text-hot mt-1">Out of ammo. Switch weapon or visit the armory.</div>
          ) : (
            <div className="font-mono text-[12px] text-slate-500 mt-1">R to reload</div>
          )}
        </div>
        <div className="flex gap-1.5">
          {snap.weapons.map((w, i) => {
            const d = WEAPONS[w.id];
            const active = w.id === snap.current;
            return (
              <div key={w.id} className="panel w-[74px] px-1.5 py-1.5 text-center"
                style={{ opacity: w.owned ? 1 : 0.35, boxShadow: active ? `inset 0 0 0 2px ${hex(d.color)}` : undefined }}>
                <div className="font-mono text-[12px] text-slate-400 leading-none">{i + 1}</div>
                <div className="font-ui font-bold text-[13px] leading-tight truncate" style={{ color: w.owned ? hex(d.color) : '#94a3b8' }}>
                  {w.owned ? d.name.split(' ')[0] : 'Locked'}
                </div>
                <div className="flex justify-center gap-[2px] mt-1 h-[4px]">
                  {Array.from({ length: w.level }).map((_, k) => (
                    <span key={k} className="w-[8px] h-[4px]" style={{ background: hex(d.color) }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* buffs + hints */}
      <div className="absolute right-4 bottom-4 space-y-1.5 text-right">
        {buffs.map((b) => (
          <div key={b.label} className="panel px-3 py-1.5 font-display font-bold text-sm min-w-[170px]" style={{ color: b.color }}>
            {b.label} <span className="font-mono text-white ml-2">{b.t.toFixed(1)}s</span>
          </div>
        ))}
        <div className="font-mono text-[12px] text-slate-500 leading-relaxed pt-1">
          Shift dash · Space jump<br />B armory · P pause · M mute · Q bloom
        </div>
      </div>
    </div>
  );
}
