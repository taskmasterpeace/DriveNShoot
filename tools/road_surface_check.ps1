# Isolated real-scene road surface regression and optional actual GPU captures.
[CmdletBinding()]
param([switch]$Capture,[ValidateSet('road_surface_sim','roadside_clearance_sim','city_exit_sim','road_lane_sim','runtime_road_clearance_sim','elevation_sim','terrain_relief_sim')][string]$Scene='road_surface_sim')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7 required'}
if($Capture -and $Scene -notin @('road_surface_sim','roadside_clearance_sim')){throw 'Capture requires a road surface scene'}
$checkout=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$build=Join-Path $checkout 'build'
$run=Join-Path $build ('road-surface-'+[guid]::NewGuid().ToString('N'))
for($path=$run;$path;$path=Split-Path -Parent $path){
    if((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse ancestor refused'}
}
if(-not $run.StartsWith($build+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Owned path escapes build'}
$app=Join-Path $run 'profile/Roaming';$local=Join-Path $run 'profile/Local'
New-Item -ItemType Directory -Path $app,$local | Out-Null
$engine='C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe'
$arguments=@('--path',(Join-Path $checkout 'game'),'--audio-driver','Dummy','--max-fps','60')
if($Capture){$arguments+=@('--rendering-method','gl_compatibility','--resolution','1280x720')}else{$arguments+='--headless'}
$arguments+="res://proto3d/tests/$Scene.tscn"
if($Capture){$arguments+=@('--',('--output='+(Join-Path $run 'captures')))}
$record=@{scene=$Scene;engine=$engine;arguments=$arguments;APPDATA=$app;LOCALAPPDATA=$local;pid=0;exited=$false;exit_code=$null;timed_out=$false}
$record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $run 'environment.json')
$out=Join-Path $run 'stdout.log';$err=Join-Path $run 'stderr.log'
$oldA=$env:APPDATA;$oldL=$env:LOCALAPPDATA;$process=$null
try{
    $env:APPDATA=$app;$env:LOCALAPPDATA=$local
    if($env:APPDATA -cne $app -or $env:LOCALAPPDATA -cne $local){throw 'Explicit isolation missing'}
    $quoted=foreach($argument in $arguments){'"'+$argument+'"'}
    $process=Start-Process -FilePath $engine -ArgumentList $quoted -WorkingDirectory $checkout -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    $record.pid=$process.Id
    $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $run 'environment.json')
    $watch=[Diagnostics.Stopwatch]::StartNew()
    while(-not $process.WaitForExit(1000)){
        if($watch.Elapsed.TotalSeconds -gt 180){$record.timed_out=$true;throw 'Owned engine timed out'}
    }
}finally{
    $env:APPDATA=$oldA;$env:LOCALAPPDATA=$oldL
    if($null -ne $process){
        if(-not $process.HasExited){$process.Kill($true);if(-not $process.WaitForExit(5000)){throw 'Owned engine cleanup failed'}}
        $record.exited=$process.HasExited;$record.exit_code=$process.ExitCode
        $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $run 'result.json')
        $process.Dispose()
    }
    Write-Output "Evidence: $run"
}
Get-Content -LiteralPath $out,$err
exit $record.exit_code
