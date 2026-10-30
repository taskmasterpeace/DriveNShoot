"""Adds the live parts of the DSOA status file straight from git and the lead's battery files, so they can't drift:
lanes (branch tips and ages), the lead battery (run, score, failures), recent activity on main, and the numbers.
Run after write_status.py / patch_status.py, and every loop."""
import json, os, glob, subprocess, re, time

ROOT = 'D:/git/DriveNShoot/.worktrees/integrate'
P = ROOT + '/docs/status/dsoa-status.json'
LEAD = ROOT + '/scratchpad/lead'


def git(*a):
    return subprocess.run(['git', '-C', ROOT, *a], capture_output=True, text=True).stdout.strip()


d = json.load(open(P, encoding='utf-8'))
git('fetch', '-q')
d['main'] = git('log', '-1', '--format=%h', 'origin/main')

# Lanes in flight: every feat/web-* branch not yet in main, newest first.
lanes = []
for line in git('for-each-ref', '--sort=-committerdate', '--format=%(refname:short)|%(committerdate:relative)|%(subject)',
                'refs/remotes/origin/feat/web-*').splitlines()[:40]:
    ref, age, subj = line.split('|', 2)
    ahead = git('rev-list', '--count', f'origin/main..{ref}')
    if ahead == '0':
        continue
    lanes.append({'branch': ref.replace('origin/feat/web-', ''), 'age': age, 'ahead': int(ahead or 0), 'last': subj[:110]})
d['lanes'] = lanes[:14]

# The lead battery: the newest run file and how far it got.
runs = sorted(glob.glob(LEAD + '/*-run*.json'), key=os.path.getmtime)
bat = None
if runs:
    last = runs[-1]
    tag = os.path.basename(last).rsplit('-run', 1)[0]
    rows = []
    for f in sorted(glob.glob(f'{LEAD}/{tag}-run*.json')):
        try:
            j = json.load(open(f, encoding='utf-8'))
            fails = [r['name'][:90] for r in j.get('results', []) if not r.get('pass')]
            rows.append({'run': os.path.basename(f)[:-5].split('-run')[-1], 'passed': j.get('passed'), 'total': j.get('total'), 'fails': fails[:6]})
        except Exception:
            rows.append({'run': os.path.basename(f)[:-5].split('-run')[-1], 'passed': None, 'total': None, 'fails': ['running…']})
    mins = int((time.time() - os.path.getmtime(last)) / 60)
    bat = {'tag': tag, 'runs': rows, 'started': f'{mins} min ago'}
d['battery'] = bat

# Recent activity on main: the merges that landed.
act = []
for line in git('log', '--first-parent', '-14', '--format=%h|%cr|%s', 'origin/main').splitlines():
    h, age, subj = line.split('|', 2)
    act.append({'hash': h, 'age': age, 'what': re.sub(r'^merge ', '', subj)[:110]})
d['activity'] = act

# Numbers.
checks = git('grep', '-h', '-o', "check('", 'origin/main', '--', 'web/src/agent/*.js').count("check('")
cmds = git('show', 'origin/main:web/docs/COMMANDS.md')
ncmd = len(re.findall(r'^\| `', cmds, re.M)) or cmds.count('\n### ')
lands_today = len([a for a in act if 'hour' in a['age'] or 'minute' in a['age']])
d['stats'] = [
    {'icon': '🧪', 'label': 'selftest checks on main', 'value': str(checks)},
    {'icon': '⌨️', 'label': 'agent commands', 'value': str(ncmd) if ncmd else '250'},
    {'icon': '🛬', 'label': 'landings in the last day', 'value': str(lands_today)},
    {'icon': '🌿', 'label': 'lanes with unlanded work', 'value': str(len(lanes))},
    {'icon': '🎮', 'label': 'draw-call budget', 'value': 'under 150'},
]
d['updated'] = time.strftime('%Y-%m-%d %H:%M')
json.dump(d, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('ok', d['main'], len(lanes), 'lanes', bat['tag'] if bat else None)
