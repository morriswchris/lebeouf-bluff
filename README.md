# Lebeouf's Bluff — Scorekeeper

An offline-first PWA. No server, no accounts, no internet needed to play. All state lives in `localStorage` on the device.

## Files

Everything the site is built from lives in `src/`. `npm run build` bundles it
into `dist/`, which is the only thing published — `dist/` is git-ignored and
regenerated, never edited by hand.

```
src/
  app.jsx      the whole app, React source (see "Editing the code" below)
  index.html   app shell + PWA meta tags + service worker registration
  styles.css   styling
  manifest.json
  sw.js        service worker — offline caching + update detection
  icons/       standard, maskable (Android adaptive), and Apple touch
  favicon.ico  browser tab icon
  favicon.png
build.mjs      esbuild bundle of app.jsx + copy of the static shell -> dist/
make_icons.py  regenerates every icon into src/icons/ (needs Pillow)
```

## Putting it online

iOS **requires HTTPS** for install-to-home-screen. Opening the files locally
won't work. Build first (`npm install && npm run build`), then serve `dist/`.

- **GitHub Pages** — already wired up: every push to `main` runs
  `.github/workflows/pages.yml`, which builds `src/` and publishes `dist/`.
  (Set Settings → Pages → Source to "GitHub Actions" once.)
- **Netlify Drop** — drag the built `dist/` folder onto https://app.netlify.com/drop.
- **Vercel** — `vercel deploy dist` after building.

## Installing on a phone

**iOS (Safari — must be Safari, not Chrome):** open the URL → Share → Add to Home Screen. Launches fullscreen with no browser chrome.

**Android (Chrome):** open the URL → menu → Install app / Add to Home screen.

## The two menus

- **☰ on the left** — this game: past games, and the seven hands. Tap any played hand to fix its scores.
- **? on the right** — the rules. Always available, even before a game starts.

## Offline behaviour

After the first visit the app is fully offline. It opens with no connection, plays through all seven hands, saves games, and keeps history — none of that touches the network.

The only thing internet is used for is **checking whether a new version exists**. That check happens on launch and hourly while the app is open, and it fails silently when offline.

When a new version is found it downloads in the background and a gold **"New version ready"** bar appears at the top. Nothing changes until you tap **Update** — a game in progress is never swapped out from under you. You can dismiss the bar and update later; it'll reappear next launch.

## Using it

1. **Setup** — add 2–12 players in turn order. The setup screen shows how many decks to shuffle in (one per three players).
2. **Each hand** — the contract is drawn as card pips at the top, standings below. Use the −/+ nickel steppers when someone buys a discard.
3. **End of hand** — tap "Hand's over", pick who went out (they score 0), enter everyone else's leftover card total. Point values are shown on that screen.
4. **After hand 7** — both winners are shown: whoever went out first on the 1 of 6 takes the pot, and lowest total takes the points. Plus a hand-by-hand breakdown.

Close the app mid-game and it resumes exactly where you left off.

## Past games

The left menu has **Past games** — the last five, newest first.

A game is archived when it finishes, and also when you start a new one part-way through (so hitting ↻ mid-game doesn't lose it). Each entry shows the date, final standings, and who won. Unfinished games get a **"Pick up where this left off"** button that drops you back in at the right hand with all totals intact.

Only five are kept; the oldest falls off. You can delete any of them with the × on the card.

## Fixing a past hand

Open the left menu (☰). Any hand that's been played shows who went out and an **EDIT** tag — tap it. You can change:

- the point values
- who went out
- how many nickels each player spent that hand

Save, and every total after that hand recalculates automatically. There's also a **Delete this hand** button; deleting shifts later hands up and puts you back in play if the game had already finished.

Editing the last hand can change who wins the pot, and that updates too.

## Troubleshooting

**Blank screen?** Fixed in v3 — saved games from older builds now migrate automatically. If you're still stuck, delete the home-screen icon and re-add it.

**Update never appears?** The check needs internet. Open the app once with a connection and give it a few seconds.

**Wrong icon on the home screen?** Android wraps an icon in a white circle when the maskable version isn't usable. Fixed in v7 — the maskable icons now keep all artwork inside the required center-80% safe zone. Android caches home-screen icons aggressively, so **remove the shortcut and re-add it** after updating; refreshing the page won't change it.

## What it does and doesn't do

It's a scorekeeper, not a referee. It tracks totals, nickels, and hand progression. It does **not** validate that a book is legal or check wild-card ratios — you play the cards, it does the arithmetic.

Nickels are a manual counter, since only you can see who called BUY first. The pot is however many nickels have been spent in total; the app tracks each player's remaining count.

## How state works

Each completed hand is stored as a record — scores, who went out, nickels spent. Running totals and nickel counts are **derived** from those records rather than accumulated. That's what makes editing any past hand safe: change one record and everything downstream recomputes from scratch, with no drift.

Saves from older versions are migrated on load, so upgrading never loses a game.

Two localStorage keys: `lebeoufs-bluff-v1` (current game) and `lebeoufs-bluff-history-v1` (last five).

## Editing the code

All the source lives in `src/`. The built site in `dist/` is generated (and
git-ignored) — never edit it directly. Edit files under `src/`, then rebuild:

```bash
npm install      # once, to pull react, react-dom, and esbuild
npm run build    # builds src/ -> dist/
```

`npm run watch` rebuilds the bundle on save while you work. Deploys to GitHub
Pages run `npm run build` automatically (see `.github/workflows/pages.yml`).

**Then bump `VERSION` in `src/sw.js`** (currently `"v7"`). That single string is what triggers the update banner on everyone's phone — if you don't change it, installed devices keep serving the old build.

Common tweaks, all near the top of `src/app.jsx`: `HANDS` (the seven contracts), `START_NICKELS`, `MAX_PLAYERS`, `HISTORY_MAX` (how many past games to keep).
