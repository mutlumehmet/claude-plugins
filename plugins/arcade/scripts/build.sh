#!/bin/bash
# Builds hooks/arcade.jsx, the one module the engine loads, from the sources in src/.
#
# The engine follows `$` only into functions declared in the module's own file, never across an
# import, so the games cannot stay separate files at run time. They stay separate in src/ (one
# file per game, src/arcade.tsx chaining them) and esbuild joins them into one file here.
#
#   scripts/build.sh          rebuild hooks/arcade.jsx
#   scripts/build.sh --check  fail if hooks/arcade.jsx is not what src/ builds to (CI runs this)

set -euo pipefail
cd "$(dirname "$0")/.."

ESBUILD=esbuild@0.25.10
out=$(mktemp)
trap 'rm -f "$out"' EXIT

# JSX is kept as JSX (the engine compiles a .jsx module against its global h): the Anthropic
# Directory reads a Client's module path only from <Client module="..."/>, not from h(Client, ...).
npx -y "$ESBUILD" src/arcade.tsx --bundle --format=esm --external:claude-code \
  --jsx=preserve --target=es2022 --log-level=warning --outfile="$out"

# The engine wants each function `$` reaches as a top-level const or function declaration, and
# `register` exported where it is declared; esbuild writes top-level `var` and one export list.
# lastStats (octo-invader) is the one top-level value that is reassigned.
{
  echo "// Built by scripts/build.sh from src/ with $ESBUILD. Do not edit: edit src/ and rebuild."
  sed -E \
    -e 's/^var lastStats = /let lastStats = /' \
    -e 's/^var register = /export const register = /' \
    -e 's/^var /const /' \
    -e '/^export \{$/,/^\};$/d' \
    "$out"
} > "$out.final"
mv "$out.final" "$out"

# Bug Command's sky is a Client: a surface module of its own, loaded by the band beside
# arcade.jsx. It reaches no `$`, so esbuild's output needs nothing more than the header.
sky=$(mktemp)
trap 'rm -f "$out" "$sky"' EXIT
npx -y "$ESBUILD" src/clients/bug-sky.tsx --bundle --format=esm --external:claude-code \
  --jsx=transform --jsx-factory=h --target=es2022 --log-level=warning --outfile="$sky"
{
  echo "// Built by scripts/build.sh from src/clients/ with $ESBUILD. Do not edit: edit src/ and rebuild."
  cat "$sky"
} > "$sky.final"
mv "$sky.final" "$sky"

if [ "${1:-}" = "--check" ]; then
  if ! cmp -s "$out" hooks/arcade.jsx || ! cmp -s "$sky" hooks/bug-sky.js; then
    echo "build: hooks/ is out of date with src/; run plugins/arcade/scripts/build.sh" >&2
    exit 1
  fi
else
  cp "$out" hooks/arcade.jsx
  cp "$sky" hooks/bug-sky.js
  echo "built hooks/arcade.jsx ($(wc -l < hooks/arcade.jsx | tr -d ' ') lines) and hooks/bug-sky.js ($(wc -l < hooks/bug-sky.js | tr -d ' ') lines)"
fi
