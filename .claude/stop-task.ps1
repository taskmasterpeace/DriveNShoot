<#
.SYNOPSIS
    Stop the current autonomous task

.DESCRIPTION
    Removes the TASK.md file and cleans up loop state.
    Use this to cancel an autonomous loop.

.EXAMPLE
    .\stop-task.ps1
#>

$taskFile = Join-Path $PSScriptRoot "TASK.md"
$stateFile = Join-Path $PSScriptRoot "loop-state.json"

if (-not (Test-Path $taskFile)) {
    Write-Host "No active task found." -ForegroundColor Yellow
    exit 0
}

# Show current task before removing
Write-Host ""
Write-Host "Stopping task:" -ForegroundColor Yellow
Get-Content $taskFile | Select-Object -First 5
Write-Host ""

# Get iteration count if available
if (Test-Path $stateFile) {
    $state = Get-Content $stateFile | ConvertFrom-Json
    Write-Host "Completed iterations: $($state.iteration)" -ForegroundColor Cyan
}

# Remove files
Remove-Item $taskFile -Force
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Task stopped and cleaned up." -ForegroundColor Green
Write-Host ""
