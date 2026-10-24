import { useEffect, useRef, useState } from 'react';
import { Engine } from './Engine';
import type { MetaId, Snapshot } from './config';
import { applyRun, buyMeta, loadSave, modsFrom, persist, type MetaSave } from './meta';
import { Crosshair, Hud } from './Hud';
import { GameOver, Menu, PauseScreen } from './Screens';
import { Shop } from './Shop';

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [save, setSave] = useState<MetaSave>(() => loadSave());
  const saveRef = useRef(save);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current) return;
    let e: Engine;
    try {
      e = new Engine(host.current, {
        onSnapshot: setSnap,
        onRunEnd: (summary) => {
          const next = applyRun(saveRef.current, summary);
          saveRef.current = next;
          persist(next);
          setSave(next);
        },
        onError: setError,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
      return;
    }
    engineRef.current = e;
    setEngine(e);
    return () => {
      e.dispose();
      engineRef.current = null;
    };
  }, []);

  const deploy = () => engineRef.current?.start(modsFrom(saveRef.current));
  const buy = (id: MetaId) => {
    const next = buyMeta(saveRef.current, id);
    if (!next) return;
    saveRef.current = next;
    persist(next);
    setSave(next);
  };

  const phase = snap?.phase ?? 'menu';
  const inGame = phase === 'playing' || phase === 'paused' || phase === 'shop';

  return (
    <div className="fixed inset-0 bg-void">
      <div ref={host} className="absolute inset-0" style={{ cursor: phase === 'playing' ? 'none' : 'default' }} />
      {error && (
        <div className="fixed inset-0 z-50 bg-void flex items-center justify-center p-6">
          <div className="panel panel-hot p-6 max-w-[760px] w-full">
            <h2 className="font-display font-black text-2xl text-hot">DEADFRONT failed to start</h2>
            <p className="font-ui text-lg text-slate-300 mt-2">
              Check that hardware acceleration / WebGL is enabled in your browser, then reload.
              If it still fails, send the message below.
            </p>
            <pre className="font-mono text-[12px] text-slate-300 mt-4 max-h-[300px] overflow-auto whitespace-pre-wrap select-text">{error}</pre>
          </div>
        </div>
      )}
      {!snap && !error && (
        <div className="absolute inset-0 flex items-center justify-center font-display text-cyan-core">Loading</div>
      )}
      {snap && engine && !error && (
        <>
          {inGame && <Hud snap={snap} />}
          {phase === 'playing' && <Crosshair snap={snap} />}
          {phase === 'menu' && <Menu save={save} onDeploy={deploy} onBuy={buy} />}
          {phase === 'shop' && <Shop snap={snap} engine={engine} />}
          {phase === 'paused' && (
            <PauseScreen
              snap={snap}
              onResume={() => engine.resume()}
              onQuit={() => engine.quitToMenu()}
              onMute={() => engine.setMuted(!snap.muted)}
              onBloom={() => engine.toggleBloom()}
            />
          )}
          {phase === 'dead' && (
            <GameOver snap={snap} save={save} onRedeploy={deploy} onMenu={() => engine.quitToMenu()} />
          )}
        </>
      )}
    </div>
  );
}
