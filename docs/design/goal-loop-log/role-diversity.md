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

