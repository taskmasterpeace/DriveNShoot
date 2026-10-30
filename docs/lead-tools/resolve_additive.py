"""Resolve diff3 conflicts where both sides only ADDED lines next to the same base (base empty): keep ours then theirs.
COMMANDS.md takes ours (regenerated later). Anything with a non-empty base needs a human: exit 1 and leave it."""
import re, subprocess, sys

PAT = re.compile(r'<<<<<<< [^\n]*\n(.*?)\|\|\|\|\|\|\| [^\n]*\n(.*?)=======\r?\n(.*?)>>>>>>> [^\n]*\n', re.S)
bad = []
for p in sys.argv[1:]:
    if p.endswith('COMMANDS.md'):
        subprocess.run(['git', 'checkout', '--ours', p], check=True)
        continue
    s = open(p, 'rb').read().decode('utf-8')
    def fix(m):
        ours, base, theirs = m.group(1), m.group(2), m.group(3)
        if base.strip():
            bad.append(p)
            return m.group(0)
        return ours + theirs
    s2 = PAT.sub(fix, s)
    open(p, 'wb').write(s2.encode('utf-8'))
sys.exit(1 if bad else 0)
