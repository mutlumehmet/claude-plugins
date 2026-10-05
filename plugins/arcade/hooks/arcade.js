// Built by scripts/build.sh from src/ with esbuild@0.25.10. Do not edit: edit src/ and rebuild.
// src/arcade.tsx
import { atom as atom9, read as read9, update as update8 } from "claude-code";

// src/games/dragon-lair.tsx
import { atom as atom2, read as read2, update } from "claude-code";

// src/games/dragon-sprite.ts
const DRAGON_WIDTH = 26;
const PIXEL_ROWS = 10;
const BASE = 2;
const BODY = {
  x: 7,
  y: 4,
  frames: {
    still: ["..#########", "############", "..##########"],
    breathe: ["..#########", ".###########", "..##########"]
  }
};
const WING = {
  x: 6,
  y: -2,
  frames: {
    up: ["#.......", "##......", "######..", ".#.#.##.", "..#.#.##", "...#####"],
    mid: ["........", "........", "#.......", ".######.", "..#.#.##", "...#####"],
    down: ["........", "........", "........", "........", ".######.", "#.#.#.##"]
  }
};
const HEAD = {
  x: 16,
  y: 0,
  frames: {
    look: ["...#.#....", "..######..", ".##.######", ".##...###.", "##........"],
    blink: ["...#.#....", "..######..", ".#########", ".##...###.", "##........"],
    up: ["...#.#....", "..##.###..", ".#########", ".##...###.", "##........"],
    open: ["...#.#....", "..######..", ".##.######", ".##.......", "##....###."],
    droop: ["..........", "...#.#....", "..######..", ".##.######", "##....###."],
    doze: ["..........", "...#.#....", "..######..", ".#########", "##....###."]
  }
};
const TAIL = {
  x: 0,
  y: 3,
  frames: {
    low: ["#........", "##.......", ".##......", "..#####.."],
    high: ["##.......", "#........", "##.......", ".######.."],
    flat: [".........", ".........", "###......", "..#####.."]
  }
};
const LEGS = {
  x: 8,
  y: 7,
  frames: {
    stand: ["##.##..##.##"],
    stepA: ["#..##...#..##"],
    stepB: ["##..#...##..#"],
    tuck: ["............"]
  }
};
const MOUTH = { x: 26, y: BASE + 2 };
const NOSTRIL = { x: 25, y: BASE + 2 };
const EYE = { x: 19, y: BASE + 2 };
function draw(ink, columns, pose2, dx = 0, dy = 0) {
  const put3 = (part, frame8) => {
    const rows = part.frames[frame8] ?? Object.values(part.frames)[0] ?? [];
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== "#") continue;
        const px = part.x + x + dx;
        const py = BASE + part.y + y + dy;
        if (px >= 0 && px < columns && py >= 0 && py < PIXEL_ROWS) ink[py * columns + px] = 1;
      }
    });
  };
  put3(TAIL, pose2.tail);
  put3(BODY, pose2.body);
  put3(LEGS, pose2.legs);
  put3(WING, pose2.wing);
  put3(HEAD, pose2.head);
}
const BABY = {
  up: [".#....", "#.#...", ".###.#", "..####", "..#..."],
  down: ["......", "....#.", ".####.", "#.###.", "..#..."]
};
function drawBaby(ink, columns, x, y, frame8) {
  BABY[frame8].forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      if (row[dx] !== "#") continue;
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (px >= 0 && px < columns && py >= 0 && py < PIXEL_ROWS) ink[py * columns + px] = 1;
    }
  });
}

// src/shown.ts
import { atom, read } from "claude-code";
const shown = atom({ plugin: "arcade", key: "shown" }, []);
async function isShown($, id) {
  return (await read($, shown)).includes(id);
}

// src/games/dragon-lair.tsx
const ID = "dragon";
const RASTER = "dragon";
const ROWS = PIXEL_ROWS / 2;
const COLUMNS = DRAGON_WIDTH + 9;
const FPS_MS = 66;
const INK = 16777216;
const NONE = 16777216;
const hoard = atom2({ plugin: "arcade", key: "dragonHoard" }, { gold: 0, meals: 0, feats: 0 });
const mood = atom2({ plugin: "arcade", key: "dragonMood" }, "idle");
const feat = atom2({ plugin: "arcade", key: "dragonFeat" }, "");
async function notify($, text) {
  if (!!await isShown($, ID)) $.ui.toast(text);
}
const SHOW_FRAMES = { puff: 20, breath: 32, blaze: 48, roar: 72 };
function workOf(tool8) {
  if (tool8 === "Read") return "read";
  if (tool8 === "Grep" || tool8 === "Glob" || tool8 === "LSP") return "search";
  if (tool8 === "Edit" || tool8 === "Write" || tool8 === "NotebookEdit") return "edit";
  if (tool8 === "WebFetch" || tool8 === "WebSearch" || tool8.startsWith("mcp__")) return "web";
  if (tool8 === "Agent" || tool8 === "Task") return "agent";
  return "bash";
}
const SLOTS = [
  { x: 28, y: 0 },
  { x: 28, y: 5 },
  { x: 0, y: 0 }
];
const HOME = { x: 18, y: 0 };
const sim = {
  t: 0,
  lastActivity: 0,
  isTurn: false,
  working: [],
  show: null,
  sadUntil: -1,
  alertUntil: -1,
  levelUntil: -1,
  level: 1,
  particles: [],
  dx: 0,
  dy: 0,
  requestId: null,
  isBlitting: false,
  mood: "idle",
  babies: []
};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list2) => list2[Math.floor(Math.random() * list2.length)];
const levelOf = (gold) => Math.floor(Math.sqrt(gold / 10)) + 1;
const every = (n) => sim.t % n === 0;
const cycle = (frames, n) => frames[Math.floor(sim.t / n) % frames.length];
function activity() {
  const { t } = sim;
  if (sim.show && t < sim.show.until) return sim.show.kind;
  if (t < sim.sadUntil) return "sad";
  if (t < sim.alertUntil) return "alert";
  const last2 = sim.working[sim.working.length - 1];
  if (last2) return last2.work;
  if (sim.isTurn) return "think";
  if (t - sim.lastActivity > 120 * 1e3 / FPS_MS) return "sleep";
  return "idle";
}
function moodOf(a) {
  if (a === "puff" || a === "breath" || a === "blaze" || a === "roar") return "fire";
  if (a === "sad" || a === "sleep" || a === "idle") return a;
  return "work";
}
const statsLine = (stash) => `Lv ${levelOf(stash.gold)}  \u25C6 ${stash.gold}  \u2605 ${stash.feats}  \u2692 ${stash.meals}`;
const centred = (text) => " ".repeat(Math.max(0, Math.floor((DRAGON_WIDTH - text.length) / 2))) + text;
const showLeft = () => sim.show ? sim.show.until - sim.t : 0;
function pose(a) {
  const isBlink = sim.t % 55 < 2;
  const fast = ["up", "mid", "down", "mid"];
  switch (a) {
    case "sleep":
      return { body: cycle(["still", "breathe"], 20), wing: "down", head: "doze", tail: "flat", legs: "stand" };
    case "sad":
      return { body: "still", wing: "down", head: "droop", tail: "flat", legs: "stand" };
    case "alert":
      return { body: "still", wing: sim.alertUntil - sim.t > 8 ? "up" : "mid", head: "look", tail: "high", legs: lift(a) < 0 ? "tuck" : "stand" };
    case "think":
      return { body: cycle(["still", "breathe"], 12), wing: "down", head: isBlink ? "blink" : "up", tail: cycle(["low", "high"], 12), legs: "stand" };
    case "read":
      return { body: "still", wing: "down", head: isBlink ? "doze" : "droop", tail: "low", legs: "stand" };
    case "search":
      return { body: "still", wing: "mid", head: cycle(["look", "up"], 5), tail: cycle(["low", "high"], 5), legs: "stand" };
    case "edit":
      return { body: "still", wing: "down", head: "look", tail: cycle(["low", "high"], 3), legs: cycle(["stepA", "stand", "stepB", "stand"], 2) };
    case "bash":
      return { body: "still", wing: cycle(["up", "down"], 2), head: cycle(["look", "blink"], 6), tail: cycle(["low", "high"], 2), legs: "stand" };
    case "web":
      return { body: "still", wing: cycle(fast, 2), head: "look", tail: "flat", legs: "tuck" };
    case "agent":
      return { body: "still", wing: "mid", head: "droop", tail: "low", legs: "stand" };
    case "idle": {
      const isStretch = sim.t % 120 < 14;
      return {
        body: cycle(["still", "breathe"], 25),
        wing: isStretch ? cycle(["mid", "up"], 7) : "down",
        head: isBlink ? "blink" : "look",
        tail: cycle(["low", "high"], 18),
        legs: "stand"
      };
    }
    default:
      return {
        body: "still",
        wing: cycle(a === "puff" ? ["up", "mid"] : fast, a === "roar" ? 2 : 3),
        head: a !== "puff" || showLeft() > 12 ? "open" : "look",
        tail: "high",
        legs: a === "roar" ? cycle(["stepA", "stepB"], 3) : "stand"
      };
  }
}
function lift(a) {
  if (a === "alert") {
    const left = sim.alertUntil - sim.t;
    return left > 12 ? -1 : left > 6 ? -2 : left > 4 ? -1 : 0;
  }
  if (a === "web") return cycle([-2, -2, -1, -1], 2);
  if (a === "roar") return cycle([0, -1], 3);
  return 0;
}
function shift(a) {
  if (a === "edit") return cycle([0, 1, 2, 1], 3);
  if (a === "search") return cycle([0, 1], 6);
  return 0;
}
const glyph = (x, y, ch, life, vx = 0, vy = 0) => sim.particles.push({ x, y, vx, vy, age: 0, life, ch });
const pixel = (x, y, vx, vy, life, wave = 0) => sim.particles.push({ x, y, vx, vy, age: 0, life, wave });
function flame(count, reach) {
  for (let i = 0; i < count; i++) {
    pixel(MOUTH.x + sim.dx, MOUTH.y + sim.dy + rand(0, 1.4), rand(0.8, 1.6), rand(-0.15, 0.25), Math.floor(rand(reach * 0.5, reach)), rand(0, 6));
  }
}
function step(a) {
  stepBabies();
  sim.dx = shift(a);
  sim.dy = lift(a);
  const top = DRAGON_WIDTH + 1;
  switch (a) {
    case "puff":
      if (showLeft() > 12) flame(1, 3);
      if (every(6)) pixel(NOSTRIL.x, NOSTRIL.y - 1, rand(0.1, 0.3), -0.2, 8);
      if (showLeft() === SHOW_FRAMES.puff - 1) glyph(top, 0, "\u2713", 18);
      break;
    case "breath":
      flame(2, 7);
      break;
    case "blaze":
      flame(3, 8);
      if (every(3)) glyph(rand(top, COLUMNS), rand(0, PIXEL_ROWS), pick(["*", "+", "\u2726"]), 5);
      break;
    case "roar":
      flame(4, 8);
      if (every(2)) glyph(rand(0, COLUMNS), rand(0, PIXEL_ROWS), pick(["*", "+", "\u2726", "."]), 6);
      if (every(8)) "ROAR".split("").forEach((ch, i) => glyph(top + i, 0, ch, 5));
      break;
    case "sad":
      if (every(10)) pixel(EYE.x, EYE.y + 2, 0, 0.25, 8);
      break;
    case "think":
      if (every(8)) {
        const k = Math.floor(sim.t / 8) % 3;
        glyph(14 + k * 2, 0, [".", "o", "O"][k], 8);
      }
      break;
    case "read":
      if (every(3)) glyph(top - 1, 8, cycle(["=", "-", "="], 3), 3);
      break;
    case "search":
      if (every(12)) glyph(23 + sim.dx, 0, "?", 12);
      break;
    case "edit":
      if (every(2)) pixel(rand(8, 20) + sim.dx, PIXEL_ROWS - 1, rand(-0.5, 0.5), -0.25, 3);
      break;
    case "bash":
      if (every(9)) pixel(NOSTRIL.x, NOSTRIL.y - 1, 0.25, -0.2, 6);
      break;
    case "web":
      if (every(2)) glyph(rand(0, 6), rand(0, PIXEL_ROWS), "~", 6, -0.5, 0);
      break;
    case "sleep":
      if (every(24)) glyph(top - 3, 1, pick(["z", "Z"]), 30, 0.12, -0.04);
      break;
    case "idle":
      if (every(140)) pixel(NOSTRIL.x + 1, NOSTRIL.y - 1, 0.2, -0.15, 7);
      break;
  }
  if (sim.t < sim.levelUntil && every(6)) {
    `LV${sim.level}`.split("").forEach((ch, i) => glyph(top + 3 + i, 1, ch, 6));
    glyph(rand(top, COLUMNS), rand(0, PIXEL_ROWS), "\u2726", 4);
  }
  for (const p of sim.particles) {
    p.x += p.vx;
    p.y += p.vy + (p.wave ? Math.sin((sim.t + p.wave) / 1.5) * 0.25 : 0);
    p.age += 1;
  }
  sim.particles = sim.particles.filter((p) => p.age < p.life && p.x >= 0 && p.x < COLUMNS && p.y >= 0 && p.y < PIXEL_ROWS);
}
function freeSlot() {
  for (let i = 0; i < SLOTS.length; i++) {
    if (!sim.babies.some((b) => b.slot === i && b.state !== "home" && b.state !== "fall")) return i;
  }
  return -1;
}
function hatch(key, description, type, id, isNew = true) {
  if (sim.babies.some((b) => b.key === key || id !== void 0 && b.id === id)) return;
  sim.babies.push({ key, id, description, type, state: isNew ? "egg" : "fly", since: sim.t, slot: freeSlot(), lastTool: -100, y: 0 });
}
function stepBabies() {
  for (const b of sim.babies) {
    const age2 = sim.t - b.since;
    if (b.state === "egg" && age2 >= 20) {
      b.state = "fly";
      b.since = sim.t;
      glyph(slotOf(b).x + 2, slotOf(b).y + 2, "\u2726", 4);
    }
    if (b.state === "fall") b.y += 0.6;
  }
  sim.babies = sim.babies.filter((b) => {
    if (b.state === "home" && sim.t - b.since >= 14) {
      glyph(HOME.x, HOME.y, "\u2726", 6);
      return false;
    }
    return !(b.state === "fall" && b.y > PIXEL_ROWS);
  });
  for (const b of sim.babies) if (b.slot < 0 && b.state === "fly") b.slot = freeSlot();
}
const slotOf = (b) => SLOTS[b.slot] ?? SLOTS[0];
function drawBabies(ink, W5) {
  let hidden = 0;
  for (const b of sim.babies) {
    if (b.slot < 0) {
      hidden += 1;
      continue;
    }
    const at = slotOf(b);
    const age2 = sim.t - b.since;
    if (b.state === "egg") {
      const rock = age2 > 8 ? cycle([0, 1, 0, -1], 2) : 0;
      const ex = at.x + 2 + rock;
      const ey = at.y + 1;
      [".#.", "###", "###"].forEach(
        (row, dy) => [...row].forEach((c, dx) => {
          if (c !== "#" || age2 > 15 && dx === 1 && dy === 1) return;
          const x = ex + dx;
          const y = ey + dy;
          if (x >= 0 && x < W5 && y >= 0 && y < PIXEL_ROWS) ink[y * W5 + x] = 1;
        })
      );
      continue;
    }
    const isBusy = sim.t - b.lastTool < 15;
    const frame8 = cycle(["up", "down"], isBusy ? 2 : 4);
    if (b.state === "home") {
      const k = Math.min(1, age2 / 14);
      drawBaby(ink, W5, at.x + (HOME.x - at.x) * k, at.y + (HOME.y - at.y) * k, frame8);
      continue;
    }
    if (b.state === "fall") {
      drawBaby(ink, W5, at.x, at.y + b.y, "down");
      continue;
    }
    const bob = cycle(at.y === 0 ? [0, 0, 1, 1] : [0, 0, -1, -1], isBusy ? 2 : 5);
    drawBaby(ink, W5, at.x, at.y + bob, frame8);
  }
  if (hidden > 0) glyph(W5 - 2, 8, `+${Math.min(9, hidden)}`.slice(-1), 2);
}
function frame(a) {
  const W5 = COLUMNS;
  const ink = new Uint8Array(W5 * PIXEL_ROWS);
  const over2 = /* @__PURE__ */ new Map();
  draw(ink, W5, pose(a), shift(a), lift(a));
  drawBabies(ink, W5);
  for (const p of sim.particles) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x < 0 || x >= W5 || y < 0 || y >= PIXEL_ROWS) continue;
    if (p.ch) {
      over2.set(Math.floor(y / 2) * W5 + x, p.ch);
      continue;
    }
    if (p.age / p.life > 0.7 && (x + sim.t) % 2 === 0) continue;
    ink[y * W5 + x] = 1;
  }
  const words = new Uint32Array(W5 * ROWS * 3);
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < W5; cx++) {
      const i = (cy * W5 + cx) * 3;
      const top = ink[cy * 2 * W5 + cx] === 1;
      const bottom = ink[(cy * 2 + 1) * W5 + cx] === 1;
      const ch = over2.get(cy * W5 + cx);
      words[i] = ch ? ch.codePointAt(0) : top && bottom ? 9608 : top ? 9600 : bottom ? 9604 : 32;
      words[i + 1] = INK;
      words[i + 2] = NONE;
    }
  }
  return base64(new Uint8Array(words.buffer));
}
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + "==";
  } else if (rest === 2) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8;
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + "=";
  }
  return out;
}
async function celebrate($, label, gold, show, isQuiet = false) {
  sim.show = { kind: show, until: sim.t + SHOW_FRAMES[show] };
  sim.lastActivity = sim.t;
  const before = levelOf((await read2($, hoard)).gold);
  const next = await update($, hoard, (old) => ({ ...old, gold: old.gold + gold, feats: old.feats + 1 }));
  const after = levelOf(next.gold);
  await update($, feat, () => `${label}: +${gold} gold`);
  await $.store.set("dragon.hoard", next);
  if (after > before) {
    sim.level = after;
    sim.levelUntil = sim.show.until + 45;
    void notify($, `\u{1F525} ${label}! +${gold} gold. The dragon grows to level ${after}!`);
  } else if (!isQuiet) {
    void notify($, `\u{1F525} ${label}! The dragon hoards +${gold} gold`);
  }
}
const ROARS = /* @__PURE__ */ new Set(["merge", "release", "deploy", "streak", "record", "squad"]);
async function onMilestone($, tier, kind, label) {
  if (tier === "small") await celebrate($, label, 1, "puff", true);
  else if (tier === "medium") await celebrate($, label, 5, "breath");
  else if (ROARS.has(kind)) await celebrate($, label, 50, "roar");
  else await celebrate($, label, 25, "blaze");
}
async function celebrateMoments($, found) {
  for (const m of found) await onMilestone($, m.tier, m.kind, m.label);
}
const start = async ($, e, next) => {
  const saved = await $.store.get("dragon.hoard");
  if (saved) await update($, hoard, () => saved);
  await $.command.register({
    name: "dragon",
    description: 'The dragon above the prompt: its hoard. "/dragon puff|fire|blaze|roar" to show off.'
  });
  $.clock.every(FPS_MS, () => {
    sim.t += 1;
    const a = activity();
    const m = moodOf(a);
    if (m !== sim.mood) {
      sim.mood = m;
      void update($, mood, () => m);
    }
    const requestId = sim.requestId;
    if (requestId === null) return;
    step(a);
    if (sim.isBlitting) return;
    sim.isBlitting = true;
    void $.ui.blit({ requestId, key: RASTER, cells: frame(a) }).then((r) => {
      if (r.deny !== void 0) sim.requestId = null;
    }).finally(() => {
      sim.isBlitting = false;
    });
  });
  $.clock.every(1e3, () => {
    void $.agent.list().then(
      async (agents) => {
        for (const b of sim.babies) {
          if (b.id === void 0) {
            const match = agents.find(
              (a) => a.description === b.description && a.type === b.type && !sim.babies.some((o) => o.id === a.id)
            );
            if (match) b.id = match.id;
          }
        }
        for (const a of agents) {
          const isLive = a.status === "pending" || a.status === "running" || a.status === "waiting";
          if (isLive && !sim.babies.some((b) => b.id === a.id)) hatch(`agent:${a.id}`, a.description, a.type, a.id);
        }
        for (const b of sim.babies) {
          if (b.state !== "egg" && b.state !== "fly") continue;
          const a = agents.find((x) => x.id === b.id);
          const isGone = a === void 0 && sim.t - b.since > 30 * 1e3 / FPS_MS;
          if (a?.status === "completed" || a?.status === "idle" || isGone) {
            b.state = "home";
            b.since = sim.t;
            const fed = await update($, hoard, (old) => ({ ...old, gold: old.gold + 2 }));
            await $.store.set("dragon.hoard", fed);
          } else if (a?.status === "failed" || a?.status === "killed") {
            b.state = "fall";
            b.since = sim.t;
            b.y = 0;
            sim.sadUntil = sim.t + 15;
          }
        }
      },
      () => void 0
    );
  });
  return next(e);
};
const command = async ($, e) => {
  const arg = (e.args ?? "").trim();
  const practice = { puff: "puff", fire: "breath", blaze: "blaze", roar: "roar" };
  const show = practice[arg];
  if (show) {
    await celebrate($, "Practice", 1, show);
    return { text: "The dragon breathes fire." };
  }
  const last2 = await read2($, feat);
  return { text: `${statsLine(await read2($, hoard))}${last2 ? `
Last win: ${last2}` : ""}` };
};
const prompt = async ($, e, next) => {
  sim.isTurn = true;
  sim.alertUntil = sim.t + 15;
  sim.lastActivity = sim.t;
  const ran = await next(e);
  return ran;
};
const turn = async ($, e, next) => {
  sim.isTurn = false;
  sim.lastActivity = sim.t;
  const ran = await next(e);
  return ran;
};
const tool = async ($, e, next) => {
  if (e.agentId !== void 0) {
    const baby = sim.babies.find((b) => b.id === e.agentId);
    if (baby) baby.lastTool = sim.t;
    return next(e);
  }
  const job = { id: e.tool_use_id, work: workOf(String(e.tool)) };
  sim.working.push(job);
  sim.lastActivity = sim.t;
  const ran = await next(e).finally(() => {
    sim.working = sim.working.filter((w) => w !== job);
    sim.lastActivity = sim.t;
  });
  if (ran.deny !== void 0) return ran;
  const snack = await update($, hoard, (old) => ({ ...old, meals: old.meals + 1 }));
  if (snack.meals % 10 === 0) void $.store.set("dragon.hoard", snack);
  if (ran.isError === true) {
    sim.sadUntil = sim.t + 30;
    return ran;
  }
  return ran;
};
const render = async ($, e, next) => {
  const below = await next(e);
  if (e.surface !== "terminal" || e.props.hasSurvey || !await isShown($, ID)) {
    sim.requestId = null;
    return below;
  }
  const { Box, Raster, Text } = $.ui.resolve(e);
  sim.requestId = e.requestId;
  const stash = await read2($, hoard);
  sim.level = levelOf(stash.gold);
  return /* @__PURE__ */ h(Box, { flexDirection: "row", alignItems: "flex-end" }, /* @__PURE__ */ h(Box, { flexGrow: 1, flexDirection: "column" }, below ?? null), /* @__PURE__ */ h(Box, { flexDirection: "column", flexShrink: 0, minWidth: COLUMNS }, /* @__PURE__ */ h(Raster, { key: RASTER, columns: COLUMNS, rows: ROWS, cells: frame(activity()) }), /* @__PURE__ */ h(Text, { key: "stats", dimColor: true, wrap: "truncate" }, centred(statsLine(stash)))));
};
const game = { id: ID, title: "Dragon Lair" };

// src/games/duck-hunt.tsx
import { read as read3, update as update2, atom as atom3 } from "claude-code";
const ID2 = "duck";
const RASTER2 = "marsh";
const ROWS2 = 8;
const PH = ROWS2 * 2;
const FPS_MS2 = 66;
const MIN_COLUMNS = 24;
const MAX_COLUMNS = 512;
const SLEEP_AFTER = 2 * 60 * 1e3 / FPS_MS2;
const INK2 = 16777216;
const NONE2 = 16777216;
const EMPTY = 4294967295;
const GRASS = 4170573;
const GRASS_DARK = 2849335;
const TREE = 2849335;
const TRUNK = 9132587;
const DOG = 13141834;
const DOG_DARK = 8014372;
const DUCK = 9132587;
const DUCK_HEAD = 3050327;
const BEAK = 16756736;
const SHOT = 14692657;
const GREY = 9079434;
const FEATHER = [16777215, 14272416, 9132587];
const GROUND = PH - 3;
const SKY_BOTTOM = GROUND - 4;
const score = atom3({ plugin: "arcade", key: "duckScore" }, { hits: 0, escaped: 0, tools: 0 });
const feat2 = atom3({ plugin: "arcade", key: "duckFeat" }, "");
async function notify2($, text) {
  if (await isShown($, ID2)) $.ui.toast(text);
}
const DUCK_UP = [".##.....", "..##..##", ".#######", "..####.."];
const DUCK_DOWN = ["......##", ".#######", "..####..", "..##...."];
const DUCK_HEAD_PIXELS = [[6, 0], [7, 0], [6, 1]];
const DUCK_FALL = ["..#..#..", "..####..", ".######.", "..#..#.."];
const DUCK_HIT = [".#....#.", ".######.", "..####..", "..#..#.."];
const DOG_WALK = [
  ["......##.", ".....####", "#...####.", "#######..", ".######..", ".#.#..#.#"],
  ["......##.", ".....####", "#...####.", "#######..", ".######..", "#..#.#..#"]
];
const DOG_UP = ["..#####..", ".##.#.##.", ".#######.", "..#...#..", "..#####..", "...###..."];
const DOG_LAUGH = ["..#####..", ".##.#.##.", ".#######.", "..#.#.#..", "..#####..", "...###..."];
const DOG_SLEEP = [".........", ".........", ".........", "....##...", "#.######.", "########."];
const SHOW_FRAMES2 = { shot: 18, hunt: 110, double: 140, perfect: 170 };
const sim2 = {
  t: 0,
  W: 0,
  requestId: null,
  isBlitting: false,
  isTurn: false,
  working: 0,
  lastActivity: 0,
  show: null,
  ducks: [],
  particles: [],
  banner: null,
  dogX: 4,
  dogFace: 1,
  // The dog behind the grass, holding up what fell: 0 nothing, 1 or 2 ducks, -1 laughing.
  catch: null,
  laughUntil: -1,
  crosshair: null,
  nextDuck: 60,
  gain: { hits: 0, escaped: 0 },
  stats: "",
  tree: 0,
  round: 1
};
const rand2 = (a, b) => a + Math.random() * (b - a);
const pick2 = (list2) => list2[Math.floor(Math.random() * list2.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const roundOf = (hits) => Math.floor(hits / 10) + 1;
function fit(W5) {
  if (W5 === sim2.W) return;
  sim2.W = W5;
  sim2.tree = Math.max(2, Math.floor(W5 * 0.72));
  sim2.dogX = clamp(sim2.dogX, 0, W5 - 10);
  sim2.ducks = sim2.ducks.filter((d) => d.x < W5);
}
function banner(text, color, frames) {
  sim2.banner = { text, color, until: sim2.t + frames };
}
const glyph2 = (x, y, ch, life, color) => sim2.particles.push({ x, y, vx: 0, vy: 0, age: 0, life, color, ch });
function feathers(x, y) {
  for (let i = 0; i < 6; i++) {
    sim2.particles.push({ x, y, vx: rand2(-0.6, 0.6), vy: rand2(-0.6, 0.1), age: 0, life: Math.floor(rand2(10, 22)), color: pick2(FEATHER), gravity: 0.04 });
  }
}
function launch(isGame) {
  const x = clamp(Math.floor(rand2(4, sim2.W - 12)), 0, Math.max(0, sim2.W - 9));
  const duck = { x, y: SKY_BOTTOM, vx: pick2([-1, 1]) * rand2(0.5, 0.9), vy: -rand2(0.25, 0.45), state: "fly", since: sim2.t, isGame };
  sim2.ducks.push(duck);
  return duck;
}
function target() {
  return sim2.ducks.find((d) => d.state === "fly") ?? launch(true);
}
function shoot(duck, counts = true) {
  if (counts) duck.isGame = true;
  duck.state = "hit";
  duck.since = sim2.t;
  sim2.crosshair = { x: Math.round(duck.x + 3), y: Math.round(duck.y + 1), until: sim2.t + 10 };
  feathers(duck.x + 4, duck.y + 1);
}
function stepDucks() {
  for (const d of sim2.ducks) {
    const age2 = sim2.t - d.since;
    if (d.state === "fly") {
      d.x += d.vx;
      d.y += d.vy;
      if (d.x < 0 || d.x > sim2.W - 9) d.vx = -d.vx;
      if (d.y < 0 || d.y > SKY_BOTTOM) d.vy = -d.vy;
      if (Math.random() < 0.02) d.vy = -d.vy;
      if (age2 > 260) d.state = "away";
    } else if (d.state === "hit" && age2 > 8) {
      d.state = "fall";
      d.since = sim2.t;
    } else if (d.state === "fall") {
      d.y += 0.7;
      if (d.y >= GROUND) {
        d.y = PH;
        const caught = sim2.catch && sim2.t - sim2.catch.since < 10 ? sim2.catch.ducks + 1 : 1;
        sim2.catch = { ducks: Math.min(2, caught), x: clamp(Math.round(d.x), 0, sim2.W - 9), since: sim2.t };
        if (d.isGame) sim2.gain.hits += 1;
      }
    } else if (d.state === "away") {
      d.y -= 0.8;
      d.x += d.vx;
    }
  }
  sim2.ducks = sim2.ducks.filter((d) => d.y > -5 && d.y < PH && d.x > -9 && d.x < sim2.W + 1);
}
function flyAway(isPractice) {
  const duck = sim2.ducks.find((d) => d.state === "fly");
  if (duck) {
    duck.state = "away";
    duck.since = sim2.t;
    if (!isPractice) sim2.gain.escaped += 1;
    banner("FLY AWAY", GREY, 30);
  }
  sim2.laughUntil = sim2.t + 40;
}
function step2() {
  sim2.t += 1;
  const show = sim2.show && sim2.t < sim2.show.until ? sim2.show : null;
  const age2 = show ? SHOW_FRAMES2[show.kind] - (show.until - sim2.t) : 0;
  if (show) {
    if (show.kind === "shot" && age2 === 1) {
      const duck = sim2.ducks.find((d) => d.state === "fly");
      if (duck) shoot(duck, false);
      else {
        const x = Math.floor(rand2(4, sim2.W - 8));
        sim2.crosshair = { x, y: Math.floor(rand2(2, SKY_BOTTOM)), until: sim2.t + 6 };
        glyph2(x, Math.floor(rand2(0, 4)), "*", 6, SHOT);
      }
    }
    if (show.kind === "hunt" && age2 === 1) target();
    if (show.kind === "hunt" && age2 === 25) shoot(target());
    if ((show.kind === "double" || show.kind === "perfect") && age2 === 1) {
      launch(true);
      launch(true);
    }
    if ((show.kind === "double" || show.kind === "perfect") && (age2 === 25 || age2 === 35)) shoot(target());
    if (show.kind === "double" && age2 === 40) banner("DOUBLE!", SHOT, 50);
    if (show.kind === "perfect" && age2 === 40) banner("PERFECT!", BEAK, 70);
    if (show.kind === "perfect" && age2 > 40 && age2 % 6 === 0) feathers(rand2(2, sim2.W - 2), rand2(0, 6));
  }
  const isAsleep = !sim2.isTurn && sim2.working === 0 && sim2.t - sim2.lastActivity > SLEEP_AFTER;
  if (!isAsleep && !sim2.catch && sim2.laughUntil < sim2.t) {
    const speed = sim2.working > 0 ? 0.5 : sim2.isTurn ? 0.3 : 0.1;
    sim2.dogX += sim2.dogFace * speed;
    if (sim2.dogX < 0 || sim2.dogX > sim2.W - 10) sim2.dogFace = -sim2.dogFace;
  }
  if ((sim2.isTurn || sim2.working > 0) && !show && sim2.t >= sim2.nextDuck && !sim2.ducks.some((d) => d.state === "fly")) {
    launch(false);
    sim2.nextDuck = sim2.t + Math.floor(rand2(90, 200));
  }
  stepDucks();
  if (sim2.catch && sim2.t - sim2.catch.since > 45) sim2.catch = null;
  for (const p of sim2.particles) {
    p.age += 1;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity ?? 0;
  }
  sim2.particles = sim2.particles.filter((p) => p.age < p.life && p.x >= 0 && p.x < sim2.W && p.y >= 0 && p.y < PH);
  return isAsleep;
}
function put(buf, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= sim2.W || y < 0 || y >= PH) return;
  buf[y * sim2.W + x] = color;
}
function mask(buf, rows, x, y, color, isFlipped = false) {
  rows.forEach((row, dy) => {
    const w = row.length;
    for (let dx = 0; dx < w; dx++) {
      if (row[isFlipped ? w - 1 - dx : dx] === "#") put(buf, x + dx, y + dy, color);
    }
  });
}
function drawDuck(buf, d) {
  const isLeft = d.vx < 0;
  if (d.state === "hit") return mask(buf, DUCK_HIT, d.x, d.y, DUCK, isLeft);
  if (d.state === "fall") return mask(buf, DUCK_FALL, d.x, d.y, DUCK, isLeft);
  const isUp = Math.floor(sim2.t / 4) % 2 === 0;
  mask(buf, isUp ? DUCK_UP : DUCK_DOWN, d.x, d.y, DUCK, isLeft);
  for (const [hx, hy] of DUCK_HEAD_PIXELS) put(buf, isLeft ? d.x + 7 - hx : d.x + hx, d.y + hy, DUCK_HEAD);
  put(buf, isLeft ? d.x - 1 : d.x + 8, d.y + (isUp ? 1 : 0), BEAK);
}
function drawScene(buf) {
  const tx = sim2.tree;
  for (let y = GROUND - 7; y < GROUND; y++) {
    const half = y < GROUND - 4 ? 3 - Math.abs(GROUND - 6 - y) : 0;
    for (let dx = -half; dx <= half; dx++) put(buf, tx + dx, y, TREE);
  }
  for (let y = GROUND - 4; y < GROUND; y++) put(buf, tx, y, TRUNK);
  for (let x = 0; x < sim2.W; x++) {
    for (let y = GROUND; y < PH; y++) put(buf, x, y, GRASS);
    if (x * 7 % 5 < 2) put(buf, x, GROUND - 1, GRASS_DARK);
  }
}
function drawDog(buf, isAsleep) {
  if (sim2.catch) {
    const rise = Math.min(7, Math.floor((sim2.t - sim2.catch.since) / 2));
    const y2 = PH - 1 - rise;
    mask(buf, DOG_UP, sim2.catch.x, y2, DOG);
    for (let i = 0; i < sim2.catch.ducks; i++) mask(buf, DUCK_FALL, sim2.catch.x + (i === 0 ? -3 : 5), y2 - 3, DUCK);
    return;
  }
  if (sim2.laughUntil > sim2.t) {
    const bob = Math.floor(sim2.t / 3) % 2;
    mask(buf, DOG_LAUGH, sim2.dogX, PH - 8 + bob, DOG);
    return;
  }
  const y = GROUND - 5;
  if (isAsleep) {
    mask(buf, DOG_SLEEP, sim2.dogX, y, DOG);
    return;
  }
  const legs = DOG_WALK[Math.floor(sim2.t / 4) % 2];
  mask(buf, legs, sim2.dogX, y, DOG, sim2.dogFace < 0);
  put(buf, sim2.dogFace < 0 ? sim2.dogX + 2 : sim2.dogX + 6, y, DOG_DARK);
}
const statsLine2 = (s) => `R ${roundOf(s.hits)}  \u25BC ${s.hits}  \u2197 ${s.escaped}  \u2692 ${s.tools}`;
function frame2(isAsleep, stats) {
  const W5 = sim2.W;
  const buf = new Uint32Array(W5 * PH).fill(EMPTY);
  const over2 = /* @__PURE__ */ new Map();
  const text = (x, row, s, color) => [...s].forEach((ch, i) => {
    if (x + i >= 0 && x + i < W5) over2.set(row * W5 + x + i, { ch, color });
  });
  for (const d of sim2.ducks) drawDuck(buf, d);
  const isBehind = sim2.catch !== null || sim2.laughUntil > sim2.t;
  if (isBehind) drawDog(buf, isAsleep);
  drawScene(buf);
  if (!isBehind) drawDog(buf, isAsleep);
  if (sim2.crosshair && sim2.t < sim2.crosshair.until) {
    const { x, y } = sim2.crosshair;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, 0], [1, 0], [0, -1], [0, 1]]) put(buf, x + dx, y + dy, SHOT);
  }
  if (isAsleep) text(Math.round(sim2.dogX) + 9, Math.floor((GROUND - 4) / 2), "z", GREY);
  for (const p of sim2.particles) {
    if (p.ch) text(Math.round(p.x), Math.floor(Math.round(p.y) / 2), p.ch, p.color);
    else put(buf, p.x, p.y, p.color);
  }
  text(W5 - stats.length - 1, 0, stats, GREY);
  if (sim2.banner && sim2.t < sim2.banner.until && (sim2.banner.until - sim2.t) % 8 > 1) {
    text(Math.floor((W5 - sim2.banner.text.length) / 2), 1, sim2.banner.text, sim2.banner.color);
  }
  const words = new Uint32Array(W5 * ROWS2 * 3);
  for (let cy = 0; cy < ROWS2; cy++) {
    for (let cx = 0; cx < W5; cx++) {
      const i = (cy * W5 + cx) * 3;
      const top = buf[cy * 2 * W5 + cx];
      const bottom = buf[(cy * 2 + 1) * W5 + cx];
      const g = over2.get(cy * W5 + cx);
      if (g) {
        words[i] = g.ch.codePointAt(0);
        words[i + 1] = g.color;
        words[i + 2] = NONE2;
      } else if (top === EMPTY && bottom === EMPTY) {
        words[i] = 32;
        words[i + 1] = INK2;
        words[i + 2] = NONE2;
      } else if (top === bottom) {
        words[i] = 9608;
        words[i + 1] = top;
        words[i + 2] = NONE2;
      } else if (bottom === EMPTY) {
        words[i] = 9600;
        words[i + 1] = top;
        words[i + 2] = NONE2;
      } else if (top === EMPTY) {
        words[i] = 9604;
        words[i + 1] = bottom;
        words[i + 2] = NONE2;
      } else {
        words[i] = 9600;
        words[i + 1] = top;
        words[i + 2] = bottom;
      }
    }
  }
  return base642(new Uint8Array(words.buffer));
}
const B642 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base642(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    out += B642[n >> 18 & 63] + B642[n >> 12 & 63] + B642[n >> 6 & 63] + B642[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B642[n >> 18 & 63] + B642[n >> 12 & 63] + "==";
  } else if (rest === 2) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8;
    out += B642[n >> 18 & 63] + B642[n >> 12 & 63] + B642[n >> 6 & 63] + "=";
  }
  return out;
}
async function save($, change2) {
  const next = await update2($, score, change2);
  sim2.stats = statsLine2(next);
  await $.store.set("duck.score", next);
  return next;
}
const RANK = { shot: 0, hunt: 1, double: 2, perfect: 3 };
async function celebrate2($, label, show, isQuiet = false) {
  const running = sim2.show && sim2.t < sim2.show.until ? sim2.show.kind : null;
  if (running === null || RANK[show] >= RANK[running]) sim2.show = { kind: show, until: sim2.t + SHOW_FRAMES2[show] };
  sim2.lastActivity = sim2.t;
  const what = { shot: "a shot", hunt: "a duck down", double: "a double", perfect: "a perfect round" };
  await update2($, feat2, () => `${label}: ${what[show]}`);
  if (!isQuiet) {
    const say2 = {
      shot: "Bang",
      hunt: "Got one",
      double: "Two in one round",
      perfect: "Perfect"
    };
    void notify2($, `\u{1F986} ${label}! ${say2[show]}!`);
  }
}
const PERFECT = /* @__PURE__ */ new Set(["merge", "release", "deploy", "streak", "record", "squad"]);
async function onMilestone2($, tier, kind, label) {
  if (tier === "small") await celebrate2($, label, "shot", true);
  else if (tier === "medium") await celebrate2($, label, "hunt");
  else if (PERFECT.has(kind)) await celebrate2($, label, "perfect");
  else await celebrate2($, label, "double");
}
async function celebrateMoments2($, found) {
  for (const m of found) await onMilestone2($, m.tier, m.kind, m.label);
}
const start2 = async ($, e, next) => {
  const saved = await $.store.get("duck.score");
  if (saved) await update2($, score, () => saved);
  sim2.stats = statsLine2(saved ?? await read3($, score));
  sim2.round = roundOf((saved ?? await read3($, score)).hits);
  await $.command.register({
    name: "duck",
    description: 'The duck hunt above the prompt: the score. "/duck shot|hunt|double|perfect|flyaway" to show off.'
  });
  $.clock.every(FPS_MS2, () => {
    const requestId = sim2.requestId;
    if (requestId === null || sim2.W === 0) return;
    const isAsleep = step2();
    if (sim2.gain.hits > 0 || sim2.gain.escaped > 0) {
      const gain = sim2.gain;
      sim2.gain = { hits: 0, escaped: 0 };
      void save($, (old) => ({ ...old, hits: old.hits + gain.hits, escaped: old.escaped + gain.escaped })).then((s) => {
        const round = roundOf(s.hits);
        if (round > sim2.round) {
          sim2.round = round;
          banner(`ROUND ${round}`, BEAK, 60);
          void notify2($, `\u{1F986} Round ${round}: ${s.hits} ducks down.`);
        }
      });
    }
    if (sim2.isBlitting) return;
    sim2.isBlitting = true;
    void $.ui.blit({ requestId, key: RASTER2, cells: frame2(isAsleep, sim2.stats), columns: sim2.W }).then((r) => {
      if (r.deny !== void 0) sim2.requestId = null;
    }).finally(() => {
      sim2.isBlitting = false;
    });
  });
  return next(e);
};
const command2 = async ($, e) => {
  const arg = (e.args ?? "").trim();
  const practice = { shot: "shot", hunt: "hunt", double: "double", perfect: "perfect" };
  const show = practice[arg];
  if (show) {
    await celebrate2($, "Practice", show, true);
    return { text: "Practice: nothing counts." };
  }
  if (arg === "flyaway") {
    flyAway(true);
    return { text: "The duck gets away, and the dog laughs." };
  }
  const last2 = await read3($, feat2);
  return {
    text: `${statsLine2(await read3($, score))}${last2 ? `
Last win: ${last2}` : ""}
A medium moment (a commit, a skill, a sent message) shoots a duck down, a big one (a merge, a deploy, a finished task list) shoots two; a failed tool lets one get away. R is the round (ten ducks each), \u25BC ducks down, \u2197 ducks that got away, \u2692 tool calls.`
  };
};
const prompt2 = async ($, e, next) => {
  sim2.isTurn = true;
  sim2.lastActivity = sim2.t;
  return next(e);
};
const turn2 = async ($, e, next) => {
  if (e.agentId === void 0) sim2.isTurn = false;
  sim2.lastActivity = sim2.t;
  return next(e);
};
const tool2 = async ($, e, next) => {
  if (e.agentId !== void 0) return next(e);
  sim2.working += 1;
  sim2.lastActivity = sim2.t;
  const ran = await next(e).finally(() => {
    sim2.working = Math.max(0, sim2.working - 1);
    sim2.lastActivity = sim2.t;
  });
  if (ran.deny !== void 0) return ran;
  const counted = await update2($, score, (old) => ({ ...old, tools: old.tools + 1 }));
  sim2.stats = statsLine2(counted);
  if (counted.tools % 10 === 0) void $.store.set("duck.score", counted);
  if (ran.isError === true) flyAway(false);
  return ran;
};
const render2 = async ($, e, next) => {
  const below = await next(e);
  if (e.surface !== "terminal" || e.props.hasSurvey || !await isShown($, ID2)) {
    sim2.requestId = null;
    return below;
  }
  const { Box, Raster } = $.ui.resolve(e);
  fit(clamp(e.props.bodyColumns, MIN_COLUMNS, MAX_COLUMNS));
  sim2.requestId = e.requestId;
  sim2.stats = statsLine2(await read3($, score));
  return /* @__PURE__ */ h(Box, { flexDirection: "column" }, /* @__PURE__ */ h(Raster, { key: RASTER2, columns: sim2.W, rows: ROWS2, cells: frame2(false, sim2.stats) }), below ?? null);
};
const game2 = { id: ID2, title: "Duck Hunt" };

// src/games/jackpot.tsx
import { atom as atom4, read as read4, update as update3 } from "claude-code";

// src/games/jackpot-symbols.ts
const PALETTE = {
  R: 16726862,
  r: 11735594,
  Y: 16765773,
  y: 13211164,
  G: 5034109,
  g: 2328394,
  C: 6281471,
  c: 2789311,
  W: 16777215,
  P: 12614655,
  O: 16751165,
  K: 1381661
};
const SYMBOLS = {
  seven: ["RRRRRR", "RRRRRR", "...RR.", "..RR..", "..RR..", "..RR.."],
  dragon: ["G....G", "GG..GG", "GGGGGG", "G.GG.G", "GGGGGG", ".GGGG."],
  diamond: ["..CC..", ".CCCC.", "CCCCCC", "CCCCCC", ".CCCC.", "..CC.."],
  bell: ["..YY..", ".YYYY.", ".YYYY.", "YYYYYY", "......", "..YY.."],
  star: ["..PP..", "..PP..", "PPPPPP", ".PPPP.", ".P..P.", "P....P"],
  cherry: ["...GG.", "..G.G.", ".G..G.", "RR.RR.", "RR.RR.", "......"]
};
const SYMBOL_SIZE = 6;

// src/games/jackpot.tsx
const ID3 = "jackpot";
const RASTER3 = "machine";
const FPS_MS3 = 66;
const W = 28;
const H = 12;
const ROWS3 = H / 2;
const TOP = 3;
const WINDOW = SYMBOL_SIZE + 1;
const REEL_W = 8;
const PERIOD = SYMBOL_SIZE + 2;
const CLEAR = -1;
const DEFAULT = 16777216;
const bank = atom4({ plugin: "arcade", key: "jackpotBank" }, { chips: 0, spins: 0, jackpots: 0, best: 0, streak: 0 });
const golden = atom4({ plugin: "arcade", key: "jackpotGolden" }, 0);
const last = atom4({ plugin: "arcade", key: "jackpotLast" }, "");
async function notify3($, text) {
  if (!!await isShown($, ID3)) $.ui.toast(text);
}
const ORDER = ["seven", "dragon", "diamond", "bell", "star", "cherry"];
const TRIPLE_PAY = { seven: 100, dragon: 50, diamond: 25, bell: 15, star: 10, cherry: 8 };
const STRIPS = [
  ["cherry", "star", "seven", "bell", "cherry", "diamond", "star", "dragon", "bell", "cherry", "star", "diamond"],
  ["star", "cherry", "bell", "dragon", "cherry", "star", "seven", "diamond", "cherry", "bell", "star", "diamond"],
  ["bell", "diamond", "cherry", "star", "seven", "cherry", "bell", "star", "dragon", "cherry", "diamond", "star"]
];
const sim3 = {
  t: 0,
  queue: [],
  spin: null,
  reels: [0, 0, 0].map((_, i) => ({ from: i * 2 * PERIOD, to: i * 2 * PERIOD, start: -100, frames: 1, landedAt: -100 })),
  result: ["seven", "seven", "seven"],
  win: "none",
  winUntil: -1,
  payout: 0,
  coins: [],
  hadError: false,
  requestId: null,
  isBlitting: false,
  isLooping: false
};
const rand3 = (a, b) => a + Math.random() * (b - a);
const pick3 = (list2) => list2[Math.floor(Math.random() * list2.length)];
const cycle2 = (frames, n) => frames[Math.floor(sim3.t / n) % frames.length];
const multiplier = (streak) => Math.min(5, 1 + Math.floor(streak / 5));
function outcome(isGolden, roll = Math.random()) {
  const odds = isGolden ? { jackpot: 1 / 20, dragon: 1 / 10, triple: 1 / 4, pair: 1 } : { jackpot: 1 / 200, dragon: 1 / 80, triple: 1 / 15, pair: 1 / 3 };
  let edge = odds.jackpot;
  if (roll < edge) return ["seven", "seven", "seven"];
  edge += odds.dragon;
  if (roll < edge) return ["dragon", "dragon", "dragon"];
  edge += odds.triple;
  if (roll < edge) {
    const s = pick3(["diamond", "bell", "star", "cherry"]);
    return [s, s, s];
  }
  edge += odds.pair;
  if (roll < edge) {
    const s = pick3(ORDER);
    const other2 = pick3(ORDER.filter((o) => o !== s));
    const at = Math.floor(Math.random() * 3);
    return [0, 1, 2].map((i) => i === at ? other2 : s);
  }
  if (Math.random() < 0.2) return ["seven", "seven", pick3(ORDER.filter((o) => o !== "seven"))];
  const [a, b, c] = [...ORDER].sort(() => Math.random() - 0.5);
  return [a, b, c];
}
function score2(symbols) {
  const [a, b, c] = symbols;
  if (a === b && b === c) return { win: a === "seven" ? "jackpot" : "triple", pay: TRIPLE_PAY[a] };
  if (a === b || b === c || a === c) {
    const pair = a === b || a === c ? a : b;
    return { win: "pair", pay: pair === "cherry" ? 3 : 2 };
  }
  return { win: "none", pay: 0 };
}
function startSpin(spin) {
  sim3.spin = spin;
  sim3.win = "none";
  sim3.result = spin.forced ?? outcome(spin.isGolden);
  sim3.reels = sim3.reels.map((reel, i) => {
    const strip = STRIPS[i];
    const len = strip.length * PERIOD;
    const now = (reel.to % len + len) % len;
    const index = strip.indexOf(sim3.result[i]);
    const target2 = (2 + i) * len + index * PERIOD;
    return { from: now, to: target2, start: sim3.t, frames: 14 + i * 7, landedAt: -100 };
  });
}
function reelPos(reel, i) {
  const k = Math.min(1, (sim3.t - reel.start) / reel.frames);
  if (k >= 1) {
    if (reel.landedAt < 0) reel.landedAt = sim3.t;
    const since = sim3.t - reel.landedAt;
    return reel.to + ([-2, -1, 1, 0][since] ?? 0);
  }
  void i;
  return reel.from + (reel.to - reel.from) * (1 - (1 - k) ** 3);
}
async function finishSpin($) {
  const spin = sim3.spin;
  sim3.spin = null;
  const { win, pay } = score2(sim3.result);
  const before = await read4($, bank);
  const mult = multiplier(before.streak) * (spin.isGolden ? 2 : 1);
  const payout = spin.isPractice ? 0 : pay * mult;
  sim3.win = win;
  sim3.payout = payout;
  sim3.winUntil = sim3.t + (win === "jackpot" ? 75 : win === "triple" ? 40 : win === "pair" ? 18 : 6);
  if (win === "triple" || win === "jackpot") {
    for (let i = 0; i < (win === "jackpot" ? 30 : 12); i++) {
      sim3.coins.push({ x: rand3(4, W - 4), y: TOP + 4, vx: rand3(-0.6, 0.6), vy: rand3(-1.4, -0.7), age: 0 });
    }
  }
  if (spin.isPractice) return;
  const next = await update3($, bank, (old) => ({
    ...old,
    chips: old.chips + payout,
    spins: old.spins + 1,
    jackpots: old.jackpots + (win === "jackpot" ? 1 : 0),
    best: Math.max(old.best, payout)
  }));
  await $.store.set("jackpot.bank", next);
  const names = sim3.result.join(" ");
  await update3($, last, () => payout > 0 ? `${names}: +${payout}` : names);
  if (win === "jackpot") void notify3($, `\u{1F3B0} JACKPOT! 7 7 7 pays ${payout} chips`);
  else if (win === "triple") void notify3($, `\u{1F3B0} Three ${sim3.result[0]}s! +${payout} chips`);
}
function tick($) {
  sim3.t += 1;
  if (sim3.spin) {
    const isDone = sim3.reels.every((r) => sim3.t - r.start >= r.frames + 4);
    if (isDone) void finishSpin($);
  } else if (sim3.t >= sim3.winUntil && sim3.queue.length > 0) {
    const spin = sim3.queue.shift();
    if (spin.isGolden && !spin.isPractice) void update3($, golden, (n) => Math.max(0, n - 1));
    startSpin(spin);
  }
  for (const c of sim3.coins) {
    c.x += c.vx;
    c.y += c.vy;
    c.vy += 0.12;
    c.age += 1;
  }
  sim3.coins = sim3.coins.filter((c) => c.age < 30 && c.y < H && c.x >= 0 && c.x < W);
}
const hueColour = (hue) => {
  const f = (n) => {
    const k = (n + hue / 60) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return f(5) << 16 | f(3) << 8 | f(1);
};
function frame3() {
  const px = new Int32Array(W * H).fill(CLEAR);
  const over2 = /* @__PURE__ */ new Map();
  const set = (x, y, c) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi >= 0 && xi < W && yi >= 0 && yi < H) px[yi * W + xi] = c;
  };
  const isWinning = sim3.t < sim3.winUntil && sim3.win !== "none";
  const isJackpot = isWinning && sim3.win === "jackpot";
  const isSpinning = sim3.spin !== null;
  const body = isJackpot ? hueColour(sim3.t * 24 % 360) : 7032342;
  for (let y = TOP; y < H; y++) {
    for (let x = 0; x < W; x++) set(x, y, body);
  }
  const ring = [];
  for (let x = 0; x < W; x++) ring.push([x, TOP]);
  for (let y = TOP + 1; y < H - 1; y++) ring.push([W - 1, y]);
  for (let x = W - 1; x >= 0; x--) ring.push([x, H - 1]);
  for (let y = H - 2; y > TOP; y--) ring.push([0, y]);
  const speed = isSpinning ? 1 : 4;
  const phase = Math.floor(sim3.t / speed);
  ring.forEach(([x, y], i) => {
    let isOn = (i + phase) % 4 === 0;
    if (isWinning) isOn = sim3.win === "pair" ? Math.floor(sim3.t / 3) % 2 === 0 : (i + sim3.t) % 2 === 0;
    const lit = isJackpot ? hueColour((i * 20 + sim3.t * 30) % 360) : 16765773;
    set(x, y, isOn ? lit : 3811850);
  });
  sim3.reels.forEach((reel, i) => {
    const x0 = 1 + i * (REEL_W + 1);
    const strip = STRIPS[i];
    const len = strip.length * PERIOD;
    const pos = isSpinning || reel.landedAt >= 0 ? reelPos(reel, i) : reel.to;
    const isSlow = sim3.t - reel.start >= reel.frames;
    const flash = isWinning && sim3.win !== "pair" && Math.floor(sim3.t / 2) % 2 === 0;
    for (let r = 0; r < WINDOW; r++) {
      const at = ((Math.round(pos) + r - 1) % len + len) % len;
      const sym = strip[Math.floor(at / PERIOD)];
      const row = at % PERIOD;
      for (let c = 0; c < REEL_W; c++) {
        const x = x0 + c;
        const y = TOP + 1 + r;
        let colour = flash ? 3813138 : 1052696;
        if (row < SYMBOL_SIZE && c >= 1 && c <= SYMBOL_SIZE) {
          const letter = SYMBOLS[sym][row][c - 1];
          if (letter !== ".") colour = PALETTE[letter] ?? colour;
        }
        if (!isSlow && isSpinning && (r + sim3.t) % 2 === 0 && colour !== 1052696) colour = colour >> 1 & 8355711;
        set(x, y, colour);
      }
    }
  });
  for (const c of sim3.coins) set(c.x, c.y, (c.age + Math.round(c.x)) % 3 === 0 ? 16777215 : 16765773);
  if (isWinning) {
    const text = isJackpot ? sim3.payout > 0 ? cycle2(["JACKPOT!", `+${sim3.payout}`], 8) : "JACKPOT!" : sim3.payout > 0 ? `+${sim3.payout}` : "";
    const start8 = Math.floor((W - text.length) / 2);
    const fg = isJackpot ? hueColour(sim3.t * 40 % 360) : 16765773;
    text.split("").forEach((ch, i) => over2.set(start8 + i, { ch, fg }));
  } else if (sim3.queue.some((s) => s.isGolden) || sim3.spin?.isGolden) {
    "GOLDEN".split("").forEach((ch, i) => over2.set(11 + i, { ch, fg: cycle2([16765773, 16773800], 4) }));
  }
  const words = new Uint32Array(W * ROWS3 * 3);
  for (let cy = 0; cy < ROWS3; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const i = (cy * W + cx) * 3;
      const top = px[cy * 2 * W + cx];
      const bottom = px[(cy * 2 + 1) * W + cx];
      const o = over2.get(cy * W + cx);
      if (o) {
        words[i] = o.ch.codePointAt(0);
        words[i + 1] = o.fg;
        words[i + 2] = bottom === CLEAR ? DEFAULT : bottom;
      } else if (top === CLEAR && bottom === CLEAR) {
        words[i] = 32;
        words[i + 1] = DEFAULT;
        words[i + 2] = DEFAULT;
      } else if (top === bottom) {
        words[i] = 32;
        words[i + 1] = DEFAULT;
        words[i + 2] = top;
      } else if (top === CLEAR) {
        words[i] = 9604;
        words[i + 1] = bottom;
        words[i + 2] = DEFAULT;
      } else {
        words[i] = 9600;
        words[i + 1] = top;
        words[i + 2] = bottom === CLEAR ? DEFAULT : bottom;
      }
    }
  }
  return base643(new Uint8Array(words.buffer));
}
const B643 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base643(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    out += B643[n >> 18 & 63] + B643[n >> 12 & 63] + B643[n >> 6 & 63] + B643[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B643[n >> 18 & 63] + B643[n >> 12 & 63] + "==";
  } else if (rest === 2) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8;
    out += B643[n >> 18 & 63] + B643[n >> 12 & 63] + B643[n >> 6 & 63] + "=";
  }
  return out;
}
const statsLine3 = (b, g) => `\u25C9 ${b.chips}  \xD7${multiplier(b.streak)}  \u25B2 ${b.streak}  \u2726 ${g}  \u265B ${b.jackpots}`;
function startLoop($) {
  if (sim3.isLooping) return;
  sim3.isLooping = true;
  $.clock.every(FPS_MS3, () => {
    tick($);
    const requestId = sim3.requestId;
    if (requestId === null || sim3.isBlitting) return;
    sim3.isBlitting = true;
    void $.ui.blit({ requestId, key: RASTER3, cells: frame3() }).then((r) => {
      if (r.deny !== void 0) sim3.requestId = null;
    }).finally(() => {
      sim3.isBlitting = false;
    });
  });
}
const pull = ($, spin) => {
  sim3.queue.push(spin);
  startLoop($);
};
async function onMilestone3($, tier, _kind, label) {
  const spins = tier === "big" ? 3 : tier === "medium" ? 1 : 0;
  if (spins === 0) return;
  for (let i = 0; i < spins; i++) pull($, { isGolden: true, isPractice: false });
  await update3($, golden, (n) => n + spins);
  void notify3($, `\u2726 ${label}: ${spins} golden spin${spins > 1 ? "s" : ""} queued`);
}
async function celebrateMoments3($, found) {
  for (const m of found) await onMilestone3($, m.tier, m.kind, m.label);
}
const start3 = async ($, e, next) => {
  const saved = await $.store.get("jackpot.bank");
  if (saved) await update3($, bank, () => ({ ...saved, streak: saved.streak ?? 0 }));
  await $.command.register({
    name: "jackpot",
    description: 'The slot machine above the prompt: your chips. "/jackpot spin|golden|demo" to try it.'
  });
  startLoop($);
  return next(e);
};
const prompt3 = async ($, e, next) => {
  const ran = await next(e);
  return ran;
};
const command3 = async ($, e) => {
  const arg = (e.args ?? "").trim();
  if (arg === "spin") {
    pull($, { isGolden: false, isPractice: true });
    return { text: "A practice pull: it pays nothing." };
  }
  if (arg === "golden") {
    pull($, { isGolden: true, isPractice: true });
    return { text: "A practice golden pull: it pays nothing." };
  }
  if (arg === "demo") {
    pull($, { isGolden: true, isPractice: true, forced: ["seven", "seven", "seven"] });
    return { text: "A practice jackpot: it pays nothing." };
  }
  const b = await read4($, bank);
  const g = await read4($, golden);
  const l = await read4($, last);
  return {
    text: `${statsLine3(b, g)}
${b.spins} spins, best win ${b.best}.${l ? ` Last: ${l}.` : ""}
Every finished turn pulls the lever. A medium moment (a commit, a skill, a sent message) earns a golden spin (better odds, double pay); a big one (a merge, a deploy, a finished task list, a PDF made) earns 3. Five clean turns in a row raise the multiplier, up to \xD75; a tool error resets it.`
  };
};
const tool3 = async ($, e, next) => {
  const ran = await next(e);
  if (ran.deny !== void 0) return ran;
  if (ran.isError === true) {
    sim3.hadError = true;
    return ran;
  }
  return ran;
};
const turn3 = async ($, e, next) => {
  const ran = await next(e);
  if (e.agentId !== void 0 || e.isAborted) return ran;
  const hadError = sim3.hadError;
  sim3.hadError = false;
  const b = await update3($, bank, (old) => ({ ...old, streak: hadError ? 0 : old.streak + 1 }));
  await $.store.set("jackpot.bank", b);
  pull($, { isGolden: false, isPractice: false });
  return ran;
};
const render3 = async ($, e, next) => {
  const below = await next(e);
  if (e.surface !== "terminal" || e.props.hasSurvey || !await isShown($, ID3)) {
    sim3.requestId = null;
    return below;
  }
  const { Box, Raster, Text } = $.ui.resolve(e);
  sim3.requestId = e.requestId;
  startLoop($);
  const b = await read4($, bank);
  const g = await read4($, golden);
  return /* @__PURE__ */ h(Box, { flexDirection: "row", alignItems: "flex-end" }, /* @__PURE__ */ h(Box, { flexGrow: 1, flexDirection: "column" }, below ?? null), /* @__PURE__ */ h(Box, { flexDirection: "column", flexShrink: 0, minWidth: W, marginLeft: 2 }, /* @__PURE__ */ h(Raster, { key: RASTER3, columns: W, rows: ROWS3, cells: frame3() }), /* @__PURE__ */ h(Text, { key: "stats", dimColor: true, wrap: "truncate" }, statsLine3(b, g))));
};
const game3 = { id: ID3, title: "Jackpot" };

// src/games/octo-invader.tsx
import { atom as atom5, read as read5, update as update4 } from "claude-code";

// src/games/octo-sprite.ts
const OCTO_WIDTH = 16;
const OCTO_HEIGHT = 12;
const HEAD2 = [
  "......####......",
  "...##########...",
  "..############..",
  ".##############.",
  ".###..####..###.",
  ".###..####..###.",
  ".##############.",
  "..############.."
];
const HEAD_SHUT = [...HEAD2.slice(0, 4), ".##############.", ...HEAD2.slice(5)];
const LEGS2 = {
  stand: [
    "..##.##..##.##..",
    "..#..#....#..#..",
    ".#...#....#...#.",
    ".#...#....#...#."
  ],
  walkA: [
    "..##.##..##.##..",
    ".##..#....#..##.",
    "#...##....##...#",
    "#..#........#..#"
  ],
  walkB: [
    "..##.##..##.##..",
    "..#..##..##..#..",
    ".#...#....#...#.",
    ".#..#......#..#."
  ],
  // Tentacles trail below while it flies.
  fly: [
    "..#.#.#..#.#.#..",
    "..#.#.#..#.#.#..",
    "...#.#.##.#.#...",
    "...#.#....#.#..."
  ],
  // Spread wide to stomp a building.
  smash: [
    "#.##.##..##.##.#",
    "#.#...#..#...#.#",
    "..#...#..#...#..",
    ".#....#..#....#."
  ],
  curl: [
    ".#.##.#..#.##.#.",
    "#.#..#.##.#..#.#",
    "................",
    "................"
  ]
};
function octopus(legs, isShut) {
  return [...isShut ? HEAD_SHUT : HEAD2, ...LEGS2[legs]];
}
const BABY2 = [
  [".###.", "#.#.#", "#####", "#.#.#"],
  [".###.", "#.#.#", "#####", ".#.#."]
];
const PLANE = [
  ".#.......",
  ".##....#.",
  "########.",
  "...##...."
];
const FLAG = ["####", "###.", "#...", "#...", "#..."];

// src/games/octo-invader.tsx
const ID4 = "octopus";
const RASTER4 = "city";
const ROWS4 = 8;
const PH2 = ROWS4 * 2;
const FPS_MS4 = 66;
const MIN_COLUMNS2 = 24;
const MAX_COLUMNS2 = 512;
const INK3 = 16777216;
const NONE3 = 16777216;
const EMPTY2 = 4294967295;
const OCTO = 12602584;
const BABY_INK = 14715620;
const WINDOW2 = 15909424;
const GREY2 = 9079434;
const FIRE = [16742938, 16765503, 14692657];
const SQUIRT = 8011680;
const AIRCRAFT = 4886745;
const RED = 14692657;
const GROUND_Y = PH2 - OCTO_HEIGHT;
const HOVER_Y = 1;
const FLY_Y = 0;
const score3 = atom5({ plugin: "arcade", key: "octopusScore" }, { xp: 0, toppled: 0, planes: 0, tools: 0 });
const mood2 = atom5({ plugin: "arcade", key: "octopusMood" }, "idle");
const feat3 = atom5({ plugin: "arcade", key: "octopusFeat" }, "");
async function notify4($, text) {
  if (!!await isShown($, ID4)) $.ui.toast(text);
}
const SHOW_FRAMES3 = { ink: 24, plane: 260, rampage: 110, conquer: 150 };
function workOf2(tool8) {
  if (tool8 === "Read") return "read";
  if (tool8 === "Grep" || tool8 === "Glob" || tool8 === "LSP") return "search";
  if (tool8 === "Edit" || tool8 === "Write" || tool8 === "NotebookEdit") return "edit";
  if (tool8 === "WebFetch" || tool8 === "WebSearch" || tool8.startsWith("mcp__")) return "web";
  if (tool8 === "Agent" || tool8 === "Task") return "agent";
  return "bash";
}
const sim4 = {
  t: 0,
  lastActivity: 0,
  isTurn: false,
  working: [],
  show: null,
  sadUntil: -1,
  alertUntil: -1,
  level: 1,
  W: 0,
  requestId: null,
  isBlitting: false,
  mood: "idle",
  ox: 4,
  oy: HOVER_Y,
  face: 1,
  wanderX: 4,
  isMoving: false,
  isSmashing: false,
  city: [],
  target: -1,
  planes: [],
  particles: [],
  babies: [],
  banner: null,
  flag: null,
  nextAmbient: 300,
  gain: { toppled: 0, planes: 0 }
};
const rand4 = (a, b) => a + Math.random() * (b - a);
const pick4 = (list2) => list2[Math.floor(Math.random() * list2.length)];
const levelOf2 = (xp) => Math.floor(Math.sqrt(xp / 10)) + 1;
const every2 = (n) => sim4.t % n === 0;
const cycle3 = (frames, n) => frames[Math.floor(sim4.t / n) % frames.length];
const clamp2 = (v, a, b) => Math.max(a, Math.min(b, v));
function buildCity(from, to) {
  const out = [];
  let x = from + Math.floor(rand4(1, 4));
  while (x < to - 3) {
    const w = Math.floor(rand4(4, 9));
    const full = Math.floor(rand4(4, 10));
    out.push({ x, w: Math.min(w, to - x), h: full, full, seed: Math.floor(rand4(0, 1e6)), downAt: -1 });
    x += w + Math.floor(rand4(1, 4));
  }
  return out;
}
function fitCity(W5) {
  if (W5 === sim4.W) return;
  const old = sim4.W;
  sim4.W = W5;
  if (W5 > old) {
    const end = sim4.city.reduce((m, b) => Math.max(m, b.x + b.w), 0);
    sim4.city.push(...buildCity(end, W5));
  } else {
    sim4.city = sim4.city.filter((b) => b.x + b.w <= W5);
  }
  sim4.target = -1;
  sim4.ox = clamp2(sim4.ox, 0, W5 - OCTO_WIDTH);
  sim4.wanderX = clamp2(sim4.wanderX, 0, W5 - OCTO_WIDTH);
}
const isStanding = (b) => b.h > 2;
function rebuild() {
  const isAllDown = sim4.city.every((b) => !isStanding(b));
  const wait = isAllDown ? 60 : 45 * 1e3 / FPS_MS4;
  for (let i = 0; i < sim4.city.length; i++) {
    const b = sim4.city[i];
    if (b.h >= b.full || i === sim4.target || sim4.t - b.downAt < wait) continue;
    if (every2(12)) b.h += 1;
  }
}
const glyph3 = (x, y, ch, life, color, vx = 0, vy = 0) => sim4.particles.push({ x, y, vx, vy, age: 0, life, color, ch });
const pixel2 = (x, y, vx, vy, life, color, gravity = 0) => sim4.particles.push({ x, y, vx, vy, age: 0, life, color, gravity });
const word = (x, y, text, life, color) => [...text].forEach((ch, i) => glyph3(x + i, y, ch, life, color));
function boom(x, y, size) {
  for (let i = 0; i < size; i++) {
    const a = rand4(Math.PI, Math.PI * 2);
    const v = rand4(0.4, 1.3);
    pixel2(x, y, Math.cos(a) * v * 1.6, Math.sin(a) * v, Math.floor(rand4(6, 14)), pick4(FIRE), 0.08);
  }
}
function banner2(text, color, frames) {
  sim4.banner = { text, color, until: sim4.t + frames };
}
function activity2() {
  const { t } = sim4;
  if (sim4.show && t < sim4.show.until) return sim4.show.kind;
  if (t < sim4.sadUntil) return "sad";
  if (t < sim4.alertUntil) return "alert";
  const last2 = sim4.working[sim4.working.length - 1];
  if (last2) return last2.work;
  if (sim4.isTurn) return "think";
  if (t - sim4.lastActivity > 120 * 1e3 / FPS_MS4) return "sleep";
  return "idle";
}
function moodOf2(a) {
  if (a === "plane" || a === "rampage" || a === "conquer" || a === "ink") return "rampage";
  if (a === "sad" || a === "sleep" || a === "idle") return a;
  return "work";
}
function moveTo(tx, ty, speed) {
  tx = clamp2(tx, 0, sim4.W - OCTO_WIDTH);
  const dx = tx - sim4.ox;
  const dy = ty - sim4.oy;
  sim4.isMoving = Math.abs(dx) > 0.5;
  if (sim4.isMoving) {
    sim4.face = dx > 0 ? 1 : -1;
    sim4.ox += Math.sign(dx) * Math.min(speed, Math.abs(dx));
  }
  if (Math.abs(dy) > 0.1) sim4.oy += Math.sign(dy) * Math.min(0.5, Math.abs(dy));
  return !sim4.isMoving && Math.abs(dy) <= 0.1;
}
function wander(speed, ty) {
  if (every2(150)) sim4.wanderX = rand4(0, sim4.W - OCTO_WIDTH);
  moveTo(sim4.wanderX, ty, speed);
}
function nearest() {
  let best = -1;
  let gap = Infinity;
  const centre = sim4.ox + OCTO_WIDTH / 2;
  sim4.city.forEach((b, i) => {
    if (!isStanding(b)) return;
    const d = Math.abs(b.x + b.w / 2 - centre);
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}
function smash(rate, speed, isBig) {
  let b = sim4.city[sim4.target];
  if (!b || !isStanding(b)) {
    sim4.target = nearest();
    b = sim4.city[sim4.target];
  }
  if (!b) {
    wander(speed, GROUND_Y);
    return;
  }
  const isRight = b.x + b.w / 2 > sim4.ox + OCTO_WIDTH / 2;
  const tx = isRight ? b.x - OCTO_WIDTH + 3 : b.x + b.w - 3;
  const isThere = moveTo(tx, GROUND_Y, speed);
  if (!isThere) return;
  sim4.face = isRight ? 1 : -1;
  sim4.isSmashing = true;
  if (sim4.t % rate !== 0) return;
  const top = PH2 - b.h;
  for (let i = 0; i < (isBig ? 6 : 3); i++) pixel2(rand4(b.x, b.x + b.w), top, rand4(-0.7, 0.7), rand4(-0.9, -0.2), 14, GREY2, 0.12);
  b.h -= 1;
  if (!isStanding(b)) {
    b.h = 1;
    b.downAt = sim4.t;
    sim4.gain.toppled += 1;
    boom(b.x + b.w / 2, PH2 - 2, isBig ? 12 : 6);
    word(Math.max(0, Math.round(b.x + b.w / 2 - 3)), PH2 - 8, "CRASH!", 10, RED);
    sim4.target = -1;
  }
}
function launch2(isHunted) {
  const fromLeft = isHunted ? sim4.ox > sim4.W / 2 : Math.random() < 0.5;
  const reach = isHunted ? Math.min(70, sim4.W) : sim4.W;
  const x = fromLeft ? Math.max(-PLANE[0].length, sim4.ox - reach) : Math.min(sim4.W, sim4.ox + reach);
  sim4.planes.push({ x, y: isHunted ? 0 : Math.floor(rand4(0, 2)), vx: fromLeft ? 0.9 : -0.9, vy: 0, state: "fly", isHunted, since: sim4.t });
}
function stepPlanes() {
  const pw = PLANE[0].length;
  for (const p of sim4.planes) {
    if (p.state === "fly") {
      p.x += p.vx;
      if (every2(4)) pixel2(p.vx > 0 ? p.x - 1 : p.x + pw, p.y + 2, 0, 0, 6, GREY2);
      if (p.isHunted && Math.abs(p.x + pw / 2 - (sim4.ox + OCTO_WIDTH / 2)) < 4 && sim4.oy < 2) {
        p.state = "held";
        p.since = sim4.t;
        word(Math.round(sim4.ox + OCTO_WIDTH), 0, "GOTCHA", 10, RED);
      }
    } else if (p.state === "held") {
      p.x = sim4.ox + (OCTO_WIDTH - pw) / 2;
      p.y = sim4.oy + OCTO_HEIGHT - 2;
      if (sim4.t - p.since > 12) {
        p.state = "fall";
        p.vx = sim4.face * 1.1;
        p.vy = -0.4;
      }
    } else {
      p.x += p.vx;
      p.vy += 0.07;
      p.y += p.vy;
      if (every2(2)) pixel2(p.x + pw / 2, p.y, rand4(-0.2, 0.2), -0.2, 10, pick4([GREY2, ...FIRE]));
      if (p.y >= PH2 - 4) {
        boom(p.x + pw / 2, PH2 - 2, 16);
        word(Math.max(0, Math.round(p.x)), PH2 - 8, "BOOM!", 12, RED);
        sim4.gain.planes += 1;
        p.state = "fly";
        p.x = -1e3;
        if (sim4.show?.kind === "plane") sim4.show.until = Math.min(sim4.show.until, sim4.t + 25);
      }
    }
  }
  sim4.planes = sim4.planes.filter((p) => p.x > -pw - 2 && p.x < sim4.W + 2);
}
const showLeft2 = () => sim4.show ? sim4.show.until - sim4.t : 0;
const showAge = () => sim4.show ? SHOW_FRAMES3[sim4.show.kind] - showLeft2() : 0;
function step3(a) {
  sim4.isMoving = false;
  sim4.isSmashing = false;
  const head = { x: sim4.ox + OCTO_WIDTH / 2, y: sim4.oy };
  switch (a) {
    case "idle":
      wander(0.25, HOVER_Y + cycle3([0, 0, 1, 1], 8));
      if (every2(140)) pixel2(head.x, head.y + 4, 0, -0.2, 8, SQUIRT);
      break;
    case "alert":
      moveTo(sim4.ox, GROUND_Y - cycle3([2, 3, 2, 0], 3), 0);
      break;
    case "think":
      moveTo(sim4.ox, HOVER_Y + cycle3([0, 1], 10), 0);
      if (every2(8)) {
        const k = Math.floor(sim4.t / 8) % 3;
        glyph3(sim4.ox + OCTO_WIDTH + k, Math.max(0, sim4.oy - k), [".", "o", "O"][k], 8, GREY2);
      }
      break;
    case "read":
      wander(0.3, GROUND_Y);
      break;
    case "search":
      wander(0.6, GROUND_Y);
      if (every2(12)) glyph3(head.x, Math.max(0, sim4.oy - 2), "?", 12, INK3);
      break;
    case "edit":
      smash(8, 0.8, false);
      break;
    case "bash":
      smash(5, 1, false);
      break;
    case "web":
      wander(1.2, FLY_Y + cycle3([0, 1], 6));
      if (every2(2)) glyph3(sim4.face > 0 ? sim4.ox - 1 : sim4.ox + OCTO_WIDTH, sim4.oy + rand4(2, 10), "~", 5, GREY2, -sim4.face * 0.6, 0);
      break;
    case "agent":
      moveTo(sim4.ox, HOVER_Y, 0);
      break;
    case "sad":
      moveTo(sim4.ox + cycle3([1, -1], 2), GROUND_Y, 1);
      if (every2(4)) glyph3(head.x + cycle3([-3, 0, 3, 0], 4), Math.max(0, sim4.oy - 1), "*", 4, WINDOW2);
      break;
    case "sleep":
      moveTo(sim4.ox, GROUND_Y + 2, 0.2);
      if (every2(24)) glyph3(sim4.ox + OCTO_WIDTH, sim4.oy, pick4(["z", "Z"]), 30, GREY2, 0.12, -0.06);
      break;
    case "ink":
      moveTo(sim4.ox + sim4.face * 0.3, sim4.oy, 0.3);
      if (showLeft2() > 6) {
        for (let i = 0; i < 2; i++) pixel2(sim4.face > 0 ? sim4.ox : sim4.ox + OCTO_WIDTH, sim4.oy + rand4(8, 12), -sim4.face * rand4(0.6, 1.4), rand4(-0.3, 0.3), 12, SQUIRT);
      }
      break;
    case "plane": {
      if (showAge() === 1) launch2(true);
      const hunted = sim4.planes.find((p) => p.isHunted);
      if (hunted && hunted.state === "fly") moveTo(hunted.x + PLANE[0].length / 2 - OCTO_WIDTH / 2 + hunted.vx * 4, FLY_Y, 1.4);
      else moveTo(sim4.ox, HOVER_Y, 0.5);
      break;
    }
    case "rampage":
      smash(2, 1.6, true);
      if (every2(3)) glyph3(rand4(0, sim4.W), rand4(0, PH2 - 8), pick4(["*", "+", "\u2726"]), 5, pick4(FIRE));
      if (showAge() === 1) banner2("RAMPAGE!", RED, 40);
      break;
    case "conquer":
      if (showLeft2() > 60) {
        smash(2, 1.8, true);
        if (every2(3)) glyph3(rand4(0, sim4.W), rand4(0, PH2 - 8), pick4(["*", "+", "\u2726"]), 5, pick4(FIRE));
      } else {
        moveTo(sim4.ox, GROUND_Y - cycle3([0, 1], 4), 0);
        if (showLeft2() === 60) {
          sim4.flag = { x: Math.round(sim4.face > 0 ? sim4.ox + OCTO_WIDTH + 1 : sim4.ox - 5), until: sim4.t + 600 };
          banner2("THE CITY IS MINE", RED, 60);
          boom(sim4.ox + OCTO_WIDTH / 2, PH2 - 2, 20);
        }
      }
      break;
  }
  stepPlanes();
  rebuild();
  stepBabies2();
  if (sim4.show === null || sim4.t >= sim4.show.until) {
    if (sim4.t >= sim4.nextAmbient && sim4.planes.length === 0) {
      launch2(false);
      sim4.nextAmbient = sim4.t + rand4(600, 1200);
    }
  }
  if (sim4.flag && sim4.t > sim4.flag.until) sim4.flag = null;
  for (const p of sim4.particles) {
    p.x += p.vx;
    p.vy += p.gravity ?? 0;
    p.y += p.vy;
    p.age += 1;
  }
  sim4.particles = sim4.particles.filter((p) => p.age < p.life && p.x >= 0 && p.x < sim4.W && p.y >= 0 && p.y < PH2);
}
function hatch2(key, description, type, id) {
  if (sim4.babies.some((b) => b.key === key || id !== void 0 && b.id === id)) return;
  sim4.babies.push({ key, id, description, type, state: "swim", since: sim4.t, lastTool: -100, y: 0 });
  glyph3(sim4.ox, sim4.oy + 6, "\u2726", 6, BABY_INK);
}
function stepBabies2() {
  for (const b of sim4.babies) if (b.state === "fall") b.y += 0.6;
  sim4.babies = sim4.babies.filter((b) => {
    if (b.state === "home" && sim4.t - b.since >= 14) return false;
    return !(b.state === "fall" && b.y > PH2);
  });
}
function drawBabies2(buf) {
  sim4.babies.slice(0, 6).forEach((b, i) => {
    const isBusy = sim4.t - b.lastTool < 15;
    const frame8 = BABY2[Math.floor(sim4.t / (isBusy ? 2 : 5)) % 2];
    let x = sim4.ox + (sim4.face > 0 ? -7 * (i + 1) : OCTO_WIDTH + 2 + 7 * i);
    let y = Math.min(PH2 - 4, sim4.oy + 4 + i % 2 * 3 + cycle3([0, 1], isBusy ? 3 : 6));
    if (b.state === "home") {
      const k = Math.min(1, (sim4.t - b.since) / 14);
      x += (sim4.ox + OCTO_WIDTH / 2 - x) * k;
      y += (sim4.oy + 4 - y) * k;
    }
    if (b.state === "fall") y += b.y;
    mask2(buf, frame8, x, y, BABY_INK, sim4.face < 0);
  });
}
function put2(buf, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= sim4.W || y < 0 || y >= PH2) return;
  buf[y * sim4.W + x] = color;
}
function mask2(buf, rows, x, y, color, isFlipped = false) {
  rows.forEach((row, dy) => {
    const w = row.length;
    for (let dx = 0; dx < w; dx++) {
      if (row[isFlipped ? w - 1 - dx : dx] === "#") put2(buf, x + dx, y + dy, color);
    }
  });
}
function legsOf(a) {
  if (a === "sleep") return "curl";
  if (sim4.isSmashing) return cycle3(["smash", "stand"], 2);
  if (sim4.oy < GROUND_Y - 1) return a === "idle" || a === "think" || a === "agent" ? cycle3(["fly", "stand"], 8) : "fly";
  if (sim4.isMoving) return cycle3(["walkA", "stand", "walkB", "stand"], 3);
  return "stand";
}
function drawCity(buf) {
  for (const b of sim4.city) {
    if (!isStanding(b)) {
      for (let dx = 0; dx < b.w; dx++) {
        put2(buf, b.x + dx, PH2 - 1, GREY2);
        if ((b.seed + dx) % 3 === 0) put2(buf, b.x + dx, PH2 - 2, GREY2);
      }
      continue;
    }
    for (let dy = 0; dy < b.h; dy++) {
      const y = PH2 - 1 - dy;
      for (let dx = 0; dx < b.w; dx++) {
        const isWindow = dx > 0 && dx < b.w - 1 && dx % 2 === 1 && dy % 2 === 1 && dy < b.h - 1;
        if (!isWindow) put2(buf, b.x + dx, y, INK3);
        else if ((b.seed + dx * 7 + dy * 13) % 3 === 0) put2(buf, b.x + dx, y, WINDOW2);
      }
    }
  }
}
const statsLine4 = (s) => `Lv ${levelOf2(s.xp)}  \u2302 ${s.toppled}  \u2708 ${s.planes}  \u2692 ${s.tools}`;
function frame4(a, stats) {
  const W5 = sim4.W;
  const buf = new Uint32Array(W5 * PH2).fill(EMPTY2);
  const over2 = /* @__PURE__ */ new Map();
  const text = (x, row, s, color) => [...s].forEach((ch, i) => {
    if (x + i >= 0 && x + i < W5) over2.set(row * W5 + x + i, { ch, color });
  });
  drawCity(buf);
  if (sim4.flag) {
    mask2(buf, FLAG.map((r) => r.slice(0, 1)), sim4.flag.x, PH2 - 7, INK3);
    mask2(buf, FLAG.slice(0, 2).map((r) => "." + r.slice(1)), sim4.flag.x, PH2 - 7, RED);
  }
  for (const p of sim4.planes) mask2(buf, PLANE, p.x, p.y, AIRCRAFT, p.vx < 0);
  drawBabies2(buf);
  const isShut = a === "sleep" || sim4.t % 55 < 2;
  const shake = a === "rampage" || a === "conquer" ? cycle3([0, 1], 1) : 0;
  mask2(buf, octopus(legsOf(a), isShut), sim4.ox, sim4.oy - shake, OCTO, sim4.face < 0);
  for (const p of sim4.particles) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (p.ch) text(x, Math.floor(y / 2), p.ch, p.color);
    else put2(buf, x, y, p.color);
  }
  text(W5 - stats.length - 1, 0, stats, GREY2);
  if (sim4.banner && sim4.t < sim4.banner.until && (sim4.banner.until - sim4.t) % 8 > 1) {
    text(Math.floor((W5 - sim4.banner.text.length) / 2), 1, sim4.banner.text, sim4.banner.color);
  }
  const words = new Uint32Array(W5 * ROWS4 * 3);
  for (let cy = 0; cy < ROWS4; cy++) {
    for (let cx = 0; cx < W5; cx++) {
      const i = (cy * W5 + cx) * 3;
      const top = buf[cy * 2 * W5 + cx];
      const bottom = buf[(cy * 2 + 1) * W5 + cx];
      const g = over2.get(cy * W5 + cx);
      if (g) {
        words[i] = g.ch.codePointAt(0);
        words[i + 1] = g.color;
        words[i + 2] = NONE3;
      } else if (top === EMPTY2 && bottom === EMPTY2) {
        words[i] = 32;
        words[i + 1] = INK3;
        words[i + 2] = NONE3;
      } else if (top === bottom) {
        words[i] = 9608;
        words[i + 1] = top;
        words[i + 2] = NONE3;
      } else if (bottom === EMPTY2) {
        words[i] = 9600;
        words[i + 1] = top;
        words[i + 2] = NONE3;
      } else if (top === EMPTY2) {
        words[i] = 9604;
        words[i + 1] = bottom;
        words[i + 2] = NONE3;
      } else {
        words[i] = 9600;
        words[i + 1] = top;
        words[i + 2] = bottom;
      }
    }
  }
  return base644(new Uint8Array(words.buffer));
}
const B644 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base644(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    out += B644[n >> 18 & 63] + B644[n >> 12 & 63] + B644[n >> 6 & 63] + B644[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B644[n >> 18 & 63] + B644[n >> 12 & 63] + "==";
  } else if (rest === 2) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8;
    out += B644[n >> 18 & 63] + B644[n >> 12 & 63] + B644[n >> 6 & 63] + "=";
  }
  return out;
}
let lastStats = statsLine4({ xp: 0, toppled: 0, planes: 0, tools: 0 });
async function save2($, change2) {
  const next = await update4($, score3, change2);
  lastStats = statsLine4(next);
  await $.store.set("octopus.score", next);
  return next;
}
const RANK2 = { ink: 0, plane: 1, rampage: 2, conquer: 3 };
async function celebrate3($, label, xp, show, isQuiet = false) {
  const running = sim4.show && sim4.t < sim4.show.until ? sim4.show.kind : null;
  if (running === null || RANK2[show] >= RANK2[running]) sim4.show = { kind: show, until: sim4.t + SHOW_FRAMES3[show] };
  sim4.lastActivity = sim4.t;
  const before = levelOf2((await read5($, score3)).xp);
  const next = await save2($, (old) => ({ ...old, xp: old.xp + xp }));
  const after = levelOf2(next.xp);
  await update4($, feat3, () => `${label}: +${xp} xp`);
  if (after > before) {
    sim4.level = after;
    banner2(`LEVEL ${after}`, OCTO, 60);
    void notify4($, `\u{1F419} ${label}! The octopus grows to level ${after}!`);
  } else if (!isQuiet) {
    const what = {
      ink: "squirts ink",
      plane: "pulls a plane out of the sky",
      rampage: "goes on a rampage",
      conquer: "takes the city"
    };
    void notify4($, `\u{1F419} ${label}! The octopus ${what[show]}`);
  }
}
const CONQUESTS = /* @__PURE__ */ new Set(["merge", "release", "deploy", "streak", "record", "squad"]);
async function onMilestone4($, tier, kind, label) {
  if (tier === "small") await celebrate3($, label, 1, "ink", true);
  else if (tier === "medium") await celebrate3($, label, 5, "plane");
  else if (CONQUESTS.has(kind)) await celebrate3($, label, 50, "conquer");
  else await celebrate3($, label, 25, "rampage");
}
async function celebrateMoments4($, found) {
  for (const m of found) await onMilestone4($, m.tier, m.kind, m.label);
}
const start4 = async ($, e, next) => {
  const saved = await $.store.get("octopus.score");
  if (saved) {
    await update4($, score3, () => saved);
    lastStats = statsLine4(saved);
  }
  await $.command.register({
    name: "octopus",
    description: 'The octopus above the prompt: its score. "/octopus ink|plane|rampage|conquer" to show off.'
  });
  $.clock.every(FPS_MS4, () => {
    sim4.t += 1;
    const a = activity2();
    const m = moodOf2(a);
    if (m !== sim4.mood) {
      sim4.mood = m;
      void update4($, mood2, () => m);
    }
    const requestId = sim4.requestId;
    if (requestId === null || sim4.W === 0) return;
    step3(a);
    if (sim4.gain.toppled > 0 || sim4.gain.planes > 0) {
      const gain = sim4.gain;
      sim4.gain = { toppled: 0, planes: 0 };
      void save2($, (old) => ({ ...old, toppled: old.toppled + gain.toppled, planes: old.planes + gain.planes }));
    }
    if (sim4.isBlitting) return;
    sim4.isBlitting = true;
    void $.ui.blit({ requestId, key: RASTER4, cells: frame4(a, lastStats), columns: sim4.W }).then((r) => {
      if (r.deny !== void 0) sim4.requestId = null;
    }).finally(() => {
      sim4.isBlitting = false;
    });
  });
  $.clock.every(1e3, () => {
    void $.agent.list().then(
      async (agents) => {
        for (const b of sim4.babies) {
          if (b.id === void 0) {
            const match = agents.find((a) => a.description === b.description && a.type === b.type && !sim4.babies.some((o) => o.id === a.id));
            if (match) b.id = match.id;
          }
        }
        for (const a of agents) {
          const isLive = a.status === "pending" || a.status === "running" || a.status === "waiting";
          if (isLive && !sim4.babies.some((b) => b.id === a.id)) hatch2(`agent:${a.id}`, a.description, a.type, a.id);
        }
        for (const b of sim4.babies) {
          if (b.state !== "swim") continue;
          const a = agents.find((x) => x.id === b.id);
          const isGone = a === void 0 && sim4.t - b.since > 30 * 1e3 / FPS_MS4;
          if (a?.status === "completed" || a?.status === "idle" || isGone) {
            b.state = "home";
            b.since = sim4.t;
            await save2($, (old) => ({ ...old, xp: old.xp + 2 }));
          } else if (a?.status === "failed" || a?.status === "killed") {
            b.state = "fall";
            b.since = sim4.t;
            b.y = 0;
            sim4.sadUntil = sim4.t + 15;
          }
        }
      },
      () => void 0
    );
  });
  return next(e);
};
const command4 = async ($, e) => {
  const arg = (e.args ?? "").trim();
  const practice = { ink: "ink", plane: "plane", rampage: "rampage", conquer: "conquer" };
  const show = practice[arg];
  if (show) {
    await celebrate3($, "Practice", 1, show, true);
    return { text: "The octopus shows off." };
  }
  const last2 = await read5($, feat3);
  return { text: `${statsLine4(await read5($, score3))}${last2 ? `
Last win: ${last2}` : ""}` };
};
const prompt4 = async ($, e, next) => {
  sim4.isTurn = true;
  sim4.alertUntil = sim4.t + 12;
  sim4.lastActivity = sim4.t;
  const ran = await next(e);
  return ran;
};
const turn4 = async ($, e, next) => {
  sim4.isTurn = false;
  sim4.lastActivity = sim4.t;
  const ran = await next(e);
  return ran;
};
const tool4 = async ($, e, next) => {
  if (e.agentId !== void 0) {
    const baby = sim4.babies.find((b) => b.id === e.agentId);
    if (baby) baby.lastTool = sim4.t;
    return next(e);
  }
  const job = { id: e.tool_use_id, work: workOf2(String(e.tool)) };
  sim4.working.push(job);
  sim4.lastActivity = sim4.t;
  const ran = await next(e).finally(() => {
    sim4.working = sim4.working.filter((w) => w !== job);
    sim4.lastActivity = sim4.t;
  });
  if (ran.deny !== void 0) return ran;
  const counted = await update4($, score3, (old) => ({ ...old, tools: old.tools + 1 }));
  lastStats = statsLine4(counted);
  if (counted.tools % 10 === 0) void $.store.set("octopus.score", counted);
  if (ran.isError === true) sim4.sadUntil = sim4.t + 30;
  return ran;
};
const render4 = async ($, e, next) => {
  const below = await next(e);
  if (e.surface !== "terminal" || e.props.hasSurvey || !await isShown($, ID4)) {
    sim4.requestId = null;
    return below;
  }
  const { Box, Raster } = $.ui.resolve(e);
  fitCity(clamp2(e.props.bodyColumns, MIN_COLUMNS2, MAX_COLUMNS2));
  sim4.requestId = e.requestId;
  const stats = statsLine4(await read5($, score3));
  lastStats = stats;
  return /* @__PURE__ */ h(Box, { flexDirection: "column" }, /* @__PURE__ */ h(Raster, { key: RASTER4, columns: sim4.W, rows: ROWS4, cells: frame4(activity2(), stats) }), below ?? null);
};
const game4 = { id: ID4, title: "Octo Invader" };

// src/games/outlaw.tsx
import { atom as atom6, read as read6, update as update5 } from "claude-code";
const ID5 = "outlaw";
const RASTER5 = "outlaw";
const W2 = 40;
const PIXEL_ROWS2 = 10;
const ROWS5 = PIXEL_ROWS2 / 2;
const FPS_MS5 = 66;
const INK4 = 16777216;
const NONE4 = 16777216;
const score4 = atom6({ plugin: "arcade", key: "outlawScore" }, { you: 0, bugs: 0, streak: 0, best: 0 });
async function notify5($, text) {
  if (!!await isShown($, ID5)) $.ui.toast(text);
}
const HIT_CHANCE = { you: 0.8, bug: 0.5 };
const BODY2 = {
  stand: ["..##...", ".####..", "######.", "..##...", ".####..", "#.##...", "..##...", ".#..#..", ".#..#.."],
  ready: ["..##...", ".####..", "######.", "..##...", ".####..", "#.##.#.", "..##...", ".#..#..", ".#..#.."],
  // Aimed at eye level: the shot clears the cactus.
  high: ["..##...", ".####..", "######.", "..#####", ".###...", "..##...", "..##...", ".#..#..", ".#..#.."],
  // Aimed from the hip: the shot meets the cactus.
  low: ["..##...", ".####..", "######.", "..##...", ".####..", "#.#####", "..##...", ".#..#..", ".#..#.."],
  stepA: ["..##...", ".####..", "######.", "..##...", ".####..", "#.##...", "..##...", ".#..#..", "#....#."],
  stepB: ["..##...", ".####..", "######.", "..##...", ".####..", "#.##...", "..##...", "..##...", "..##..."],
  // Weight on the other leg, for the idle sway.
  shift: ["..##...", ".####..", "######.", "..##...", ".####..", "#.##...", "..##...", "..#.#..", "..#..#."],
  // A hand to the hat brim.
  tip: ["..##.#.", ".####.#", "######.", "..##...", ".####..", "#.##...", "..##...", ".#..#..", ".#..#.."]
};
const FALLEN = ["........##", "#..######.", "##.######."];
const GUN_ROW = { high: 3, low: 5 };
const CACTUS_ART = ["#..##..#", "##.##.##", ".######.", "...##...", "...##..."];
const CACTUS = { x: 16, y: 5 };
const BIRD = [
  ["#...#", ".#.#."],
  [".....", "##.##"]
];
const TUMBLE = [
  [".#.", "#.#", ".#."],
  ["#.#", ".#.", "#.#"]
];
const sim5 = {
  t: 0,
  isTurn: false,
  queue: [],
  duel: null,
  restUntil: 0,
  practice: false,
  men: {
    you: { y: 1, goal: 1, fallUntil: -1 },
    bug: { y: 1, goal: 1, fallUntil: -1 }
  },
  cactus: /* @__PURE__ */ new Set(),
  tumble: null,
  bird: null,
  tipUntil: { you: -1, bug: -1 },
  glyphs: [],
  requestId: null,
  isBlitting: false
};
const cycle4 = (frames, n) => frames[Math.floor(sim5.t / n) % frames.length];
const xOf = (side) => side === "you" ? 1 : W2 - 8;
const other = (side) => side === "you" ? "bug" : "you";
const CACTUS_PIXELS = CACTUS_ART.flatMap(
  (row, y) => [...row].flatMap((c, x) => c === "#" ? [(CACTUS.y + y) * W2 + CACTUS.x + x] : [])
);
for (const at of CACTUS_PIXELS) sim5.cactus.add(at);
function say(x, y, text, frames) {
  x = Math.max(0, Math.min(W2 - text.length, x));
  text.split("").forEach((ch, i) => sim5.glyphs.push({ x: x + i, y, ch, until: sim5.t + frames }));
}
function startDuel(shot) {
  const isHit = Math.random() < HIT_CHANCE[shot.by];
  const aim = isHit ? "high" : "low";
  sim5.duel = { by: shot.by, aim, phase: "draw", since: sim5.t, x: 0, y: 0 };
  sim5.practice = shot.isPractice;
}
async function land($, duel, isHit) {
  sim5.duel = null;
  sim5.restUntil = sim5.t + 12;
  if (!isHit) {
    say(Math.round(duel.x), Math.floor(duel.y / 2), "*", 4);
    return;
  }
  const target2 = other(duel.by);
  sim5.men[target2].fallUntil = sim5.t + 36;
  say(xOf(target2) + 2, 0, duel.by === "you" ? "GOT HIM" : "OUCH", 20);
  if (sim5.practice) return;
  const next = await update5($, score4, (old) => {
    const streak = duel.by === "you" ? old.streak + 1 : 0;
    return {
      you: old.you + (duel.by === "you" ? 1 : 0),
      bugs: old.bugs + (duel.by === "bug" ? 1 : 0),
      streak,
      best: Math.max(old.best, streak)
    };
  });
  await $.store.set("outlaw.score", next);
}
function step4($) {
  sim5.t += 1;
  const { t } = sim5;
  const duel = sim5.duel;
  if (duel && duel.phase === "draw" && t - duel.since >= 6) {
    const shooter = sim5.men[duel.by];
    duel.phase = "fly";
    duel.x = duel.by === "you" ? xOf("you") + 7 : xOf("bug") - 1;
    duel.y = shooter.y + GUN_ROW[duel.aim];
    say(duel.by === "you" ? 9 : W2 - 13, 0, "BANG", 4);
  }
  if (duel && duel.phase === "fly") {
    const dir = duel.by === "you" ? 1 : -1;
    for (let i = 0; i < 2 && sim5.duel; i++) {
      duel.x += dir;
      const at = duel.y * W2 + Math.round(duel.x);
      if (sim5.cactus.has(at)) {
        sim5.cactus.delete(at);
        sim5.cactus.delete(at + dir);
        void land($, duel, false);
        break;
      }
      const target2 = other(duel.by);
      const tx = xOf(target2);
      const ty = sim5.men[target2].y;
      if (duel.x >= tx && duel.x <= tx + 6 && duel.y >= ty && duel.y <= ty + 8) {
        void land($, duel, true);
        break;
      }
      if (duel.x < 0 || duel.x >= W2) {
        void land($, duel, false);
        break;
      }
    }
  }
  if (!sim5.duel && t >= sim5.restUntil && sim5.queue.length > 0) startDuel(sim5.queue.shift());
  for (const side of ["you", "bug"]) {
    const man = sim5.men[side];
    if (!sim5.duel && !sim5.isTurn && t % 30 === (side === "you" ? 0 : 15)) man.goal = Math.random() < 0.5 ? 0 : 1;
    if (t % 4 === 0 && man.y !== man.goal) man.y += man.goal > man.y ? 1 : -1;
  }
  if (!sim5.duel && t % 40 === 0) {
    const missing = CACTUS_PIXELS.filter((at) => !sim5.cactus.has(at));
    if (missing.length > 0) sim5.cactus.add(missing[Math.floor(Math.random() * missing.length)]);
  }
  if (!sim5.tumble && !sim5.duel && !sim5.isTurn && t % 160 === 80) sim5.tumble = { x: W2 };
  if (!sim5.bird && t % 240 === 20) sim5.bird = { x: -5, y: Math.random() < 0.5 ? 0 : 1 };
  if (sim5.bird) {
    sim5.bird.x += 0.4;
    if (sim5.bird.x > W2) sim5.bird = null;
  }
  if (!sim5.duel && t % 110 === 55) sim5.tipUntil[Math.random() < 0.5 ? "you" : "bug"] = t + 10;
  if (sim5.tumble) {
    sim5.tumble.x -= 0.5;
    if (sim5.tumble.x < -3) sim5.tumble = null;
  }
  sim5.glyphs = sim5.glyphs.filter((g) => g.until > t);
}
function frame5() {
  const ink = new Uint8Array(W2 * PIXEL_ROWS2);
  const set = (x, y) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi >= 0 && xi < W2 && yi >= 0 && yi < PIXEL_ROWS2) ink[yi * W2 + xi] = 1;
  };
  const stamp = (rows, x, y, isMirror) => {
    rows.forEach((row, dy) => {
      const r = isMirror ? [...row].reverse().join("") : row;
      for (let dx = 0; dx < r.length; dx++) if (r[dx] === "#") set(x + dx, y + dy);
    });
  };
  for (const at of sim5.cactus) ink[at] = 1;
  for (const side of ["you", "bug"]) {
    const man = sim5.men[side];
    const isMirror = side === "bug";
    if (sim5.t < man.fallUntil) {
      stamp(FALLEN, side === "you" ? 0 : W2 - 10, PIXEL_ROWS2 - 3, isMirror);
      continue;
    }
    let pose2 = "stand";
    const duel = sim5.duel;
    if (duel && duel.by === side) pose2 = duel.aim;
    else if (duel || sim5.isTurn) pose2 = "ready";
    else if (man.y !== man.goal) pose2 = cycle4(["stepA", "stepB"], 2);
    else if (sim5.t < sim5.tipUntil[side]) pose2 = "tip";
    else pose2 = cycle4(["stand", "shift"], side === "you" ? 14 : 17);
    stamp(BODY2[pose2], xOf(side), man.y, isMirror);
  }
  if (sim5.duel && sim5.duel.phase === "fly") {
    set(sim5.duel.x, sim5.duel.y);
    set(sim5.duel.x - (sim5.duel.by === "you" ? 1 : -1), sim5.duel.y);
  }
  if (sim5.tumble) stamp(TUMBLE[Math.floor(sim5.t / 3) % 2], sim5.tumble.x, PIXEL_ROWS2 - 3 - Math.floor(sim5.t / 4) % 2, false);
  if (sim5.bird) stamp(BIRD[Math.floor(sim5.t / 4) % 2], sim5.bird.x, sim5.bird.y, false);
  const over2 = /* @__PURE__ */ new Map();
  for (const g of sim5.glyphs) if (g.x >= 0 && g.x < W2 && g.y >= 0 && g.y < ROWS5) over2.set(g.y * W2 + g.x, g.ch);
  const words = new Uint32Array(W2 * ROWS5 * 3);
  for (let cy = 0; cy < ROWS5; cy++) {
    for (let cx = 0; cx < W2; cx++) {
      const i = (cy * W2 + cx) * 3;
      const top = ink[cy * 2 * W2 + cx] === 1;
      const bottom = ink[(cy * 2 + 1) * W2 + cx] === 1;
      const ch = over2.get(cy * W2 + cx);
      words[i] = ch ? ch.codePointAt(0) : top && bottom ? 9608 : top ? 9600 : bottom ? 9604 : 32;
      words[i + 1] = INK4;
      words[i + 2] = NONE4;
    }
  }
  return base645(new Uint8Array(words.buffer));
}
const B645 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base645(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    out += B645[n >> 18 & 63] + B645[n >> 12 & 63] + B645[n >> 6 & 63] + B645[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B645[n >> 18 & 63] + B645[n >> 12 & 63] + "==";
  } else if (rest === 2) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8;
    out += B645[n >> 18 & 63] + B645[n >> 12 & 63] + B645[n >> 6 & 63] + "=";
  }
  return out;
}
const statsLine5 = (s) => `YOU ${s.you} : ${s.bugs} BUGS  \u25B2 ${s.streak}  \u2605 ${s.best}`;
async function onMilestone5($, tier, _kind, label) {
  const shots = tier === "big" ? 3 : tier === "medium" ? 1 : 0;
  if (shots === 0) return;
  for (let i = 0; i < shots; i++) sim5.queue.push({ by: "you", isPractice: false });
  void notify5($, `\u{1F920} ${label}! ${shots > 1 ? `${shots} shots` : "Draw!"}`);
}
async function celebrateMoments5($, found) {
  for (const m of found) await onMilestone5($, m.tier, m.kind, m.label);
}
const start5 = async ($, e, next) => {
  const saved = await $.store.get("outlaw.score");
  if (saved) await update5($, score4, () => saved);
  await $.command.register({
    name: "outlaw",
    description: 'The duel above the prompt: the score. "/outlaw draw" for a practice duel.'
  });
  $.clock.every(FPS_MS5, () => {
    step4($);
    const requestId = sim5.requestId;
    if (requestId === null || sim5.isBlitting) return;
    sim5.isBlitting = true;
    void $.ui.blit({ requestId, key: RASTER5, cells: frame5() }).then((r) => {
      if (r.deny !== void 0) sim5.requestId = null;
    }).finally(() => {
      sim5.isBlitting = false;
    });
  });
  return next(e);
};
const command5 = async ($, e) => {
  const arg = (e.args ?? "").trim();
  if (arg === "draw") {
    sim5.queue.push({ by: "you", isPractice: true }, { by: "bug", isPractice: true });
    return { text: "Practice duel: one shot each, no score." };
  }
  return {
    text: `${statsLine5(await read6($, score4))}
You fire once on a medium moment (a commit, a skill, a sent message) and three times on a big one (a merge, a deploy, a finished task list); the bug fires when a tool fails. \u25B2 is your run of hits without being hit, \u2605 your best run.`
  };
};
const prompt5 = async ($, e, next) => {
  sim5.isTurn = true;
  const ran = await next(e);
  return ran;
};
const turn5 = async ($, e, next) => {
  if (e.agentId === void 0) sim5.isTurn = false;
  const ran = await next(e);
  return ran;
};
const tool5 = async ($, e, next) => {
  const ran = await next(e);
  if (e.agentId !== void 0 || ran.deny !== void 0) return ran;
  if (ran.isError === true) {
    sim5.queue.push({ by: "bug", isPractice: false });
    return ran;
  }
  return ran;
};
const render5 = async ($, e, next) => {
  const below = await next(e);
  if (e.surface !== "terminal" || e.props.hasSurvey || !await isShown($, ID5)) {
    sim5.requestId = null;
    return below;
  }
  const { Box, Raster, Text } = $.ui.resolve(e);
  sim5.requestId = e.requestId;
  const s = await read6($, score4);
  const line = statsLine5(s);
  const pad = " ".repeat(Math.max(0, Math.floor((W2 - line.length) / 2)));
  return /* @__PURE__ */ h(Box, { flexDirection: "row", alignItems: "flex-end" }, /* @__PURE__ */ h(Box, { flexGrow: 1, flexDirection: "column" }, below ?? null), /* @__PURE__ */ h(Box, { flexDirection: "column", flexShrink: 0, minWidth: W2, marginLeft: 2 }, /* @__PURE__ */ h(Raster, { key: RASTER5, columns: W2, rows: ROWS5, cells: frame5() }), /* @__PURE__ */ h(Text, { key: "stats", dimColor: true, wrap: "truncate" }, pad + line)));
};
const game5 = { id: ID5, title: "Outlaw" };

// src/games/tama.tsx
import { atom as atom7, read as read7, update as update6 } from "claude-code";
const ID6 = "tama";
const RASTER6 = "tama";
const W3 = 30;
const PIXEL_ROWS3 = 10;
const ROWS6 = PIXEL_ROWS3 / 2;
const FPS_MS6 = 100;
const INK5 = 16777216;
const NONE5 = 16777216;
const MINUTE = 60 * 1e3;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const HUNGER_MS = 20 * MINUTE;
const JOY_MS = HOUR;
const LEAVES_AFTER = 12 * HOUR;
const CARE_PER_DAY = 6;
const FULL = 4;
const pet = atom7({ plugin: "arcade", key: "tamaPet" }, fresh(0, 1));
async function notify6($, text) {
  if (!!await isShown($, ID6)) $.ui.toast(text);
}
const SPRITES = {
  egg: { rows: [".###.", "#####", "##.##", "#####", "#####", ".###."], eyes: -1 },
  baby: { rows: [".###.", "#.#.#", "#####", ".#.#."], eyes: 1 },
  child: { rows: ["..###..", ".#####.", "##.#.##", "#######", ".#####.", ".#...#."], eyes: 2 },
  teen: { rows: [".#...#.", ".#####.", "##.#.##", "#######", "#.###.#", ".#####.", ".#...#."], eyes: 2 },
  worker: {
    rows: ["..#####..", ".#######.", "##.###.##", "#########", ".#######.", "..##.##..", ".#######.", ".##...##."],
    eyes: 2
  },
  rascal: {
    rows: ["#.......#", "##.###.##", ".#######.", "##.###.##", "#########", ".#######.", "..#...#..", ".##...##."],
    eyes: 3
  },
  chubby: {
    rows: ["..#####..", ".#######.", "##.###.##", "#########", "#########", "#########", ".#######.", "..#...#.."],
    eyes: 2
  }
};
const STAGE_NAMES = {
  egg: "an egg",
  baby: "a baby",
  child: "a child",
  teen: "a teen",
  worker: "a hard-working adult",
  rascal: "a rascal of an adult",
  chubby: "a well-fed adult"
};
const HEART = ["#.#", "###", ".#."];
const POOP = [".#.", "###"];
const RICE = [".#.", "###", "###"];
const CASE = [".##.", "####", "####"];
function fresh(now, generation) {
  return {
    stage: "egg",
    born: now,
    hungerAt: now,
    joyAt: now,
    hunger: FULL,
    joy: FULL,
    poops: 0,
    starvingSince: 0,
    eggTurns: 0,
    turns: 0,
    wins: 0,
    errors: 0,
    cleanRun: 0,
    generation,
    careDay: "",
    careLeft: CARE_PER_DAY
  };
}
const isSick = (p) => p.stage !== "egg" && (p.poops >= 3 || p.hunger === 0);
function age(p, now) {
  if (p.stage === "egg") return { ...p, hungerAt: now, joyAt: now };
  const hungerTicks = Math.floor((now - p.hungerAt) / HUNGER_MS);
  const joyTicks = Math.floor((now - p.joyAt) / JOY_MS);
  const hunger = Math.max(0, p.hunger - hungerTicks);
  const joy = Math.max(0, p.joy - joyTicks);
  const lived = now - p.born;
  let stage = p.stage;
  if (stage === "baby" && lived > HOUR) stage = "child";
  if (stage === "child" && lived > DAY) stage = "teen";
  if (stage === "teen" && lived > 3 * DAY) {
    stage = p.errors > p.wins ? "rascal" : p.turns > 3 * p.wins + 10 ? "chubby" : "worker";
  }
  return {
    ...p,
    stage,
    hunger,
    joy,
    hungerAt: p.hungerAt + hungerTicks * HUNGER_MS,
    joyAt: p.joyAt + joyTicks * JOY_MS,
    starvingSince: hunger > 0 ? 0 : p.starvingSince || now
  };
}
const sim6 = {
  t: 0,
  now: 0,
  x: 12,
  dir: 1,
  hopUntil: -1,
  eatUntil: -1,
  leaveFrom: -1,
  particles: [],
  requestId: null,
  isBlitting: false,
  pet: fresh(0, 1)
};
const cycle5 = (frames, n) => frames[Math.floor(sim6.t / n) % frames.length];
const today = (now) => new Date(now).toISOString().slice(0, 10);
const isNight = (now) => {
  const hour = new Date(now).getHours();
  return hour >= 23 || hour < 7;
};
async function change($, fn) {
  const now = await $.clock.now();
  sim6.now = now;
  const changed = await update6($, pet, (p) => fn(age(p, now)));
  sim6.pet = changed;
  await $.store.set("tama.pet", changed);
  return changed;
}
function hearts(count) {
  for (let i = 0; i < count; i++) {
    sim6.particles.push({ x: sim6.x + i * 3 - 2, y: 3, vy: -0.2, age: -i * 4, life: 14, art: "heart" });
  }
  sim6.hopUntil = sim6.t + 10;
}
function step5() {
  sim6.t += 1;
  const p = sim6.pet;
  const sprite = SPRITES[p.stage];
  const width = sprite.rows[0].length;
  const isAsleep = isNight(sim6.now);
  const isLeaving = sim6.leaveFrom >= 0;
  if (isLeaving) sim6.x += 0.5;
  else if (p.stage !== "egg" && !isAsleep && !isSick(p) && sim6.t >= sim6.eatUntil && sim6.t % 6 === 0) {
    sim6.x += sim6.dir;
    const left = 6 + p.poops * 0;
    if (sim6.x <= left || sim6.x + width >= W3 - 2 || Math.random() < 0.08) sim6.dir = -sim6.dir;
    sim6.x = Math.max(left, Math.min(W3 - 2 - width, sim6.x));
  }
  if (isAsleep && sim6.t % 25 === 0) sim6.particles.push({ x: sim6.x + width, y: 0, vy: 0, age: 0, life: 20, art: "glyph", ch: cycle5(["z", "Z"], 25) });
  if (isSick(p) && sim6.t % 20 === 0) sim6.particles.push({ x: sim6.x + width, y: 0, vy: 0, age: 0, life: 12, art: "glyph", ch: "+" });
  for (const q of sim6.particles) {
    q.age += 1;
    if (q.age > 0) q.y += q.vy;
  }
  sim6.particles = sim6.particles.filter((q) => q.age < q.life);
}
function frame6() {
  const ink = new Uint8Array(W3 * PIXEL_ROWS3);
  const set = (x, y) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi > 0 && xi < W3 - 1 && yi > 0 && yi < PIXEL_ROWS3 - 1) ink[yi * W3 + xi] = 1;
  };
  const stamp = (rows2, x, y) => rows2.forEach((row, dy) => [...row].forEach((c, dx) => c === "#" && set(x + dx, y + dy)));
  const over2 = /* @__PURE__ */ new Map();
  const glyph4 = (x, cell, ch) => {
    const xi = Math.round(x);
    if (xi > 0 && xi < W3 - 1 && cell >= 0 && cell < ROWS6) over2.set(cell * W3 + xi, ch);
  };
  for (let x = 0; x < W3; x++) {
    ink[x] = 1;
    ink[(PIXEL_ROWS3 - 1) * W3 + x] = 1;
  }
  for (let y = 0; y < PIXEL_ROWS3; y++) {
    ink[y * W3] = 1;
    ink[y * W3 + W3 - 1] = 1;
  }
  const p = sim6.pet;
  const sprite = SPRITES[p.stage];
  const isAsleep = isNight(sim6.now);
  const floor = PIXEL_ROWS3 - 1;
  let rows = sprite.rows;
  const isBlink = isAsleep || isSick(p) || sim6.t % 40 < 2;
  if (isBlink && sprite.eyes >= 0) {
    rows = rows.map((row, i) => i === sprite.eyes ? row.replace(/(?<=#)\.(?=.*#)/g, "#") : row);
  }
  if (p.stage === "egg" && p.eggTurns >= 2) rows = [".###.", "##.##", "#.#.#", "#####", "#####", ".###."];
  const hop = sim6.t < sim6.hopUntil ? cycle5([1, 1, 0], 2) : sim6.t < sim6.eatUntil ? cycle5([0, 1], 3) : 0;
  const wobble = p.stage === "egg" && p.eggTurns >= 2 ? cycle5([0, 1, 0, -1], 3) : 0;
  stamp(rows, sim6.x + wobble, floor - rows.length - hop);
  if (sim6.leaveFrom >= 0) stamp(CASE, sim6.x + rows[0].length + 1, floor - CASE.length);
  if (sim6.t < sim6.eatUntil) {
    const left = Math.ceil((sim6.eatUntil - sim6.t) / 18 * RICE.length);
    stamp(RICE.slice(RICE.length - left), sim6.x - 4, floor - left);
  }
  for (let i = 0; i < Math.min(3, p.poops); i++) {
    stamp(POOP, 1 + i * 4 - 0, floor - POOP.length);
    if (sim6.t % 12 < 8) glyph4(2 + i * 4, 2, "~");
  }
  for (const q of sim6.particles) {
    if (q.age < 0) continue;
    if (q.art === "heart") stamp(HEART, q.x, q.y);
    else glyph4(q.x, Math.floor(q.y / 2), q.ch ?? "*");
  }
  const words = new Uint32Array(W3 * ROWS6 * 3);
  for (let cy = 0; cy < ROWS6; cy++) {
    for (let cx = 0; cx < W3; cx++) {
      const i = (cy * W3 + cx) * 3;
      const top = ink[cy * 2 * W3 + cx] === 1;
      const bottom = ink[(cy * 2 + 1) * W3 + cx] === 1;
      const ch = over2.get(cy * W3 + cx);
      words[i] = ch ? ch.codePointAt(0) : top && bottom ? 9608 : top ? 9600 : bottom ? 9604 : 32;
      words[i + 1] = INK5;
      words[i + 2] = NONE5;
    }
  }
  return base646(new Uint8Array(words.buffer));
}
const B646 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base646(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    out += B646[n >> 18 & 63] + B646[n >> 12 & 63] + B646[n >> 6 & 63] + B646[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B646[n >> 18 & 63] + B646[n >> 12 & 63] + "==";
  } else if (rest === 2) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8;
    out += B646[n >> 18 & 63] + B646[n >> 12 & 63] + B646[n >> 6 & 63] + "=";
  }
  return out;
}
const bar = (n) => "\u25AE".repeat(n) + "\u25AF".repeat(FULL - n);
const statsLine6 = (p) => p.stage === "egg" ? `an egg \xB7 ${Math.max(0, 3 - p.eggTurns)} turns to hatch` : `\u2668 ${bar(p.hunger)}  \u2665 ${bar(p.joy)}  \u2727 ${bar(FULL - Math.min(FULL, p.poops))}`;
async function onMilestone6($, tier, _kind, _label) {
  const joy = tier === "big" ? 2 : tier === "medium" ? 1 : 0;
  if (joy === 0 || sim6.pet.stage === "egg") return;
  await change($, (q) => ({ ...q, wins: q.wins + 1, joy: Math.min(FULL, q.joy + joy), joyAt: sim6.now }));
  hearts(joy);
}
async function celebrateMoments6($, found) {
  for (const m of found) await onMilestone6($, m.tier, m.kind, m.label);
}
const start6 = async ($, e, next) => {
  sim6.now = await $.clock.now();
  const saved = await $.store.get("tama.pet");
  const start8 = saved ?? fresh(sim6.now, 1);
  sim6.pet = await update6($, pet, () => age(start8, sim6.now));
  await $.store.set("tama.pet", sim6.pet);
  await $.command.register({
    name: "tama",
    description: 'The Tamagotchi above the prompt: how it is doing. "/tama feed|play|clean" to care for it by hand.'
  });
  $.clock.every(FPS_MS6, () => {
    step5();
    const requestId = sim6.requestId;
    if (requestId === null || sim6.isBlitting) return;
    sim6.isBlitting = true;
    void $.ui.blit({ requestId, key: RASTER6, cells: frame6() }).then((r) => {
      if (r.deny !== void 0) sim6.requestId = null;
    }).finally(() => {
      sim6.isBlitting = false;
    });
  });
  $.clock.every(MINUTE, () => {
    void (async () => {
      const p = await change($, (q) => q);
      if (p.starvingSince > 0 && sim6.now - p.starvingSince > LEAVES_AFTER && sim6.leaveFrom < 0) {
        sim6.leaveFrom = sim6.t;
        void notify6($, "\u{1F9F3} Left hungry for too long, your Tamagotchi packs its bags. It leaves an egg behind.");
        $.clock.after(6e3, () => {
          sim6.leaveFrom = -1;
          sim6.x = 12;
          void change($, (q) => fresh(sim6.now, q.generation + 1));
        });
      }
    })();
  });
  return next(e);
};
const prompt6 = async ($, e, next) => {
  const ran = await next(e);
  return ran;
};
const command6 = async ($, e) => {
  const arg = (e.args ?? "").trim();
  if (arg === "feed" || arg === "play" || arg === "clean") {
    const now = await $.clock.now();
    const p2 = age(await read7($, pet), now);
    if (p2.stage === "egg") return { text: "It is still an egg. Finish a few turns to hatch it." };
    const left = p2.careDay === today(now) ? p2.careLeft : CARE_PER_DAY;
    if (left <= 0) return { text: "That is enough hand care for today. Your work feeds it too." };
    await change($, (q) => ({
      ...q,
      careDay: today(now),
      careLeft: left - 1,
      hunger: arg === "feed" ? Math.min(FULL, q.hunger + 1) : q.hunger,
      hungerAt: arg === "feed" ? now : q.hungerAt,
      joy: arg === "play" ? Math.min(FULL, q.joy + 1) : q.joy,
      joyAt: arg === "play" ? now : q.joyAt,
      poops: arg === "clean" ? 0 : q.poops
    }));
    if (arg === "feed") sim6.eatUntil = sim6.t + 18;
    if (arg === "play") hearts(1);
    return { text: `${arg === "feed" ? "Fed" : arg === "play" ? "Played with" : "Cleaned up after"} it. ${left - 1} hand care left today.` };
  }
  const p = age(await read7($, pet), await $.clock.now());
  const days = Math.floor((sim6.now - p.born) / DAY);
  const mood3 = isSick(p) ? "It is sick: feed it and clean up." : p.hunger <= 1 ? "It is hungry." : p.joy <= 1 ? "It is bored." : "It is doing fine.";
  return {
    text: `Generation ${p.generation}: ${STAGE_NAMES[p.stage]}, ${days} day${days === 1 ? "" : "s"} old. ${statsLine6(p)}
${mood3}
Finished turns feed it, commits, tests and PRs cheer it up, tool errors leave a mess (five clean turns tidy one away).`
  };
};
const turn6 = async ($, e, next) => {
  const ran = await next(e);
  if (e.agentId !== void 0 || e.isAborted) return ran;
  const before = sim6.pet;
  const p = await change($, (q) => {
    if (q.stage === "egg") {
      const eggTurns = q.eggTurns + 1;
      return eggTurns >= 3 ? { ...q, stage: "baby", eggTurns, born: sim6.now, hungerAt: sim6.now, joyAt: sim6.now } : { ...q, eggTurns };
    }
    const cleanRun = q.cleanRun + 1;
    return {
      ...q,
      turns: q.turns + 1,
      hunger: Math.min(FULL, q.hunger + 1),
      hungerAt: sim6.now,
      cleanRun: cleanRun >= 5 ? 0 : cleanRun,
      poops: cleanRun >= 5 ? Math.max(0, q.poops - 1) : q.poops
    };
  });
  if (before.stage === "egg" && p.stage === "baby") {
    hearts(2);
    void notify6($, "\u{1F95A} Your Tamagotchi hatched!");
  } else if (p.stage !== "egg") {
    sim6.eatUntil = sim6.t + 18;
  }
  return ran;
};
const tool6 = async ($, e, next) => {
  const ran = await next(e);
  if (e.agentId !== void 0 || ran.deny !== void 0 || sim6.pet.stage === "egg") return ran;
  if (ran.isError === true) {
    await change($, (q) => ({ ...q, errors: q.errors + 1, cleanRun: 0, poops: Math.min(3, q.poops + 1) }));
    return ran;
  }
  return ran;
};
const render6 = async ($, e, next) => {
  const below = await next(e);
  if (e.surface !== "terminal" || e.props.hasSurvey || !await isShown($, ID6)) {
    sim6.requestId = null;
    return below;
  }
  const { Box, Raster, Text } = $.ui.resolve(e);
  sim6.requestId = e.requestId;
  const line = statsLine6(await read7($, pet));
  const pad = " ".repeat(Math.max(0, Math.floor((W3 - line.length) / 2)));
  return /* @__PURE__ */ h(Box, { flexDirection: "row", alignItems: "flex-end" }, /* @__PURE__ */ h(Box, { flexGrow: 1, flexDirection: "column" }, below ?? null), /* @__PURE__ */ h(Box, { flexDirection: "column", flexShrink: 0, minWidth: W3, marginLeft: 2 }, /* @__PURE__ */ h(Raster, { key: RASTER6, columns: W3, rows: ROWS6, cells: frame6() }), /* @__PURE__ */ h(Text, { key: "stats", dimColor: true, wrap: "truncate" }, pad + line)));
};
const game6 = { id: ID6, title: "Tama" };

// src/games/tetris.tsx
import { atom as atom8, read as read8, update as update7 } from "claude-code";
const ID7 = "tetris";
const RASTER7 = "well";
const G = 10;
const H2 = 8;
const W4 = 2 + G * 2;
const PIXEL_ROWS4 = H2 + 2;
const ROWS7 = PIXEL_ROWS4 / 2;
const FPS_MS7 = 66;
const INK6 = 16777216;
const NONE6 = 16777216;
const tally = atom8({ plugin: "arcade", key: "tetrisTally" }, { score: 0, lines: 0, best: 0, games: 0 });
async function notify7($, text) {
  if (!!await isShown($, ID7)) $.ui.toast(text);
}
const LINE_SCORE = [0, 40, 100, 300, 1200];
const CLEARS = { small: 0, medium: 1, big: 3 };
const SHAPES = [
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  // I
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  // O
  [[0, 0], [0, 1], [0, 2], [1, 1]],
  // T
  [[0, 1], [0, 2], [1, 0], [1, 1]],
  // S
  [[0, 0], [0, 1], [1, 1], [1, 2]],
  // Z
  [[0, 0], [0, 1], [0, 2], [1, 0]],
  // L
  [[0, 0], [0, 1], [0, 2], [1, 2]]
  // J
];
const normalise = (cells) => {
  const r0 = Math.min(...cells.map((c) => c[0]));
  const c0 = Math.min(...cells.map((c) => c[1]));
  return cells.map(([r, c]) => [r - r0, c - c0]);
};
const keyOf = (cells) => JSON.stringify([...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
const rotations = (shape) => {
  const out = [];
  let cur = normalise(shape);
  for (let i = 0; i < 4; i++) {
    if (!out.some((o) => keyOf(o) === keyOf(cur))) out.push(cur);
    cur = normalise(cur.map(([r, c]) => [c, -r]));
  }
  return out;
};
const ROTATIONS = SHAPES.map(rotations);
const widthOf = (cells) => Math.max(...cells.map((c) => c[1])) + 1;
const emptyGrid = () => Array.from({ length: H2 }, () => Array(G).fill(0));
const sim7 = {
  t: 0,
  grid: emptyGrid(),
  queue: 0,
  bombs: [],
  garbage: 0,
  active: null,
  flash: null,
  wipe: -1,
  requestId: null,
  isBlitting: false
};
const isFree = (grid, cells, row, col) => cells.every(([r, c]) => {
  const y = row + r;
  const x = col + c;
  if (x < 0 || x >= G || y >= H2) return false;
  return y < 0 || grid[y][x] === 0;
});
function landing(grid, cells, col) {
  let row = -2;
  while (isFree(grid, cells, row + 1, col)) row += 1;
  return row;
}
const fullRows = (grid) => [...Array(H2).keys()].filter((r) => grid[r].every((v) => v !== 0));
function choose(shape) {
  let best = null;
  for (const cells of ROTATIONS[shape]) {
    for (let col = 0; col + widthOf(cells) <= G; col++) {
      const row = landing(sim7.grid, cells, col);
      if (cells.some(([r]) => row + r < 0)) continue;
      const grid = sim7.grid.map((r) => [...r]);
      for (const [r, c] of cells) grid[row + r][col + c] = 1;
      const lines = fullRows(grid).length;
      const heights = [...Array(G).keys()].map((c) => {
        const top = grid.findIndex((r) => r[c] !== 0);
        return top < 0 ? 0 : H2 - top;
      });
      let holes = 0;
      for (let c = 0; c < G; c++) {
        let isUnder = false;
        for (let r = 0; r < H2; r++) {
          if (grid[r][c]) isUnder = true;
          else if (isUnder) holes += 1;
        }
      }
      const bump = heights.slice(1).reduce((s, height, i) => s + Math.abs(height - heights[i]), 0);
      const value = -0.51 * heights.reduce((s, height) => s + height, 0) + 0.76 * lines - 0.36 * holes - 0.18 * bump;
      if (!best || value > best.value) {
        const start8 = Math.floor((G - widthOf(cells)) / 2);
        best = { piece: { cells, col: start8, targetCol: col, row: -2, targetRow: row }, value };
      }
    }
  }
  return best?.piece ?? null;
}
function removeRows(rows) {
  const doomed = new Set(rows);
  const kept = sim7.grid.filter((_, i) => !doomed.has(i));
  sim7.grid = [...Array.from({ length: H2 - kept.length }, () => Array(G).fill(0)), ...kept];
}
async function scoreLines($, lines, isBomb) {
  if (lines === 0) return;
  const before = await read8($, tally);
  const level = Math.floor(before.lines / 10);
  const points = isBomb ? 50 * lines * (level + 1) : LINE_SCORE[Math.min(4, lines)] * (level + 1);
  const saved = await update7($, tally, (old) => ({ ...old, score: old.score + points, lines: old.lines + lines }));
  await $.store.set("tetris.tally", saved);
  if (!isBomb && lines >= 4) void notify7($, "\u{1F9F1} TETRIS! Four lines at once");
  if (Math.floor(saved.lines / 10) > level) void notify7($, `\u{1F9F1} Level ${Math.floor(saved.lines / 10)}`);
}
async function gameOver($) {
  sim7.wipe = 0;
  sim7.active = null;
  const saved = await update7($, tally, (old) => ({
    score: 0,
    lines: 0,
    best: Math.max(old.best, old.score),
    games: old.games + 1
  }));
  await $.store.set("tetris.tally", saved);
  void notify7($, `\u{1F9F1} Game over. Best ${saved.best}`);
}
async function onMilestone7($, tier, _kind, label) {
  const rows = CLEARS[tier] ?? 0;
  if (rows === 0) return;
  sim7.bombs.push(rows);
  void notify7($, `\u{1F9F1} ${label}: ${rows} row${rows > 1 ? "s" : ""} cleared`);
}
function step6($) {
  sim7.t += 1;
  const { t } = sim7;
  if (sim7.wipe >= 0) {
    if (sim7.wipe < H2) sim7.grid[sim7.wipe] = Array(G).fill(0);
    sim7.wipe = sim7.wipe >= H2 ? -1 : sim7.wipe + 1;
    return;
  }
  if (sim7.flash) {
    if (t < sim7.flash.until) return;
    const { rows, isBomb } = sim7.flash;
    sim7.flash = null;
    removeRows(rows);
    void scoreLines($, rows.length, isBomb);
    return;
  }
  if (sim7.active) {
    const piece = sim7.active;
    const isFast = sim7.queue > 1;
    if (piece.col !== piece.targetCol) {
      if (t % 2 === 0 || isFast) piece.col += piece.targetCol > piece.col ? 1 : -1;
    } else if (piece.row < piece.targetRow) {
      piece.row = Math.min(piece.targetRow, piece.row + (isFast ? 2 : 1));
    } else {
      for (const [r, c] of piece.cells) sim7.grid[piece.row + r][piece.col + c] = 1;
      sim7.active = null;
      const rows = fullRows(sim7.grid);
      if (rows.length > 0) sim7.flash = { rows, until: t + 8, isBomb: false };
    }
    return;
  }
  if (sim7.garbage > 0) {
    sim7.garbage -= 1;
    const isFull = sim7.grid[0].some((v) => v !== 0);
    const gap = Math.floor(Math.random() * G);
    sim7.grid = [...sim7.grid.slice(1), Array.from({ length: G }, (_, c) => c === gap ? 0 : 2)];
    if (isFull) void gameOver($);
    return;
  }
  if (sim7.bombs.length > 0) {
    const n = sim7.bombs.shift();
    const rows = [...Array(H2).keys()].reverse().filter((r) => sim7.grid[r].some((v) => v !== 0)).slice(0, n);
    if (rows.length > 0) sim7.flash = { rows, until: t + 10, isBomb: true };
    return;
  }
  if (sim7.queue > 0) {
    sim7.queue -= 1;
    const piece = choose(Math.floor(Math.random() * SHAPES.length));
    if (!piece) {
      void gameOver($);
      return;
    }
    sim7.active = piece;
  }
}
function frame7() {
  const ink = new Uint8Array(W4 * PIXEL_ROWS4);
  const block = (r, c, kind) => {
    if (r < 0 || r >= H2) return;
    for (let dx = 0; dx < 2; dx++) {
      if (kind === 2 && (dx + r) % 2 === 1) continue;
      ink[(1 + r) * W4 + 1 + c * 2 + dx] = 1;
    }
  };
  for (let y = 0; y < PIXEL_ROWS4; y++) {
    ink[y * W4] = 1;
    ink[y * W4 + W4 - 1] = 1;
  }
  for (let x = 0; x < W4; x++) {
    ink[x] = 1;
    ink[(PIXEL_ROWS4 - 1) * W4 + x] = 1;
  }
  const blink = sim7.flash && Math.floor(sim7.t / 2) % 2 === 0;
  sim7.grid.forEach(
    (row, r) => row.forEach((v, c) => {
      if (!v || blink && sim7.flash.rows.includes(r)) return;
      block(r, c, v);
    })
  );
  const piece = sim7.active;
  if (piece) for (const [r, c] of piece.cells) block(piece.row + r, piece.col + c, 1);
  const words = new Uint32Array(W4 * ROWS7 * 3);
  for (let cy = 0; cy < ROWS7; cy++) {
    for (let cx = 0; cx < W4; cx++) {
      const i = (cy * W4 + cx) * 3;
      const top = ink[cy * 2 * W4 + cx] === 1;
      const bottom = ink[(cy * 2 + 1) * W4 + cx] === 1;
      words[i] = top && bottom ? 9608 : top ? 9600 : bottom ? 9604 : 32;
      words[i + 1] = INK6;
      words[i + 2] = NONE6;
    }
  }
  return base647(new Uint8Array(words.buffer));
}
const B647 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base647(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    out += B647[n >> 18 & 63] + B647[n >> 12 & 63] + B647[n >> 6 & 63] + B647[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B647[n >> 18 & 63] + B647[n >> 12 & 63] + "==";
  } else if (rest === 2) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8;
    out += B647[n >> 18 & 63] + B647[n >> 12 & 63] + B647[n >> 6 & 63] + "=";
  }
  return out;
}
const centred2 = (text) => " ".repeat(Math.max(0, Math.floor((W4 - text.length) / 2))) + text;
async function celebrateMoments7($, found) {
  for (const m of found) await onMilestone7($, m.tier, m.kind, m.label);
}
const start7 = async ($, e, next) => {
  const saved = await $.store.get("tetris.tally");
  if (saved) await update7($, tally, () => saved);
  await $.command.register({
    name: "tetris",
    description: 'The Tetris above the prompt: the score. "/tetris drop" adds pieces, "/tetris clear" clears a row.'
  });
  $.clock.every(FPS_MS7, () => {
    step6($);
    const requestId = sim7.requestId;
    if (requestId === null || sim7.isBlitting) return;
    sim7.isBlitting = true;
    void $.ui.blit({ requestId, key: RASTER7, cells: frame7() }).then((r) => {
      if (r.deny !== void 0) sim7.requestId = null;
    }).finally(() => {
      sim7.isBlitting = false;
    });
  });
  return next(e);
};
const prompt7 = async ($, e, next) => {
  const ran = await next(e);
  return ran;
};
const turn7 = async ($, e, next) => {
  const ran = await next(e);
  return ran;
};
const command7 = async ($, e) => {
  const arg = (e.args ?? "").trim();
  if (arg === "drop") {
    sim7.queue += 3;
    return { text: "Three pieces on their way." };
  }
  if (arg === "clear") {
    sim7.bombs.push(1);
    return { text: "One row cleared from the bottom." };
  }
  const t = await read8($, tally);
  return {
    text: `\u25A4 ${t.lines} lines \xB7 \u25C6 ${t.score} \xB7 Lv ${Math.floor(t.lines / 10)} \xB7 best ${t.best}
Every tool Claude runs drops a piece; a full row clears. A failed tool pushes up a garbage row. Medium moments (a commit, a skill, a sent message) clear a row, big ones (a merge, a deploy, a finished task list) clear three.`
  };
};
const tool7 = async ($, e, next) => {
  const ran = await next(e);
  if (e.agentId !== void 0 || ran.deny !== void 0) return ran;
  if (ran.isError === true) sim7.garbage += 1;
  else sim7.queue += 1;
  return ran;
};
const render7 = async ($, e, next) => {
  const below = await next(e);
  if (e.surface !== "terminal" || e.props.hasSurvey || !await isShown($, ID7)) {
    sim7.requestId = null;
    return below;
  }
  const { Box, Raster, Text } = $.ui.resolve(e);
  sim7.requestId = e.requestId;
  const t = await read8($, tally);
  return /* @__PURE__ */ h(Box, { flexDirection: "row", alignItems: "flex-end" }, /* @__PURE__ */ h(Box, { flexGrow: 1, flexDirection: "column" }, below ?? null), /* @__PURE__ */ h(Box, { flexDirection: "column", flexShrink: 0, minWidth: W4, marginLeft: 2 }, /* @__PURE__ */ h(Raster, { key: RASTER7, columns: W4, rows: ROWS7, cells: frame7() }), /* @__PURE__ */ h(Text, { key: "stats", dimColor: true, wrap: "truncate" }, centred2(`\u25A4 ${t.lines}  \u25C6 ${t.score}  Lv ${Math.floor(t.lines / 10)}`))));
};
const game7 = { id: ID7, title: "Tetris" };

// src/milestones.ts
const MARATHON_MS = 10 * 60 * 1e3;
const MARATHON_TOOLS = 30;
const SQUAD = 3;
const LONG_FILE_LINES = 200;
const RECORDS = [100, 1e3, 1e4];
const STREAKS = [3, 7, 30, 100];
const COMMANDS = [
  { test: /\bgh\s+pr\s+merge\b/, tier: "big", kind: "merge", label: "Merged" },
  { test: /\bgh\s+release\s+create\b|\bnpm\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b/, tier: "big", kind: "release", label: "Released" },
  {
    test: /\bvercel\b.*--prod\b|\bnetlify\s+deploy\b.*--prod\b|\bfly\s+deploy\b|\bfirebase\s+deploy\b|\bwrangler\s+(deploy|publish)\b|\brailway\s+up\b/,
    tier: "big",
    kind: "deploy",
    label: "Deployed"
  },
  { test: /\bgh\s+pr\s+create\b/, tier: "medium", kind: "pr", label: "Pull request" },
  { test: /\bgit\b[^|;&]*\bcommit\b/, tier: "medium", kind: "commit", label: "Commit" },
  { test: /\bgit\b[^|;&]*\bpush\b/, tier: "medium", kind: "push", label: "Push" }
];
const TESTS = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bvitest\b|\bjest\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+test\b|\bplugin\s+test\b|\brspec\b|\bphpunit\b/;
const EMPTY3 = /nothing to commit|no changes added|Everything up-to-date/;
const DELIVERABLE = /\.(pdf|docx?|xlsx?|pptx?|key|pages|numbers|csv|png|jpe?g|svg|gif|mp4|mp3|wav|epub)$/i;
const OUTWARD = /^mcp__.+__.*(send|create|post|publish|schedule|upload|reply|forward|invite|share|comment)/i;
const PRAISE = [
  "thanks",
  "thank you",
  "great",
  "perfect",
  "amazing",
  "awesome",
  "brilliant",
  "excellent",
  "nice work",
  "well done",
  "love it",
  "gracias",
  "genial",
  "perfecto",
  "merci",
  "parfait",
  "danke",
  "super",
  "perfetto",
  "grazie",
  "obrigado",
  "\xF3timo"
];
const list = (text) => String(text ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const regex = (text) => {
  const source = String(text ?? "").trim();
  if (!source) return null;
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
};
const config = {
  bigSkills: [],
  quietSkills: [],
  bigCommands: null,
  mediumCommands: null,
  praise: PRAISE
};
const turn8 = { startedAt: 0, tools: 0, errors: 0, subagents: 0, skills: [] };
const session = { tools: 0, tasksMade: 0, tasksDone: 0, testsFailed: false, todosDone: false };
function configureMilestones(options) {
  config.bigSkills = list(options.big_skills);
  config.quietSkills = list(options.quiet_skills);
  config.bigCommands = regex(options.big_commands);
  config.mediumCommands = regex(options.medium_commands);
  config.praise = [...PRAISE, ...list(options.praise_words)];
}
function streakMilestones(stored, now) {
  const today2 = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - 864e5).toISOString().slice(0, 10);
  const days = stored ?? { last: "", streak: 0 };
  if (days.last === today2) return { days, found: [] };
  const streak = days.last === yesterday ? days.streak + 1 : 1;
  return {
    days: { last: today2, streak },
    found: STREAKS.includes(streak) ? [{ tier: "big", kind: "streak", label: `${streak} days in a row` }] : []
  };
}
function promptMilestones(text, now) {
  turn8.startedAt = now;
  turn8.tools = 0;
  turn8.errors = 0;
  turn8.subagents = 0;
  turn8.skills = [];
  const said = ` ${text.toLowerCase()} `;
  const isPraise = config.praise.some((word2) => new RegExp(`(^|[^\\p{L}])${word2}([^\\p{L}]|$)`, "u").test(said));
  return isPraise ? [{ tier: "medium", kind: "praise", label: "You said something nice" }] : [];
}
function skillSeen(skill) {
  turn8.skills.push(skill);
}
function subagentMilestones() {
  turn8.subagents += 1;
  const found = [{ tier: "medium", kind: "subagent", label: "A subagent finished" }];
  if (turn8.subagents === SQUAD) found.push({ tier: "big", kind: "squad", label: `${SQUAD} subagents done` });
  return found;
}
function turnMilestones(now) {
  const found = [];
  for (const skill of new Set(turn8.skills)) {
    const name = skill.toLowerCase().replace(/^.*:/, "");
    const full = skill.toLowerCase();
    if ([name, full].some((n) => config.quietSkills.includes(n))) continue;
    const isBig = [name, full].some((n) => config.bigSkills.includes(n));
    found.push({ tier: isBig ? "big" : "medium", kind: "skill", label: `Skill: ${name}` });
  }
  const isMarathon = turn8.startedAt > 0 && now - turn8.startedAt > MARATHON_MS && turn8.tools >= MARATHON_TOOLS && turn8.errors === 0;
  found.push(
    isMarathon ? { tier: "big", kind: "marathon", label: "A marathon turn, no errors" } : { tier: "small", kind: "turn", label: "Turn done" }
  );
  turn8.skills = [];
  return found;
}
function toolMilestones(e, ran) {
  const tool8 = String(e.tool);
  const input = e;
  turn8.tools += 1;
  session.tools += 1;
  const found = [];
  if (RECORDS.includes(session.tools)) found.push({ tier: "big", kind: "record", label: `${session.tools} tool calls` });
  else if (turn8.tools % 10 === 0) found.push({ tier: "small", kind: "tools", label: `${turn8.tools} tools this turn` });
  if (ran.isError === true) {
    turn8.errors += 1;
    if (tool8 === "Bash" && TESTS.test(String(input.command ?? ""))) session.testsFailed = true;
    return found;
  }
  if (tool8 === "Bash") {
    const command8 = String(input.command ?? "");
    if (EMPTY3.test(ran.text ?? "")) return found;
    if (config.bigCommands?.test(command8)) return [...found, { tier: "big", kind: "command", label: "Big command done" }];
    const known = COMMANDS.find((c) => c.test.test(command8));
    if (known) return [...found, { tier: known.tier, kind: known.kind, label: known.label }];
    if (TESTS.test(command8)) {
      const wasRed = session.testsFailed;
      session.testsFailed = false;
      return [
        ...found,
        wasRed ? { tier: "big", kind: "green", label: "Tests back to green" } : { tier: "medium", kind: "tests", label: "Tests passed" }
      ];
    }
    if (config.mediumCommands?.test(command8)) found.push({ tier: "medium", kind: "command", label: "Command done" });
    return found;
  }
  if (tool8 === "Write" || tool8 === "Edit" || tool8 === "NotebookEdit") {
    const path = String(input.file_path ?? input.notebook_path ?? "");
    const name = path.split("/").pop() ?? path;
    const lines = String(input.content ?? "").split("\n").length;
    if (tool8 === "Write" && DELIVERABLE.test(path)) found.push({ tier: "big", kind: "deliverable", label: `Made ${name}` });
    else if (tool8 === "Write" && lines > LONG_FILE_LINES) found.push({ tier: "medium", kind: "long", label: `Wrote ${name}` });
    else found.push({ tier: "small", kind: "file", label: `Saved ${name}` });
    return found;
  }
  if (tool8 === "Artifact") {
    const action = String(input.action ?? "publish");
    if (action === "publish" && input.asset !== true && (input.file_path || input.type_url)) {
      found.push({ tier: "big", kind: "page", label: "Published a page" });
    }
    return found;
  }
  if (tool8 === "ExitPlanMode") return [...found, { tier: "medium", kind: "plan", label: "Plan approved" }];
  if (tool8 === "TodoWrite") {
    const todos = Array.isArray(input.todos) ? input.todos : [];
    const isDone = todos.length >= 3 && todos.every((t) => t.status === "completed");
    if (isDone && !session.todosDone) found.push({ tier: "big", kind: "todos", label: `All ${todos.length} tasks done` });
    session.todosDone = isDone;
    return found;
  }
  if (tool8 === "TaskCreate") session.tasksMade += 1;
  if (tool8 === "TaskUpdate" && input.status === "completed") {
    session.tasksDone += 1;
    if (session.tasksMade >= 3 && session.tasksDone >= session.tasksMade) {
      found.push({ tier: "big", kind: "todos", label: `All ${session.tasksMade} tasks done` });
      session.tasksMade = 0;
      session.tasksDone = 0;
    }
    return found;
  }
  if (OUTWARD.test(tool8)) {
    const verb = tool8.match(/(send|create|post|publish|schedule|upload|reply|forward|invite|share|comment)/i)?.[1] ?? "send";
    found.push({ tier: "medium", kind: "send", label: `${verb[0].toUpperCase()}${verb.slice(1).toLowerCase()} done` });
  }
  return found;
}

// src/arcade.tsx
const GAMES = [game, game3, game5, game6, game7, game4, game2];
const MODES = ["random", "rotate", "fixed", "all", "off"];
const ALIASES = { "dragon-lair": "dragon", octo: "octopus", "octo-invader": "octopus", "duck-hunt": "duck", duckhunt: "duck", ducks: "duck" };
const pickedFor = atom9({ plugin: "arcade", key: "pickedFor" }, "");
function gameId(word2) {
  const id = ALIASES[word2.toLowerCase()] ?? word2.toLowerCase();
  return GAMES.some((g) => g.id === id) ? id : void 0;
}
function modeOf(value) {
  return MODES.includes(value) ? value : "random";
}
function poolOf(value) {
  const ids = String(value ?? "").split(/[\s,]+/).map((w) => w ? gameId(w) : void 0).filter((id) => id !== void 0);
  return ids.length > 0 ? [...new Set(ids)] : GAMES.map((g) => g.id);
}
async function pick5($, mode, pool) {
  if (mode === "off") return [];
  if (mode === "all") return pool;
  if (mode === "fixed") return pool.slice(0, 1);
  if (mode === "random") return pool.slice(0, pool.length).sort(() => Math.random() - 0.5).slice(0, 1);
  const last2 = String(await $.store.get("rotate") ?? "");
  const next = pool[(pool.indexOf(last2) + 1) % pool.length] ?? pool[0] ?? "";
  await $.store.set("rotate", next);
  return [next];
}
async function apply($, mode, pool) {
  const ids = await pick5($, mode, pool);
  await update8($, shown, () => ids);
  await update8($, pickedFor, () => `${mode}|${pool.join(",")}`);
  return ids;
}
const title = (id) => GAMES.find((g) => g.id === id)?.title ?? id;
async function status($, mode, pool) {
  const on = await read9($, shown);
  const rows = GAMES.map((g) => `${on.includes(g.id) ? "\u25CF" : "\u25CB"} ${g.title} (${g.id})${pool.includes(g.id) ? "" : ", not in the pool"}`);
  const setting = mode === "fixed" ? `fixed on ${title(pool[0] ?? "")}` : mode === "off" ? "off" : `${mode}, from ${pool.map(title).join(", ")}`;
  return `Arcade on this account: ${setting}.
This terminal:
${rows.join("\n")}
"/arcade <game>" pins one game, "/arcade random|rotate|all|off" sets how new terminals pick, "/arcade pool <games>" limits the choice, "/arcade next" swaps this terminal's game. "/arcade hide" clears this terminal only.`;
}
const over = (options) => `${String(options.mode ?? "")}|${String(options.pool ?? "")}`;
async function save3($, options, mode, pool) {
  try {
    const keys = new Set((await $.config.list()).map((row) => row.key));
    if (keys.has("arcade.mode") && keys.has("arcade.pool")) {
      const a = await $.config.set({ key: "arcade.mode", value: mode });
      const b = await $.config.set({ key: "arcade.pool", value: pool.join(",") });
      if (a.deny === void 0 && b.deny === void 0) {
        await $.store.delete("setting");
        return;
      }
    }
  } catch {
  }
  const saved = { mode, pool: pool.join(","), over: over(options) };
  await $.store.set("setting", saved);
}
async function celebrate4($, found) {
  if (found.length === 0) return;
  await celebrateMoments($, found);
  await celebrateMoments3($, found);
  await celebrateMoments5($, found);
  await celebrateMoments6($, found);
  await celebrateMoments7($, found);
  await celebrateMoments4($, found);
  await celebrateMoments2($, found);
}
export const register = (on, options) => {
  configureMilestones(options);
  const setting = { mode: modeOf(options.mode), pool: poolOf(options.pool) };
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "arcade",
      description: 'Which Arcade games show: "/arcade <game>" pins one, "/arcade random|rotate|all|off", "/arcade pool <games>", "/arcade next" or "/arcade hide" for this terminal.'
    });
    const saved = await $.store.get("setting");
    if (saved?.over === over(options)) Object.assign(setting, { mode: modeOf(saved.mode), pool: poolOf(saved.pool) });
    if (await read9($, pickedFor) !== `${setting.mode}|${setting.pool.join(",")}`) await apply($, setting.mode, setting.pool);
    const ran = await start($, e, ((e1) => start3($, e1, ((e2) => start5($, e2, ((e3) => start6($, e3, ((e4) => start7($, e4, ((e5) => start4($, e5, ((e6) => start2($, e6, next)))))))))))));
    const streak = streakMilestones(await $.store.get("days"), await $.clock.now());
    await $.store.set("days", streak.days);
    await celebrate4($, streak.found);
    return ran;
  });
  on("command.run", { command: "arcade" }, async ($, e) => {
    const words = (e.args ?? "").trim().split(/[\s,]+/).filter(Boolean);
    const [first = "", ...rest] = words.map((w) => w.toLowerCase());
    if (first === "") return { text: await status($, setting.mode, setting.pool) };
    if (first === "hide") {
      await update8($, shown, () => []);
      return { text: 'No game in this terminal. "/arcade next" brings one back; new terminals still follow the setting.' };
    }
    if (first === "next") {
      const now = await read9($, shown);
      const at = setting.pool.indexOf(now[now.length - 1] ?? "");
      const id2 = setting.pool[(at + 1) % setting.pool.length] ?? "";
      await update8($, shown, () => [id2]);
      return { text: `${title(id2)} in this terminal. New terminals still follow the setting.` };
    }
    if (first === "pool") {
      const ids = rest.map(gameId);
      if (rest.length === 0 || ids.includes(void 0)) {
        return { text: `Name the games for the pool: ${GAMES.map((g) => g.id).join(", ")}.` };
      }
      const pool2 = poolOf(ids.join(","));
      await save3($, options, setting.mode, pool2);
      setting.pool = pool2;
      await apply($, setting.mode, pool2);
      return { text: await status($, setting.mode, pool2) };
    }
    const mode = MODES.find((m) => m === first);
    const id = gameId(first);
    if (mode === void 0 && id === void 0) {
      return { text: `No game or mode called "${first}". Games: ${GAMES.map((g) => g.id).join(", ")}. Modes: ${MODES.join(", ")}.` };
    }
    const pool = id === void 0 ? setting.pool : [id, ...setting.pool.filter((x) => x !== id)];
    const next = id === void 0 ? mode : "fixed";
    await save3($, options, next, pool);
    Object.assign(setting, { mode: next, pool });
    await apply($, next, pool);
    return { text: await status($, next, pool) };
  });
  on("skill.prompt", (_$, e, next) => {
    skillSeen(e.skill);
    return next(e);
  });
  on("classic.SubagentStop", async ($, e, next) => {
    const ran = await next(e);
    await celebrate4($, subagentMilestones());
    return ran;
  });
  on("command.run", { command: "dragon" }, ($, e, next) => command($, e, next));
  on("command.run", { command: "jackpot" }, ($, e, next) => command3($, e, next));
  on("command.run", { command: "outlaw" }, ($, e, next) => command5($, e, next));
  on("command.run", { command: "tama" }, ($, e, next) => command6($, e, next));
  on("command.run", { command: "tetris" }, ($, e, next) => command7($, e, next));
  on("command.run", { command: "octopus" }, ($, e, next) => command4($, e, next));
  on("command.run", { command: "duck" }, ($, e, next) => command2($, e, next));
  on("prompt.submit", async ($, e, next) => {
    const ran = await prompt($, e, ((e1) => prompt3($, e1, ((e2) => prompt5($, e2, ((e3) => prompt6($, e3, ((e4) => prompt7($, e4, ((e5) => prompt4($, e5, ((e6) => prompt2($, e6, next)))))))))))));
    await celebrate4($, promptMilestones(String(e.text ?? ""), await $.clock.now()));
    return ran;
  });
  on("turn.complete", async ($, e, next) => {
    const ran = await turn($, e, ((e1) => turn3($, e1, ((e2) => turn5($, e2, ((e3) => turn6($, e3, ((e4) => turn7($, e4, ((e5) => turn4($, e5, ((e6) => turn2($, e6, next)))))))))))));
    if (e.agentId === void 0 && !e.isAborted) await celebrate4($, turnMilestones(await $.clock.now()));
    return ran;
  });
  on("tool.call", async ($, e, next) => {
    const ran = await tool($, e, ((e1) => tool3($, e1, ((e2) => tool5($, e2, ((e3) => tool6($, e3, ((e4) => tool7($, e4, ((e5) => tool4($, e5, ((e6) => tool2($, e6, next)))))))))))));
    if (e.agentId === void 0 && ran.deny === void 0) await celebrate4($, toolMilestones(e, ran));
    return ran;
  });
  on("ui.render", { component: "AbovePrompt" }, ($, e, next) => render($, e, ((e1) => render3($, e1, ((e2) => render5($, e2, ((e3) => render6($, e3, ((e4) => render7($, e4, ((e5) => render4($, e5, ((e6) => render2($, e6, next))))))))))))));
};
