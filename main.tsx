import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Show any uncaught error on screen instead of leaving a black page.
function showFatal(msg: string) {
  if (document.getElementById('fatal')) return;
  const d = document.createElement('pre');
  d.id = 'fatal';
  d.style.cssText =
    'position:fixed;inset:0;z-index:99;margin:0;padding:24px;background:#050811;color:#ff8da0;' +
    'font:13px/1.5 monospace;white-space:pre-wrap;overflow:auto;user-select:text';
  d.textContent = 'DEADFRONT crashed:\n\n' + msg;
  document.body.appendChild(d);
}
window.addEventListener('error', (e) => showFatal(e.error?.stack ?? e.message));
window.addEventListener('unhandledrejection', (e) => showFatal(String(e.reason?.stack ?? e.reason)));

createRoot(document.getElementById('root')!).render(<App />);
