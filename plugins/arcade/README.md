# arcade

The Claude Code Arcade: seven pixel games in the line above the prompt, played by your work. Pin the
one you like, rotate through them, or get a random one in every new terminal. Part of
[claude-plugins](../../README.md).

![The Claude Code Arcade: the games in a terminal, played by a session's work](../../docs/images/arcade-hero.gif)

| Game | Command | What it is |
|---|---|---|
| Dragon Lair | `/dragon` | A pixel dragon that acts out what Claude does and breathes fire when you ship |
| Jackpot | `/jackpot` | A slot machine: every finished turn pulls the lever |
| Outlaw | `/outlaw` | An Atari duel: your gunslinger fires at the good moments, the bug fires when a tool fails |
| Tama | `/tama` | A Tamagotchi your work feeds, or it packs its bags |
| Tetris | `/tetris` | Tetris where Claude's tools drop the pieces |
| Octo Invader | `/octopus` | A pixel octopus that smashes a city the full width of the line while Claude edits |
| Duck Hunt | `/duck` | A dog and a marsh the full width of the line: your moments shoot the ducks down, failed tools let them fly away |

## Choosing the games

Each new terminal shows the games the `mode` and `pool` settings pick. By default it is one game at
random from all seven.

| Command | What it does |
|---|---|
| `/arcade` | Shows the setting and which games this terminal shows |
| `/arcade tetris` | Pins Tetris: every new terminal shows it (`mode` fixed, Tetris first in the pool) |
| `/arcade random`, `rotate`, `all`, `off` | Sets how new terminals pick |
| `/arcade pool dragon tetris` | Picks only from these games |
| `/arcade next` | Swaps this terminal to the next game in the pool; new terminals still follow the setting |
| `/arcade hide` | Clears this terminal; `/arcade next` brings a game back |

The setting lives in Claude Code's settings (`pluginConfigs`), so the `/config` menu shows it too, and
each Claude Code config directory keeps its own: a work and a personal account can show different
games. Where there is no settings menu (`claude -p`), `/arcade` keeps the choice in the plugin's own
store, still per config directory, until the settings change. A game that is not shown keeps playing and keeps its score; it only stops drawing and stays quiet. A game's own command (`/dragon`, `/duck` and the rest) shows its score and plays its practice moves; which games show is only ever `/arcade`.

## The games

### Dragon Lair (`dragon`)

A small one colour pixel dragon that lives at the right end of the line above the prompt. It acts out what Claude is doing and breathes fire when something worth celebrating happens.

- **While Claude works** the dragon shows it: it hops when you send a message, raises its head while Claude thinks, bends over the page while a file is read, paces while a file is edited, beats its wings for shell commands and takes off for web and MCP tools.
- **Each subagent** hatches from an egg as a small dragon that flies beside it, flaps faster as the subagent works, and flies home when it finishes (or falls when it fails).
- **A failed tool** drops its head; **two minutes of quiet** and it falls asleep.
- **Moments**: a small one is a puff of smoke, a medium one a breath of fire, a big one a blaze, and a merge, release, deploy, streak or record a roar.
- **Gold** builds up with every moment and is kept between sessions. Under the dragon: `Lv 3  ◆ 55  ★ 9  ⚒ 58` (level, gold, wins, tool calls).
- **`/dragon`** shows the hoard; `/dragon puff`, `fire`, `blaze` and `roar` show off each size.

### Jackpot (`jackpot`)

A pixel slot machine at the right end of the line above the prompt. Every finished turn pulls the lever; the moments worth celebrating earn golden spins with better odds.

- **Every finished turn** pulls the lever once. Reels blur, stop one by one and bounce as they lock.
- **Medium moments** queue one golden spin, **big moments** three: better odds, double pay, never a loss.
- **Five clean turns in a row** (no tool error) raise the multiplier by one, up to ×5; a failed tool resets it.
- **Payouts**: three 7s pay 100 chips, three dragons 50, diamonds 25, bells 15, stars 10, cherries 8; a cherry pair 3, any other pair 2. A jackpot strobes the cabinet and spills coins.
- **Under the machine**: `◉ 2967  ×1  ▲ 2  ✦ 0  ♛ 1` (chips, multiplier, clean streak, golden spins waiting, jackpots). Chips are kept between sessions.
- **`/jackpot`** shows the rules and stats; `/jackpot spin`, `golden` and `demo` are practice spins that pay nothing.

### Outlaw (`outlaw`)

A one colour Atari Outlaw duel at the right end of the line above the prompt. Your gunslinger fires at the moments worth celebrating, the bug fires back when a tool fails.

- **Medium moments** are one shot for your gunslinger, **big moments** three. **A failed tool** is a shot for the bug.
- **A hit** is aimed at eye level and clears the cactus; **a miss** is from the hip and takes a chunk out of the cactus, which grows back between duels.
- **Between duels** the two pace, shift their weight and tip their hats, a tumbleweed rolls by and a vulture circles; while Claude thinks they stand with a hand on the gun.
- **Under the duel**: `YOU 7 : 3 BUGS  ▲ 4  ★ 6` (score, your run of hits, your best run). Kept between sessions.
- **`/outlaw`** shows the score and rules; `/outlaw draw` is a practice duel.

### Tama (`tama`)

A classic Tamagotchi in a small LCD at the right end of the line above the prompt. It lives in real time, even while Claude Code is closed, and your work is what feeds it.

- **It hatches** from an egg after three finished turns, then grows from baby to child to teen to adult over real days. The adult it becomes depends on how it was raised: hard working, a rascal, or well fed.
- **Hunger** drops every 20 minutes and **joy** every hour, in real time, also while Claude Code is closed. **Every finished turn** is a meal.
- **Medium moments** cheer it up a little, **big moments** a lot (hearts float up).
- **A failed tool** leaves a mess; five clean turns in a row tidy one away. Three messes, or an empty stomach, and it falls ill.
- **Left hungry for twelve hours** it packs its bags and leaves an egg behind. It never dies.
- **At night** (23:00 to 07:00 local time) it sleeps.
- **Under the LCD**: `♨ ▮▮▮▯  ♥ ▮▮▯▯  ✧ ▮▮▮▮` (food, joy, clean).
- **`/tama`** says how it is doing; `/tama feed`, `play` and `clean` are hand care, a few times a day.

### Tetris (`tetris`)

A classic falling-piece Tetris in a small handheld screen at the right end of the line above the prompt. Claude's tools drop the pieces; nobody knows what comes next.

- **Every tool Claude runs** drops a piece; a simple placement AI picks where it lands. The next piece is never shown.
- **A full row** clears, with the classic scoring (40, 100, 300 or 1200 for one to four rows, times the level). Every ten rows is a level.
- **A failed tool** pushes up a garbage row with one gap in it.
- **Medium moments** clear one row from the bottom, **big moments** three.
- **When the stack reaches the lid** the game ends, the well empties and a new game starts. The best score is kept.
- **Under the screen**: `▤ 35  ◆ 4250  Lv 3` (rows, score, level).
- **`/tetris`** shows the score and rules; `/tetris drop` adds pieces, `/tetris clear` clears a row.

### Octo Invader (`octopus`)

A pixel octopus invades a city that runs the full width of the line above the prompt. It acts out what Claude is doing, Godzilla style, and pulls planes out of the sky when something worth celebrating happens.

![octo-invader in a terminal: Claude reads, edits, commits and merges while the octopus walks the streets, smashes a building, pulls a plane out of the sky and takes the city](../../docs/images/octo-invader-terminal.gif)

The strip on its own, as the mod draws it:

![The octopus strip: a city the width of the terminal, buildings toppled, a plane downed, a flag on the rubble](../../docs/images/octo-invader.gif)

Both GIFs are drawn by the mod's own code from a scripted session (a read, an edit, a web search, a commit, a merge); the window around the strip is a mock up of a terminal.

- **While Claude works** the octopus shows it: it hops when you send a message, hovers over the rooftops while Claude thinks, walks the streets on its tentacles while a file is read, hunts about with a `?` while Claude searches, and takes to the sky for web and MCP tools.
- **Edits and shell commands** are demolition: it walks up to the nearest building and pounds it down a storey at a time until it falls with a `CRASH!`. Fallen buildings rise again after about 45 seconds, so the city never runs out.
- **Each subagent** is a baby octopus that swims behind it in a line, paddles faster as the subagent works, and swims home when it finishes (or sinks when it fails).
- **A failed tool** leaves it dazed with stars over its head; **two minutes of quiet** and it curls up asleep.
- **Moments**: a small one is a squirt of ink, a medium one a plane snatched out of the sky and thrown down (`BOOM!`), a big one a `RAMPAGE!` through the streets, and a merge, release, deploy, streak or record ends with a flag on the rubble and `THE CITY IS MINE`.
- **The score** sits at the right end of the strip: `Lv 3  ⌂ 12  ✈ 4  ⚒ 140` (level, buildings toppled, planes downed, tool calls). It is kept between sessions.
- **`/octopus`** shows the score; `/octopus ink`, `plane`, `rampage` and `conquer` show off each size.

### Duck Hunt (`duck`)

A marsh the full width of the line above the prompt, with the grass along the bottom, a tree, a dog
and ducks. Your work does the shooting.

![Duck Hunt in a terminal: a test fails and the dog laughs, the tests go green for a double, a commit shoots a duck, a merge is a perfect round](../../docs/images/duck-hunt-terminal.gif)

The strip on its own, as the mod draws it:

![The Duck Hunt strip: a marsh the width of the terminal, the dog in the grass, ducks flushed and shot down](../../docs/images/duck-hunt.gif)

Both GIFs are drawn by the Arcade's own code from a scripted session (a read, a failing test, an
edit, passing tests, a commit, a merge); the window around the strip is a mock up of a terminal.

- **While Claude works** the dog sniffs along the grass, faster while a tool runs, and now and then flushes a duck that flaps across the sky.
- **Moments**: a small one is a shot (a flash of the crosshair), a medium one shoots a duck down and the dog pops up from the grass holding it, a big one is a double (`DOUBLE!`, the dog holds two), and a merge, release, deploy, streak or record is a `PERFECT!` round with feathers everywhere.
- **A failed tool** lets the duck in the air get away (`FLY AWAY`), and the dog comes up laughing. **Two minutes of quiet** and the dog lies down asleep.
- **Rounds**: every ten ducks down is a new round (`ROUND 3`).
- **The score** sits at the right end of the strip: `R 2  ▼ 14  ↗ 3  ⚒ 140` (round, ducks down, ducks that got away, tool calls). It is kept between sessions.
- **`/duck`** shows the score; `/duck shot`, `hunt`, `double`, `perfect` and `flyaway` are practice that counts nothing.

## Moments

The Arcade spots the moments once and hands each one to every game, coding or not.

| Size | Moments |
|---|---|
| Small | A finished turn, a file saved, every 10th tool call in a turn |
| Medium | A commit, a push, a pull request opened, tests passing, any skill run, a subagent finished, a plan approved, an MCP tool that sends, creates, posts or publishes, a long document written, praise in your message |
| Big | A merge, a release (`gh release create`, `npm publish`), a production deploy (`vercel --prod`, `netlify deploy --prod`, `fly deploy` and others), tests back to green after failing, a deliverable made (PDF, DOCX, XLSX, PPTX, images), a published page, a finished task list of three or more, a marathon turn (10 minutes, 30 tools, no errors), three subagents done in one turn, a 3, 7, 30 or 100 day streak, the 100th, 1,000th or 10,000th tool call |

A commit that says "nothing to commit" or a push that says "Everything up-to-date" counts for
nothing. Tool calls inside subagents do not count; their finishing does.

## Settings

All optional. Set them in `/plugin` (the plugin's settings) or in
`settings.json` under `pluginConfigs`.

| Setting | What it is for | Example |
|---|---|---|
| `mode` | How each new terminal picks: `random` (one game from the pool, the default), `rotate` (the next one in turn), `fixed` (always the first in the pool), `all` (every game in the pool), `off` | `fixed` |
| `pool` | Comma separated games to pick from; empty means all seven | `dragon, tetris` |
| `big_skills` | Skills whose run is a big moment (every other skill is medium) | `release-notes, publish-report` |
| `quiet_skills` | Skills that celebrate nothing | `commit` |
| `big_commands` | A regular expression of shell commands whose success is big | `make ship` |
| `medium_commands` | A regular expression of shell commands whose success is medium | `terraform apply` |
| `praise_words` | Extra words that count as praise, on top of the built-in list (thanks, great, perfect and a few in other languages) | `nice one, cheers` |

## What it reads and does

- **Reads**: the name of each tool Claude runs and whether it failed; for shell commands, the command
  line and whether its output says nothing changed; for file writes, the file name and its line
  count; skill names; the words of your message (only to spot praise); subagent start and finish.
- **Keeps**: each game's score and state, and which game the last terminal showed, in Claude Code's plugin store on your machine; the mode and pool in your Claude Code settings.
- **Draws**: the games it shows in the line above the prompt (a block at the right end, or the octopus's and the duck hunt's strips across the full width), and an occasional notice.
- **Hooks**: `skill.prompt` only notes which skill ran, so a finished skill can count as a moment; it passes the skill's prompt on unchanged. `command.run` answers its own commands (`/arcade` and the seven game commands) and no other. `/arcade <game>`, `/arcade <mode>` and `/arcade pool` write `arcade.mode` and `arcade.pool` through Claude Code's own settings call, the same as changing them in the menu.
- **Privacy**: see [PRIVACY.md](../../PRIVACY.md).
- **Never**: changes, blocks or delays a tool call or a message; sends anything anywhere (no network
  calls, no telemetry); reads file contents beyond counting lines of a file Claude writes.

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.289.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install arcade@mehmetmutlu
```

A mod runs inside Claude Code with your permissions. Read the code before you install any mod.

It draws in a terminal (including an editor's integrated terminal) and in the Code tab of the
Desktop app; in the VS Code chat panel and `claude -p` it runs but draws nothing.

**Installed a game on its own before arcade 0.2.0?** The games now live only in `arcade`. Uninstall
the old ones (`/plugin uninstall dragon-lair@mehmetmutlu`, and the same for `jackpot`, `outlaw`, `tama`,
`tetris`, `octo-invader`), then install `arcade`. Scores start again from zero, and a Tamagotchi
hatches anew.

## How it is built

The engine follows `$` only into functions declared in the hooks module's own file, so the games
cannot be separate files at run time. They are in `src/` (one file per game in `src/games/`, and
`src/arcade.tsx`, which picks the games, spots the moments once and chains the games' hooks), and
`scripts/build.sh` joins them into `hooks/arcade.js` with esbuild. Edit `src/`, never
`hooks/arcade.js`; CI fails when the two differ. A new game is one file in `src/games/`, one entry in
`GAMES` and one link in each chain in `src/arcade.tsx`, its state keys in `types/index.d.ts`, and a
test.

## Known gaps

- With `all`, or several games shown, the line above the prompt gets tall; the octopus alone takes
  eight rows.
- **Dragon Lair**: A subagent that the engine reports without an id at spawn time may show a second hatchling briefly until its id is known.
- **Dragon Lair**: The dragon is drawn with block characters; a terminal with tall line spacing shows thin gaps between rows.
- **Jackpot**: The machine is in colour (red, green, blue, yellow, purple on a gold cabinet), so it does not follow a light or dark terminal theme the way the one colour games do.
- **Jackpot**: Where two colours meet inside one cell, a terminal with tall line spacing can show a hairline.
- **Outlaw**: The duel is drawn with block characters; a terminal with tall line spacing shows thin gaps between rows.
- **Tama**: Night is read from the computer's clock; there is no setting for other sleeping hours yet.
- **Tama**: Hand care is limited to six actions a day across feed, play and clean.
- **Tetris**: The well is 10 blocks wide and 8 deep, so games are short and restart often.
- **Tetris**: The placement AI favours a low, flat stack; it does not look ahead.
- **Octo Invader**: The strip takes eight rows; on a short terminal the line above the prompt scrolls instead of showing whole.
- **Octo Invader**: The octopus is drawn with half blocks; a terminal with tall line spacing shows thin gaps between rows.
- **Duck Hunt**: The strip takes eight rows, like the octopus's; with both showing the line above the prompt is sixteen rows tall.
- **Duck Hunt**: The ducks fly where they like; the crosshair finds them, it is not aimed by you.
- **Octo Invader**: The score glyphs `⌂` and `✈` are single width in most terminal fonts; a font that draws `✈` as an emoji shifts the score by one cell.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
