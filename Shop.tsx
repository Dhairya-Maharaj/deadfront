import {
  MAX_UPGRADE, SYSTEMS, WEAPONS, WEAPON_ORDER, systemCost, upgradeCost,
  type Snapshot, type SystemId,
} from './config';
import type { Engine } from './Engine';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function Shop({ snap, engine }: { snap: Snapshot; engine: Engine }) {
  const sysOwned: Record<SystemId, number> = {
    repair: 0, hull: snap.upgrades.hull, shield: snap.upgrades.shield, cap: snap.upgrades.cap,
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/65 flex items-center justify-center p-4 overflow-auto">
      <div className="panel w-full max-w-[1100px] p-6">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-display font-black text-3xl text-white">Armory</h2>
            <p className="font-ui text-slate-400 text-lg">The simulation is paused while you shop.</p>
          </div>
          <div className="text-right">
            <div className="font-display font-bold text-3xl text-amber-core">{snap.credits.toLocaleString()}</div>
            <div className="font-mono text-sm text-slate-400">credits</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
          <div className="space-y-2.5">
            {WEAPON_ORDER.map((id, i) => {
              const d = WEAPONS[id];
              const w = snap.weapons.find((x) => x.id === id)!;
              const col = hex(d.color);
              const upCost = upgradeCost(w.level);
              const finite = isFinite(d.reserveMax);
              return (
                <div key={id} className="panel p-3.5 flex gap-4 items-center" style={{ boxShadow: `inset 3px 0 0 ${col}` }}>
                  <div className="font-mono text-slate-500 w-4">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3">
                      <span className="font-display font-bold" style={{ color: col }}>{d.name}</span>
                      {w.owned && w.level > 0 && <span className="font-mono text-xs text-slate-400">Tuned x{w.level}</span>}
                    </div>
                    <div className="font-ui text-slate-300 text-[15px]">{d.tag}</div>
                    <div className="font-mono text-[12px] text-slate-500 mt-0.5">
                      Damage {d.damage}{d.pellets > 1 ? ` x ${d.pellets}` : ''} · {d.rate}/s · Mag {d.mag}
                      {w.owned && finite ? ` · Reserve ${w.reserve}/${d.reserveMax}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 items-stretch w-[150px]">
                    {!w.owned ? (
                      <button className="btn btn-sm btn-amber" disabled={snap.credits < d.cost} onClick={() => engine.buyWeapon(id)}>
                        Buy {d.cost}
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-sm" disabled={w.level >= MAX_UPGRADE || snap.credits < upCost} onClick={() => engine.upgradeWeapon(id)}>
                          {w.level >= MAX_UPGRADE ? 'Fully tuned' : `Tune +22% ${upCost}`}
                        </button>
                        {finite && (
                          <button className="btn btn-sm btn-amber" disabled={w.reserve >= d.reserveMax || snap.credits < d.packCost} onClick={() => engine.buyAmmo(id)}>
                            Ammo +{d.packSize} {d.packCost}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2.5">
            <h3 className="font-display font-bold text-lg text-cyan-core">Systems</h3>
            {(Object.keys(SYSTEMS) as SystemId[]).map((id) => {
              const s = SYSTEMS[id];
              const owned = sysOwned[id];
              const maxed = owned >= s.max;
              const cost = systemCost(id, owned);
              const full = id === 'repair' && snap.hp >= snap.maxHp && snap.shield >= snap.maxShield;
              return (
                <div key={id} className="panel p-3.5 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-display font-bold text-white text-[15px]">{s.name}</div>
                    <div className="font-ui text-slate-300 text-[15px]">{s.desc}</div>
                    {isFinite(s.max) && (
                      <div className="flex gap-1 mt-1.5">
                        {Array.from({ length: s.max }).map((_, k) => (
                          <span key={k} className="h-[5px] w-[14px]" style={{ background: k < owned ? '#3df2ff' : 'rgba(255,255,255,0.12)' }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="btn btn-sm btn-amber w-[110px]" disabled={maxed || full || snap.credits < cost} onClick={() => engine.buySystem(id)}>
                    {maxed ? 'Maxed' : full ? 'Full' : cost}
                  </button>
                </div>
              );
            })}
            <div className="font-mono text-[13px] text-slate-400 pt-2">
              Hull {Math.ceil(snap.hp)}/{snap.maxHp} · Shield {Math.ceil(snap.shield)}/{snap.maxShield}
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button className="btn btn-primary" onClick={() => engine.closeShop()}>Back to battle (B)</button>
        </div>
      </div>
    </div>
  );
}
