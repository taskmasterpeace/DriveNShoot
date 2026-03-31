<#
.SYNOPSIS
    Start an autonomous development task for CarWorld

.DESCRIPTION
    Creates a TASK.md file from a template and initiates the autonomous loop.
    Claude will continue working until the task is complete or max iterations reached.

.PARAMETER TaskName
    Name of the task to create

.PARAMETER MaxIterations
    Maximum number of iterations before stopping (default: 20)

.EXAMPLE
    .\start-task.ps1 -TaskName "Add machine gun weapon"
    .\start-task.ps1 -TaskName "Fix vehicle physics" -MaxIterations 10
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$TaskName,

    [int]$MaxIterations = 20
)

$projectDir = Split-Path -Parent $PSScriptRoot
$taskFile = Join-Path $PSScriptRoot "TASK.md"
$templateFile = Join-Path $PSScriptRoot "TASK.md.template"
$stateFile = Join-Path $PSScriptRoot "loop-state.json"

# Check if task already exists
if (Test-Path $taskFile) {
    Write-Host "ERROR: A task is already in progress!" -ForegroundColor Red
    Write-Host "Current task:" -ForegroundColor Yellow
    Get-Content $taskFile | Select-Object -First 10
    Write-Host ""
    Write-Host "To stop current task: .\stop-task.ps1" -ForegroundColor Cyan
    exit 1
}

# Copy template
if (Test-Path $templateFile) {
    $content = Get-Content $templateFile -Raw
    $content = $content -replace "\[TASK NAME HERE\]", $TaskName
    $content = $content -replace "MAX_ITERATIONS: \d+", "MAX_ITERATIONS: $MaxIterations"
    $content | Set-Content $taskFile
} else {
    # Create minimal task file
    @"
# Autonomous Task Definition

## Task: $TaskName

**STATUS: IN_PROGRESS**

**MAX_ITERATIONS: $MaxIterations**

---

## Objective

Complete the task: $TaskName

## Success Criteria

- [ ] Task is fully implemented
- [ ] Code compiles without errors
- [ ] Changes committed to git

## Progress Log

*Starting task...*
"@ | Set-Content $taskFile
}

# Clean up any old state
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " AUTONOMOUS TASK STARTED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Task: $TaskName" -ForegroundColor Cyan
Write-Host "Max Iterations: $MaxIterations" -ForegroundColor Cyan
Write-Host "Task File: $taskFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Open TASK.md and fill in the details" -ForegroundColor White
Write-Host "2. Run 'claude' or 'claude -c' to start" -ForegroundColor White
Write-Host "3. Claude will loop until STATUS: COMPLETE" -ForegroundColor White
Write-Host ""
Write-Host "To stop: .\stop-task.ps1 or set STATUS: PAUSED" -ForegroundColor Magenta
Write-Host ""
