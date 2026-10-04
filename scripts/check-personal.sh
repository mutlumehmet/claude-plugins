#!/bin/bash
# Refuses a commit that adds anything from your personal forbidden list.
#
# The list lives outside the repo, one extended regex per line (# for comments):
#   ${AGENT_SKILLS_FORBIDDEN:-~/.config/agent-skills/forbidden.txt}
# Put your email addresses, usernames, home path, client and project names there.
#
# A few files legitimately credit the author (LICENSE, the READMEs, the plugin manifest, FUNDING.yml). In those
# files only, patterns listed in the author list are allowed; everything else is still checked:
#   ${AGENT_SKILLS_AUTHOR:-~/.config/agent-skills/author.txt}
#
# Install as a pre-commit hook:
#   ln -sf ../../scripts/check-personal.sh .git/hooks/pre-commit
#
# Run by hand against the whole tree:
#   scripts/check-personal.sh --all

set -uo pipefail

LIST="${AGENT_SKILLS_FORBIDDEN:-$HOME/.config/agent-skills/forbidden.txt}"
AUTHOR_LIST="${AGENT_SKILLS_AUTHOR:-$HOME/.config/agent-skills/author.txt}"
# Files allowed to name the author
CREDIT_FILES='^(LICENSE|README\.md|skills/[^/]+/README\.md|plugins/[^/]+/README\.md|plugins/[^/]+/skills/[^/]+/README\.md|plugins/[^/]+/\.claude-plugin/plugin\.json|\.claude-plugin/marketplace\.json|\.github/FUNDING\.yml)$'

if [ ! -f "$LIST" ]; then
  echo "check-personal: no forbidden list at $LIST, skipping (create one to enable the check)" >&2
  exit 0
fi

patterns=$(grep -vE '^\s*(#|$)' "$LIST")
[ -n "$patterns" ] || exit 0
author=""
[ -f "$AUTHOR_LIST" ] && author=$(grep -vE '^\s*(#|$)' "$AUTHOR_LIST")
# Forbidden patterns minus the author ones, for credit files
if [ -n "$author" ]; then
  credit_patterns=$(printf '%s\n' "$patterns" | grep -vxF -f <(printf '%s\n' "$author") || true)
else
  credit_patterns="$patterns"
fi

if [ "${1:-}" = "--all" ]; then
  files=$(git ls-files)
else
  files=$(git diff --cached --name-only --diff-filter=ACMR)
fi

found=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  use="$patterns"
  [[ "$f" =~ $CREDIT_FILES ]] && use="$credit_patterns"
  [ -n "$use" ] || continue
  if [ "${1:-}" = "--all" ]; then
    # Skip binary files (images, PDFs): their bytes can match a pattern by chance
    grep -qI . "$f" 2>/dev/null || continue
    content=$(cat "$f" 2>/dev/null)
  else
    # Only lines this commit adds
    content=$(git diff --cached -U0 -- "$f" | grep '^+' | grep -v '^+++')
  fi
  hits=$(printf '%s\n' "$content" | grep -IniE -f <(printf '%s\n' "$use") || true)
  if [ -n "$hits" ]; then
    echo "check-personal: personal content in $f:" >&2
    printf '%s\n' "$hits" | head -5 | sed 's/^/    /' >&2
    found=1
  fi
done <<< "$files"

if [ "$found" = 1 ]; then
  echo "check-personal: commit refused. Move the value to a config file or use a neutral example." >&2
  exit 1
fi
exit 0
