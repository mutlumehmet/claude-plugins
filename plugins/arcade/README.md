# arcade

The Claude Code Arcade: pixel games in the line above the prompt, played by your work. Every tool
call, commit, merge and failed test moves the game on. Part of [claude-plugins](../../README.md).

**Contents:** [Quick start](#quick-start) · [The games](#the-games) · [Switching games](#switching-games) ·
[Game guides](#game-guides) · [Moments](#moments) · [Tuning the moments](#tuning-the-moments) ·
[Scores](#scores) · [What it reads and does](#what-it-reads-and-does) · [Install](#install) ·
[Known gaps](#known-gaps)

![Octo Invader in a terminal: a pixel octopus smashes a city above the prompt while Claude edits, commits and merges](../../docs/images/octo-invader-terminal.gif)

## Quick start

Type these at the Claude Code prompt, then pick a scope (user is the usual one). There is nothing
to set up.

```
/plugin marketplace add mutlumehmet/claude-plugins
/plugin install arcade@mehmetmutlu
```

Octo Invader starts by itself, and the first time a short notice says where the controls are. Then
just work: the game plays along. Above the game sit small buttons:

| Button | What it does |
|---|---|
| **◀ ▶** | The previous or next game, in this terminal |
| **☰** | The game menu: every game with a line about it. A name plays it here, **☆** makes it your default |
| **☆ make default** | Shows once this terminal plays a game other than your default; makes it the game every new terminal starts with |
| **⟳** | Checks for a new Arcade version and installs it (the same as `/plugin update arcade@mehmetmutlu`), then puts `/reload-plugins` in the prompt for you. When a newer version is out it lights up as a yellow **● ⟳ update 0.x.y** |

**Updates**: Claude Code does not update plugins from this marketplace on its own unless you turn it
on (`/plugin`, Marketplaces, mehmetmutlu, Enable auto-update). Without that, press **⟳** now and
then, or type `/arcade update`. So you hear about it, each new terminal looks once for a newer
version (it reads the version number in this repository's `plugin.json` on GitHub, nothing else).
When one is out, ⟳ turns into a yellow **● ⟳ update 0.x.y** and a notice says so, once per version.
It never installs anything until you press it, and never checks again while the terminal is open.
`/arcade update check off` stops the look, `on` brings it back.

## The games

<table>
<tr><td>
<b>Octo Invader</b> <code>/arcade octopus</code>: a pixel octopus smashes a city the full width of the line while Claude edits<br>
<img src="../../docs/images/octo-invader.gif" width="800" alt="Octo Invader strip">
</td></tr>
<tr><td>
<b>Duck Hunt</b> <code>/arcade duck</code>: your moments shoot the ducks down, failed tools let them fly away<br>
<img src="../../docs/images/duck-hunt.gif" width="800" alt="Duck Hunt strip">
</td></tr>
<tr><td>
<b>Bug Command</b> <code>/arcade bugs</code>: bugs fall on six cities; Claude's tools shoot them down, and you can click the sky to fire too<br>
<img src="../../docs/images/bug-command.gif" width="800" alt="Bug Command strip">
</td></tr>
<tr><td>
<b>Dario</b> <code>/arcade dario</code>: a side scroller; tool calls bring ? blocks and coins, a failed tool sends a bug<br>
<img src="../../docs/images/dario.gif" width="800" alt="Dario strip">
</td></tr>
<tr><td>
<b>Block Town</b> <code>/arcade town</code>: your agents build a medieval town in blocks; big moments raise a castle<br>
<img src="../../docs/images/block-town.gif" width="800" alt="Block Town strip">
</td></tr>
<tr><td>
<img src="../../docs/images/arcade-hero.gif" width="400" align="right" alt="The five small games: dragon, slot machine, duel, Tamagotchi, Tetris">
Five small games at the right of the line:<br>
<b>Dragon Lair</b> <code>/arcade dragon</code>: a pixel dragon that breathes fire when you ship<br>
<b>Jackpot</b> <code>/arcade jackpot</code>: a slot machine; every finished turn pulls the lever<br>
<b>Outlaw</b> <code>/arcade outlaw</code>: an Atari duel; you fire at the good moments, the bug when a tool fails<br>
<b>Tama</b> <code>/arcade tama</code>: a Tamagotchi your work feeds, or it packs its bags<br>
<b>Tetris</b> <code>/arcade tetris</code>: Claude's tools drop the pieces
</td></tr>
</table>

## Switching games

The buttons above do the everyday switching. Everything else is a word after `/arcade`, and each
Claude Code config directory (an account) keeps its own choice.

| Command | What it does |
|---|---|
| `/arcade` | Opens the game menu (in `claude -p`, lists the games instead) |
| `/arcade duck` | Plays Duck Hunt in this terminal; other terminals and your default stay as they are |
| `/arcade default duck` | Makes Duck Hunt the game every new terminal starts with, and plays it here |
| `/arcade next` | The next game in this terminal |
| `/arcade random`, `rotate`, `all`, `off` | How new terminals pick: one at random, the next one in turn, every game at once, or none. `/arcade default <game>` goes back to one fixed game |
| `/arcade pool dragon tetris` | Picks only from these games (for random, rotate and all) |
| `/arcade hide` | Clears this terminal; `/arcade next` brings a game back |
| `/arcade update` | Checks for a new Arcade version and installs it, like **⟳** |
| `/arcade update check off` | Stops the look for a new version when a terminal opens (`on` brings it back) |
| `/arcade help` | The setting, which games this terminal shows, and these commands |

A game that is not shown keeps playing and keeps its score for this terminal; it only stops drawing
and stays quiet. A game's own command (`/dragon`, `/duck` and the rest) shows its score and plays
its practice moves.

## Game guides

What each game does with your work, its score line and its practice moves.


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
- **The score** sits at the right end of the strip: `Lv 3  ⌂ 12  ✈ 4  ⚒ 140` (level, buildings toppled, planes downed, tool calls).
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
- **The score** sits at the right end of the strip: `R 2  ▼ 14  ↗ 3  ⚒ 140` (round, ducks down, ducks that got away, tool calls).
- **`/duck`** shows the score; `/duck shot`, `hunt`, `double`, `perfect` and `flyaway` are practice that counts nothing.

### Bug Command (`bugs`)

Six cities and three silos along the bottom of the line above the prompt, the full width of it. Bugs
fall on the cities; Claude's work fires the counter missiles, and you can fire too. The one Arcade
game you can play along with while you wait.

![Bug Command in a terminal: a failed test drops a fast bug and you click the sky to shoot it down, a bug gets through and a city falls, the tests going green fire a salvo that rebuilds it, and a commit is a sure hit](../../docs/images/bug-command-terminal.gif)

The strip on its own, as the mod draws it:

![The Bug Command strip: six cities and three silos the width of the terminal, red bug trails, blue counter missiles, blasts, and the mouse pointer firing](../../docs/images/bug-command.gif)

Both GIFs are drawn by the Arcade's own code from a scripted session (a read, a failing test, an
edit, passing tests, a commit), with the mouse clicks played into the sky's own pointer handler;
the window around the strip is a mock up of a terminal.

- **While Claude works** a bug falls now and then, a red trail from the top towards a city. **A failed tool** drops a fast one (`INCOMING`).
- **Every finished tool call** fires a shot from the nearest silo at the lowest bug; most of them hit. A blast takes out every bug inside it, and each bug it takes out blasts too.
- **Moments**: a small one is a shot (or a flare in an empty sky), a medium one a sure hit, a big one a salvo at every bug in the sky that also rebuilds a fallen city (`BONUS CITY`).
- **A bug that gets through** ruins its city. When every city has fallen it is `THE END`, and new cities go up.
- **You can shoot**: click anywhere in the sky and the nearest silo fires there. After a click the sky has the keyboard: the arrows move the crosshair (with shift, faster), space or Enter fires at it, and `1`, `2`, `3` fire from the left, middle or right silo. A silo you fire from greys out for a moment. Esc hands the keyboard back to the prompt.
- **The score** sits at the right end of the strip: `✸ 14  ☞ 5  ✝ 2  ⚒ 140  ⌂ 6` (bugs shot down, the ones you shot yourself, cities lost, tool calls, cities standing).
- **`/bugs`** shows the score and the controls; `/bugs flare`, `shot` and `salvo` are practice that counts nothing, and `/bugs incoming` drops a practice bug to shoot at.

### Dario (`dario`)

A side scrolling course the full width of the line above the prompt, with a ground of bricks,
clouds, bushes and pipes. Dario runs while Claude works; you only watch.

![Dario in a terminal: tool calls bring ? blocks and coins, a failing test sends a bug that knocks into Dario, green tests are a course clear at the flag pole, a commit stomps a bug and a merge is a world clear with fireworks](../../docs/images/dario-terminal.gif)

The strip on its own, as the mod draws it:

![The Dario strip: a brick ground the width of the terminal, Dario running, ? blocks, a bug, pipes and the flag pole](../../docs/images/dario.gif)

Both GIFs are drawn by the Arcade's own code from a scripted session (a read, a search, a failing
test, an edit, passing tests, a commit, a merge); the window around the strip is a mock up of a
terminal.

- **While Claude works** the course scrolls by, fastest while a tool runs, and Dario jumps the pipes on its way. **Two minutes of quiet** and he sits down for a nap.
- **Every finished tool call** brings a ? block: Dario jumps, bumps it and a coin flies out. With two blocks already waiting, the coin comes straight away.
- **A failed tool** sends a bug walking in, and it knocks into Dario (`OUCH`).
- **Moments**: a small one is a hop and a sparkle, a medium one a bug stomped flat, a big one a flag pole: Dario slides down it for a `COURSE CLEAR!` and the next course. A merge, release, deploy, streak or record is a `WORLD CLEAR!` with fireworks.
- **The score** sits at the right end of the strip: `1-3  ◎ 34  ✪ 5  ✗ 2  ⚒ 140` (world and course, coins, bugs stomped, knocks, tool calls). Every hundred coins is a `1UP`.
- **`/dario`** shows the score; `/dario coin`, `ouch`, `stomp`, `clear` and `world` are practice that counts nothing.

### Block Town (`town`)

A town in blocks, seen from the side, the full width of the line above the prompt: grass, dirt and
stone, then houses, farms, a well, towers and a grove of trees. Your agents build it while they
work, and it grows for as long as the terminal is open, so a glance in the middle of a long session
shows how much got done.

![Block Town in a terminal: the main agent and a helper villager build a house, a farm and a grove while sheep, a pig and chickens wander between them, a failing test brings a creeper, green tests raise part of the castle, a commit finishes a house and a merge builds the castle](../../docs/images/block-town-terminal.gif)

The strip on its own, as the mod draws it:

![The Block Town strip: grass, dirt and stone the width of the terminal, houses, a farm with a sheep and a pig, chickens, trees and a finished castle](../../docs/images/block-town.gif)

Both GIFs are drawn by the Arcade's own code from a scripted session (edits and reads with a
subagent helping, a failing test, edits, passing tests, a commit, a merge); the window around the
strip is a mock up of a terminal.

- **Every tool call lays blocks** on the building going up (two, an edit or a write three), from the bottom row up, with scaffolding at its corners. The main agent's villager does it; **each subagent sends a helper villager** of its own colour, who goes home once that subagent is quiet.
- **Animals** live in the town as it earns them: a sheep and a pig for every finished farm, a chicken for every house, a cow for every hall, as many as the band has room for. They wander in front of the town and graze on open grass between the buildings, run from a creeper, and lie down when the town sleeps. They come from the buildings, so nothing about them is saved.
- **A failed tool** brings a creeper that walks up to a building, flashes and blows a hole in it (`BOOM`); the villagers build it back before starting anything new.
- **Moments**: a small one plants a tree (trees grow as the work goes on, sapling to full tree; once the grove is full, they grow faster instead), a medium one finishes the building going up (`HOUSE BUILT`), a big one raises a third of the castle at the right end of the band (`THE CASTLE GROWS`), and a merge, release, deploy, streak or record raises the rest at once (`CASTLE BUILT!`, fireworks).
- **When the band is full** the oldest building is torn down and built again, a house as a two storey hall.
- **The score** sits at the right end of the strip: `Village  ▦ 309  ⌂ 2  ♣ 5  ♜ 1  ⚒ 27` (the town's size from camp, hamlet, village and town to city, blocks laid, houses, trees, castles, tool calls). **Two minutes of quiet** and the villagers go indoors.
- **One town per terminal**: every terminal builds its own town, starting from an empty field, and it keeps growing while the town is not shown.
- **`/town`** shows the score; `/town build`, `tree`, `finish`, `castle` and `creeper` are practice that counts nothing. **`/town reset`** starts over: it asks first, and only `/town reset yes` within a minute clears this terminal's town and its score.

### Dragon Lair (`dragon`)

A small one colour pixel dragon that lives at the right end of the line above the prompt. It acts out what Claude is doing and breathes fire when something worth celebrating happens.

- **While Claude works** the dragon shows it: it hops when you send a message, raises its head while Claude thinks, bends over the page while a file is read, paces while a file is edited, beats its wings for shell commands and takes off for web and MCP tools.
- **Each subagent** hatches from an egg as a small dragon that flies beside it, flaps faster as the subagent works, and flies home when it finishes (or falls when it fails).
- **A failed tool** drops its head; **two minutes of quiet** and it falls asleep.
- **Moments**: a small one is a puff of smoke, a medium one a breath of fire, a big one a blaze, and a merge, release, deploy, streak or record a roar.
- **Gold** builds up with every moment while the terminal is open. Under the dragon: `Lv 3  ◆ 55  ★ 9  ⚒ 58` (level, gold, wins, tool calls).
- **`/dragon`** shows the hoard; `/dragon puff`, `fire`, `blaze` and `roar` show off each size.

### Jackpot (`jackpot`)

A pixel slot machine at the right end of the line above the prompt. Every finished turn pulls the lever; the moments worth celebrating earn golden spins with better odds.

- **Every finished turn** pulls the lever once. Reels blur, stop one by one and bounce as they lock.
- **Medium moments** queue one golden spin, **big moments** three: better odds, double pay, never a loss.
- **Five clean turns in a row** (no tool error) raise the multiplier by one, up to ×5; a failed tool resets it.
- **Payouts**: three 7s pay 100 chips, three dragons 50, diamonds 25, bells 15, stars 10, cherries 8; a cherry pair 3, any other pair 2. A jackpot strobes the cabinet and spills coins.
- **Under the machine**: `◉ 2967  ×1  ▲ 2  ✦ 0  ♛ 1` (chips, multiplier, clean streak, golden spins waiting, jackpots).
- **`/jackpot`** shows the rules and stats; `/jackpot spin`, `golden` and `demo` are practice spins that pay nothing.

### Outlaw (`outlaw`)

A one colour Atari Outlaw duel at the right end of the line above the prompt. Your gunslinger fires at the moments worth celebrating, the bug fires back when a tool fails.

- **Medium moments** are one shot for your gunslinger, **big moments** three. **A failed tool** is a shot for the bug.
- **A hit** is aimed at eye level and clears the cactus; **a miss** is from the hip and takes a chunk out of the cactus, which grows back between duels.
- **Between duels** the two pace, shift their weight and tip their hats, a tumbleweed rolls by and a vulture circles; while Claude thinks they stand with a hand on the gun.
- **Under the duel**: `YOU 7 : 3 BUGS  ▲ 4  ★ 6` (score, your run of hits, your best run).
- **`/outlaw`** shows the score and rules; `/outlaw draw` is a practice duel.

### Tama (`tama`)

A classic Tamagotchi in a small LCD at the right end of the line above the prompt. It lives in real time while the terminal is open, and your work is what feeds it. A new terminal starts with a new egg.

- **It hatches** from an egg after three finished turns, then grows from baby to child to teen to adult over real days. The adult it becomes depends on how it was raised: hard working, a rascal, or well fed.
- **Hunger** drops every 20 minutes and **joy** every hour, in real time. **Every finished turn** is a meal.
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
- **When the stack reaches the lid** the game ends, the well empties and a new game starts. The best score stays until the terminal closes.
- **Under the screen**: `▤ 35  ◆ 4250  Lv 3` (rows, score, level).
- **`/tetris`** shows the score and rules; `/tetris drop` adds pieces, `/tetris clear` clears a row.

## Moments

The Arcade spots the moments once and hands each one to every game, coding or not.

| Size | Moments |
|---|---|
| Small | A finished turn, a file saved, every 10th tool call in a turn |
| Medium | A commit, a push, a pull request opened, tests passing, any skill run, a subagent finished, a plan approved, an MCP tool that sends, creates, posts or publishes, a long document written, praise in your message |
| Big | A merge, a release (`gh release create`, `npm publish`), a production deploy (`vercel --prod`, `netlify deploy --prod`, `fly deploy` and others), tests back to green after failing, a deliverable made (PDF, DOCX, XLSX, PPTX, images), a published page, a finished task list of three or more, a marathon turn (10 minutes, 30 tools, no errors), three subagents done in one turn, a 3, 7, 30 or 100 day streak, the 100th, 1,000th or 10,000th tool call |

A commit that says "nothing to commit" or a push that says "Everything up-to-date" counts for
nothing. Tool calls inside subagents do not count; their finishing does.

## Tuning the moments

All optional, and none of it is asked at install. `/arcade moments` shows what is set;
`/arcade moments <key> <value>` sets one and `/arcade moments <key> none` clears it. Kept per Claude
Code config directory.

| Key | What it is for | Example |
|---|---|---|
| `big_skills` | Skills whose run is a big moment (every other skill is medium) | `/arcade moments big_skills release-notes, publish-report` |
| `quiet_skills` | Skills that celebrate nothing | `/arcade moments quiet_skills commit` |
| `big_commands` | A regular expression of shell commands whose success is big | `/arcade moments big_commands make ship` |
| `medium_commands` | A regular expression of shell commands whose success is medium | `/arcade moments medium_commands terraform apply` |
| `praise_words` | Extra words that count as praise, on top of the built-in list (thanks, great, perfect and a few in other languages) | `/arcade moments praise_words nice one, cheers` |

**Upgrading from 0.9.0 or earlier**: those versions kept the game choice and these keys as plugin
settings (`pluginConfigs` in settings.json). The Arcade no longer declares them, so set them again
with the commands above.

## Scores

Every game starts from zero in each terminal: the score, Block Town's town and Tama's pet belong
to that terminal and last until it closes. Two terminals play two separate games. Nothing is saved
between sessions; a reload of the plugin keeps what the terminal had.

- **Starting over**: `/<game> reset` (for example `/duck reset`) says what goes and asks; only
  `/<game> reset yes` within a minute clears that game in this terminal. `/arcade reset` does every
  game at once. Other terminals keep theirs.
- **Upgrading from 0.8.4 or earlier**: the scores those versions saved in Claude Code's plugin store
  are deleted the first time a session starts.

## What it reads and does

- **Reads**: the name of each tool Claude runs and whether it failed; for shell commands, the command
  line and whether its output says nothing changed; for file writes, the file name and its line
  count; skill names; the words of your message (only to spot praise); subagent start and finish.
- **Keeps**: no scores. Each terminal's games start from zero and end with it (see "Scores" below). In Claude Code's plugin store on your machine: your game choice (mode and pool), the moments keys, which game the last terminal showed, your days in a row, and how many sessions have shown the first run hint. Nothing is written into your projects.
- **Draws**: the games it shows in the line above the prompt (a block at the right end, or the octopus's, the duck hunt's and Bug Command's strips across the full width), the small ◀ ▶ ☰ ⟳ buttons above them, the game menu pane when you open it, and an occasional notice.
- **Hooks**: `skill.prompt` only notes which skill ran, so a finished skill can count as a moment; it passes the skill's prompt on unchanged. `command.run` answers its own commands (`/arcade` and the games' own commands) and no other. It changes no Claude Code setting.
- **Takes input**: only Bug Command, and only once you click its sky: from then until Esc, the keys you press go to the game, not the prompt. Clicks and keys never leave the game.
- **Privacy**: see [PRIVACY.md](../../PRIVACY.md).
- **Runs**: one command, and only when you press **⟳** or type `/arcade update`: Claude Code's own
  `claude plugin update arcade`, which fetches this marketplace from GitHub the same way
  `/plugin update` does.
- **Reads from the network**: once per terminal, when it opens, the Arcade's own `plugin.json` on
  GitHub (`raw.githubusercontent.com`), for its version number only. `/arcade update check off`
  stops it.
- **Never**: changes, blocks or delays a tool call or a message; sends anything about you anywhere
  (no telemetry, no repeated or timed update checks); reads file contents beyond counting lines of a file Claude writes, and its own `plugin.json`.

## Install

Needs Claude Code 2.1.287 or later (mods). Tested on 2.1.294. The commands are in
[Quick start](#quick-start).

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
`scripts/build.sh` joins them into `hooks/arcade.jsx` with esbuild. Bug Command's sky is a
`Client` (a region of the band that runs its own module, so it can take clicks and keys): its
module is `src/clients/bug-sky.tsx`, which the same script builds into `hooks/bug-sky.js`.
The sky runs the game loop; the hooks module hands it the session's events as props and keeps the
score the sky posts back. Edit `src/`, never
`hooks/`; CI fails when the two differ. A new game is one file in `src/games/`, one entry in
`GAMES` and `BLURBS` and one link in each chain in `src/arcade.tsx`, its state keys in `types/index.d.ts`, a
`reset` export wired into `resetGame` in `src/arcade.tsx`, and a test. A game keeps its state in
atoms only and never calls `$.store` (see "Scores").

## Known gaps

- The GIFs on this page were rendered before 0.10.0, so they do not show the ◀ ▶ ☰ buttons above the game.
- The buttons and the game menu are drawn in a terminal only; in the Desktop Code tab, use `/arcade`.

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
- **Dario**: The strip takes eight rows, like the octopus's and the duck hunt's.
- **Dario**: Things queue at the right edge, so after a burst of tool calls a flag pole can take a few seconds to reach Dario.
- **Block Town**: The town is laid out for the width of the terminal it was built in; a narrower terminal leaves out the buildings that do not fit, and a band under 64 columns has no room for the castle.
- **Bug Command**: The sky is drawn as runs of coloured text rather than the raster the other strips use, so a busy sky redraws more than they do; a still sky does not redraw at all.
- **Bug Command**: Only a terminal draws it; the Desktop Code tab, which draws the other games, does not show it yet.
- **Bug Command**: A click hands the keyboard to the sky until Esc; typing into the prompt needs Esc first.
- **Bug Command**: A terminal that does not report the position within a cell (tmux, among others) aims a click at the lower half of the cell.
- **Octo Invader**: The score glyphs `⌂` and `✈` are single width in most terminal fonts; a font that draws `✈` as an emoji shifts the score by one cell.

## About

[![Mehmet Mutlu: work that's shipped, at mehmetmutlu.dev](../../docs/images/site-banner.png)](https://www.mehmetmutlu.dev)

Made by Mehmet Mutlu, part of [claude-plugins](../../README.md). More of his work at [mehmetmutlu.dev](https://www.mehmetmutlu.dev).

## License

[MIT](../../LICENSE)
