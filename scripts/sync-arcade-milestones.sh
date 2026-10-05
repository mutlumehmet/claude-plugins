#!/bin/bash
# The Arcade games share one moment detector, shared/arcade/milestones.ts. Each game keeps its
# own copy in hooks/milestones.ts, so it installs on its own with no dependency.
#
#   scripts/sync-arcade-milestones.sh          copy the shared file into every game
#   scripts/sync-arcade-milestones.sh --check  fail if any copy differs (CI runs this)

set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE=shared/arcade/milestones.ts
GAMES=(dragon-lair jackpot outlaw tama tetris octo-invader)

status=0
for game in "${GAMES[@]}"; do
  target="plugins/$game/hooks/milestones.ts"
  if [ "${1:-}" = "--check" ]; then
    if ! cmp -s "$SOURCE" "$target"; then
      echo "sync-arcade-milestones: $target differs from $SOURCE; run scripts/sync-arcade-milestones.sh" >&2
      status=1
    fi
  else
    cp "$SOURCE" "$target"
    echo "copied to $target"
  fi
done
exit $status
