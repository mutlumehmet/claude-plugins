# Privacy

This policy covers every plugin in this repository: the skills, the Claude Code Arcade
(`arcade`: dragon, jackpot, outlaw, tama, tetris, octopus and duck), the mods in Claude Code Toolkit (subtask-icons,
context-alarm, answer-buttons, skill-stats, dash-guard, shared-file-guard, fork-lineage), and the `toolkit`
collection that installs them.

## What is collected

Nothing. The plugins have no telemetry, no analytics and no accounts. They make no network calls
of their own and send nothing to the author or to anyone else.

## What stays on your machine

Some mods keep small amounts of their own state so they can work across sessions, for example a
game's score, a pet's hunger, or counts of how often a skill ran. That state lives in Claude Code's
plugin store or in your Claude Code transcripts on your own machine, and you can remove it by
uninstalling the plugin. The Arcade keeps it per project, under a short hash of the repository's
path; it writes nothing into your projects, `/arcade reset` clears a project's games, and a project
not opened for 90 days is forgotten. fork-lineage also keeps the fork reports you approve, and the links
between sessions, as files in `~/.claude-forks/` on your machine; they can contain conversation
content, are never sent anywhere, and are cleaned up as described in its README. Each plugin's README lists exactly what it reads and keeps, under "What
it reads and does".

## What the mods read

The mods react to events inside your Claude Code session: tool names, whether a tool failed, shell
command lines, file names, skill names and, for the games, the words of your message (only to spot
praise). They read these in memory to draw or to guard, and do not store or send the content.
The Arcade also checks for a `.git` entry in the folder Claude Code runs in and its parents, to tell
which repository a session belongs to.
fork-lineage reads your local transcripts to find which session a fork came from, and, only when
you press its button, asks the session's own model (through Claude Code, on your account) for a
report of the fork.

## Third parties

None. The plugins share nothing with third parties. Claude Code itself, and the model provider you
use with it, have their own privacy policies.

## Children

The plugins are developer tools and are not directed at children under 18.

## Contact

Questions or concerns: open an issue in this repository on GitHub (the Issues tab).

Last updated: 5 October 2026.
