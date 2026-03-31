<#
Autonomous Loop Hook for CarWorld
Based on the "Ralph Wiggum" pattern

This script intercepts Claude's exit and forces continuation until:
1. Completion criteria in TASK.md are met
2. Max iterations reached
3. Critical error occurs

Usage: Set as Stop hook in settings.json
#>

param()

# Read JSON input from stdin
$input = $input | Out-String
try {
    $hookInput = $input | ConvertFrom-Json
} catch {
    # If we can't parse input, allow exit
    exit 0
}

# CRITICAL: Prevent infinite loops
$stopHookActive = $hookInput.stop_hook_active
if ($stopHookActive -eq $true) {
    # Already in a continuation - allow stopping this time
    exit 0
}

# Config paths
$projectDir = $hookInput.cwd
if (-not $projectDir) { $projectDir = "C:\git\carworld" }
$taskFile = Join-Path $projectDir ".claude\TASK.md"
$stateFile = Join-Path $projectDir ".claude\loop-state.json"

# Check if autonomous mode is enabled
if (-not (Test-Path $taskFile)) {
    # No task file = normal operation, allow exit
    exit 0
}

# Read task file for completion criteria
$taskContent = Get-Content $taskFile -Raw -ErrorAction SilentlyContinue

# Check for PAUSE marker (allows user to pause the loop)
if ($taskContent -match "STATUS:\s*PAUSED") {
    exit 0
}

# Check for COMPLETE marker
if ($taskContent -match "STATUS:\s*COMPLETE") {
    # Clean up and exit
    Remove-Item $taskFile -Force -ErrorAction SilentlyContinue
    Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
    exit 0
}

# Load/create state
if (Test-Path $stateFile) {
    $state = Get-Content $stateFile | ConvertFrom-Json
} else {
    $state = @{
        iteration = 0
        max_iterations = 10
        started = (Get-Date).ToString("o")
    }
}

# Extract max iterations from task file if specified
if ($taskContent -match "MAX_ITERATIONS:\s*(\d+)") {
    $state.max_iterations = [int]$matches[1]
}

# Increment iteration
$state.iteration++

# Check iteration limit
if ($state.iteration -ge $state.max_iterations) {
    # Max iterations reached - stop and notify
    $output = @{
        decision = "approve"
        reason = "Max iterations ($($state.max_iterations)) reached. Review progress in TASK.md."
    }
    # Clean up state file
    Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
    $output | ConvertTo-Json -Compress
    exit 0
}

# Save state
$state | ConvertTo-Json | Set-Content $stateFile

# Block exit and force continuation
$reason = @"
AUTONOMOUS MODE - Iteration $($state.iteration)/$($state.max_iterations)

Continue working on the task defined in .claude/TASK.md

When complete, update TASK.md with STATUS: COMPLETE
To pause, update TASK.md with STATUS: PAUSED

Current task file location: $taskFile
"@

$output = @{
    decision = "block"
    reason = $reason
}

$output | ConvertTo-Json -Compress
exit 0
