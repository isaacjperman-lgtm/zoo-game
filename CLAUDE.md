# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zoo Keeper: a browser-based 3D zoo simulator (Three.js + Vite + TypeScript) made for a couple of friends. The current version is a generic base. Specific features will be requested later, so keep the code easy to extend and data-driven. The project is meant to stay anonymous: don't put personal names or emails in files or commits (git is configured with an anonymous identity for this repo).

## Commands

- `npm run app` builds and opens the game in a desktop window (Electron, `electron/main.cjs`). `npm run dist` builds `release/Zoo-Keeper-<version>-linux-x64.AppImage` and `release/Zoo-Keeper-<version>-win-x64.exe` (Wine is needed for the Windows one when building on Linux). `release/` is gitignored: the files are over GitHub's 100 MB limit, so they are published as assets of a GitHub release (`gh release create vX.Y.Z`). Bump `version` in `package.json` and add a `CHANGELOG.md` entry for each release; the version shows on the title screen. Fonts are bundled (`src/fonts.css`), so the game works offline.
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
- Enclosures get a gate automatically (`Game.autoGates`) on the pen tile whose neighboring path is linked to the entrance and nearest to it. It re-runs whenever tiles change and on load, so a gate beside a not-yet-connected path moves once a better link exists (previously this left keepers stranded). Keepers only enter and leave through gates, and the gate doors open only while a keeper is near. There is no gate tool. The animal and keeper cards explain when a pen is unreachable (`Game.idleReason`).
- Prices are player-set (`Game.ticketPrice`, `foodPrice`, `giftPrice`, edited in the Prices panel). Guests compare them with `Game.fair`, which grows with the rating: dear tickets lower turnout (`Game.demand`) and mood, steep food or souvenir prices make guests refuse and complain, cheap ones please them. Complaints become review tags in `ai/reviews.ts`.
- The zoo has a name (`Game.zooName`), chosen on the title screen of a new game and editable in the top bar. It is painted on the entrance sign via `env.setSign`.
- Rare events (`Game.rollEvents`, started with `game.startEvent('school' | 'critic')`): a school trip (teacher plus kids who pay half and follow the teacher) and a zoo critic whose verdict counts triple toward guest mood. Special visitors are `Visitor.kind`.
- Weather (`Game.weather`: sunny, cloudy, rain) changes every 40-90 s of game time. Rain cuts turnout (`Game.weatherDemand`), makes guests hurry and cut visits short, and makes animals nap more; sun makes guests hungrier. `main.ts` draws the rain and greys the sky and light (`updateWeather`).
- Right-click a keeper (or animal) to open its card. Keeper upgrades live in `KEEPER_UPGRADES` in `config.ts` (`Game.upgradeKeeper`), raise the keeper's daily wage, and are saved. The Stats screen (`ui/statsPanel.ts`) charts `Game.stats`, which is sampled through the day and closed out each day.
- Breeding is player-ordered, not automatic: right-click an animal and press Breed (`Game.orderBreeding`). It needs a healthy, happy, fed adult partner and room in the pen (`Game.breedBlocker` explains why not). A keeper set to Breeding duty (`Keeper.duty`, keeper card) carries it out, charges the fee, and the baby arrives after a gestation time. Breeding keepers don't feed animals and earn 25% more. Rests, fees, resale (bred animals sell for 15%) and wage are in `BREEDING` in `config.ts`, tuned so breeding and selling never turns a profit. Babies (`Animal.age < ADULT_AGE`) are drawn smaller and delight guests.
- Sickness (`SICKNESS` in `config.ts`): only neglect makes animals ill: being left very hungry (>85) or very unhappy (<25: cramped, lonely or scared by a predator), plus a tiny base risk. Illness costs 20 happiness and passes by itself in about 3 minutes; with a Vet Clinic built the risk halves and keepers treat sick animals for `TREAT_COST` (picked before feeding jobs). Recovered animals are immune for a while. The animal card says why it fell ill.
- Shows: a Show Stage (`arena`) holds two shows a day (`Game.startShow`). Guests are sent there (`inviteToShow`) and pay `Game.showPrice`; the performer and spotlights animate in `main.ts`. Ice cream (`icecream`) sells on hot days (`Visitor.treat` grows fastest when sunny). Prices live in `Game.price` and are edited in the Prices panel.
- Photo mode (`ui/firstPerson.ts`): the Photo button or P leaves the overview camera and lets you walk at eye level (WASD, Shift to run, mouse look with pointer lock or drag, scroll to zoom the lens, click/Enter/F to take a photo, Esc to leave). You can't walk into pens (except through a gateway), the booth, buildings or past the perimeter fence. `takePhoto` in `main.ts` saves the canvas at full resolution as a PNG with the zoo's name.
- Performance: models are baked (`entities/bake.ts`): each model's plain-colored pieces are merged into a few vertex-colored meshes (a guest is 5 draw calls instead of 12) and identical animals and guests share one geometry via `fromTemplate` in `models.ts`. Collisions use a spatial grid. `Game` caches pen membership (`animalsIn`), prop counts and per-pen gate info; idle keepers think a few times a second. In `main.ts`, shadows refresh every other frame, far-away guests don't cast shadows, the render resolution adapts to the frame rate (`?fixedres` turns that off), tile rebuilds are coalesced to one per frame, and lamp lights are re-picked a few times a second. Measure with `window.renderer.info` in dev.
- Clicking a tool-less action (like Hire) deselects the current tool, and Esc deselects too.

## Not yet implemented

Rapier physics and a test suite.
