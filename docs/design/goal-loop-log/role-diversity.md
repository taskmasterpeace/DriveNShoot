# Goal loop log: role-diversity

Every peopled settlement has a varied workforce: Shannon diversity of its jobs >= 1.6, no job over 25% of it, and its nearest same-kind neighbour's jobs at least 30% different (Jaccard distance).

- metric: `node tools/role-diversity.mjs` (up to 1)
- may change: `src/data/occupations.js`
- checks: `node --check src/data/occupations.js`, `node tools/occ-check.mjs`

## Run 2026-10-29 01:46 (start 0.9634, target 1, up to 16 rounds, agent `claude -p --model sonnet --permission-mode acceptEdits --allowedTools Read Edit Grep`)

| round | before | after | verdict | change | checks |
|---|---|---|---|---|---|
| 1 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 2 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 3 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 4 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 5 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 6 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 7 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 8 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 9 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 10 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 11 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 12 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 13 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 14 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 15 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |
| 16 | 0.9634 | 0.9634 | no change | Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access | - |

**Result:** 0.9634 -> 0.9634 in 16 rounds; target not met.

```
settlements 246 | H>=1.6 246 | cap<=25% 243 | neighbours>=0.3 222 | all three 220 | min H 1.733 | mean H 2.8 | worst share 0.308
0.9634
```


## Stepwise run 2026-10-29 01:52 (start 0.9634, target 1; the editor is whoever runs --begin/--judge)

| round | before | after | verdict | change | checks |
|---|---|---|---|---|---|
| 1 | 0.9634 | 0.9661 | KEPT | Cap scout at 20% of a workforce so raider-held holdouts and industrial sites no longer let one job pass 25% | green; green |
| 2 | 0.9661 | 0.9702 | KEPT | Cap scavenger at 22% so small dead suburbs do not hand a third of their people to one salvage job | green; green |
| 3 | 0.9702 | 0.9702 | REJECTED (no gain) | Add a tow driver row (gas station, truck stop or auto shop on a road) so interstate exits and trade posts do not all hire alike | green; green |
| 4 | 0.9702 | 0.9783 | KEPT | Raise MIX.jitter from 0.35 to 0.5 so same-kind neighbours hire less alike | green; green |
| 5 | 0.9783 | 0.9797 | KEPT | Cap sentry at 22% so a small military post cannot put over a quarter of its people on the gate | green; green |
| 6 | 0.9797 | 0.977 | REJECTED (no gain) | Raise MIX.jitter from 0.5 to 0.6 (top of its safe range) so the long tail of one-person jobs differs more between same-kind neighbours | green; green |
| 7 | 0.9797 | 0.9797 | REJECTED (no gain) | Add a harvest crew row that only farms with a workforce of 45 or more can field, so big and small farm neighbours stop hiring alike | green; green |
| 8 | 0.9797 | 0.9797 | REJECTED (no gain) | Add an open-field harvest crew row (needs a farm, only workforces of 45+) so big and small farm neighbours stop hiring alike | green; green |
| 9 | 0.9797 | 0.9824 | KEPT | Add an open-field harvest crew row (needs a farm, only workforces of 45+) so big and small farm neighbours stop hiring alike | green; green |
| 10 | 0.9824 | 0.9824 | REJECTED (no gain) | Add a tow driver row that only road stops with a workforce of 10+ keep, so the bigger interstate exits stop matching the small ones | green; green |
| 11 | 0.9824 | 0.9851 | KEPT | Storekeepers need a workforce of 10 or more (a tiny road stop sells off the pump and the diner counter), so small and larger interstate exits stop hiring alike | green; green |
| 12 | 0.9851 | 0.9864 | KEPT | Porters need a workforce of 10 or more (a tiny road stop has no one to carry for), so the smallest interstate exit differs from its bigger neighbour | green; green |
| 13 | 0.9864 | 0.9864 | REJECTED (no gain) | Add a pueblo silversmith that only the better-off pueblos keep, so Taos and Acoma stop hiring alike | green; green |
| 14 | 0.9864 | 0.9892 | KEPT | A tannery needs a workforce of 45 or more to run, so the smaller farm and ranch places go without a tanner and stop matching their neighbours | green; green |
| 15 | 0.9892 | 0.9905 | KEPT | Trapping is a poor man's living: give the trapper a wealth band of 0 to 0.4 so the better-off forest places go without one and stop matching their neighbours | green; green |
