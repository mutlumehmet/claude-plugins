# Privacy

This policy covers every plugin in this repository: the skills, the Claude Code Arcade
(`arcade` and its ten games), the mods in Claude Code Toolkit (subtask-icons,
context-alarm, answer-buttons, skill-stats, dash-guard, shared-file-guard, fork-lineage), and the `toolkit`
collection that installs them.

## What is collected

Nothing. The plugins have no telemetry, no analytics and no accounts. They send nothing to the
author or to anyone else. One plugin makes one network call of its own: when a terminal opens, the
Arcade reads the version number in its own `plugin.json` on GitHub
(`raw.githubusercontent.com`, this repository), once, to light its ⟳ button when a newer version
is out. It is a plain read of a public file, with no cookie, token or data about you; GitHub sees
the request as it sees any page visit. `/arcade update check off` stops it. The ⟳ button (and
`/arcade update`) then runs Claude Code's own `claude plugin update arcade`, only when you
press it; that fetches this repository from GitHub exactly as `/plugin update` does, and sends
nothing about you.

## What stays on your machine

Some mods keep small amounts of their own state so they can work across sessions, for example a
count of how often a skill ran. That state lives in Claude Code's
plugin store or in your Claude Code transcripts on your own machine, and you can remove it by
uninstalling the plugin. The Arcade keeps no scores: each terminal's games start from zero and end
with it, and it writes nothing into your projects. fork-lineage also keeps the fork reports you approve, and the links
between sessions, as files in `~/.claude-forks/` on your machine; they can contain conversation
content, are never sent anywhere, and are cleaned up as described in its README. Each plugin's README lists exactly what it reads and keeps, under "What
it reads and does".

## What the mods read

The mods react to events inside your Claude Code session: tool names, whether a tool failed, shell
command lines, file names, skill names and, for the games, the words of your message (only to spot
praise). They read these in memory to draw or to guard, and do not store or send the content.
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

Last updated: 8 October 2026.
