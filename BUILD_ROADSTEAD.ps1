#requires -Version 7.0
<#
.SYNOPSIS
Build a fresh, unsigned, local-evaluation Windows portable candidate.
.EXAMPLE
pwsh -NoProfile -File ./BUILD_ROADSTEAD.ps1 -PreflightOnly
.EXAMPLE
pwsh -NoProfile -File ./BUILD_ROADSTEAD.ps1 -CaptureSmoke
.NOTES
No downloads, signing, uploads, existing-build deletion, or global process kills.
Requires already-installed Godot 4.5.1 and Windows x64 export templates.
#>
[CmdletBinding()]
param(
    [string]$EnginePath = '',
    [switch]$CaptureSmoke,
    [switch]$PreflightOnly,
    [ValidateRange(30, 1800)][int]$ProcessTimeoutSeconds = 900
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$game = Join-Path $root 'game'
$requiredVersion = '4.5.1'
$templateVersion = '4.5.1.stable'
$originalAppData = $env:APPDATA
$originalLocalAppData = $env:LOCALAPPDATA
$templateRoot = Join-Path $originalAppData "Godot/export_templates/$templateVersion"
$releaseTemplate = Join-Path $templateRoot 'windows_release_x86_64.exe'

function Find-Engine {
    if ($EnginePath) {
        if (-not (Test-Path -LiteralPath $EnginePath -PathType Leaf)) {
            throw 'The explicitly requested EnginePath does not exist. No download attempted.'
        }
        return (Resolve-Path -LiteralPath $EnginePath).Path
    }
    $installed = Join-Path $HOME 'Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe'
    if (Test-Path -LiteralPath $installed -PathType Leaf) { return $installed }
    foreach ($name in @('Godot_v4.5.1-stable_win64_console.exe', 'godot.exe', 'godot4.exe')) {
        $command = Get-Command -Name $name -CommandType Application -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }
    throw 'Installed Godot not found. Supply -EnginePath; this script never downloads tools.'
}

function Read-Git([string[]]$Arguments) {
    $result = & git -C $root @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git metadata command failed: $($Arguments[0])" }
    return $result
}

function Invoke-CheckedProcess([string]$Executable, [string[]]$Arguments, [string]$Label) {
    $stdout = Join-Path $logs "$Label.stdout.log"
    $stderr = Join-Path $logs "$Label.stderr.log"
    # Start-Process joins arguments into a Windows command line. All arguments
    # here are paths/flags without embedded quotes or trailing backslashes.
    $quoted = foreach ($argument in $Arguments) {
        if ($argument.Contains('"') -or $argument.EndsWith('\')) {
            throw "Unsupported quoted/trailing-backslash process argument in $Label."
        }
        '"' + $argument + '"'
    }
    $process = Start-Process -FilePath $Executable -ArgumentList $quoted -WorkingDirectory $root `
        -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    if (-not $process.WaitForExit($ProcessTimeoutSeconds * 1000)) {
        # The console wrapper can own a child engine. Terminate only this
        # invocation's process tree, then reap it; never sweep global Godot PIDs.
        try {
            $process.Kill($true)
            $process.WaitForExit()
        } catch [System.InvalidOperationException] {
            # It exited between the timeout check and Kill.
        }
        throw "$Label exceeded its timeout. Logs retained at $logs"
    }
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "$Label exited $($process.ExitCode). Logs retained at $logs"
    }
    foreach ($path in @($stdout, $stderr)) {
        if (Select-String -LiteralPath $path -Pattern 'SCRIPT ERROR|Parse Error|^ERROR:' -Quiet) {
            throw "$Label reported engine/script errors despite exit 0. See $path"
        }
    }
}

$engine = Find-Engine
if (-not (Test-Path -LiteralPath $releaseTemplate -PathType Leaf)) {
    throw 'Godot 4.5.1 Windows x64 release template is not installed. No download attempted.'
}
$installedTemplateVersion = (Get-Content -LiteralPath (Join-Path $templateRoot 'version.txt') -Raw).Trim()
if ($installedTemplateVersion -ne $templateVersion) { throw 'Installed template version does not match 4.5.1.stable.' }
$projectText = Get-Content -LiteralPath (Join-Path $game 'project.godot') -Raw
if ($projectText -notmatch '(?m)^config/version="([A-Za-z0-9._-]+)"\s*$') { throw 'Cannot read a safe game version.' }
$gameVersion = $Matches[1]
$sourceCommit = [string](Read-Git @('rev-parse', 'HEAD'))
$sourceStatus = @(Read-Git @('status', '--porcelain=v1', '--untracked-files=normal'))
$sourceDirty = $sourceStatus.Count -gt 0
$plan = [ordered]@{
    classification = 'local-evaluation-only'
    game_version = $gameVersion
    source_commit = $sourceCommit
    source_dirty = $sourceDirty
    source_status_entries = $sourceStatus.Count
    engine = $engine
    template = $releaseTemplate
    template_version = $installedTemplateVersion
    preset = 'Windows Release'
    capture_smoke = [bool]$CaptureSmoke
    downloads = $false
    signing = $false
    public_upload = $false
}
if ($PreflightOnly) {
    $plan | ConvertTo-Json
    return
}

# Unique fresh directory; an existing run is never reused, deleted, or replaced.
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 6)
$candidateName = "DRIVN-$gameVersion-$($sourceCommit.Substring(0, 8))-$stamp-$suffix-win64-local-rc"
$run = Join-Path (Join-Path $root 'build') $candidateName
if (Test-Path -LiteralPath $run) { throw 'Candidate path already exists; refusing to overwrite it.' }
$payload = Join-Path $run $candidateName
$logs = Join-Path $run 'logs'
$profile = Join-Path $run 'isolated-profile'
$evidence = Join-Path $payload 'evidence'
$notices = Join-Path $payload 'notices'
foreach ($directory in @($payload, $logs, $profile, $evidence, $notices)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
Write-Host "Local evaluation candidate: $run"

try {
    # Import/export use the real APPDATA so installed templates and optional
    # editor export tools remain discoverable. Only gameplay smoke is isolated.
    Invoke-CheckedProcess $engine @('--version') 'engine-version'
    $actualVersion = (Get-Content -LiteralPath (Join-Path $logs 'engine-version.stdout.log') -Raw).Trim()
    if (-not $actualVersion.StartsWith("$requiredVersion.stable")) { throw "Expected Godot $requiredVersion.stable, got $actualVersion" }
    # Recovery mode prevents editor addons from performing update HTTP calls.
    # The project has no .dialogue/custom importer assets or GDExtensions; native
    # GLB/font/texture import remains available and packed acceptance checks it.
    # export_presets.cfg explicitly omits Dialogue Manager's editor widgets and
    # editor-only entrypoints: recovery also disables its normal export filter.
    Invoke-CheckedProcess $engine @('--headless', '--recovery-mode', '--path', $game, '--import') 'import'
    $executable = Join-Path $payload 'DRIVN.exe'
    Invoke-CheckedProcess $engine @('--headless', '--recovery-mode', '--path', $game, '--export-release', 'Windows Release', $executable) 'export'
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf) -or
        (Get-Item -LiteralPath $executable).Length -le (Get-Item -LiteralPath $releaseTemplate).Length) {
        throw 'Export did not produce an executable larger than the template; embedded game data was not established.'
    }

    # Run the exported executable, NOT Godot --path game. No source directory
    # is supplied: resources must come from its embedded PCK.
    $env:APPDATA = Join-Path $profile 'Roaming'
    $env:LOCALAPPDATA = Join-Path $profile 'Local'
    New-Item -ItemType Directory -Path $env:APPDATA -Force | Out-Null
    New-Item -ItemType Directory -Path $env:LOCALAPPDATA -Force | Out-Null
    $smokeArguments = @('--headless', '--audio-driver', 'Dummy', 'res://proto3d/tests/packaged_release_check.tscn', '--', "--output=$evidence")
    if ($CaptureSmoke) {
        $smokeArguments = @('--windowed', '--resolution', '1280x720', '--audio-driver', 'Dummy', 'res://proto3d/tests/packaged_release_check.tscn', '--', "--output=$evidence", '--capture')
    }
    Invoke-CheckedProcess $executable $smokeArguments 'packaged-smoke'
    $acceptancePath = Join-Path $evidence 'acceptance.json'
    if (-not (Test-Path -LiteralPath $acceptancePath -PathType Leaf)) { throw 'Packaged smoke produced no acceptance report.' }
    $acceptance = Get-Content -LiteralPath $acceptancePath -Raw | ConvertFrom-Json
    if ($acceptance.failed -ne 0 -or $acceptance.passed -lt 50) { throw 'Packaged acceptance did not pass its required checks.' }
    if (-not (Select-String -LiteralPath (Join-Path $logs 'packaged-smoke.stdout.log') -SimpleMatch 'PACKAGED_RELEASE: ALL CHECKS PASSED' -Quiet)) {
        throw 'No successful packaged acceptance terminal marker was captured.'
    }

    # Only named provenance records, never a recursive copy of the source tree.
    $sourceNotices = @('LICENSE', 'THIRD_PARTY_NOTICES.md',
        'assets/fonts/game_deck/OFL.txt', 'assets/input_icons/ATTRIBUTION.md',
        'assets/skins/ATTRIBUTION.md', 'addons/dialogue_manager/LICENSE',
        'addons/tile_bit_tools/LICENSE', 'addons/exit_portal_free/LICENSE',
        'addons/exit_portal_free/ATTRIBUTION.md')
    $sourceNotices += @(Get-ChildItem -LiteralPath (Join-Path $game 'third_party/licenses') -File -Filter '*.txt' |
        ForEach-Object { "third_party/licenses/$($_.Name)" })
    foreach ($relative in $sourceNotices) {
        $destination = Join-Path $notices $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $game $relative) -Destination $destination
    }
    foreach ($name in @('Godot-engine-LICENSE.txt', 'Godot-third-party-copyright.json', 'Godot-third-party-licenses.json')) {
        Copy-Item -LiteralPath (Join-Path $evidence $name) -Destination (Join-Path $notices $name)
    }
    Copy-Item -LiteralPath (Join-Path $root 'tools/packaging/README-LOCAL-EVALUATION.txt') -Destination (Join-Path $payload 'README.txt')
    Copy-Item -LiteralPath (Join-Path $root 'tools/packaging/PLAY_DRIVN.bat') -Destination (Join-Path $payload 'PLAY_DRIVN.bat')
    Copy-Item -LiteralPath (Join-Path $logs 'packaged-smoke.stdout.log') -Destination (Join-Path $evidence 'packaged-smoke.stdout.log')
    Copy-Item -LiteralPath (Join-Path $logs 'packaged-smoke.stderr.log') -Destination (Join-Path $evidence 'packaged-smoke.stderr.log')

    $finalCommit = [string](Read-Git @('rev-parse', 'HEAD'))
    $finalStatus = @(Read-Git @('status', '--porcelain=v1', '--untracked-files=normal'))
    if ($finalCommit -ne $sourceCommit) { throw 'Source commit changed during the build; refusing to label this candidate with the old revision.' }
    $sourceDirty = $sourceDirty -or $finalStatus.Count -gt 0
    $manifest = [ordered]@{
        schema = 1
        classification = 'local-evaluation-only'
        candidate = $candidateName
        created_utc = [DateTime]::UtcNow.ToString('o')
        game_version = $gameVersion
        source_commit = $sourceCommit
        source_dirty = $sourceDirty
        source_status_entries_before = $sourceStatus.Count
        source_status_entries_after = $finalStatus.Count
        source_snapshot_claim = 'Commit plus truthful dirty label; uncommitted edits are not a reproducible commit snapshot.'
        engine_version = $actualVersion
        engine_sha256 = (Get-FileHash -LiteralPath $engine -Algorithm SHA256).Hash
        template_sha256 = (Get-FileHash -LiteralPath $releaseTemplate -Algorithm SHA256).Hash
        executable_sha256 = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash
        embedded_pck = $true
        main_scene = 'res://proto3d/proto3d.tscn'
        preset = 'Windows Release'
        signing = $false
        downloads = $false
        public_upload = $false
        isolated_smoke_profile = $true
        evaluation_launcher = 'PLAY_DRIVN.bat'
        evaluation_profile = '%LOCALAPPDATA%/DRIVN-Roadstead-Evaluation; extracted-folder fallback'
        acceptance = @{ passed = $acceptance.passed; failed = $acceptance.failed; capture_requested = [bool]$CaptureSmoke }
        limitations = @('No full-game or all-cartridge playthrough certification.',
            'No clean-machine or broad hardware compatibility certification.',
            'Asset redistribution rights remain unverified; local evaluation only.',
            'Unsigned executable; publisher identity and store approval not established.')
    }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $payload 'manifest.json') -Encoding utf8
    $hashLines = @(Get-ChildItem -LiteralPath $payload -Recurse -File | Sort-Object FullName | ForEach-Object {
        $relative = [IO.Path]::GetRelativePath($payload, $_.FullName).Replace('\', '/')
        "$( (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() )  $relative"
    })
    $hashLines | Set-Content -LiteralPath (Join-Path $payload 'SHA256SUMS.txt') -Encoding ascii
    $archive = Join-Path $run "$candidateName.zip"
    Compress-Archive -LiteralPath $payload -DestinationPath $archive -CompressionLevel Optimal
    "$( (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() )  $([IO.Path]::GetFileName($archive))" |
        Set-Content -LiteralPath "$archive.sha256" -Encoding ascii
    Write-Host "PACKAGED LOCAL RC: $archive"
    Write-Host "Acceptance: $($acceptance.passed) passed, $($acceptance.failed) failed. Source dirty: $sourceDirty"
    Write-Host 'Local evaluation only. No public redistribution clearance or full-game certification claimed.'
} finally {
    $env:APPDATA = $originalAppData
    $env:LOCALAPPDATA = $originalLocalAppData
}
