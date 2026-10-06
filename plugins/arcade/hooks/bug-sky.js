// Built by scripts/build.sh from src/clients/ with esbuild@0.25.10. Do not edit: edit src/ and rebuild.
// src/clients/bug-sky.tsx
var ROWS = 8;
var PH = ROWS * 2;
var TICK_MS = 66;
var GROUND = PH - 1;
var CITY_TOP = PH - 4;
var SKY_FLOOR = CITY_TOP - 1;
var CITIES = 6;
var SHOT_SPEED = 1.8;
var COOLDOWN = 5;
var SAND = "#c2a14d";
var SILO = "#d9a441";
var CITY = "#4dabf7";
var RUBBLE = "#6b6b6b";
var BUG_TRAIL = "#a8323e";
var BUG_HEAD = "#ff6b6b";
var SHOT_TRAIL = "#4c6ef5";
var SHOT_HEAD = "#ffffff";
var CROSS = "#69db7c";
var GREY = "#8a8a8a";
var GOLD = "#ffd43b";
var BLAST = ["#ffffff", "#ffd43b", "#ff922b", "#f06595", "#cc5de8"];
var rand = (a, b) => a + Math.random() * (b - a);
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function layout(W) {
  const silos = [2, Math.floor(W / 2), W - 3];
  const xs = [];
  for (const [a, b] of [[silos[0], silos[1]], [silos[1], silos[2]]]) {
    for (let i = 1; i <= 3; i++) xs.push(Math.round(a + (b - a) * i / 4) - 2);
  }
  return { silos, cityX: xs };
}
function create(props) {
  const W = Math.max(24, props.columns);
  const standing = clamp(props.cities, 0, CITIES);
  return {
    t: 0,
    W,
    seen: props.events.reduce((m, e) => Math.max(m, e.id), 0),
    cities: Array.from({ length: CITIES }, (_, i) => i < standing || standing === 0),
    silos: layout(W).silos,
    cooldown: [0, 0, 0],
    bugs: [],
    shots: [],
    blasts: [],
    plans: [],
    banner: null,
    cross: { x: Math.floor(W / 2), y: 4 },
    hasFired: false,
    nextBug: 40,
    endAt: -1,
    gain: { kills: 0, mine: 0, lost: 0, ends: 0, cities: standing === 0 ? CITIES : standing },
    props
  };
}
var cityX = (s, i) => layout(s.W).cityX[i];
function banner(s, text, color, frames) {
  s.banner = { text, color, until: s.t + frames };
}
function dropBug(s, isReal, fast = false) {
  const alive = s.cities.map((c, i) => c ? i : -1).filter((i) => i >= 0);
  if (alive.length === 0) return;
  const target = alive[Math.floor(Math.random() * alive.length)];
  const x0 = rand(1, s.W - 2);
  const tx = cityX(s, target) + 2;
  const frames = fast ? rand(70, 100) : rand(130, 200);
  const vy = (SKY_FLOOR + 2) / frames;
  s.bugs.push({ x0, y0: 0, x: x0, y: 0, vx: (tx - x0) / frames, vy, target, isReal });
}
function nearestSilo(s, x) {
  let best = -1;
  for (let i = 0; i < s.silos.length; i++) {
    if (s.cooldown[i] > 0) continue;
    if (best < 0 || Math.abs(s.silos[i] - x) < Math.abs(s.silos[best] - x)) best = i;
  }
  return best;
}
function fire(s, tx, ty, owner, isMiss = false, silo = nearestSilo(s, tx)) {
  if (silo < 0) return false;
  const sx = s.silos[silo];
  s.cooldown[silo] = owner === "you" ? COOLDOWN : 0;
  s.shots.push({ x0: sx, y0: SKY_FLOOR + 1, x: sx, y: SKY_FLOOR + 1, tx: clamp(tx, 0, s.W - 1), ty: clamp(ty, 0, SKY_FLOOR), owner, isMiss });
  return true;
}
function autoShot(s, bug, owner, isMiss) {
  const silo = s.silos.reduce((b, x, i) => Math.abs(x - bug.x) < Math.abs(s.silos[b] - bug.x) ? i : b, 0);
  let tx = bug.x;
  let ty = bug.y;
  for (let k = 0; k < 3; k++) {
    const frames = Math.hypot(tx - s.silos[silo], ty - (SKY_FLOOR + 1)) / SHOT_SPEED;
    tx = bug.x + bug.vx * frames;
    ty = bug.y + bug.vy * frames;
  }
  if (isMiss) tx += (Math.random() < 0.5 ? -1 : 1) * rand(6, 9);
  fire(s, tx, ty, owner, isMiss, silo);
}
var lowest = (s) => s.bugs.reduce((b, x) => b === void 0 || x.y > b.y ? x : b, void 0);
function play(s, e) {
  const owner = e.practice ? "practice" : "auto";
  if (e.kind === "tool") {
    const bug = lowest(s);
    if (bug) autoShot(s, bug, owner, Math.random() < 0.4);
  } else if (e.kind === "fail") {
    dropBug(s, !e.practice, true);
    banner(s, "INCOMING", BUG_HEAD, 30);
  } else if (e.kind === "small") {
    const bug = lowest(s);
    if (bug) autoShot(s, bug, owner, false);
    else s.blasts.push({ x: rand(4, s.W - 4), y: rand(2, 7), age: 0, max: 2, owner: "practice" });
  } else if (e.kind === "medium") {
    if (s.bugs.length === 0) dropBug(s, !e.practice);
    s.plans.push({ at: s.t + 20, kind: "sure", owner });
  } else {
    if (s.bugs.length === 0) {
      dropBug(s, !e.practice);
      dropBug(s, !e.practice);
    }
    s.plans.push({ at: s.t + 20, kind: "salvo", owner });
    const ruined = s.cities.findIndex((c) => !c);
    if (ruined >= 0 && !e.practice) {
      s.cities[ruined] = true;
      s.gain.cities = s.cities.filter(Boolean).length;
      banner(s, "BONUS CITY", GOLD, 60);
    } else banner(s, "SKY CLEAR!", GOLD, 60);
  }
}
function step(s) {
  s.t += 1;
  for (let i = 0; i < s.cooldown.length; i++) s.cooldown[i] = Math.max(0, s.cooldown[i] - 1);
  for (const p of s.plans.filter((p2) => p2.at <= s.t)) {
    if (p.kind === "sure") {
      const bug = lowest(s);
      if (bug) autoShot(s, bug, p.owner, false);
    } else for (const bug of s.bugs) autoShot(s, bug, p.owner, false);
  }
  s.plans = s.plans.filter((p) => p.at > s.t);
  if (s.props.working && s.endAt < 0 && s.t >= s.nextBug && s.bugs.length < 3) {
    dropBug(s, true);
    s.nextBug = s.t + Math.floor(rand(120, 260));
  }
  for (const shot of s.shots) {
    const dx = shot.tx - shot.x;
    const dy = shot.ty - shot.y;
    const d = Math.hypot(dx, dy);
    if (d <= SHOT_SPEED) {
      shot.x = shot.tx;
      shot.y = shot.ty;
      s.blasts.push({ x: shot.tx, y: shot.ty, age: 0, max: 3, owner: shot.owner });
    } else {
      shot.x += dx / d * SHOT_SPEED;
      shot.y += dy / d * SHOT_SPEED;
    }
  }
  s.shots = s.shots.filter((shot) => shot.x !== shot.tx || shot.y !== shot.ty);
  for (const bug of s.bugs) {
    bug.x += bug.vx;
    bug.y += bug.vy;
  }
  for (const b of s.blasts) b.age += 1;
  const radius = (b) => {
    const r = [1, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1][b.age] ?? 0;
    return Math.min(r, b.max);
  };
  const chained = [];
  s.bugs = s.bugs.filter((bug) => {
    const hit = s.blasts.find((b) => radius(b) > 0 && Math.hypot(bug.x - b.x, bug.y - b.y) <= radius(b) + 0.5);
    if (!hit) return true;
    chained.push({ x: bug.x, y: bug.y, age: 0, max: 2, owner: hit.owner });
    if (bug.isReal && hit.owner !== "practice") {
      s.gain.kills += 1;
      if (hit.owner === "you") s.gain.mine += 1;
    }
    return false;
  });
  s.blasts = [...s.blasts.filter((b) => b.age < 11), ...chained];
  s.bugs = s.bugs.filter((bug) => {
    if (bug.y < SKY_FLOOR + 1) return true;
    s.blasts.push({ x: bug.x, y: SKY_FLOOR + 1, age: 0, max: 3, owner: "practice" });
    if (bug.isReal && s.cities[bug.target]) {
      s.cities[bug.target] = false;
      s.gain.lost += 1;
      s.gain.cities = s.cities.filter(Boolean).length;
    }
    return false;
  });
  if (s.endAt < 0 && s.cities.every((c) => !c)) {
    s.endAt = s.t + 60;
    s.bugs = [];
    s.gain.ends += 1;
    banner(s, "THE END", BUG_HEAD, 60);
  }
  if (s.endAt >= 0 && s.t >= s.endAt) {
    s.endAt = -1;
    s.cities = s.cities.map(() => true);
    s.gain.cities = CITIES;
    banner(s, "NEW CITIES", CITY, 40);
  }
}
var isBusy = (s) => s.bugs.length > 0 || s.shots.length > 0 || s.blasts.length > 0 || s.plans.length > 0 || s.endAt >= 0 || s.banner !== null && s.t < s.banner.until;
var CITY_SHAPES = [
  [".#.#.", "#####", "#####"],
  ["..#..", ".###.", "#####"],
  ["#..#.", "##.##", "#####"]
];
function draw(s, el) {
  const { Box, Text } = el;
  const W = s.W;
  const px = new Array(W * PH).fill(null);
  const put = (x, y, c) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < W && y >= 0 && y < PH) px[y * W + x] = c;
  };
  const line = (x0, y0, x1, y1, c) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
  };
  const glyphs = /* @__PURE__ */ new Map();
  const text = (x, row, str, color) => [...str].forEach((ch, i) => {
    if (x + i >= 0 && x + i < W && row >= 0 && row < ROWS) glyphs.set(row * W + x + i, { ch, color });
  });
  for (let x = 0; x < W; x++) put(x, GROUND, SAND);
  s.cities.forEach((alive, i) => {
    const x = cityX(s, i);
    if (alive) {
      CITY_SHAPES[i % CITY_SHAPES.length].forEach((row, dy) => {
        for (let dx = 0; dx < 5; dx++) if (row[dx] === "#") put(x + dx, CITY_TOP + dy, CITY);
      });
    } else for (let dx = 0; dx < 5; dx += 2) put(x + dx, GROUND - 1, RUBBLE);
  });
  for (const [i, sx] of s.silos.entries()) {
    for (let dx = -2; dx <= 2; dx++) put(sx + dx, GROUND - 1, SILO);
    for (let dx = -1; dx <= 1; dx++) put(sx + dx, GROUND - 2, s.cooldown[i] > 0 ? GREY : SILO);
  }
  for (const bug of s.bugs) {
    line(bug.x0, bug.y0, bug.x, bug.y, BUG_TRAIL);
    put(bug.x, bug.y, s.t % 6 < 3 ? BUG_HEAD : SHOT_HEAD);
  }
  for (const shot of s.shots) {
    line(shot.x0, shot.y0, shot.x, shot.y, SHOT_TRAIL);
    put(shot.x, shot.y, SHOT_HEAD);
    if (shot.owner === "you") put(shot.tx, shot.ty, CROSS);
  }
  for (const b of s.blasts) {
    const r = Math.min([1, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1][b.age] ?? 0, b.max);
    const c = BLAST[(b.age + Math.round(b.x)) % BLAST.length];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) put(b.x + dx, b.y + dy, c);
  }
  const { x: cx, y: cy } = s.cross;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(cx + dx, cy + dy, CROSS);
  const standing = s.cities.filter(Boolean).length;
  const stats = `${s.props.stats}  \u2302 ${standing}`;
  text(W - stats.length - 1, 0, stats, GREY);
  if (!s.hasFired && s.bugs.some((b) => b.isReal)) text(1, 0, "click to fire", GREY);
  if (s.banner && s.t < s.banner.until && (s.banner.until - s.t) % 8 > 1) {
    text(Math.floor((W - s.banner.text.length) / 2), 1, s.banner.text, s.banner.color);
  }
  const rows = [];
  for (let row = 0; row < ROWS; row++) {
    const runs = [];
    let run = "";
    let look = "";
    let fg;
    let bg;
    const flush = () => {
      if (run) runs.push(/* @__PURE__ */ h(Text, { ...fg ? { color: fg } : {}, ...bg ? { backgroundColor: bg } : {} }, run));
      run = "";
    };
    for (let x = 0; x < W; x++) {
      const g = glyphs.get(row * W + x);
      const top = px[row * 2 * W + x] ?? null;
      const bottom = px[(row * 2 + 1) * W + x] ?? null;
      let ch;
      let f;
      let b;
      if (g) [ch, f, b] = [g.ch, g.color, void 0];
      else if (top === null && bottom === null) [ch, f, b] = [" ", void 0, void 0];
      else if (top === bottom) [ch, f, b] = ["\u2588", top, void 0];
      else if (bottom === null) [ch, f, b] = ["\u2580", top, void 0];
      else if (top === null) [ch, f, b] = ["\u2584", bottom, void 0];
      else [ch, f, b] = ["\u2580", top, bottom];
      const next = `${f ?? ""}|${b ?? ""}`;
      if (next !== look) {
        flush();
        look = next;
        fg = f;
        bg = b;
      }
      run += ch;
    }
    flush();
    rows.push(/* @__PURE__ */ h(Box, { flexDirection: "row" }, runs));
  }
  return /* @__PURE__ */ h(Box, { flexDirection: "column" }, rows);
}
var BugSky = (props, surface) => {
  if (surface.state === void 0) {
    const sky2 = create(props);
    const redraw = () => surface.setState({ sky: sky2, frame: sky2.t });
    let posted = props.cities;
    const post = () => {
      const g = sky2.gain;
      if (g.kills + g.mine + g.lost + g.ends === 0 && g.cities === posted) return;
      surface.post({ ...g });
      posted = g.cities;
      sky2.gain = { kills: 0, mine: 0, lost: 0, ends: 0, cities: g.cities };
    };
    surface.every(TICK_MS, () => {
      for (const e of sky2.props.events) {
        if (e.id <= sky2.seen) continue;
        sky2.seen = e.id;
        play(sky2, e);
      }
      const wasBusy = isBusy(sky2);
      step(sky2);
      post();
      if (wasBusy || isBusy(sky2)) redraw();
    });
    surface.onPointer((e) => {
      const y = e.fine ? Math.floor(e.fine.y * 2) : e.y * 2 + 1;
      sky2.cross = { x: clamp(e.x, 0, sky2.W - 1), y: clamp(y, 0, SKY_FLOOR) };
      if (e.type === "down" && e.button === "left" && fire(sky2, sky2.cross.x, sky2.cross.y, "you")) sky2.hasFired = true;
      redraw();
    });
    surface.onKey((e) => {
      const move = { left: [-2, 0], right: [2, 0], up: [0, -1], down: [0, 1] };
      const m = move[e.key];
      if (m) sky2.cross = { x: clamp(sky2.cross.x + m[0] * (e.shift ? 4 : 1), 0, sky2.W - 1), y: clamp(sky2.cross.y + m[1], 0, SKY_FLOOR) };
      else if (e.key === " " || e.key === "return") {
        if (fire(sky2, sky2.cross.x, sky2.cross.y, "you")) sky2.hasFired = true;
      } else if (e.key === "1" || e.key === "2" || e.key === "3") {
        if (fire(sky2, sky2.cross.x, sky2.cross.y, "you", false, sky2.cooldown[Number(e.key) - 1] === 0 ? Number(e.key) - 1 : -1)) sky2.hasFired = true;
      } else return;
      redraw();
    });
    surface.setState({ sky: sky2, frame: 0 });
    return draw(sky2, surface.elements);
  }
  const sky = surface.state.sky;
  sky.props = props;
  const W = Math.max(24, surface.columns || props.columns);
  if (W !== sky.W) {
    sky.W = W;
    sky.silos = layout(W).silos;
    sky.cross.x = clamp(sky.cross.x, 0, W - 1);
  }
  return draw(sky, surface.elements);
};
var bug_sky_default = BugSky;
export {
  bug_sky_default as default
};
