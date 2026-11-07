# DEADFRONT

Fast 3D wave shooter. Plays in the browser on phones and desktop. No build step.

## Put it on GitHub Pages

1. In your repo, **delete everything old**: `package.json`, `vite.config.ts`, `tsconfig.json`, `.env.example`, `metadata.json`, `deadfront.zip`, and the old `index.html` and `README.md`.
2. Upload the contents of this folder so the repo root looks like:
   ```
   index.html  manifest.json  README.md  .nojekyll
   css/style.css
   js/world.js  js/data.js  js/audio.js  js/game.js  js/ui.js
   icons/icon.svg  icons/icon-192.png  icons/icon-512.png
   ```
   (GitHub web: Add file, Upload files, drag the folders in. Make sure `.nojekyll` goes up too.)
3. Repo **Settings, Pages, Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`. Save.
4. After a minute your game is at `https://<your-username>.github.io/<repo-name>/`.

Three.js loads from cdnjs, so players need an internet connection.

## Phone

- Open the link in landscape. Left thumb: move. Right thumb drag: look. Buttons: FIRE, JUMP, DASH, RELOAD, SWAP.
- iPhone: Share, Add to Home Screen, for true full screen. Android: the Full screen button works.

## Desktop

WASD move, mouse look, click fire, Space jump, Shift dash, R reload, Q or mouse wheel swap, Esc pause.

## What is in it

- Walkable ramps, solid platforms, crates you can jump onto, launch pads, lava.
- Six weapons: Sparker, Chomper, Stinger, Thumper, Lancer, Zapper. Pick two, plus a gear piece, in the Loadout tab. Three save slots.
- Perks after every wave, pickups, combo score, boss every 5th wave.

All code and assets here are original and generated at runtime (sound is synthesized, models are built from boxes).
