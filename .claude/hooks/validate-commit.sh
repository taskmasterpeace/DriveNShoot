#!/bin/bash
# Claude Code PreToolUse hook: Validates git commit commands for CarWorld
# Checks for hardcoded gameplay values and design doc completeness
# Exit 0 = allow, Exit 2 = block

INPUT=$(cat)

# Parse command
if command -v jq >/dev/null 2>&1; then
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
else
    COMMAND=$(echo "$INPUT" | grep -oE '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"command"[[:space:]]*:[[:space:]]*"//;s/"$//')
fi

# Only process git commit commands
if ! echo "$COMMAND" | grep -qE '^git[[:space:]]+commit'; then
    exit 0
fi

STAGED=$(git diff --cached --name-only 2>/dev/null)
if [ -z "$STAGED" ]; then
    exit 0
fi

WARNINGS=""

# Check design documents for required sections
DESIGN_FILES=$(echo "$STAGED" | grep -E '^design/gdd/')
if [ -n "$DESIGN_FILES" ]; then
    while IFS= read -r file; do
        if [[ "$file" == *.md ]] && [ -f "$file" ]; then
            for section in "Overview" "Player Fantasy" "Detailed" "Formulas" "Edge Cases" "Dependencies" "Tuning Knobs" "Acceptance Criteria"; do
                if ! grep -qi "$section" "$file"; then
                    WARNINGS="$WARNINGS\nDESIGN: $file missing required section: $section"
                fi
            done
        fi
    done <<< "$DESIGN_FILES"
fi

# Check for hardcoded gameplay values in entity/system code
CODE_FILES=$(echo "$STAGED" | grep -E '^game/(entities|systems)/' | grep -E '\.gd$')
if [ -n "$CODE_FILES" ]; then
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            if grep -nE '(damage|health|speed|rate|chance|cost|duration|armor)[[:space:]]*[:=][[:space:]]*[0-9]+' "$file" 2>/dev/null; then
                WARNINGS="$WARNINGS\nCODE: $file may contain hardcoded gameplay values. Use .tres resources or Const.gd."
            fi
        fi
    done <<< "$CODE_FILES"
fi

# Check for TODO/FIXME without owner
GD_FILES=$(echo "$STAGED" | grep -E '\.gd$')
if [ -n "$GD_FILES" ]; then
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            if grep -nE '(TODO|FIXME|HACK)[^(]' "$file" 2>/dev/null; then
                WARNINGS="$WARNINGS\nSTYLE: $file has TODO/FIXME without owner tag. Use TODO(name) format."
            fi
        fi
    done <<< "$GD_FILES"
fi

if [ -n "$WARNINGS" ]; then
    echo -e "=== Commit Validation Warnings ===$WARNINGS\n================================" >&2
fi

exit 0
