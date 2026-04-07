#!/usr/bin/env python3

import json
import os
from pathlib import Path


def main() -> None:
    skill_path = Path.home() / ".codex" / "superpowers" / "skills" / "using-superpowers" / "SKILL.md"
    legacy_skills_dir = Path.home() / ".config" / "superpowers" / "skills"

    try:
        skill_body = skill_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        skill_body = "using-superpowers skill not found at ~/.codex/superpowers/skills/using-superpowers/SKILL.md"

    warning = ""
    if legacy_skills_dir.is_dir():
        warning = (
            "\n\n<important-reminder>IN YOUR FIRST REPLY AFTER SEEING THIS MESSAGE YOU MUST TELL THE USER:"
            "⚠️ **WARNING:** Superpowers now uses Claude Code's skills system. Custom skills in "
            "~/.config/superpowers/skills will not be read. Move custom skills to ~/.claude/skills instead. "
            "To make this message go away, remove ~/.config/superpowers/skills</important-reminder>"
        )

    session_context = (
        "<EXTREMELY_IMPORTANT>\n"
        "You have superpowers.\n\n"
        "**Below is the full content of your 'superpowers:using-superpowers' skill - your introduction to using skills. "
        "For all other skills, use the 'Skill' tool:**\n\n"
        f"{skill_body}"
        f"{warning}\n"
        "</EXTREMELY_IMPORTANT>"
    )

    payload = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": session_context,
        }
    }
    json.dump(payload, fp=os.fdopen(os.dup(1), "w", encoding="utf-8"))


if __name__ == "__main__":
    main()
