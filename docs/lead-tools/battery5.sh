#!/usr/bin/env bash
# battery5.sh <tag> (battery4 + waits for the bridge to drop the dead tab before the agent starts) (battery3 + waits out the killed tab's stale 'connected') (battery2 + a relaunch retry when the browser never connects, PID record; RUNS="3" runs just one):  two full selftests, each on a FRESHLY LAUNCHED Chrome (a reload once hung the page for good).
# Kills only the lead's own :3410 Chrome + agent (exact PIDs found by their :3410 command line); vite stays up.
W=/d/git/DriveNShoot/.worktrees/integrate/web
OUT=/d/git/DriveNShoot/.worktrees/integrate/scratchpad/lead
export DL_URL=http://localhost:3410
export DL_BOOT_S=150 # a cold page took 39 s to reach the bridge after towns-roads (the agent waits 30 s by default)
for i in ${RUNS:-1 2}; do
  powershell -NoProfile -File "$(cygpath -w $OUT/relaunch.ps1)"
  # The bridge goes on reporting the killed tab as connected (up to a minute): an agent started in that window finds
  # "a game tab is already connected" and launches nothing. Wait until the bridge has let the dead tab go.
  for t in $(seq 1 60); do (cd $W && node tools/dl.mjs status 2>/dev/null) | grep -q '"connected": false' && break; sleep 3; done
  (cd $W && nohup node tools/agent.mjs --port 3410 > $OUT/$1-agent$i.log 2>&1 &)
  sleep 20
  ok=0
  for try in 1 2 3; do
    for t in $(seq 1 90); do (cd $W && node tools/dl.mjs status 2>/dev/null) | grep -q '"connected": true' && { ok=1; break; }; sleep 4; done
    [ $ok = 1 ] && break
    echo "run$i: browser never connected (try $try), relaunching"
    powershell -NoProfile -File "$(cygpath -w $OUT/relaunch.ps1)"
    (cd $W && nohup node tools/agent.mjs --port 3410 > $OUT/$1-agent$i.log 2>&1 &)
  done
  # The lead's own PIDs, recorded at launch (kill only these): vite, chrome, agent on :3410.
  powershell -NoProfile -Command "\$v=(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { \$_.CommandLine -match 'vite.js --port 3410' }).ProcessId -join ','; \$c=(Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | ? { \$_.CommandLine -match 'localhost:3410' -and \$_.CommandLine -notmatch '--type=' }).ProcessId -join ','; \$a=(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { \$_.CommandLine -match 'agent.mjs --port 3410' }).ProcessId -join ','; \"vite=\$v chrome=\$c agent=\$a at \$(Get-Date -Format s) ($1 run$i)\" | Out-File -Encoding utf8 '$(cygpath -w $OUT/harness-pids.txt)'"
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
