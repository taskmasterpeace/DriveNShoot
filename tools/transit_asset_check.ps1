[CmdletBinding()]
param([ValidateSet('import','headless','capture','scale-probe')][string]$Mode='headless')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$build=[IO.Path]::GetFullPath((Join-Path $root 'build'))
$run=Join-Path $build ('transit-asset-'+$Mode+'-'+[guid]::NewGuid().ToString('N'))
if(-not $run.StartsWith($build+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Run escapes build'}
for($path=$run;$path;$path=Split-Path -Parent $path){
  if((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Reparse ancestor refused'}
}
$profile=@{APPDATA=(Join-Path $run 'profile/Roaming');LOCALAPPDATA=(Join-Path $run 'profile/Local')}
New-Item -ItemType Directory -Path $profile.APPDATA,$profile.LOCALAPPDATA | Out-Null
$files=@('tools/blenderforge/gen_transit.py','game/proto3d/tests/transit_asset_sim.gd',
  'game/proto3d/tests/transit_asset_sim.tscn','game/assets/models/transit/lastline_coach.glb',
  'game/assets/models/transit/kestrel_courier.glb')
$hashes=@{}
foreach($file in $files){$hashes[$file]=(Get-FileHash -LiteralPath (Join-Path $root $file) -Algorithm SHA256).Hash}
$args=@('--headless','--path',(Join-Path $root 'game'),'--audio-driver','Dummy','--max-fps','60')
if($Mode -eq 'import'){$args+=@('--editor','--import')}
elseif($Mode -eq 'capture'){
  $args=@('--path',(Join-Path $root 'game'),'--audio-driver','Dummy','--max-fps','60',
    '--rendering-method','gl_compatibility','--resolution','1280x720',
    'res://proto3d/tests/transit_asset_sim.tscn','--',('--capture-dir='+(Join-Path $run 'captures')))
}else{
  $args+=@('res://proto3d/tests/transit_asset_sim.tscn')
  if($Mode -eq 'scale-probe'){$args+=@('--','--probe-scale')}
}
$record=@{mode=$Mode;arguments=$args;APPDATA=$profile.APPDATA;LOCALAPPDATA=$profile.LOCALAPPDATA;
  source_head=(& git -C $root rev-parse HEAD).Trim();source_hashes=$hashes;wall_budget_s=120;
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
  foreach($file in $files){$after[$file]=(Get-FileHash -LiteralPath (Join-Path $root $file) -Algorithm SHA256).Hash}
  $record.source_hashes_after=$after
  $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $run 'result.json')
  Write-Output "Evidence: $run"
  foreach($file in $files){if($after[$file] -cne $hashes[$file]){throw "Source changed during run: $file"}}
}
Get-Content -LiteralPath $out
Get-Content -LiteralPath $err
exit $record.exit_code
