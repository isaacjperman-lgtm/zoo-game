# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-based 3D zoo simulator (Three.js + Vite + TypeScript) made for Isaac's friends Levi and Micah. The current version is a generic base. Micah will request specific features later, so keep the code easy to extend and data-driven.

## Commands

- `npm run dev` starts the Vite dev server.
- `npm run build` runs `tsc --noEmit` and then `vite build`.
- `npx tsc --noEmit` type-checks only.
- There is no test runner or linter configured.

## Architecture

- `src/game.ts` is all simulation state and rules, with no DOM code. The `Game` class owns the tile grid (`N`×`N` `Uint8Array` of `T_GRASS`/`T_PATH`/`T_PEN`), money, the day clock, and the animal, visitor and keeper lists. It also holds BFS pathfinding over path tiles, save/load (localStorage key `zoo-save`), and per-frame `update(dt)`. `Game.root` is a `THREE.Group` that entity meshes are added to.
- `src/main.ts` is rendering, input and UI. It sets up the renderer, lighting and day/night cycle (driven by `game.time`), instanced tile and fence meshes, the HUD and tool bar, and pointer handling. It talks to `Game` through methods (`paint`, `buyAnimal`, `hireKeeper`, `feedAt`) and callbacks (`onTilesChanged`, `onMessage`). When tiles change it rebuilds the instanced meshes with `rebuildTiles()`.
- `src/entities/models.ts` builds the procedural low-poly animal and person meshes and `animateRig` (leg/arm swing). `src/world/environment.ts` builds the sky dome, trees, perimeter fence, gate and clouds. `src/ui/hud.ts` is the DOM HUD (styles in `src/style.css`), and `src/ui/thumbs.ts` renders the shop icons from the 3D models.
- `src/data/species.ts` is the data-driven animal list. Adding a `Species` entry automatically adds a shop button, a procedural model (built in `animalModel`) and its hunger and space needs.

## Gameplay loop to keep in mind

- Visitors only spawn if at least one animal's pen borders a path tile that is reachable from the entrance (`viewingSpots`). They pay admission at spawn and tip based on nearby animals' happiness.
- Animal happiness is a function of hunger and of pen size per animal of the same species (`Species.space`).
- Removing a pen tile under an animal sells it for half price (`revalidateAnimals`).
- Keepers walk straight to the hungriest animal and feed it. They do not use path tiles.

## Not yet implemented

Rapier physics. `src/world/` and `src/build/` hold only the environment so far, and game rules still live in `game.ts`. New species with a unique look need a branch in `quadruped()` in `models.ts`.
