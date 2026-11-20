# Zoo Keeper

A 3D zoo simulator (Three.js + Vite + TypeScript). Play it in the browser or as a desktop app. See
[CHANGELOG.md](CHANGELOG.md) for everything in the current version (1.0.0).

## Play

- **In the browser:** the latest push to `main` is deployed to GitHub Pages.
- **Linux:** download `Zoo-Keeper-1.0.0-linux-x64.AppImage`, make it executable (`chmod +x`), and run it.
- **Windows:** download `Zoo-Keeper-1.0.0-win-x64.exe` and run it. It is portable, so nothing is installed. The build is
  unsigned, so Windows may warn you the first time; choose "More info" and "Run anyway".

Both desktop builds are attached to the **1.0.0 release** on the repository's Releases page. They are too large to
store in the repository itself (GitHub rejects files over 100 MB), so building them yourself puts them in `release/`,
which git ignores. Photos you take in the desktop app are saved to your Pictures folder, in a "Zoo Keeper" folder.
F11 toggles full screen.

### Controls

| Action             | Control                              |
| ------------------ | ------------------------------------ |
| Orbit / zoom / pan | Right-drag / scroll / WASD           |
| Build, buy, place  | Pick a shop item, then click the map |
| Inspect an animal  | Right-click it (keepers too)         |
| Pause / speed      | Space / 1, 2, 3                      |
| Photo mode         | P or the Photo button (Esc to leave) |

## Run from source

```
npm install
npm run dev        # play at the printed localhost link
npm run build      # type-check + production build into dist/
npm run format     # prettier
npm run app        # build, then open it in a desktop window (Electron)
npm run dist       # build the Linux AppImage and the Windows .exe into release/
```

`npm run dist:linux` and `npm run dist:win` build one of them. The Windows build from Linux needs Wine installed.

## Where things live

| Path                       | What it is                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `src/config.ts`            | Balance numbers (prices, wages, day length) and grid helpers                        |
| `src/data/species.ts`      | Animal list. Add an entry to add an animal                                          |
| `src/game.ts`              | Simulation: building, pathfinding, economy, save/load                               |
| `src/entities/`            | `animal.ts`, `people.ts` (visitors, keepers), `models.ts` (3D meshes and animation) |
| `src/world/environment.ts` | Sky, trees, fence, gate, clouds                                                     |
| `src/ui/`                  | `hud.ts` (DOM interface), `thumbs.ts` (shop icons); styles in `src/style.css`       |
| `src/main.ts`              | Renderer, lighting, input, main loop                                                |
| `electron/main.cjs`        | The desktop window (Electron) that wraps the built game                             |
| `electron-builder.yml`     | How the AppImage and the Windows .exe are packaged                                  |

## Adding things

- **New animal:** add to `src/data/species.ts`. If it needs a unique look, add a branch in `quadruped()` in `src/entities/models.ts`.
- **Balance tweak:** edit `src/config.ts`.
- **New tool or shop item:** add it to `tabsDef` in `src/ui/hud.ts` and handle its id in `use()` in `src/main.ts`.

## About this project

This game was built with [Claude Code](https://claude.com/claude-code), an AI coding assistant, working from direction by its author. Features are added as they are requested.

What that means in practice:

- **The code, 3D models and interface were AI-written.** Every animal, person, tree and menu is generated in code. There are no hand-made art assets or imported models.
- **It has had limited playtesting.** The project type-checks and builds, and the AI checked it with simulations and a headless browser, but that is no substitute for real play, so visual problems and gameplay bugs are still likely. Please report anything that looks or feels off.
- **Features are added as they are requested.** Version 1.0.0 gathers everything built so far; see the changelog.
- **Balance is guesswork.** Prices, wages, hunger rates and visitor rates in `src/config.ts` and `src/data/species.ts` were picked without tuning against real play.
