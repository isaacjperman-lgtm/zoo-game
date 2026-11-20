# Changelog

All notable changes to Zoo Keeper are listed here, newest first.

## [1.0.0] - 2026-11-20

The first full release. It collects everything built since the original generic base into one game, and adds desktop
builds (Linux AppImage and Windows portable `.exe`) alongside the web version.

### The base game (before 1.0)

- Build paths and enclosures, buy animals, hire keepers, and run a zoo on a 40 x 40 grid in 3D (Three.js).
- Guests arrive, queue at the ticket booth, tour enclosures, use food stands, restrooms and the gift shop, and leave.
- Seven animals (zebra, giraffe, elephant, lion, penguin, bear, hippo), a goal list, a day and night cycle, saving,
  synthesized sound effects, and a HUD with shop tabs.

### Animals

- **New animals:** monkey, panda, rhino, kangaroo and flamingo.
- **Hand-built models** for the panda, monkey, kangaroo (haunches, tail, ears, hopping walk) and flamingo (S-curved
  neck, hooked beak, webbed feet), and a unique rhino with two horns and hide folds.
- **Inspect an animal:** right-click it and the camera glides in and follows it. The card shows hunger, happiness,
  pen size, herd, time at the zoo and life stage, and lets you rename it, feed it, treat it or sell it.
- **Names:** every animal gets a default name. Names are saved.
- **Sell button** with a two-click confirmation, so you can't sell by accident.
- **Baby animals** that start small and grow up over a day and a half.
- **Sickness:** animals left hungry or very unhappy can fall ill. It passes on its own in about three minutes, and a
  vet clinic halves the risk and lets keepers treat them. The animal's card says why it got sick.

### Breeding (you decide, a keeper does the work)

- Order breeding from an animal's card. It needs a healthy, happy, fed adult partner and room in the pen, and the
  card tells you exactly what is missing.
- A keeper set to **Breeding duty** carries the order out, charges a fee (15% of the animal's price), and the baby
  arrives after a gestation time. The mother rests afterwards, and her partner rests for a shorter time.
- Breeders don't feed animals and earn 25% more, so breeding means hiring an extra keeper.
- Bred animals resell for only 15% of the price. Breeding and selling constantly loses money, so it can't be farmed.

### Keepers

- **Gates:** every enclosure gets a gate automatically, where it meets a path. Keepers go in and out through it, and
  the doors swing open only when a keeper is near. Gates move when you change your paths so keepers are never cut off.
- **Right-click a keeper** for their card: rename, see wage, animals fed and babies bred, and choose their duty.
- **Upgrades:** running shoes (faster) and animal training (feed earlier and faster), three levels each, with higher
  wages. Keepers can also be dismissed.
- The card explains why a keeper is idle, for example "can't reach the hungry animals" or "not enough money".
- Keepers recover on their own if they ever end up off the paths.

### Guests

- **Walking:** people keep to the right, sidestep each other head-on, and overtake from the left, so paths don't jam.
- **Tickets are paid the moment a guest reaches the booth**, not when they leave.
- **Reviews:** every guest tells you what they thought on the way out. A Reviews panel shows the overall guest
  opinion, the most common complaints and the latest comments.
- **Rare events:** a school trip (a teacher and 5 to 9 kids who pay half price and follow the teacher) and a zoo
  critic (hard to please, counts triple toward guest mood, and pays a bonus for a good review).

### Money

- **Prices you set:** ticket, food, gift shop, ice cream and show tickets. Guests compare them with a fair price that
  rises with your rating. Dear tickets bring fewer guests, steep snack prices make them refuse, and bargains please them.
- **Stats screen:** funds, rating, guests per day and income per day as charts, with hover readouts and a table view.

### Buildings and decoration

- **Show Stage:** two shows a day, with a performer, spotlights and its own ticket price. Guests flock to it.
- **Ice Cream Stand:** guests want ice cream far more on hot days.
- **Vet Clinic:** keepers treat sick animals for a small fee.
- **Fountain** with animated spray.
- **Lamps** shed warm light on the ground at night (and light up nearby animals, guests and trees), and have a
  little shade on top.

### The world

- **Weather:** sunny, cloudy and rain, with falling rain, a greyer sky and dimmer light. Rain halves the turnout, makes
  guests hurry and animals nap more. Sun makes guests hungrier.
- **Name your zoo** on the title screen of a new game. It is painted on the entrance sign and can be renamed from
  the top bar. The title screen also shows the version.
- **Goals:** more of them, covering keepers, animals, guests, shows, babies and the vet clinic.

### Photo mode

- The **Photo** button (or P) takes you into first person. Walk around at eye level (WASD, Shift to run), look with
  the mouse, scroll to zoom the lens, and take a photo with a click, Enter or F. Esc returns to the overview.
- Photos save as PNG files with the zoo's name and day in the corner, at full resolution. The simulation keeps running,
  so you can catch things as they happen.

### Desktop builds

- **Linux:** `Zoo-Keeper-1.0.0-linux-x64.AppImage`.
- **Windows:** `Zoo-Keeper-1.0.0-win-x64.exe` (portable, no install).
- Photos are saved to your Pictures folder, in a Zoo Keeper folder. F11 toggles full screen.
- The Nunito font is bundled, so the game looks the same offline.

### Performance

- Models are merged into a few meshes and identical ones share their geometry. A scene with 150 guests and 40 animals
  went from about 5,600 draw calls per frame to about 1,200.
- Far-away guests don't cast shadows, shadows refresh every other frame, and the resolution adapts to the frame rate.
- Collisions use a spatial grid, the simulation caches what it looks up often, and idle keepers check for work a few
  times a second instead of every frame.

### Fixed

- A crash when an animal's straight-line walk clipped the corner of a bent enclosure.
- Gates that were placed beside a path not yet linked to the entrance, which left keepers standing idle while the
  animals went hungry.
- A hidden stats panel that blocked zooming and right-clicks.
- Closed gates blending into the fence; they are now a cream gateway with gold caps.
- Keepers who ended up off the paths and never moved again.
- Kangaroos and flamingos showing the generic animal model.
- The Linux AppImage took nearly a minute to open (it looked like a dark or empty window) because it was packed with
  the heaviest compression, which made every file slow to unpack. It now opens in about a second. The file is larger
  as a result (about 122 MB).

### Known limits

- Balance is tuned by simulation, not by long play sessions, so prices, wages and rates may need adjusting.
- The simulation has no automated test suite yet.
- The Windows build is unsigned, so Windows may show a "protected your PC" warning the first time.
