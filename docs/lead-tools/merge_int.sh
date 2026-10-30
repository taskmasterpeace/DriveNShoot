#!/bin/bash
# Merge each pushed lane into the play copy; stop at the first conflict a script can't resolve.
cd /d/git/DriveNShoot/.worktrees/integrate || exit 1

for b in "$@"; do
  if git merge-base --is-ancestor origin/feat/web-$b HEAD; then echo "SKIP $b (already in)"; continue; fi
  if git merge --no-ff -q -m "merge feat/web-$b" origin/feat/web-$b >/dev/null 2>&1; then
    echo "OK   $b"; continue
  fi
  U=$(git diff --name-only --diff-filter=U)
  for f in $U; do git checkout -q --conflict=diff3 "$f"; done
  python /d/git/DriveNShoot/.worktrees/integrate/scratchpad/lead/resolve_additive.py $U
  if [ $? -ne 0 ]; then echo "STOP $b: needs a hand on: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"; exit 2; fi
  git add -A $U && git commit -q --no-edit && echo "OK   $b (resolved: $(echo $U | tr '\n' ' '))"
done
