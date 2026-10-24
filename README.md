# DEADFRONT // Apex Cyber Protocol

A fast-paced 3D sci-fi survival shooter built with React, Three.js and Vite. Procedural animated mechs, tiered waves with a Titan boss every fifth wave, a buyable arsenal, tactical power-ups and rogue-lite progression.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build in dist/
```

No API keys or assets are required. Everything (models, audio, textures) is generated in code.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse / Left click | Aim / fire |
| Shift | Thruster dash (brief invulnerability, costs energy) |
| Space | High jump (dodges melee and slams, costs energy) |
| R | Reload |
| 1 to 6 | Switch weapon |
| B | Armory (pauses the fight) |
| P / Esc | Pause |
| M | Mute |
| Q | Toggle bloom (turn off on slow GPUs) |

## How it plays

- **Waves** scale in size and enemy mix. Every fifth wave brings Titan Prime, who fires volleys, radial bolt rings and summons Skitters.
- **Enemies:** Skitter (fast rusher), Trooper (ranged), Hunter (burst-fire spider), Brute (telegraphed ground slam, jump to dodge), Titan Prime (boss).
- **Armory:** buy 5 more weapons, tune each up to 4 times, restock ammo, and buy hull, shield and energy upgrades.
- **Power-ups** drop from kills: Repair, Ammo, Overcharge (2x damage), Haste, Aegis (invulnerable), Nova (area blast).
- **Rogue-lite:** when your rig dies you earn cores based on wave reached and bosses killed. Spend them on permanent upgrades from the main menu. Progress is stored in `localStorage`.

## Project layout

```
src/
  main.tsx, index.css, App.tsx    entry, theme, screen routing
  game/config.ts                  weapons, enemies, upgrades, shared types
  game/Engine.ts                  scene, player, AI, waves, projectiles, fx
  game/mechs.ts                   procedural biped + spider mech builders
  game/audio.ts                   WebAudio synth sound effects
  game/meta.ts                    persistent rig upgrades
  ui/                             HUD, armory, menu / pause / game-over screens
```

Balance numbers live in `src/game/config.ts`.
