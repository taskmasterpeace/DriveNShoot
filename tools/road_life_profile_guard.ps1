#requires -Version 7.0
<# Disposable process regression for road_life_sim's profile refusal. No normal profile access. #>
[CmdletBinding()]
param(
    [string]$EnginePath = 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This profile regression requires Windows and installed Godot.' }
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$game = Join-Path $root 'game'
$id = [guid]::NewGuid().ToString('N')
$negative = Join-Path $root ".superpowers/profile-guard-negative-$id"
$positive = Join-Path $root "build/profile-guard-positive-$id"
$owned = [Collections.Generic.List[Diagnostics.Process]]::new()
$runs = [Collections.Generic.List[object]]::new()
$checks = [Collections.Generic.List[object]]::new()
$failure = ''

function Assert-WorkspacePath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Fixture path escapes checkout: $full"
    }
    # Resolve lexical paths and reject existing links/junctions before creating anything.
    $ancestor = $full
    while ($ancestor) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Fixture ancestor is a reparse point: $ancestor" }
        }
        $ancestor = Split-Path -Parent $ancestor
    }
}
function Check([string]$Name, [bool]$Passed) {
    $checks.Add([ordered]@{ name = $Name; passed = $Passed })
    Write-Host "PROFILE GUARD: $(if ($Passed) { 'PASS' } else { 'FAIL' }) - $Name"
    if (-not $Passed) { throw "Acceptance failed: $Name" }
}
function Run-Engine([string]$Label, [string]$Profile, [string[]]$Arguments) {
    Assert-WorkspacePath $Profile
    $roaming = Join-Path $Profile 'Roaming'
    $local = Join-Path $Profile 'Local'
    New-Item -ItemType Directory -Path $roaming, $local -Force | Out-Null
    $stdout = Join-Path $positive "$Label.stdout.log"
    $stderr = Join-Path $positive "$Label.stderr.log"
    $quoted = foreach ($argument in $Arguments) {
        if ($argument.Contains('"') -or $argument.EndsWith('\')) { throw 'Unsupported process argument.' }
        '"' + $argument + '"'
    }
    $record = [ordered]@{
        label = $Label; engine = $EnginePath; arguments = $Arguments
        APPDATA = $roaming; LOCALAPPDATA = $local
        stdout = $stdout; stderr = $stderr; pid = $null; exit_code = $null; exited = $false
    }
    $runs.Add($record)
    $oldRoaming = $env:APPDATA
    $oldLocal = $env:LOCALAPPDATA
    try {
        $env:APPDATA = $roaming
        $env:LOCALAPPDATA = $local
        $child = Start-Process -FilePath $EnginePath -ArgumentList $quoted -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        $owned.Add($child)
        $record.pid = $child.Id
    } finally {
        $env:APPDATA = $oldRoaming
        $env:LOCALAPPDATA = $oldLocal
    }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    while (-not $child.HasExited -and $watch.Elapsed.TotalSeconds -lt 150) { Start-Sleep -Milliseconds 100 }
    if (-not $child.HasExited) { throw "Timed out: $Label" }
    $child.WaitForExit()
    $record.exited = $true
    $record.exit_code = $child.ExitCode
    return [pscustomobject]@{ code = $child.ExitCode; text = (Get-Content -LiteralPath $stdout, $stderr -Raw) -join "`n" }
}

foreach ($path in @($negative, $positive)) {
    Assert-WorkspacePath $path
    if (Test-Path -LiteralPath $path) { throw "Fresh fixture already exists: $path" }
}
if (-not (Test-Path -LiteralPath $EnginePath -PathType Leaf)) { throw 'Installed Godot is required; no download attempted.' }
New-Item -ItemType Directory -Path $negative, $positive | Out-Null
Write-Host "PROFILE GUARD: evidence $positive"
Write-Host "PROFILE GUARD: disposable rejected profiles $negative"
$sceneArgs = @('--headless', '--audio-driver', 'Dummy', '--path', $game, 'res://proto3d/tests/road_life_sim.tscn')
try {
    $import = Run-Engine 'import' (Join-Path $positive 'import-profile') @('--headless', '--path', $game, '--editor', '--import')
    Check 'isolated import exits successfully without engine errors' ($import.code -eq 0 -and $import.text -notmatch '(?im)SCRIPT ERROR:|Parse Error:|^ERROR:|leaked')
    foreach ($mode in @('exercise', 'restart-check')) {
        $profile = Join-Path $negative $mode
        $save = Join-Path $profile 'Roaming/Godot/app_userdata/DRIVN/drivn.save'
        Assert-WorkspacePath $save
        New-Item -ItemType Directory -Path (Split-Path -Parent $save) | Out-Null
        $sentinel = [Text.Encoding]::UTF8.GetBytes('{"profile_guard_sentinel":"' + $id + ':' + $mode + '"}' + "`r`n")
        [IO.File]::WriteAllBytes($save, $sentinel)
        $before = (Get-FileHash -LiteralPath $save -Algorithm SHA256).Hash
        $arguments = $sceneArgs
        if ($mode -eq 'restart-check') { $arguments += @('--', '--restart-check') }
        $result = Run-Engine "negative-$mode" $profile $arguments
        $after = (Get-FileHash -LiteralPath $save -Algorithm SHA256).Hash
        [ordered]@{ save = $save; before_sha256 = $before; after_sha256 = $after; original_base64 = [Convert]::ToBase64String($sentinel) } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $positive "negative-$mode-sentinel.json") -Encoding utf8NoBOM
        Check "$mode refuses unsafe profile with nonzero exit" ($result.code -ne 0 -and $result.text -match 'ROAD LIFE PROFILE: REFUSED')
        Check "$mode preserves exact sentinel bytes" ($before -eq $after -and [Convert]::ToBase64String([IO.File]::ReadAllBytes($save)) -ceq [Convert]::ToBase64String($sentinel))
        Check "$mode never starts game assertions and has no engine errors" ($result.text -notmatch '(?im)ROAD LIFE:|SCRIPT ERROR:|Parse Error:|^ERROR:|leaked')
    }
    $allowedProfile = Join-Path $positive 'allowed-profile'
    $allowed = Run-Engine 'positive-exercise' $allowedProfile $sceneArgs
    Check 'allowed fresh profile completes all 71 real-input assertions' ($allowed.code -eq 0 -and $allowed.text -match 'ROAD LIFE: 71 passed, 0 failed')
    Check 'allowed exercise has no engine errors' ($allowed.text -notmatch '(?im)SCRIPT ERROR:|Parse Error:|^ERROR:|leaked')
    $restart = Run-Engine 'positive-restart' $allowedProfile ($sceneArgs + @('--', '--restart-check'))
    Check 'allowed restart process completes all 5 assertions' ($restart.code -eq 0 -and $restart.text -match 'ROAD LIFE: 5 passed, 0 failed')
    Check 'allowed restart has no engine errors' ($restart.text -notmatch '(?im)SCRIPT ERROR:|Parse Error:|^ERROR:|leaked')
} catch {
    $failure = $_.Exception.Message
    Write-Host "PROFILE GUARD: FAILED - $failure"
} finally {
    $cleanupErrors = [Collections.Generic.List[string]]::new()
    foreach ($child in $owned) {
        try {
            if (-not $child.HasExited) { $child.Kill(); if (-not $child.WaitForExit(5000)) { throw 'Owned process did not exit.' } }
            foreach ($record in $runs) {
                if ($record.pid -eq $child.Id) { $record.exited = $child.HasExited; $record.exit_code = $child.ExitCode }
            }
        } catch { $cleanupErrors.Add("pid=$($child.Id): $($_.Exception.Message)") }
        finally { $child.Dispose() }
    }
    if ($cleanupErrors.Count -gt 0) { $failure += ' Cleanup failure: ' + ($cleanupErrors -join '; ') }
    [ordered]@{ checkout = $root; negative_root = $negative; positive_root = $positive; checks = @($checks); processes = @($runs); failure = $failure; cleanup_errors = @($cleanupErrors) } |
        ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $positive 'result.json') -Encoding utf8NoBOM
}
if ($failure) { throw "$failure; retained evidence: $positive" }
Write-Host "PROFILE GUARD: $($checks.Count) passed, 0 failed; all owned processes exited; evidence retained."
