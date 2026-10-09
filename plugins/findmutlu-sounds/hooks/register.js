// Sound packs for the moments that need you, and no others.
//
//   moment       when                                         event
//   ordered      you sent a prompt after 5 quiet minutes      prompt.submit
//   needsYou     Claude waits for you: a permission prompt,   classic.Notification,
//                a question, a plan to approve                tool.call (AskUserQuestion, ExitPlanMode)
//   longDone     a turn of 60 s or more answered              turn.complete (main loop)
//   subagentStart a subagent started                          classic.SubagentStart
//   subagent     a subagent finished                          classic.SubagentStop
//   failed       a test, build, lint or type check failed     tool.call (Bash, isError; the step run, not heredoc text)
//   pushed       git push went through                        tool.call (Bash)
//   compacted    the conversation was compacted               classic.PostCompact
//   mcp          an MCP tool ran (off unless you turn it on)  tool.call (mcp__*, rests 5 minutes)
//
// Each moment plays the terminal's pack unless /sounds <moment> gave it its own rule: other packs,
// one clip, random or off (kept in the plugin store as settings.moments)
//
// Three kinds of pack:
//   file packs   clips in ../sounds/<pack>/ (source and rights holder in each CREDITS.md)
//   voice packs  lines the system voice speaks ($.audio.speak), so no audio file ships (none yet)
//   your packs   folders under ~/.config/<this plugin's name>/packs/<pack>/ with a pack.json,
//                read at session start and played from their bytes
//
// Which pack plays: this terminal's (/sounds <pack>), else your default (/sounds default <pack>,
// kept in the plugin store), else DEFAULT_PACK.

const DEFAULT_PACK = 'terran'
const LONG_TURN_MS = 60000
const QUIET_FROM = 23
const QUIET_TO = 7
// One sound at a time: several subagents finishing together give one clip, not ten. The last
// play time is shared by every terminal through a small file beside your packs folder
const GAP_MS = 2500
// A prompt plays only after a quiet spell, so typing away is not a clip every message
const ORDERED_REST_MS = 5 * 60000

// Front apps that mean you are already looking at Claude Code (away mode)
const HERE_APPS = ['Terminal', 'iTerm2', 'Code', 'Visual Studio Code', 'Cursor', 'Ghostty', 'Warp', 'Claude']

// Notification types that are only information, not a wait on you
const QUIET_NOTIFICATIONS = ['idle_prompt', 'auth_success']

// Checked against each step a command runs (heredoc bodies dropped), never against file text
const CHECK_TOOL = /^(pytest|jest|vitest|tsc|playwright|eslint|mypy|ruff|shellcheck|biome)$/
const CHECK_WORD = /^(test|tests|build|lint|typecheck|type-check|check|validate)(:.*)?$/
const CHECK_RUNNER = /^(npm|pnpm|yarn|bun|npx|bunx|make|cargo|go|deno|gradle|mvn|swift|turbo|nx)$/
const CHECK_SCRIPT = /(^|\/)(check|test|lint)[\w.-]*\.(sh|py|js|ts|mjs)$/
const PUSH_COMMAND = /\bgit\s+push\b/
// Tools that stop and wait for your answer
const ASKING_TOOLS = ['AskUserQuestion', 'ExitPlanMode']

const MOMENTS = ['ordered', 'needsYou', 'longDone', 'subagentStart', 'subagent', 'failed', 'pushed', 'compacted', 'mcp']

// What each moment means, for /sounds and its replies
const MOMENT_INFO = {
  ordered: 'you send a prompt (after 5 quiet minutes)',
  needsYou: 'Claude waits for your OK or answer',
  longDone: 'a turn of 60 s or more finishes',
  subagentStart: 'a subagent starts',
  subagent: 'a subagent finishes',
  failed: 'a test, build or lint fails',
  pushed: 'git push goes through',
  compacted: 'the conversation is compacted',
  mcp: 'an MCP tool runs (at most every 5 minutes)',
}

// Moments few packs carry start with a rule of their own: a villager is made when a subagent
// starts; the MCP trebuchet is off until you turn it on (MCP tools run often)
const DEFAULT_MOMENTS = { subagentStart: { packs: ['aoe'] }, mcp: { off: true } }

// Moment names are typed in lowercase (/sounds needsyou)
const MOMENT_BY_WORD = Object.fromEntries(MOMENTS.map((m) => [m.toLowerCase(), m]))
const MCP_REST_MS = 5 * 60000

// FILE_PACKS_START (generated from sounds/*/pack.json by scripts/packs.py; edit those, not this)
const FILE_PACKS = {
  "abathur": {
    "label": "StarCraft II: Abathur, the Zerg evolution master (fan use)",
    "ordered": [
      "thanks-00.m4a",
      "thanks-01.m4a"
    ],
    "needsYou": [
      "idle.m4a",
      "help-me.m4a"
    ],
    "longDone": [
      "evolution-00.m4a",
      "evolution-01.m4a"
    ],
    "subagentStart": [],
    "subagent": [
      "brutalisk.m4a",
      "thanks-02.m4a"
    ],
    "failed": [
      "units-lost.m4a"
    ],
    "pushed": [
      "positive.m4a",
      "generic.m4a"
    ],
    "compacted": [
      "brutalisk-reminder.m4a"
    ],
    "mcp": []
  },
  "aoe": {
    "label": "Age of Empires II: wololo, the horn and the taunts (Microsoft Game Content Usage Rules)",
    "ordered": [
      "yes.mp3",
      "start-the-game-already.mp3",
      "roggan.mp3"
    ],
    "needsYou": [
      "conversion-warning.mp3",
      "what-age-are-you-in.mp3",
      "wait-for-my-signal.mp3"
    ],
    "longDone": [
      "drum-fanfare.mp3",
      "long-time-no-siege.mp3",
      "good-to-be-the-king.mp3",
      "nice-town.mp3"
    ],
    "subagentStart": [
      "villager-created.mp3",
      "military-created.mp3"
    ],
    "subagent": [
      "horn.mp3",
      "sssh-ho.mp3",
      "oooh.mp3"
    ],
    "failed": [
      "herb-laugh.mp3",
      "no.mp3",
      "two-hours-to-die.mp3",
      "the-wonder-no.mp3",
      "being-rushed.mp3"
    ],
    "pushed": [
      "viking-horn.mp3",
      "converted.mp3",
      "raiding-party.mp3"
    ],
    "compacted": [
      "wololo.mp3",
      "give-me-your-extra-resources.mp3"
    ],
    "mcp": [
      "trebuchet-fire.mp3",
      "mangonel-fire.mp3"
    ]
  },
  "aoe-turk": {
    "label": "Age of Empires II: the Turks, villagers male and female, the war cry, swords and fanfares (Microsoft Game Content Usage Rules)",
    "ordered": [
      "tamam.m4a",
      "tamam-f.m4a",
      "evet.m4a",
      "evet-f.m4a",
      "dogru.m4a",
      "dogru-f.m4a",
      "yapacagim.m4a",
      "yapacagim-f.m4a"
    ],
    "needsYou": [
      "efendim.m4a",
      "efendim-f.m4a",
      "emrin.m4a",
      "emrin-f.m4a",
      "evet-question.m4a",
      "evet-question-f.m4a"
    ],
    "longDone": [
      "hazir.m4a",
      "hazir-f.m4a",
      "victory.mp3",
      "wonder.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "oduncu.m4a",
      "oduncu-f.m4a",
      "ciftci.m4a",
      "ciftci-f.m4a",
      "madenci.m4a",
      "madenci-f.m4a",
      "balikci.m4a",
      "balikci-f.m4a",
      "avci.m4a",
      "avci-f.m4a",
      "seyis.m4a",
      "seyis-f.m4a"
    ],
    "failed": [
      "villager-death.m4a",
      "villager-death-f.m4a",
      "tamirci.m4a",
      "tamirci-f.m4a",
      "sword-hit.mp3"
    ],
    "pushed": [
      "saldir.m4a",
      "saldir-f.m4a",
      "allah-allah.mp3",
      "ileri.mp3",
      "sword-clash.mp3"
    ],
    "compacted": [
      "usta.m4a",
      "usta-f.m4a",
      "castle.mp3"
    ],
    "mcp": []
  },
  "blood": {
    "label": "Blood: Caleb laughs, quotes and boomsticks (fan use)",
    "ordered": [
      "lets-go.mp3",
      "alright.mp3"
    ],
    "needsYou": [
      "come-out.mp3",
      "play-with-me.mp3"
    ],
    "longDone": [
      "i-won.mp3",
      "did-it.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "laughing.mp3",
      "yeah.mp3"
    ],
    "failed": [
      "all-dead.mp3",
      "rip.mp3",
      "pathetic.mp3"
    ],
    "pushed": [
      "boomstick.mp3",
      "napalm.mp3"
    ],
    "compacted": [
      "live-again.mp3",
      "nevermore.mp3"
    ],
    "mcp": []
  },
  "cabal": {
    "label": "Tiberian Sun: CABAL, the Nod AI (fan use)",
    "ordered": [
      "establishing-battlefield-control.m4a",
      "building.m4a",
      "please-stand-by.m4a"
    ],
    "needsYou": [
      "incoming-transmission.m4a",
      "select-target.m4a",
      "new-construction-options.m4a"
    ],
    "longDone": [
      "primary-objective-achieved.m4a",
      "mission-accomplished.m4a"
    ],
    "subagentStart": [],
    "subagent": [
      "reinforcements-have-arrived.m4a",
      "objective-complete.m4a"
    ],
    "failed": [
      "base-perimeter-breached.m4a",
      "critical-unit-lost.m4a",
      "you-make-this-easy.m4a"
    ],
    "pushed": [
      "congratulations-on-your-success.m4a",
      "prepare-for-decimation.m4a"
    ],
    "compacted": [
      "construct-more-power-plants.m4a",
      "low-power.m4a",
      "silos-needed.m4a"
    ],
    "mcp": []
  },
  "counterstrike": {
    "label": "Counter-Strike: the radio calls (fan use)",
    "ordered": [
      "lets-go.m4a",
      "roger-that.m4a",
      "affirmative.m4a"
    ],
    "needsYou": [
      "need-backup.m4a",
      "report-in.m4a"
    ],
    "longDone": [
      "area-clear.m4a"
    ],
    "subagentStart": [],
    "subagent": [
      "moving-out.m4a",
      "you-take-the-point.m4a"
    ],
    "failed": [
      "negative.m4a",
      "enemy-spotted.m4a"
    ],
    "pushed": [
      "lock-and-load.m4a"
    ],
    "compacted": [
      "fall-back.m4a",
      "stick-together.m4a",
      "hold-your-position.m4a"
    ],
    "mcp": []
  },
  "diablo": {
    "label": "Diablo II effects: level up, quest done, gold, a portal opens (Blizzard, fan use)",
    "ordered": [
      "potion-drink.mp3",
      "select.mp3"
    ],
    "needsYou": [
      "hostile.mp3",
      "waypoint.mp3"
    ],
    "longDone": [
      "level-up.mp3",
      "quest-done.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "gold.mp3",
      "rune.mp3"
    ],
    "failed": [
      "item-broken.mp3",
      "glass-break.mp3"
    ],
    "pushed": [
      "portal-open.mp3",
      "cairn-success.mp3"
    ],
    "compacted": [
      "identify.mp3",
      "scroll.mp3"
    ],
    "mcp": []
  },
  "duke": {
    "label": "Duke Nukem 3D: come get some, hail to the king, baby (fan use)",
    "ordered": [
      "come-get-some.mp3",
      "im-going-in.mp3"
    ],
    "needsYou": [
      "waiting-for-christmas.mp3",
      "you-wanna-dance.mp3"
    ],
    "longDone": [
      "damn-im-good.mp3",
      "piece-of-cake.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "groovy.mp3",
      "back-to-work.mp3"
    ],
    "failed": [
      "game-over.mp3",
      "this-sucks.mp3",
      "gotta-hurt.mp3"
    ],
    "pushed": [
      "hail-to-the-king.mp3",
      "bubble-gum.mp3"
    ],
    "compacted": [
      "much-better.mp3",
      "needed-that.mp3"
    ],
    "mcp": []
  },
  "engineer": {
    "label": "Team Fortress 2: the Engineer (fan use)",
    "ordered": [
      "teleporter-comin-right-up.mp3",
      "buildin-a-sentry.mp3",
      "lets-do-this-texas-style.mp3"
    ],
    "needsYou": [
      "not-on-auto-pilot.mp3",
      "help-me.mp3"
    ],
    "longDone": [
      "done-and-done.mp3",
      "knife-fight-in-a-phonebooth.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "another-satisfied-customer.mp3",
      "nice-work.mp3"
    ],
    "failed": [
      "you-just-aint-doin-it-right.mp3",
      "sentry-down.mp3",
      "told-ya-dont-touch.mp3"
    ],
    "pushed": [
      "yeehaw.mp3",
      "move-em-out.mp3"
    ],
    "compacted": [
      "good-night-irene.mp3",
      "now-ive-seen-everything.mp3"
    ],
    "mcp": []
  },
  "lebowski": {
    "label": "The Big Lebowski: the Dude, Walter, Donny and friends, clean lines (fan use)",
    "ordered": [
      "the-dude-abides.mp3",
      "far-out.mp3",
      "no-problemo.mp3"
    ],
    "needsYou": [
      "phones-ringing-dude.mp3",
      "whats-your-point.mp3",
      "certain-things-have-come-to-light.mp3"
    ],
    "longDone": [
      "rug-tied-the-room-together.mp3",
      "goodnight-sweet-prince.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "i-like-your-style.mp3",
      "ive-got-information.mp3"
    ],
    "failed": [
      "over-the-line.mp3",
      "mark-it-zero.mp3",
      "world-of-pain.mp3",
      "this-aggression-will-not-stand.mp3"
    ],
    "pushed": [
      "way-to-go-donny.mp3",
      "wave-of-the-future.mp3"
    ],
    "compacted": [
      "just-take-it-easy.mp3",
      "strikes-and-gutters.mp3"
    ],
    "mcp": []
  },
  "lich": {
    "label": "Warcraft III: the Lich and Kel'Thuzad (fan use)",
    "ordered": [
      "as-the-master-commands.m4a",
      "i-shall-obey.m4a",
      "direct-my-hatred.m4a"
    ],
    "needsYou": [
      "thy-bidding-master.m4a",
      "what-is-thy-will.m4a",
      "i-await-your-command.m4a"
    ],
    "longDone": [
      "thy-will-be-done.m4a",
      "the-ancient-evil-survives.m4a"
    ],
    "subagentStart": [],
    "subagent": [
      "for-the-lich-king.m4a",
      "it-is-destined.m4a"
    ],
    "failed": [
      "aaugh.m4a",
      "do-not-try-my-patience.m4a"
    ],
    "pushed": [
      "kneel-before-my-frost-nova.m4a",
      "dread-lord-not-drug-lord.m4a"
    ],
    "compacted": [
      "the-scourge-will-consume-all.m4a",
      "bone-to-pick.m4a"
    ],
    "mcp": []
  },
  "meeseeks": {
    "label": "Rick and Morty: Mr. Meeseeks, look at me! (fan use)",
    "ordered": [
      "can-do.mp3",
      "can-do-2.mp3",
      "ooh-okay.mp3",
      "okay.mp3"
    ],
    "needsYou": [
      "what-do-you-got.mp3",
      "excuse-me.mp3",
      "back-to-the-task.mp3"
    ],
    "longDone": [
      "all-done.mp3",
      "exist-this-long.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "im-mr-meeseeks.mp3",
      "look-at-me.mp3",
      "fulfill-my-purpose.mp3",
      "yes-sirree.mp3"
    ],
    "failed": [
      "cant-take-it.mp3",
      "frustrating.mp3",
      "doesnt-work-like-that.mp3"
    ],
    "pushed": [
      "ooh-yeah.mp3",
      "yes-maam.mp3"
    ],
    "compacted": [
      "gotta-relax.mp3",
      "let-me-try.mp3"
    ],
    "mcp": []
  },
  "nasa": {
    "label": "NASA radio: the Eagle has landed, liftoff, we have had a problem (public domain)",
    "ordered": [
      "roger-roll.m4a",
      "quindar-beep.m4a"
    ],
    "needsYou": [
      "houston-discovery.m4a",
      "how-do-you-read.m4a"
    ],
    "longDone": [
      "eagle-landed.m4a",
      "wheels-stop.m4a"
    ],
    "subagentStart": [],
    "subagent": [
      "go-for-deploy.m4a",
      "go-at-throttle-up.m4a"
    ],
    "failed": [
      "weve-had-a-problem.m4a"
    ],
    "pushed": [
      "liftoff.m4a",
      "liftoff-41d.m4a"
    ],
    "compacted": [
      "vector-transfer.m4a"
    ],
    "mcp": []
  },
  "necromancer": {
    "label": "Diablo II Necromancer: raise skeleton, not enough mana, I cannot carry any more (Blizzard, fan use)",
    "ordered": [
      "ok.mp3",
      "yes.mp3",
      "lets-go.mp3"
    ],
    "needsYou": [
      "need-help.mp3",
      "yes-question.mp3",
      "what-else.mp3"
    ],
    "longDone": [
      "diablo-killed.mp3",
      "baal-defeated.mp3",
      "andariel-done.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "raise-skeleton.mp3",
      "golem.mp3",
      "revive.mp3"
    ],
    "failed": [
      "i-cant.mp3",
      "oops.mp3",
      "not-enough-mana.mp3"
    ],
    "pushed": [
      "time-to-die.mp3",
      "meet-your-fate.mp3",
      "corpse-explosion.mp3"
    ],
    "compacted": [
      "cant-carry.mp3",
      "need-mana.mp3"
    ],
    "mcp": []
  },
  "peon": {
    "label": "Warcraft III peon: work work, zug zug, something need doing? (Blizzard, fan use)",
    "ordered": [
      "work-work.mp3",
      "okey-dokey.mp3",
      "i-can-do-that.mp3",
      "be-happy-to.mp3"
    ],
    "needsYou": [
      "something-need-doing.mp3",
      "ready-to-work.mp3",
      "what-do-you-want.mp3"
    ],
    "longDone": [
      "zug-zug.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "me-busy.mp3",
      "yes.mp3",
      "ok.mp3"
    ],
    "failed": [
      "splat.mp3",
      "tummy-feels-funny.mp3",
      "not-that-kind-of-orc.mp3"
    ],
    "pushed": [
      "kill-them.mp3",
      "why-not.mp3"
    ],
    "compacted": [
      "leave-me-alone.mp3",
      "no-time-for-play.mp3"
    ],
    "mcp": []
  },
  "protoss": {
    "label": "StarCraft Protoss: construct additional pylons, my life for Aiur (Blizzard, fan use)",
    "ordered": [
      "adun-toridas.mp3"
    ],
    "needsYou": [
      "transmission.mp3"
    ],
    "longDone": [
      "upgrade-complete.mp3",
      "research.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "upgrade.mp3",
      "systems-functional.mp3"
    ],
    "failed": [
      "pylons.mp3",
      "pylons-2.mp3"
    ],
    "pushed": [
      "life-for-aiur.mp3",
      "power-overwhelming.mp3"
    ],
    "compacted": [
      "vespene-gas.mp3"
    ],
    "mcp": []
  },
  "red-alert": {
    "label": "Red Alert 2: Kirov reporting, for mother Russia (EA, fan use)",
    "ordered": [
      "acknowledged.mp3",
      "yes-commander.mp3",
      "can-do.mp3"
    ],
    "needsYou": [
      "commander.mp3",
      "give-me-a-job.mp3",
      "anytime-boss.mp3"
    ],
    "longDone": [
      "kirov-reporting.mp3",
      "cha-ching.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "unit-reporting.mp3",
      "agent-ready.mp3"
    ],
    "failed": [
      "mommy.mp3",
      "bail-out.mp3"
    ],
    "pushed": [
      "kaboom.mp3",
      "for-mother-russia.mp3"
    ],
    "compacted": [
      "your-mind-is-clear.mp3",
      "deconstructing.mp3"
    ],
    "mcp": []
  },
  "rick-and-morty": {
    "label": "Rick and Morty: family-friendly lines from Rick and the crew (fan use)",
    "ordered": [
      "wubba-lubba-dub-dub.mp3",
      "here-we-go.mp3",
      "time-for-action.mp3",
      "twenty-minute-adventure.mp3"
    ],
    "needsYou": [
      "show-me-what-you-got.mp3",
      "yes-or-no.mp3",
      "hey-morty.mp3"
    ],
    "longDone": [
      "pickle-rick.mp3",
      "pure-luck.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "what-is-my-purpose.mp3",
      "everything-you-want.mp3",
      "oh-yeah.mp3"
    ],
    "failed": [
      "oh-jeeze.mp3",
      "oh-man.mp3",
      "not-in-control.mp3"
    ],
    "pushed": [
      "im-pickle-rick.mp3",
      "my-plan-all-along.mp3"
    ],
    "compacted": [
      "brain-functionality.mp3",
      "super-intelligence.mp3"
    ],
    "mcp": []
  },
  "rick-and-morty-uncut": {
    "label": "Rick and Morty, uncut: the swearing lines (explicit language, fan use)",
    "ordered": [
      "son-of-a-bitch-im-in.mp3",
      "gonna-fucking-do-it.mp3",
      "doctor-who.mp3"
    ],
    "needsYou": [
      "who-the-fuck-are-you.mp3",
      "seeds-up-your-butt.mp3"
    ],
    "longDone": [
      "having-a-party.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "god-damn-it.mp3"
    ],
    "failed": [
      "oh-fuck-me.mp3",
      "fuck-the-government.mp3"
    ],
    "pushed": [
      "everybody-fuck-off.mp3",
      "dick-move.mp3"
    ],
    "compacted": [
      "traumatized-for-breakfast.mp3",
      "take-a-shit.mp3"
    ],
    "mcp": []
  },
  "sheogorath": {
    "label": "The Elder Scrolls IV: Sheogorath, Prince of Madness (fan use)",
    "ordered": [
      "good-choice.m4a",
      "i-like-it.m4a",
      "dance-sing-smile.m4a"
    ],
    "needsYou": [
      "ive-been-waiting-for-you.m4a",
      "need-a-champion.m4a"
    ],
    "longDone": [
      "cheese-for-everyone.m4a"
    ],
    "subagentStart": [],
    "subagent": [
      "congratulations.m4a",
      "but-youre-not-done-yet.m4a"
    ],
    "failed": [
      "boring-boring-boring.m4a",
      "absolutely-not.m4a",
      "how-rude.m4a"
    ],
    "pushed": [
      "prince-of-madness.m4a",
      "dont-get-too-comfortable.m4a"
    ],
    "compacted": [
      "a-little-busy-here.m4a",
      "niggling-little-details.m4a"
    ],
    "mcp": []
  },
  "stronghold": {
    "label": "Stronghold Crusader: the AI lords (fan use)",
    "ordered": [
      "richard-i-march.mp3",
      "abbot-agreed.mp3",
      "marshal-off-we-go.mp3",
      "philip-on-my-honor.mp3"
    ],
    "needsYou": [
      "abbot-send-help.mp3",
      "sheriff-help-surrounded.mp3"
    ],
    "longDone": [
      "richard-sound-the-fanfare.mp3",
      "abbot-victory-for-me.mp3",
      "pig-no-one-beats-the-pig.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "rat-plans-worked-perfectly.mp3",
      "saladin-another-has-fallen.mp3",
      "emir-this-is-easy.mp3"
    ],
    "failed": [
      "abbot-my-troops-fail-me.mp3",
      "emir-what-a-disaster.mp3",
      "marshal-bad-tactics.mp3"
    ],
    "pushed": [
      "richard-the-lion-roars.mp3",
      "wolf-i-win-you-lose.mp3",
      "sheriff-sweet-victory.mp3"
    ],
    "compacted": [
      "sheriff-not-father-christmas.mp3",
      "richard-lean-times.mp3"
    ],
    "mcp": []
  },
  "tauren": {
    "label": "World of Warcraft: the Tauren (fan use)",
    "ordered": [
      "peace-and-patience.m4a",
      "indeed.m4a",
      "it-is-so.m4a"
    ],
    "needsYou": [
      "i-need-assistance.m4a",
      "wont-you-help.m4a"
    ],
    "longDone": [
      "fate-smiles-upon-you.m4a",
      "our-ancestors-be-praised.m4a"
    ],
    "subagentStart": [],
    "subagent": [
      "well-done.m4a",
      "pleasure-doing-business.m4a"
    ],
    "failed": [
      "impermissible.m4a",
      "i-cannot-do-that.m4a"
    ],
    "pushed": [
      "for-the-horde.m4a",
      "ride-the-winds.m4a"
    ],
    "compacted": [
      "my-inventory-is-full.m4a",
      "i-cannot-carry-more.m4a",
      "moo.m4a"
    ],
    "mcp": []
  },
  "terran": {
    "label": "StarCraft Terran: SCV good to go, nuclear launch detected (Blizzard, fan use)",
    "ordered": [
      "scv-good-to-go.mp3",
      "jacked-up.mp3"
    ],
    "needsYou": [
      "piece-of-me.mp3",
      "supply-depots.mp3"
    ],
    "longDone": [
      "battlecruiser-operational.mp3"
    ],
    "subagentStart": [],
    "subagent": [
      "research-complete.mp3",
      "upgrade-complete.mp3"
    ],
    "failed": [
      "nuclear-launch.mp3",
      "base-under-attack.mp3"
    ],
    "pushed": [
      "in-the-pipe.mp3"
    ],
    "compacted": [
      "not-enough-minerals.mp3",
      "vespene-gas.mp3"
    ],
    "mcp": []
  },
  "yuri": {
    "label": "Red Alert 2: Yuri's Revenge: Yuri (fan use)",
    "ordered": [
      "your-thoughts-are-mine.m4a",
      "a-trivial-matter.m4a",
      "yes-i-know.m4a"
    ],
    "needsYou": [
      "i-foresaw-this-need.m4a",
      "share-your-thoughts.m4a",
      "something-to-think-about.m4a"
    ],
    "longDone": [
      "yes-my-exquisite-mind.m4a",
      "they-will-obey.m4a"
    ],
    "subagentStart": [],
    "subagent": [
      "another-pawn-joins-us.m4a",
      "he-shall-serve-me-well.m4a"
    ],
    "failed": [
      "i-did-not-foresee-this.m4a",
      "this-could-be-a-problem.m4a"
    ],
    "pushed": [
      "there-is-only-one-yuri.m4a",
      "yield-to-me.m4a"
    ],
    "compacted": [
      "all-in-the-mind.m4a",
      "i-cannot-be-overcome.m4a"
    ],
    "mcp": []
  }
}
// FILE_PACKS_END

const VOICE_PACKS = {}

// Module variables are this terminal's: each terminal is its own process. A plugin reload
// starts them over, which only costs this terminal's /sounds <pack> choice.
const here = { pack: undefined, playedAt: 0, yourPacks: {}, lastClip: {} }

const DEFAULTS = { isOn: true, defaultPack: DEFAULT_PACK, mode: 'always', isNightQuiet: true }

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sounds',
      description: 'Sound packs for the moments that need you: /sounds to see every moment and command, /sounds <pack>, /sounds <moment> <pack>, test',
      argumentHint: '[<pack>|default <pack>|<moment> <pack> [clip]|<moment> random|off|reset|on|off|test [pack] [moment]]',
    })
    here.yourPacks = await loadYourPacks($)
    // Said once, so the way to change the pack is never a secret
    try {
      if (!(await $.store.get('welcomed'))) {
        await $.store.set('welcomed', true)
        const settings = await readSettings($)
        $.ui.toast('Sounds: ' + settings.defaultPack + ' pack. Type /sounds for the others')
      }
    } catch {
      // A hint is never worth an error line
    }
    return next(e)
  })

  on('command.run', { command: 'sounds' }, async ($, e) => {
    const args = String(e.args ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    const settings = await readSettings($)
    const current = currentPack(settings)

    if (args[0] === 'test') {
      // /sounds test [pack] [moment], either may be left out
      const words = args.slice(1)
      const moment = MOMENT_BY_WORD[words[words.length - 1]]
      if (moment) words.pop()
      const name = words[0] ?? current
      if (!packOf(name)) {
        const meant = closestPack(name)
        return { text: 'No pack named ' + name + (meant ? '. Did you mean ' + meant + '? /sounds test ' + meant + (moment ? ' ' + moment.toLowerCase() : '') : '\n' + listing()) }
      }
      const count = await playAll($, name, moment)
      return { text: 'Played ' + count + ' sounds of ' + name + (moment ? ' for ' + moment : '') }
    }
    // No word: where things stand, then every command and pack
    if (!args.length) return { text: describe(settings) }
    // /sounds <moment> ...: that moment's own rule
    if (MOMENT_BY_WORD[args[0]]) return momentCommand($, settings, MOMENT_BY_WORD[args[0]], args.slice(1))
    // A change answers with one line saying what changed, not the whole list again
    if (packOf(args[0]) && args.length === 1) {
      here.pack = args[0]
      const def = defaultOf(settings)
      return {
        text: 'This terminal now plays ' + args[0] + ': ' + packOf(args[0]).label +
          (args[0] === def ? '' : '\nNew terminals still start with ' + def + ' (/sounds default ' + args[0] + ' to change that)'),
      }
    }
    if (args[0] === 'default' && !packOf(args[1])) {
      const meant = args[1] && closestPack(args[1])
      if (meant) return { text: 'No pack named ' + args[1] + '. Did you mean ' + meant + '? /sounds default ' + meant }
      return { text: (args[1] ? 'No pack named ' + args[1] : 'Which pack? /sounds default <pack>') + '\n' + listing() }
    }
    const change = CHANGES.find((c) => c.matches(args))
    if (!change) {
      // A typo of a pack name (aeo-turk) gets the pack it meant, not just the list
      const meant = closestPack(args[args.length - 1])
      if (meant) return { text: 'No pack named ' + args[args.length - 1] + '. Did you mean ' + meant + '? /sounds ' + (args[0] === 'default' ? 'default ' : '') + meant }
      return { text: 'Unknown: ' + args.join(' ') + '\n' + commands() + '\n' + listing() }
    }
    const updated = change.apply({ ...settings }, args)
    await $.store.set('settings', updated)
    return { text: change.said(updated, args, settings) }
  })

  // An order given: the unit answers. You are at the keyboard, so away mode does not apply
  on('prompt.submit', async ($, e, next) => {
    await cue($, 'ordered', { isPresent: true, restMs: ORDERED_REST_MS })
    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (!QUIET_NOTIFICATIONS.includes(e.notification_type)) await cue($, 'needsYou')
    return next(e)
  })

  on('classic.SubagentStart', async ($, e, next) => {
    await cue($, 'subagentStart').catch(() => {})
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await cue($, 'subagent')
    return next(e)
  })

  on('classic.PostCompact', async ($, e, next) => {
    await cue($, 'compacted')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (!e.agentId && e.reason === 'answer' && e.durationMs >= LONG_TURN_MS) await cue($, 'longDone')
    return out
  })

  // One hook for the tools: a plugin gets one hook per event
  on('tool.call', async ($, e, next) => {
    // A question waits for you, so the sound goes before the answer, not after it
    if (ASKING_TOOLS.includes(e.tool)) {
      await cue($, 'needsYou')
      return next(e)
    }
    if (String(e.tool).startsWith('mcp__')) {
      const out = await next(e)
      if (out.deny === undefined && !out.isError) await cue($, 'mcp', { restMs: MCP_REST_MS })
      return out
    }
    if (e.tool !== 'Bash') return next(e)
    const out = await next(e)
    const command = String(e.command ?? '')
    if (out.deny === undefined) {
      if (out.isError && runsCheck(command)) await cue($, 'failed')
      else if (!out.isError && PUSH_COMMAND.test(command)) await cue($, 'pushed')
    }
    return out
  })
}

// Plays one sound of the moment when the settings allow it; never delays or breaks the event
async function cue($, moment, opts = {}) {
  try {
    const settings = await readSettings($)
    if (!settings.isOn) return
    const choices = choicesFor(settings, moment)
    if (!choices.length) return
    const now = await $.clock.now()
    const last = Math.max(here.playedAt, await sharedPlayedAt($))
    if (now - last < Math.max(GAP_MS, opts.restMs ?? 0)) return
    if (settings.isNightQuiet && isQuietHour(new Date(now).getHours())) return
    if (!opts.isPresent && settings.mode === 'away' && (await isHere($))) return
    here.playedAt = now
    await sharePlayedAt($, now)
    // Not awaited: the sound plays while the session goes on
    const [name, item] = pick(choices.map((c) => c.pack + '/' + c.item), here.lastClip, moment, now).split(/\/(.*)/s)
    sound($, packOf(name), item).catch(() => {})
  } catch {
    // A sound is never worth an error line
  }
}

// One sound of a pack: a clip of the plugin's, a line to speak, or a file of yours
async function sound($, pack, item) {
  if (pack.kind === 'voice') {
    try {
      await $.audio.speak(item, { voice: pack.voice })
    } catch {
      // The voice is not installed here: the default voice says it
      await $.audio.speak(item)
    }
  } else if (pack.kind === 'yours') {
    const { base64 } = await $.fs.read(pack.dir + '/' + item, { as: 'bytes' })
    await $.audio.play({ base64, mime: mimeOf(item) })
  } else {
    await $.audio.play({ asset: 'sounds/' + pack.name + '/' + item })
  }
}

// A clip of the moment, never the one this terminal played last for it
function pick(choices, lastClip, key, now) {
  let i = Math.floor(now / 1000) % choices.length
  if (choices.length > 1 && choices[i] === lastClip[key]) i = (i + 1) % choices.length
  lastClip[key] = choices[i]
  return choices[i]
}

// The file every terminal reads and writes the last play time through
async function playedAtFile($) {
  return (await $.env.get('HOME')) + '/.config/' + $.plugin.name + '/last-played'
}

async function sharedPlayedAt($) {
  try {
    return Number(await $.fs.read(await playedAtFile($))) || 0
  } catch {
    // No file yet, or unreadable: this terminal's own time still holds
    return 0
  }
}

async function sharePlayedAt($, now) {
  try {
    await $.fs.write(await playedAtFile($), String(now))
  } catch {
    // Not shared this time; this terminal still keeps its own gap
  }
}

// Whether a command runs a test, build, lint or type check as one of its steps. Heredoc
// bodies are dropped first: a script that mentions "test" in its text runs nothing
function runsCheck(command) {
  const lines = []
  let end
  for (const line of command.split('\n')) {
    if (end !== undefined) {
      if (line.trim() === end) end = undefined
      continue
    }
    lines.push(line)
    const heredoc = line.match(/<<-?\s*['"]?([A-Za-z_]\w*)['"]?/)
    if (heredoc) end = heredoc[1]
  }
  return lines
    .join('\n')
    .split(/&&|\|\||[;|\n]/)
    .some((step) => {
      const words = step.trim().split(/\s+/).filter((w) => !/^\w+=/.test(w))
      let [first, second, third] = words
      if (first === 'uv' && second === 'run') [first, second, third] = words.slice(2)
      if (/^python3?$/.test(first) && second === '-m') return CHECK_TOOL.test(third ?? '')
      if (/^(python3?|node|bash|sh|zsh|bun|deno|tsx)$/.test(first)) return CHECK_SCRIPT.test(second ?? '')
      if (CHECK_TOOL.test(first ?? '') || CHECK_SCRIPT.test(first ?? '')) return true
      if (first === 'claude' && second === 'plugin') return CHECK_WORD.test(third ?? '')
      if (!CHECK_RUNNER.test(first ?? '')) return false
      const verb = second === 'run' ? third : second
      return CHECK_WORD.test(verb ?? '') || CHECK_TOOL.test(verb ?? '')
    })
}

async function playAll($, name, moment) {
  const pack = packOf(name)
  const items = [...new Set((moment ? [moment] : MOMENTS).flatMap((m) => pack[m] ?? []))]
  for (const item of items) {
    await sound($, pack, item).catch(() => {})
  }
  return items.length
}

// Every pack by name, yours last so a built-in name always means the built-in pack
function packOf(name) {
  if (!name) return undefined
  if (FILE_PACKS[name]) return { kind: 'file', name, ...FILE_PACKS[name] }
  if (VOICE_PACKS[name]) return { kind: 'voice', name, ...VOICE_PACKS[name] }
  if (here.yourPacks[name]) return { kind: 'yours', name, ...here.yourPacks[name] }
  return undefined
}

function allPacks() {
  return [...Object.keys(FILE_PACKS), ...Object.keys(VOICE_PACKS), ...Object.keys(here.yourPacks).filter((n) => !FILE_PACKS[n] && !VOICE_PACKS[n])]
}

function currentPack(settings) {
  if (packOf(here.pack)) return here.pack
  if (packOf(settings.defaultPack)) return settings.defaultPack
  return DEFAULT_PACK
}

// Your own packs: ~/.config/<plugin>/packs/<pack>/pack.json naming the clips beside it
async function loadYourPacks($) {
  const packs = {}
  try {
    const home = await $.env.get('HOME')
    const root = home + '/.config/' + $.plugin.name + '/packs'
    if (!(await $.fs.exists(root))) return packs
    for (const entry of await $.fs.list(root)) {
      if (entry.kind !== 'dir' || !/^[a-z0-9-]+$/.test(entry.name)) continue
      try {
        const dir = root + '/' + entry.name
        const manifest = JSON.parse(await $.fs.read(dir + '/pack.json'))
        const pack = { label: String(manifest.label ?? 'your pack'), dir }
        for (const m of MOMENTS) {
          const files = Array.isArray(manifest[m]) ? manifest[m] : []
          pack[m] = files.filter((f) => typeof f === 'string' && /^[A-Za-z0-9._-]+$/.test(f))
        }
        packs[entry.name] = pack
      } catch {
        // A broken pack is skipped, the others still load
      }
    }
  } catch {
    // No packs of yours
  }
  return packs
}

function mimeOf(file) {
  if (file.endsWith('.wav')) return 'audio/wav'
  if (file.endsWith('.mp3')) return 'audio/mpeg'
  if (file.endsWith('.aiff') || file.endsWith('.aif')) return 'audio/aiff'
  return 'audio/mp4'
}

async function readSettings($) {
  const stored = await $.store.get('settings')
  return { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) }
}

function isQuietHour(hour) {
  return hour >= QUIET_FROM || hour < QUIET_TO
}

// lsappinfo needs no Accessibility permission, unlike System Events
async function isHere($) {
  const front = await $.process.run(['/bin/sh', '-c', 'lsappinfo info -only name "$(lsappinfo front)"'], { timeoutMs: 2000 })
  if (front.exitCode !== 0) return false
  const name = (front.stdout.match(/"LSDisplayName"="([^"]*)"/) ?? [])[1] ?? ''
  return HERE_APPS.includes(name)
}

// The settings a word changes, and the one line that says so
const CHANGES = [
  {
    matches: (a) => a[0] === 'default',
    apply: (s, a) => ({ ...s, defaultPack: a[1] }),
    said: (s, a, was) =>
      (was.defaultPack === a[1] ? 'Default is already ' : 'Default changed: new terminals now start with ') + a[1] + ': ' + packOf(a[1]).label,
  },
  {
    matches: (a) => a.length === 1 && (a[0] === 'on' || a[0] === 'off'),
    apply: (s, a) => ({ ...s, isOn: a[0] === 'on' }),
    said: (s) => (s.isOn ? 'Sound on' : 'Sound off: no clips until /sounds on'),
  },
  {
    matches: (a) => a.length === 1 && (a[0] === 'always' || a[0] === 'away'),
    apply: (s, a) => ({ ...s, mode: a[0] }),
    said: (s) =>
      s.mode === 'away'
        ? 'Away mode: clips play only while no terminal or editor is in front (/sounds always to undo)'
        : 'Always mode: clips play whatever app is in front',
  },
  {
    matches: (a) => a[0] === 'night' && (a[1] === 'on' || a[1] === 'off'),
    apply: (s, a) => ({ ...s, isNightQuiet: a[1] === 'on' }),
    said: (s) => (s.isNightQuiet ? 'Quiet hours on: no clips from 23:00 to 07:00' : 'Quiet hours off: clips play at night too'),
  },
]

// The pack a mistyped name most likely meant: at most two letters off
function closestPack(word) {
  if (!word) return undefined
  let best
  let bestDistance = 3
  for (const name of allPacks()) {
    const d = distance(word, name)
    if (d < bestDistance) [best, bestDistance] = [name, d]
  }
  return best
}

// Letters to change, add or remove to turn a into b; a swap of two letters counts as one
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

// The clips a moment can play now, as { pack, item }: its own rule, else the terminal's pack
function choicesFor(settings, moment) {
  const rule = ruleOf(settings, moment)
  const clipsOf = (name) => (packOf(name)?.[moment] ?? []).map((item) => ({ pack: name, item }))
  if (rule?.off) return []
  if (rule?.random) return allPacks().flatMap(clipsOf)
  if (rule?.packs) {
    const packs = rule.packs.filter((n) => packOf(n))
    if (rule.clip && packs[0]) {
      const item = clipNamed(packs[0], rule.clip)
      return item ? [{ pack: packs[0], item }] : []
    }
    return packs.flatMap(clipsOf)
  }
  return clipsOf(currentPack(settings))
}

function ruleOf(settings, moment) {
  return settings.moments?.[moment] ?? DEFAULT_MOMENTS[moment]
}

// A clip of a pack by its name without the extension, from any of the pack's moments
function clipNamed(name, clip) {
  const pack = packOf(name)
  return [...new Set(MOMENTS.flatMap((m) => pack?.[m] ?? []))].find((item) => item.replace(/\.[^.]+$/, '') === clip)
}

function clipNames(name) {
  const pack = packOf(name)
  return [...new Set(MOMENTS.flatMap((m) => pack?.[m] ?? []))].map((item) => item.replace(/\.[^.]+$/, ''))
}

// What a moment plays, in a few words: "terran", "aoe-turk (5 clips, random)", "off"
function ruleText(settings, moment) {
  const rule = ruleOf(settings, moment)
  const count = choicesFor(settings, moment).length
  const many = count > 1 ? ' (' + count + ' clips, random)' : ''
  if (rule?.off) return 'off'
  if (rule?.random) return 'random pack' + many
  if (rule?.packs && rule.clip) return rule.packs[0] + ', always ' + rule.clip
  if (rule?.packs) return rule.packs.join(' + ') + many
  return currentPack(settings) + (count ? many : ' (no clips: silent)')
}

// /sounds <moment> [off|random|reset|<pack> [<clip>]|<pack> <pack> ...]
async function momentCommand($, settings, moment, words) {
  const word = moment.toLowerCase()
  if (!words.length) {
    const choices = choicesFor(settings, moment)
    const lines = choices.map((c) => '  ' + (new Set(choices.map((x) => x.pack)).size > 1 ? c.pack + ' ' : '') + c.item.replace(/\.[^.]+$/, ''))
    const pack = choices[0]?.pack ?? currentPack(settings)
    return {
      text: [moment + ': ' + MOMENT_INFO[moment] + ' → ' + ruleText(settings, moment), ...lines,
        'Try: /sounds test ' + pack + ' ' + word + ', or /sounds ' + word + ' <pack> to change it'].join('\n'),
    }
  }
  let rule
  if (words[0] === 'reset') rule = undefined
  else if (words[0] === 'off') rule = { off: true }
  else if (words[0] === 'random') rule = { random: true }
  else {
    const missing = words.find((w, i) => !packOf(w) && !(i === 1 && words.length === 2 && packOf(words[0])))
    if (missing) {
      const meant = closestPack(missing)
      return { text: 'No pack named ' + missing + (meant ? '. Did you mean ' + meant + '? /sounds ' + word + ' ' + words.map((w) => (w === missing ? meant : w)).join(' ') : '\n' + listing()) }
    }
    if (words.length === 2 && !packOf(words[1])) {
      const item = clipNamed(words[0], words[1])
      if (!item) {
        const names = clipNames(words[0])
        const meant = names.find((n) => distance(words[1], n) <= 2)
        return {
          text: words[0] + ' has no clip named ' + words[1] + (meant ? '. Did you mean ' + meant + '? /sounds ' + word + ' ' + words[0] + ' ' + meant : '\nIts clips: ' + names.join(', ')),
        }
      }
      rule = { packs: [words[0]], clip: words[1] }
    } else rule = { packs: [...new Set(words)] }
  }
  const moments = { ...(settings.moments ?? {}) }
  if (rule) moments[moment] = rule
  else delete moments[moment]
  const updated = { ...settings, moments }
  await $.store.set('settings', updated)
  if (!rule) return { text: moment + ' back to its usual: ' + ruleText(updated, moment) }
  return { text: moment + ' now plays: ' + ruleText(updated, moment) }
}

function defaultOf(s) {
  return packOf(s.defaultPack) ? s.defaultPack : DEFAULT_PACK
}

function describe(s) {
  const current = currentPack(s)
  const def = defaultOf(s)
  return [
    'This terminal: ' + current,
    'New terminals: ' + def,
    'Sound: ' + (s.isOn ? 'on' : 'off') + ', ' + (s.mode === 'away' ? 'only when no terminal or editor is in front' : 'always') +
      ', quiet 23:00 to 07:00 ' + (s.isNightQuiet ? 'on' : 'off'),
    'Moments (what plays when):',
    ...MOMENTS.map((m) => '  ' + m + ': ' + MOMENT_INFO[m] + ' → ' + ruleText(s, m)),
    commands(),
    listing(),
  ].join('\n')
}

// Every command, one per line, the way the packs are listed
const COMMANDS = [
  ['/sounds <pack>', 'switch this terminal to a pack'],
  ['/sounds default <pack>', 'the pack every new terminal starts with'],
  ['/sounds <moment> <pack>', 'one moment plays another pack, e.g. /sounds pushed aoe-turk'],
  ['/sounds <moment> <pack> <clip>', 'always the same clip, e.g. /sounds pushed aoe-turk allah-allah'],
  ['/sounds <moment> <pack> <pack>', "mix two packs' clips for that moment"],
  ['/sounds <moment> random', 'a random pack each time'],
  ['/sounds <moment> off', 'silence one moment'],
  ['/sounds <moment> reset', 'back to the usual (the terminal pack)'],
  ['/sounds <moment>', 'list the clips that moment can play'],
  ['/sounds test [pack] [moment]', 'play a pack, or one moment of it, once'],
  ['/sounds off', 'mute'],
  ['/sounds on', 'unmute'],
  ['/sounds away', 'play only while no terminal or editor is in front'],
  ['/sounds always', 'play whatever is in front'],
  ['/sounds night on', 'quiet from 23:00 to 07:00'],
  ['/sounds night off', 'play at night too'],
]

function commands() {
  return 'Commands:\n' + COMMANDS.map(([c, d]) => '  ' + c + ': ' + d).join('\n')
}

function listing() {
  return 'Packs:\n' + allPacks().map((n) => '  ' + n + ': ' + packOf(n).label).join('\n')
}

