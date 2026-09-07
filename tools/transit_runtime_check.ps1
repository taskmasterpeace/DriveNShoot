[CmdletBinding()]
param(
  [ValidateSet('import','headless','capture')][string]$Mode='headless',
  [ValidateSet('ticket','vehicle','data','grip_ik')][string]$Sim='ticket'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw 'PowerShell 7+ is required for isolated process environments'}
$root=Split-Path -Parent $PSScriptRoot
$build=[IO.Path]::GetFullPath((Join-Path $root 'build'))
$run=Join-Path $build ('transit-runtime-'+$Sim+'-'+$Mode+'-'+[guid]::NewGuid().ToString('N'))
if(-not $run.StartsWith($build+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Run escapes build'}
for($path=$run;$path;$path=Split-Path -Parent $path){
  if((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse ancestor refused'}
}
$profile=@{APPDATA=(Join-Path $run 'profile/Roaming');LOCALAPPDATA=(Join-Path $run 'profile/Local')}
New-Item -ItemType Directory -Path $profile.APPDATA,$profile.LOCALAPPDATA | Out-Null
$sources=@(
  'tools/transit_runtime_check.ps1',
  'game/project.godot',
  'game/data/transit.json',
  'game/proto3d/transit/catalog.gd',
  'game/proto3d/transit/ticket_state.gd',
  'game/proto3d/tests/transit_ticket_sim.gd',
  'game/proto3d/tests/transit_ticket_sim.tscn'
)
# Record the actual shared runtime closure as well as the selected test. This
# includes data-driven physics/material inputs, never future absent scenarios.
$sources += @(Get-ChildItem -LiteralPath (Join-Path $root 'game/proto3d') -Recurse -File | Where-Object { $_.Extension -in @('.gd','.tscn') -and $_.FullName -notmatch '[\\/]tests[\\/]' } | ForEach-Object { [IO.Path]::GetRelativePath($root,$_.FullName).Replace('\','/') })
$sources += @(Get-ChildItem -LiteralPath (Join-Path $root 'game/data') -Recurse -File | ForEach-Object { [IO.Path]::GetRelativePath($root,$_.FullName).Replace('\','/') })
$sources += @(Get-ChildItem -LiteralPath (Join-Path $root 'game/assets/models/vehicles') -File -Filter '*.glb' | ForEach-Object { [IO.Path]::GetRelativePath($root,$_.FullName).Replace('\','/') })
$scene=if($Sim -in @('ticket','vehicle')){"transit_${Sim}_sim"}else{"${Sim}_sim"}
$sources += @("game/proto3d/tests/$scene.gd","game/proto3d/tests/$scene.tscn",
  'game/assets/models/transit/lastline_coach.glb','game/assets/models/transit/kestrel_courier.glb')
$sources=@($sources | Sort-Object -Unique)
$hashes=@{}
foreach($source in $sources){
  $full=Join-Path $root $source
  $hashes[$source]=if(Test-Path -LiteralPath $full){(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash}else{'MISSING'}
}
$args=@('--headless','--path',(Join-Path $root 'game'),'--audio-driver','Dummy','--max-fps','60')
if($Mode -eq 'import'){$args+=@('--editor','--import')}
elseif($Mode -eq 'capture'){
  if($Sim -ne 'vehicle'){throw 'GPU capture is available only for the vehicle scenario'}
  $args=@('--path',(Join-Path $root 'game'),'--audio-driver','Dummy','--max-fps','60',
    '--rendering-method','gl_compatibility','--resolution','1440x900',
    "res://proto3d/tests/$scene.tscn",'--',('--capture-dir='+(Join-Path $run 'captures')))
}else{$args+=@("res://proto3d/tests/$scene.tscn")}
$record=@{mode=$Mode;sim=$Sim;arguments=$args;APPDATA=$profile.APPDATA;LOCALAPPDATA=$profile.LOCALAPPDATA;
  source_head=(& git -C $root rev-parse HEAD).Trim();source_hashes=$hashes;wall_budget_s=$(if($Sim -eq 'ticket'){120}else{180});
  pid=0;exit_code=$null;exited=$false;timed_out=$false;wall_elapsed_s=$null}
$out=Join-Path $run 'stdout.log';$err=Join-Path $run 'stderr.log'
$timer=[Diagnostics.Stopwatch]::StartNew();$process=$null
try{
  $quoted=foreach($argument in $args){'"'+$argument+'"'}
  $process=Start-Process -FilePath 'C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe' -ArgumentList $quoted -WorkingDirectory $root -WindowStyle Hidden -Environment $profile -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  $record.pid=$process.Id
  $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $run 'environment.json')
  while(-not $process.WaitForExit(1000)){
    if($timer.Elapsed.TotalSeconds -gt $record.wall_budget_s){$record.timed_out=$true;throw 'Owned engine timed out'}
  }
}finally{
  if($null -ne $process){
    if(-not $process.HasExited){$process.Kill($true);[void]$process.WaitForExit(5000)}
    $record.exited=$process.HasExited;$record.exit_code=$process.ExitCode;$process.Dispose()
  }
  $record.wall_elapsed_s=$timer.Elapsed.TotalSeconds
  $after=@{}
  foreach($source in $sources){
    $full=Join-Path $root $source
    $after[$source]=if(Test-Path -LiteralPath $full){(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash}else{'MISSING'}
  }
  $record.source_hashes_after=$after
  $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $run 'result.json')
  Write-Output "Evidence: $run"
  foreach($source in $sources){if($after[$source] -cne $hashes[$source]){throw "Source changed during run: $source"}}
}
Get-Content -LiteralPath $out
Get-Content -LiteralPath $err
exit $record.exit_code
