# Zoo

A 3D zoo simulator that runs in the browser (Three.js + Vite + TypeScript).

## Run

```
npm install
npm run dev        # play at the printed localhost link
npm run build      # type-check + production build into dist/
npm run format     # prettier
```

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

## Adding things

- **New animal:** add to `src/data/species.ts`. If it needs a unique look, add a branch in `quadruped()` in `src/entities/models.ts`.
- **Balance tweak:** edit `src/config.ts`.
- **New tool or shop item:** add it to `tabsDef` in `src/ui/hud.ts` and handle its id in `use()` in `src/main.ts`.

## About this project

This game was built with [Claude Code](https://claude.com/claude-code), an AI coding assistant, working from direction by Isaac for his friends Levi and Micah. Features are added as Micah requests them.

What that means in practice:

- **The code, 3D models and interface were AI-written.** Every animal, person, tree and menu is generated in code. There are no hand-made art assets or imported models.
- **It has had limited playtesting.** The project type-checks and builds, but the AI could not run it in a browser to look at it, so visual problems and gameplay bugs are likely. Please report anything that looks or feels off.
- **The design is generic on purpose.** This is a base version. Specific features come later from Micah's requests.
- **Balance is guesswork.** Prices, wages, hunger rates and visitor rates in `src/config.ts` and `src/data/species.ts` were picked without tuning against real play.
