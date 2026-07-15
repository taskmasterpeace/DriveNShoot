param(
    [string]$Godot = 'C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe'
)

$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Project = Join-Path $Repo 'game'
$Evidence = Join-Path $Repo 'docs\verification\game_deck_companion'
$Log = Join-Path $Evidence 'regression.log'
$Save = Join-Path $env:APPDATA 'Godot\app_userdata\DRIVN\drivn.save'
$SaveHashEvidence = Join-Path $Evidence 'drivn-save-before.sha256'
$Tests = @(
    'game_companion_data_sim',
    'game_companion_save_sim',
    'game_companion_shelf_sim',
    'game_companion_inspector_sim',
    'game_companion_transition_sim',
    'game_companion_flow_sim',
    'game_companion_boot_sim',
    'game_companion_export_sim',
    'game_registry_sim',
    'game_catalog_sim',
    'game_shell_sim',
    'game_cover_sim',
    'game_input_sim',
    'handheld_catalog_sim',
    'console_catalog_sim',
    'game_bot_fill_sim',
    'game_ledger_sim',
    'game_save_sim',
    'game_lobby_policy_sim',
    'game_license_sim',
    'game_cleanroom_sim',
    'rust_runners_sim',
    'black_grid_sim',
    'game_shooter_controls_sim',
    'game_shooter_kernel_sim'
)

if (-not (Test-Path -LiteralPath $Godot)) {
    throw "Godot executable missing: $Godot"
}
New-Item -ItemType Directory -Path $Evidence -Force | Out-Null
Set-Content -LiteralPath $Log -Value "DRIVN: GAME DECK FULL REGRESSION`r`n" -Encoding UTF8

$HadSave = Test-Path -LiteralPath $Save
$SaveBytes = if ($HadSave) { [System.IO.File]::ReadAllBytes($Save) } else { $null }
if ($HadSave) {
    $Hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        $SaveHashBefore = [BitConverter]::ToString($Hasher.ComputeHash($SaveBytes)).Replace('-', '')
    }
    finally {
        $Hasher.Dispose()
    }
    Set-Content -LiteralPath $SaveHashEvidence -Value $SaveHashBefore -Encoding ASCII -NoNewline
}
$TotalChecks = 0
$Completed = 0

try {
    foreach ($Test in $Tests) {
        $Header = "`r`n===== $Test ====="
        Write-Host $Header
        Add-Content -LiteralPath $Log -Value $Header -Encoding UTF8
        $Scene = "res://proto3d/tests/$Test.tscn"
        $PreviousErrorAction = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $Output = @(& $Godot --headless --path $Project $Scene 2>&1)
            $ExitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $PreviousErrorAction
        }
        $Output | ForEach-Object { Write-Host $_ }
        $Output | Add-Content -LiteralPath $Log -Encoding UTF8
        if ($ExitCode -ne 0) {
            throw "$Test exited $ExitCode"
        }
        $Verdict = $Output | Select-String -Pattern 'RESULTS:\s+(\d+) passed, 0 failed' | Select-Object -Last 1
        if ($null -eq $Verdict) {
            throw "$Test did not print a zero-failure RESULTS verdict"
        }
        $TotalChecks += [int]$Verdict.Matches[0].Groups[1].Value
        $Completed += 1
    }
}
finally {
    if ($HadSave) {
        [System.IO.File]::WriteAllBytes($Save, $SaveBytes)
    }
    elseif (Test-Path -LiteralPath $Save) {
        Remove-Item -LiteralPath $Save -Force
    }
}

$SaveRestored = if ($HadSave) {
    (Test-Path -LiteralPath $Save) -and
        ([Convert]::ToBase64String($SaveBytes) -ceq
            [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($Save)))
}
else {
    -not (Test-Path -LiteralPath $Save)
}
if (-not $SaveRestored) {
    throw 'DRIVN save restoration verification failed'
}
$SaveVerdict = if ($HadSave) { 'DRIVN save restored byte-for-byte' } else { 'DRIVN save absence restored' }
$Summary = "COMPANION_REGRESSION: PASS - $Completed suites, $TotalChecks checks, $SaveVerdict"
Write-Host "`n$Summary"
Add-Content -LiteralPath $Log -Value "`r`n$Summary" -Encoding UTF8
