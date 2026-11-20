# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zoo Keeper: a browser-based 3D zoo simulator (Three.js + Vite + TypeScript) made for a couple of friends. The current version is a generic base. Specific features will be requested later, so keep the code easy to extend and data-driven. The project is meant to stay anonymous: don't put personal names or emails in files or commits (git is configured with an anonymous identity for this repo).

## Commands

- `npm run dev` starts the Vite dev server (http://127.0.0.1:5173/). In dev only, `window.game` exposes the `Game` instance in the browser console, e.g. `game.money = 5000`.
- `npm run build` runs `tsc --noEmit` and then `vite build`. `npm run typecheck` type-checks only.
- `npm run format` runs Prettier over the repo (no semicolons, single quotes, width 110). Run it before committing.
- There is no test runner or linter. To check behavior, drive `window.game` from a headless browser (e.g. Playwright with `--use-angle=swiftshader` for WebGL) and step `game.update(0.1)` in a loop.
- Pushing to `main` redeploys the site to GitHub Pages via `.github/workflows/deploy.yml`. `vite.config.ts` uses `base: './'` so the build works from a subpath.

## Architecture

The simulation (`Game`) has no DOM code. `main.ts` and `ui/` read its state each frame and call its methods.

- `src/config.ts`: balance numbers (prices, wages, `DAY_LENGTH`), tile types (`T_GRASS`/`T_PATH`/`T_PEN`/`T_BOOTH`), the fixed `ENTRANCE`/`DESK`/`BOOTH` tiles (`isFixed`), and grid helpers (`toWorld`, `toTile`, `idx`).
- `src/game.ts`: the `Game` class. It owns the tile grid, money, day clock, animals, visitors, keepers, the ticket `queue`, `props` (buildings and decorations keyed by tile index), goal progress and save/load (localStorage key `zoo-save`). `update(dt)` runs the AI modules, then collisions, then goal checks. `Game.root` is the `THREE.Group` that entity meshes are added to. Callbacks `onTilesChanged`, `onMessage`, `onIncome` and `onSound` are how it talks to the UI.
- `src/ai/`: per-entity behavior. `animalAI.ts` (hunger, happiness, sleep, herding, predators), `keeperAI.ts` (job state machine: pick animal, walk the paths, step in, feed, step out) and `visitorAI.ts` (arrive, queue, register, tour, errands, leave).
- `src/entities/`: `animal.ts`, `people.ts` (visitors and keepers share a `Walker` base), `models.ts` (procedural low-poly meshes and `animateRig`) and `props.ts` (building and decoration models).
- `src/world/`: `pathfinding.ts` (BFS over path tiles), `collision.ts` (pushes overlapping people and animals apart, never onto ground they don't belong on) and `environment.ts` (sky, trees, perimeter fence, gate, ticket booth, clouds).
- `src/data/`: `species.ts` and `buildings.ts`. These are the lists to edit to add content. `src/goals.ts` is the ordered progression list.
- `src/main.ts`: renderer, lighting and day/night cycle, instanced terrain, tool input and the main loop.
- `src/ui/`: `hud.ts` (DOM HUD, shop tabs, goal panel, floating text), `thumbs.ts` (renders shop icons from the 3D models), `sound.ts` (synthesized effects, no audio files). Styles are in `src/style.css`.

## Adding content

- **New animal:** add a `Species` entry (flags: `social`, `predator`, `sleepiness`). A unique look needs a size entry in the `dims` table and a branch in `quadruped()` in `models.ts`.
- **New building or decoration:** add to `BUILDINGS`, add a case in `propModel()` in `props.ts`, and for a new service also handle its id in `finishErrand` and `planNext` in `visitorAI.ts`.
- **New shop tab or tool:** edit `tabsDef` in `hud.ts` and handle the tool id in `use()` in `main.ts`.
- **Goal:** add to `GOALS` in `goals.ts`.

## Gameplay rules to keep in mind

- Guests only spawn if an animal is visible from a path connected to the entrance. They queue at the desk, pay `ADMISSION`, tour enclosures (favorite species, unseen and happy animals preferred), use food stands and restrooms when needed, browse the gift shop on the way out, then leave. Long waits make them leave angry. Their mood on leaving feeds `Game.rating` (30%).
- Income goes through `Game.earn` so it triggers the floating "+$" text and coin sound.
- Animal happiness drops with hunger, a cramped pen (`Species.space`), loneliness (social species) and a predator in the pen. Animals sleep at night and nap by day.
- Buildings go on open grass, face the nearest path, and must be cleared before building a path or pen there. Clearing refunds half. Removing a pen tile under an animal sells it for half price.
- Enclosures get a gate automatically (`Game.autoGates`) on the pen tile nearest the entrance by path. Keepers only enter and leave through gates, and the gate doors open only while a keeper is near. There is no gate tool.
- Prices are player-set (`Game.ticketPrice`, `foodPrice`, `giftPrice`, edited in the Prices panel). Guests compare them with `Game.fair`, which grows with the rating: dear tickets lower turnout (`Game.demand`) and mood, steep food or souvenir prices make guests refuse and complain, cheap ones please them. Complaints become review tags in `ai/reviews.ts`.
- The zoo has a name (`Game.zooName`), chosen on the title screen of a new game and editable in the top bar. It is painted on the entrance sign via `env.setSign`.
- Rare events (`Game.rollEvents`, started with `game.startEvent('school' | 'critic')`): a school trip (teacher plus kids who pay half and follow the teacher) and a zoo critic whose verdict counts triple toward guest mood. Special visitors are `Visitor.kind`.
- Clicking a tool-less action (like Hire) deselects the current tool, and Esc deselects too.

## Not yet implemented

Rapier physics and a test suite.
