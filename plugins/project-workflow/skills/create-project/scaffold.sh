#!/bin/bash
# Mechanical part of creating a project. Judgement (which folders, which language, what goes in
# the docs) stays in SKILL.md; values that differ between people come from the config, passed in
# as flags.
#
# Usage:
#   ./scaffold.sh --name house-move \
#                 --folders "contracts utilities moving-day" \
#                 --storage-base "$HOME/Library/CloudStorage/Dropbox/project-assets" \
#                 --assets "contracts utilities" \
#                 --git local
#
# Flags:
#   --name NAME          project name, kebab-case. Required.
#   --path PATH          parent dir. Default $HOME/Projects
#   --folders "a b"      top-level folders to create in the repo. Optional.
#   --storage-base DIR   synced cloud folder that holds every project's assets. Needed with --assets.
#   --assets "a b"       subfolders to create under <storage-base>/<name>/assets.
#                        Omit entirely to skip the assets symlink. "" means symlink, no subfolders.
#   --git MODE           none | local | private | public. Default local. Creates no remote:
#                        the skill hands the user `gh repo create` to run after checking the account.
#   --env                also write a tracked .env.example
#   --mcp                also write a .mcp.json stub
#   --claude-lang L      write .claude/settings.local.json with {"language": "L"}, scoping Claude's
#                        reply language (and, in Claude Code, voice dictation) to this folder only.
#
# Does not write CLAUDE.md or STATUS.md. Those come from templates, filled in by the agent.

set -euo pipefail

NAME="" ; PARENT="$HOME/Projects" ; FOLDERS="" ; STORAGE_BASE="" ; ASSETS="" ; WANT_ASSETS=0
GIT_MODE="local" ; WANT_ENV=0 ; WANT_MCP=0 ; CLAUDE_LANG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --name)         NAME="$2"; shift 2 ;;
    --path)         PARENT="$2"; shift 2 ;;
    --folders)      FOLDERS="$2"; shift 2 ;;
    --storage-base) STORAGE_BASE="$2"; shift 2 ;;
    --assets)       ASSETS="$2"; WANT_ASSETS=1; shift 2 ;;
    --git)          GIT_MODE="$2"; shift 2 ;;
    --env)          WANT_ENV=1; shift ;;
    --mcp)          WANT_MCP=1; shift ;;
    --claude-lang)  CLAUDE_LANG="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

[ -n "$NAME" ] || { echo "--name is required" >&2; exit 2; }
case "$GIT_MODE" in none|local|private|public) ;; *) echo "--git must be none|local|private|public" >&2; exit 2 ;; esac
if [ "$WANT_ASSETS" = 1 ] && [ -z "$STORAGE_BASE" ]; then
  echo "--assets needs --storage-base (set storage.path in the config)" >&2; exit 2
fi

ROOT="$PARENT/$NAME"

# Never merge into or clobber an existing project.
if [ -e "$ROOT" ]; then
  echo "refusing to touch existing path: $ROOT" >&2
  echo "pick another name, or handle it by hand" >&2
  exit 1
fi

mkdir -p "$ROOT"
cd "$ROOT"

# --- repo folders -----------------------------------------------------------
for d in $FOLDERS; do
  mkdir -p "$d"
  touch "$d/.gitkeep"   # so an empty folder survives a clone
done

# --- .gitignore -------------------------------------------------------------
{
  if [ "$WANT_ASSETS" = 1 ]; then
    cat <<'GI'
# assets/ is a symlink into synced cloud storage: machine-specific, never versioned.
# It also holds the sensitive material for this project, which must never
# enter the tracked tree. See CLAUDE.md on folder layout.
assets

GI
  fi
  cat <<'GI'
# Personal project settings, machine-specific
.claude/settings.local.json

# Office lock files
~$*

# macOS
.DS_Store
.AppleDouble
.LSOverride

# Secrets
.env
GI
} > .gitignore

# --- setup-assets.sh --------------------------------------------------------
if [ "$WANT_ASSETS" = 1 ]; then
  # Store the base relative to $HOME when possible, so the script works for anyone with the
  # same cloud folder layout, not just this machine's username.
  case "$STORAGE_BASE" in
    "$HOME"/*) BASE_EXPR="\$HOME/${STORAGE_BASE#"$HOME"/}" ;;
    *)         BASE_EXPR="$STORAGE_BASE" ;;
  esac
  {
    cat <<'SA1'
#!/bin/bash
# Run once after cloning to recreate the assets symlink into synced cloud storage.
# Adjust STORAGE_BASE if your cloud folder lives elsewhere.

SA1
    echo "STORAGE_BASE=\"$BASE_EXPR/$NAME\""
    cat <<'SA2'
target="$STORAGE_BASE/assets"

if [ ! -d "$target" ]; then
  echo "Creating assets folder in cloud storage..."
fi
mkdir -p "$target"

# Subfolders mirror the repo folder names, see CLAUDE.md on folder layout
SA2
    for a in $ASSETS; do
      echo "mkdir -p \"\$target\"/$a"
    done
    cat <<'SA3'

rm -f assets
ln -sfn "$target" assets
echo "assets -> $target"
SA3
  } > setup-assets.sh
  chmod +x setup-assets.sh
  ./setup-assets.sh
fi

# --- optional extras --------------------------------------------------------
if [ "$WANT_ENV" = 1 ]; then
  printf '# Copy to .env and fill in. .env itself is gitignored.\n' > .env.example
fi

if [ -n "$CLAUDE_LANG" ]; then
  mkdir -p .claude
  printf '{\n  "language": "%s"\n}\n' "$CLAUDE_LANG" > .claude/settings.local.json
  # Fail loudly rather than leaving a file that silently disables all settings in it
  if command -v jq >/dev/null 2>&1; then
    jq -e '.language' .claude/settings.local.json >/dev/null || { echo "settings.local.json is malformed" >&2; exit 1; }
  fi
  echo "language: $CLAUDE_LANG written to .claude/settings.local.json (this folder only)"
fi

if [ "$WANT_MCP" = 1 ]; then
  cat > .mcp.json <<'MCP'
{
  "mcpServers": {}
}
MCP
fi

# --- git --------------------------------------------------------------------
if [ "$GIT_MODE" != "none" ]; then
  git init -q -b main
  git add -A
  echo
  echo "staged:"
  git status --short
  if [ "$WANT_ASSETS" = 1 ]; then
    git check-ignore -q assets && echo "assets is ignored" || { echo "assets is NOT ignored, stopping" >&2; exit 1; }
  fi
  echo
  echo "Not committed. Write CLAUDE.md and STATUS.md first, then commit."
fi

echo
echo "Created $ROOT"
ls -la "$ROOT"
