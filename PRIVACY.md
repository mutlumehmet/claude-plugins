# Privacy

This policy covers every plugin in this repository: the skills, the Claude Code Arcade
(`arcade`: dragon, jackpot, outlaw, tama, tetris and octopus), the mods in Claude Code Toolkit (subtask-icons,
context-alarm, answer-buttons, skill-stats, dash-guard, shared-file-guard), and the `toolkit`
collection that installs them.

## What is collected

Nothing. The plugins have no telemetry, no analytics and no accounts. They make no network calls
of their own and send nothing to the author or to anyone else.

## What stays on your machine

Some mods keep small amounts of their own state so they can work across sessions, for example a
game's score, a pet's hunger, or counts of how often a skill ran. That state lives in Claude Code's
plugin store or in your Claude Code transcripts on your own machine, and you can remove it by
uninstalling the plugin. Each plugin's README lists exactly what it reads and keeps, under "What
it reads and does".

## What the mods read

The mods react to events inside your Claude Code session: tool names, whether a tool failed, shell
command lines, file names, skill names and, for the games, the words of your message (only to spot
praise). They read these in memory to draw or to guard, and do not store or send the content.

## Third parties

None. The plugins share nothing with third parties. Claude Code itself, and the model provider you
use with it, have their own privacy policies.

## Children

The plugins are developer tools and are not directed at children under 18.

## Contact

Questions or concerns: open an issue in this repository on GitHub (the Issues tab).

Last updated: 5 October 2026.
