#!/usr/bin/env bash

set -euo pipefail

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "If the change is UI-related, re-run screenshot-based Figma parity checks before finalizing."
  },
  "systemMessage": "Figma parity reminder: re-check UI changes before finalizing."
}
EOF
