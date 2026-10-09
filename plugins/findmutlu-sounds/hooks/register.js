// Sound packs for the moments that need you, and no others.
//
//   moment       when                                         event
//   ordered      you sent a prompt after 5 quiet minutes      prompt.submit
//   needsYou     Claude waits for you: a permission prompt,   classic.Notification,
//                a question, a plan to approve                tool.call (AskUserQuestion, ExitPlanMode)
//   longDone     a turn of 60 s or more answered              turn.complete (main loop)
//   subagent     a subagent finished                          classic.SubagentStop
//   failed       a test, build, lint or type check failed     tool.call (Bash, isError; the step run, not heredoc text)
//   pushed       git push went through                        tool.call (Bash)
//   compacted    the conversation was compacted               classic.PostCompact
//
// Three kinds of pack:
//   file packs   clips in ../sounds/<pack>/ (source and rights holder in each CREDITS.md)
//   voice packs  lines the system voice speaks ($.audio.speak), so no audio file ships (none yet)
//   your packs   folders under ~/.config/<this plugin's name>/packs/<pack>/ with a pack.json,
//                read at session start and played from their bytes
//
// Which pack plays: this terminal's (/sounds <pack>), else your default (/sounds default <pack>,
// kept in the plugin store), else DEFAULT_PACK.

const DEFAULT_PACK = 'aoe'
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

const MOMENTS = ['ordered', 'needsYou', 'longDone', 'subagent', 'failed', 'pushed', 'compacted']

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
    ]
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
    ]
  },
  "aoe-turk": {
    "label": "Age of Empires II: the Turkish villager, male (Microsoft Game Content Usage Rules)",
    "ordered": [
      "tamam.m4a",
      "evet.m4a",
      "dogru.m4a",
      "yapacagim.m4a"
    ],
    "needsYou": [
      "efendim.m4a",
      "emrin.m4a",
      "evet-question.m4a"
    ],
    "longDone": [
      "hazir.m4a"
    ],
    "subagent": [
      "oduncu.m4a",
      "ciftci.m4a",
      "madenci.m4a",
      "balikci.m4a",
      "avci.m4a",
      "seyis.m4a"
    ],
    "failed": [
      "villager-death.m4a",
      "tamirci.m4a"
    ],
    "pushed": [
      "saldir.m4a"
    ],
    "compacted": [
      "usta.m4a"
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
      description: 'Sound packs for the moments that need you: /sounds to list, /sounds <pack>, default <pack>, on, off, test',
      argumentHint: '[<pack>|default <pack>|on|off|always|away|night on|night off|test [pack]]',
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
      const name = args[1] ?? current
      if (!packOf(name)) return { text: 'No pack named ' + name + '\n' + listing() }
      const count = await playAll($, name)
      return { text: 'Played ' + count + ' sounds of ' + name }
    }
    if (packOf(args[0]) && args.length === 1) {
      here.pack = args[0]
      return { text: describe(settings) }
    }
    const updated = { ...settings }
    if (args[0] === 'default' && packOf(args[1])) updated.defaultPack = args[1]
    else if (args[0] === 'on') updated.isOn = true
    else if (args[0] === 'off') updated.isOn = false
    else if (args[0] === 'always' || args[0] === 'away') updated.mode = args[0]
    else if (args[0] === 'night' && (args[1] === 'on' || args[1] === 'off')) updated.isNightQuiet = args[1] === 'on'
    else if (args.length) return { text: 'Unknown: ' + args.join(' ') + '\n' + usage() + '\n' + listing() }
    if (args.length) await $.store.set('settings', updated)
    return { text: describe(updated) }
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
  on('tool.call', { tool: ['Bash', ...ASKING_TOOLS] }, async ($, e, next) => {
    // A question waits for you, so the sound goes before the answer, not after it
    if (ASKING_TOOLS.includes(e.tool)) {
      await cue($, 'needsYou')
      return next(e)
    }
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
    const pack = packOf(currentPack(settings))
    const choices = pack[moment] ?? []
    if (!choices.length) return
    const now = await $.clock.now()
    const last = Math.max(here.playedAt, await sharedPlayedAt($))
    if (now - last < Math.max(GAP_MS, opts.restMs ?? 0)) return
    if (settings.isNightQuiet && isQuietHour(new Date(now).getHours())) return
    if (!opts.isPresent && settings.mode === 'away' && (await isHere($))) return
    here.playedAt = now
    await sharePlayedAt($, now)
    // Not awaited: the sound plays while the session goes on
    sound($, pack, pick(choices, here.lastClip, pack.name + '/' + moment, now)).catch(() => {})
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

async function playAll($, name) {
  const pack = packOf(name)
  const items = [...new Set(MOMENTS.flatMap((m) => pack[m] ?? []))]
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

function describe(s) {
  const current = currentPack(s)
  const def = packOf(s.defaultPack) ? s.defaultPack : DEFAULT_PACK
  return [
    'This terminal: ' + current + (current === def ? '' : ' (new terminals: ' + def + ')'),
    'New terminals: ' + def,
    'Sound: ' + (s.isOn ? 'on' : 'off') + ', ' + (s.mode === 'away' ? 'only when no terminal or editor is in front' : 'always') +
      ', quiet 23:00 to 07:00 ' + (s.isNightQuiet ? 'on' : 'off'),
    listing(),
  ].join('\n')
}

function listing() {
  return 'Packs:\n' + allPacks().map((n) => '  ' + n + ': ' + packOf(n).label).join('\n')
}

function usage() {
  return 'Try /sounds <pack>, default <pack>, on, off, always, away, night on, night off, test [pack]'
}
