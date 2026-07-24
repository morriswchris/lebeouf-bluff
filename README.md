# Lebeouf's Bluff — Scorekeeper

An offline-first PWA. No server, no accounts, no internet needed to play. All state lives in `localStorage` on the device.

## Files

```
index.html   app shell + PWA meta tags + service worker registration
app.js       the whole app, React bundled in (~159 KB, no CDN)
styles.css   styling
manifest.json
sw.js        service worker — offline caching + update detection
icons/       standard, maskable (Android adaptive), and Apple touch
favicon.ico  browser tab icon
make_icons.py  regenerates every icon (needs Pillow)
src/app.jsx  readable source (see "Editing the code" below)
```

## Putting it online

iOS **requires HTTPS** for install-to-home-screen. Opening `index.html` as a local file won't work. Any static host does the job free:

- **Netlify Drop** — drag this folder onto https://app.netlify.com/drop. Fastest option.
- **GitHub Pages** — push the folder, enable Pages in repo settings. (Private repos need a paid plan.)
- **Vercel** — `vercel deploy` from inside the folder.

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

1. **Setup** — add 2–6 players in turn order.
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

`app.js` is the minified bundle — don't edit it directly. Edit `src/app.jsx`, then rebuild:

```bash
npm install react@18.2.0 react-dom@18.2.0 esbuild
npx esbuild src/app.jsx --bundle --minify --format=iife \
  --target=es2018 --define:process.env.NODE_ENV=\"production\" \
  --outfile=app.js
```

**Then bump `VERSION` in `sw.js`** (currently `"v5"`). That single string is what triggers the update banner on everyone's phone — if you don't change it, installed devices keep serving the old build.

Common tweaks, all near the top of `src/app.jsx`: `HANDS` (the seven contracts), `START_NICKELS`, `MAX_PLAYERS`, `HISTORY_MAX` (how many past games to keep).
