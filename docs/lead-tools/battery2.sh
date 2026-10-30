#!/usr/bin/env bash
# battery2.sh <tag>: two full selftests, each on a FRESHLY LAUNCHED Chrome (a reload once hung the page for good).
# Kills only the lead's own :3410 Chrome + agent (exact PIDs found by their :3410 command line); vite stays up.
W=/d/git/DriveNShoot/.worktrees/integrate/web
OUT=/d/git/DriveNShoot/.worktrees/integrate/scratchpad/lead
export DL_URL=http://localhost:3410
for i in 1 2; do
  powershell -NoProfile -File "$(cygpath -w $OUT/relaunch.ps1)"
  (cd $W && nohup node tools/agent.mjs --port 3410 > $OUT/$1-agent$i.log 2>&1 &)
  for t in $(seq 1 90); do (cd $W && node tools/dl.mjs status 2>/dev/null) | grep -q '"connected": true' && break; sleep 4; done
  (cd $W && node tools/dl.mjs - < /tmp/crumbs.json >/dev/null 2>&1)
  echo "run$i start $(date +%H:%M)"
  (cd $W && echo '{"cmd":"selftest","args":{"budget":5400},"timeoutMs":5600000}' | timeout 5700 node tools/dl.mjs - > $OUT/$1-run$i.json 2>&1)
  python -c "
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'));r=d.get('result',d)
print('run$i',r.get('passed'),'/',r.get('total'),d.get('error',''))
for x in (r.get('checks') or r.get('results') or []):
  if not x.get('ok',x.get('pass',True)): print('  FAIL',x.get('name')[:100],'|',str(x.get('detail') or x.get('msg'))[:220])" "$(cygpath -w $OUT/$1-run$i.json)"
done
