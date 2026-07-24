import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

const h = React.createElement;

/* ---------------- Game constants ---------------- */

const HANDS = [
  { sets: 1, size: 3 },
  { sets: 2, size: 3 },
  { sets: 1, size: 4 },
  { sets: 2, size: 4 },
  { sets: 1, size: 5 },
  { sets: 2, size: 5 },
  { sets: 1, size: 6 },
];

const START_NICKELS = 6;
const MAX_PLAYERS = 6;
const KEY = "lebeoufs-bluff-v1";

const handName = (i) => `${HANDS[i].sets} of ${HANDS[i].size}`;

const handDesc = (i) => {
  const { sets, size } = HANDS[i];
  const wilds = sets === 1 ? "1 wild card" : `${sets} wild cards, 1 per set`;
  return sets === 1
    ? `One set of ${size} of a kind. Up to ${wilds}.`
    : `Two separate sets of ${size} of a kind. Up to ${wilds}.`;
};

/* ---------------- Storage ---------------- */

/* Older versions stored running totals on each player and had no
   `hands` array. Rebuild hand records from the per-player history so
   existing games survive the upgrade instead of blanking the screen. */
const migrate = (g) => {
  if (!g || !Array.isArray(g.players)) return null;
  if (Array.isArray(g.hands)) {
    return { ...g, pendingNickels: g.pendingNickels || {} };
  }

  const count = g.players.reduce(
    (m, p) => Math.max(m, Array.isArray(p.history) ? p.history.length : 0),
    0
  );

  const hands = [];
  for (let i = 0; i < count; i++) {
    const scores = {};
    let wentOut = null;
    g.players.forEach((p) => {
      const v = Array.isArray(p.history) ? p.history[i] ?? 0 : 0;
      scores[p.id] = v;
      if (v === 0 && wentOut === null) wentOut = p.id;
    });
    hands.push({ scores, wentOut, nickels: {} });
  }

  // Old saves only kept a remaining count, so attribute all spending
  // to the first hand. It keeps totals right and stays editable.
  if (hands.length > 0) {
    const spent = {};
    g.players.forEach((p) => {
      const used = START_NICKELS - (typeof p.nickels === "number" ? p.nickels : START_NICKELS);
      if (used > 0) spent[p.id] = used;
    });
    hands[0].nickels = spent;
  }

  const done = hands.length >= HANDS.length;
  return {
    phase: done ? "final" : "round",
    handIndex: Math.min(hands.length, HANDS.length - 1),
    players: g.players.map((p) => ({ id: p.id, name: p.name })),
    hands: hands.slice(0, HANDS.length),
    pendingNickels: {},
  };
};

const load = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
};

const save = (state) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
};

const freshGame = (names) => ({
  phase: "round",
  handIndex: 0,
  players: names.map((name, i) => ({
    id: `${Date.now()}-${i}`,
    name,
  })),
  /* One record per completed hand — the source of truth.
     Totals and nickel counts are derived from these, so editing
     any past hand recomputes the whole game consistently. */
  hands: [],
  /* Nickels spent during the hand currently in progress. */
  pendingNickels: {},
});

/* ---------------- Derived values ---------------- */

/* Totals, nickels remaining, and per-hand history, computed from
   the hand records. Never stored — always recalculated so an edit
   to hand 2 correctly updates everything after it. */
function derive(game) {
  const byId = {};
  game.players.forEach((p) => {
    byId[p.id] = { ...p, total: 0, nickels: START_NICKELS, history: [] };
  });

  (game.hands || []).forEach((hand) => {
    if (!hand || !hand.scores) return;
    game.players.forEach((p) => {
      const pts = hand.scores[p.id] ?? 0;
      byId[p.id].total += pts;
      byId[p.id].history.push(pts);
      byId[p.id].nickels -= hand.nickels?.[p.id] ?? 0;
    });
  });

  // Nickels spent in the in-progress hand
  game.players.forEach((p) => {
    byId[p.id].nickels -= game.pendingNickels?.[p.id] ?? 0;
    byId[p.id].nickels = Math.max(0, byId[p.id].nickels);
  });

  return game.players.map((p) => byId[p.id]);
}

const potWinnerOf = (game) => {
  const hands = game.hands || [];
  return hands.length === HANDS.length ? hands[HANDS.length - 1]?.wentOut ?? null : null;
};

/* ---------------- Game history (last 5) ---------------- */

const HISTORY_KEY = "lebeoufs-bluff-history-v1";
const HISTORY_MAX = 5;

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const saveHistory = (list) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {}
};

/* Archive a game — finished or abandoned. Stores the full record so it
   can be reopened and continued later. Returns the new history list. */
const archiveGame = (game) => {
  if (!game || !Array.isArray(game.hands) || game.hands.length === 0) return loadHistory();

  const players = derive(game);
  const ranked = [...players].sort((a, b) => a.total - b.total);
  const complete = game.hands.length === HANDS.length;
  const potId = potWinnerOf(game);

  const entry = {
    id: `g${Date.now()}`,
    savedAt: Date.now(),
    complete,
    handsPlayed: game.hands.length,
    pointsWinner: ranked.length ? ranked[0].name : "",
    potWinner: complete && potId ? (players.find((p) => p.id === potId) || {}).name || "" : "",
    standings: ranked.map((p) => ({ name: p.name, total: p.total })),
    game: {
      players: game.players,
      hands: game.hands,
      pendingNickels: game.pendingNickels || {},
    },
  };

  const list = [entry, ...loadHistory().filter((e) => e.id !== entry.id)];
  saveHistory(list);
  return list.slice(0, HISTORY_MAX);
};

/* Rebuild a playable game from an archived entry. */
const restoreGame = (entry) => {
  const hands = entry.game.hands || [];
  return {
    phase: hands.length === HANDS.length ? "final" : "round",
    handIndex: Math.min(hands.length, HANDS.length - 1),
    players: entry.game.players,
    hands,
    pendingNickels: entry.game.pendingNickels || {},
  };
};

const relativeDay = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};


/* ---------------- Pip cluster (signature element) ---------------- */

function PipSet({ count }) {
  // Lay pips out in 2 columns like a real card face
  const cols = count <= 3 ? 1 : 2;
  const pips = Array.from({ length: count }, (_, i) =>
    h(
      "svg",
      { key: i, className: "pip", viewBox: "0 0 24 24", "aria-hidden": "true" },
      h("path", {
        d: "M12 21C12 21 3 14.5 3 8.8 3 5.6 5.4 3 8.4 3c1.5 0 2.8.7 3.6 1.8C12.8 3.7 14.1 3 15.6 3 18.6 3 21 5.6 21 8.8 21 14.5 12 21 12 21z",
      })
    )
  );
  return h(
    "div",
    {
      className: "pipset",
      style: { gridTemplateColumns: `repeat(${cols}, auto)` },
    },
    pips
  );
}

function Contract({ handIndex }) {
  const { sets, size } = HANDS[handIndex];
  return h(
    "div",
    { className: "contract" },
    h("div", { className: "label" }, `Hand ${handIndex + 1} of 7`),
    h("div", { className: "name" }, handName(handIndex)),
    h(
      "div",
      { className: "pips" },
      Array.from({ length: sets }, (_, i) => h(PipSet, { key: i, count: size }))
    ),
    h("div", { className: "desc" }, handDesc(handIndex))
  );
}

/* ---------------- Shared bits ---------------- */

function Nickels({ count }) {
  return h(
    "div",
    { className: "nickels" + (count === 0 ? " spent" : "") },
    h("span", { className: "coin" }),
    h("span", { className: "tnum" }, count)
  );
}

function Board({ players, showNickels = true }) {
  const ranked = [...players].sort((a, b) => a.total - b.total);
  const best = ranked.length ? ranked[0].total : 0;
  return h(
    "div",
    { className: "board" },
    ranked.map((p, i) =>
      h(
        "div",
        { key: p.id, className: "row" + (p.total === best ? " lead" : "") },
        h("div", { className: "rank tnum" }, i + 1),
        h("div", { className: "pname" }, p.name),
        showNickels ? h(Nickels, { count: p.nickels }) : null,
        h("div", { className: "score tnum" }, p.total)
      )
    )
  );
}

function Icon({ name }) {
  if (name === "help") {
    return h(
      "svg",
      { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
      h("path", { d: "M9.2 9a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.7-2.8 4.2" }),
      h("circle", { cx: "12", cy: "18", r: "1.1", fill: "currentColor", stroke: "none" })
    );
  }
  const paths = {
    menu: ["M3 6h18", "M3 12h18", "M3 18h18"],
    close: ["M6 6l12 12", "M18 6L6 18"],
  };
  return h(
    "svg",
    { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" },
    paths[name].map((d, i) => h("path", { key: i, d }))
  );
}

/* ---------------- Setup screen ---------------- */

function Setup({ onStart }) {
  const [names, setNames] = useState([]);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  const add = () => {
    const n = draft.trim();
    if (!n || names.length >= MAX_PLAYERS) return;
    setNames([...names, n]);
    setDraft("");
    inputRef.current && inputRef.current.focus();
  };

  const full = names.length >= MAX_PLAYERS;

  return h(
    "div",
    { className: "screen" },
    h("div", { className: "eyebrow" }, "New game"),
    h("h2", { style: { fontSize: "26px", marginBottom: "6px" } }, "Who's playing?"),
    h(
      "p",
      { className: "hint", style: { marginBottom: "18px" } },
      `Two to six players, seated in turn order. Everyone starts with ${START_NICKELS} nickels for the whole game.`
    ),

    h(
      "div",
      { className: "field" },
      h("input", {
        ref: inputRef,
        type: "text",
        value: draft,
        placeholder: full ? "Table is full" : "Player name",
        disabled: full,
        maxLength: 18,
        onChange: (e) => setDraft(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        },
      }),
      h(
        "button",
        {
          className: "btn btn-ghost",
          style: { width: "auto", padding: "13px 18px" },
          onClick: add,
          disabled: full || !draft.trim(),
        },
        "Add"
      )
    ),

    names.length === 0
      ? h("p", { className: "hint" }, "Add a player to get started.")
      : h(
          "div",
          { className: "plist" },
          names.map((n, i) =>
            h(
              "div",
              { key: i, className: "pitem" },
              h("span", { className: "seat tnum" }, i + 1),
              h("span", { className: "pname" }, n),
              h(
                "button",
                {
                  className: "x",
                  "aria-label": `Remove ${n}`,
                  onClick: () => setNames(names.filter((_, j) => j !== i)),
                },
                "\u00d7"
              )
            )
          )
        ),

    h(
      "button",
      {
        className: "btn btn-primary",
        style: { marginTop: "22px" },
        disabled: names.length < 2,
        onClick: () => onStart(names),
      },
      names.length < 2 ? "Add at least two players" : "Deal the first hand"
    )
  );
}

/* ---------------- Round start screen ---------------- */

function RoundStart({ game, onScore, onAdjustNickel }) {
  const players = derive(game);
  return h(
    "div",
    { className: "screen" },
    h(Contract, { handIndex: game.handIndex }),

    h(
      "div",
      { className: "panel" },
      h("h2", null, game.handIndex === 0 ? "Starting positions" : "Standings"),
      h(Board, { players })
    ),

    h(
      "div",
      { className: "panel" },
      h("h2", null, "Nickels"),
      h(
        "p",
        { className: "hint", style: { marginBottom: "12px" } },
        "Tap minus when someone buys a discard. These have to last all seven hands."
      ),
      players.map((p) =>
        h(
          "div",
          { key: p.id, className: "entry" },
          h("div", { className: "who" }, p.name),
          h(
            "div",
            { className: "stepper" },
            h(
              "button",
              {
                onClick: () => onAdjustNickel(p.id, 1),
                disabled: p.nickels === 0,
                "aria-label": `${p.name} spends a nickel`,
              },
              "\u2212"
            ),
            h("span", { className: "val tnum" }, p.nickels),
            h(
              "button",
              {
                onClick: () => onAdjustNickel(p.id, -1),
                disabled: (game.pendingNickels?.[p.id] ?? 0) === 0,
                "aria-label": `Give ${p.name} a nickel back`,
              },
              "+"
            )
          )
        )
      )
    ),

    h(
      "button",
      { className: "btn btn-primary", style: { marginTop: "20px" }, onClick: onScore },
      "Hand's over \u2014 enter scores"
    )
  );
}

/* ---------------- Scoring screen ---------------- */
/* Serves both new hands and editing a past one. When editIndex is a
   number, it loads that hand's saved values and lets nickels change too. */

function Scoring({ game, editIndex, onCommit, onBack, onDelete }) {
  const editing = typeof editIndex === "number";
  const hIndex = editing ? editIndex : game.handIndex;
  const existing = editing ? game.hands[hIndex] : null;

  const [wentOut, setWentOut] = useState(existing ? existing.wentOut : null);
  const [vals, setVals] = useState(() => {
    if (!existing) return {};
    const v = {};
    game.players.forEach((p) => {
      if (p.id !== existing.wentOut) v[p.id] = String(existing.scores[p.id] ?? 0);
    });
    return v;
  });
  const [nickels, setNickels] = useState(() => {
    const n = {};
    game.players.forEach((p) => {
      n[p.id] = existing
        ? existing.nickels?.[p.id] ?? 0
        : game.pendingNickels?.[p.id] ?? 0;
    });
    return n;
  });

  const isLast = hIndex === HANDS.length - 1;
  const setVal = (id, v) => setVals({ ...vals, [id]: v });

  const bumpNickel = (id, d) =>
    setNickels((n) => ({ ...n, [id]: Math.max(0, Math.min(START_NICKELS, (n[id] ?? 0) + d)) }));

  const players = derive(game);
  const losers = game.players.filter((p) => p.id !== wentOut);
  const ready = wentOut !== null && losers.every((p) => (vals[p.id] ?? "") !== "");

  const commit = () => {
    const scores = {};
    game.players.forEach((p) => {
      scores[p.id] = p.id === wentOut ? 0 : parseInt(vals[p.id], 10) || 0;
    });
    onCommit({ scores, wentOut, nickels }, editing ? hIndex : null);
  };

  return h(
    "div",
    { className: "screen" },
    h(
      "div",
      { className: "eyebrow" },
      `${editing ? "Editing hand" : "Hand"} ${hIndex + 1} \u2014 ${handName(hIndex)}`
    ),
    h(
      "h2",
      { style: { fontSize: "24px", marginBottom: "16px" } },
      editing ? "Fix this hand" : "Score the hand"
    ),

    editing
      ? h(
          "p",
          { className: "hint", style: { marginBottom: "16px" } },
          "Changing this hand recalculates every total after it."
        )
      : null,

    h(
      "div",
      { className: "panel", style: { marginTop: 0 } },
      h("h2", null, isLast ? "Who went out first? (wins the pot)" : "Who went out?"),
      h(
        "div",
        { className: "picker" },
        game.players.map((p) =>
          h(
            "button",
            {
              key: p.id,
              className: "pick" + (wentOut === p.id ? " sel" : ""),
              onClick: () => setWentOut(wentOut === p.id ? null : p.id),
            },
            p.name
          )
        )
      )
    ),

    wentOut
      ? h(
          "div",
          { className: "panel" },
          h("h2", null, "Cards left in hand"),
          h(
            "p",
            { className: "hint", style: { marginBottom: "10px" } },
            "3\u20139 are 5 each \u00b7 10\u2013K are 10 \u00b7 Aces 15 \u00b7 2s are 20."
          ),
          losers.map((p) => {
            const pl = players.find((x) => x.id === p.id);
            return h(
              "div",
              { key: p.id, className: "entry" },
              h(
                "div",
                null,
                h("div", { className: "who" }, p.name),
                h("div", { className: "run tnum" }, `Running total ${pl ? pl.total : 0}`)
              ),
              h("input", {
                type: "number",
                inputMode: "numeric",
                pattern: "[0-9]*",
                min: "0",
                placeholder: "0",
                value: vals[p.id] ?? "",
                onChange: (e) => setVal(p.id, e.target.value.replace(/[^0-9]/g, "")),
              })
            );
          }),
          h(
            "div",
            { className: "entry out" },
            h("div", { className: "who" }, game.players.find((p) => p.id === wentOut).name),
            h("div", { className: "wentout" }, "Out \u2014 0")
          )
        )
      : null,

    h(
      "div",
      { className: "panel" },
      h("h2", null, "Nickels spent this hand"),
      game.players.map((p) =>
        h(
          "div",
          { key: p.id, className: "entry" },
          h("div", { className: "who" }, p.name),
          h(
            "div",
            { className: "stepper" },
            h(
              "button",
              {
                onClick: () => bumpNickel(p.id, -1),
                disabled: (nickels[p.id] ?? 0) === 0,
                "aria-label": `Fewer nickels for ${p.name}`,
              },
              "\u2212"
            ),
            h("span", { className: "val tnum" }, nickels[p.id] ?? 0),
            h(
              "button",
              {
                onClick: () => bumpNickel(p.id, 1),
                "aria-label": `More nickels for ${p.name}`,
              },
              "+"
            )
          )
        )
      )
    ),

    h(
      "div",
      { className: "btnrow" },
      h("button", { className: "btn btn-ghost", onClick: onBack }, editing ? "Cancel" : "Back"),
      h(
        "button",
        { className: "btn btn-primary", disabled: !ready, onClick: commit },
        editing ? "Save changes" : isLast ? "Finish game" : "Next hand"
      )
    ),

    editing && onDelete
      ? h(
          "button",
          { className: "btn btn-danger", style: { marginTop: "10px" }, onClick: () => onDelete(hIndex) },
          "Delete this hand"
        )
      : null
  );
}

/* ---------------- Final screen ---------------- */

function Final({ game, onNewGame }) {
  const players = derive(game);
  const ranked = [...players].sort((a, b) => a.total - b.total);
  const pointsWinner = ranked[0];
  const potId = potWinnerOf(game);
  const potWinner = players.find((p) => p.id === potId);
  const sameWinner = potWinner && potWinner.id === pointsWinner.id;

  return h(
    "div",
    { className: "screen" },
    h("div", { className: "eyebrow" }, "Game over"),

    potWinner
      ? h(
          "div",
          { className: "trophy" },
          h("div", { className: "label" }, "Winner of the pot"),
          h("div", { className: "who" }, potWinner.name),
          h("div", { className: "note" }, "Went out first on the 1 of 6")
        )
      : null,

    h(
      "div",
      { className: "trophy" },
      h("div", { className: "label" }, "Winner on points"),
      h("div", { className: "who" }, pointsWinner.name),
      h(
        "div",
        { className: "note" },
        sameWinner
          ? `Lowest score at ${pointsWinner.total} \u2014 took both.`
          : `Lowest score at ${pointsWinner.total}.`
      )
    ),

    h(
      "div",
      { className: "panel" },
      h("h2", null, "Final standings"),
      h(Board, { players })
    ),

    h(
      "div",
      { className: "panel" },
      h("h2", null, "Hand by hand"),
      h(
        "div",
        { style: { overflowX: "auto" } },
        h(
          "table",
          { className: "ptable tnum", style: { minWidth: "100%" } },
          h(
            "tbody",
            null,
            ranked.map((p) =>
              h(
                "tr",
                { key: p.id },
                h("td", { style: { fontWeight: 600 } }, p.name),
                h("td", { style: { textAlign: "right", fontWeight: 500 } }, p.history.join(" \u00b7 ")),
                h("td", null, p.total)
              )
            )
          )
        )
      ),
      h(
        "p",
        { className: "hint", style: { marginTop: "12px" } },
        "Something wrong? Open the menu and tap any hand to fix it."
      )
    ),

    h("button", { className: "btn btn-primary", style: { marginTop: "22px" }, onClick: onNewGame }, "Start a new game")
  );
}

/* ---------------- Update banner ---------------- */

function UpdateBanner({ onApply, onDismiss }) {
  return h(
    "div",
    { className: "updatebar" },
    h(
      "div",
      { className: "utext" },
      h("strong", null, "New version ready"),
      h("span", null, "Applies when you reload.")
    ),
    h("button", { className: "ubtn", onClick: onApply }, "Update"),
    h("button", { className: "ux", onClick: onDismiss, "aria-label": "Dismiss" }, "\u00d7")
  );
}

/* ---------------- History screen ---------------- */

function History({ history, onResume, onDelete, onBack }) {
  /* Defensive: a malformed or partial entry should never blank the app. */
  const safe = (history || []).filter((e) => e && e.id).map((e) => ({
    id: e.id,
    savedAt: typeof e.savedAt === "number" ? e.savedAt : Date.now(),
    complete: !!e.complete,
    handsPlayed: typeof e.handsPlayed === "number" ? e.handsPlayed : 0,
    pointsWinner: e.pointsWinner || "",
    potWinner: e.potWinner || "",
    standings: Array.isArray(e.standings)
      ? e.standings.filter((p) => p && typeof p.name === "string")
      : [],
    game: e.game && Array.isArray(e.game.hands) ? e.game : null,
  }));

  if (!safe.length) {
    return h(
      "div",
      { className: "screen" },
      h("div", { className: "eyebrow" }, "Past games"),
      h("h2", { style: { fontSize: "24px", marginBottom: "10px" } }, "No games yet"),
      h(
        "p",
        { className: "hint", style: { marginBottom: "20px" } },
        "Finished games are saved here automatically \u2014 the last five. Starting a new game part-way through also archives the one you were on."
      ),
      h("button", { className: "btn btn-ghost", onClick: onBack }, "Back")
    );
  }

  return h(
    "div",
    { className: "screen" },
    h("div", { className: "eyebrow" }, "Past games"),
    h("h2", { style: { fontSize: "24px", marginBottom: "6px" } }, "Last 5 games"),
    h(
      "p",
      { className: "hint", style: { marginBottom: "18px" } },
      "Tap a game to look at it, or pick up an unfinished one where it left off."
    ),

    safe.map((e) =>
      h(
        "div",
        { key: e.id, className: "gcard" },
        h(
          "div",
          { className: "ghead" },
          h(
            "div",
            null,
            h(
              "div",
              { className: "gwhen" },
              relativeDay(e.savedAt),
              h(
                "span",
                { className: "gtag" + (e.complete ? " done" : "") },
                e.complete ? "Complete" : `Hand ${e.handsPlayed} of 7`
              )
            ),
            e.complete
              ? h(
                  "div",
                  { className: "gwin" },
                  e.potWinner && e.potWinner !== e.pointsWinner
                    ? `${e.pointsWinner} on points \u00b7 ${e.potWinner} took the pot`
                    : e.potWinner === e.pointsWinner
                    ? `${e.pointsWinner} took both`
                    : `${e.pointsWinner} on points`
                )
              : h("div", { className: "gwin" }, `${e.pointsWinner} leading`)
          ),
          h(
            "button",
            { className: "x", onClick: () => onDelete(e.id), "aria-label": "Delete this game" },
            "\u00d7"
          )
        ),

        h(
          "div",
          { className: "gscores" },
          e.standings.map((p, i) =>
            h(
              "div",
              { key: i, className: "gscore" + (i === 0 ? " top" : "") },
              h("span", { className: "gname" }, p.name),
              h("span", { className: "gpts tnum" }, p.total)
            )
          )
        ),

        !e.complete && e.game
          ? h(
              "button",
              { className: "btn btn-ghost", style: { marginTop: "12px" }, onClick: () => onResume(e) },
              "Pick up where this left off"
            )
          : null
      )
    ),

    h("button", { className: "btn btn-ghost", style: { marginTop: "18px" }, onClick: onBack }, "Back")
  );
}

/* ---------------- Left menu: game + history ---------------- */

function GameMenu({ game, historyCount, onClose, onEditHand, onOpenHistory }) {
  const players = game ? derive(game) : [];
  const nameOf = (id) => {
    const p = players.find((x) => x.id === id);
    return p ? p.name : "\u2014";
  };
  return h(
    React.Fragment,
    null,
    h("div", { className: "scrim", onClick: onClose }),
    h(
      "aside",
      { className: "drawer left", role: "dialog", "aria-label": "Game menu" },
      h(
        "div",
        { className: "dhead" },
        h("h2", null, "This Game"),
        h("button", { className: "iconbtn", onClick: onClose, "aria-label": "Close menu" }, h(Icon, { name: "close" }))
      ),
      h(
        "div",
        { className: "dbody rules" },

        h(
          "button",
          { className: "histlink", onClick: onOpenHistory },
          h("span", null, "Past games"),
          h("span", { className: "histcount tnum" }, historyCount || 0)
        ),

        game
          ? h(
              React.Fragment,
              null,
              h("h3", null, "The seven hands"),
              h(
                "p",
                { style: { fontSize: "13px", marginBottom: "10px" } },
                "Tap a played hand to fix its scores."
              ),
              h(
                "div",
                { className: "hands" },
                HANDS.map((_, i) => {
                  const played = (game.hands || [])[i];
                  const rec = played;
                  const current = i === (game.hands || []).length && game.phase !== "final";
                  return h(
                    played ? "button" : "div",
                    {
                      key: i,
                      className:
                        "hand" + (current ? " now" : "") + (played ? " done editable" : ""),
                      onClick: played ? () => onEditHand(i) : undefined,
                      type: played ? "button" : undefined,
                    },
                    h("span", { className: "n tnum" }, i + 1),
                    h(
                      "span",
                      { className: "hlabel" },
                      handName(i),
                      played
                        ? h("span", { className: "hsub" }, `${nameOf(rec.wentOut)} went out`)
                        : null
                    ),
                    current
                      ? h("span", { className: "tag" }, "PLAYING")
                      : played
                      ? h("span", { className: "tag edit" }, "EDIT")
                      : null
                  );
                })
              )
            )
          : h(
              "p",
              { className: "hint" },
              "Once a game is under way, the seven hands show up here and you can tap any played hand to fix its scores."
            )
      )
    )
  );
}

/* ---------------- Right drawer: rules ---------------- */

function RulesDrawer({ onClose }) {
  return h(
    React.Fragment,
    null,
    h("div", { className: "scrim", onClick: onClose }),
    h(
      "aside",
      { className: "drawer right", role: "dialog", "aria-label": "Rules" },
      h(
        "div",
        { className: "dhead" },
        h("h2", null, "The Rules"),
        h("button", { className: "iconbtn", onClick: onClose, "aria-label": "Close rules" }, h(Icon, { name: "close" }))
      ),
      h(
        "div",
        { className: "dbody rules" },
h("h3", null, "The game"),
        h(
          "p",
          null,
          "Seven hands, each one harder than the last. Two decks, up to six players. Ten cards dealt to each player, the rest becomes the draw pile. The dealer flips one card to start the discard pile."
        ),
        h(
          "p",
          null,
          "Each hand you have to make your ",
          h("strong", null, "book"),
          " first \u2014 a book is a set of like cards, such as three 7s or four 9s, wild cards included."
        ),

        h("h3", null, "Turn order"),
        h(
          "p",
          null,
          "The player to the dealer's left goes first, then clockwise. On your turn you draw one card and discard one card. Always."
        ),

        h("h3", null, "Buying a discard"),
        h("ul", null,
          h("li", null, "Anyone can buy the top discard for a nickel. First to say ", h("strong", null, "BUY"), " gets it."),
          h("li", null, "A buyer also takes an extra card from the draw pile."),
          h("li", null, "If it's your own turn when you buy, you still take the extra card."),
          h("li", null, "Six nickels each, for all seven hands. Spend them carefully."),
          h("li", null, "If the dealer's very first flip is a 2, the player whose turn it is gets first refusal on buying it, then the option passes around.")
        ),

        h("h3", null, "Wild cards"),
        h(
          "p",
          null,
          "The 2s are wild. You can never have more wild cards than natural cards in a set. For ",
          h("strong", null, "1 of 3"),
          " you may use one wild; for ",
          h("strong", null, "2 of 3"),
          " you may use two, one per set."
        ),

        h("h3", null, "After your book is down"),
        h("ul", null,
          h("li", null, "You can lay down extra cards: 3, 4, or 5 of a kind, or runs in one suit."),
          h("li", null, "You can play onto opponents' sets and runs."),
          h("li", null, "You can swap a natural card for a wild sitting in someone's set, then reuse that wild."),
          h("li", null, "A wild picked up from an opponent must be played the same turn \u2014 it can't stay in your hand.")
        ),

        h("h3", null, "Ending a hand"),
        h(
          "p",
          null,
          "First player to lay their book and shed every card wins the hand and scores zero. You need a discard to go out. Everyone else counts what's left in hand:"
        ),
        h(
          "table",
          { className: "ptable" },
          h(
            "tbody",
            null,
            h("tr", null, h("td", null, "3 through 9"), h("td", null, "5")),
            h("tr", null, h("td", null, "10 through King"), h("td", null, "10")),
            h("tr", null, h("td", null, "Aces"), h("td", null, "15")),
            h("tr", null, h("td", null, "2s (wild)"), h("td", null, "20"))
          )
        ),

        h("h3", null, "Two winners"),
        h("ul", null,
          h("li", null, h("strong", null, "The pot: "), "whoever goes out first on the last hand (1 of 6) takes every nickel spent on buys all game."),
          h("li", null, h("strong", null, "The points: "), "whoever has the lowest total after all seven hands.")
        ),
        h("p", null, "One player can take both.")
      )
    )
  );
}

/* ---------------- Error boundary ---------------- */
/* A crash anywhere in the tree used to unmount everything and leave a
   blank green screen. This catches it, keeps the data intact, and offers
   a way out. */

class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  render() {
    if (!this.state.err) return this.props.children;
    return h(
      "div",
      { className: "app" },
      h(
        "div",
        { className: "screen" },
        h("div", { className: "eyebrow" }, "Something broke"),
        h(
          "h2",
          { style: { fontSize: "24px", marginBottom: "10px" } },
          "The app hit an error"
        ),
        h(
          "p",
          { className: "hint", style: { marginBottom: "18px" } },
          "Your game is still saved. Reloading usually fixes it."
        ),
        h(
          "button",
          { className: "btn btn-primary", onClick: () => window.location.reload() },
          "Reload"
        ),
        h(
          "button",
          {
            className: "btn btn-ghost",
            style: { marginTop: "10px" },
            onClick: () => {
              try {
                localStorage.removeItem(HISTORY_KEY);
              } catch {}
              window.location.reload();
            },
          },
          "Clear past games and reload"
        ),
        h(
          "button",
          {
            className: "btn btn-danger",
            style: { marginTop: "10px" },
            onClick: () => {
              if (!confirm("Erase the current game and all history?")) return;
              try {
                localStorage.removeItem(KEY);
                localStorage.removeItem(HISTORY_KEY);
              } catch {}
              window.location.reload();
            },
          },
          "Start completely fresh"
        ),
        h(
          "p",
          { className: "hint", style: { marginTop: "20px", opacity: 0.6, fontSize: "12px" } },
          String((this.state.err && this.state.err.message) || this.state.err)
        )
      )
    );
  }
}

/* ---------------- App ---------------- */

function App() {
  const [game, setGame] = useState(() => load());
  const [history, setHistory] = useState(() => loadHistory());
  const [menu, setMenu] = useState(false);
  const [rules, setRules] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (game) save(game);
    else localStorage.removeItem(KEY);
  }, [game]);

  /* A new service worker finished installing in the background. */
  useEffect(() => {
    const onReady = () => setUpdateReady(true);
    window.addEventListener("sw-update-ready", onReady);
    if (window.__swWaiting) setUpdateReady(true);
    return () => window.removeEventListener("sw-update-ready", onReady);
  }, []);

  /* Archive the finished game once, when it completes. */
  const archivedRef = useRef(null);
  useEffect(() => {
    if (!game || game.phase !== "final") return;
    const stamp = JSON.stringify(game.hands);
    if (archivedRef.current === stamp) return;
    archivedRef.current = stamp;
    setHistory(archiveGame(game));
  }, [game]);

  const start = (names) => setGame(freshGame(names));

  const adjustNickel = (id, delta) =>
    setGame((g) => {
      const pending = { ...(g.pendingNickels || {}) };
      pending[id] = Math.max(0, (pending[id] ?? 0) + delta);
      return { ...g, pendingNickels: pending };
    });

  const commit = (record, index) =>
    setGame((g) => {
      let hands;
      if (index === null || index === undefined) {
        hands = [...g.hands, record];
      } else {
        hands = g.hands.map((hd, i) => (i === index ? record : hd));
      }
      const done = hands.length === HANDS.length;
      return {
        ...g,
        hands,
        handIndex: Math.min(hands.length, HANDS.length - 1),
        phase: done ? "final" : "round",
        pendingNickels: index === null || index === undefined ? {} : g.pendingNickels,
      };
    });

  const deleteHand = (index) => {
    if (!confirm("Delete this hand? Later hands shift up and totals recalculate.")) return;
    setGame((g) => {
      const hands = g.hands.filter((_, i) => i !== index);
      return {
        ...g,
        hands,
        handIndex: Math.min(hands.length, HANDS.length - 1),
        phase: hands.length === HANDS.length ? "final" : "round",
      };
    });
    setEditIndex(null);
  };

  /* Starting over mid-game archives what you had, so nothing is lost. */
  const newGame = () => {
    const mid = game && Array.isArray(game.hands) && game.hands.length > 0 && game.phase !== "final";
    const msg = mid
      ? "Start a new game? This one gets saved to Past games first."
      : "Clear this game and start over?";
    if (!confirm(msg)) return;
    if (mid) setHistory(archiveGame(game));
    archivedRef.current = null;
    setGame(null);
    setEditIndex(null);
    setShowHistory(false);
  };

  const resume = (entry) => {
    if (game && game.hands && game.hands.length > 0 && game.phase !== "final") {
      if (!confirm("Resume this game? Your current one gets saved to Past games first.")) return;
      setHistory(archiveGame(game));
    }
    archivedRef.current = null;
    setGame(restoreGame(entry));
    setShowHistory(false);
  };

  const deleteHistory = (id) => {
    if (!confirm("Remove this game from history?")) return;
    const next = loadHistory().filter((e) => e.id !== id);
    saveHistory(next);
    setHistory(next);
  };

  const applyUpdate = () => {
    if (window.__applyUpdate) window.__applyUpdate();
    else window.location.reload();
  };

  const openEdit = (i) => {
    setEditIndex(i);
    setMenu(false);
    setShowHistory(false);
  };

  let screen, sub;
  if (showHistory) {
    screen = h(History, {
      history,
      onResume: resume,
      onDelete: deleteHistory,
      onBack: () => setShowHistory(false),
    });
    sub = "Past games";
  } else if (!game) {
    screen = h(Setup, { onStart: start });
    sub = "Set up the table";
  } else if (editIndex !== null) {
    screen = h(Scoring, {
      game,
      editIndex,
      onCommit: (rec, idx) => {
        commit(rec, idx);
        setEditIndex(null);
      },
      onBack: () => setEditIndex(null),
      onDelete: deleteHand,
    });
    sub = `Editing hand ${editIndex + 1}`;
  } else if (game.phase === "final") {
    screen = h(Final, { game, onNewGame: newGame });
    sub = "Final results";
  } else if (game.phase === "scoring") {
    screen = h(Scoring, {
      game,
      editIndex: null,
      onCommit: commit,
      onBack: () => setGame({ ...game, phase: "round" }),
    });
    sub = `Hand ${game.handIndex + 1} \u2014 scoring`;
  } else {
    screen = h(RoundStart, {
      game,
      onScore: () => setGame({ ...game, phase: "scoring" }),
      onAdjustNickel: adjustNickel,
    });
    sub = `Hand ${game.handIndex + 1} of 7 \u2014 ${handName(game.handIndex)}`;
  }

  return h(
    "div",
    { className: "app" },
    updateReady
      ? h(UpdateBanner, { onApply: applyUpdate, onDismiss: () => setUpdateReady(false) })
      : null,
    h(
      "header",
      { className: "topbar" },
      h(
        "button",
        { className: "iconbtn", onClick: () => setMenu(true), "aria-label": "Games and hands" },
        h(Icon, { name: "menu" })
      ),
      h("h1", null, "Lebeouf's Bluff", h("span", { className: "sub" }, sub)),
      game && !showHistory
        ? h("button", { className: "iconbtn", onClick: newGame, "aria-label": "New game" }, "\u21bb")
        : null,
      h(
        "button",
        { className: "iconbtn", onClick: () => setRules(true), "aria-label": "Rules" },
        h(Icon, { name: "help" })
      )
    ),
    screen,
    menu
      ? h(GameMenu, {
          game,
          historyCount: history.length,
          onClose: () => setMenu(false),
          onEditHand: openEdit,
          onOpenHistory: () => {
            setMenu(false);
            setShowHistory(true);
          },
        })
      : null,
    rules ? h(RulesDrawer, { onClose: () => setRules(false) }) : null
  );
}

createRoot(document.getElementById("root")).render(h(Boundary, null, h(App)));
