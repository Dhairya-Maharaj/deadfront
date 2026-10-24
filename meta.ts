import { META_DEFS, type MetaId, type MetaMods, type RunSummary } from './config';

export interface MetaSave {
  cores: number;
  levels: Record<MetaId, number>;
  bestWave: number;
  bestScore: number;
  runs: number;
}

const KEY = 'deadfront.save.v1';

const fresh = (): MetaSave => ({
  cores: 0,
  levels: { frame: 0, tuning: 0, salvage: 0, coldstart: 0, capacitor: 0 },
  bestWave: 0,
  bestScore: 0,
  runs: 0,
});

export function loadSave(): MetaSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw) as Partial<MetaSave>;
    const base = fresh();
    return {
      cores: Number(d.cores) || 0,
      levels: { ...base.levels, ...(d.levels ?? {}) },
      bestWave: Number(d.bestWave) || 0,
      bestScore: Number(d.bestScore) || 0,
      runs: Number(d.runs) || 0,
    };
  } catch {
    return fresh();
  }
}

export function persist(s: MetaSave) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function applyRun(s: MetaSave, r: RunSummary): MetaSave {
  return {
    ...s,
    cores: s.cores + r.cores,
    bestWave: Math.max(s.bestWave, r.wave),
    bestScore: Math.max(s.bestScore, r.score),
    runs: s.runs + 1,
  };
}

export const metaCost = (id: MetaId, level: number) => {
  const d = META_DEFS.find((m) => m.id === id)!;
  return d.base + level * d.step;
};

export function buyMeta(s: MetaSave, id: MetaId): MetaSave | null {
  const d = META_DEFS.find((m) => m.id === id)!;
  const lv = s.levels[id];
  const cost = metaCost(id, lv);
  if (lv >= d.max || s.cores < cost) return null;
  return { ...s, cores: s.cores - cost, levels: { ...s.levels, [id]: lv + 1 } };
}

export function modsFrom(s: MetaSave): MetaMods {
  const l = s.levels;
  return {
    hp: l.frame * 12,
    dmg: 1 + l.tuning * 0.05,
    credit: 1 + l.salvage * 0.08,
    start: l.coldstart * 150,
    energy: l.capacitor * 15,
  };
}
